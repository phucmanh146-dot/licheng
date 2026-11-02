"""Captain's durable A/B routing. Providers are trusted server-side callables only."""
import copy
import uuid
import team_orchestrator as team

BOOT_ID = uuid.uuid4().hex
# Integration bootstrap may bind trusted callables; browser input cannot bind code/URLs.
RESEARCHER = None
PLANNER = None
REVIEWER = None


def providers(p):
    if p['mode'] == 'demo':
        return team.demo_researcher, team.demo_planner
    return RESEARCHER, PLANNER


def dashboard(p):
    from team_recovery import summary
    a, b = providers(p)
    run = p.get('dispatch', {})
    active = run.get('status') == 'running' and run.get('boot_id') == BOOT_ID
    interrupted = run.get('status') == 'running' and not active
    tasks = (p.get('plan') or {}).get('tasks', [])
    counts = {s: sum(t['status'] == s for t in tasks) for s in
              ('candidate', 'scheduled', 'in_progress', 'blocked', 'pending_review', 'completed')}
    if not p.get('diagnosis') or p.get('diagnosis_needs_refresh'):
        stage, label = 'A', '等待 A 诊断最新目标与材料'
    elif p.get('proposal'):
        stage, label = 'confirm', '计划已预览，等待你确认采用'
    elif not p.get('plan') or p.get('plan_stale'):
        stage, label = 'B', '等待 B 根据最新诊断生成计划'
    elif counts['pending_review']:
        stage, label = 'review', '有成果待验收'
    elif p.get('recovery') and summary(p)['ready']:
        stage, label = 'recovery', '有保存的任务现场可以返回；先核对当前优先次序'
    elif counts['blocked']:
        stage, label = 'rescue', '有任务卡住，先补充卡点证据'
    elif p.get('artifact_storage_required') and any(t['status']=='completed' and t.get('external_review') and
          t['external_review']['packet']['diagnosis_version']==p['diagnosis']['diagnosis_version'] and
          t['external_review']['review_id'] not in p.get('applied_review_ids', []) for t in tasks):
        stage, label = 'followup', '成果已人工确认；点击任务上的更新按钮预览剩余问题'
    elif (tasks and counts['completed'] == len(tasks)) or (not tasks and p['diagnosis'].get('resolution_confirmed')):
        stage, label = 'done', '当前计划全部验收完成；比赛交付仍需单独核对'
    else:
        stage, label = 'execute', '按已采用计划推进，变化时预览调整'
    questions = (p.get('diagnosis') or {}).get('unknowns', [])
    return {'stage': stage, 'label': label, 'active': active, 'interrupted': interrupted,
            'providers': {'A': bool(a), 'B': bool(b), 'mode': p['mode']},
            'review_provider': p['mode'] == 'live' and REVIEWER is not None,
            'counts': counts, 'questions': questions, 'last_run': run,
            'can_dispatch': not active and stage in ('A', 'B') and bool(a if stage == 'A' else b),
            'note': 'Demo 只验证交接；接入配置不等于真实模型与搜索验收通过。'}


def brief(data):
    p = team.current(data)
    content = team.required(data, 'content')
    if len(content) > 20000:
        raise ValueError('补充信息请控制在 20000 字以内')
    p.setdefault('brief_history', []).append({'content': content, 'created': team.agent.now()})
    p['diagnosis_needs_refresh'] = True
    p['proposal'] = None
    return team.commit(p, p['version'], '补充目标、材料或能力信息；交 A 重新核对')


def dispatch(data):
    """One guarded run. Persist A before B; retries resume the missing stage.
    Adapter network timeouts must be bounded by the adapter itself.
    """
    p = team.current(data)
    status = dashboard(p)
    if status['active']:
        raise team.Conflict('总调度正在运行，请刷新查看，不要重复提交')
    stage = status['stage']
    if stage not in ('A', 'B'):
        raise ValueError('当前无需重新调用 A/B；请先处理计划确认、执行或验收')
    researcher, planner = providers(p)
    if not (researcher if stage == 'A' else planner):
        raise ValueError(stage + ' 的真实模块尚未接入；可先接收队友 JSON 交付')
    run = {'run_id': uuid.uuid4().hex, 'boot_id': BOOT_ID, 'status': 'running',
           'stage': stage, 'started_at': team.agent.now(), 'mode': p['mode']}
    p['dispatch'] = run
    p = team.commit(p, p['version'], '总调度开始：' + stage)
    try:
        if stage == 'A':
            d = researcher(copy.deepcopy(p))
            p = team.diagnosis({'project_id': p['project_id'], 'expected_version': p['version'], 'diagnosis': d})
            stage = 'B'
            p['dispatch']['stage'] = 'B'
            p = team.commit(p, p['version'], 'A 已保存；总调度交给 B')
        if not planner:
            raise ValueError('B 模块尚未接入')
        plan = planner(copy.deepcopy(p['diagnosis']), copy.deepcopy(p))
        p = team.propose({'project_id': p['project_id'], 'expected_version': p['version'],
                          'plan': plan, 'reason': '总调度 A → B；请核对后采用'})
        p['dispatch'].update(status='succeeded', stage='confirm', finished_at=team.agent.now())
        return team.commit(p, p['version'], '总调度完成：等待用户采用')
    except Exception as exc:
        # Load latest to record failure without overwriting concurrent progress.
        latest = team.state(p['project_id'])
        if latest.get('dispatch', {}).get('run_id') != run['run_id']:
            raise team.Conflict('运行已被更新，请刷新查看') from None
        latest['dispatch'].update(status='failed', stage=stage, finished_at=team.agent.now(),
                                  error_code=type(exc).__name__,
                                  message=stage + ' 未完成；已保存的诊断与执行成果保留，请核对交付格式、连接与版本后继续')
        from rescue_service import RescueError
        if isinstance(exc, RescueError) and exc.code == 'CONFIG_REQUIRED':
            latest['dispatch'].update(error_code=exc.code, message='请先在学习导航页的 AI 连接中配置模型；没有使用示例替代实际诊断')
        return team.commit(latest, latest['version'], '总调度未完成：' + stage)
