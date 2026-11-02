"""B: evidence-linked deterministic plan drafts; no fabricated model calls."""
from copy import deepcopy
from datetime import datetime
import b_capacity


def generate(diagnosis, context):
    if not isinstance(diagnosis, dict) or not isinstance(context, dict):
        raise ValueError('诊断和上下文必须为对象')
    version = diagnosis.get('diagnosis_version')
    if type(version) is not int or version < 1:
        raise ValueError('缺少诊断版本')
    members = {m['member_id']: m for m in diagnosis.get('member_profiles', [])}
    sources = {s['source_id'] for s in diagnosis.get('sources', [])}
    gaps = diagnosis.get('gaps', [])
    if (not gaps and not diagnosis.get('resolution_confirmed')) or len(gaps) > 100 or len({g['gap_id'] for g in gaps}) != len(gaps):
        raise ValueError('需提供 1 至 100 个不重复的缺口')
    tasks, paths, pending = [], [], []
    assumptions = ['规则生成草案，未调用模型或搜索；负责人及估时需成员确认。',
                   '仅有已验证能力才跳过学习；前置成果验收前，下游保持阻塞。']
    for gap in gaps:
        if gap.get('status') == 'closed':
            continue
        key = gap['gap_id']
        refs = gap.get('source_refs', [])
        owners = gap.get('related_member_ids', [])
        criteria = gap.get('acceptance_criteria', [])
        if not refs or not set(refs) <= sources or not criteria or not all(isinstance(x,str) and x.strip() for x in criteria) or not gap.get('target_result') or not owners or not set(owners) <= members.keys():
            pending.append({'gap_id':key,'reason':'补充有效来源、负责人、目标产物和验收标准后才能进入计划'})
            continue
        micro_steps = gap.get('micro_steps')
        if micro_steps is not None:
            if not isinstance(micro_steps, list) or not micro_steps:
                raise ValueError('micro_steps 必须是非空列表；没有具体动作时应阻塞生产任务')
            step_ids = [x.get('step_id') for x in micro_steps if isinstance(x, dict)]
            if len(step_ids) != len(micro_steps) or any(not isinstance(x, str) or not x.strip() for x in step_ids) or len(set(step_ids)) != len(step_ids):
                raise ValueError('micro_steps 的 step_id 缺失或重复')
            for step in micro_steps:
                for field in ('target_locator', 'action', 'reason', 'expected_change', 'output', 'self_check', 'failure_next', 'capability_basis'):
                    if not isinstance(step.get(field), str) or not step[field].strip():
                        raise ValueError('微动作缺少可执行字段：' + field)
                iv = step.get('input_version')
                if not isinstance(iv, dict) or not isinstance(iv.get('artifact_id'), str) or not iv['artifact_id'].strip() or type(iv.get('artifact_version')) is not int or iv['artifact_version'] < 1:
                    raise ValueError('微动作必须绑定真实输入材料版本')
                step_refs = step.get('source_refs', [])
                if not isinstance(step_refs, list) or any(x not in sources for x in step_refs):
                    raise ValueError('微动作引用了不存在的来源')
                if not step_refs and not (isinstance(step.get('reference_not_required_reason'), str) and step['reference_not_required_reason'].strip()):
                    raise ValueError('微动作必须引用来源，或说明为什么不需要外部参考')
        previous = []
        for owner in owners:
            if 'capability_evidence' in members[owner]:
                from personal_guidance import prerequisites
                added, learning, heads = prerequisites(gap, owner, members[owner], diagnosis, context)
                tasks.extend(added); paths.extend(learning); previous.extend(heads)
                continue
            verified = set(members[owner].get('verified_capabilities', []))
            for i, skill in enumerate(gap.get('required_capabilities', [])):
                if skill in verified:
                    continue
                chain = []
                for stage, title, estimate in [('learn','学习必要方法',[10,20]),('practice','完成最小练习',[10,20])]:
                    tid = f'{key}:{owner}:{i}:{stage}'
                    tasks.append(dict(task_id=tid,title=f'{title}：{skill}',gap_ids=[key],owner_ids=[owner],
                        steps=[f'围绕「{gap["target_result"]}」{title}，记录可用于作品的方法'],
                        deliverable=f'{skill} 的方法笔记' if stage=='learn' else f'{skill} 的可检查练习成果',
                        acceptance_criteria=[f'展示该方法如何用于「{gap["target_result"]}」'],
                        estimate_minutes_range=estimate,depends_on=chain[-1:],deadline=gap.get('deadline',context.get('deadline','待成员确认')),
                        source_refs=refs,status='candidate' if not chain else 'blocked',estimate_basis='待校准假设',kind=stage))
                    chain.append(tid)
                previous.append(chain[-1])
                paths.append({'gap_id':key,'member_id':owner,'capability':skill,'task_ids':chain+[key+':deliver'],
                    'resources':[r for r in diagnosis.get('resource_candidates',[]) if r.get('capability')==skill]})
        estimate = gap.get('estimate_minutes_range',[30,60])
        if not isinstance(estimate,list) or len(estimate)!=2 or any(type(n)!=int or n<1 for n in estimate) or estimate[0]>estimate[1]:
            raise ValueError('估时范围无效：'+key)
        dependencies=previous+[dep+':deliver' for dep in gap.get('depends_on_gap_ids',[])]
        micro_steps = gap.get('micro_steps')
        steps_ready = isinstance(micro_steps, list) and bool(micro_steps)
        if not steps_ready:
            reason = '缺少 A 提供的 grounded micro_steps：当前作品位置、具体动作、预期改变、产物和验收方式未齐，不能进入生产执行。'
            pending.append({'task_id':key+':deliver','gap_id':key,'reason':reason})
        tasks.append(dict(task_id=key+':deliver',title=gap['target_result'],gap_ids=[key],owner_ids=owners,
            steps=[x['action'] for x in micro_steps] if steps_ready else ['等待 A 补齐真实作品位置与可验证的微动作；当前不可执行。'],
            deliverable=gap['target_result'],acceptance_criteria=criteria,estimate_minutes_range=estimate,
            depends_on=dependencies,deadline=gap.get('deadline',context.get('deadline','待成员确认')),
            source_refs=refs,status='blocked' if dependencies or not steps_ready else 'candidate',kind='production',
            estimate_basis=gap.get('estimate_basis','待校准假设：实际用时需由执行人记录')))
        if not steps_ready:
            tasks[-1]['execution_readiness'] = 'blocked_missing_grounded_micro_steps'
            tasks[-1]['blocker'] = reason
            tasks[-1]['external_dependencies'] = [reason]
        else:
            tasks[-1]['micro_steps'] = deepcopy(micro_steps)
        tasks[-1]['capability_requirements'] = [
            {'member_id':owner,'capability':skill} for owner in owners
            if 'capability_evidence' in members[owner] for skill in gap.get('required_capabilities', [])]
        if gap.get('manual_hold'):
            tasks[-1]['external_dependencies'] = ['当前复核判断未知；需人工核对：'+gap['gap_id']]
    ids={t['task_id'] for t in tasks}
    # Missing prerequisite is a visible external blocker, never silently removed.
    for t in tasks:
        external=[x for x in t['depends_on'] if x not in ids]
        if external:
            t['external_dependencies']=t.get('external_dependencies',[])+external
            t['depends_on']=[x for x in t['depends_on'] if x in ids]
            t['status']='blocked'
            pending.append({'task_id':t['task_id'],'reason':'前置缺口尚未形成有效任务：'+', '.join(external)})
    plan={'generation_context':deepcopy(context),'schema_version':'0.1','provider':'deterministic-action-planner','plan_version':1,
          'based_on_diagnosis_version':version,'tasks':tasks,'learning_paths':paths,'time_blocks':[],
          'dependencies':[{'task_id':t['task_id'],'depends_on':t['depends_on']} for t in tasks],
          'unscheduled':pending,'assumptions':assumptions,
          'milestones':[{'task_id':t['task_id'],'deadline':t['deadline'],'deliverable':t['deliverable']} for t in tasks if t['kind']=='production']}
    # Make each learning action refer to the concrete target and supplied material locator.
    for path in paths:
        if path.get('personalized'):
            continue
        for resource in path['resources']:
            label=resource.get('title') or resource.get('url') or 'A 提供的资料'
            locator=resource.get('section') or resource.get('locator') or '需确认相关章节'
            for task in tasks:
                if task['task_id']==path['task_ids'][0]:
                    task['steps']=['打开 '+label+'；定位 '+str(locator),'摘出能解决当前缺口的一项方法，并写出应用步骤']
                if task['task_id']==path['task_ids'][1]:
                    task['steps']=[resource.get('exercise') or '选当前作品中的一个最小片段，应用该方法，保留操作前后证据']
        path['route_options']=[{'resource':r.get('title') or r.get('url'),'section':r.get('section') or r.get('locator'),'estimated_learning_minutes':r.get('estimated_learning_minutes'),'conditions':r.get('conditions','适用条件待确认')} for r in path['resources']]
    validate(plan,diagnosis)
    return plan


