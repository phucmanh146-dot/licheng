"""Captain adapters for B's delivered rules and A's versioned review packets.

B's baseline is action-planner commit 59a1eaff. Current extensions add recorded
capability branching and confirmed-review remaining plans; this adapter is rules.
"""
import copy
import team_orchestrator as team
import action_planner as b
import b_refinements

B_SOURCE_COMMIT = '59a1eaff7aa3fa61135c021f108a4d6cb9216f35'


def check_diagnosis(d):
    errors, warnings = [], []
    try:
        team.validate_diagnosis(d)
    except (ValueError, TypeError, KeyError) as exc:
        return {'ready_for_B': False, 'errors': [str(exc)], 'warnings': warnings}
    if (not d['gaps'] and not d.get('resolution_confirmed')) or len(d['gaps']) > 100:
        errors.append('B 需要 1 至 100 条实际差距；空报告模板不能生成计划')
    for member in d['member_profiles']:
        try:
            if 'verified_capabilities' in member:
                team.strings(member, 'verified_capabilities')
        except ValueError:
            errors.append(member['member_id'] + ' 的 verified_capabilities 必须是文字列表')
        if not member.get('verified_capabilities'):
            warnings.append(member['member_id'] + ' 尚无已验证能力，B 不会跳过所需学习')
    for gap in d['gaps']:
        key = gap['gap_id']
        if not gap['source_refs']:
            errors.append(key + ' 缺少来源')
        if not gap['related_member_ids']:
            errors.append(key + ' 缺少负责人')
        try:
            team.strings(gap, 'acceptance_criteria', True)
        except ValueError:
            errors.append(key + ' 缺少可核对的 acceptance_criteria')
        if not gap.get('current_locator') or not gap.get('current_artifact'):
            warnings.append(key + ' 尚缺现状位置或材料版本，精细指导仍需 A 补充')
    return {'ready_for_B': not errors, 'errors': errors, 'warnings': warnings,
            'provider': 'deterministic-action-planner', 'source_commit': B_SOURCE_COMMIT}


def check(data):
    team.current(data)
    return check_diagnosis(team.required(data, 'diagnosis', dict))


def planner(diagnosis, project):
    """Use B's real code; preserve all existing progress and captain confirmations."""
    report = check_diagnosis(diagnosis)
    if not report['ready_for_B']:
        raise ValueError('A 的交付尚不能进入 B：' + '；'.join(report['errors'][:8]))
    context = {'goal': project['goal']}
    old_plan = project.get('plan')
    if project.get('artifact_storage_required'):
        from team_revision import plan_remaining
        plan = plan_remaining(diagnosis, project)
    elif not old_plan:
        plan = b.generate(copy.deepcopy(diagnosis), context)
    else:
        old_d = project.get('plan_diagnosis')
        if old_plan['based_on_diagnosis_version'] == diagnosis['diagnosis_version']:
            b.validate(old_plan, diagnosis)
            plan = copy.deepcopy(old_plan)
            plan['plan_version'] += 1
        else:
            if not old_d or old_d['diagnosis_version'] != old_plan['based_on_diagnosis_version']:
                raise team.Conflict('旧计划缺少对应诊断快照，请先核对交付；不会重新生成覆盖执行成果')
            result = b_refinements.reconcile(old_d, diagnosis, old_plan, context, old_plan['plan_version'])
            if result['requires_confirmation']:
                raise team.Conflict('新诊断影响受保护成果：' + '、'.join(result['conflicts']) + '；旧计划保留，请先人工核对')
            plan = result['plan']
    old_ids = {t['task_id'] for t in (old_plan or {}).get('tasks', [])}
    # B marks prerequisite work blocked. Captain candidates still enforce prerequisites
    # at start; adopting a draft must never impersonate a recorded execution event.
    for task in plan['tasks']:
        if (task['task_id'] not in old_ids and task['status'] == 'blocked' and
                task.get('execution_readiness') != 'blocked_missing_grounded_micro_steps'):
            task['status'] = 'candidate'
    plan['handoff_provenance'] = {'role': 'B', 'source_commit': B_SOURCE_COMMIT,
                                  'source_commit_role':'original_B_baseline',
                                  'extensions':['personal_guidance','team_revision'],
                                  'generation': 'rules', 'live_model_verified': False}
    team.validate_plan(plan, diagnosis)
    team.protected(old_plan, plan)
    return plan


