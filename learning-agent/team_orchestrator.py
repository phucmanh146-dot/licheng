"""Captain-owned P1 handoff, durable versions and evidence review.
A/B implementations plug into run_handoff; demo fixtures never imply live AI.
"""
from contextlib import contextmanager, closing
import copy
import json
import uuid
from datetime import datetime
import learning_agent as agent

@contextmanager
def connection():
    with closing(agent.connection()) as c:
        with c:
            yield c

class Conflict(ValueError):
    pass

def required(obj, key, kind=str):
    if not isinstance(obj, dict):
        raise ValueError('交接条目必须为 JSON 对象')
    value = obj.get(key)
    if not isinstance(value, kind) or (kind is str and not value.strip()):
        raise ValueError(f'{key} 缺失或格式错误')
    return value

def integer(obj, key, minimum=0):
    value = obj.get(key)
    if type(value) is not int or value < minimum:
        raise ValueError(f'{key} 必须为不小于 {minimum} 的整数')
    return value

def unique(rows, key):
    values = [required(x, key) for x in rows]
    if len(set(values)) != len(values):
        raise ValueError(f'{key} 重复')
    return set(values)

def strings(obj, key, nonempty=False):
    value = required(obj, key, list)
    if (nonempty and not value) or any(not isinstance(x, str) or not x.strip() for x in value):
        raise ValueError(f'{key} 必须是有效文字列表')
    return value

def init(c):
    c.executescript('''CREATE TABLE IF NOT EXISTS team_projects(id TEXT PRIMARY KEY,version INTEGER,body TEXT);
    CREATE TABLE IF NOT EXISTS team_history(project_id TEXT,version INTEGER,body TEXT,action TEXT,created TEXT,PRIMARY KEY(project_id,version));''')

def view(project):
    value = copy.deepcopy(project)
    value['plan_stale'] = bool(value['plan'] and (value.get('diagnosis_needs_refresh') or value['plan']['based_on_diagnosis_version'] != value['diagnosis']['diagnosis_version']))
    for rescue in value.get('rescue_requests', []):
        rescue['stale'] = bool(value['plan_stale'] or not value['plan'] or
                               value['plan']['plan_version'] != rescue['plan_version'] or
                               value['diagnosis']['diagnosis_version'] != rescue['diagnosis_version'])
    from team_dispatch import dashboard
    value['dispatch_status'] = dashboard(value)
    from team_recovery import summary
    value['recovery_summary'] = summary(value)
    return value

def state(identifier=None):
    with connection() as c:
        init(c)
        if identifier:
            row = c.execute('SELECT body FROM team_projects WHERE id=?', (identifier,)).fetchone()
            if not row:
                raise ValueError('项目不存在')
            value = view(json.loads(row['body']))
            value['history'] = [dict(x) for x in c.execute('SELECT version,action,created FROM team_history WHERE project_id=? ORDER BY version DESC', (identifier,))]
            return value
        return {'projects': [view(json.loads(x['body'])) for x in c.execute('SELECT body FROM team_projects ORDER BY rowid DESC LIMIT 100')]}

def commit(project, expected, action, write=None):
    with agent.WRITE_LOCK, connection() as c:
        init(c)
        c.execute('BEGIN IMMEDIATE')
        row = c.execute('SELECT version FROM team_projects WHERE id=?', (project['project_id'],)).fetchone()
        current = row['version'] if row else 0
        if current != expected:
            raise Conflict('项目已更新，请刷新后重试；旧版本未覆盖新状态')
        project = copy.deepcopy(project)
        project.pop('history', None)
        project.pop('plan_stale', None)
        project.pop('dispatch_status', None)
        project.pop('recovery_summary', None)
        project['version'] = current + 1
        project['updated_at'] = agent.now()
        if write is not None:
            write(c)
        body = agent.dump(project)
        c.execute('INSERT OR REPLACE INTO team_projects VALUES(?,?,?)', (project['project_id'], current+1, body))
        c.execute('INSERT INTO team_history VALUES(?,?,?,?,?)', (project['project_id'], current+1, body, action, agent.now()))
    return view(project)

