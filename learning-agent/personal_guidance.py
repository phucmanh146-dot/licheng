"""Task-specific capability branching and a versioned, inspectable resource catalog."""
from copy import deepcopy

NAV = 'https://github.com/datawhalechina/hello-agents/blob/main/Extra-Chapter/Extra13-Hello-Agents视频课录制共创.md'
CATALOG = [
    {'source_id':'course-pandas-missing','title':'异常数据处理','author':'莫烦',
     'url':'https://mofanpy.com/tutorials/data-manipulation/pandas/dirty-data',
     'section':'找到NaN、NaN的影响、移除/填充NaN', 'aliases':['缺失值','数据清洗','pandas'],
     'exercise':'在当前数据的最小副本列出缺失记录，说明缺失与0的区别；提交改动日志及有效分母',
     'conditions':'已有可运行Python/Pandas；清洗规则由任务口径确认，不自动填0或均值'},
    {'source_id':'course-pandas-read','title':'从文件读取数据','author':'莫烦',
     'url':'https://mofanpy.com/tutorials/data-manipulation/pandas/read-save',
     'section':'读取CSV/Excel与保存文件','aliases':['读取csv','read_csv','文件读取'],
     'exercise':'读取当前数据的最小副本，记录列名、行数与编码，另存文件后读回核对',
     'conditions':'已有Python环境；仅当读取能力尚未验证时选用'},
    {'source_id':'course-react','title':'ReAct Agent','author':'范丽','url':NAV,
     'section':'第四章ReAct；配套正文4.2','aliases':['工具调用','react','工具诊断'],
     'exercise':'调用当前项目的实际材料读取工具，保存参数、返回位置及有出处的诊断',
     'conditions':'视频入口/制作人已核对，未读取完整字幕；可用配套正文'},
    {'source_id':'course-plan','title':'P&S和Reflection','author':'范丽','url':NAV,
     'section':'第四章Plan-and-Solve 4.3及Reflection 4.4','aliases':['任务拆解','规划','复核','reflection'],
     'exercise':'把当前一个有依据差距改成位置、操作、产物、自检齐全的卡；读实改新版核对',
     'conditions':'从本人已有材料出发；观看不等于功能或能力验收'},
    {'source_id':'course-langgraph','title':'LangGraph跟练实战','author':'高鸿飞','url':NAV,
     'section':'第六章第五节；状态、接线与调试','aliases':['状态','langgraph','人工确认','持久化'],
     'exercise':'在当前状态存储演示一次确认前后变化、旧版本拒收及重启恢复',
     'conditions':'沿用现有框架可学习方法，无需强制换栈；未读取视频全文'},
    {'source_id':'course-evals','title':'Agentic AI','author':'Andrew Ng（吴恩达）',
     'url':'https://www.deeplearning.ai/courses/agentic-ai',
     'section':'Module 4 Evaluations；Error analysis and prioritizing next steps',
     'aliases':['评测','eval','错误分析'],
     'exercise':'按当前任务冻结判据，记录全部尝试、实际产物、失败原因与下一项修复',
     'conditions':'英文课程，部分练习有会员条件；视频目录核对不等于全文读取'},
    {'source_id':'course-users','title':'How To Talk To Users','author':'Gustaf Alströmer',
     'url':'https://www.ycombinator.com/blog/startup-school-videos',
     'section':'Startup School 2022 Videos：How To Talk To Users',
     'aliases':['访谈','用户调研','用户洞察'],
     'exercise':'将当前三个诱导问题改为过去行为问题，实际访谈后留下原话、反例和判断依据',
     'conditions':'官方目录及讲师核对；未取得字幕，不编时间点或实际访谈数据'},
    {'source_id':'course-validation','title':'CS329P Practical Machine Learning',
     'author':'Qingqing Huang、Mu Li（李沐）、Alex Smola',
     'url':'https://c.d2l.ai/stanford-cs329p/','section':'第6讲 Model Validation',
     'aliases':['模型验证','数据泄漏','训练验证','实验复现'],
     'exercise':'列当前数据划分、指标和种子；运行最小基线并保存配置、命令及结果',
     'conditions':'2021课程；有Python、机器学习和统计先修，具体工具用当前文档'}
]
for row in CATALOG:
    row.update(kind='reference', checked_at='2026-10-12', reading_status='catalog_or_text_verified',
               video_transcript_read=False, estimated_learning_minutes=None)


def skill_status(member, skill):
    key = skill.strip().casefold()
    records = [r for r in member.get('capability_evidence', [])
               if str(r.get('capability', '')).strip().casefold() == key and r.get('evidence_confirmed') is True]
    if records:
        latest = records[-1]
        return ('verified' if latest.get('passed') is True else 'failed'), latest
    return 'unknown', None


def capability_basis(gap, profiles):
    """Display facts from member records, never certify model-reported abilities."""
    members = {m['member_id']:m for m in profiles}
    rows = []
    for owner in gap['related_member_ids']:
        member = members[owner]
        for skill in gap['required_capabilities']:
            status, record = skill_status(member, skill)
            label = {'unknown':'未知；只有自述或缺试做证据','failed':'成员确认未通过','verified':'成员记录通过'}[status]
            line = member.get('name',owner)+' / '+skill+'：'+label
            if record:
                line += '；判据 '+record['criterion']+'；材料 '+record['artifact_id']+' v'+str(record['artifact_version'])
            rows.append(line)
    return '；'.join(rows) or '未声明当前动作所需技能；不据此认定能力通过'


