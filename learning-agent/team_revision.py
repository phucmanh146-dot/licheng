"""Confirmed review -> remaining work preview, without rewriting execution history."""
import copy
import uuid
import action_planner as b
import artifact_store
import team_orchestrator as team


def retain_history(d, old_d, old_plan):
    """Keep archived identifiers that protected execution still references."""
    if not old_d or not old_plan:
        return
    for field, key in (('sources', 'source_id'), ('member_profiles', 'member_id'), ('gaps', 'gap_id')):
        known = {x[key] for x in d[field]}
        for row in old_d[field]:
            if row[key] not in known:
                saved = copy.deepcopy(row)
                if field == 'gaps':
                    saved['history_only'] = row.get('status') == 'closed'
                    saved['status'] = row.get('status', 'unknown')
                    if not saved['history_only']:
                        saved['manual_hold'] = True
                        d.setdefault('unknowns', []).append('新诊断未再次判断 '+row[key]+'；保留旧证据并等待确认，不能默认关闭')
                d[field].append(saved)
    catalog = d.setdefault('artifact_versions', [])
    known = {(r['artifact_id'], r['artifact_version']) for r in catalog}
    for row in old_d.get('artifact_versions', []):
        if (row['artifact_id'], row['artifact_version']) not in known:
            catalog.append(copy.deepcopy(row))


def plan_remaining(d, project):
    old = project.get('plan')
    context = {'goal': project['goal']}
    if project.get('project_context', {}).get('deadline'):
        context['deadline'] = project['project_context']['deadline']
    active_d = copy.deepcopy(d)
    active_d['gaps'] = [g for g in d['gaps'] if not g.get('history_only')]
    active_d['resolution_confirmed'] = not active_d['gaps'] or all(g.get('status') == 'closed' for g in active_d['gaps'])
    draft = b.generate(active_d, context)
    if not old:
        for t in draft['tasks']:
            if t.get('execution_readiness') != 'blocked_missing_grounded_micro_steps':
                t['status'] = 'candidate'
        return draft
    previous = {t['task_id']: t for t in old['tasks']}
    keep = {t['task_id'] for t in old['tasks'] if t['status'] != 'candidate' or t.get('locked')}
    keep.update(x['task_id'] for x in old['time_blocks'] if x.get('locked'))
    # A protected task's full prerequisite history is also preserved.
    pending = list(keep)
    while pending:
        for dep in previous[pending.pop()]['depends_on']:
            if dep not in keep:
                keep.add(dep)
                pending.append(dep)
    fresh = {t['task_id']: t for t in draft['tasks']}
    before_members = {m['member_id']:m for m in (project.get('plan_diagnosis') or {}).get('member_profiles', [])}
    after_members = {m['member_id']:m for m in d['member_profiles']}
    mapping = {}
    for key, task in fresh.items():
        new_failed_evidence = task.get('kind') in ('trial','learn','practice','retest') and task.get('capability_status') in ('failed','unknown') and any(
            before_members.get(owner,{}).get('capability_evidence',[]) != after_members[owner].get('capability_evidence',[]) for owner in task['owner_ids'])
        if key in keep and previous[key]['status'] == 'completed' and (task.get('kind') == 'production' or new_failed_evidence):
            mapping[key] = key + ':revision:' + str(d['diagnosis_version'])
        else:
            mapping[key] = key
    merged = [copy.deepcopy(t) for t in old['tasks'] if t['task_id'] in keep]
    for key, task in fresh.items():
        new_key = mapping[key]
        if new_key in keep:
            continue
        task['task_id'] = new_key
        task['depends_on'] = [mapping.get(x, x) for x in task['depends_on']]
        available = set(mapping.values()) | keep
        external = task.pop('external_dependencies', [])
        task['depends_on'].extend(mapping.get(x, x) for x in external if mapping.get(x, x) in available)
        missing = [x for x in external if mapping.get(x, x) not in available]
        if missing:
            task['external_dependencies'] = missing
        if task.get('execution_readiness') != 'blocked_missing_grounded_micro_steps':
            task['status'] = 'candidate'
        merged.append(task)
    draft['tasks'] = merged
    draft['plan_version'] = old['plan_version'] + 1
    draft['time_blocks'] = [copy.deepcopy(x) for x in old['time_blocks'] if x['task_id'] in keep]
    draft['dependencies'] = [{'task_id':t['task_id'], 'depends_on':t['depends_on']} for t in merged]
    for path in draft['learning_paths']:
        path['task_ids'] = [mapping.get(x, x) for x in path['task_ids']]
    draft['unscheduled'] = [x for x in draft['unscheduled'] if x.get('task_id') not in keep]
    draft['assumptions'].append('已开始、已排期、待验收、已完成、锁定任务及其依赖和时段原样保留；新版只预览剩余工作。')
    old_gaps = {g['gap_id']:g for g in (project.get('plan_diagnosis') or {}).get('gaps', [])}
    new_gaps = {g['gap_id']:g for g in d['gaps']}
    old_members = {m['member_id']:m for m in (project.get('plan_diagnosis') or {}).get('member_profiles', [])}
    new_members = {m['member_id']:m for m in d['member_profiles']}
    draft['protected_attention'] = [t['task_id'] for t in merged if t['task_id'] in keep and t['status'] != 'completed'
        and (any(old_gaps.get(k) != new_gaps.get(k) for k in t['gap_ids']) or
             any(old_members.get(k) != new_members.get(k) for k in t['owner_ids']))]
    if draft['protected_attention']:
        draft['assumptions'].append('受保护任务的依据有变化：' + '、'.join(draft['protected_attention']) + '；采用前人工核对，不另建并行替代任务。')
    b.validate(draft, d)
    team.validate_plan(draft, d)
    team.protected(old, draft)
    return draft


