"""Deterministic, dependency-aware daily planning. No model decides date arithmetic."""
from copy import deepcopy
from datetime import date, timedelta


def day(value):
    try:
        return date.fromisoformat(str(value))
    except (ValueError, TypeError):
        raise ValueError('日期必须是 YYYY-MM-DD')


def validate_tasks(tasks):
    if not isinstance(tasks, list) or not 1 <= len(tasks) <= 60:
        raise ValueError('路线需要 1 至 60 个任务')
    ids = set()
    for t in tasks:
        if not isinstance(t, dict) or not isinstance(t.get('id'), str) or not t['id'] or t['id'] in ids:
            raise ValueError('任务编号缺失或重复')
        ids.add(t['id'])
        if not str(t.get('title', '')).strip():
            raise ValueError('任务标题不能为空')
        if type(t.get('minutes')) is not int or not 1 <= t['minutes'] <= 1440:
            raise ValueError('单个任务预计用时应为 1 至 1440 分钟')
        if t.get('deadline'):
            day(t['deadline'])
        if not isinstance(t.get('dependsOn', []), list):
            raise ValueError('依赖任务格式错误')
        if t.get('status', 'todo') not in ('todo', 'done'):
            raise ValueError('任务状态错误')
    deps = {t['id']: set(t.get('dependsOn', [])) for t in tasks}
    for key, values in deps.items():
        if key in values or not values <= ids:
            raise ValueError('任务依赖不存在或依赖自身')
    visited = set()
    while len(visited) < len(ids):
        ready = {key for key, values in deps.items() if key not in visited and values <= visited}
        if not ready:
            raise ValueError('任务之间存在循环依赖')
        visited |= ready


def schedule(tasks, settings):
    validate_tasks(tasks)
    result = deepcopy(tasks)
    start = day(settings.get('startDate') or date.today().isoformat())
    daily = int(settings.get('dailyMinutes', 90))
    if not 15 <= daily <= 720:
        raise ValueError('每天可用时间应为 15 至 720 分钟')
    end = day(settings['deadline']) if settings.get('deadline') else start + timedelta(days=179)
    if end < start or (end - start).days > 365:
        raise ValueError('截止日期应在开始日期之后一年内')
    unavailable = {day(x).isoformat() for x in settings.get('unavailableDates', [])}
    budgets = settings.get('dayBudgets', {})
    if not isinstance(budgets, dict) or len(budgets) > 366:
        raise ValueError('日期容量设置错误')
    for k, v in budgets.items():
        day(k)
        if type(v) is not int or not 0 <= v <= 720:
            raise ValueError('单日容量应为 0 至 720 分钟')
    capacities = {}
    for offset in range((end - start).days + 1):
        key = (start + timedelta(days=offset)).isoformat()
        capacities[key] = 0 if key in unavailable else budgets.get(key, daily)
    remaining = dict(capacities)
    completed, finishes, ordered = set(), {}, []
    conflicts = []
    for t in result:
        if t.get('status') == 'done':
            completed.add(t['id'])
            finishes[t['id']] = start.isoformat()
            ordered.append(t)  # Completed tasks retain their historical allocation.
        else:
            t['sessions'] = []
            t['status'] = 'todo'
    pending = {t['id']: t for t in result if t['id'] not in completed}
    blocked = set()
    while pending:
        candidates = [t for t in pending.values() if set(t.get('dependsOn', [])) <= completed | blocked]
        if not candidates:
            raise ValueError('无法解析任务依赖')
        # Propagate child deadlines to prerequisite tasks, so urgent chains start first.
        def urgency(t, seen=None):
            seen = set() if seen is None else seen
            if t['id'] in seen:
                return '9999-12-31'
            seen.add(t['id'])
            dates = [t.get('deadline') or settings.get('deadline') or '9999-12-31']
            dates += [urgency(c, seen.copy()) for c in pending.values() if t['id'] in c.get('dependsOn', [])]
            return min(dates)
        candidates.sort(key=lambda t: (urgency(t), -int(t.get('priority', 1)), result.index(t)))
        t = candidates[0]
        del pending[t['id']]
        deps = set(t.get('dependsOn', []))
        if deps & blocked:
            t['unscheduledMinutes'] = t['minutes']
            blocked.add(t['id'])
            conflicts.append({'taskId': t['id'], 'title': t['title'], 'reason': '前置任务未能排完', 'minutes': t['minutes']})
            ordered.append(t)
            continue
        earliest = max([start.isoformat()] + [finishes[x] for x in deps])
        latest = min(end.isoformat(), t.get('deadline') or end.isoformat())
        need = sum(a['minutes'] for a in t['actions'] if a.get('status') != 'done') if t.get('actions') else t['minutes']
        for key in remaining:
            if earliest <= key <= latest and remaining[key] > 0:
                allocated = min(remaining[key], need)
                # Same-day execution order is the order of sessions in the returned calendar.
                t['sessions'].append({'date': key, 'minutes': allocated})
                remaining[key] -= allocated
                need -= allocated
                if need == 0:
                    break
        t['unscheduledMinutes'] = need
        if need:
            blocked.add(t['id'])
            conflicts.append({'taskId': t['id'], 'title': t['title'], 'reason': '截止前可用时间不足', 'minutes': need})
        else:
            completed.add(t['id'])
            finishes[t['id']] = t['sessions'][-1]['date'] if t['sessions'] else earliest
        ordered.append(t)
    days = []
    for key, budget in capacities.items():
        sessions = [{'taskId': t['id'], 'title': t['title'], 'minutes': s['minutes']}
                    for t in ordered if t.get('status') != 'done'
                    for s in t.get('sessions', []) if s['date'] == key]
        if sessions or key in unavailable:
            days.append({'date': key, 'capacity': budget, 'used': sum(s['minutes'] for s in sessions), 'sessions': sessions})
    return {'tasks': result, 'days': days, 'conflicts': conflicts,
            'totalMinutes': sum(sum(a['minutes'] for a in t['actions'] if a.get('status') != 'done') if t.get('actions') else t['minutes'] for t in result if t.get('status') != 'done'),
            'unscheduledMinutes': sum(t.get('unscheduledMinutes', 0) for t in result if t.get('status') != 'done'),
            'settings': settings}
