"""Minute-accurate shared availability. Draft only; never accepts completion."""
from copy import deepcopy
from collections import Counter
from datetime import datetime, timedelta, time
import b_capacity as c


def compute(diagnosis, plan, settings, now=None):
    now=(now or datetime.now(c.TZ)).astimezone(c.TZ)
    now=now.replace(second=0,microsecond=0)+timedelta(minutes=bool(now.second or now.microsecond))
    start,end=c.day(settings.get('period_start')),c.day(settings.get('period_end'))
    if start>end or (end-start).days>180 or end<now.date(): raise ValueError('规划周期无效或超过 181 天')
    members=settings.get('members')
    known={m['member_id'] for m in diagnosis['member_profiles']}
    if not isinstance(members,dict) or not members or len(members)>20 or not set(members)<=known: raise ValueError('请提供 1 至 20 名有效成员的空档')
    chunk=c.number(settings,'chunk_minutes',5,180)
    tasks={t['task_id']:t for t in plan['tasks']}
    chosen=settings.get('selected_task_ids')
    if not isinstance(chosen,list) or not chosen or len(chosen)!=len(set(chosen)) or not set(chosen)<=tasks.keys(): raise ValueError('请勾选有效且不重复的任务')
    for key in chosen:
        if not set(tasks[key]['owner_ids'])<=members.keys(): raise ValueError('共同任务需所有负责人填写空档：'+key)
    origin=datetime.combine(start,time.min,c.TZ)
    def ticks(a,b): return set(range(max(0,int((a-origin).total_seconds()//60)), max(0,int((b-origin).total_seconds()//60))))
    def stamp(n):return (origin+timedelta(minutes=n)).isoformat(timespec='minutes')
    calendars={}; limits={}; buffers={}; budgets={}; occupied={}; daily=[]
    for who,data in members.items():
        limits[who]=c.number(data,'daily_limit',1,1440)
        buffers[who]=c.number(data,'buffer_minutes',0,240)
        spans=c.ranges(data.get('windows',[]),start,end,now)
        busy=c.ranges(data.get('busy',[]),start,end,now)
        full={c.day(x) for x in data.get('full_dates',[])}
        if any(not start<=x<=end for x in full): raise ValueError('排满日期超出周期')
        available=set()
        for a,b in spans:
            if a.date() not in full: available.update(ticks(a,b))
        for a,b in busy: available.difference_update(ticks(a,b))
        calendars[who]=available;occupied[who]=set()
        counts=Counter(n//1440 for n in available)
        for day_index in range((end-start).days+1):
            budgets[who,day_index]=max(0,min(limits[who],counts[day_index])-buffers[who])
    kept=[];movable=[];needs={};reasons={};remaining=settings.get('remaining_minutes',{})
    if not isinstance(remaining,dict): raise ValueError('剩余分钟格式错误')
    for key in chosen:
        t=tasks[key]
        if t['status'] in ('completed','pending_review'): continue
        n=remaining.get(key,t.get('remaining_minutes',t['estimate_minutes_range'][1]))
        if type(n)!=int or not 1<=n<=100000: raise ValueError('剩余分钟应为正整数')
        if t['status']=='in_progress' and key not in remaining and 'remaining_minutes' not in t: raise ValueError('进行中任务请先填写剩余用时')
        needs[key]=n
        if t.get('blocker') or t.get('external_dependencies'): reasons[key]='外部依赖或卡点尚未解除'
        elif any(tasks[d]['status']!='completed' for d in t['depends_on']): reasons[key]='前置成果尚未验收，下游不作为可执行任务'
        elif t['status']=='blocked' and not t['depends_on']: reasons[key]='任务仍处于阻塞状态'
    for block in plan['time_blocks']:
        a,b=c.stamp(block['start']),c.stamp(block['end']);key=block['task_id'];t=tasks[key]
        active=key in needs and a>=now and start<=a.date()<=end
        if key in needs and a>=now and not start<=a.date()<=end: raise ValueError('请扩大周期以包含已有未来安排：'+key)
        if active and not block.get('locked') and not t.get('locked'):
            movable.append(deepcopy(block));continue
        kept.append(deepcopy(block));who=block['member_id']
        if who not in members or b<=now or not start<=a.date()<=end:continue
        ns=ticks(max(a,now),b)
        if not ns<=calendars[who]: raise ValueError('保留或锁定安排与新空档/占用冲突：'+key)
        occupied[who].update(ns)
    for who,ns in occupied.items():
        for day_index in range((end-start).days+1):
            used=sum(1 for n in ns if n//1440==day_index)
            if used>limits[who]:raise ValueError('保留安排超过每日上限')
            budgets[who,day_index]=max(0,budgets[who,day_index]-used)
        calendars[who].difference_update(ns)
    # Shared blocks count once toward task effort, once per participant's capacity.
    for key in needs:
        protected={(b['start'],b['end']) for b in kept if b['task_id']==key and c.stamp(b['end'])>now}
        needs[key]-=sum(c.minutes(max(c.stamp(a),now),c.stamp(b)) for a,b in protected)
        if needs[key]<0:raise ValueError('剩余分钟小于保留安排，请核对')
    forecast_free=deepcopy(calendars);forecast_budget=dict(budgets)
    initial=dict(needs);new=[]
    def due(key):
        raw=tasks[key]['deadline']
        if raw=='待成员确认':return datetime.combine(end,time.max,c.TZ)
        return datetime.combine(c.day(raw),time.max,c.TZ) if len(raw)==10 else c.stamp(raw)
    def released(key):
        t=tasks[key];wait=t.get('wait_after_dependencies_minutes',0)
        if not wait:return now
        ends=[]
        for dep in t['depends_on']:
            completed=tasks[dep].get('completed_at')
            if not completed:
                reasons[key]='等待时间需要前置成果的验收时间 completed_at';return datetime.combine(end,time.max,c.TZ)
            ends.append(c.stamp(completed))
        return max([now]+[x+timedelta(minutes=wait) for x in ends])
    def place(key,a,n):
        used=set(range(a,a+n));day_index=a//1440
        for who in tasks[key]['owner_ids']:
            calendars[who].difference_update(used);budgets[who,day_index]-=n
            new.append({'task_id':key,'member_id':who,'start':stamp(a),'end':stamp(a+n)})
        needs[key]-=n
    # Retain existing shared blocks only if every owner's slot and daily budget remain valid.
    for key,a,b in sorted({(x['task_id'],x['start'],x['end']) for x in movable},key=lambda x:x[1]):
        x,y=c.stamp(a),c.stamp(b);ns=ticks(x,y);n=len(ns)
        if not ns:continue
        i=min(ns);owners=tasks[key]['owner_ids']
        if key not in reasons and x>=released(key) and n<=needs[key] and y<=due(key) and all(ns<=calendars[w] and budgets[w,i//1440]>=n for w in owners):place(key,i,n)
    for key in sorted(needs,key=lambda k:(due(k),chosen.index(k))):
        if key in reasons:continue
        t=tasks[key]
        if t.get('locked') and needs[key]:reasons[key]='任务已锁定，未排部分需先解锁';continue
        while needs[key]>0:
            common=set.intersection(*(calendars[w] for w in t['owner_ids']))
            limit=int((due(key)-origin).total_seconds()//60)
            earliest=int((released(key)-origin).total_seconds()//60)
            candidates=sorted(n for n in common if earliest<=n<limit and all(budgets[w,n//1440]>0 for w in t['owner_ids']))
            found=None
            for a in candidates:
                cap=min(budgets[w,a//1440] for w in t['owner_ids'])
                n=min(needs[key],chunk,cap) if settings.get('allow_split') else needs[key]
                n=min(n,1440-a%1440,limit-a)
                while n>0 and not set(range(a,a+n))<=common:n-=1
                if n and (settings.get('allow_split') or n==needs[key]):found=(a,n);break
            if not found:break
            place(key,*found)
    missing=[{'task_id':key,'minutes':n,'reason':reasons.get(key,'截止前共同空档、每日容量或连续时长不足')} for key,n in needs.items() if n]
    result=deepcopy(plan);result['plan_version']+=1
    result['time_blocks']=sorted(kept+new,key=lambda x:(x['start'],x['member_id']))
    result['unscheduled']=[x for x in plan['unscheduled'] if not isinstance(x,dict) or x.get('task_id') not in needs]+missing
    for t in result['tasks']:
        if t['task_id'] in needs and t['status'] not in ('in_progress','completed','pending_review'):
            t['status']='blocked' if t['task_id'] in reasons else ('scheduled' if any(x['task_id']==t['task_id'] for x in result['time_blocks']) else 'candidate')
    for (who,index),budget in budgets.items():
        daily.append({'member_id':who,'date':(start+timedelta(days=index)).isoformat(),'remaining_capacity_minutes':budget})
    result['schedule_summary']={'provider':'joint-capacity-calculator','fits':not missing,'unallocated_minutes':sum(x['minutes'] for x in missing),
        'needed_minutes':sum(initial.values()),'daily':daily,'unallocated':missing,
        'options':['缩小或分阶段交付范围','协商负责人或增加真实空档','比赛允许时再调整截止日期'] if missing else [],
        'assumptions':['共同任务要求所有负责人同一时段参与；用时按任务计一次，按成员分别占用。','未验收的前置成果不会被当作已完成。']}
    # Backward milestone forecast is conditional, never an executable booking.
    forecasts={};waiting={k for k,t in tasks.items() if t['status'] not in ('completed','pending_review') and set(t['owner_ids'])<=members.keys()}
    while waiting:
        ready=[k for k in waiting if not any(k in tasks[d]['depends_on'] for d in waiting)]
        if not ready:raise ValueError('依赖循环')
        for key in sorted(ready,key=lambda k:(due(k),k),reverse=True):
            t=tasks[key];finish=min([int((due(key)-origin).total_seconds()//60)]+[v['first_tick']-tasks[k].get('wait_after_dependencies_minutes',0) for k,v in forecasts.items() if key in tasks[k]['depends_on']])
            common=set.intersection(*(forecast_free[w] for w in t['owner_ids']))
            total=t.get('remaining_minutes',t['estimate_minutes_range'][1])
            existing={(b['start'],b['end']) for b in kept if b['task_id']==key and c.stamp(b['end'])>now}
            total=max(0,total-sum(c.minutes(max(c.stamp(a),now),c.stamp(b)) for a,b in existing))
            if total==0:
                starts=[max(0,int((c.stamp(a)-origin).total_seconds()//60)) for a,b in existing]
                forecasts[key]={'task_id':key,'first_tick':min(starts) if starts else finish,'latest_start':min(a for a,b in existing) if existing else None,'latest_finish':max(b for a,b in existing) if existing else None,'missing_minutes':0,'conditional':True}
                waiting.remove(key);continue
            picked=[]
            for n in sorted((n for n in common if n<finish),reverse=True):
                if all(forecast_budget[w,n//1440]>0 for w in t['owner_ids']):
                    picked.append(n)
                    for w in t['owner_ids']:forecast_free[w].remove(n);forecast_budget[w,n//1440]-=1
                    if len(picked)==total:break
            forecasts[key]={'task_id':key,'first_tick':min(picked) if picked else 0,
                'latest_start':stamp(min(picked)) if picked else None,'latest_finish':stamp(max(picked)+1) if picked else None,
                'missing_minutes':total-len(picked),'conditional':True}
            waiting.remove(key)
    result['milestone_forecast']=[{k:v for k,v in row.items() if k!='first_tick'} for row in forecasts.values()]
    result['milestone_assumptions']=['截止倒推是条件性容量预测，不是可执行日程；假设前置成果及时验收、按估时上限推进，可拆分为分钟片段。',
        '实际可执行任务仍须用户选择并通过前置验收；未提供全部成员空档的任务不纳入倒推。']
    if any(t['deadline']=='待成员确认' for t in tasks.values()):result['schedule_summary']['assumptions'].append('未确认截止的任务暂按规划周期结束计算，需成员确认。')
    result['replanning_context']=deepcopy(settings)
    return result
