"""Schedule-only execution path for deadline and unscheduled-task events.

Kept separate from the LangGraph research module so deterministic capacity
scheduling can be tested and run without invoking retrieval or model nodes.
"""
import copy
from datetime import datetime, date, timedelta

import period_planner
import team_orchestrator as team
import platform_store as store


def execute(run, payload):
    """Replan from saved user-confirmed availability; never invent free time."""
    project_id = payload.get("project_id")
    project = team.state(project_id)
    if project.get("mode") != "live" or not project.get("plan") or project.get("plan_stale"):
        raise ValueError("SCHEDULE_EVENT_REQUIRES_LIVE_ADOPTED_PLAN")
    old_plan = project["plan"]
    saved = old_plan.get("replanning_context")
    reasons = []
    if not isinstance(saved, dict):
        reasons.append("尚未保存经过用户确认的可用时间窗；请先在周期安排页填写真实空档")
        result = {
            "preview_only": True, "auto_adopted": False, "approval_required": True,
            "approval_reasons": reasons, "needs_availability_update": True,
            "event_type": payload.get("event_type"), "expected_version": project["version"],
            "preserved_context": True,
        }
        store.event(run["id"], "schedule_capacity_gate", "waiting", {"reasons": reasons})
        store.finish(run["id"], run["lease_token"], "awaiting_confirmation", result)
        return result

    settings = copy.deepcopy(saved)
    now = datetime.now(period_planner.TZ).replace(second=0, microsecond=0)
    today = now.date()
    try:
        end = date.fromisoformat(settings.get("period_end", ""))
        start = date.fromisoformat(settings.get("period_start", today.isoformat()))
    except (TypeError, ValueError):
        end, start = today - timedelta(days=1), today
    if end < today:
        reasons.append("上次确认的可用时间窗已过期；需要刷新未来空档，不能把旧空档当成现在仍可用")
    settings["period_start"] = max(today, start).isoformat()
    settings["windows"] = [x for x in settings.get("windows", []) if x.get("date", "") >= settings["period_start"]]
    settings["busy"] = [x for x in settings.get("busy", []) if x.get("date", "") >= settings["period_start"]]
    settings["full_dates"] = [x for x in settings.get("full_dates", []) if x >= settings["period_start"]]

    member_id = settings.get("member_id")
    tasks = old_plan.get("tasks", [])
    active = [t for t in tasks if t.get("status") not in ("completed", "pending_review")]
    owned = [t for t in active if member_id in (t.get("owner_ids") or [])]
    other_owner = [t.get("task_id") for t in active if member_id not in (t.get("owner_ids") or [])]
    if other_owner:
        reasons.append("有其他成员负责的未完成任务，需要按成员分别联合排程：" + "、".join(other_owner[:8]))
    if len(owned) > 100:
        reasons.append("当前负责人未完成任务超过100项，需要分批排程")
    settings["selected_task_ids"] = [t["task_id"] for t in owned[:100]]
    remaining = settings.get("remaining_minutes") or {}
    for task in owned:
        if task.get("status") == "in_progress" and task["task_id"] not in remaining:
            # Conservative fallback: use the estimate upper bound; interruption
            # does not imply progress and must not shrink the remaining estimate.
            remaining[task["task_id"]] = task["estimate_minutes_range"][1]
    settings["remaining_minutes"] = remaining

    if reasons or not settings["windows"] or not settings["selected_task_ids"]:
        if not settings["windows"]:
            reasons.append("保存的周期内没有未来可用空档；请补充真实空档")
        if not settings["selected_task_ids"]:
            reasons.append("当前负责人没有可自动排程的未完成任务")
        result = {
            "preview_only": True, "auto_adopted": False, "approval_required": True,
            "approval_reasons": reasons, "needs_availability_update": True,
            "event_type": payload.get("event_type"), "expected_version": project["version"],
            "outside_member_tasks": other_owner,
        }
        store.event(run["id"], "schedule_capacity_gate", "waiting", {"reasons": reasons})
        store.finish(run["id"], run["lease_token"], "awaiting_confirmation", result)
        return result

    plan = period_planner.compute(project, settings, now=now)
    current = team.propose({
        "project_id": project["project_id"], "expected_version": project["version"],
        "plan": plan, "reason": "DDL/待安排事件触发：复用已确认空档，仅重排受影响任务",
    })
    summary = plan.get("schedule_summary") or {}
    result = {
        "preview_only": True, "auto_adopted": False,
        "approval_required": not bool(summary.get("fits")),
        "approval_reasons": (["当前容量不足，需用户决定是否暂缓低重要性任务"] if not summary.get("fits") else []),
        "proposal_id": current["proposal"]["id"], "expected_version": current["version"],
        "plan": plan, "event_type": payload.get("event_type"),
        "soft_defer_only": True, "never_delete_or_mark_complete": True,
    }
    if summary.get("fits"):
        adopted = team.apply_automated({
            "project_id": current["project_id"], "expected_version": current["version"],
            "proposal_id": current["proposal"]["id"],
        })
        result.update({
            "preview_only": False, "auto_adopted": True, "approval_required": False,
            "adopted_plan_version": adopted["plan"]["plan_version"],
            "expected_version": adopted["version"],
        })
        store.event(run["id"], "schedule_auto_adoption", "completed", {
            "plan_version": adopted["plan"]["plan_version"], "project_version": adopted["version"]})
        store.finish(run["id"], run["lease_token"], "succeeded", result)
    else:
        store.event(run["id"], "schedule_capacity_gate", "waiting", {
            "reasons": result["approval_reasons"], "unallocated": summary.get("unallocated", [])})
        store.finish(run["id"], run["lease_token"], "awaiting_confirmation", result)
    return result
