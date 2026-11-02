"""User-selected support tied to a versioned action; support never accepts work."""
import copy
import uuid
from datetime import datetime, timedelta, timezone
import artifact_store
import team_orchestrator as team
import team_recovery as recovery

STATES = {'confused', 'distracted', 'tired', 'cannot_today', 'blocked'}
POLICY = {
    'confused': ('原文对照', '先说清当前卡点；按一句话、类比、图解、例题逐级请求帮助，不把类比当证据。'),
    'distracted': ('回到这一格', '先回看当前材料与产物要求；可关闭趣味帮助，未经本人选择不推断状态。'),
    'tired': ('保存后休息', '现场已保存。可休息5分钟；到时只提示选择，不自动恢复或完成。'),
    'cannot_today': ('结束本轮', '保留原位置和下一步，今天不再催促；下次本人确认后继续。'),
    'blocked': ('整理求助', '记录已试方法和缺少的条件；给队友一张可回查的求助卡。'),
}

def now():
    return datetime.now(timezone.utc)

def bound(p, data):
    t = recovery.task(p, team.required(data, 'task_id'))
    if t['status'] in ('completed', 'pending_review'):
        raise ValueError('已验收或待复核的任务不能开启执行帮助')
    step = recovery.select_step(t, team.required(data, 'action_id'))
    if not step.get('input_version') or not step.get('target_locator'):
        raise ValueError('先由B补齐动作输入版本和位置')
    doc = artifact_store.read(p, **{
        'identifier': step['input_version']['artifact_id'],
        'version': step['input_version']['artifact_version']})
    if not any(u['locator'] == step['target_locator'] for u in doc['units']):
        raise ValueError('动作位置不在实际材料中')
    return t, step

def checkin(data):
    p = recovery.current(data)
    state = data.get('state')
    if state not in STATES:
        raise ValueError('请本人选择五种状态之一，不从页面行为推断')
    t, step = bound(p, data)
    member = team.required(data, 'member_id')
    if member not in t['owner_ids']:
        raise ValueError('请选择任务负责人；成员名是本机记录，不是身份认证')
    minutes = team.integer(data, 'first_step_minutes', 1)
    if minutes > 5:
        raise ValueError('首动作超过5分钟，请B拆小后再试；不自动宣称能在5分钟内完成')
    rows = p.setdefault('interventions', [])
    if any(r['task_id'] == t['task_id'] and r['status'] in ('active', 'resting', 'needs_help', 'ended_today')
           and r['fingerprint'] == recovery.fingerprint(t) for r in rows):
        raise team.Conflict('同一动作已有帮助现场，请继续处理原记录')
    row = {'id': uuid.uuid4().hex, 'task_id': t['task_id'], 'action_id': step['step_id'],
           'member_id': member, 'state': state, 'state_origin': 'member_selected',
           'note': recovery.text(data, 'note'), 'created': team.agent.now(),
           'diagnosis_version': p['diagnosis']['diagnosis_version'],
           'plan_version': p['plan']['plan_version'], 'fingerprint': recovery.fingerprint(t),
           'input_version': copy.deepcopy(step['input_version']), 'location': step['target_locator'],
           'next_action': step['action'], 'output': step['output'], 'self_check': step['self_check'],
           'first_step_minutes': minutes, 'estimate_origin': 'member_estimate_not_measurement',
           'status': 'resting' if state == 'tired' else 'ended_today' if state == 'cannot_today' else 'active',
           'feedback': [], 'resumes': [], 'support': POLICY[state][1],
           'known_artifacts': [[a['artifact_id'], a['artifact_version']] for a in p.get('stored_artifacts', [])]}
    if state == 'tired':
        row['rest_until'] = (now() + timedelta(minutes=5)).isoformat()
    rows.append(row)
    from team_runtime import remember
    remember(p, t, step, member)
    return team.commit(p, p['version'], '本人选择状态并保存原版本现场；成果状态未改变')

def selected(data):
    p = recovery.current(data)
    row = next((r for r in p.get('interventions', []) if r['id'] == data.get('intervention_id')), None)
    if not row:
        raise ValueError('帮助记录不属于当前项目')
    t, step = bound(p, {'task_id': row['task_id'], 'action_id': row['action_id']})
    if row['fingerprint'] != recovery.fingerprint(t) or row['diagnosis_version'] != p['diagnosis']['diagnosis_version']:
        raise team.Conflict('材料、判据或动作已变化，请重新核对现场')
    return p, row, t, step

