"""Replaceable, deterministic capacity calculator for the captain/B handoff.
Uses declared availability only. No AI or live-search claim.
"""
from copy import deepcopy
from datetime import date, datetime, time, timedelta, timezone
from deadline_policy import rank_tasks

TZ = timezone(timedelta(hours=8))

def number(data, key, low, high):
    value = data.get(key)
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f'{key} 必须在 {low} 至 {high} 之间')
    return value

def day(value):
    try: return date.fromisoformat(value)
    except (TypeError, ValueError): raise ValueError('日期需要 YYYY-MM-DD 格式')

def stamp(value):
    try:
        result = datetime.fromisoformat(value)
        if result.tzinfo is None: raise ValueError()
        return result.astimezone(TZ)
    except (TypeError, ValueError): raise ValueError('原日程必须有有效时区')

def ranges(rows, start, end, now):
    if not isinstance(rows,list) or len(rows)>1000: raise ValueError('时段列表无效或超过 1000 段')
    result=[]
    for row in rows:
        if not isinstance(row,dict): raise ValueError('时段格式错误')
        d=day(row.get('date'))
        try:
            a,b=(datetime.combine(d,time.fromisoformat(row[k]),TZ) for k in ('start','end'))
        except (ValueError,KeyError,TypeError): raise ValueError('时刻需要 HH:MM 格式')
        if a.second or b.second or a.microsecond or b.microsecond or b<=a: raise ValueError('时段不得跨午夜，结束需晚于开始')
        if not start<=d<=end: raise ValueError('时段超出规划周期')
        if b>now: result.append([max(a,now),b])
    result.sort()
    if any(result[i][0]<result[i-1][1] for i in range(1,len(result))): raise ValueError('输入时段重叠，请合并后再填写')
    return result

