"""Deterministic deadline decision policy for 上岸鸭.

This module ranks work and creates decision packets; it never deletes or completes
a task. The caller must persist user choices and pass them to the existing planner.
"""
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

QUADRANT_ORDER = {"many_important": 0, "few_important": 1,
                  "many_unimportant": 2, "few_unimportant": 3}
IMPORTANT = {"critical", "high", "important", "重要", "高"}
UNIMPORTANT = {"low", "normal", "minor", "not_important", "不重要", "低"}


def _local_now(now, timezone_name):
    zone = ZoneInfo(timezone_name or "Asia/Shanghai")
    if now is None:
        return datetime.now(zone)
    if now.tzinfo is None:
        raise ValueError("now 必须包含时区")
    return now.astimezone(zone)


def deadline_review_due(deadline, now=None, timezone_name="Asia/Shanghai"):
    """Fire from D-3 15:00 local time until the deadline, allowing late watcher ticks."""
    try:
        due_date = date.fromisoformat(str(deadline)[:10])
    except (TypeError, ValueError):
        raise ValueError("deadline 必须是 YYYY-MM-DD 或 ISO 日期时间")
    current = _local_now(now, timezone_name)
    trigger = datetime.combine(due_date - timedelta(days=3), time(15, 0),
                               tzinfo=ZoneInfo(timezone_name or "Asia/Shanghai"))
    due_end = datetime.combine(due_date, time.max, tzinfo=trigger.tzinfo)
    return trigger <= current <= due_end


def _remaining_minutes(task):
    for key in ("remaining_minutes", "remainingMinutes", "minutes"):
        value = task.get(key)
        if type(value) is int and value >= 0:
            return value
    bounds = task.get("estimate_minutes_range")
    if isinstance(bounds, list) and len(bounds) == 2 and type(bounds[1]) is int:
        return bounds[1]
    if type(task.get("estimate_minutes")) is int:
        return task["estimate_minutes"]
    return 0


def _step_count(task):
    for key in ("micro_steps", "actions", "steps"):
        value = task.get(key)
        if isinstance(value, list):
            return len(value)
    return 0


def _important(task):
    if task.get("is_important") is True:
        return True
    if task.get("is_important") is False:
        return False
    value = str(task.get("importance") or task.get("priority_level") or "").strip().lower()
    if value in IMPORTANT:
        return True
    if value in UNIMPORTANT:
        return False
    # Do not infer importance from numeric priority whose direction may differ by module.
    return None


def classify_quadrant(task, heavy_minutes=180, many_steps=4):
    """Classify workload x importance; unknown importance stays explicit."""
    minutes = _remaining_minutes(task)
    many = minutes >= heavy_minutes or _step_count(task) >= many_steps
    important = _important(task)
    if important is None:
        return "importance_unconfirmed"
    if many and important:
        return "many_important"
    if not many and important:
        return "few_important"
    if many and not important:
        return "many_unimportant"
    return "few_unimportant"


def rank_tasks(tasks):
    """Q1 -> Q3 -> Q2 -> Q4; keep unknown-importance tasks visible, never drop them."""
    rows = []
    for task in tasks:
        if not isinstance(task, dict):
            continue
        if task.get("status") in ("completed", "pending_review", "done"):
            continue
        quadrant = classify_quadrant(task)
        rows.append({
            "task_id": task.get("task_id") or task.get("id"),
            "title": task.get("title") or task.get("name") or "未命名任务",
            "quadrant": quadrant,
            "remaining_minutes": _remaining_minutes(task),
            "deadline": task.get("deadline"),
            "reserve_next_day": quadrant == "many_unimportant",
            "drop_candidate": quadrant in ("few_unimportant", "many_unimportant"),
            "status": task.get("status", "todo"),
        })
    rows.sort(key=lambda row: (
        QUADRANT_ORDER.get(row["quadrant"], 4),
        str(row.get("deadline") or "9999-12-31"),
        -row["remaining_minutes"],
        str(row["task_id"] or ""),
    ))
    return rows


def capacity_decision(tasks, available_minutes, transition_buffer_minutes=10):
    """Return a transparent capacity packet and soft-drop candidates.

    Soft-drop means defer/remove from this sprint only. It never deletes a task,
    changes its deadline, or marks it complete.
    """
    if type(available_minutes) is not int or available_minutes < 0:
        raise ValueError("available_minutes 必须是非负整数")
    if type(transition_buffer_minutes) is not int or not 0 <= transition_buffer_minutes <= 120:
        raise ValueError("transition_buffer_minutes 必须在 0 至 120 之间")
    ranked = rank_tasks(tasks)
    work = sum(row["remaining_minutes"] for row in ranked)
    transitions = max(0, len(ranked) - 1)
    buffer = transitions * transition_buffer_minutes
    required = work + buffer
    return {
        "tasks": ranked,
        "work_minutes": work,
        "transition_buffer_minutes": buffer,
        "transition_count": transitions,
        "available_minutes": available_minutes,
        "shortfall_minutes": max(0, required - available_minutes),
        "fits": required <= available_minutes,
        "needs_user_decision": required > available_minutes,
        "decision_type": "soft_defer_tasks" if required > available_minutes else None,
        "drop_candidates": [row for row in ranked if row["drop_candidate"]],
        "protected_tasks": [row for row in ranked if row["quadrant"] in ("many_important", "few_important")],
        "rule": "先排任务多且重要，再排任务少但重要；任务多但不重要安排次日固定时段；任务少且不重要作为优先舍弃候选。所有舍弃均为本轮延期，不删除原任务。",
    }


def unscheduled_triage_due(created_at, now=None):
    """Unscheduled work must be triaged within 24 hours of being recorded."""
    try:
        created = datetime.fromisoformat(created_at)
    except (TypeError, ValueError):
        raise ValueError("created_at 必须是带时区的 ISO 日期时间")
    if created.tzinfo is None:
        raise ValueError("created_at 必须包含时区")
    current = now or datetime.now(created.tzinfo)
    if current.tzinfo is None:
        raise ValueError("now 必须包含时区")
    return current.astimezone(created.tzinfo) >= created + timedelta(hours=24)


def next_day_reservations(tasks, next_day):
    """Return fixed-slot reservation requests for high-workload, lower-importance work."""
    return [
        {"task_id": row["task_id"], "date": next_day,
         "minutes": min(60, row["remaining_minutes"]),
         "kind": "fixed_reservation"}
        for row in rank_tasks(tasks) if row["reserve_next_day"]
    ]
