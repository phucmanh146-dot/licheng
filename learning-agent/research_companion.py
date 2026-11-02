"""Versioned research intake, daily commitment and foreground deadline check-ins.

Rule suggestions are labelled drafts. No paper-writing or background push claims.
"""
from datetime import datetime, timezone
import copy
import team_orchestrator as team


def stamp(value):
    if not isinstance(value, str):
        raise ValueError('截止时间需要带时区的ISO时间')
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as exc:
        raise ValueError('截止时间格式不正确') from exc
    if parsed.tzinfo is None:
        raise ValueError('截止时间必须有时区，不能猜测')
    return parsed.astimezone(timezone.utc)


def text(data, key, required=True):
    value = data.get(key, '')
    if not isinstance(value, str) or len(value) > 2400:
        raise ValueError(key + '需要不超过2400字的文字')
    if required and not value.strip():
        raise ValueError('请补充：' + key)
    return value.strip()


def save(data):
    p = team.current(data)
    outcome, materials, blocker = (text(data, k) for k in ('outcome', 'materials', 'blocker'))
    minutes = data.get('available_minutes')
    if type(minutes) is not int or not 1 <= minutes <= 720:
        raise ValueError('请填写今天实际可用的1至720分钟')
    deadline = stamp(data.get('deadline'))
    old = p.get('research_companion', {})
    revision = old.get('revision', 0) + 1
    p['research_companion'] = {
        'revision': revision, 'outcome': outcome, 'materials': materials,
        'blocker': blocker, 'available_minutes': minutes,
        'today_output': text(data, 'today_output'), 'first_action': text(data, 'first_action'),
        'deadline': deadline.isoformat(), 'status': 'active', 'events': copy.deepcopy(old.get('events', [])),
        'constraints': ['不代写论文或伪造数据', '陪伴澄清需求', '只解释当前步骤并核对产物'],
        'suggestion_mode': 'user_confirmed_commitment_not_ai_diagnosis',
        'reminder_scope': 'foreground_page_only', 'checkin_revision': None
    }
    return team.commit(p, p['version'], '保存本人确认的今日小产物与截止时间；不改原任务计划')


def guidance(blocker):
    if '资料' in blocker or '附件' in blocker:
        return '先列出缺的具体附件和可以询问的人，保存求助卡；不要补造材料。'
    if '报错' in blocker or '环境' in blocker:
        return '先保存错误原文、当前文件位置和已试方法，再只检查一个前置条件；仍失败就求助。'
    if '疲惫' in blocker or '累' in blocker:
        return '先保存做到哪和下一步；可以休息后返回，或主动缩小今天的范围，不默认延长原截止。'
    return '先说明最不懂的一个术语或操作，只讲这一点并做一行试做；仍不懂就带着原文求助，不死磕。'


def today(project_id, now=None):
    p = team.state(project_id)
    card = p.get('research_companion')
    if not card:
        return {'project_id': project_id, 'project_version': p['version'], 'card': None,
                'message': '先说清今天想交什么、现在有什么、卡在哪；不必先把需求说得很专业。'}
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError('当前时间必须有时区')
    remaining = (stamp(card['deadline']) - now).total_seconds()
    state = 'overdue' if remaining <= 0 else ('due_soon' if remaining <= 600 else 'scheduled')
    if card['status'] == 'submitted':
        state = 'submitted_pending_review'
    acknowledged = card.get('checkin_revision') == card['revision']
    return {'project_id': project_id, 'project_version': p['version'], 'card': copy.deepcopy(card),
            'deadline_state': state, 'remaining_seconds': round(remaining),
            'show_checkin': state in ('due_soon', 'overdue') and not acknowledged,
            'message': ('截止前10分钟了：你进行到哪？能交什么？有困难就不要死磕，可以拆小、求助或保存现场。'
                        if state == 'due_soon' else
                        '截止已到：先保存真实进度和未完成原因，选择补救，不自动顺延截止。' if state == 'overdue' else
                        '小产物已登记，等待按原标准复核。' if state == 'submitted_pending_review' else
                        '今天这一步进行到哪？哪里卡住了？需要拆小、解释、求助或保存现场吗？'),
            'help': guidance(card['blocker']), 'reminder_scope': '页面打开并联网时检查；关闭页面后无推送保证'}


def checkin(data):
    p = team.current(data)
    card = p.get('research_companion')
    if not card:
        raise ValueError('请先确认今日任务')
    if data.get('card_revision') != card['revision']:
        raise team.Conflict('今日任务已调整，请查看新版再回复')
    choice = data.get('choice')
    if choice not in ('progress', 'need_help', 'shrink', 'pause', 'submitted'):
        raise ValueError('请选择进度、求助、拆小、暂停或提交')
    note = text(data, 'note')
    if choice == 'submitted' and not text(data, 'artifact_ref', False):
        raise ValueError('请填写真实产物位置；提交不等于质量通过')
    card['events'].append({'at': datetime.now(timezone.utc).isoformat(), 'choice': choice,
                           'note': note, 'artifact_ref': text(data, 'artifact_ref', False),
                           'revision': card['revision']})
    if (stamp(card['deadline']) - datetime.now(timezone.utc)).total_seconds() <= 600:
        card['checkin_revision'] = card['revision']
    card['status'] = 'submitted' if choice == 'submitted' else choice
    card['next_support'] = guidance(card['blocker'])
    # This is a companion check-in, never formal task approval or deadline extension.
    return team.commit(p, p['version'], '保存本人进度与支持选择；正式成果仍需独立复核')