def current(data):
    p = state(required(data, 'project_id'))
    if integer(data, 'expected_version') != p['version']:
        raise Conflict('项目已更新，请刷新后重试')
    return p

def create(data):
    mode = data.get('mode', 'demo')
    if mode not in ('demo', 'live'):
        raise ValueError('mode 必须为 demo 或 live')
    return commit({'schema_version':'0.1', 'project_id':uuid.uuid4().hex, 'goal':required(data,'goal'),
                   'mode':mode, 'timezone':'Asia/Shanghai', 'diagnosis':None, 'plan':None,
                   'proposal':None, 'feedback':[], 'live_verified':False}, 0, '创建项目')

def artifact_catalog(d):
    """Optional version catalog. These are declared references, not file inspection."""
    if 'artifact_versions' not in d:
        return set()
    catalog = set()
    for row in required(d, 'artifact_versions', list):
        key = (required(row, 'artifact_id'), integer(row, 'artifact_version', 1))
        required(row, 'title')
        if key in catalog:
            raise ValueError('材料版本重复')
        catalog.add(key)
    return catalog

def validate_artifact_ref(value, catalog):
    key = (required(value, 'artifact_id'), integer(value, 'artifact_version', 1))
    if key not in catalog:
        raise ValueError('引用了未登记的材料版本；请 A 补齐 artifact_versions')

def validate_micro_steps(t, d):
    if 'micro_steps' not in t:
        return  # Existing v0.1 plans stay usable and visibly lack fine guidance.
    rows = required(t, 'micro_steps', list)
    if not rows:
        raise ValueError('micro_steps 不能为空；尚未提供时请省略此字段')
    unique(rows, 'step_id')
    catalog = artifact_catalog(d)
    sources = {x['source_id'] for x in d['sources']}
    for row in rows:
        validate_artifact_ref(required(row, 'input_version', dict), catalog)
        for key in ('target_locator', 'action', 'reason', 'expected_change', 'output',
                    'self_check', 'failure_next', 'capability_basis'):
            required(row, key)
        if 'source_refs' in row and not set(strings(row, 'source_refs', True)).issubset(sources):
            raise ValueError('细步骤引用了不存在的来源')

def validate_diagnosis(d):
    integer(d, 'diagnosis_version', 1)
    for key in ('requirements','sources','artifact_status','member_profiles','gaps','resource_candidates','unknowns'):
        required(d,key,list)
    sources = unique(d['sources'], 'source_id')
    for source in d['sources']:
        if source.get('kind') not in ('official','user_material','reference','suggestion'):
            raise ValueError('来源 kind 必须说明官方、用户材料、参考或建议')
        required(source,'title')
    members = unique(d['member_profiles'],'member_id')
    catalog = artifact_catalog(d)
    unique(d['gaps'],'gap_id')
    for gap in d['gaps']:
        for key in ('current_evidence','target_result','gap_type','priority_reason','verification_status'):
            required(gap,key)
        strings(gap,'required_capabilities')
        if not set(strings(gap,'related_member_ids')).issubset(members):
            raise ValueError('差距引用了不存在的成员')
        if not set(strings(gap,'source_refs')).issubset(sources):
            raise ValueError('差距引用了不存在的来源')
        if not gap['source_refs'] and gap['verification_status'] == 'verified':
            raise ValueError('没有来源的差距不能标为已核验')
        for key in ('current_locator', 'target_locator', 'reason', 'applicability', 'verification_method'):
            if key in gap:
                required(gap, key)
        if 'current_artifact' in gap:
            validate_artifact_ref(required(gap, 'current_artifact', dict), catalog)