def resources(diagnosis, skill):
    key = skill.strip().casefold()
    found = []
    for row in diagnosis.get('resource_candidates', []):
        aliases = [str(x).casefold() for x in row.get('aliases', [])] + [str(row.get('capability', '')).casefold()]
        if not any(alias and (alias == key or alias in key) for alias in aliases):
            continue
        if not all(row.get(k) for k in ('title', 'author', 'url', 'section', 'exercise')):
            continue
        if not str(row['url']).startswith(('https://', 'http://')):
            continue
        found.append(deepcopy(row))
    return found[:3]


def prerequisites(gap, owner, member, diagnosis, context):
    tasks, paths, heads = [], [], []
    for i, skill in enumerate(gap.get('required_capabilities', [])):
        status, evidence = skill_status(member, skill)
        if status == 'verified':
            continue
        refs = resources(diagnosis, skill)
        phases = [('trial','先试做确认能力')] if status == 'unknown' else [('learn','补当前错误的方法'),('practice','制作最小练习'),('retest','再次试做')]
        chain = []
        for phase, title in phases:
            identifier = f'{gap["gap_id"]}:{owner}:{i}:{phase}'
            locator = gap.get('current_locator', '待定位材料')
            steps = [f'在 {locator} 围绕「{gap["target_result"]}」制作一个最小片段，保存操作和产物',
                     '按当前验收条件核对，记录通过项、错误与未知；把实际产物登记为能力证据']
            grounded = next((s for s in gap.get('micro_steps', [])
                             if all(isinstance(s.get(k), str) and s[k].strip()
                                    for k in ('target_locator', 'action', 'output', 'self_check'))), None)
            if phase == 'trial' and grounded:
                locator = grounded['target_locator']
                steps = [f'打开 {locator}，先试做当前动作的一个最小单位：{grounded["action"]}',
                         f'保存试做产物：{grounded["output"]}；按「{grounded["self_check"]}」核对并记录失败或未知。'
                         '试做不自动认定能力或正式成果通过。']
            if phase == 'learn' and refs:
                r = refs[0]
                steps = [f'打开 {r["author"]} 的《{r["title"]}》，定位 {r["section"]}：{r["url"]}',
                         f'只针对当前错误学习并回到「{gap["target_result"]}」；适用条件：{r.get("conditions", "待核对")}']
            elif phase == 'learn':
                steps = [f'先核对「{skill}」当前错误与先修条件，查找能用于「{gap["target_result"]}」的作者/具体小节',
                         '保存可访问链接、作者、章节、练习和复试标准；资料不足保持未知，不记为已学会']
            elif phase == 'practice' and refs:
                steps = [refs[0]['exercise'], '留下练习产物和失败记录，再按当前判据复试']
            tasks.append({'task_id': identifier, 'title': title + '：' + skill,
                          'gap_ids':[gap['gap_id']], 'owner_ids':[owner], 'steps':steps,
                          'deliverable':skill+' 的实际'+('资料核对记录' if phase=='learn' else '试做/练习产物'),
                          'acceptance_criteria':['提交实际产物和当前判据，记录通过、未通过或未知；不自动关闭成果差距'],
                          'estimate_minutes_range':[5,15] if phase=='trial' else [10,25],
                          'depends_on':chain[-1:], 'deadline':gap.get('deadline',context.get('deadline','待成员确认')),
                          'source_refs':gap['source_refs'], 'status':'candidate' if not chain else 'blocked',
                          'kind':phase, 'capability':skill, 'capability_status':status,
                          'estimate_basis':'待本人确认和实际用时校准', 'resource_options':refs})
            if gap.get('current_artifact'):
                tasks[-1]['micro_steps'] = [{'step_id':identifier+':'+str(n),
                    'input_version':deepcopy(gap['current_artifact']), 'target_locator':locator,
                    'action':action, 'reason':'当前所需能力为'+status+'；只补「'+gap['target_result']+'」的当前动作',
                    'expected_change':'取得实际'+phase+'产物与错误记录', 'output':tasks[-1]['deliverable'],
                    'self_check':'对照当前判据记录通过/失败/未知；确认原文位置和保存的产物版本',
                    'failure_next':'保留错误、试过的动作与实际产物，登记未通过；需要时绑定当前任务求助',
                    'capability_basis':str(evidence or '只有能力自述；缺实际试做证据，当前为未知'),
                    'source_refs':gap['source_refs']} for n, action in enumerate(steps, 1)]
            chain.append(identifier)
        heads.append(chain[-1])
        paths.append({'gap_id':gap['gap_id'],'member_id':owner,'capability':skill,
                      'capability_status':status,'task_ids':chain+[gap['gap_id']+':deliver'],
                      'resources':refs,'personalized':True,'basis':evidence or '能力自述未验证，先试做'})
    return tasks, paths, heads
