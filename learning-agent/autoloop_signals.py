"""Signal-to-run adapter for the existing durable LangGraph worker.

This is the light Autoloop control plane: business mutations emit stable events;
the existing queue/worker owns execution. No second agent process or task database.
"""
import re

import platform_store as store

MAX_FIELD = 240


def _small_text(value):
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", value).strip()[:MAX_FIELD]


def classify(operation, data):
    """Return (event_type, reason) only for meaningful state changes."""
    action = data.get("action")
    if operation == "artifact-import":
        purpose = data.get("purpose", "input")
        if purpose == "input":
            return "material_added", "已登记新的诊断输入材料"
        if purpose == "submission":
            return "evidence_submitted", "已提交新的成果证据"
    if operation == "feedback":
        if action == "block":
            return "task_blocked", "任务进入卡壳状态"
        if action == "change":
            change = data.get("availability_change") or {}
            return ("checkin_received" if any(k in change for k in ("energy", "fatigue", "available_minutes"))
                    else "schedule_changed"), "执行反馈或可用时间发生变化"
        if action == "submit":
            return "evidence_submitted", "任务提交了新成果"
    if operation == "recovery-pause":
        return ("checkin_received" if data.get("reason") == "tired" else "task_blocked"), "任务已保存中断现场"
    if operation == "recovery-resume":
        return "project_resumed", "用户请求恢复原任务"
    if operation == "runtime-focus":
        return "checkin_received", "收到当前执行状态反馈"
    if operation == "context":
        context = data.get("project_context") or {}
        return ("deadline_changed" if context.get("deadline") else "schedule_changed"), "项目约束或截止信息已更新"
    return None


def enqueue_after_operation(project, user_id, operation, data):
    """Queue one auto-advancing run after an authenticated domain mutation.

    Existing registered input artifacts are reused by reference. No upload is
    repeated. Events are data only; their payload cannot grant tools or authority.
    """
    if not isinstance(project, dict) or project.get("mode") != "live":
        return None
    classified = classify(operation, data if isinstance(data, dict) else {})
    if not classified:
        return None
    event_type, reason = classified
    inputs = [a for a in project.get("stored_artifacts", []) if a.get("purpose") == "input"]
    if not inputs:
        return None
    project_id = project.get("project_id")
    version = project.get("version")
    if not isinstance(project_id, str) or type(version) is not int or version < 1:
        return None
    action = _small_text(data.get("action")) or "update"
    key = f"autoloop:{project_id}:{version}:{event_type}:{action}"
    query = (
        "请基于当前项目已登记的输入材料、历史决定和最新状态信号，"
        "只分析本次变化影响的部分；复用已有材料版本，不要求用户重新上传。"
        "按证据诊断、依赖、DDL与现有排期判断下一步。"
        f"项目目标：{_small_text(project.get('goal')) or '读取项目记录'}。"
        f"本次信号：{reason}。"
    )
    payload = {
        "event_type": event_type,
        "source_operation": operation,
        "action": action,
        "task_id": _small_text(data.get("task_id")),
        "reason": _small_text(data.get("reason") or data.get("note")),
        "project_version": version,
        "input_artifacts": [
            {"artifact_id": a.get("artifact_id"), "artifact_version": a.get("artifact_version"),
             "sha256": a.get("sha256")}
            for a in inputs
        ],
        "untrusted_user_data": True,
    }
    metadata = {
        "event_type": event_type,
        "source": "authenticated_workbench",
        "event_id": key,
        "payload": payload,
        "auto_advance": True,
    }
    run_id = store.enqueue(project, user_id, key, query, metadata=metadata)
    return {"event_type": event_type, "event_id": key, "run_id": run_id, "status": "queued"}