def validate(plan, diagnosis):
    if plan['based_on_diagnosis_version'] != diagnosis['diagnosis_version']:
        raise ValueError('诊断版本已变化，请重新生成计划')
    if type(plan.get('plan_version')) is not int or plan['plan_version']<1: raise ValueError('计划版本无效')
    if not isinstance(plan.get('tasks'),list) or len(plan['tasks'])>1000: raise ValueError('任务列表无效')
    gaps={g['gap_id'] for g in diagnosis['gaps']}
    members={m['member_id'] for m in diagnosis['member_profiles']}
    sources={s['source_id'] for s in diagnosis['sources']}
    for t in plan['tasks']:
        for field in ('task_id','title','deliverable','deadline'):
            if not isinstance(t.get(field),str) or not t[field].strip():raise ValueError('任务缺少 '+field)
        for field,known in [('gap_ids',gaps),('owner_ids',members),('source_refs',sources)]:
            if not isinstance(t.get(field),list) or not t[field] or not set(t[field])<=known or len(t[field])!=len(set(t[field])):raise ValueError('任务关联无效：'+field)
        for field in ('steps','acceptance_criteria'):
            if not isinstance(t.get(field),list) or not t[field] or not all(isinstance(x,str) and x.strip() for x in t[field]):raise ValueError('任务缺少 '+field)
        if t.get('kind') == 'production' and not t.get('micro_steps'):
            if t.get('status') != 'blocked' or not t.get('external_dependencies') or t.get('execution_readiness') != 'blocked_missing_grounded_micro_steps':
                raise ValueError('生产任务缺少 grounded micro_steps 时必须保持 blocked，不得伪装成可执行任务')
        if not isinstance(t.get('depends_on'),list):raise ValueError('依赖需为列表')
        nums=t.get('estimate_minutes_range')
        if not isinstance(nums,list) or len(nums)!=2 or any(type(n)!=int or not 1<=n<=100000 for n in nums) or nums[0]>nums[1]:raise ValueError('估时范围无效')
        if t['status'] not in ('candidate','scheduled','in_progress','blocked','pending_review','completed'):raise ValueError('任务状态无效')
        if t['deadline']!='待成员确认':
            c=t['deadline'];b_capacity.day(c) if len(c)==10 else b_capacity.stamp(c)
    tasks={t['task_id']:t for t in plan['tasks']}
    if len(tasks)!=len(plan['tasks']): raise ValueError('任务编号重复')
    visited=set()
    def visit(key, path):
        if key in path: raise ValueError('任务依赖循环')
        if key not in tasks: raise ValueError('前置任务不存在')
        if key in visited: return
        for dep in tasks[key]['depends_on']: visit(dep,path|{key})
        visited.add(key)
    for key in tasks: visit(key,set())
    slots=[]
    for block in plan['time_blocks']:
        t=tasks[block['task_id']]
        a,b=b_capacity.stamp(block['start']),b_capacity.stamp(block['end'])
        who=block['member_id']
        if who not in t['owner_ids'] or b<=a: raise ValueError('原日程无效')
        if any(who==w and a<y and b>x for w,x,y in slots): raise ValueError('原日程重叠')
        slots.append((who,a,b))
    for t in tasks.values():
        if len(t['owner_ids'])>1:
            blocks=[b for b in plan['time_blocks'] if b['task_id']==t['task_id']]
            for block in blocks:
                matching=[b for b in blocks if b['start']==block['start'] and b['end']==block['end']]
                if {b['member_id'] for b in matching}!=set(t['owner_ids']) or len({bool(b.get('locked')) for b in matching})>1:
                    raise ValueError('共同任务各成员需具有同步且锁定状态一致的时段')


