from __future__ import annotations

import hashlib
import base64
import json
import mimetypes
import os
import secrets
import shutil
import sqlite3
import uuid
import urllib.error
import urllib.request
import time
from difflib import SequenceMatcher
from cgi import FieldStorage
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
DATA = ROOT / "data"


def load_dotenv(path: Path, override_keys: set[str] | None = None) -> None:
    """Load simple KEY=VALUE pairs without requiring python-dotenv."""
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip().lstrip("\ufeff")
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if value[:1] in {"'", '"'} and value[-1:] == value[:1]:
            value = value[1:-1]
        elif " #" in value:
            value = value.split(" #", 1)[0].rstrip()
        if not key:
            continue
        if key in (override_keys or set()):
            # Provider settings are intentionally refreshed from the project .env.
            os.environ[key] = value
        elif key not in os.environ:
            os.environ[key] = value


load_dotenv(ROOT / ".env")
DB_PATH = Path(os.getenv("LICHENG_DB", str(DATA / "app.db")))
UPLOADS = DATA / "uploads"
MAX_UPLOAD_BYTES = 50 * 1024 * 1024
SESSION_DAYS = 7
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
ALLOWED_MATERIAL_TYPES = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt",
    "text/markdown": "md",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}


def refresh_deepseek_config() -> tuple[str, str, str]:
    """Reload provider settings so editing .env takes effect without stale workers."""
    global DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL
    load_dotenv(ROOT / ".env", {"DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL", "DEEPSEEK_MODEL"})
    DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if os.getenv("LICHENG_DISABLE_DEEPSEEK", "").strip().lower() in {"1", "true", "yes"}:
        DEEPSEEK_API_KEY = ""
    DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").strip().rstrip("/")
    DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat").strip() or "deepseek-chat"
    return DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def expires_after(days: int = SESSION_DAYS) -> str:
    from datetime import timedelta

    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


def safe_filename(name: str) -> str:
    name = Path(name or "material").name
    cleaned = "".join(ch for ch in name if ch.isalnum() or ch in " ._-()[]")
    return cleaned.strip()[:120] or "material"


def file_sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def extract_text(path: Path, mime_type: str) -> tuple[str, str, str | None]:
    """Return extracted text, status and a human-readable failure reason."""
    if mime_type.startswith("text/"):
        try:
            return path.read_text(encoding="utf-8", errors="replace"), "已读取", None
        except OSError as exc:
            return "", "读取失败", str(exc)
    if mime_type == "application/pdf":
        try:
            from pypdf import PdfReader  # type: ignore

            pages = [page.extract_text() or "" for page in PdfReader(str(path)).pages]
            return "\n\n".join(pages), "已读取", None
        except ImportError:
            return "", "待解析", "未安装 pypdf，可先人工标注 PDF 位置"
        except Exception as exc:  # parser errors should not reject the upload
            return "", "读取失败", str(exc)
    if mime_type in {
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }:
        try:
            from docx import Document  # type: ignore

            paragraphs = [paragraph.text for paragraph in Document(str(path)).paragraphs]
            return "\n".join(paragraphs), "已读取", None
        except ImportError:
            return "", "待解析", "未安装 python-docx，可先人工标注文档位置"
        except Exception as exc:
            return "", "读取失败", str(exc)
    if mime_type.startswith("image/"):
        return "", "待人工标注", None
    return "", "待读取", None