def advance(data):
    p = team.current(data)
    review_id = team.required(data, 'review_id')
    if review_id in p.get('applied_review_ids', []):
        return p
    if not p.get('plan') or p.get('diagnosis_needs_refresh'):
        raise team.Conflict('先完成最新输入的诊断与采用，再更新剩余计划')
    record = next((r for r in p.get('artifact_reviews', []) if r['review_id'] == review_id), None)
    if not record:
        raise ValueError('没有对应的成果复核')
    packet = record['packet']
    if packet['plan_version'] != p['plan']['plan_version'] or packet['diagnosis_version'] != p['diagnosis']['diagnosis_version']:
        raise team.Conflict('这次复核已过期；不会覆盖新诊断或计划')
    task = next(t for t in p['plan']['tasks'] if t['task_id'] == packet['task_id'])
    if task['status'] != 'completed' or (task.get('review') or {}).get('action') != 'approve':
        raise ValueError('先逐条件确认实际成果验收，复核收件不等于差距关闭')
    if (task['submission']['artifact_id'], task['submission']['artifact_version']) != (packet['artifact_id'], packet['artifact_version']):
        raise team.Conflict('复核与人工确认的成果版本不一致')
    if p.get('artifact_storage_required'):
        for row in packet['criterion_results'] + packet['gap_results']:
            artifact_store.references(p, row.get('evidence_refs'), (packet['artifact_id'], packet['artifact_version']))
    d = copy.deepcopy(p['diagnosis'])
    d['diagnosis_version'] += 1
    for result in packet['gap_results']:
        gap = next(g for g in d['gaps'] if g['gap_id'] == result['gap_id'])
        if result['status'] == 'closed' and task.get('kind') not in ('production', 'check'):
            raise ValueError('试做或学习验收不能关闭成果差距')
        gap.update(status=result['status'], review_evidence=copy.deepcopy(result), confirmed_review_id=review_id,
                   verification_status='human_confirmed_review', current_artifact={'artifact_id':packet['artifact_id'], 'artifact_version':packet['artifact_version']})
        if result['status'] != 'closed':
            gap['current_evidence'] = result['remaining_issue']
        if result.get('remaining_micro_steps'):
            gap['micro_steps'] = copy.deepcopy(result['remaining_micro_steps'])
        gap['manual_hold'] = result['status'] == 'unknown'
        refs = result.get('evidence_refs', [])
        if refs:
            gap['current_locator'] = next(r['locator'] for r in refs if r['artifact_id'] == packet['artifact_id'] and r['artifact_version'] == packet['artifact_version'])
            gap['evidence_refs'] = copy.deepcopy(refs)
            sid = 'material:'+packet['artifact_id']+':'+str(packet['artifact_version'])
            if sid not in gap['source_refs']:
                gap['source_refs'].append(sid)
    # Reading a new file adds it to the new diagnosis, retaining all historical versions.
    known = {(r['artifact_id'],r['artifact_version']) for r in d.get('artifact_versions', [])}
    for row in p.get('stored_artifacts', []):
        if (row['artifact_id'],row['artifact_version']) not in known:
            d.setdefault('artifact_versions', []).append(copy.deepcopy(row))
        sid = 'material:' + row['artifact_id'] + ':' + str(row['artifact_version'])
        if not any(x['source_id'] == sid for x in d['sources']):
            d['sources'].append({'source_id':sid,'kind':row['kind'],'title':row['title']+' v'+str(row['artifact_version'])})
    d['resolution_confirmed'] = all(g.get('status') == 'closed' for g in d['gaps'] if not g.get('history_only'))
    team.validate_diagnosis(d)
    draft = plan_remaining(d, p)
    old_tasks = {t['task_id']:t for t in p['plan']['tasks']}
    new_tasks = {t['task_id']:t for t in draft['tasks']}
    p['diagnosis'] = d
    p['proposal'] = {'id':uuid.uuid4().hex,'plan':draft,'reason':'基于已确认复核，只更新剩余工作；请核对后采用',
        'diff':{'added':sorted(new_tasks.keys()-old_tasks.keys()),'removed':sorted(old_tasks.keys()-new_tasks.keys()),
                'changed':[k for k in old_tasks.keys()&new_tasks.keys() if old_tasks[k]!=new_tasks[k]],
                'time_blocks_before':copy.deepcopy(p['plan']['time_blocks']),'time_blocks_after':copy.deepcopy(draft['time_blocks'])}}
    p.setdefault('applied_review_ids', []).append(review_id)
    return team.commit(p, p['version'], '人工确认复核后生成剩余计划预览；执行历史保留')