def diagnosis(data):
    p = current(data)
    d = copy.deepcopy(required(data,'diagnosis',dict))
    validate_diagnosis(d)
    if p.get('artifact_storage_required'):
        import artifact_store
        from personal_guidance import skill_status, capability_basis
        known_members = {m['member_id']:m for m in p.get('member_task_briefs', [])}
        for member in d['member_profiles']:
            if member['member_id'] not in known_members:
                raise ValueError('先登记本人任务；诊断不能新增未确认成员')
            actual = known_members[member['member_id']]
            member['capability_evidence'] = copy.deepcopy(actual['capability_evidence'])
            member['verified_capabilities'] = sorted({r['capability'] for r in actual['capability_evidence'] if skill_status(actual,r['capability'])[0]=='verified'})
        for gap in d['gaps']:
            prior = next((g for g in (p.get('diagnosis') or {}).get('gaps', []) if g['gap_id']==gap['gap_id']),None)
            if gap.get('status') == 'closed' and (not prior or prior.get('status')!='closed' or
                    gap.get('confirmed_review_id') not in p.get('applied_review_ids', [])):
                raise ValueError('关闭差距必须来自本项目已确认且已应用的成果复核')
            if gap.get('history_only'):
                if not prior or prior.get('status')!='closed' or prior.get('confirmed_review_id') not in p.get('applied_review_ids', []):
                    raise ValueError('不能声明未确认的差距仅为历史而跳过证据核对')
                continue
            if gap.get('status') != 'closed':
                if gap.get('verification_status') in ('unknown', 'blocked'):
                    if gap.get('micro_steps'):
                        raise ValueError('unknown/blocked 差距不能提前生成生产微动作；先补证据并重新诊断')
                    continue
                ref = required(gap,'current_artifact',dict)
                artifact_store.references(p, gap.get('evidence_refs'), (ref['artifact_id'], ref['artifact_version']))
                if gap.get('verification_status') in ('verified', 'evidence_linked_pending_confirmation'):
                    required(gap, 'current_locator')
                    required(gap, 'current_evidence')
                    required(gap, 'extract_pattern')
                    referenced = [s for s in d['sources'] if s['source_id'] in gap.get('source_refs', [])]
                    if not referenced:
                        raise ValueError('已核验差距必须绑定真实来源')
                    for source in referenced:
                        if source.get('kind') == 'reference' and not (source.get('reference_locator') or gap.get('reference_locator')):
                            raise ValueError('参考来源必须定位到原始页、段落、章节或代码位置')
                    steps = required(gap, 'micro_steps', list)
                    if not steps:
                        raise ValueError('已核验差距必须提供 grounded micro_steps')
                    for step in steps:
                        step['capability_basis'] = capability_basis(gap, d['member_profiles'])
                        step['capability_basis_source'] = 'server_member_records'
                    validate_micro_steps({'micro_steps':steps},d)
                    for step in steps:
                        artifact_store.read(p, step['input_version']['artifact_id'], step['input_version']['artifact_version'])
    if p['diagnosis'] and d['diagnosis_version'] <= p['diagnosis']['diagnosis_version']:
        raise Conflict('诊断版本必须递增')
    if p['plan'] and not p.get('plan_diagnosis') and p['diagnosis'] and p['plan']['based_on_diagnosis_version'] == p['diagnosis']['diagnosis_version']:
        p['plan_diagnosis'] = copy.deepcopy(p['diagnosis'])
    p['diagnosis'], p['proposal'] = d, None
    p['diagnosis_needs_refresh'] = False
    return commit(p,p['version'],'接收 A 的诊断；原计划保留并检查是否过期')