def deepseek_chat(messages: list[dict[str, str]]) -> tuple[str | None, str | None]:
    """Call DeepSeek when configured; return (reply, error) without leaking the key."""
    api_key, base_url, model = refresh_deepseek_config()
    if not api_key:
        return None, "未配置 DEEPSEEK_API_KEY"
    body = json.dumps(
        {
            "model": model,
            "messages": messages,
            "temperature": 0.35,
            "max_tokens": 900,
            "stream": False,
        },
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            payload = json.loads(response.read().decode("utf-8"))
        content = payload.get("choices", [{}])[0].get("message", {}).get("content", "")
        if not isinstance(content, str) or not content.strip():
            return None, "模型没有返回有效内容"
        return content.strip(), None
    except urllib.error.HTTPError as exc:
        if exc.code in {401, 403}:
            return None, "DeepSeek 认证失败，请检查 API Key"
        if exc.code == 429:
            return None, "DeepSeek 请求频率受限，请稍后再试"
        return None, f"DeepSeek 请求失败（HTTP {exc.code}）"
    except (urllib.error.URLError, TimeoutError):
        return None, "无法连接 DeepSeek，请检查网络或 API 地址"
    except (ValueError, KeyError, IndexError, OSError):
        return None, "DeepSeek 返回内容无法解析"


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def base_project(
    project_id: str,
    name: str,
    kind: str,
    avatar: str,
    title: str,
    note: str,
    loop_label: str,
    reviewer: str,
    executor: str,
    score: int,
    quote: str,
    quote_meta: str,
    unknown: str,
    gap: str,
    gap_note: str,
    action: str,
    action_note: str,
    materials: list,
    actions: list,
    status: str = "待提交 V2",
) -> dict:
    return {
        "id": project_id,
        "name": name,
        "kind": kind,
        "avatar": avatar,
        "score": score,
        "title": title,
        "note": note,
        "loopLabel": loop_label,
        "reviewer": reviewer,
        "executor": executor,
        "quote": quote,
        "quoteMeta": quote_meta,
        "unknown": unknown,
        "gap": gap,
        "gapNote": gap_note,
        "action": action,
        "actionNote": action_note,
        "materials": materials,
        "actions": actions,
        "rubricConfirmed": False,
        "gapConfirmed": False,
        "actionStarted": False,
        "review": {
            "status": status,
            "completed": 3,
            "total": 4,
            "criteria": ["pass", "pass", "pending", "pass"],
            "v2Submitted": False,
        },
        "transfer": {"status": "尚未开始", "progress": 0},
        "updatedAt": now(),
    }


def seed_projects() -> list[dict]:
    return [
        base_project(
            "xiang",
            "湘秀未来",
            "科研创新 · 进行中",
            "湘",
            "让访谈证据真正支撑一项产品决策",
            "这一轮只解决一个问题：需求卡能否从原话走到具体样品，而不是堆一页漂亮总结。",
            "访谈证据 → 产品决策",
            "陈老师",
            "林同学",
            62,
            "“如果能提前知道每次活动需要准备多少物料，就不用临时再跑一趟。”",
            "第 14 页 · B-07",
            "机构是否允许共享历史订单，尚未有可引用的确认。",
            "需求和产品决策之间少了一句理由",
            "你已经有原话，也指向了“活动准备模块”。现在还缺：为什么这条原话足以支持这个模块，而不是另一个功能。",
            "补上一句理由",
            "在已有需求卡下补齐“因为访谈中的 ___，所以样品中的 ___ 需要 ___”。",
            [
                [
                    "访谈记录·03",
                    "PDF · 18 页 · 已读取",
                    "已定位",
                    "verified",
                    "P14 · 访谈对象 B 的原话已定位。",
                ],
                [
                    "产品样品草图（现在的版本）",
                    "PNG · 1 张 · 已读取",
                    "待绑定",
                    "pending",
                    "P03 · 当前样品结构，尚未绑定需求证据。",
                ],
                [
                    "机构沟通备忘",
                    "链接 · 1 条 · 待读取",
                    "受阻",
                    "blocked",
                    "来源链接尚未完成权限确认。",
                ],
            ],
            [
                {
                    "title": "补上一句理由",
                    "owner": "林同学",
                    "status": "待开始",
                    "tone": "warm",
                    "due": "今天 · 15 分钟",
                },
                {
                    "title": "向机构确认历史订单授权",
                    "owner": "周同学",
                    "status": "等待外部协助",
                    "tone": "red",
                    "due": "明天 · 20 分钟",
                },
            ],
        ),
        base_project(
            "lowcarbon",
            "校园低碳地图",
            "竞赛项目 · 进行中",
            "碳",
            "把调研结果变成可验证的校园路线",
            "当前循环聚焦“用户场景是否真的影响路线设计”，先补一条可复核的场景证据。",
            "用户场景 → 路线样机",
            "周老师",
            "赵同学",
            78,
            "“我不是不想骑车，是不知道哪段路晚上还有灯。”",
            "访谈记录·07 · P09",
            "夜间照明数据还没有获得校方确认。",
            "场景证据还没有落到路线节点",
            "你已经标出夜间骑行的痛点，还需要说明它具体改变了哪一个路线节点。",
            "标出一条夜间路线",
            "在现在的地图版本上标注起点、照明缺口和改动后的路线节点。",
            [
                [
                    "夜间骑行访谈·07",
                    "PDF · 12 页 · 已读取",
                    "已定位",
                    "verified",
                    "P09 · 用户原话已定位。",
                ],
                [
                    "校园地图（现在的版本）",
                    "SVG · 1 张 · 已读取",
                    "待绑定",
                    "pending",
                    "路线节点尚未绑定场景。",
                ],
                ["照明数据申请", "文档 · 2 页 · 已读取", "待确认", "blocked", "校方授权仍在等待。"],
            ],
            [
                {
                    "title": "标出一条夜间路线",
                    "owner": "赵同学",
                    "status": "进行中",
                    "tone": "teal",
                    "due": "今天 · 25 分钟",
                },
                {
                    "title": "补齐照明数据来源",
                    "owner": "周同学",
                    "status": "待确认",
                    "tone": "red",
                    "due": "周五 · 30 分钟",
                },
            ],
            "V1 已诊断",
        ),
        base_project(
            "blank",
            "未命名项目",
            "草稿 · 待开始",
            "新",
            "先把你想做的事说清楚",
            "还没有一轮改进。砺程教练会从目标、已有材料和限制开始陪你澄清。",
            "目标澄清",
            "尚未邀请",
            "李同学",
            0,
            "还没有可引用的材料。",
            "等待上传",
            "目标、材料和复核者都还没有确认。",
            "还没有诊断差距",
            "先添加一份材料，或者用自己的话描述你想完成的成果。",
            "创建第一张目标卡",
            "写下你想交付的成果，以及你现在手里已有的材料。",
            [
                [
                    "还没有材料",
                    "先上传文档、PDF、图片或链接",
                    "待添加",
                    "pending",
                    "添加材料后教练才能给出有依据的缺口。",
                ]
            ],
            [
                {
                    "title": "创建第一张目标卡",
                    "owner": "李同学",
                    "status": "待开始",
                    "tone": "warm",
                    "due": "预计 10 分钟",
                }
            ],
            "尚未邀请复核者",
        ),
    ]


def default_rubric(project_id: str, created_by: str) -> dict:
    return {
        "id": f"rubric-{project_id}-1",
        "project_id": project_id,
        "version": 1,
        "title": "一条需求，要能走完这条证据链",
        "scope": "原话 → 需求解释 → 明确决策 → 样品位置",
        "items": [
            {
                "id": "source",
                "label": "能回查原访谈原句和位置",
                "requirement": "原文摘录与页码已记录",
            },
            {
                "id": "decision",
                "label": "与一项具体产品决策对应",
                "requirement": "需求卡需写明对应样品或功能",
            },
            {
                "id": "reason",
                "label": "解释为什么这个决策更合适",
                "requirement": "补充原话、判断和决策之间的理由",
            },
            {
                "id": "unknown",
                "label": "没有把未知写成已成立",
                "requirement": "交易、授权、订单状态需如实标注",
            },
        ],
        "created_by": created_by,
    }


def init_db() -> None:
    with connect() as conn:
        conn.executescript(
            """
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), payload TEXT NOT NULL,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_events (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, project_id TEXT, event_type TEXT NOT NULL,
          payload TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS project_members (
          project_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
          created_at TEXT NOT NULL, PRIMARY KEY (project_id, user_id),
          FOREIGN KEY (project_id) REFERENCES projects(id), FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS invitations (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL, inviter_id TEXT NOT NULL,
          email TEXT NOT NULL, role TEXT NOT NULL, token TEXT UNIQUE NOT NULL,
          status TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS materials (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL, created_by TEXT NOT NULL,
          source_type TEXT NOT NULL, original_name TEXT NOT NULL, mime_type TEXT NOT NULL,
          size INTEGER NOT NULL, sha256 TEXT, storage_path TEXT, content_text TEXT,
          status TEXT NOT NULL, error_message TEXT, created_at TEXT NOT NULL, archived_at TEXT
        );
        CREATE TABLE IF NOT EXISTS evidence_citations (
          id TEXT PRIMARY KEY, material_id TEXT NOT NULL, project_id TEXT NOT NULL,
          created_by TEXT NOT NULL, excerpt TEXT NOT NULL, location TEXT NOT NULL,
          note TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS rubrics (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL, version INTEGER NOT NULL,
          title TEXT NOT NULL, scope TEXT NOT NULL, items_json TEXT NOT NULL,
          status TEXT NOT NULL, created_by TEXT NOT NULL, confirmed_by TEXT,
          confirmed_at TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS material_versions (
          id TEXT PRIMARY KEY, material_id TEXT NOT NULL, project_id TEXT NOT NULL,
          version INTEGER NOT NULL, content_text TEXT, created_by TEXT NOT NULL,
          created_at TEXT NOT NULL, previous_id TEXT
        );
        CREATE TABLE IF NOT EXISTS reviews (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL, version_id TEXT NOT NULL,
          reviewer_id TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL,
          completed_at TEXT
        );
        CREATE TABLE IF NOT EXISTS review_items (
          id TEXT PRIMARY KEY, review_id TEXT NOT NULL, rubric_item_id TEXT NOT NULL,
          result TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS transfer_checks (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL, phase TEXT NOT NULL,
          explanation TEXT, material_id TEXT, prompt_summary TEXT, result TEXT NOT NULL,
          created_by TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS help_requests (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL, created_by TEXT NOT NULL,
          message TEXT NOT NULL, category TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS agent_advice (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL, user_id TEXT NOT NULL,
          workspace TEXT NOT NULL, advice_json TEXT NOT NULL, provider TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS agent_messages (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL, user_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
          content TEXT NOT NULL, provider TEXT NOT NULL, created_at TEXT NOT NULL
        );
        """
        )
        user = conn.execute(
            "SELECT id FROM users WHERE email=?", ("li.student@example.com",)
        ).fetchone()
        if not user:
            uid = "user-student"
            conn.execute(
                "INSERT INTO users VALUES (?, ?, ?, ?, ?)",
                (uid, "李同学", "li.student@example.com", digest("quality123"), now()),
            )
        else:
            uid = user["id"]
        reviewer_user = conn.execute(
            "SELECT id FROM users WHERE email=?", ("chen.teacher@example.com",)
        ).fetchone()
        if not reviewer_user:
            reviewer_id = "user-reviewer"
            conn.execute(
                "INSERT INTO users VALUES (?, ?, ?, ?, ?)",
                (
                    reviewer_id,
                    "陈老师",
                    "chen.teacher@example.com",
                    digest("review123"),
                    now(),
                ),
            )
        else:
            reviewer_id = reviewer_user["id"]
        count = conn.execute(
            "SELECT COUNT(*) AS n FROM projects WHERE user_id=?", (uid,)
        ).fetchone()["n"]
        if count == 0:
            for project in seed_projects():
                conn.execute(
                    "INSERT INTO projects VALUES (?, ?, ?, ?, ?)",
                    (
                        project["id"],
                        uid,
                        json.dumps(project, ensure_ascii=False),
                        project["updatedAt"],
                        project["updatedAt"],
                    ),
                )
        for project in seed_projects():
            conn.execute(
                "INSERT OR IGNORE INTO project_members VALUES (?, ?, ?, ?)",
                (project["id"], uid, "owner", now()),
            )
            rubric = default_rubric(project["id"], uid)
            conn.execute(
                """INSERT OR IGNORE INTO rubrics
                (id, project_id, version, title, scope, items_json, status, created_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    rubric["id"],
                    project["id"],
                    rubric["version"],
                    rubric["title"],
                    rubric["scope"],
                    json.dumps(rubric["items"], ensure_ascii=False),
                    "draft",
                    uid,
                    now(),
                ),
            )
            if project["id"] in {"xiang", "lowcarbon"}:
                conn.execute(
                    "INSERT OR IGNORE INTO project_members VALUES (?, ?, ?, ?)",
                    (project["id"], reviewer_id, "reviewer", now()),
                )
            material_count = conn.execute(
                "SELECT COUNT(*) AS n FROM materials WHERE project_id=?", (project["id"],)
            ).fetchone()["n"]
            if material_count == 0:
                for index, material in enumerate(project["materials"], start=1):
                    material_id = f"{project['id']}-material-{index}"
                    details = material[1].split(" · ")
                    mime = (
                        "application/pdf"
                        if "PDF" in material[1]
                        else "image/png" if "PNG" in material[1] else "text/plain"
                    )
                    conn.execute(
                        """INSERT OR IGNORE INTO materials
                        (id, project_id, created_by, source_type, original_name, mime_type, size,
                         sha256, storage_path, content_text, status, error_message, created_at, archived_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)""",
                        (
                            material_id,
                            project["id"],
                            uid,
                            "file" if mime != "text/plain" else "text",
                            material[0],
                            mime,
                            0,
                            None,
                            None,
                            "",
                            material[2],
                            material[4],
                            now(),
                        ),
                    )


def load_user(token: str | None) -> sqlite3.Row | None:
    if not token:
        return None
    with connect() as conn:
        return conn.execute(
            """SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id
            WHERE s.token=? AND s.expires_at>?""",
            (token, now()),
        ).fetchone()


def project_for(user_id: str, project_id: str) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            """SELECT p.payload FROM projects p
            LEFT JOIN project_members m ON m.project_id=p.id AND m.user_id=?
            WHERE p.id=? AND (p.user_id=? OR m.user_id IS NOT NULL)""",
            (user_id, project_id, user_id),
        ).fetchone()
    if not row:
        return None
    project = json.loads(row["payload"])
    return None if project.get("archivedAt") else project


def project_owner_id(project_id: str) -> str | None:
    with connect() as conn:
        row = conn.execute("SELECT user_id FROM projects WHERE id=?", (project_id,)).fetchone()
    return row["user_id"] if row else None


def member_role(user_id: str, project_id: str) -> str | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT role FROM project_members WHERE project_id=? AND user_id=?",
            (project_id, user_id),
        ).fetchone()
    if row:
        return row["role"]
    return "owner" if project_owner_id(project_id) == user_id else None


def require_role(user_id: str, project_id: str, roles: set[str]) -> str:
    role = member_role(user_id, project_id)
    if role not in roles:
        raise PermissionError("你没有执行此操作的项目权限")
    return role


def save_project(
    user_id: str, project: dict, event: str, event_payload: dict | None = None
) -> None:
    project["updatedAt"] = now()
    with connect() as conn:
        conn.execute(
            "UPDATE projects SET payload=?, updated_at=? WHERE id=?",
            (json.dumps(project, ensure_ascii=False), project["updatedAt"], project["id"]),
        )
        conn.execute(
            "INSERT INTO audit_events VALUES (?, ?, ?, ?, ?, ?)",
            (
                str(uuid.uuid4()),
                user_id,
                project["id"],
                event,
                json.dumps(event_payload or {}, ensure_ascii=False),
                project["updatedAt"],
            ),
        )


class Handler(BaseHTTPRequestHandler):
    server_version = "Licheng/0.1"
    # Keep SSE responses incremental while closing the connection explicitly at the end.
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        return

    def send_json(self, body: dict, status: int = 200, headers: dict | None = None):
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(raw)

    def body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def multipart_body(self) -> tuple[dict, FieldStorage | None]:
        form = FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": self.command,
                "CONTENT_TYPE": self.headers.get("Content-Type", ""),
            },
        )
        fields = {}
        uploaded = None
        for key in form.keys():
            item = form[key]
            if isinstance(item, list):
                item = item[-1]
            if getattr(item, "filename", None):
                uploaded = item
            else:
                fields[key] = item.value
        return fields, uploaded

    def request_payload(self) -> dict:
        content_type = self.headers.get("Content-Type", "")
        if content_type.startswith("multipart/form-data"):
            fields, uploaded = self.multipart_body()
            fields["_file"] = uploaded
            return fields
        return self.body()

    def token(self) -> str | None:
        cookies = self.headers.get("Cookie", "")
        for item in cookies.split(";"):
            if item.strip().startswith("sy_session="):
                return item.strip().split("=", 1)[1]
        return None

    def auth(self) -> sqlite3.Row | None:
        return load_user(self.token())

    def require_auth(self) -> sqlite3.Row:
        user = self.auth()
        if not user:
            raise PermissionError("请先登录")
        return user

    def path_parts(self):
        return [part for part in urlparse(self.path).path.split("/") if part]

    def material_payload(self, row: sqlite3.Row) -> dict:
        with connect() as conn:
            citations = conn.execute(
                "SELECT id, excerpt, location, note, status, created_at FROM evidence_citations "
                "WHERE material_id=? ORDER BY created_at",
                (row["id"],),
            ).fetchall()
        return {
            "id": row["id"],
            "projectId": row["project_id"],
            "sourceType": row["source_type"],
            "originalName": row["original_name"],
            "mimeType": row["mime_type"],
            "size": row["size"],
            "status": row["status"],
            "error": row["error_message"],
            "hasFile": bool(row["storage_path"]),
            "contentPreview": (row["content_text"] or "")[:1200],
            "citations": [dict(item) for item in citations],
            "createdAt": row["created_at"],
        }

    def do_GET(self):
        path = urlparse(self.path).path
        try:
            if path == "/api/health":
                return self.send_json({"ok": True, "service": "licheng", "version": "0.1.0"})
            if path == "/api/session":
                user = self.auth()
                if not user:
                    return self.send_json({"authenticated": False, "user": None, "projects": []})
                with connect() as conn:
                    rows = conn.execute(
                        """SELECT DISTINCT p.payload FROM projects p
                        LEFT JOIN project_members m ON m.project_id=p.id AND m.user_id=?
                        WHERE p.user_id=? OR m.user_id IS NOT NULL ORDER BY p.created_at""",
                        (user["id"], user["id"]),
                    ).fetchall()
                return self.send_json(
                    {
                        "authenticated": True,
                        "user": {"id": user["id"], "name": user["name"], "email": user["email"]},
                        "projects": [
                            json.loads(r["payload"])
                            for r in rows
                            if not json.loads(r["payload"]).get("archivedAt")
                        ],
                    }
                )
            if path.startswith("/api/materials/") and path.endswith("/download"):
                user = self.require_auth()
                material_id = self.path_parts()[2]
                return self.download_material(user, material_id)
            if path.startswith("/api/projects/") and path.endswith("/materials"):
                user = self.require_auth()
                project_id = self.path_parts()[2]
                require_role(user["id"], project_id, {"owner", "member", "reviewer", "observer"})
                return self.get_materials(project_id)
            if path.startswith("/api/projects/") and path.endswith("/rubric"):
                user = self.require_auth()
                project_id = self.path_parts()[2]
                require_role(user["id"], project_id, {"owner", "member", "reviewer", "observer"})
                return self.get_rubric(project_id)
            if path.startswith("/api/projects/") and path.endswith("/members"):
                user = self.require_auth()
                project_id = self.path_parts()[2]
                require_role(user["id"], project_id, {"owner", "member", "reviewer", "observer"})
                return self.get_members(project_id)
            if path.startswith("/api/projects/") and path.endswith("/audit"):
                user = self.require_auth()
                project_id = self.path_parts()[2]
                require_role(user["id"], project_id, {"owner", "member", "reviewer", "observer"})
                return self.get_audit(project_id)
            if path.startswith("/api/projects/") and path.endswith("/help"):
                user = self.require_auth()
                project_id = self.path_parts()[2]
                require_role(user["id"], project_id, {"owner", "member", "reviewer", "observer"})
                return self.get_help_requests(project_id)
            if path.startswith("/api/projects/") and path.endswith("/versions"):
                user = self.require_auth()
                project_id = self.path_parts()[2]
                require_role(user["id"], project_id, {"owner", "member", "reviewer", "observer"})
                return self.get_versions(project_id)
            if path.startswith("/api/projects/") and path.endswith("/reviews"):
                user = self.require_auth()
                project_id = self.path_parts()[2]
                require_role(user["id"], project_id, {"owner", "member", "reviewer", "observer"})
                return self.get_reviews(project_id)
            if path.startswith("/api/projects/") and path.endswith("/agent/chat"):
                user = self.require_auth()
                project_id = self.path_parts()[2]
                return self.get_agent_chat(user, project_id)
            if path.startswith("/api/projects/"):
                user = self.require_auth()
                project_id = self.path_parts()[2]
                project = project_for(user["id"], project_id)
                if not project:
                    return self.send_json({"error": "项目不存在"}, 404)
                return self.send_json({"project": project})
            if path == "/api/projects":
                user = self.require_auth()
                with connect() as conn:
                    rows = conn.execute(
                        """SELECT DISTINCT p.payload FROM projects p
                        LEFT JOIN project_members m ON m.project_id=p.id AND m.user_id=?
                        WHERE p.user_id=? OR m.user_id IS NOT NULL ORDER BY p.created_at""",
                        (user["id"], user["id"]),
                    ).fetchall()
                return self.send_json(
                    {
                        "projects": [
                            json.loads(r["payload"])
                            for r in rows
                            if not json.loads(r["payload"]).get("archivedAt")
                        ]
                    }
                )
            return self.static(path)
        except PermissionError as exc:
            return self.send_json({"error": str(exc)}, 401)
        except Exception as exc:
            return self.send_json({"error": str(exc)}, 500)

    def logout(self):
        token = self.token()
        if token:
            with connect() as conn:
                conn.execute("DELETE FROM sessions WHERE token=?", (token,))
        return self.send_json(
            {"ok": True},
            headers={"Set-Cookie": "sy_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax"},
        )

    def get_materials(self, project_id: str):
        with connect() as conn:
            rows = conn.execute(
                "SELECT * FROM materials WHERE project_id=? AND archived_at IS NULL ORDER BY created_at",
                (project_id,),
            ).fetchall()
            citations = conn.execute(
                "SELECT * FROM evidence_citations WHERE project_id=? ORDER BY created_at",
                (project_id,),
            ).fetchall()
        return self.send_json(
            {
                "materials": [self.material_payload(row) for row in rows],
                "evidence": [dict(row) for row in citations],
            }
        )

    def get_rubric(self, project_id: str):
        with connect() as conn:
            row = conn.execute(
                "SELECT * FROM rubrics WHERE project_id=? ORDER BY version DESC LIMIT 1",
                (project_id,),
            ).fetchone()
        if not row:
            return self.send_json({"rubric": None})
        rubric = dict(row)
        rubric["items"] = json.loads(rubric.pop("items_json"))
        return self.send_json({"rubric": rubric})

    def get_members(self, project_id: str):
        with connect() as conn:
            rows = conn.execute(
                """SELECT m.project_id, m.user_id, u.name, u.email, m.role, m.created_at
                FROM project_members m JOIN users u ON u.id=m.user_id
                WHERE m.project_id=? ORDER BY m.created_at""",
                (project_id,),
            ).fetchall()
        return self.send_json({"members": [dict(row) for row in rows]})

    def get_audit(self, project_id: str):
        with connect() as conn:
            rows = conn.execute(
                "SELECT * FROM audit_events WHERE project_id=? ORDER BY created_at DESC LIMIT 100",
                (project_id,),
            ).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            item["payload"] = json.loads(item["payload"] or "{}")
            result.append(item)
        return self.send_json({"events": result})

    def get_help_requests(self, project_id: str):
        with connect() as conn:
            rows = conn.execute(
                """SELECT h.*, u.name AS created_by_name
                FROM help_requests h JOIN users u ON u.id=h.created_by
                WHERE h.project_id=? ORDER BY h.created_at DESC""",
                (project_id,),
            ).fetchall()
        return self.send_json({"requests": [dict(row) for row in rows]})

    def get_versions(self, project_id: str):
        with connect() as conn:
            rows = conn.execute(
                """SELECT v.*, u.name AS created_by_name
                FROM material_versions v JOIN users u ON u.id=v.created_by
                WHERE v.project_id=? ORDER BY v.created_at""",
                (project_id,),
            ).fetchall()
        versions = []
        for row in rows:
            item = dict(row)
            item["content"] = item.pop("content_text") or ""
            item["diffRatio"] = None
            if item.get("previous_id"):
                previous = next(
                    (candidate for candidate in versions if candidate["id"] == item["previous_id"]),
                    None,
                )
                if previous:
                    item["diffRatio"] = round(
                        1 - SequenceMatcher(None, previous["content"], item["content"]).ratio(), 4
                    )
            versions.append(item)
        return self.send_json({"versions": versions})

    def get_reviews(self, project_id: str):
        with connect() as conn:
            reviews = conn.execute(
                """SELECT r.*, u.name AS reviewer_name
                FROM reviews r JOIN users u ON u.id=r.reviewer_id
                WHERE r.project_id=? ORDER BY r.created_at DESC""",
                (project_id,),
            ).fetchall()
            items = conn.execute(
                """SELECT i.*, r.reviewer_id
                FROM review_items i JOIN reviews r ON r.id=i.review_id
                WHERE r.project_id=? ORDER BY i.created_at""",
                (project_id,),
            ).fetchall()
        grouped = {}
        for item in items:
            grouped.setdefault(item["review_id"], []).append(dict(item))
        result = []
        for review in reviews:
            payload = dict(review)
            payload["items"] = grouped.get(review["id"], [])
            result.append(payload)
        return self.send_json({"reviews": result})

    def download_material(self, user: sqlite3.Row, material_id: str):
        with connect() as conn:
            row = conn.execute("SELECT * FROM materials WHERE id=?", (material_id,)).fetchone()
        if not row or not member_role(user["id"], row["project_id"]):
            return self.send_json({"error": "材料不存在或无权访问"}, 404)
        if not row["storage_path"]:
            return self.send_json({"error": "该材料没有可下载文件"}, 404)
        path = (ROOT / row["storage_path"]).resolve()
        if UPLOADS.resolve() not in path.parents or not path.exists():
            return self.send_json({"error": "材料文件不存在"}, 404)
        content = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", row["mime_type"])
        self.send_header("Content-Length", str(len(content)))
        self.send_header(
            "Content-Disposition", f'inline; filename="{safe_filename(row["original_name"])}"'
        )
        self.end_headers()
        self.wfile.write(content)

    def create_material(self, user: sqlite3.Row, project_id: str, payload: dict):
        uploaded = payload.get("_file")
        source_type = payload.get("sourceType", "text")
        url = payload.get("url", "").strip()
        text = payload.get("text", "")
        original_name = payload.get("name", "").strip()
        mime_type = payload.get("mimeType", "text/plain")
        storage_path = None
        size = 0
        error_message = None
        material_id = "material-" + uuid.uuid4().hex[:12]
        if uploaded is not None:
            original_name = safe_filename(uploaded.filename)
            mime_type = (
                uploaded.type
                or mimetypes.guess_type(original_name)[0]
                or "application/octet-stream"
            )
            if mime_type not in ALLOWED_MATERIAL_TYPES:
                raise ValueError("暂不支持此文件类型，请上传 PDF、Word、图片或文本")
            content = uploaded.file.read(MAX_UPLOAD_BYTES + 1)
            if len(content) > MAX_UPLOAD_BYTES:
                raise ValueError("单个材料不能超过 50MB")
            extension = ALLOWED_MATERIAL_TYPES[mime_type]
            folder = UPLOADS / project_id / material_id
            folder.mkdir(parents=True, exist_ok=True)
            path = folder / f"original.{extension}"
            path.write_bytes(content)
            storage_path = str(path.relative_to(ROOT)).replace("\\", "/")
            size = len(content)
            text, status, error_message = extract_text(path, mime_type)
            sha = file_sha256(path)
        elif source_type == "link":
            if not url:
                raise ValueError("链接不能为空")
            original_name = original_name or url
            mime_type = "text/uri-list"
            text = url
            status = "待读取"
            sha = hashlib.sha256(url.encode()).hexdigest()
        else:
            if not text.strip():
                raise ValueError("文本材料不能为空")
            original_name = original_name or "粘贴文本"
            mime_type = "text/plain"
            status = "已读取"
            sha = hashlib.sha256(text.encode()).hexdigest()
            size = len(text.encode())
        if uploaded is None and source_type not in {"link", "text"}:
            source_type = "text"
        with connect() as conn:
            conn.execute(
                """INSERT INTO materials
                (id, project_id, created_by, source_type, original_name, mime_type, size, sha256,
                 storage_path, content_text, status, error_message, created_at, archived_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)""",
                (
                    material_id,
                    project_id,
                    user["id"],
                    source_type,
                    original_name,
                    mime_type,
                    size,
                    sha,
                    storage_path,
                    text,
                    status,
                    error_message,
                    now(),
                ),
            )
            conn.execute(
                "INSERT INTO material_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (material_id + "-v1", material_id, project_id, 1, text, user["id"], now(), None),
            )
            conn.execute(
                "INSERT INTO audit_events VALUES (?, ?, ?, ?, ?, ?)",
                (
                    str(uuid.uuid4()),
                    user["id"],
                    project_id,
                    "material.created",
                    json.dumps(
                        {"materialId": material_id, "name": original_name}, ensure_ascii=False
                    ),
                    now(),
                ),
            )
            row = conn.execute("SELECT * FROM materials WHERE id=?", (material_id,)).fetchone()
        return self.send_json({"material": self.material_payload(row)}, 201)

    def create_evidence(self, user: sqlite3.Row, material_id: str, payload: dict):
        excerpt = payload.get("excerpt", "").strip()
        location = payload.get("location", "").strip()
        if not excerpt or not location:
            raise ValueError("请填写原文摘录和页码、段落或截图位置")
        with connect() as conn:
            material = conn.execute("SELECT * FROM materials WHERE id=?", (material_id,)).fetchone()
            if not material or not member_role(user["id"], material["project_id"]):
                return self.send_json({"error": "材料不存在或无权访问"}, 404)
            evidence_id = "evidence-" + uuid.uuid4().hex[:12]
            conn.execute(
                "INSERT INTO evidence_citations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    evidence_id,
                    material_id,
                    material["project_id"],
                    user["id"],
                    excerpt,
                    location,
                    payload.get("note", ""),
                    "confirmed",
                    now(),
                ),
            )
        return self.send_json({"evidenceId": evidence_id}, 201)

    def create_help_request(self, user: sqlite3.Row, project_id: str, payload: dict):
        message = str(payload.get("message", "")).strip()
        if not message:
            raise ValueError("请先描述需要帮助的卡点")
        request_id = "help-" + uuid.uuid4().hex[:12]
        category = str(payload.get("category", "未分类")).strip() or "未分类"
        with connect() as conn:
            conn.execute(
                "INSERT INTO help_requests VALUES (?, ?, ?, ?, ?, 'open', ?)",
                (request_id, project_id, user["id"], message, category, now()),
            )
            conn.execute(
                "INSERT INTO audit_events VALUES (?, ?, ?, ?, ?, ?)",
                (
                    str(uuid.uuid4()),
                    user["id"],
                    project_id,
                    "help.requested",
                    json.dumps({"requestId": request_id, "category": category}, ensure_ascii=False),
                    now(),
                ),
            )
        return self.send_json({"requestId": request_id, "status": "open"}, 201)

    def assign_action(self, user: sqlite3.Row, project: dict, payload: dict):
        index = int(payload.get("index", 0))
        member_id = str(payload.get("memberId", "")).strip()
        if index not in range(len(project.get("actions", []))) or not member_id:
            raise ValueError("请选择有效的行动卡和项目成员")
        with connect() as conn:
            member = conn.execute(
                """SELECT u.id, u.name FROM project_members m JOIN users u ON u.id=m.user_id
                WHERE m.project_id=? AND m.user_id=? AND m.role IN ('owner', 'member')""",
                (project["id"], member_id),
            ).fetchone()
        if not member:
            raise ValueError("该用户不是当前项目的可执行成员")
        project["actions"][index]["owner"] = member["name"]
        project["actions"][index]["assigneeId"] = member["id"]
        save_project(
            user["id"], project, "action.assigned", {"index": index, "assigneeId": member["id"]}
        )
        return self.send_json({"project": project})

    def agent_context(self, user: sqlite3.Row, project_id: str) -> dict:
        project = project_for(user["id"], project_id)
        if not project:
            raise ValueError("请先选择一个可访问的项目")
        require_role(user["id"], project_id, {"owner", "member", "reviewer", "observer"})
        with connect() as conn:
            rubric = conn.execute(
                "SELECT version, title, scope, items_json, status FROM rubrics WHERE project_id=? ORDER BY version DESC LIMIT 1",
                (project_id,),
            ).fetchone()
            materials = conn.execute(
                """SELECT id, original_name, mime_type, status, content_text, error_message
                FROM materials WHERE project_id=? AND archived_at IS NULL ORDER BY created_at""",
                (project_id,),
            ).fetchall()
        material_context = []
        for material in materials:
            material_context.append(
                {
                    "id": material["id"],
                    "name": material["original_name"],
                    "type": material["mime_type"],
                    "status": material["status"],
                    "content": (material["content_text"] or "")[:5000],
                    "error": material["error_message"],
                }
            )
        return {
            "project": {
                "id": project["id"],
                "name": project.get("name"),
                "goal": project.get("title"),
                "currentLoop": project.get("loopLabel"),
                "gap": project.get("gap"),
                "gapNote": project.get("gapNote"),
                "action": project.get("action"),
                "actionNote": project.get("actionNote"),
                "unknown": project.get("unknown"),
                "rubricConfirmed": project.get("rubricConfirmed", False),
                "gapConfirmed": project.get("gapConfirmed", False),
                "actionStarted": project.get("actionStarted", False),
            },
            "rubric": {
                "version": rubric["version"],
                "title": rubric["title"],
                "scope": rubric["scope"],
                "status": rubric["status"],
                "items": json.loads(rubric["items_json"]),
            }
            if rubric
            else None,
            "materials": material_context,
            "role": member_role(user["id"], project_id) or "unknown",
        }

    def local_chat_reply(self, message: str, context: dict) -> str:
        project = context["project"]
        if not context["materials"]:
            return "我还没有读到当前项目的材料。你可以先上传文档、PDF、图片，或粘贴一段文本；拿到依据后，我再帮你判断卡点。"
        if any(word in message for word in ("标准", "什么算", "判断")):
            return "先看本轮已确认的判断标准，再问自己：当前材料中哪一条有原文依据，哪一条还只有推测。没有位置或摘录的内容，我会先标为证据不足。"
        if any(word in message for word in ("差距", "问题", "哪里", "缺什么")):
            return f"当前最值得处理的缺口是“{project.get('gap') or '还没有诊断出的缺口'}”。先找到一条能支撑或反驳它的原文，再决定是否采用这张行动卡。"
        if any(word in message for word in ("怎么做", "下一步", "行动", "开始")):
            return f"建议先完成“{project.get('action') or '当前行动卡'}”。交付物要小而具体，写清原话、你的判断和对应样品位置；我不会替你写可提交结论。"
        return "我会围绕当前项目、已确认标准和材料证据陪你拆解。你可以继续告诉我：你卡在理解、方法、材料、环境，还是不知道下一步交付什么。"

    def build_agent_messages(
        self, user: sqlite3.Row, project_id: str, message: str, attachment: dict | None = None
    ) -> tuple[dict, list[dict]]:
        """Build a project-scoped prompt and persist the user's message.

        Secrets are intentionally excluded: only the selected project's bounded
        context and the current user's conversation are sent upstream.
        """
        context = self.agent_context(user, project_id)
        if attachment:
            context["chatAttachment"] = {
                "name": attachment["name"],
                "mimeType": attachment["mimeType"],
                "extractedText": attachment.get("text", "")[:12000],
            }
        with connect() as conn:
            history_rows = conn.execute(
                """SELECT role, content FROM agent_messages
                WHERE project_id=? AND user_id=? ORDER BY created_at DESC LIMIT 10""",
                (project_id, user["id"]),
            ).fetchall()
            conn.execute(
                "INSERT INTO agent_messages VALUES (?, ?, ?, 'user', ?, ?, ?)",
                ("message-" + uuid.uuid4().hex[:12], project_id, user["id"], message, "user", now()),
            )
        system = (
            "你是砺程教练，面向学生科研、竞赛和创新项目提供质量进阶陪伴。"
            "你只能诊断、解释、规划和辅助复核，不能代写学生可提交的成果，不能替学生确认标准、选择缺口或盖章通过。"
            "只能使用下面提供的当前项目上下文；没有材料或没有引用位置时明确说证据不足，不要编造事实。"
            "回答使用简洁中文，先给判断，再给一个可执行的下一步，必要时列出依据材料名称。\n\n"
            f"当前上下文：{json.dumps(context, ensure_ascii=False)}"
        )
        messages = [{"role": "system", "content": system}]
        messages.extend({"role": row["role"], "content": row["content"]} for row in reversed(history_rows))
        user_content: str | list[dict] = message
        if attachment and attachment.get("imageDataUri"):
            user_content = [
                {"type": "text", "text": message or "请分析这张图片，并结合当前项目告诉我下一步。"},
                {"type": "image_url", "image_url": {"url": attachment["imageDataUri"]}},
            ]
        elif attachment and attachment.get("text"):
            user_content = (
                f"{message or '请分析我附加的材料，并结合当前项目告诉我下一步。'}\n\n"
                f"【附加材料：{attachment['name']}】\n{attachment['text'][:12000]}"
            )
        messages.append({"role": "user", "content": user_content})
        return context, messages

    def read_agent_attachment(self, uploaded) -> dict:
        """Convert one chat attachment to bounded text or a multimodal image part."""
        if uploaded is None or not getattr(uploaded, "filename", None):
            return {}
        name = safe_filename(uploaded.filename)
        mime_type = uploaded.type or mimetypes.guess_type(name)[0] or "application/octet-stream"
        if mime_type not in ALLOWED_MATERIAL_TYPES:
            raise ValueError("对话附件仅支持 PDF、Word、图片和文本文件")
        content = uploaded.file.read(MAX_UPLOAD_BYTES + 1)
        if len(content) > MAX_UPLOAD_BYTES:
            raise ValueError("单个对话附件不能超过 50MB")
        attachment = {"name": name, "mimeType": mime_type, "text": ""}
        if mime_type.startswith("image/"):
            attachment["imageDataUri"] = f"data:{mime_type};base64,{base64.b64encode(content).decode('ascii')}"
            return attachment
        temp_dir = DATA / "agent_tmp"
        temp_dir.mkdir(parents=True, exist_ok=True)
        temp_path = temp_dir / f"{uuid.uuid4().hex}-{name}"
        try:
            temp_path.write_bytes(content)
            text, _, _ = extract_text(temp_path, mime_type)
            attachment["text"] = text or "（文件暂未提取出可读文字，请根据文件名和当前项目上下文继续询问。）"
        finally:
            temp_path.unlink(missing_ok=True)
        return attachment

    def get_agent_chat(self, user: sqlite3.Row, project_id: str):
        self.agent_context(user, project_id)
        api_key, _, _ = refresh_deepseek_config()
        with connect() as conn:
            rows = conn.execute(
                """SELECT role, content, provider, created_at FROM agent_messages
                WHERE project_id=? AND user_id=? ORDER BY created_at DESC LIMIT 40""",
                (project_id, user["id"]),
            ).fetchall()
        messages = [dict(row) for row in reversed(rows)]
        return self.send_json({"messages": messages, "provider": "deepseek" if api_key else "local-rules"})

    def agent_chat(self, user: sqlite3.Row, payload: dict):
        project_id = str(payload.get("projectId", "")).strip()
        message = str(payload.get("message", "")).strip()
        if not message:
            raise ValueError("请输入你想咨询的问题")
        if len(message) > 4000:
            raise ValueError("单次消息不能超过 4000 字")
        context, messages = self.build_agent_messages(user, project_id, message)
        reply, error = deepseek_chat(messages)
        provider = "deepseek" if reply else "local-rules-fallback"
        if not reply:
            reply = self.local_chat_reply(message, context)
        self.save_agent_reply(user, project_id, reply, provider)
        return self.send_json({"reply": reply, "provider": provider, "fallbackReason": error})

    def send_sse_headers(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

    def send_sse(self, event: dict):
        payload = (f"data: {json.dumps(event, ensure_ascii=False)}\n\n").encode("utf-8")
        self.wfile.write(payload)
        self.wfile.flush()

    @staticmethod
    def stream_chunks(text: str, chunk_size: int = 8):
        for start in range(0, len(text), chunk_size):
            yield text[start : start + chunk_size]

    def save_agent_reply(self, user: sqlite3.Row, project_id: str, reply: str, provider: str):
        with connect() as conn:
            conn.execute(
                "INSERT INTO agent_messages VALUES (?, ?, ?, 'assistant', ?, ?, ?)",
                ("message-" + uuid.uuid4().hex[:12], project_id, user["id"], reply, provider, now()),
            )
            conn.execute(
                "INSERT INTO audit_events VALUES (?, ?, ?, ?, ?, ?)",
                (
                    str(uuid.uuid4()),
                    user["id"],
                    project_id,
                    "agent.chat.completed",
                    json.dumps({"provider": provider}, ensure_ascii=False),
                    now(),
                ),
            )

    def agent_chat_stream(self, user: sqlite3.Row, payload: dict):
        """Stream an answer as SSE while keeping the key server-side."""
        project_id = str(payload.get("projectId", "")).strip()
        message = str(payload.get("message", "")).strip()
        if not message:
            raise ValueError("请输入你想咨询的问题")
        if len(message) > 4000:
            raise ValueError("单次消息不能超过 4000 字")
        attachment = self.read_agent_attachment(payload.get("_file"))
        context, messages = self.build_agent_messages(user, project_id, message, attachment)
        self.send_sse_headers()
        parts: list[str] = []
        provider = "local-rules-fallback"
        upstream_interrupted = False
        api_key, base_url, model = refresh_deepseek_config()
        upstream_error = None
        # Emit immediately so the client can show progress while the model is thinking.
        self.send_sse({"type": "status", "status": "thinking", "message": "砺程教练正在思考…"})
        if api_key:
            body = json.dumps(
                {"model": model, "messages": messages, "temperature": 0.35, "max_tokens": 900, "stream": True},
                ensure_ascii=False,
            ).encode("utf-8")
            request = urllib.request.Request(
                f"{base_url}/chat/completions",
                data=body,
                method="POST",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "Accept": "text/event-stream"},
            )
            try:
                with urllib.request.urlopen(request, timeout=45) as response:
                    for raw_line in response:
                        line = raw_line.decode("utf-8", errors="replace").strip()
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        try:
                            item = json.loads(data)
                            token = item.get("choices", [{}])[0].get("delta", {}).get("content", "")
                        except (ValueError, AttributeError, IndexError, TypeError):
                            continue
                        if isinstance(token, str) and token:
                            if not parts:
                                self.send_sse({"type": "status", "status": "writing", "message": "正在组织回答…"})
                            parts.append(token)
                            self.send_sse({"type": "token", "text": token})
            except urllib.error.HTTPError as exc:
                if exc.code in {401, 403}:
                    upstream_error = "DeepSeek 认证失败，请检查 API Key"
                elif exc.code == 429:
                    upstream_error = "DeepSeek 请求频率受限，请稍后再试"
                else:
                    upstream_error = f"DeepSeek 请求失败（HTTP {exc.code}）"
                upstream_interrupted = bool(parts)
            except (urllib.error.URLError, TimeoutError):
                upstream_error = "无法连接 DeepSeek，请检查网络或 API 地址"
                upstream_interrupted = bool(parts)
            except OSError:
                upstream_error = "DeepSeek 连接异常"
                upstream_interrupted = bool(parts)
            if parts:
                provider = "deepseek"

        if not parts:
            self.send_sse({"type": "status", "status": "fallback", "message": "正在使用本地安全回答…"})
            fallback = self.local_chat_reply(message, context)
            for token in self.stream_chunks(fallback):
                parts.append(token)
                self.send_sse({"type": "token", "text": token})
                time.sleep(0.012)

        reply = "".join(parts)
        if upstream_error:
            self.send_sse({"type": "error", "message": upstream_error if not parts else "回答连接中断，已保留已收到的内容。"})
        elif upstream_interrupted:
            self.send_sse({"type": "error", "message": "回答连接中断，已保留已收到的内容。"})
        self.save_agent_reply(user, project_id, reply, provider)
        self.send_sse({"type": "done", "provider": provider})

    def agent_advice(self, user: sqlite3.Row, payload: dict):
        project_id = str(payload.get("projectId", "")).strip()
        workspace = str(payload.get("workspace", "loop")).strip() or "loop"
        project = project_for(user["id"], project_id) if project_id else None
        if not project:
            raise ValueError("请先选择一个可访问的项目")
        require_role(user["id"], project_id, {"owner", "member", "reviewer", "observer"})
        with connect() as conn:
            rubric = conn.execute(
                "SELECT * FROM rubrics WHERE project_id=? ORDER BY version DESC LIMIT 1",
                (project_id,),
            ).fetchone()
            materials = conn.execute(
                "SELECT id, original_name, status FROM materials WHERE project_id=? AND archived_at IS NULL",
                (project_id,),
            ).fetchall()
        material_names = [
            item["original_name"] for item in materials if item["status"] in {"已读取", "已定位"}
        ]
        unknown = project.get("unknown") or "当前项目没有额外记录的未知项。"
        if workspace == "review":
            advice = (
                "先按已确认的每条检查项分别给出 PASS、FAIL 或 UNKNOWN，并在证据不足时保留 UNKNOWN。"
            )
            next_action = "逐项打开 V1/V2 的对应证据，写下检查依据。"
        elif workspace == "materials":
            advice = "优先确认与当前差距最相关的一份材料，并记录原文摘录和页码、段落或截图位置。"
            next_action = "打开一份已读取材料，补一条可回查的证据引用。"
        elif workspace == "transfer":
            advice = "换一份相近材料独立试做，只给自己最少提示，再请另一位成员检查是否真的会用。"
            next_action = "选择第二份真实材料，写下原话、判断和决策的对应关系。"
        else:
            advice = "先处理当前最小缺口：把已有材料中的原话、判断和具体决策连成可回查的一句话。"
            next_action = "在动作卡中提交一段你亲手完成的改进内容，不要让教练代写结论。"
        response = {
            "advice": advice,
            "nextAction": next_action,
            "grounded": bool(material_names),
            "provider": "local-rules",
            "basis": {
                "projectId": project_id,
                "workspace": workspace,
                "rubricVersion": rubric["version"] if rubric else None,
                "readableMaterials": material_names,
                "unknown": unknown,
            },
        }
        with connect() as conn:
            conn.execute(
                "INSERT INTO agent_advice VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    "advice-" + uuid.uuid4().hex[:12],
                    project_id,
                    user["id"],
                    workspace,
                    json.dumps(response, ensure_ascii=False),
                    "local-rules",
                    now(),
                ),
            )
            conn.execute(
                "INSERT INTO audit_events VALUES (?, ?, ?, ?, ?, ?)",
                (
                    str(uuid.uuid4()),
                    user["id"],
                    project_id,
                    "agent.advice.generated",
                    json.dumps(
                        {"workspace": workspace, "provider": "local-rules"}, ensure_ascii=False
                    ),
                    now(),
                ),
            )
        return self.send_json(response)

    def create_rubric(self, user: sqlite3.Row, project_id: str, payload: dict):
        title = payload.get("title", "").strip()
        scope = payload.get("scope", "").strip()
        items = payload.get("items")
        if not title or not scope or not isinstance(items, list) or not items:
            raise ValueError("请填写标准标题、判断范围和至少一条检查项")
        with connect() as conn:
            version = conn.execute(
                "SELECT COALESCE(MAX(version), 0) + 1 AS version FROM rubrics WHERE project_id=?",
                (project_id,),
            ).fetchone()["version"]
            rubric_id = f"rubric-{project_id}-{version}"
            conn.execute(
                """INSERT INTO rubrics
                (id, project_id, version, title, scope, items_json, status, created_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)""",
                (
                    rubric_id,
                    project_id,
                    version,
                    title,
                    scope,
                    json.dumps(items, ensure_ascii=False),
                    user["id"],
                    now(),
                ),
            )
        project = project_for(user["id"], project_id)
        if project:
            project["rubricConfirmed"] = False
            project.setdefault("review", {})["criteria"] = ["pending"] * len(items)
            project["review"]["total"] = len(items)
            project["review"]["completed"] = 0
            project["review"]["status"] = "等待改进版本"
            save_project(
                user["id"], project, "rubric.created", {"rubricId": rubric_id, "version": version}
            )
        return self.send_json({"rubricId": rubric_id, "version": version}, 201)

    def rubric_item_count(self, project_id: str) -> int:
        with connect() as conn:
            row = conn.execute(
                "SELECT items_json FROM rubrics WHERE project_id=? ORDER BY version DESC LIMIT 1",
                (project_id,),
            ).fetchone()
        if not row:
            return 0
        try:
            return len(json.loads(row["items_json"]))
        except (TypeError, json.JSONDecodeError):
            return 0

    def create_invitation(self, user: sqlite3.Row, project_id: str, payload: dict):
        email = payload.get("email", "").strip().lower()
        role = payload.get("role", "member")
        if not email or role not in {"member", "reviewer", "observer"}:
            raise ValueError("请填写邮箱并选择有效角色")
        token = secrets.token_urlsafe(24)
        invitation_id = "invite-" + uuid.uuid4().hex[:12]
        with connect() as conn:
            conn.execute(
                "INSERT INTO invitations VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
                (
                    invitation_id,
                    project_id,
                    user["id"],
                    email,
                    role,
                    token,
                    now(),
                    expires_after(3),
                ),
            )
        return self.send_json(
            {"invitationId": invitation_id, "token": token, "status": "pending"}, 201
        )

    def accept_invitation(self, user: sqlite3.Row, token: str):
        with connect() as conn:
            invitation = conn.execute(
                "SELECT * FROM invitations WHERE token=? AND status='pending' AND expires_at>?",
                (token, now()),
            ).fetchone()
            if not invitation:
                return self.send_json({"error": "邀请不存在、已过期或已使用"}, 404)
            if invitation["email"] != user["email"]:
                return self.send_json({"error": "此邀请不是发给当前登录邮箱的"}, 403)
            conn.execute(
                "INSERT OR REPLACE INTO project_members VALUES (?, ?, ?, ?)",
                (invitation["project_id"], user["id"], invitation["role"], now()),
            )
            conn.execute("UPDATE invitations SET status='accepted' WHERE id=?", (invitation["id"],))
        return self.send_json(
            {"ok": True, "projectId": invitation["project_id"], "role": invitation["role"]}
        )

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            payload = self.request_payload()
            if path == "/api/auth/login":
                return self.login(payload)
            if path == "/api/auth/register":
                return self.register(payload)
            if path == "/api/auth/logout":
                return self.logout()
            user = self.require_auth()
            parts = self.path_parts()
            if path == "/api/projects":
                return self.create_project(user, payload)
            if len(parts) >= 4 and parts[0:2] == ["api", "projects"] and parts[-1] == "materials":
                project_id = parts[2]
                project = project_for(user["id"], project_id)
                if not project:
                    return self.send_json({"error": "项目不存在"}, 404)
                require_role(user["id"], project_id, {"owner", "member"})
                return self.create_material(user, project_id, payload)
            if len(parts) >= 4 and parts[0:2] == ["api", "projects"] and parts[-1] == "rubric":
                project_id = parts[2]
                require_role(user["id"], project_id, {"owner"})
                return self.create_rubric(user, project_id, payload)
            if (
                len(parts) >= 5
                and parts[0:2] == ["api", "projects"]
                and parts[3:5] == ["members", "invitations"]
            ):
                project_id = parts[2]
                require_role(user["id"], project_id, {"owner"})
                return self.create_invitation(user, project_id, payload)
            if len(parts) >= 3 and parts[0:2] == ["api", "invitations"] and parts[-1] == "accept":
                return self.accept_invitation(user, parts[2])
            if len(parts) >= 3 and parts[0:2] == ["api", "materials"] and parts[-1] == "evidence":
                return self.create_evidence(user, parts[2], payload)
            if len(parts) >= 4 and parts[0:2] == ["api", "projects"] and parts[-1] == "help":
                project_id = parts[2]
                project = project_for(user["id"], project_id)
                if not project:
                    return self.send_json({"error": "项目不存在"}, 404)
                require_role(user["id"], project_id, {"owner", "member"})
                return self.create_help_request(user, project_id, payload)
            if len(parts) >= 4 and parts[0:2] == ["api", "projects"] and parts[-1] == "actions":
                project_id = parts[2]
                project = project_for(user["id"], project_id)
                if not project:
                    return self.send_json({"error": "项目不存在"}, 404)
                require_role(user["id"], project_id, {"owner"})
                return self.assign_action(user, project, payload)
            if path == "/api/agent/advice":
                return self.agent_advice(user, payload)
            if len(parts) == 6 and parts[0:2] == ["api", "projects"] and parts[3:6] == ["agent", "chat", "stream"]:
                return self.agent_chat_stream(user, payload)
            if len(parts) >= 5 and parts[0:2] == ["api", "projects"] and parts[3:5] == ["agent", "chat"]:
                return self.agent_chat(user, payload)
            if len(parts) >= 4 and parts[0:2] == ["api", "projects"]:
                project = project_for(user["id"], parts[2])
                if not project:
                    return self.send_json({"error": "项目不存在"}, 404)
                action = "/".join(parts[3:])
                return self.project_action(user, project, action, payload)
            return self.send_json({"error": "接口不存在"}, 404)
        except PermissionError as exc:
            return self.send_json({"error": str(exc)}, 401)
        except ValueError as exc:
            return self.send_json({"error": str(exc)}, 400)
        except Exception as exc:
            return self.send_json({"error": str(exc)}, 500)

    def do_DELETE(self):
        path = urlparse(self.path).path
        try:
            user = self.require_auth()
            parts = self.path_parts()
            if len(parts) == 3 and parts[0:2] == ["api", "projects"]:
                project_id = parts[2]
                project = project_for(user["id"], project_id)
                if not project:
                    return self.send_json({"error": "项目不存在"}, 404)
                require_role(user["id"], project_id, {"owner"})
                project["archivedAt"] = now()
                save_project(user["id"], project, "project.archived")
                return self.send_json({"ok": True, "projectId": project_id})
            if len(parts) == 3 and parts[0:2] == ["api", "materials"]:
                return self.archive_material(user, parts[2])
            return self.send_json({"error": "接口不存在"}, 404)
        except PermissionError as exc:
            return self.send_json({"error": str(exc)}, 401)
        except Exception as exc:
            return self.send_json({"error": str(exc)}, 500)

    def do_PATCH(self):
        path = urlparse(self.path).path
        try:
            user = self.require_auth()
            parts = self.path_parts()
            if len(parts) == 3 and parts[0:2] == ["api", "projects"]:
                project_id = parts[2]
                project = project_for(user["id"], project_id)
                if not project:
                    return self.send_json({"error": "项目不存在"}, 404)
                require_role(user["id"], project_id, {"owner"})
                payload = self.body()
                changed = []
                if "name" in payload:
                    name = str(payload["name"]).strip()
                    if not name:
                        raise ValueError("项目名称不能为空")
                    project["name"] = name
                    changed.append("name")
                if "goal" in payload:
                    project["title"] = str(payload["goal"]).strip() or project["title"]
                    changed.append("goal")
                if "archived" in payload:
                    project["archivedAt"] = now() if payload["archived"] else None
                    changed.append("archived")
                if not changed:
                    raise ValueError("没有可更新的项目字段")
                save_project(user["id"], project, "project.updated", {"fields": changed})
                return self.send_json({"project": project})
            return self.send_json({"error": "接口不存在"}, 404)
        except PermissionError as exc:
            return self.send_json({"error": str(exc)}, 401)
        except ValueError as exc:
            return self.send_json({"error": str(exc)}, 400)
        except Exception as exc:
            return self.send_json({"error": str(exc)}, 500)

    def archive_material(self, user: sqlite3.Row, material_id: str):
        with connect() as conn:
            material = conn.execute("SELECT * FROM materials WHERE id=?", (material_id,)).fetchone()
            if not material:
                return self.send_json({"error": "材料不存在"}, 404)
            require_role(user["id"], material["project_id"], {"owner", "member"})
            conn.execute("UPDATE materials SET archived_at=? WHERE id=?", (now(), material_id))
            conn.execute(
                "INSERT INTO audit_events VALUES (?, ?, ?, ?, ?, ?)",
                (
                    str(uuid.uuid4()),
                    user["id"],
                    material["project_id"],
                    "material.archived",
                    json.dumps({"materialId": material_id}, ensure_ascii=False),
                    now(),
                ),
            )
        return self.send_json({"ok": True, "materialId": material_id})

    def login(self, payload):
        email, password = payload.get("email", "").strip().lower(), payload.get("password", "")
        with connect() as conn:
            user = conn.execute(
                "SELECT * FROM users WHERE email=? AND password_hash=?", (email, digest(password))
            ).fetchone()
            if not user:
                return self.send_json({"error": "邮箱或密码不正确"}, 401)
            token = secrets.token_urlsafe(32)
            conn.execute(
                "INSERT INTO sessions VALUES (?, ?, ?)", (token, user["id"], expires_after())
            )
        return self.send_json(
            {"user": {"id": user["id"], "name": user["name"], "email": user["email"]}},
            headers={"Set-Cookie": f"sy_session={token}; Path=/; HttpOnly; SameSite=Lax"},
        )

    def register(self, payload):
        name, email, password = (
            payload.get("name", "").strip(),
            payload.get("email", "").strip().lower(),
            payload.get("password", ""),
        )
        if not name or not email or len(password) < 6:
            raise ValueError("请填写姓名、邮箱和至少 6 位密码")
        uid = "user-" + uuid.uuid4().hex[:12]
        token = secrets.token_urlsafe(32)
        with connect() as conn:
            try:
                conn.execute(
                    "INSERT INTO users VALUES (?, ?, ?, ?, ?)",
                    (uid, name, email, digest(password), now()),
                )
            except sqlite3.IntegrityError:
                return self.send_json({"error": "该邮箱已注册"}, 409)
            conn.execute("INSERT INTO sessions VALUES (?, ?, ?)", (token, uid, expires_after()))
            project = base_project(
                "project-" + uuid.uuid4().hex[:10],
                "我的第一个项目",
                "科研创新 · 草稿",
                name[:1] or "新",
                "先把你想做的事说清楚",
                "这是刚创建的私有项目。",
                "目标澄清",
                "尚未邀请",
                name,
                0,
                "还没有可引用的材料。",
                "等待上传",
                "还没有确认的目标和依据。",
                "还没有诊断差距",
                "添加第一份材料后，砺程教练会开始诊断。",
                "创建第一张目标卡",
                "写下想交付的成果和已有材料。",
                [
                    [
                        "还没有材料",
                        "支持文档、PDF、图片、文本或链接",
                        "待添加",
                        "pending",
                        "添加材料后才会产生依据。",
                    ]
                ],
                [
                    {
                        "title": "创建第一张目标卡",
                        "owner": name,
                        "status": "待开始",
                        "tone": "warm",
                        "due": "预计 10 分钟",
                    }
                ],
                "尚未邀请复核者",
            )
            conn.execute(
                "INSERT INTO projects VALUES (?, ?, ?, ?, ?)",
                (
                    project["id"],
                    uid,
                    json.dumps(project, ensure_ascii=False),
                    project["updatedAt"],
                    project["updatedAt"],
                ),
            )
            conn.execute(
                "INSERT INTO project_members VALUES (?, ?, ?, ?)",
                (project["id"], uid, "owner", now()),
            )
            rubric = default_rubric(project["id"], uid)
            conn.execute(
                """INSERT INTO rubrics
                (id, project_id, version, title, scope, items_json, status, created_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)""",
                (
                    rubric["id"],
                    project["id"],
                    rubric["version"],
                    rubric["title"],
                    rubric["scope"],
                    json.dumps(rubric["items"], ensure_ascii=False),
                    uid,
                    now(),
                ),
            )
        return self.send_json(
            {"user": {"id": uid, "name": name, "email": email}, "project": project},
            headers={"Set-Cookie": f"sy_session={token}; Path=/; HttpOnly; SameSite=Lax"},
        )

    def create_project(self, user, payload):
        name = payload.get("name", "").strip()
        if not name:
            raise ValueError("项目名称不能为空")
        kind = payload.get("kind", "科研创新")
        goal = payload.get("goal", "").strip() or "先把你想做的事说清楚"
        project = base_project(
            "project-" + uuid.uuid4().hex[:10],
            name,
            kind + " · 草稿",
            name[:1],
            goal,
            "这是刚创建的项目。砺程教练会从目标、材料和限制开始陪你澄清。",
            "目标澄清",
            "尚未邀请",
            user["name"],
            0,
            "还没有可引用的材料。",
            "等待上传",
            "目标、材料和复核者都还没有确认。",
            "还没有诊断差距",
            "先添加一份材料，或者用自己的话描述你想完成的成果。",
            "创建第一张目标卡",
            "写下你想交付的成果，以及你现在手里已有的材料。",
            [
                [
                    "还没有材料",
                    "先上传文档、PDF、图片或链接",
                    "待添加",
                    "pending",
                    "添加材料后教练才能给出有依据的缺口。",
                ]
            ],
            [
                {
                    "title": "创建第一张目标卡",
                    "owner": user["name"],
                    "status": "待开始",
                    "tone": "warm",
                    "due": "预计 10 分钟",
                }
            ],
            "尚未邀请复核者",
        )
        with connect() as conn:
            conn.execute(
                "INSERT INTO projects VALUES (?, ?, ?, ?, ?)",
                (
                    project["id"],
                    user["id"],
                    json.dumps(project, ensure_ascii=False),
                    project["updatedAt"],
                    project["updatedAt"],
                ),
            )
            conn.execute(
                "INSERT INTO project_members VALUES (?, ?, ?, ?)",
                (project["id"], user["id"], "owner", now()),
            )
            rubric = default_rubric(project["id"], user["id"])
            conn.execute(
                """INSERT INTO rubrics
                (id, project_id, version, title, scope, items_json, status, created_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)""",
                (
                    rubric["id"],
                    project["id"],
                    rubric["version"],
                    rubric["title"],
                    rubric["scope"],
                    json.dumps(rubric["items"], ensure_ascii=False),
                    user["id"],
                    now(),
                ),
            )
        return self.send_json({"project": project}, 201)

    def project_action(self, user, project, action, payload):
        if action == "rubric/confirm":
            require_role(user["id"], project["id"], {"owner"})
            with connect() as conn:
                rubric = conn.execute(
                    "SELECT id, items_json FROM rubrics WHERE project_id=? ORDER BY version DESC LIMIT 1",
                    (project["id"],),
                ).fetchone()
                if rubric:
                    selected_ids = payload.get("selectedItemIds") or []
                    items = json.loads(rubric["items_json"])
                    if selected_ids:
                        selected = set(selected_ids)
                        items = [item for item in items if item.get("id") in selected]
                        if not items:
                            raise ValueError("至少保留一条本轮判断标准")
                        conn.execute(
                            "UPDATE rubrics SET items_json=? WHERE id=?",
                            (json.dumps(items, ensure_ascii=False), rubric["id"]),
                        )
                    conn.execute(
                        "UPDATE rubrics SET status='confirmed', confirmed_by=?, confirmed_at=? WHERE id=?",
                        (user["id"], now(), rubric["id"]),
                    )
            project["rubricConfirmed"] = True
            total = self.rubric_item_count(project["id"]) or 4
            project.setdefault("review", {})["total"] = total
            if len(project["review"].get("criteria", [])) != total:
                project["review"]["criteria"] = ["pending"] * total
                project["review"]["completed"] = 0
            save_project(user["id"], project, "rubric.confirmed")
        elif action == "gap/confirm":
            require_role(user["id"], project["id"], {"owner"})
            if not project["rubricConfirmed"]:
                raise ValueError("请先确认这轮判断标准")
            project["gapConfirmed"] = True
            save_project(user["id"], project, "gap.confirmed")
        elif action == "actions/start":
            require_role(user["id"], project["id"], {"owner", "member"})
            if not project["gapConfirmed"]:
                raise ValueError("请先选择要改的地方")
            project["actionStarted"] = True
            project["actions"][0]["status"] = "进行中"
            save_project(user["id"], project, "action.started")
        elif action == "versions":
            require_role(user["id"], project["id"], {"owner", "member"})
            content = payload.get("content", "").strip()
            if not project["actionStarted"] or not content:
                raise ValueError("请先开始这一步并填写改进内容")
            project["review"]["v2Submitted"] = True
            project["review"]["status"] = "待复核"
            project["actions"][0]["status"] = "等待别人检查"
            project["review"]["v2Content"] = content
            project["review"]["v2Reason"] = payload.get("reason", "").strip()
            version_id = "version-" + uuid.uuid4().hex[:12]
            with connect() as conn:
                material = conn.execute(
                    "SELECT id FROM materials WHERE project_id=? AND archived_at IS NULL ORDER BY created_at LIMIT 1",
                    (project["id"],),
                ).fetchone()
                previous = conn.execute(
                    "SELECT id FROM material_versions WHERE project_id=? ORDER BY created_at DESC LIMIT 1",
                    (project["id"],),
                ).fetchone()
                conn.execute(
                    "INSERT INTO material_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        version_id,
                        material["id"] if material else project["id"],
                        project["id"],
                        2,
                        content,
                        user["id"],
                        now(),
                        previous["id"] if previous else None,
                    ),
                )
            save_project(
                user["id"],
                project,
                "version.v2.submitted",
                {"versionId": version_id, "content": content},
            )
        elif action == "reviews/start":
            require_role(user["id"], project["id"], {"reviewer"})
            if not project["review"].get("v2Submitted"):
                raise ValueError("负责人还没有提交改进版本")
            with connect() as conn:
                latest_version = conn.execute(
                    "SELECT created_by FROM material_versions WHERE project_id=? ORDER BY created_at DESC LIMIT 1",
                    (project["id"],),
                ).fetchone()
            if latest_version and latest_version["created_by"] == user["id"]:
                raise ValueError("执行者不能为自己的改进版本复核")
            project["review"]["status"] = "复核进行中"
            project["review"]["total"] = self.rubric_item_count(project["id"]) or 4
            if len(project["review"].get("criteria", [])) != project["review"]["total"]:
                project["review"]["criteria"] = ["pending"] * project["review"]["total"]
                project["review"]["completed"] = 0
            save_project(user["id"], project, "review.started")
        elif action == "reviews/criteria":
            require_role(user["id"], project["id"], {"reviewer"})
            index, value = int(payload.get("index", -1)), payload.get("value")
            total = self.rubric_item_count(project["id"]) or 4
            if (
                not project["review"]["v2Submitted"]
                or index not in range(total)
                or value not in {"pass", "fail", "unknown"}
            ):
                raise ValueError("当前版本还不能检查")
            with connect() as conn:
                latest_version = conn.execute(
                    "SELECT created_by FROM material_versions WHERE project_id=? ORDER BY created_at DESC LIMIT 1",
                    (project["id"],),
                ).fetchone()
            if latest_version and latest_version["created_by"] == user["id"]:
                raise ValueError("执行者不能为自己的改进版本复核")
            if len(project["review"].get("criteria", [])) != total:
                project["review"]["criteria"] = ["pending"] * total
            project["review"]["total"] = total
            project["review"]["criteria"][index] = value
            project["review"]["completed"] = sum(v == "pass" for v in project["review"]["criteria"])
            project["review"]["status"] = (
                "全部 PASS · 可进入迁移"
                if all(v == "pass" for v in project["review"]["criteria"])
                else "复核进行中"
            )
            if all(v == "pass" for v in project["review"]["criteria"]) and project.get("actions"):
                project["actions"][0]["status"] = "已通过复核"
            if value == "fail":
                project["review"]["status"] = "需要返工"
                if project.get("actions"):
                    project["actions"][0]["status"] = "需返工"
            elif value == "unknown" and project.get("actions"):
                project["actions"][0]["status"] = "等待补证据"
            with connect() as conn:
                version = conn.execute(
                    "SELECT id FROM material_versions WHERE project_id=? ORDER BY created_at DESC LIMIT 1",
                    (project["id"],),
                ).fetchone()
                review = conn.execute(
                    "SELECT id FROM reviews WHERE project_id=? AND reviewer_id=? ORDER BY created_at DESC LIMIT 1",
                    (project["id"], user["id"]),
                ).fetchone()
                review_id = review["id"] if review else "review-" + uuid.uuid4().hex[:12]
                rubric_row = conn.execute(
                    "SELECT items_json FROM rubrics WHERE project_id=? ORDER BY version DESC LIMIT 1",
                    (project["id"],),
                ).fetchone()
                rubric_items = json.loads(rubric_row["items_json"]) if rubric_row else []
                rubric_item_id = (
                    rubric_items[index].get("id", f"item-{index + 1}")
                    if index < len(rubric_items)
                    else f"item-{index + 1}"
                )
                if not review:
                    conn.execute(
                        "INSERT INTO reviews VALUES (?, ?, ?, ?, 'in_progress', ?, NULL)",
                        (
                            review_id,
                            project["id"],
                            version["id"] if version else "",
                            user["id"],
                            now(),
                        ),
                    )
                conn.execute(
                    "INSERT INTO review_items VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        f"review-item-{uuid.uuid4().hex[:12]}",
                        review_id,
                        rubric_item_id,
                        value,
                        payload.get("note", ""),
                        now(),
                    ),
                )
            save_project(user["id"], project, "review.criteria", payload)
        elif action == "reviews/finish":
            require_role(user["id"], project["id"], {"reviewer"})
            if not all(v == "pass" for v in project["review"]["criteria"]):
                raise ValueError("还有未通过或证据不足的检查项")
            project["review"]["status"] = "成果复核 PASS"
            project["transfer"]["status"] = "可开始"
            project["transfer"]["progress"] = 15
            with connect() as conn:
                conn.execute(
                    "UPDATE reviews SET status='passed', completed_at=? WHERE project_id=? AND reviewer_id=?",
                    (now(), project["id"], user["id"]),
                )
            save_project(user["id"], project, "review.finished")
        elif action == "transfer/advance":
            require_role(user["id"], project["id"], {"owner", "member"})
            progress = project["transfer"]["progress"]
            if progress < 40:
                progress, status = 40, "迁移试做进行中"
            elif progress < 80:
                progress, status = 80, "待迁移复核"
            else:
                progress, status = 100, "方法已验证"
            project["transfer"].update(progress=progress, status=status)
            with connect() as conn:
                conn.execute(
                    "INSERT INTO transfer_checks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        "transfer-" + uuid.uuid4().hex[:12],
                        project["id"],
                        status,
                        payload.get("explanation", ""),
                        payload.get("materialId"),
                        payload.get("promptSummary", ""),
                        "passed" if progress == 100 else "in_progress",
                        user["id"],
                        now(),
                    ),
                )
            save_project(user["id"], project, "transfer.advanced")
        else:
            return self.send_json({"error": "接口不存在"}, 404)
        return self.send_json({"project": project})

    def static(self, path):
        rel = "index.html" if path in ("", "/") else path.lstrip("/")
        candidate = (FRONTEND / rel).resolve()
        if FRONTEND not in candidate.parents and candidate != FRONTEND:
            return self.send_json({"error": "禁止访问"}, 403)
        if not candidate.exists() or not candidate.is_file():
            candidate = FRONTEND / "index.html"
        content = candidate.read_bytes()
        types = {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".json": "application/json",
            ".svg": "image/svg+xml",
        }
        self.send_response(200)
        self.send_header("Content-Type", types.get(candidate.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


def run(host: str = "127.0.0.1", port: int = 8787):
    init_db()
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"砺程已启动: http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    run(
        host=os.getenv("LICHENG_HOST", "127.0.0.1"), port=int(os.getenv("LICHENG_PORT", "8787"))
    )
