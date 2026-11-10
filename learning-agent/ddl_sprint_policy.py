"""DDL T-3 fallback policy adapter for the existing B capacity planner.

This module does not allocate calendar slots itself. It classifies missed T-3
work, protects fixed commitments, and returns a deterministic forced queue
for the existing capacity planner / proposal UI to allocate.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any


def _parse_deadline(value: str, tz) -> datetime | None:
    if not isinstance(value, str) or not value.strip() or value == "待成员确认":
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=tz)
    return parsed.astimezone(tz)


def _remaining_minutes(task: dict[str, Any]) -> int:
    if isinstance(task.get("remaining_minutes"), int):
        return max(0, task["remaining_minutes"])
    if isinstance(task.get("remainingMinutes"), int):
        return max(0, task["remainingMinutes"])
    estimate = task.get("estimate_minutes_range", [task.get("estimate", 30), task.get("estimate", 30)])
    upper = estimate[1] if isinstance(estimate, list) and len(estimate) == 2 else task.get("estimate", 30)
    actual = task.get("actual_minutes", 0)
    return max(0, int(upper) - int(actual or 0))


def _importance(task: dict[str, Any]) -> int:
    value = task.get("importance", task.get("priority", 0))
    if value in ("重要", "high", "critical"):
        return 1
    if value in ("不重要", "low"):
        return 0
    return int(bool(task.get("is_important", task.get("isImportant", False))))


def _large(task: dict[str, Any]) -> int:
    size = task.get("task_size", task.get("taskSize", task.get("sizeClass", "")))
    if size in ("大", "large"):
        return 1
    if size in ("少", "小", "small"):
        return 0
    return int(_remaining_minutes(task) >= 180)


def _is_fixed(task: dict[str, Any]) -> bool:
    return task.get("task_mode") in ("fixed", "daily_fixed") or task.get("taskMode") in (
        "fixed", "daily_fixed"
    ) or bool(task.get("locked"))


def _is_done(task: dict[str, Any]) -> bool:
    return task.get("status") in {
        "completed", "pending_review", "验收通过", "已完成", "已归档", "已舍弃"
    }


def evaluate_t3_fallback(
    tasks: list[dict[str, Any]],
    time_blocks: list[dict[str, Any]],
    now: datetime,
    daily_capacity_minutes: dict[str, int],
    *,
    protected_task_ids: set[str] | None = None,
) -> dict[str, Any]:
    """Return missed T-3 tasks for D-2 fallback, plus explicit overload decisions.

    Trigger: task deadline is within 72h and the T-3 15:00 checkpoint has passed.
    A task counts as planned only when it has future executable time blocks before
    its deadline. A milestone forecast or a status label alone is not a booking.
    """
    if now.tzinfo is None:
        raise ValueError("now 必须包含时区")
    protected_task_ids = protected_task_ids or set()
    tz = now.tzinfo
    planned_minutes: dict[str, int] = {}
    for block in time_blocks:
        try:
            start = datetime.fromisoformat(block["start"])
            end = datetime.fromisoformat(block["end"])
        except (KeyError, TypeError, ValueError):
            continue
        if start.tzinfo is None or end.tzinfo is None or end <= start:
            continue
        task_id = block.get("task_id")
        if task_id:
            planned_minutes[task_id] = planned_minutes.get(task_id, 0) + max(
                0, int((end - max(start, now)).total_seconds() // 60)
            )

    candidates = []
    by_id = {t.get("task_id", t.get("id")): t for t in tasks}
    for task in tasks:
        task_id = task.get("task_id", task.get("id"))
        if not task_id or _is_done(task) or _is_fixed(task):
            continue
        deadline = _parse_deadline(task.get("deadline") or task.get("deadline_at") or "", tz)
        if deadline is None or deadline <= now or deadline - now > timedelta(hours=72):
            continue
        remaining = _remaining_minutes(task)
        scheduled = planned_minutes.get(task_id, 0)
        if remaining <= scheduled:
            continue
        t3_checkpoint = deadline - timedelta(days=3)
        if now < t3_checkpoint.replace(hour=15, minute=0, second=0, microsecond=0):
            continue
        candidates.append({
            "task_id": task_id,
            "title": task.get("title", task_id),
            "deadline": deadline.isoformat(),
            "remaining_minutes": max(0, remaining - scheduled),
            "already_scheduled_minutes": scheduled,
            "importance": _importance(task),
            "large": _large(task),
            "quadrant": (
                "large_important" if _large(task) and _importance(task) else
                "small_important" if _importance(task) else
                "large_unimportant" if _large(task) else "small_unimportant"
            ),
            "fixed": False,
            "protected": task_id in protected_task_ids,
            "fallback_day": (deadline.date() - timedelta(days=2)).isoformat(),
            "fallback_reason": "T-3 15:00 检查发现漏排；不回填T-3，兜底进入T-2",
        })

    # Sort: important-large, important-small, unimportant-large, unimportant-small;
    # within a quadrant, earlier deadline and larger remaining work come first.
    candidates.sort(key=lambda x: (
        -x["importance"], -x["large"], x["deadline"], -x["remaining_minutes"], x["task_id"]
    ))

    demand_by_day: dict[str, int] = {}
    for item in candidates:
        day = item["fallback_day"]
        demand_by_day[day] = demand_by_day.get(day, 0) + item["remaining_minutes"]

    overload = []
    for day, demand in sorted(demand_by_day.items()):
        capacity = max(0, int(daily_capacity_minutes.get(day, 0)))
        if demand > capacity:
            overload.append({
                "date": day,
                "demand_minutes": demand,
                "capacity_minutes": capacity,
                "overload_minutes": demand - capacity,
                "required_decision": ["compress", "defer_once", "discard"],
                "message": "新增T-3兜底任务后T-2容量超限；需压缩、最多顺延一档或主动舍弃",
            })

    return {
        "triggered_at": now.isoformat(),
        "policy": "t3-15h-check-to-t2-fallback",
        "forced_queue": candidates,
        "demand_by_day": demand_by_day,
        "overload": overload,
        "rules": [
            "固定时间任务、每日固定任务和锁定任务不进入兜底移动队列",
            "T-3 15:00是查漏检查点，不是强制回填点",
            "漏排任务下沉到T-2，按工作量和重要性排序",
            "计划状态或里程碑预测不等于真实时间块",
            "超载时由用户选择压缩、最多顺延一档或主动舍弃；系统不自动删除",
        ],
    }
