"""Event ingress for 上岸鸭; reuses the existing durable LangGraph run queue.

Events are data, never executable instructions. The queue and workflow stay in the
existing platform_store/research_graph stack (PostgreSQL in engineering deploy,
SQLite in local mode); no parallel agent product or second task database.
"""
import hashlib
import json

import platform_store
import team_orchestrator as team

ALLOWED_EVENTS = {
    "user_signal", "material_added", "task_created", "task_blocked",
    "schedule_changed", "deadline_changed", "evidence_submitted",
    "checkin_received", "project_resumed",
}
MAX_PAYLOAD_CHARS = 8000


def _required_text(data, key, limit=2000):
    value = data.get(key)
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > limit:
        raise ValueError(key + " 必须是有效文字")
    return value.strip()


def submit(data):
    """Accept one meaningful project event and enqueue exactly one durable run."""
    if not isinstance(data, dict):
        raise ValueError("事件必须是 JSON 对象")
    project_id = _required_text(data, "project_id", 160)
    event_type = _required_text(data, "event_type", 64)
    if event_type not in ALLOWED_EVENTS:
        raise ValueError("不支持的事件类型")
    expected_version = data.get("expected_version")
    if type(expected_version) is not int or expected_version < 1:
        raise ValueError("expected_version 必须是正整数")
    project = team.state(project_id)
    if project.get("mode") != "live":
        raise ValueError("自动运行只接受 live 项目；Demo 不会冒充真实执行")
    if project["version"] != expected_version:
        raise team.Conflict("项目版本已变化，请刷新后重新提交事件")
    query = _required_text(data, "query", 2000)
    payload = data.get("payload") or {}
    if not isinstance(payload, dict):
        raise ValueError("payload 必须是 JSON 对象")
    payload_text = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    if len(payload_text) > MAX_PAYLOAD_CHARS:
        raise ValueError("事件附加信息超过 8000 字符")
    source = str(data.get("source") or "workbench")[:80]
    supplied_id = data.get("event_id") or data.get("idempotency_key")
    if supplied_id is not None:
        supplied_id = _required_text({"id": supplied_id}, "id", 156)
        dedupe = "evt:" + supplied_id
    else:
        fingerprint = json.dumps(
            [project_id, expected_version, event_type, query, payload],
            ensure_ascii=False, sort_keys=True, separators=(",", ":")
        )
        dedupe = "evt:" + hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()
    metadata = {
        "event_type": event_type,
        "source": source,
        "event_id": dedupe,
        "payload": payload,
        "auto_advance": True,
    }
    run_id = platform_store.enqueue(
        project, "local-agent", dedupe, query, metadata=metadata
    )
    return {
        "accepted": True,
        "run_id": run_id,
        "event_id": dedupe,
        "event_type": event_type,
        "status": "queued",
        "project_id": project_id,
        "note": "已进入现有持久化 LangGraph 队列；执行结果以运行记录和真实证据为准。",
    }


def status(run_id):
    return platform_store.get_run(_required_text({"id": run_id}, "id", 160))