def validate_plan(plan, d):
    integer(plan,'plan_version',1)
    if integer(plan,'based_on_diagnosis_version',1) != d['diagnosis_version']:
        raise Conflict('计划依据的诊断已过期，请 B 更新')
    for key in ('tasks','learning_paths','time_blocks','dependencies','unscheduled','assumptions'):
        required(plan,key,list)
    ids = unique(plan['tasks'],'task_id')
    gaps = {x['gap_id'] for x in d['gaps']}
    members = {x['member_id'] for x in d['member_profiles']}
    sources = {x['source_id'] for x in d['sources']}
    deps = {}
    for t in plan['tasks']:
        for key in ('title','deliverable','deadline'):
            required(t,key)
        strings(t,'steps',True); strings(t,'acceptance_criteria',True)
        for key, allowed, needed in (('gap_ids',gaps,True),('owner_ids',members,True),('source_refs',sources,False),('depends_on',ids,False)):
            if not set(strings(t,key,needed)).issubset(allowed):
                raise ValueError(f'{key} 引用了不存在的对象')
        nums = required(t,'estimate_minutes_range',list)
        if len(nums)!=2 or any(type(n) is not int or n<1 for n in nums) or nums[0]>nums[1]:
            raise ValueError('估时必须是有效分钟范围')
        if t.get('status') not in ('candidate','scheduled','in_progress','pending_review','completed','blocked'):
            raise ValueError('任务状态无效')
        validate_micro_steps(t, d)
        if t.get('kind') == 'production' and not t.get('micro_steps'):
            if t.get('status') != 'blocked' or t.get('execution_readiness') != 'blocked_missing_grounded_micro_steps' or not t.get('external_dependencies'):
                raise ValueError('生产任务缺少 grounded micro_steps 时必须阻塞，不能作为可执行任务')
        deps[t['task_id']] = t['depends_on']
    visited = set()
    def visit(key, path):
        if key in visited:
            return
        if key in path:
            raise ValueError('任务依赖存在循环')
        for dep in deps[key]:
            visit(dep,path|{key})
        visited.add(key)
    for key in ids:
        visit(key,set())
    slots = []
    for block in plan['time_blocks']:
        if required(block,'task_id') not in ids:
            raise ValueError('时段引用不存在的任务')
        owner = required(block,'member_id')
        task = next(t for t in plan['tasks'] if t['task_id']==block['task_id'])
        if owner not in task['owner_ids']:
            raise ValueError('时段成员不是任务负责人')
        try:
            start,end = (datetime.fromisoformat(required(block,k)) for k in ('start','end'))
        except ValueError:
            raise ValueError('时段必须为带时区的 ISO 日期时间')
        if not start.tzinfo or not end.tzinfo or end<=start:
            raise ValueError('时段时区或起止顺序无效')
        if any(who==owner and start<b and end>a for who,a,b in slots):
            raise ValueError('同一成员时段重叠')
        slots.append((owner,start,end))

def protected(old, new):
    previous = {t['task_id']:t for t in (old or {}).get('tasks',[])}
    latest = {t['task_id']:t for t in new['tasks']}
    for key,t in previous.items():
        if t['status']!='candidate' or t.get('locked'):
            if latest.get(key)!=t:
                raise ValueError('重排不得覆盖已开始、已完成、待验收或锁定任务：'+key)
    for t in new['tasks']:
        if t['task_id'] not in previous and t['status'] not in ('candidate','scheduled','blocked'):
            raise ValueError('新任务不能伪造执行或完成状态')
        if t['task_id'] in previous and previous[t['task_id']]['status']=='candidate' and t['status'] not in ('candidate','scheduled','blocked'):
            raise ValueError('排程不能代替执行和验收')
    for block in (old or {}).get('time_blocks',[]):
        if block.get('locked') and block not in new['time_blocks']:
            raise ValueError('锁定时段不能被重排覆盖')

def propose(data):
    p = current(data)
    if not p['diagnosis'] or p.get('diagnosis_needs_refresh'):
        raise ValueError('先接收基于最新补充信息的 A 诊断')
    plan = copy.deepcopy(required(data,'plan',dict))
    validate_plan(plan,p['diagnosis'])
    if p['plan'] and plan['plan_version']<=p['plan']['plan_version']:
        raise Conflict('计划版本必须递增')
    protected(p['plan'],plan)
    old = {t['task_id']:t for t in (p['plan'] or {}).get('tasks',[])}
    new = {t['task_id']:t for t in plan['tasks']}
    p['proposal'] = {'id':uuid.uuid4().hex,'plan':plan,'reason':required(data,'reason'),
                     'diff':{'added':sorted(new.keys()-old.keys()),'removed':sorted(old.keys()-new.keys()),
                             'changed':[k for k in new.keys()&old.keys() if new[k]!=old[k]],
                             'time_blocks_before':(p['plan'] or {}).get('time_blocks',[]),'time_blocks_after':plan['time_blocks']}}
    return commit(p,p['version'],'保存 B 的计划预览，等待用户采用')