def respond(data):
    p, row, t, step = selected(data)
    choice = data.get('choice')
    if row['status'] == 'needs_help' and choice == 'after_help':
        if data.get('confirmed') is not True:
            raise ValueError('请本人确认已经获得新帮助或换了策略')
        row['help_received'] = recovery.text(data, 'note')
        row['cycle_attempts'] = 0
        row['status'] = 'active'
        return team.commit(p, p['version'], '本人记录新帮助后重试；旧失败记录保留')
    if row['status'] == 'needs_help' and choice == 'end':
        row['status'] = 'ended_today'
        return team.commit(p, p['version'], '求助后选择今天结束；未完成任务保留')
    if row['status'] not in ('resting', 'ended_today'):
        raise ValueError('当前没有待确认的休息或结束现场')
    if choice == 'extend':
        if row['status'] != 'resting':
            raise ValueError('仅休息中的现场可以延长')
        row['rest_until'] = (now() + timedelta(minutes=5)).isoformat()
    elif choice == 'end':
        row['status'] = 'ended_today'
        row.pop('rest_until', None)
    elif choice == 'continue':
        if data.get('confirmed') is not True:
            raise ValueError('请本人确认原任务和版本后继续')
        row['status'] = 'active'
        row.pop('rest_until', None)
        row['resumes'].append({'at':team.agent.now(), 'confirmation':'member_confirmed'})
    else:
        raise ValueError('请选择继续、延长或结束')
    return team.commit(p, p['version'], '休息返回选择已记录；未自动执行或验收成果')

def feedback(data):
    p, row, t, step = selected(data)
    if row['status'] != 'active':
        raise ValueError('先确认回到原动作；不能把休息或求助记为执行')
    outcome = data.get('outcome')
    if outcome not in ('no_output', 'output'):
        raise ValueError('请记录有产物或尚无产物')
    minutes = data.get('actual_minutes')
    if type(minutes) not in (int, float) or not 0 <= minutes <= 1440:
        raise ValueError('实际分钟必须为0至1440的数值')
    refs = data.get('evidence_refs', [])
    if outcome == 'output':
        artifact_store.references(p, refs)
        for ref in refs:
            meta = next(a for a in p['stored_artifacts'] if
                        a['artifact_id'] == ref['artifact_id'] and a['artifact_version'] == ref['artifact_version'])
            if meta['purpose'] not in ('submission', 'capability') or [ref['artifact_id'], ref['artifact_version']] in row['known_artifacts']:
                raise ValueError('请提交本次执行产生的可读小产物，不能用原输入冒充输出')
        row['status'] = 'output_pending_review'
    event = {'outcome': outcome, 'actual_minutes': minutes, 'note': recovery.text(data, 'note'),
             'evidence_refs': copy.deepcopy(refs), 'at':team.agent.now(),
             'method':'member_report_with_artifact' if outcome == 'output' else 'member_report'}
    row['feedback'].append(event)
    if outcome == 'no_output':
        row['support'] = '本轮没有小产物，先核对失败原因并拆成一格；不要重复无效讲解。'
    if outcome == 'no_output':
        row['cycle_attempts'] = row.get('cycle_attempts', 0) + 1
    if outcome == 'no_output' and row['cycle_attempts'] >= 2:
        row['status'] = 'needs_help'
    return team.commit(p, p['version'], '记录实际尝试；两轮无产物转求助，小产物仍待原成果流程复核')

def report(p):
    rows = copy.deepcopy(p.get('interventions', []))
    for r in rows:
        t = next((t for t in (p.get('plan') or {}).get('tasks', []) if t['task_id'] == r['task_id']), None)
        r['stale'] = bool(not t or p.get('plan_stale') or p.get('diagnosis_needs_refresh') or
                          r['fingerprint'] != recovery.fingerprint(t) or
                          r['diagnosis_version'] != (p.get('diagnosis') or {}).get('diagnosis_version'))
        r['rest_due'] = bool(r['status'] == 'resting' and now() >= datetime.fromisoformat(r['rest_until']))
        r['help_card'] = {'question':r['note'], 'task_id':r['task_id'], 'action_id':r['action_id'],
                          'input_version':r['input_version'], 'location':r['location'],
                          'expected_output':r['output'], 'attempts':r['feedback'][-2:],
                          'next_path':'请队友核对缺少的资料或拆小动作；未自动发送'}
    tasks = (p.get('plan') or {}).get('tasks', [])
    gaps = (p.get('diagnosis') or {}).get('gaps', [])
    blockers = []
    if not p.get('diagnosis') or p.get('diagnosis_needs_refresh'): blockers.append('等待当前材料的真实诊断')
    if not tasks or p.get('plan_stale'): blockers.append('等待当前版本的已采用行动计划')
    if any(t['status'] != 'completed' for t in tasks): blockers.append('仍有未执行或待复核任务')
    if (p.get('diagnosis') or {}).get('unknowns') or any(g.get('status') != 'closed' for g in gaps):
        blockers.append('仍有未知或未关闭差距')
    if not p.get('applied_review_ids'): blockers.append('尚无复核后人工确认及剩余计划记录')
    return {'project_id':p['project_id'], 'project_version':p['version'], 'interventions':rows,
            'terminal':{'status':'not_complete' if blockers else 'ledger_complete_quality_unverified',
                        'blockers':blockers, 'quality_verified':False},
            'note':'帮助、休息、回到页面不代表成果完成；产物继续走A复核和人工确认。'}
