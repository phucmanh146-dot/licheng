"""Persistent three-role CC window progress for the team orchestrator.

A window can explicitly heartbeat through the HTTP API. When no real window has
reported yet, the board still shows a clearly-labelled state derived from the
project workflow; derived state is never presented as a live terminal heartbeat.
"""
from __future__ import annotations

import sqlite3
import time
import uuid
from pathlib import Path

import learning_agent as agent

DB = Path(agent.DATA) / "team-cc-progress.sqlite3"
ROLES = ("A", "B", "C")
ROLE_NAMES = {"A": "A · 诊断/复核", "B": "B · 行动/排程", "C": "C · 队长总调度"}
STALE_SECONDS = 300


def _conn():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    conn.execute("""CREATE TABLE IF NOT EXISTS cc_windows(
        project_id TEXT NOT NULL,
        window_id TEXT NOT NULL,
        role TEXT NOT NULL,
        label TEXT NOT NULL,
        stage TEXT NOT NULL,
        status TEXT NOT NULL,
        current_item TEXT NOT NULL DEFAULT '',
        blocker TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'reported',
        updated REAL NOT NULL,
        PRIMARY KEY(project_id, window_id)
    )""")
    return conn


def _role(value):
    value = str(value or "").upper().strip()
    if value not in ROLES:
        raise ValueError("role 必须是 A、B 或 C")
    return value


def register(data):
    project_id = str(data.get("project_id", "")).strip()
    role = _role(data.get("role"))
    if not project_id:
        raise ValueError("缺少 project_id")
    window_id = str(data.get("window_id") or f"cc-{role.lower()}-{uuid.uuid4().hex[:10]}")
    label = str(data.get("label") or ROLE_NAMES[role])[:120]
    now = time.time()
    with _conn() as conn:
        conn.execute("""INSERT INTO cc_windows(project_id,window_id,role,label,stage,status,current_item,blocker,source,updated)
            VALUES(?,?,?,?,?,'unhandled','','','reported',?)
            ON CONFLICT(project_id,window_id) DO UPDATE SET role=excluded.role,label=excluded.label,updated=excluded.updated""",
            (project_id, window_id, role, label, "待领取", now))
    return {"ok": True, "project_id": project_id, "window_id": window_id, "role": role, "label": label}


def heartbeat(data):
    project_id = str(data.get("project_id", "")).strip()
    window_id = str(data.get("window_id", "")).strip()
    role = _role(data.get("role"))
    if not project_id or not window_id:
        raise ValueError("缺少 project_id 或 window_id")
    label = str(data.get("label") or ROLE_NAMES[role])[:120]
    stage = str(data.get("stage") or "执行中")[:160]
    status = str(data.get("status") or "active").strip()
    if status not in {"unhandled", "active", "blocked", "waiting_review", "done", "idle"}:
        raise ValueError("status 不支持")
    current_item = str(data.get("current_item") or "")[:500]
    blocker = str(data.get("blocker") or "")[:800]
    now = time.time()
    with _conn() as conn:
        conn.execute("""INSERT INTO cc_windows(project_id,window_id,role,label,stage,status,current_item,blocker,source,updated)
            VALUES(?,?,?,?,?,?,?,?, 'reported', ?)
            ON CONFLICT(project_id,window_id) DO UPDATE SET role=excluded.role,label=excluded.label,
            stage=excluded.stage,status=excluded.status,current_item=excluded.current_item,
            blocker=excluded.blocker,source='reported',updated=excluded.updated""",
            (project_id, window_id, role, label, stage, status, current_item, blocker, now))
    return {"ok": True, "window_id": window_id, "updated": now}


def _derived(project, role):
    tasks = list((project.get("plan") or {}).get("tasks") or [])
    counts = {s: sum(1 for t in tasks if t.get("status") == s) for s in
              ("candidate", "scheduled", "in_progress", "pending_review", "completed", "blocked")}
    diagnosis = project.get("diagnosis")
    proposal = project.get("proposal")
    plan = project.get("plan")
    if role == "A":
        if not diagnosis:
            return "等待真实材料诊断", "unhandled", "读取目标、材料版本并输出有出处 gap", ""
        waiting = [t for t in tasks if t.get("status") == "pending_review" and not t.get("external_review")]
        if waiting:
            return "等待 A 复核 V2", "waiting_review", f"{len(waiting)} 项真实成果待逐条件复核", ""
        return "诊断已交付", "idle", f"{len(diagnosis.get('gaps') or [])} 个 gap；等待真实执行反馈", ""
    if role == "B":
        if not diagnosis:
            return "等待 A 诊断", "unhandled", "收到真实 gap 前不生成通用计划", ""
        if not plan and not proposal:
            return "待生成可执行行动卡", "unhandled", "把真实 gap 转为微步骤、失败下一步和排程", ""
        if proposal:
            return "计划待队长确认", "waiting_review", "候选计划已生成，未确认前不生效", ""
        return "规划已采用", "idle", f"进行中 {counts['in_progress']} · 卡住 {counts['blocked']} · 待验收 {counts['pending_review']}", ""
    dispatch = project.get("dispatch_status") or {}
    if dispatch.get("active"):
        stage = (dispatch.get("last_run") or {}).get("stage") or dispatch.get("stage") or "调度"
        return f"总调度执行中 · {stage}", "active", "保存版本、交接、确认与失败恢复", ""
    if counts["blocked"]:
        return "全局存在卡点", "blocked", f"{counts['blocked']} 项任务卡住", "优先处理 blocker，禁止整套计划重来"
    return "总控待推进", "idle", f"进行中 {counts['in_progress']} · 待验收 {counts['pending_review']} · 已验收 {counts['completed']}", ""


def board(project):
    project_id = str(project.get("project_id") or "")
    now = time.time()
    with _conn() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM cc_windows WHERE project_id=? ORDER BY role,updated DESC", (project_id,))]
    windows = []
    for role in ROLES:
        reported = [r for r in rows if r["role"] == role]
        if reported:
            for r in reported:
                age = max(0, now - float(r["updated"]))
                r["heartbeat_age_seconds"] = round(age)
                r["live"] = age <= STALE_SECONDS
                if age > STALE_SECONDS and r["status"] == "active":
                    r["status"] = "idle"
                    r["stage"] = "窗口心跳已过期"
                windows.append(r)
        else:
            stage, status, item, blocker = _derived(project, role)
            windows.append({"project_id": project_id, "window_id": f"cc-{role.lower()}-{project_id[:8]}",
                            "role": role, "label": ROLE_NAMES[role], "stage": stage, "status": status,
                            "current_item": item, "blocker": blocker, "source": "derived",
                            "updated": None, "heartbeat_age_seconds": None, "live": False})
    reminders = []
    for w in windows:
        if w["status"] in {"blocked", "unhandled"}:
            reminders.append({"window_id": w["window_id"], "role": w["role"], "status": w["status"],
                              "message": w.get("blocker") or w.get("current_item") or w.get("stage")})
    return {"ok": True, "project_id": project_id, "generated_at": now, "windows": windows,
            "reminders": reminders,
            "counts": {k: sum(1 for w in windows if w["status"] == k) for k in
                       ("unhandled", "active", "blocked", "waiting_review", "done", "idle")}}