def apply(data):
    p = current(data)
    proposal = p['proposal']
    if not proposal or data.get('proposal_id')!=proposal['id']:
        raise Conflict('预览已失效，请重新生成')
    validate_plan(proposal['plan'],p['diagnosis'])
    protected(p['plan'],proposal['plan'])
    p['undo_plan'] = copy.deepcopy(p['plan'])
    p['undo_at_version'] = p['version'] + 1
    p['plan'],p['proposal'] = proposal['plan'],None
    p['plan_diagnosis'] = copy.deepcopy(p['diagnosis'])
    return commit(p,p['version'],'用户采用计划')

def validate_criterion_results(data, task):
    rows = required(data, 'criterion_results', list)
    criteria = task['acceptance_criteria']
    if len(rows) != len(criteria):
        raise ValueError('验收必须逐条对应任务的验收条件')
    for row, criterion in zip(rows, criteria):
        if required(row, 'criterion') != criterion or type(row.get('passed')) is not bool:
            raise ValueError('验收条件或通过状态无效，请刷新后重新核对')
        required(row, 'evidence')
    if not all(row['passed'] for row in rows):
        raise ValueError('有验收条件未通过，请退回修改；不能标记完成')
    return copy.deepcopy(rows)

def validate_task_start(p, t):
    """Shared by normal execution and recovery. Never bypass prerequisites."""
    if t['status'] not in ('candidate','scheduled','blocked'):
        raise ValueError('当前状态不能开始')
    if t.get('guidance_required'):
        raise ValueError('先补齐具体操作步骤并更新计划，不能开始制作')
    if any(x['task_id'] in t['depends_on'] and x['status']!='completed' for x in p['plan']['tasks']):
        raise ValueError('前置任务尚未验收完成')
    if t.get('external_dependencies'):
        raise ValueError('外部前置成果尚未交付，不能开始任务')
    if t.get('capability_requirements'):
        from personal_guidance import skill_status
        members = {m['member_id']:m for m in p['diagnosis']['member_profiles']}
        for needed in t['capability_requirements']:
            if skill_status(members[needed['member_id']], needed['capability'])[0] != 'verified':
                raise ValueError('先保存当前能力的实际试做结果并更新诊断，再开始制作：'+needed['capability'])
    active = next((x for x in p['plan']['tasks'] if x['task_id'] != t['task_id'] and x['status']=='in_progress'
                   and set(x['owner_ids']) & set(t['owner_ids'])), None)
    if active:
        raise ValueError('请先保存当前进行中任务的现场，再切换任务：'+active['title'])

def assert_independent_reviewer(p, task, reviewer_id):
    """Recorded project identities, not authentication or semantic verification."""
    if not p.get('artifact_storage_required') or task.get('kind') in ('trial','learn','practice','retest'):
        return
    submission = task.get('submission') or {}
    # Legacy submissions predate executor snapshots: conservatively use all owners.
    executors = submission.get('executor_ids', task.get('owner_ids', []))
    if not executors:
        raise ValueError('执行者未确认，不能完成独立复核；请补充执行记录后重新提交')
    if reviewer_id in executors:
        raise ValueError('独立复核不能由本次成果执行者完成，请选择另一位项目成员')