def generate(data):
    p = team.current(data)
    if not p['diagnosis'] or p.get('diagnosis_needs_refresh'):
        raise ValueError('先接收 A 基于最新材料的诊断')
    draft = planner(copy.deepcopy(p['diagnosis']), copy.deepcopy(p))
    return team.propose({**data, 'plan': draft, 'reason': '调用 B 已交付的规则规划器；核对后再采用'})


def review_request(p, task_id=None, include_documents=False):
    tasks = (p.get('plan') or {}).get('tasks', [])
    pending = [copy.deepcopy(t) for t in tasks if t['status'] == 'pending_review' and t.get('submission')]
    if task_id is not None:
        pending = [t for t in pending if t['task_id'] == task_id]
        if not pending:
            raise ValueError('没有对应的待复核成果')
    packet = {'schema_version': '0.1', 'project_id': p['project_id'], 'project_version': p['version'],
            'goal': p['goal'], 'plan_version': (p.get('plan') or {}).get('plan_version'),
            'project_context': copy.deepcopy(p.get('project_context')),
            'member_task_briefs': copy.deepcopy(p.get('member_task_briefs', [])),
            'brief_history': copy.deepcopy(p.get('brief_history', [])),
            'pending_commitments': copy.deepcopy([c for c in p.get('recovery', {}).get('commitments', []) if not c['task_id']]),
            'task_recovery_summary': copy.deepcopy(p.get('recovery_summary', {})),
            'artifact_manifest': copy.deepcopy(p.get('stored_artifacts', [])),
            'diagnosis_needs_refresh': bool(p.get('diagnosis_needs_refresh')),
            'plan_stale': bool(p.get('plan_stale')),
            'diagnosis': copy.deepcopy(p.get('diagnosis')), 'pending_tasks': pending,
            'feedback': copy.deepcopy(p['feedback']),
            'note': 'A 对照原 gap 与实际新成果复核；总控不会把格式校验当成内容正确。'}
    if include_documents:
        import artifact_store
        refs = {}
        # Latest diagnostic inputs, then exact old/new versions and capability evidence.
        for row in p.get('stored_artifacts', []):
            if row.get('purpose', 'input') == 'input':
                refs[row['artifact_id']] = row
        rows = list(refs.values())
        rows.extend(g['current_artifact'] for g in (p.get('diagnosis') or {}).get('gaps', []) if g.get('current_artifact'))
        rows.extend(t['submission'] for t in pending)
        rows.extend(r for m in p.get('member_task_briefs', []) for r in m.get('capability_evidence', []))
        if p.get('artifact_storage_required'):
            refs = {(r['artifact_id'], r['artifact_version']) for r in rows}
            docs, total = [], 0
            for identifier, version in sorted(refs):
                doc = artifact_store.read(p, identifier, version)
                total += sum(len(unit['text']) for unit in doc['units'])
                if total > 60000:
                    raise ValueError('交给A的材料正文超过60000字，请拆分本次交付；没有静默裁切')
                docs.append(doc)
            packet['documents'] = docs
        else:
            packet['documents'] = []
        packet['document_bytes_checked'] = bool(packet['documents'])
        packet['response_context'] = {'project_id': p['project_id'], 'expected_version': p['version']}
        packet['note'] = ('以本次project_context、本人任务及补充记录核对目标；材料已抓取时沿用其内容。'
                          'documents来自本项目实际文件，哈希和原文位置可核对；空列表表示未接入实际正文。'
                          '返回交付沿用response_context，版本变化先重新核对；目标变化时旧待复核任务先保留，不能按旧目标放行。')
    return packet