def replan(diagnosis, plan, settings, expected_plan_version, now=None):
    validate(plan,diagnosis)
    if expected_plan_version!=plan['plan_version']: raise ValueError('计划版本已变化，请刷新')
    if 'members' in settings:
        from b_refinements import expand
        settings=expand(settings)
    draft=deepcopy(plan)
    tasks={t['task_id']:t for t in draft['tasks']}
    for t in tasks.values():
        if t['status']=='blocked' and t.get('depends_on') and not t.get('external_dependencies') and not t.get('blocker') and all(tasks[d]['status']=='completed' for d in t['depends_on']):
            t['status']='candidate'
    if 'members' in settings:
        from b_joint_schedule import compute
        result=compute(diagnosis,draft,settings,now=now)
    else:
        result=b_capacity.compute({'diagnosis':diagnosis,'plan':draft},settings,now=now)
    allocated={b['task_id'] for b in result['time_blocks']}
    for t in result['tasks']:
        if t['status'] in ('candidate','scheduled'):
            t['status']='scheduled' if t['task_id'] in allocated else 'candidate'
    result['changes']=[{'task_id':key,'before':[b for b in plan['time_blocks'] if b['task_id']==key],
        'after':[b for b in result['time_blocks'] if b['task_id']==key],'reason':('；'.join(x['reason'] for x in result['unscheduled'] if isinstance(x,dict) and x.get('task_id')==key) or '按成员当前空档、占用与每日上限重新安排；下方列出前后时段')}
        for key in tasks if [b for b in plan['time_blocks'] if b['task_id']==key]!=[b for b in result['time_blocks'] if b['task_id']==key]]
    validate(result,diagnosis)
    return result