def feedback(data):
    p = current(data)
    if not p['plan'] or p['plan_stale']:
        raise Conflict('没有有效计划，请先更新并采用计划')
    if integer(data,'expected_plan_version',1)!=p['plan']['plan_version']:
        raise Conflict('计划已更新，请刷新')
    t = next((t for t in p['plan']['tasks'] if t['task_id']==data.get('task_id')),None)
    if not t:
        raise ValueError('任务不存在')
    action = required(data,'action')
    note = required(data,'note')
    record = {'task_id':t['task_id'],'action':action,'note':note,'created':agent.now(),
              'expected_plan_version':p['plan']['plan_version'], 'diagnosis_version':p['diagnosis']['diagnosis_version']}
    if action in ('start','resume'):
        import team_recovery
        if team_recovery.active_checkpoint(p, t['task_id']):
            raise ValueError('任务保存了中断现场，请从“返回原任务”入口核对条件后继续')
        validate_task_start(p, t)
        t['status']='in_progress'
    elif action=='submit':
        if t['status']!='in_progress':
            raise ValueError('请先开始任务')
        record['artifact_id']=required(data,'artifact_id')
        record['artifact_version']=integer(data,'artifact_version',1)
        if p.get('artifact_storage_required'):
            import artifact_store
            artifact_store.read(p, record['artifact_id'], record['artifact_version'])
        record['actual_minutes']=integer(data,'actual_minutes')
        record['evidence']=required(data,'evidence')
        executors = data.get('executor_ids', t['owner_ids'])
        if (not isinstance(executors, list) or not executors or
                any(not isinstance(x, str) or not x.strip() for x in executors) or
                len(set(executors)) != len(executors) or
                not set(executors) <= {m['member_id'] for m in p['diagnosis']['member_profiles']}):
            raise ValueError('executor_ids 需要不重复的实际执行成员编号，且必须属于本项目')
        record['executor_ids'] = list(executors)
        record['executor_record_source'] = 'declared' if 'executor_ids' in data else 'task_owner_snapshot'
        t['submission']=copy.deepcopy(record)
        t.pop('external_review', None)
        t['status']='pending_review'
    elif action in ('approve','reject'):
        if t['status']!='pending_review' or not t.get('submission'):
            raise ValueError('请先提交成果证据，再验收')
        record['reviewer_id']=required(data,'reviewer_id')
        record['artifact_id']=t['submission']['artifact_id']
        record['artifact_version']=t['submission']['artifact_version']
        if p.get('artifact_storage_required'):
            import artifact_store
            artifact_store.read(p, record['artifact_id'], record['artifact_version'])
        if record['reviewer_id'] not in {m['member_id'] for m in p['diagnosis']['member_profiles']}:
            raise ValueError('验收成员不在项目中')
        assert_independent_reviewer(p, t, record['reviewer_id'])
        record['evidence']=t['submission']['evidence']
        packet = (t.get('external_review') or {}).get('packet')
        if action == 'approve' and p.get('artifact_storage_required') and t.get('kind') not in ('trial','learn','practice','retest'):
            # A review receipt and the human confirmation are separate events.
            # Recheck the ledger and versions even when the task itself was protected
            # during a later plan preview; advance() requires this exact pairing.
            review_id = (t.get('external_review') or {}).get('review_id')
            received = next((r for r in p.get('artifact_reviews', []) if r['review_id'] == review_id), None)
            if not packet or not received or received.get('source') != 'A_handoff' or received['packet'] != packet:
                raise ValueError('请先接收 A 对实际新版的逐项复核，再人工确认验收')
            if (packet['plan_version'] != p['plan']['plan_version'] or
                    packet['diagnosis_version'] != p['diagnosis']['diagnosis_version'] or
                    packet['task_id'] != t['task_id'] or
                    (packet['artifact_id'], packet['artifact_version']) !=
                    (record['artifact_id'], record['artifact_version'])):
                raise Conflict('A 复核对应的计划、诊断或成果版本已变化，请重新核对新版复核')
            record['review_id'] = review_id
        if action == 'approve' and packet and not all(r['passed'] for r in packet['criterion_results']):
            raise ValueError('A 复核仍有验收条件未通过，请退回修改或接收更新后的复核')
        # Finishing a task (especially learning) is distinct from closing a gap.
        # Keep A's remaining/unknown gap evidence even after this task passes.
        if action == 'approve' and (packet or t.get('micro_steps') or 'criterion_results' in data):
            record['criterion_results'] = validate_criterion_results(data, t)
        t['status']='completed' if action=='approve' else 'in_progress'
        t['review']=copy.deepcopy(record)
        if action == 'reject' and any(x['task_id'] != t['task_id'] and x['status']=='in_progress'
                and set(x['owner_ids']) & set(t['owner_ids']) for x in p['plan']['tasks']):
            t['status']='blocked'
            t['blocker']='成果被退回；先保存当前任务现场，再核对复核意见并重新开始'
        if action == 'approve':
            import team_recovery
            team_recovery.accepted_event(p, t['task_id'])
    elif action=='block':
        if t['status'] not in ('candidate','scheduled','in_progress'):
            raise ValueError('当前状态不能标记卡住')
        t['status']='blocked'; record['blocker']=note
    elif action=='change':
        record['unexpected_event']=data.get('unexpected_event',note)
        record['availability_change']=data.get('availability_change',{})
    elif action=='lock':
        t['locked']=True
    else:
        raise ValueError('未知反馈动作')
    p['feedback'].append(record)
    p['proposal']=None
    return commit(p,p['version'],'执行反馈：'+action)

