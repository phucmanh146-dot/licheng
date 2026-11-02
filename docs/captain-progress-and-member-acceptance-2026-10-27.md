# 上岸鸭｜C进度勾选与A/B验收（2026-10-27）

本轮固定在 `captain/evidence-demo-20261027@359ba1c` 的源码树上继续，独立工作分支 `captain/independent-review-acceptance-20261027`。不覆盖历史工作区、不合并或部署生产服务。下列勾选只表示写明范围的证据通过。

## 已完成，可勾选

- [x] 三份仓库分工与当前 PR/分支重新核验。[产品目标](https://github.com/phucmanh146-dot/shangan-ya/blob/00935fcb356a977a55db2ad6374b0219f26495b8/docs/product-goal-original-features-and-team-dispatch-2026-10-26.md) · [优化分工](https://github.com/phucmanh146-dot/shangan-ya/blob/00935fcb356a977a55db2ad6374b0219f26495b8/docs/team-dispatch-optimized-by-roles-and-provincial-prize-gates-2026-10-26.md) · [总调度验收](https://github.com/phucmanh146-dot/shangan-ya/blob/7ba0ad4775147dc32e23a2ff6e3383685d5274fe/docs/team-total-dispatch-and-provincial-first-prize-acceptance-2026-10-25.md)。
- [x] 已读取补交 DOCX，解决上轮“附件未取得”阻塞。SHA256 `c739d2172d041fa758c164d166535ea4c2b0de2a628b17c55ef787d875333a68`。C 主责页码：**1、2、4、5、6、12、13、16、17、18、19、20**；A：3、7、8、14；B：9、10、11、15。原件是框架与计划，不是功能完成证明；提到的14页视觉参考PDF本轮没有取得。
- [x] 固定基线、查明历史 provenance 差异；旧报告固定历史版本，未删除旧哈希检查。[历史核验](https://github.com/phucmanh146-dot/shangan-ya/blob/359ba1c57bae87a148a5a0d6ed46be94af3f012b/docs/captain-audit-2026-10-27.md)。该报告中“附件未取得”为此前快照，现由本轮已读取原件更正。
- [x] 可运行工程演示与14事件轨迹已交付，当前补丁下重跑通过。[入口](https://github.com/phucmanh146-dot/shangan-ya/blob/captain/independent-review-acceptance-20261027/learning-agent/captain_demo.py)。实际材料/SQLite/规则运行，模型与角色为 SIMULATED，不能勾选真人闭环。
- [x] **新增实际功能：正式成果自评拒收。** 提交记录保存 executor_ids 及声明来源；默认冻结任务负责人列表，实际代做/协作可明确填写参与成员。接收A回执和最终确认两处均排除执行者；多个参与人均排除；旧提交保守按负责人判断。[状态机](https://github.com/phucmanh146-dot/shangan-ya/blob/captain/independent-review-acceptance-20261027/learning-agent/team_orchestrator.py) · [复核回执](https://github.com/phucmanh146-dot/shangan-ya/blob/captain/independent-review-acceptance-20261027/learning-agent/team_handoff.py)。
- [x] 修复模型复核适配器错误使用任务负责人为复核人的问题；无非执行成员时，在调用模型前阻断；模型回执保留“待人工确认”，不冒充其已实际参与。[模型适配](https://github.com/phucmanh146-dot/shangan-ya/blob/captain/independent-review-acceptance-20261027/learning-agent/team_ai.py)。
- [x] 总控页面补实际执行成员输入，复核下拉排除参与执行者；服务端仍独立校验，不依赖页面隐藏。[总控界面](https://github.com/phucmanh146-dot/shangan-ya/blob/captain/independent-review-acceptance-20261027/learning-agent/team.html) · [交互](https://github.com/phucmanh146-dot/shangan-ya/blob/captain/independent-review-acceptance-20261027/learning-agent/team.js)。
- [x] 新增9项独立复核门测试：执行者快照、自评回执、自评确认、代做、多人参与、非法成员、正常独立确认、历史提交、无候选人不调用模型。[测试](https://github.com/phucmanh146-dot/shangan-ya/blob/captain/independent-review-acceptance-20261027/learning-agent/test_independent_review.py)。
- [x] 全量 `python -X utf8 -m unittest discover -q`：本地248项通过，远程“江月的诗”248项复跑通过。`node --check team.js`、`git diff --check`通过。日志随本轮证据包交付；代码变动后相关测试应重跑。
- [x] B 原始分支固定 `59a1eaff7aa3fa61135c021f108a4d6cb9216f35`，在远程设备下载固定归档并验收41项原分支测试（规划、独立B、HTTP、细化）；exit 0。[B源码](https://github.com/phucmanh146-dot/shangan-ya/tree/59a1eaff7aa3fa61135c021f108a4d6cb9216f35/learning-agent) · [PR34](https://github.com/phucmanh146-dot/shangan-ya/pull/34)。这是模块工程验收，不是B真人执行成果验收。
- [x] C的一页可编辑PPT + 单页PDF已完成，对应第12页，并支持第16页说明。采用DOCX要求的深墨蓝、青绿和风险橙，明确展示已验证与未验证项；全20页成品尚未制作。

## A/B验收结论

| 角色 | 可核验证据 | 本轮结论 | 后续放行条件 |
|---|---|---|---|
| A | diagnosis-research-agent、A、learning-agent和p1/integration仍同为115f267；PR6正文有模块描述，但文件树没有独立A模块 | **BLOCKED：缺实际代码/样本交付，不能签完成**；不推断线下没做 | 提交真实文件与commit、至少3条原文支持的gap、来源locator与unknown；由C抽查。不能只交PR正文代码片段 |
| B | 59a1eaf独立规划模块、容量/排程/细化与41项测试通过；PR10/34仍open | **PASS（模块工程范围）**；真实样本成果NOT_RUN/UNKNOWN | 只接收C抽查过的gap，行动卡由非编卡者执行，交真人V2/hash/diff/耗时，A独立内容复核 |
| C | 版本/状态/复核已有基础，本轮新增执行者排除门，248项全回归和远程复验通过 | **PASS（本补丁工程范围）**，未发布 | 真实模型七步、真实作品链和试用对照继续待验收 |

## 未完成，保持不勾选

- [ ] A 首个样本至少3条真实候选gap、来源支持性及交接文件。
- [ ] B 三个样本的真人执行、非编卡者执行记录、真实V2/diff/耗时。
- [ ] A或另一位非执行者对实际V2按冻结判据做独立内容复核。
- [ ] 数智助老/无界智泊原件版本、授权与专属目标标准核实。
- [ ] 当前版本真实模型连接、真实文件诊断/复核、401/429/超时等LIVE失败分支；本轮未启动真实模型调用。
- [ ] 两个业务差异明显的真人场景和5–8人同条件试用；未宣称效率或获奖提升。
- [ ] 全20页PPT成品、连续三次真实演示、公网部署、官方截止时间与提交回执。
- [ ] PR21/22交叉试合并；各自clean不等于相互无冲突。无授权的自动合并/生产发布没有执行。
- [ ] 后台持续监测：尝试创建每3小时检查，但应用automation_update返回Invalid app tool request；**未创建成功**。本轮远程检查已完成，不能说后台仍在自动工作。

## 原件页码到C产物映射

| C页码 | 内容 | 本轮状态 |
|---|---|---|
| 01/02/04 | 封面、定位、成功定义 | 职责已核对，20页成品未制作；5分钟承诺待真人数据 |
| 05/06 | 闭环、四层架构 | 仓库调用链已核对；LIVE组件不标已上线 |
| 12 | 版本保护与状态机 | **本轮一页PPT已完成；工程门已修复并回归** |
| 13 | 对比普通大模型 | 对照实验NOT_RUN，不写优于竞品 |
| 16 | 测试矩阵与验收门 | 本轮248项回归与B原分支41项证据可用；真人门未通过 |
| 17 | 试用与对照 | NOT_RUN |
| 18 | 三人调度 | 依赖和职责可确认；11/10是计划而非已核实官方截止 |
| 19/20 | 演示、风险与下一步 | SIMULATED演示和风险表已备；真实演示/最终提交未完成 |

## 实现边界与复现

executor_ids为本机协作的**声明性成员记录**，不等于登录认证、防伪身份或证明实际参与人。负责人默认作为保守执行者集合；必须如实填写共同参与者。试做/学习任务的证据核对与正式成果独立复核分别处理；本补丁不强制学习任务独立复核。模型回执不会赋予content_independently_verified=true。不能仅凭成员编号不同宣称真人独立审查。

完整回归：learning-agent中 `python -X utf8 -m unittest discover -q`。远程采用独立SHANGAN_AGENT_DATA和临时目录，调用真实Python/SQLite/本机HTTP。B原分支验收：`python -X utf8 -m unittest -q test_action_planner test_b_independent test_planner_http test_refinements`。本轮初次回归发现模型适配器仍写执行者ID，保留失败记录后修复，再全量通过。早期本地网络限制导致的回环错误、远程PowerShell stderr包装错误不计为业务通过，最终以成功复跑日志为准。

## 一页PPT下载

[可编辑PPTX](assets/captain-agent-one-slide-20261027.pptx) · [单页PDF](assets/captain-agent-one-slide-20261027.pdf)。
