"""A project-local execution register over the existing versioned ledger."""
import copy
import team_orchestrator as team
import team_recovery as recovery


STAGES = {'A': 'DIAGNOSING', 'B': 'REPLAN', 'confirm': 'PLAN_PREVIEW',
          'review': 'WAITING_REVIEW', 'followup': 'REPLAN', 'done': 'COMPLETE',
          'execute': 'EXECUTING', 'rescue': 'EXECUTING', 'recovery': 'EXECUTING'}


def remember(p, task, step, member_id=None):
    if member_id is not None and member_id not in task['owner_ids']:
        raise ValueError('当前成员不是该任务负责人')
    p['runtime_focus'] = {'task_id': task['task_id'], 'action_id': step['step_id'],
        'member_id': member_id, 'diagnosis_version': p['diagnosis']['diagnosis_version'],
        'plan_version': p['plan']['plan_version'], 'task_fingerprint': recovery.fingerprint(task),
        'input_version': copy.deepcopy(step.get('input_version')), 'selected_at': team.agent.now()}


def focus(data):
    p = recovery.current(data)
    t = recovery.task(p, team.required(data, 'task_id'))
    if t['status'] in ('completed', 'pending_review'):
        raise ValueError('已验收或待复核任务请查看成果记录，不重新保存为执行步骤')
    step = recovery.select_step(t, team.required(data, 'action_id'))
    member = data.get('member_id') or None
    remember(p, t, step, member)
    return team.commit(p, p['version'], '保存当前任务与微动作；未开始执行或改变验收状态')


def snapshot(p):
    """Deterministic read only view; never infer live activity or auto-resume."""
    tasks = (p.get('plan') or {}).get('tasks', [])
    d = p.get('diagnosis') or {}
    dispatch = p.get('dispatch_status') or {}
    stage = STAGES.get(dispatch.get('stage'), 'MATERIAL_READY')
    if dispatch.get('stage') == 'A' and not p.get('stored_artifacts') and not d:
        stage = 'MATERIAL_READY'
    saved = copy.deepcopy(p.get('runtime_focus'))
    active = None
    stale = False
    reason = ''
    if saved:
        t = next((t for t in tasks if t['task_id'] == saved['task_id']), None)
        stale = (not t or bool(p.get('plan_stale')) or p.get('diagnosis_needs_refresh') or
                 saved['diagnosis_version'] != d.get('diagnosis_version') or
                 saved['task_fingerprint'] != recovery.fingerprint(t))
        if not stale:
            try:
                step = recovery.select_step(t, saved['action_id'])
                packet = recovery.context_packet(p, t['task_id'], step['step_id'])
                active = {'task_id': t['task_id'], 'action_id': step['step_id'], 'title': t['title'],
                          'status': t['status'], 'member_id': saved.get('member_id'),
                          'submission': copy.deepcopy(t.get('submission')),
                          'input_version': copy.deepcopy(step.get('input_version')),
                          'locator': step.get('target_locator'), 'action': step['action'],
                          'acceptance_criteria': copy.deepcopy(t['acceptance_criteria']),
                          'context': packet}
            except (ValueError, KeyError) as exc:
                stale, reason = True, str(exc)
        if stale and not reason:
            reason = '当前目标、材料或动作已变化，请重新选择当前版本；旧现场仅作历史'
    return {'project_id': p['project_id'], 'project_version': p['version'],
            'diagnosis_version': d.get('diagnosis_version'),
            'plan_version': (p.get('plan') or {}).get('plan_version'),
            'state': stage, 'state_origin': 'derived_from_persisted_events',
            'counts': copy.deepcopy(dispatch.get('counts', {})),
            'current': active, 'saved_focus': saved, 'focus_stale': bool(stale),
            'needs_task_selection': active is None and bool(tasks), 'reason': reason,
            'candidates': [{'task_id': t['task_id'], 'title': t['title'], 'status': t['status'],
                            'owner_ids': t['owner_ids']} for t in tasks],
            'confirmation_required': True, 'auto_execute': False,
            'note': '记录任务现场，不推断在线状态。待复核与已验收分开；找回不等于执行。'}