def run_handoff(data, researcher, planner):
    """Trusted server-side callables; B receives the validated persisted A package.
    No dynamic imports, arbitrary endpoint execution or live claim from user input.
    """
    p=current(data)
    d=researcher(copy.deepcopy(p))
    p=diagnosis({'project_id':p['project_id'],'expected_version':p['version'],'diagnosis':d})
    plan=planner(copy.deepcopy(p['diagnosis']),copy.deepcopy(p))
    return propose({'project_id':p['project_id'],'expected_version':p['version'],'plan':plan,'reason':'A → B 程序交接；待用户采用'})

def demo(data):
    p=current(data)
    if p['mode']!='demo' or p['diagnosis']:
        raise ValueError('仅空的 Demo 项目可运行示例；真实项目请接入队友接口')
    return run_handoff(data,demo_researcher,demo_planner)

def demo_researcher(context):
    return {'diagnosis_version':(context.get('diagnosis') or {}).get('diagnosis_version',0)+1,'requirements':[context['goal']], 'sources':[{'source_id':'input','kind':'user_material','title':'本次目标'}],
            'artifact_status':[],'member_profiles':[{'member_id':'captain','name':'队长'},{'member_id':'A','name':'诊断研究'},{'member_id':'B','name':'行动排程'}],
            'gaps':[{'gap_id':'G1','current_evidence':'Demo：尚未提供试用记录','target_result':'一份可复核的流程记录','gap_type':'evidence',
                     'related_member_ids':['captain'],'required_capabilities':['记录与验收'],'source_refs':['input'],'priority_reason':'先验证交接','verification_status':'demo_fixture'}],
            'resource_candidates':[],'unknowns':['Demo 没有调用真实模型或搜索；实际差距待 A 判断']}

def demo_planner(d, context):
    return {'plan_version':(context.get('plan') or {}).get('plan_version',0)+1,'based_on_diagnosis_version':d['diagnosis_version'],
            'tasks':[{'task_id':'T1','title':'验证一次三人交接','gap_ids':[d['gaps'][0]['gap_id']],'owner_ids':['captain'],
                      'steps':['核对诊断与来源','记录一次操作结果','提交证据并请成员验收'],'deliverable':'操作记录',
                      'acceptance_criteria':['记录目标、步骤、结果和卡点'],'estimate_minutes_range':[5,15],
                      'depends_on':[],'deadline':'待成员确认','source_refs':['input'],'status':'candidate'}],
            'learning_paths':[],'time_blocks':[],'dependencies':[],'unscheduled':['T1：尚未提供可用时段'],
            'assumptions':['人工构造的 Demo 任务，未进行智能排期']}


def period_replan(data):
    p = current(data)
    if not p['plan'] or p['plan_stale']:
        raise Conflict('请先采用基于最新诊断的计划')
    if integer(data,'expected_plan_version',1) != p['plan']['plan_version']:
        raise Conflict('计划版本已变化，请刷新')
    from period_planner import compute
    constraints = copy.deepcopy(required(data,'constraints',dict))
    plan = compute(p,constraints)
    return propose({**data,'plan':plan,'reason':required(data,'reason')})


def undo_plan(data):
    p = current(data)
    if not p.get('undo_plan') or p.get('undo_at_version') != p['version']:
        raise Conflict('没有可直接撤销的安排，或采用后已有新进度；请重新预览调整，避免覆盖成果')
    previous = copy.deepcopy(p['undo_plan'])
    previous['plan_version'] = p['plan']['plan_version'] + 1
    validate_plan(previous,p['diagnosis'])
    p['plan'],p['proposal'],p['undo_plan'] = previous,None,None
    return commit(p,p['version'],'撤销上次计划采用；保留版本历史')
