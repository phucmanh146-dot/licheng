"""B draft refinements. These functions never approve work or change official rules."""
from copy import deepcopy
from datetime import timedelta
from statistics import median
import action_planner as a
import b_capacity as c


def check(d,p,version):
    a.validate(p,d)
    if p['plan_version']!=version:raise ValueError('计划版本已变化，请刷新')


def finish(d,p,reason):
    p['plan_version']+=1
    for key in ('schedule_summary','milestone_forecast','replanning_context'):p.pop(key,None)
    p['dependencies']=[{'task_id':t['task_id'],'depends_on':t['depends_on']} for t in p['tasks']]
    p['changes']=p.get('changes',[])+[{'reason':reason,'task_id':'plan'}]
    a.validate(p,d)
    return p


def lock(d,p,task_id,locked,version):
    check(d,p,version)
    if type(locked)!=bool:raise ValueError('锁定值无效')
    q=deepcopy(p);t=next((x for x in q['tasks'] if x['task_id']==task_id),None)
    if not t:raise ValueError('任务不存在')
    t['locked']=locked
    for b in q['time_blocks']:
        if b['task_id']==task_id:b['locked']=locked
    return finish(d,q,'锁定安排' if locked else '解除锁定，允许下一轮调整')


def split(d,p,task_id,version,wait_minutes=0):
    check(d,p,version)
    t=next((x for x in p['tasks'] if x['task_id']==task_id),None)
    if not t or t['status'] not in ('candidate','scheduled') or t.get('locked') or t.get('decomposed'):raise ValueError('仅可拆解未执行、未锁定且未拆解的任务')
    if any(b['task_id']==task_id and b.get('locked') for b in p['time_blocks']):raise ValueError('任务时段已锁定')
    if type(wait_minutes)!=int or not 0<=wait_minutes<=10080:raise ValueError('等待时长需为 0 至 10080 分钟')
    lo,hi=t['estimate_minutes_range']
    if lo<4:raise ValueError('任务过短，无需拆阶段')
    descendants={task_id}
    while True:
        children={x['task_id'] for x in p['tasks'] if set(x['depends_on'])&descendants}
        if children<=descendants:break
        descendants|=children
    if any(x['task_id'] in descendants-{task_id} and (x['status'] in ('completed','pending_review','in_progress') or x.get('locked')) for x in p['tasks']) or any(b['task_id'] in descendants and b.get('locked') for b in p['time_blocks']):raise ValueError('拆分影响受保护下游，请交队长确认')
    q=deepcopy(p);main=next(x for x in q['tasks'] if x['task_id']==task_id)
    # Existing total is conserved, including explicit revision and checking reserves.
    lows=[1+(lo-4)*v//100 for v in (15,55,15)]
    lows.append(lo-sum(lows));highs=[lows[i]+(hi-lo)*v//100 for i,v in enumerate((15,55,15))];highs.append(hi-sum(highs))
    chain=list(t['depends_on']);children=[]
    names=[('preparation','梳理材料与操作步骤'),('production','制作可检查初稿'),('revision','修改并记录差异')]
    for i,(kind,name) in enumerate(names):
        child=deepcopy(t);child.update(task_id=f'{task_id}:{kind}',title=name+'：'+t['title'],kind=kind,
            deliverable=name+'的结果与证据',steps=[t['steps'][min(i,len(t['steps'])-1)]],
            acceptance_criteria=['提交可复查结果，说明如何满足：'+x for x in t['acceptance_criteria']],
            estimate_minutes_range=[lows[i],highs[i]],depends_on=chain[-1:] if i else chain,
            status='blocked' if chain else 'candidate',parent_task_id=task_id,
            estimate_basis='按原总估时拆分的可编辑假设；15%准备、55%制作、15%修改、余量检查')
        if i==2:child['wait_after_dependencies_minutes']=wait_minutes
        children.append(child);chain=[child['task_id']]
    main.update(kind='check',decomposed=True,depends_on=chain,status='blocked',estimate_minutes_range=[lows[3],highs[3]],
        steps=['逐条检查验收条件，提交最终产物和检查记录'],estimate_basis='从原总估时中预留的检查时间')
    main['phase_estimates']=[{'kind':x,'minutes_range':[lows[i],highs[i]]} for i,x in enumerate(('preparation','production','revision','check'))]+[{'kind':'waiting','minutes_range':[wait_minutes,wait_minutes],'occupies_capacity':False}]
    q['tasks']=children+q['tasks'];q['time_blocks']=[b for b in q['time_blocks'] if b['task_id'] not in descendants]
    for child in q['tasks']:
        if child['task_id'] in descendants-{task_id}:child['status']='blocked'
    for path in q['learning_paths']:
        if task_id in path['task_ids']:
            index=path['task_ids'].index(task_id);path['task_ids'][index:index]=[x['task_id'] for x in children]
    q['unscheduled'].append({'task_id':task_id,'reason':'已拆为准备、制作、修改、检查；等待仅影响最早开始，不占工作容量'})
    return finish(d,q,'拆解产物并显式保留修改、检查和等待时间')


def calibrate(d,p,version):
    check(d,p,version);q=deepcopy(p);updates=[]
    for t in q['tasks']:
        if t['status'] not in ('candidate','scheduled') or t.get('locked'):continue
        samples=[x for x in p['tasks'] if x['status']=='completed' and x.get('kind')==t.get('kind') and set(x['owner_ids'])==set(t['owner_ids']) and type(x.get('actual_minutes'))==int and x['actual_minutes']>0]
        if len(samples)<3:continue
        ratios=[x['actual_minutes']/sum(x.get('baseline_estimate_minutes_range',x['estimate_minutes_range']))*2 for x in samples]
        factor=max(.5,min(3,median(ratios)))
        original=t.setdefault('baseline_estimate_minutes_range',deepcopy(t['estimate_minutes_range']))
        t['estimate_minutes_range']=[max(1,round(n*factor)) for n in original]
        t['calibration']={'sample_task_ids':[x['task_id'] for x in samples],'sample_count':len(samples),'factor':factor,'method':'同负责人、同类型已验收样本的实际/原估时中值；系数限制 0.5 至 3'}
        updates.append(t['task_id'])
    # Reuse protection logic: don't silently leave stale allocations behind.
    if any(b.get('locked') and b['task_id'] in updates for b in q['time_blocks']):raise ValueError('校准影响锁定时段，请先解锁')
    q['time_blocks']=[b for b in q['time_blocks'] if b['task_id'] not in updates]
    for t in q['tasks']:
        if t['task_id'] in updates:t['status']='candidate'
    q['calibration_summary']={'updated_task_ids':updates,'note':'不足 3 条匹配的已验收样本时保留原假设；不是能力评分'}
    return finish(d,q,'按历史记录校准估时：'+str(len(updates))+' 项')


def expand(settings):
    s=deepcopy(settings);start,end=c.day(s['period_start']),c.day(s['period_end'])
    if end<start or (end-start).days>180:raise ValueError('重复课表周期不能超过 181 天')
    for m in s.get('members',{}).values():
        for kind in ('windows','busy'):
            rows=list(m.get(kind,[]))
            for r in m.get('weekly_'+kind,[]):
                if type(r.get('weekday'))!=int or not 0<=r['weekday']<=6:raise ValueError('星期需要 0（周一）至 6（周日）')
                for n in range((end-start).days+1):
                    day=start+timedelta(days=n)
                    if day.weekday()==r['weekday']:rows.append({'date':day.isoformat(),'start':r['start'],'end':r['end']})
            # Merge repeated/overlapping entries of the same kind before subtracting busy time.
            merged=[]
            for r in sorted(rows,key=lambda x:(x['date'],x['start'])):
                if r['start']>=r['end']:raise ValueError('时段结束必须晚于开始')
                if merged and merged[-1]['date']==r['date'] and r['start']<=merged[-1]['end']:merged[-1]['end']=max(merged[-1]['end'],r['end'])
                else:merged.append(deepcopy(r))
            m[kind]=merged
    return s


def reconcile(old_d,new_d,p,context,version):
    check(old_d,p,version)
    if new_d['diagnosis_version']<=old_d['diagnosis_version']:raise ValueError('新诊断版本必须递增')
    fresh=a.generate(new_d,context);old={t['task_id']:t for t in p['tasks']};new={t['task_id']:t for t in fresh['tasks']}
    old_gaps={g['gap_id']:g for g in old_d['gaps']};new_gaps={g['gap_id']:g for g in new_d['gaps']}
    old_sources={x['source_id']:x for x in old_d['sources']};new_sources={x['source_id']:x for x in new_d['sources']}
    source_changes={k for k in old_sources if old_sources[k]!=new_sources.get(k)}
    old_members={m['member_id']:m for m in old_d['member_profiles']};new_members={m['member_id']:m for m in new_d['member_profiles']}
    changed_gaps={k for k,g in old_gaps.items() if g!=new_gaps.get(k) or set(g.get('source_refs',[]))&source_changes or any(old_members.get(w)!=new_members.get(w) for w in g.get('related_member_ids',[]))}
    if context.get('deadline') and p.get('generation_context',{}).get('deadline') and context['deadline']!=p['generation_context']['deadline']:
        changed_gaps|={g['gap_id'] for g in old_d['gaps'] if not g.get('deadline')}
    affected={k for k,t in old.items() if set(t['gap_ids'])&changed_gaps}
    # Unchanged gaps retain locally refined tasks and execution records, including split phases.
    unchanged_gaps=set(old_gaps)&set(new_gaps)-changed_gaps
    for k in list(new):
        if set(new[k]['gap_ids'])<=unchanged_gaps:del new[k]
    for k,t in old.items():
        if set(t['gap_ids'])<=unchanged_gaps:new[k]=deepcopy(t)
    while True:
        children={k for k,t in old.items() if set(t['depends_on'])&affected}
        if children<=affected:break
        affected|=children
    conflicts=[k for k in affected if old[k]['status'] in ('completed','pending_review','in_progress') or old[k].get('locked') or any(b['task_id']==k and b.get('locked') for b in p['time_blocks'])]
    if conflicts:
        return {'requires_confirmation':True,'conflicts':conflicts,'reason':'新要求影响执行中、完成或锁定成果；旧计划原样保留，交队长确认，不自动覆盖','plan':deepcopy(p),'diagnosis':deepcopy(old_d),'proposed_diagnosis':deepcopy(new_d)}
    for k in old.keys()&new.keys():
        if k not in affected:new[k]=deepcopy(old[k])
    for k in affected&new.keys():
        t=new[k];missing=[dep for dep in t['depends_on'] if dep not in new]
        if missing:t['external_dependencies']=list(set(t.get('external_dependencies',[])+missing));t['depends_on']=[dep for dep in t['depends_on'] if dep in new]
        t['status']='blocked' if t['depends_on'] or t.get('external_dependencies') else 'candidate'
    fresh['tasks']=list(new.values());fresh['time_blocks']=[deepcopy(b) for b in p['time_blocks'] if b['task_id'] not in affected and b['task_id'] in new]
    fresh['dependencies']=[{'task_id':t['task_id'],'depends_on':t['depends_on']} for t in fresh['tasks']]
    fresh['learning_paths']=[x for x in fresh['learning_paths'] if x['gap_id'] not in unchanged_gaps]+[deepcopy(x) for x in p['learning_paths'] if x['gap_id'] in unchanged_gaps]
    fresh['milestones']=[{'task_id':t['task_id'],'deadline':t['deadline'],'deliverable':t['deliverable']} for t in fresh['tasks'] if t.get('kind') in ('production','check') and not t.get('parent_task_id')]
    fresh['plan_version']=p['plan_version']+1
    fresh['changes']=[{'task_id':k,'reason':'新增任务' if k not in old else '要求变化，需重新排程','before':[b for b in p['time_blocks'] if b['task_id']==k],'after':[]} for k in sorted((new.keys()-old.keys())|affected)]
    a.validate(fresh,new_d)
    return {'requires_confirmation':False,'plan':fresh,'diagnosis':deepcopy(new_d),'preserved_task_ids':sorted((old.keys()&new.keys())-affected)}


def alternatives(d,p,settings,version,optional_ids=None,extension_days=0):
    check(d,p,version);base=a.replan(d,p,settings,version);results=[]
    chosen=settings['selected_task_ids'];tasks={t['task_id']:t for t in p['tasks']}
    def simulate(label,qs,qp,impact):
        try:
            result=a.replan(d,qp,qs,qp['plan_version'])
            results.append({'label':label,'impact':impact,'missing_minutes':result['schedule_summary']['unallocated_minutes'],'fits':result['schedule_summary']['fits'],'plan':result,'settings':qs})
        except (ValueError,KeyError) as e:results.append({'label':label,'impact':impact,'error':str(e),'fits':False})
    optional=set(optional_ids or [])
    if not optional<=set(chosen):raise ValueError('缩范围只能选择本轮任务')
    if optional:
        if any(set(tasks[k]['depends_on'])&optional for k in chosen if k not in optional):raise ValueError('不能移出仍被所选任务依赖的产物')
        qs=deepcopy(settings);qs['selected_task_ids']=[k for k in chosen if k not in optional]
        qp=deepcopy(p)
        if any(tasks[k]['status'] in ('completed','pending_review','in_progress') or tasks[k].get('locked') or any(b['task_id']==k and b.get('locked') for b in p['time_blocks']) for k in optional):raise ValueError('不能缩减受保护任务')
        qp['time_blocks']=[b for b in qp['time_blocks'] if b['task_id'] not in optional]
        if qs['selected_task_ids']:simulate('暂不安排用户指定的可延后任务',qs,qp,{'deferred_task_ids':sorted(optional),'removed_minutes':sum(tasks[k]['estimate_minutes_range'][1] for k in optional),'warning':'未删除原任务或更改比赛必交要求'})
    if type(extension_days)!=int or not 0<=extension_days<=30:raise ValueError('延期对比需为 0 至 30 天')
    if extension_days:
        qs=deepcopy(settings);qs['period_end']=(c.day(qs['period_end'])+timedelta(days=extension_days)).isoformat();qp=deepcopy(p)
        for t in qp['tasks']:
            if t['task_id'] in chosen:
                if t.get('locked') or t['status'] in ('completed','pending_review','in_progress'):raise ValueError('不能直接修改受保护任务截止')
                if t['deadline']!='待成员确认':t['deadline']=(c.day(t['deadline'])+timedelta(days=extension_days)).isoformat() if len(t['deadline'])==10 else (c.stamp(t['deadline'])+timedelta(days=extension_days)).isoformat()
        simulate('延期 '+str(extension_days)+' 天的条件性对比',qs,qp,{'extension_days':extension_days,'warning':'仅比较用户给定的空档；须另行确认比赛允许延期，不代表官方截止已变更'})
    # Reassign only to a verified capable member with explicitly supplied availability.
    for k in chosen:
        t=tasks[k]
        if len(t['owner_ids'])!=1 or t.get('locked') or t['status'] not in ('candidate','scheduled') or any(b['task_id']==k and b.get('locked') for b in p['time_blocks']):continue
        skills=set().union(*(set(g.get('required_capabilities',[])) for g in d['gaps'] if g['gap_id'] in t['gap_ids']))
        for m in d['member_profiles']:
            who=m['member_id']
            if who in t['owner_ids'] or who not in settings.get('members',{}) or not skills or not skills<=set(m.get('verified_capabilities',[])):continue
            qp=deepcopy(p);next(x for x in qp['tasks'] if x['task_id']==k)['owner_ids']=[who];qp['time_blocks']=[b for b in qp['time_blocks'] if b['task_id']!=k]
            simulate('协作候选：'+k+' → '+who,deepcopy(settings),qp,{'task_id':k,'from':t['owner_ids'],'to':[who],'warning':'仅为草案，接手人尚未确认'})
            if len(results)>=8:break
        if len(results)>=8:break
    return {'baseline_missing_minutes':base['schedule_summary']['unallocated_minutes'],'alternatives':results,'note':'各方案重新计算实际可行性；不能排下的方案仍显示缺口。'}