def edit(diagnosis, plan, task_id, patch, expected_plan_version):
    """Edit draft definition, never overwrite execution evidence or completion."""
    validate(plan,diagnosis)
    if plan['plan_version']!=expected_plan_version:raise ValueError('计划版本已变化')
    result=deepcopy(plan)
    t=next((x for x in result['tasks'] if x['task_id']==task_id),None)
    if t is None:raise ValueError('任务不存在')
    if t['status'] in ('completed','pending_review','in_progress') or t.get('locked'):raise ValueError('执行中、待验收、完成或锁定任务需由队长处理变更')
    allowed={'title','steps','deliverable','acceptance_criteria','estimate_minutes_range','deadline','owner_ids','depends_on'}
    if not isinstance(patch,dict) or not set(patch)<=allowed:raise ValueError('包含不可编辑字段')
    if any(b['task_id']==task_id and b.get('locked') for b in plan['time_blocks']):raise ValueError('任务已有锁定时段')
    t.update(deepcopy(patch))
    # A definition change invalidates this task and downstream schedules.
    affected={task_id}
    while True:
        extra={x['task_id'] for x in result['tasks'] if set(x['depends_on'])&affected}
        if extra<=affected:break
        affected |= extra
    if any(x['task_id'] in affected-{task_id} and (x['status'] in ('completed','pending_review','in_progress') or x.get('locked')) for x in result['tasks']) or any(b['task_id'] in affected and b.get('locked') for b in plan['time_blocks']):raise ValueError('修改影响受保护的下游任务，请交队长确认')
    result['time_blocks']=[b for b in result['time_blocks'] if b['task_id'] not in affected]
    for x in result['tasks']:
        if x['task_id'] in affected:
            x['status']='blocked' if x['depends_on'] or x.get('external_dependencies') else 'candidate'
    result['dependencies']=[{'task_id':x['task_id'],'depends_on':x['depends_on']} for x in result['tasks']]
    result['milestones']=[{'task_id':x['task_id'],'deadline':x['deadline'],'deliverable':x['deliverable']} for x in result['tasks'] if x.get('kind')=='production']
    result['unscheduled']=[x for x in result['unscheduled'] if not isinstance(x,dict) or x.get('task_id') not in affected]+[{'task_id':x,'reason':'任务定义或前置变化，需要重新选择排程'} for x in sorted(affected)]
    result.pop('schedule_summary',None)
    result['plan_version']+=1
    result['changes']=[{'task_id':x,'reason':'任务编辑影响本任务及下游；旧安排已移出，待重新排程'} for x in sorted(affected)]
    validate(result,diagnosis)
    return result


def feedback(diagnosis,plan,task_id,actual_minutes,remaining_minutes,expected_plan_version):
    validate(plan,diagnosis)
    if plan['plan_version']!=expected_plan_version:raise ValueError('计划版本已变化')
    if any(type(n)!=int or not 0<=n<=100000 for n in (actual_minutes,remaining_minutes)):raise ValueError('实际和剩余用时必须是非负整数')
    result=deepcopy(plan);t=next((x for x in result['tasks'] if x['task_id']==task_id),None)
    if t is None or t['status'] in ('completed','pending_review') or t.get('locked') or any(b['task_id']==task_id and b.get('locked') for b in plan['time_blocks']):raise ValueError('任务不存在或已受保护')
    if t['status']=='blocked' or any(next(x for x in result['tasks'] if x['task_id']==dep)['status']!='completed' for dep in t['depends_on']):raise ValueError('先解除阻塞并验收前置成果，再记录执行')
    if actual_minutes<t.get('actual_minutes',0):raise ValueError('实际用时为累计值，不能小于上次记录')
    t['actual_minutes']=actual_minutes;t['remaining_minutes']=remaining_minutes
    t['status']='pending_review' if remaining_minutes==0 else 'in_progress'
    t['estimate_revision']={'predicted_total_minutes':actual_minutes+remaining_minutes,'original_range':t['estimate_minutes_range'],'basis':'成员累计实际用时与剩余估计；不自动认定验收完成'}
    result['plan_version']+=1
    # Keep history; clear obsolete future bookings so they cannot overstate capacity.
    now=datetime.now(b_capacity.TZ)
    result['time_blocks']=[b for b in result['time_blocks'] if b['task_id']!=task_id or b_capacity.stamp(b['start'])<now]
    result['changes']=[{'task_id':task_id,'reason':'实际用时更新；未来安排需按剩余用时重排。剩余为零仅进入待验收。'}]
    result.pop('schedule_summary',None)
    return result
