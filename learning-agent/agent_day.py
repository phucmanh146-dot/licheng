"""Users choose today's tasks; this module places concrete actions into free windows."""
from datetime import date
from copy import deepcopy
from agent_schedule import day


def minute(text):
    if not isinstance(text, str) or len(text) != 5 or text[2] != ':':
        raise ValueError('时刻使用 HH:MM 格式')
    try:
        h, m = map(int, text.split(':'))
    except ValueError:
        raise ValueError('时刻使用 HH:MM 格式')
    if not 0 <= h <= 23 or not 0 <= m <= 59:
        raise ValueError('时刻超出一天范围')
    return h * 60 + m


def clock(m):
    return f'{m // 60:02d}:{m % 60:02d}'


def make_day(route, data):
    selected = data.get('selectedTaskIds', [])
    if not isinstance(selected, list) or not selected or len(selected) > 60 or len(set(selected)) != len(selected):
        raise ValueError('请先勾选今天要做的任务，不能重复勾选')
    day_date = day(data.get('date') or date.today().isoformat()).isoformat()
    if day_date in route.get('settings', {}).get('unavailableDates', []):
        raise ValueError('这一天已设为完全没空，请先修改可用日期')
    tasks = {t['id']: t for t in route['tasks']}
    if not set(selected) <= tasks.keys():
        raise ValueError('选择中包含不存在的任务')
    done = {t['id'] for t in tasks.values() if t.get('status') == 'done'}
    if set(selected) & done:
        raise ValueError('已完成任务无需再次安排')
    missing = {d for identifier in selected for d in tasks[identifier].get('dependsOn', []) if d not in done and d not in selected}
    if missing:
        raise ValueError('需要先完成或勾选前置任务：' + '、'.join(sorted(missing)))
    windows = data.get('windows', [])
    if not isinstance(windows, list) or not 1 <= len(windows) <= 8:
        raise ValueError('请填写 1 至 8 段真实可用时间')
    spans = []
    for w in windows:
        if not isinstance(w, dict):
            raise ValueError('时间段格式错误')
        start, end = minute(w.get('start')), minute(w.get('end'))
        if end <= start:
            raise ValueError('结束时刻必须晚于开始时刻，不跨午夜')
        spans.append([start, end])
    spans.sort()
    if any(spans[i][0] < spans[i-1][1] for i in range(1, len(spans))):
        raise ValueError('可用时间段不能重叠')
    buffer_minutes = int(data.get('bufferMinutes', 10))
    if not 0 <= buffer_minutes <= 120:
        raise ValueError('机动时间应为 0 至 120 分钟')
    total = sum(end - start for start, end in spans)
    if buffer_minutes >= total:
        raise ValueError('可用时间不足以容纳机动时间')
    # Reserve capacity at the end; no task can silently consume this buffer.
    reserve = buffer_minutes
    usable = deepcopy(spans)
    for span in reversed(usable):
        take = min(span[1] - span[0], reserve)
        span[1] -= take; reserve -= take
        if not reserve:
            break
    rows, conflicts, processed = [], [], set(done)
    pending = list(selected)
    completed_today = set(done)
    while pending:
        ready = [x for x in pending if set(tasks[x].get('dependsOn', [])) <= processed]
        if not ready:
            raise ValueError('任务依赖有循环')
        identifier = ready[0]
        pending.remove(identifier)
        task = tasks[identifier]
        processed.add(identifier)
        if not set(task.get('dependsOn', [])) <= completed_today:
            conflicts.append({'taskId': identifier, 'reason': '前置任务今天排不完，暂不排后续动作'})
            continue
        actions = task.get('actions') or [{'id':identifier + '-legacy','title':task['title'],'instruction':task['firstStep'],
                                           'minutes':task['minutes'],'result':task['deliverable'],'check':task['acceptance'],'status':'todo'}]
        task_fits = True
        for action in actions:
            if action.get('status') == 'done':
                continue
            needed = action['minutes']
            matching = next((span for span in usable if span[1]-span[0] >= needed), None)
            if matching is None:
                conflicts.append({'taskId':identifier,'actionId':action['id'],'title':action['title'],
                                  'reason':f'没有连续 {needed} 分钟的空档；请缩小动作或调整时间段'})
                task_fits = False
                break
            start, end = matching[0], matching[0] + needed
            rows.append({'taskId':identifier,'taskTitle':task['title'],'actionId':action['id'],'title':action['title'],
                         'instruction':action['instruction'],'result':action['result'],'check':action['check'],
                         'minutes':needed,'start':clock(start),'end':clock(end)})
            matching[0] = end
            # Prevent later actions from being placed in an earlier unused short gap.
            for span in usable:
                if span[1] <= end:
                    span[0] = span[1]
            if task.get('deadline') and day_date > task['deadline']:
                conflicts.append({'taskId':identifier,'reason':'所选日期已经晚于该任务截止日期'})
        if task_fits:
            completed_today.add(identifier)
    rows.sort(key=lambda r: r['start'])
    return {'date':day_date,'selectedTaskIds':selected,'windows':windows,'bufferMinutes':buffer_minutes,
            'rows':rows,'conflicts':conflicts,'usedMinutes':sum(r['minutes'] for r in rows),'availableMinutes':total,
            'note':'只安排用户本次勾选的任务；时间为估计，完成情况以实际验收为准。'}
