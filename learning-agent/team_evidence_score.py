"""Transparent role evidence coverage; never a person's ability or award score."""
import artifact_store
import team_intervention

def report(p):
    artifacts = p.get('stored_artifacts', [])
    readable = []
    for a in artifacts:
        try:
            artifact_store.read(p, a['artifact_id'], a['artifact_version'])
            readable.append(a)
        except ValueError:
            pass
    d = p.get('diagnosis') or {}
    plan = p.get('plan') or {}
    tasks = plan.get('tasks', [])
    gaps = d.get('gaps', [])
    grounded = bool(gaps)
    for g in gaps:
        try:
            artifact_store.references(p, g.get('evidence_refs'))
        except ValueError:
            grounded = False
    current = bool(d and not p.get('diagnosis_needs_refresh') and not p.get('plan_stale'))
    reviews = []
    for record in p.get('artifact_reviews', []):
        packet = record.get('packet', {})
        try:
            submitted_ref = (packet['artifact_id'], packet['artifact_version'])
            task = next(t for t in tasks if t['task_id'] == packet['task_id'])
            submission = task.get('submission') or {}
            if (submission.get('artifact_id'), submission.get('artifact_version')) != submitted_ref:
                continue
            rows = packet['criterion_results'] + packet['gap_results']
            if not rows or record.get('source') != 'A_handoff':
                continue
            for row in rows:
                artifact_store.references(p, row.get('evidence_refs'), submitted_ref)
            reviews.append(record)
        except (ValueError, KeyError, StopIteration):
            continue
    # Legacy demo ledgers and ungrounded self-reports receive no evidence credit.
    real = p.get('mode') == 'live' and bool(p.get('artifact_storage_required'))
    fine = bool(tasks) and all(t.get('micro_steps') and all(
        all(s.get(k) for k in ('input_version','target_locator','output','self_check','failure_next'))
        for s in t['micro_steps']) for t in tasks)
    episodes = team_intervention.report(p)
    active = [r for r in episodes['interventions'] if not r['stale']]
    submitted = [a for a in readable if a['purpose'] == 'submission']
    checks = {
      'A': [
        ('A1','作品及参考均可回查',bool(any(a['kind']=='user_material' for a in readable) and any(a['kind']=='reference' for a in readable))),
        ('A2','当前诊断有实际引文',current and grounded),
        ('A3','收到基于新版的复核',bool(reviews and submitted)),
        ('A4','复核后确认与差距更新',bool(p.get('applied_review_ids')))],
      'B': [
        ('B1','当前计划已采用',current and bool(tasks)),
        ('B2','动作绑定版本位置产物自检',current and fine),
        ('B3','首动作五分钟估时已绑定',bool(active) and any(r['first_step_minutes']<=5 for r in active)),
        ('B4','实际小产物已登记待复核',any(r['status']=='output_pending_review' for r in active))],
      'C': [
        ('C1','项目材料版本实际落盘',bool(readable)),
        ('C2','当前任务存档点',bool(active)),
        ('C3','本人确认接续有记录',any(r['resumes'] for r in active)),
        ('C4','复核后仅剩余计划轨迹',bool(p.get('applied_review_ids') and p.get('proposal')))]
    }
    roles = []
    for role, items in checks.items():
        criteria=[{'id':key,'label':label,'points':5 if real and bool(ok) else 0,'max':5,
                   'status':'record_present_quality_unverified' if real and bool(ok) else 'missing',
                   'comment':'请核对实际语义与真人行为；结构存在不代表效果' if ok else '补齐对应材料或实际执行记录'}
                  for key,label,ok in items]
        roles.append({'role':role,'points':sum(x['points'] for x in criteria),'max':20,'criteria':criteria})
    return {'project_id':p['project_id'],'project_version':p['version'],
            'rubric':'流程证据覆盖分v1：每角色4项，每项0或5分；非成员能力、非创新质量或官方赛事分',
            'roles':roles,'terminal':episodes['terminal'],'human_effectiveness':'not_verified',
            'note':'分数来自本项目现有记录，不以夹具测试数量加分；参考奖项和效果主张需另核验。'}