def receive_review(data, content_read=False):
    p = team.current(data)
    if not p['plan'] or p['plan_stale']:
        raise team.Conflict('复核需要有效计划；请先核对最新诊断与计划')
    review = copy.deepcopy(team.required(data, 'review', dict))
    for key in ('review_id', 'task_id', 'reviewer_id', 'artifact_id', 'note'):
        team.required(review, key)
    if team.integer(review, 'plan_version', 1) != p['plan']['plan_version'] or team.integer(review, 'diagnosis_version', 1) != p['diagnosis']['diagnosis_version']:
        raise team.Conflict('A 复核对应的诊断或计划已过期')
    task = next((t for t in p['plan']['tasks'] if t['task_id'] == review['task_id']), None)
    if not task or task['status'] != 'pending_review' or not task.get('submission'):
        raise ValueError('A 复核只能绑定已提交的待验收成果')
    submission = task['submission']
    if review['artifact_id'] != submission['artifact_id'] or team.integer(review, 'artifact_version', 1) != submission['artifact_version']:
        raise team.Conflict('A 复核的成果版本与当前提交不一致')
    if review['reviewer_id'] not in {m['member_id'] for m in p['diagnosis']['member_profiles']}:
        raise ValueError('复核成员不在项目中')
    team.assert_independent_reviewer(p, task, review['reviewer_id'])
    if review.get('method') not in ('manual', 'model', 'rules'):
        raise ValueError('复核需声明 method：manual、model 或 rules')
    rows = team.required(review, 'criterion_results', list)
    if len(rows) != len(task['acceptance_criteria']):
        raise ValueError('复核必须逐条对应任务验收条件')
    for row, criterion in zip(rows, task['acceptance_criteria']):
        if team.required(row, 'criterion') != criterion or type(row.get('passed')) is not bool:
            raise ValueError('复核条件或通过状态无效')
        team.required(row, 'evidence')
    gaps = team.required(review, 'gap_results', list)
    if team.unique(gaps, 'gap_id') != set(task['gap_ids']):
        raise ValueError('复核 gap 必须与当前任务逐项对应')
    for gap in gaps:
        team.required(gap, 'evidence')
        if gap.get('status') not in ('closed', 'remaining', 'unknown'):
            raise ValueError('gap 复核状态须为 closed、remaining 或 unknown')
        if gap['status'] != 'closed':
            team.required(gap, 'remaining_issue')
        elif not all(row['passed'] for row in rows):
            raise ValueError('验收条件未全部通过，不能将对应差距声明为关闭')
    if p.get('artifact_storage_required'):
        import artifact_store
        ref = (submission['artifact_id'], submission['artifact_version'])
        for row in rows + gaps:
            artifact_store.references(p, row.get('evidence_refs'), ref)
        check_d = copy.deepcopy(p['diagnosis'])
        known = team.artifact_catalog(check_d)
        for artifact in p.get('stored_artifacts', []):
            if (artifact['artifact_id'], artifact['artifact_version']) not in known:
                check_d.setdefault('artifact_versions', []).append(copy.deepcopy(artifact))
        for gap in gaps:
            if gap['status'] == 'remaining' and task.get('kind') in ('production', 'check'):
                steps = team.required(gap, 'remaining_micro_steps', list)
                team.validate_micro_steps({'micro_steps':steps}, check_d)
                if any((s['input_version']['artifact_id'],s['input_version']['artifact_version']) != ref for s in steps):
                    raise ValueError('剩余动作必须基于实际提交的新版')
    existing = next((r for r in p.get('artifact_reviews', []) if r['review_id'] == review['review_id']), None)
    if existing:
        if existing['packet'] == review:
            return p
        raise team.Conflict('复核编号已存在且内容不同')
    record = {'packet': review, 'review_id': review['review_id'], 'created': team.agent.now(),
              'source': 'A_handoff', 'content_independently_verified': False,
              'content_read_verified': bool(content_read and p.get('artifact_storage_required')),
              'quotes_checked': bool(p.get('artifact_storage_required'))}
    p.setdefault('artifact_reviews', []).append(record)
    task['external_review'] = copy.deepcopy(record)
    p['feedback'].append({'task_id': task['task_id'], 'action': 'review_received',
                          'note': review['note'], 'created': record['created'],
                          'review_id': review['review_id'], 'gap_results': copy.deepcopy(gaps),
                          'artifact_id': review['artifact_id'], 'artifact_version': review['artifact_version']})
    p['proposal'] = None
    return team.commit(p, p['version'], '接收 A 成果复核；仍待成员确认验收')


def invoke_review(data):
    from team_dispatch import REVIEWER
    p = team.current(data)
    if p['mode'] != 'live' or REVIEWER is None:
        raise ValueError('A 的真实复核模块尚未接入，可先接收实际复核 JSON')
    packet = review_request(p, team.required(data, 'task_id'))
    result = REVIEWER(copy.deepcopy(p), copy.deepcopy(packet))
    return receive_review({**data, 'review': result}, content_read=REVIEWER.__module__ == 'team_ai')
