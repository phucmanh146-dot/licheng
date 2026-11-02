"""Eight sprint deliverables projected from the original ledger, never auto-certified."""
TASKS = [
    (1, 'D1', 'C', '固定运行版本、模型与一份定位诊断', [3,4], '运行入口、commit、模型模式、真实请求/输出及失败记录'),
    (2, 'D1', 'A', '八项目各一条关键差距', [5,9,14,19,24,29,34,39,44], '8行原文—判据—差距—缺证表；不扩成24条'),
    (3, 'D1', 'B', '八张专属首步卡', [6,10,15,20,25,30,35,40,45], '位置、动作、产物、自检、失败下一步；模型原始卡及人工修订'),
    (4, 'D2', 'B组织，非编卡者执行', '两份真人V2', [7,11,17,23,27,32,37,42,47], '优先嘉农和玉米；阻塞后换材料就绪者，保留前后差异、耗时与卡点'),
    (5, 'D2', 'A复核，C核状态', '两份V2独立复核与剩余重排', [12,18,23,28,33,38,43,48,53], '按D1冻结判据逐项PASS/FAIL/UNKNOWN；执行者不能自评'),
    (6, 'D2末', 'C', '演示路径回归', [3,48,54], '读材料→产卡→待复核→只排剩余→刷新恢复；记录当前SHA'),
    (7, 'D3', 'A/B供素材，C整合', '保留现有20页PPT结构', [50,51,53,54], '八项目总表、两条真实对照、一页运行与边界；六项停在实际阶段'),
    (8, 'D3', 'C主责，A/B交叉看', '运行包、说明、视频与备份', [54], '非开发者照说明跑一次；格式/时长另核，预留半天打包'),
]

def project_sprint(rows):
    by_id = {r['task']['id']: r for r in rows}
    items = []
    for number, day, owner, title, ids, evidence in TASKS:
        refs = [{'id':i, 'status':by_id[i]['effective_status']} for i in ids if i in by_id]
        items.append(dict(id=number, day=day, owner=owner, title=title,
                          required_evidence=evidence, related_tasks=refs,
                          status='needs_deliverable_review'))
    return {'scope':'八项冲刺视图；55项保留历史验收，不要求三天全闭环',
            'source':'上岸鸭_三天冲刺_八项任务_20261031.docx',
            'schedule':'D1/D2/D3为相对时间，实际截止需团队确认',
            'completion_rule':'关联55项状态只作线索，不自动证明冲刺交付完成；真人及交付物需单独核验',
            'items':items}
