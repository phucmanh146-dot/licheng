"""Member-owned task context and recorded capability evidence; never inferred skill."""
import copy
import uuid
from datetime import date
import team_orchestrator as team
import artifact_store


def text(data, key, limit=3000):
    value = data.get(key, '')
    if not isinstance(value, str) or len(value) > limit:
        raise ValueError(key + ' 需为不超过 ' + str(limit) + ' 字的文字')
    return value.strip()


def save_context(data):
    p = team.current(data)
    value = team.required(data, 'project_context', dict)
    kind = value.get('project_type', 'other')
    if kind not in ('competition', 'hackathon', 'business', 'research', 'other'):
        raise ValueError('项目类型无效')
    ctx = {key: text(value, key) for key in ('event_name', 'edition', 'track', 'target_result', 'rules_note')}
    ctx['project_type'] = kind
    ctx['deadline'] = text(value, 'deadline', 10)
    if ctx['deadline']:
        date.fromisoformat(ctx['deadline'])
    ctx['acceptance_criteria'] = team.strings(value, 'acceptance_criteria', True)
    if len(ctx['acceptance_criteria']) > 30:
        raise ValueError('本轮验收条件最多 30 条')
    p['project_context'] = ctx
    p['diagnosis_needs_refresh'] = True
    p['proposal'] = None
    return team.commit(p, p['version'], '保存本项目目标、条件与待核对事项')


def save_member(data):
    p = team.current(data)
    row = team.required(data, 'member', dict)
    identifier = row.get('member_id') or uuid.uuid4().hex
    if not isinstance(identifier, str) or len(identifier) > 80:
        raise ValueError('成员标识无效')
    profiles = p.setdefault('member_task_briefs', [])
    old = next((m for m in profiles if m['member_id'] == identifier), None)
    member = {'member_id': identifier, 'name': team.required(row, 'name'),
              'owned_task': text(row, 'owned_task'), 'understanding': text(row, 'understanding'),
              'tools': text(row, 'tools'), 'language': text(row, 'language', 80) or '中文',
              'self_reported_capabilities': team.strings(row, 'self_reported_capabilities'),
              'capability_evidence': copy.deepcopy((old or {}).get('capability_evidence', []))}
    if len(member['name']) > 100 or not member['owned_task'] or not member['understanding']:
        raise ValueError('请写本人负责的具体产物及本人对任务的理解')
    if old:
        profiles[profiles.index(old)] = member
    else:
        if len(profiles) >= 20:
            raise ValueError('当前最多记录20位成员')
        profiles.append(member)
    p['diagnosis_needs_refresh'] = True
    p['proposal'] = None
    return team.commit(p, p['version'], '保存本人任务与能力自述；自述不计为能力通过')


def record_capability(data):
    p = team.current(data)
    member = next((m for m in p.get('member_task_briefs', []) if m['member_id'] == data.get('member_id')), None)
    if member is None:
        raise ValueError('请先登记本人任务')
    row = team.required(data, 'capability', dict)
    passed = row.get('passed')
    if type(passed) is not bool:
        raise ValueError('试做结果需明确通过或未通过')
    ref = {'artifact_id': team.required(row, 'artifact_id'),
           'artifact_version': team.integer(row, 'artifact_version', 1)}
    evidence_ref = {**ref, 'locator': team.required(row, 'locator'), 'quote': team.required(row, 'quote')}
    artifact_store.references(p, [evidence_ref], (ref['artifact_id'], ref['artifact_version']))
    record = {**ref, 'capability': team.required(row, 'name'), 'criterion': team.required(row, 'criterion'),
              'evidence': team.required(row, 'evidence'), 'evidence_refs': [evidence_ref], 'passed': passed,
              'method': 'member_confirmed_with_readable_artifact', 'created': team.agent.now(),
              'evidence_confirmed': True}
    member['capability_evidence'].append(record)
    p['diagnosis_needs_refresh'] = True
    p['proposal'] = None
    return team.commit(p, p['version'], '记录实际试做材料与成员确认；不是自动能力认证')