def minutes(a,b): return max(0,int((b-a).total_seconds()//60))

def subtract(spans,a,b):
    result=[]
    for x,y in spans:
        if b<=x or a>=y: result.append([x,y]);continue
        if x<a: result.append([x,a])
        if b<y: result.append([b,y])
    return result

def reserve_after(spans, point, amount):
    """Reserve transition time after a task, using real free windows only."""
    if amount <= 0:
        return spans, [], 0
    future = sorted((a, b) for a, b in spans if b > point)
    if not future:
        return spans, [], amount
    natural_gap = minutes(point, future[0][0])
    remaining = max(0, amount - natural_gap)
    reserved = []
    result = list(spans)
    for a, b in future:
        if remaining <= 0:
            break
        start_at = max(a, point)
        take = min(minutes(start_at, b), remaining)
        if take <= 0:
            continue
        finish = start_at + timedelta(minutes=take)
        result = subtract(result, start_at, finish)
        reserved.append([start_at, finish])
        remaining -= take
    return result, reserved, remaining


def compute(project, data, now=None):
    now=(now or datetime.now(TZ)).astimezone(TZ)
    now=now.replace(second=0,microsecond=0)+timedelta(minutes=bool(now.second or now.microsecond))
    start,end=day(data.get('period_start')),day(data.get('period_end'))
    if start>end or (end-start).days>180 or end<now.date(): raise ValueError('规划周期需有效、未结束且不超过 181 天')
    limit=number(data,'daily_limit',1,1440);buffer=number(data,'buffer_minutes',0,240)
    transition_buffer=number(data,'transition_buffer_minutes',0,60) if 'transition_buffer_minutes' in data else 10
    chunk=number(data,'chunk_minutes',5,180)
    member=data.get('member_id')
    if member not in {m['member_id'] for m in project['diagnosis']['member_profiles']}: raise ValueError('请选择有效成员')
    old=project['plan'];tasks={t['task_id']:t for t in old['tasks']}
    chosen=data.get('selected_task_ids')
    if not isinstance(chosen,list) or not chosen or any(not isinstance(x,str) for x in chosen) or len(set(chosen))!=len(chosen) or not set(chosen)<=tasks.keys():
        raise ValueError('请勾选不重复的有效任务')
    if len(chosen)>100: raise ValueError('每轮最多安排 100 个任务')
    full={day(d) for d in data.get('full_dates',[])}
    if any(not start<=d<=end for d in full): raise ValueError('排满日期超出规划周期')
    spans=ranges(data.get('windows',[]),start,end,now)
    busy=ranges(data.get('busy',[]),start,end,now)
    spans=[x for x in spans if x[0].date() not in full]
    for a,b in busy: spans=subtract(spans,a,b)
    remaining=data.get('remaining_minutes',{})
    if not isinstance(remaining,dict): raise ValueError('剩余用时格式错误')
    needs={};due={};blocked={};notes=[]
    for identifier in chosen:
        t=tasks[identifier]
        if member not in t['owner_ids']: raise ValueError('任务不属于所选成员：'+identifier)
        if len(t['owner_ids'])>1: raise ValueError('多人共同任务需 B 联合排程，本入口仅安排单负责人任务：'+identifier)
        if t['status'] in ('completed','pending_review'): raise ValueError('已完成或待验收任务无需重排：'+identifier)
        if t['status']=='in_progress' and identifier not in remaining: raise ValueError('进行中任务请填写剩余分钟：'+identifier)
        n=remaining.get(identifier,t['estimate_minutes_range'][1])
        if type(n) is not int or not 1<=n<=100000: raise ValueError('剩余分钟需要正整数')
        needs[identifier]=n
        raw=t.get('deadline','')
        if raw=='待成员确认':
            due[identifier]=datetime.combine(end,time.max,TZ);notes.append(identifier+' 暂按本次周期结束计算，任务截止尚待确认')
        elif len(raw)==10:
            due[identifier]=datetime.combine(day(raw),time.max,TZ)
        else: due[identifier]=stamp(raw)
        if t['status']=='blocked': blocked[identifier]='任务仍有卡点，请先处理后恢复执行'
        elif any(tasks[dep]['status']!='completed' for dep in t['depends_on']): blocked[identifier]='前置成果尚未验收，等待前置完成后再排'
    quadrant_rows = rank_tasks([tasks[k] for k in chosen])
    quadrant_rank = {row["task_id"]: i for i, row in enumerate(quadrant_rows)}
    quadrant_by_id = {row["task_id"]: row["quadrant"] for row in quadrant_rows}
    chosen_order = sorted(chosen, key=lambda k: (quadrant_rank.get(k, 999), due.get(k), chosen.index(k)))
    # Preserve history, other members, unselected tasks, and explicitly locked slots.
    kept=[];movable=[]
    for block in old['time_blocks']:
        a,b=stamp(block['start']),stamp(block['end'])
        if b<=a or a.date()!=b.date(): raise ValueError('原日程起止无效或跨日，请先修正')
        selected=block['member_id']==member and block['task_id'] in chosen
        if selected and a>=now and not start<=a.date()<=end:
            raise ValueError('所选任务已有周期外未来安排，请扩大周期后调整：'+block['task_id'])
        protected=block.get('locked') or tasks[block['task_id']].get('locked')
        intersects=start<=a.date()<=end and b>now
        if selected and not protected and a>=now and start<=a.date()<=end: movable.append(block);continue
        kept.append(deepcopy(block))
        if block['member_id']==member and intersects:
            if a.date() in full or any(a<y and b>x for x,y in busy):
                raise ValueError('突发占用与保留/锁定安排冲突，请先明确调整该安排：'+block['task_id'])
            if selected and protected and not any(x<=max(a,now) and y>=b for x,y in spans):
                raise ValueError('锁定安排不在本次可用时间内，请先处理冲突：'+block['task_id'])
            spans=subtract(spans,max(a,now),b)
            if selected:
                needs[block['task_id']]-=minutes(max(a,now),b)
                if needs[block['task_id']]<0: raise ValueError('填写的剩余分钟少于已保留安排，请核对：'+block['task_id'])
    # Reserve buffer and obey daily limit after subtracting kept schedules.
    daily=[];usable=[]
    d=start
    while d<=end:
        parts=[x[:] for x in spans if x[0].date()==d]
        used=sum(minutes(max(stamp(b['start']),now),stamp(b['end'])) for b in kept if b['member_id']==member and stamp(b['start']).date()==d and stamp(b['end'])>now)
        if used>limit: raise ValueError('保留安排超过每日上限，请先调整：'+d.isoformat())
        raw=sum(minutes(a,b) for a,b in parts)
        allowance=max(0,min(raw,limit-used)-buffer)
        capacity=allowance
        for a,b in parts:
            take=min(minutes(a,b),allowance)
            if take: usable.append([a,a+timedelta(minutes=take)])
            allowance-=take
        daily.append({'date':d.isoformat(),'available_minutes':capacity,'preserved_minutes':used,'full':d in full})
        d+=timedelta(days=1)
    capacity=sum(x['available_minutes'] for x in daily)
    demand=sum(needs.values());new=[]
    # Retain unaffected selected slots wherever all current constraints still hold.
    for block in sorted(movable,key=lambda x:x['start']):
        key=block['task_id'];a,b=stamp(block['start']),stamp(block['end']);n=minutes(a,b)
        if key not in blocked and b<=due[key] and needs[key]>=n and any(x<=a and y>=b for x,y in usable):
            new.append(deepcopy(block));usable=subtract(usable,a,b);needs[key]-=n
    transition_buffers=[];buffer_unallocated=[];next_day_reserved=set()
    for task_index,key in enumerate(chosen_order):
        if key in blocked: continue
        if tasks[key].get('locked') and needs[key]: blocked[key]='任务已锁定，保留现有安排；请与 B 确认未排部分';continue
        while needs[key]>0:
            found=None
            for a,b in usable:
                available=minutes(a,min(b,due[key]))
                is_many_unimportant = quadrant_by_id.get(key) == "many_unimportant"
                is_first_next_day_slot = is_many_unimportant and key not in next_day_reserved
                earliest_day = max(start, now.date()+timedelta(days=1)) if is_many_unimportant else start
                if a.date() < earliest_day:
                    continue
                if is_first_next_day_slot:
                    amount=min(needs[key],60,available)
                else:
                    amount=min(needs[key],chunk,available) if data.get('allow_split') is True else needs[key]
                if amount>0 and available>=amount and (amount>=5 or amount==needs[key]): found=(a,amount);break
            if not found: break
            a,n=found;b=a+timedelta(minutes=n)
            block={'task_id':key,'member_id':member,'start':a.isoformat(timespec='minutes'),'end':b.isoformat(timespec='minutes')}
            if quadrant_by_id.get(key) == "many_unimportant" and key not in next_day_reserved:
                block["reservation_type"]="next_day_fixed"
                next_day_reserved.add(key)
            new.append(block)
            usable=subtract(usable,a,b);needs[key]-=n
        # Reserve a real transition gap after the last block of this task on each day
        # before the next task is placed. Never count this gap as task completion.
        if transition_buffer and task_index < len(chosen_order)-1:
            by_date={}
            for block in new:
                if block.get("task_id") == key:
                    end_at=stamp(block["end"])
                    by_date[end_at.date()]=max(by_date.get(end_at.date(),end_at),end_at)
            for day_key, end_at in sorted(by_date.items()):
                usable, reserved, short = reserve_after(usable,end_at,transition_buffer)
                for a,b in reserved:
                    transition_buffers.append({"date":day_key.isoformat(),"after_task_id":key,
                        "start":a.isoformat(timespec="minutes"),"end":b.isoformat(timespec="minutes"),
                        "minutes":minutes(a,b),"kind":"transition_buffer"})
                if short:
                    buffer_unallocated.append({"date":day_key.isoformat(),"after_task_id":key,
                                               "minutes":short,"reason":"后续空档不足，无法完整保留任务过渡缓冲"})
    previous_unscheduled = {
        item.get("task_id"): item for item in old.get("unscheduled", [])
        if isinstance(item, dict) and item.get("task_id")
    }
    missing=[]
    for k,n in needs.items():
        if n<=0:
            continue
        previous=previous_unscheduled.get(k) or {}
        since=previous.get("unscheduled_since") or now.isoformat(timespec="minutes")
        try:
            triage_due=(datetime.fromisoformat(since)+timedelta(hours=24)).isoformat(timespec="minutes")
        except ValueError:
            since=now.isoformat(timespec="minutes")
            triage_due=(now+timedelta(hours=24)).isoformat(timespec="minutes")
        missing.append({"task_id":k,"minutes":n,
            "reason":blocked.get(k,"截止前空档或连续时长不足；未自动推迟截止日期"),
            "unscheduled_since":since,"triage_due_at":triage_due})
    plan=deepcopy(old);plan['plan_version']+=1
    plan['time_blocks']=sorted(kept+new,key=lambda x:x['start'])
    plan['transition_buffers']=transition_buffers
    # Preserve unrelated unscheduled entries rather than declaring them resolved.
    plan['unscheduled']=[x for x in old['unscheduled'] if not ((isinstance(x,str) and any(x==k or x.startswith(k+'：') or x.startswith(k+':') for k in chosen)) or (isinstance(x,dict) and x.get('task_id') in chosen))]+missing
    plan['replanning_context']=deepcopy(data)
    reserved_total=sum(x["minutes"] for x in transition_buffers)
    plan['schedule_summary']={'provider':'deterministic-capacity-calculator','member_id':member,'period_start':start.isoformat(),'period_end':end.isoformat(),
        'needed_minutes':demand,'available_minutes':max(0,capacity-reserved_total),'daily':daily,
        'transition_buffer_minutes_per_switch':transition_buffer,'transition_buffer_reserved':reserved_total,
        'transition_buffer_unallocated':buffer_unallocated,
        'unallocated_minutes':sum(x['minutes'] for x in missing),'unallocated':missing,
        'quadrant_order':[row["task_id"] for row in quadrant_rows],
        'quadrants':quadrant_rows,
        'next_day_fixed_reservations':[b for b in new if b.get("reservation_type")=="next_day_fixed"],
        'fits':not missing and not buffer_unallocated,
        'assumptions':notes+['未填写剩余时间的未开始任务按估时上限计算；排入不代表完成。','每日缓冲与任务间过渡缓冲均作为不可挪用空档；没有自动压缩休息或修改截止日期。'],
        'options':(['询问用户是否将低重要性任务暂缓（不删除、不标完成）','减少或分阶段交付范围（先确认必交项）','与队友协作并确认接手人','仅在允许延期时确认新的截止日期','自行增加真实可用空档后重新计算'] if missing or buffer_unallocated else [])}
    return plan
