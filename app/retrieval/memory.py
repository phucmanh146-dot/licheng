"""Five-layer memory for retrieval history, fragments, profile and interventions.

L1 raw inputs | L2 current session | L3 fragment inbox | L4 profile | L5 long-term themes.
All writes are JSON-persisted and idempotent by fragment key, so repeated queries
upgrade an existing fragment instead of creating newer duplicates.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path


SOURCE_SEQUENCE = ["论文", "文档", "视频", "问人"]
HALF_LIFE_DAYS = 14


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value)
    except (ValueError, TypeError):
        return datetime.now(timezone.utc)


def _days_between(later: datetime, earlier: datetime) -> float:
    return max(0.0, (later - earlier).total_seconds() / 86400)


def extract_theme(query: str) -> str:
    tokens = re.findall(r"[A-Za-z][A-Za-z0-9_+.#-]*|[\u4e00-\u9fff]{2,}", query or "", flags=re.IGNORECASE)
    stop = {"还是", "一直", "这个", "那个", "东西", "怎么", "如何", "为什么", "请问", "帮我"}
    candidates = [token.lower() for token in tokens if token.lower() not in stop]
    if not candidates:
        return "未命名主题"
    return max(candidates, key=len)[:40]


class RetrievalMemoryStore:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.data = self._load()

    def _load(self) -> dict:
        if not self.path.exists():
            return self._blank()
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            return self._blank()
        for key, default in self._blank().items():
            data.setdefault(key, default)
        return data

    @staticmethod
    def _blank() -> dict:
        return {
            "version": 1,
            "L1_raw": [],
            "L2_session": {},
            "L3_fragments": [],
            "L4_profile": {"level": 0.3, "signals": []},
            "L5_themes": {},
        }

    def _save(self) -> None:
        fd, temp_name = tempfile.mkstemp(dir=str(self.path.parent), prefix="memory-", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                json.dump(self.data, stream, ensure_ascii=False, indent=2)
            os.replace(temp_name, self.path)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)

    def decay(self, now: datetime | None = None) -> dict:
        current = now or datetime.now(timezone.utc)
        removed = 0
        kept = []
        for fragment in self.data["L3_fragments"]:
            elapsed = _days_between(current, _parse(fragment["lastSeenAt"]))
            weight = float(fragment.get("weight", 1.0)) * (0.5 ** (elapsed / HALF_LIFE_DAYS))
            if weight < 0.1:
                removed += 1
                continue
            fragment["weight"] = round(weight, 4)
            kept.append(fragment)
        self.data["L3_fragments"] = kept
        return {"removed": removed, "remaining": len(kept)}

    def update_profile(self, signal: str, delta: float | None = None) -> float:
        level = float(self.data["L4_profile"].get("level", 0.3))
        default_delta = {
            "understood": 0.08,
            "confused": -0.05,
            "simplify": -0.08,
            "repeat": -0.05,
        }.get(signal, 0.0)
        level = min(1.0, max(0.0, level + (delta if delta is not None else default_delta)))
        self.data["L4_profile"]["level"] = round(level, 3)
        self.data["L4_profile"].setdefault("signals", []).append(
            {"signal": signal, "delta": round(level, 3), "at": _now()}
        )
        self._save()
        return level

    def record_retrieval(self, query, intent, results, profile, stage) -> dict:
        current = datetime.now(timezone.utc)
        theme = extract_theme(query)
        fragment_index = {
            item["key"]: item for item in self.data["L3_fragments"]
        }
        existing_by_theme = [
            item for item in self.data["L3_fragments"] if item["theme"] == theme
        ]
        added, deduped, conflicts = 0, 0, 0
        for result in results:
            doc_id = result.get("docId")
            if not doc_id:
                continue
            key = hashlib.sha256(f"{theme}|{doc_id}".encode("utf-8")).hexdigest()[:20]
            existing = fragment_index.get(key)
            source = result.get("sourceType", "文档")
            if existing:
                existing["lastSeenAt"] = _now()
                existing["hits"] = int(existing.get("hits", 1)) + 1
                deduped += 1
                continue
            conflict = any(
                item["docId"] != doc_id and item.get("sourceType") != source
                for item in existing_by_theme
            )
            fragment = {
                "key": key,
                "theme": theme,
                "docId": doc_id,
                "title": result.get("title", ""),
                "sourceType": source,
                "evidencePointer": result.get("evidencePointer", ""),
                "weight": 1.0,
                "hits": 1,
                "createdAt": _now(),
                "lastSeenAt": _now(),
                "status": "conflict" if conflict else "active",
            }
            self.data["L3_fragments"].append(fragment)
            fragment_index[key] = fragment
            existing_by_theme.append(fragment)
            added += 1
            conflicts += 1 if conflict else 0

        self.data["L1_raw"].append(
            {
                "at": _now(),
                "stage": stage,
                "intent": intent,
                "query": query,
                "theme": theme,
                "resultIds": [item.get("docId") for item in results],
            }
        )
        if len(self.data["L1_raw"]) > 500:
            self.data["L1_raw"] = self.data["L1_raw"][-500:]
        self.data["L2_session"] = {
            "lastQuery": query,
            "lastIntent": intent,
            "lastTheme": theme,
            "updatedAt": _now(),
        }
        if isinstance(profile.get("level"), (int, float)):
            self.data["L4_profile"]["level"] = round(float(profile["level"]), 3)

        theme_record = self.data["L5_themes"].setdefault(
            theme, {"count": 0, "lastAt": _now(), "lastSource": "", "alerts": []}
        )
        if stage == "retrieved":
            theme_record["count"] += 1
            theme_record["lastAt"] = _now()
            if results:
                theme_record["lastSource"] = results[0].get("sourceType", "文档")
        alerts = []
        next_source = ""
        if theme_record["count"] >= 3:
            last = theme_record.get("lastSource") or "文档"
            try:
                next_source = SOURCE_SEQUENCE[(SOURCE_SEQUENCE.index(last) + 1) % len(SOURCE_SEQUENCE)]
            except ValueError:
                next_source = SOURCE_SEQUENCE[0]
            alert = (
                f"「{theme}」你已查 {theme_record['count']} 次，"
                f"第 3 次必须换类型：论文→文档→视频→问人（建议下一步：{next_source}）"
            )
            if alert not in theme_record["alerts"]:
                theme_record["alerts"].append(alert)
            alerts.extend(theme_record["alerts"][-2:])

        decayed = self.decay(current)
        self._save()
        return {
            "enabled": True,
            "theme": theme,
            "themeCount": theme_record["count"],
            "fragmentsAdded": added,
            "fragmentsDeduped": deduped,
            "conflicts": conflicts,
            "alerts": alerts,
            "nextSource": next_source,
            "profileLevel": self.data["L4_profile"]["level"],
            "decay": decayed,
            "layers": {
                "L1": len(self.data["L1_raw"]),
                "L3": len(self.data["L3_fragments"]),
                "L5": len(self.data["L5_themes"]),
            },
        }
