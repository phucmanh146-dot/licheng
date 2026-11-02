# 仓库核验与 C 剩余任务（2026-10-27）

## 基线和保留措施

仓库 phucmanh146-dot/shangan-ya；没有单独名为 captain 的分支。按给定文档链选择 captain/personalized-first-step-provincial-prize-20261026，固定 00935fcb356a977a55db2ad6374b0219f26495b8。main 为 2da3085f268e783bf2996d60491bcab16d0ad7eb，p1/integration 为 115f2671bb757b6a59ce12ea30c0760720f6d601。

直接 git clone 连接重置，改用 GitHub codeload 固定 commit ZIP。本地 Git 初始提交仅为 archive import（不冒充远端 commit）；远端发布使用真实 00935fc 作为父提交，新分支 captain/evidence-demo-20261027。未覆盖既有工作副本、未合并历史分支、未改生产服务。

## 三份文档与附件的对照

已读三份链接 Markdown：优化分工（00935fc，blob 76c14b2）、最终产品目标（00935fc，blob e1f05fb）、总调度验收（原链接 7ba0ad4，blob af8ba6f）。三者一致要求先冻结基线、A 证据、C 抽查、B 行动、真人 V2、独立复核和只重排剩余项；10/26 优化版补充结构化输出、状态/恢复、有限重试与 10/27 接口盘点。

原会话 read_thread 两次返回 Invalid app tool request；缓存不含附件内容。本地当前/前一天 Codex 目录与远程 Documents/Downloads/Desktop 及文件名搜索未取得《上岸鸭_20页PPT内容框架_逐页标注负责人.pdf》或详细逐页分工原件；搜索存在权限不完整提示。故附件页码/内容对照为 BLOCKED，不能从仓库文档推断“C 第几页”。本轮一页资料按仓库职责准备，待原件补回后再映射。未声称看过附件或完成 20 页逐页核验。

## PR / issue / commit 状态（核验时快照）

- #52 merged 2026-10-26，仅进入 #51 分支。#51 -> #49 -> #47 -> #42 -> #35 -> #25 等仍是开放堆叠链，并未发布 main。#48 是另一条开放测试分支，本次没有混合它的补丁。
- #21、#22 各自目标均 feat/general-agent-closed-loop-20261012，API mergeable=true/clean。这不等于两者相互无冲突：两头 compare 为 diverged，#22 相对 #21 ahead 21 / behind 2，重叠含 team_recovery.py、team_orchestrator.py、team_ai.py 和 UI。未执行试合并，实际合并冲突 NOT_RUN；保留两分支，按函数职责协调，禁止整文件覆盖。
- #3/#4/#5/#25/#42/#47 有不同历史 C 工程与测试说明；正文中的旧测试数、模型结果只是历史报告，不作为本轮通过结论。
- 有效执行 issues #7、#13–#20、#32、#37、#43 均 open。open 不自动代表相关代码完全不存在；无证据不标成员已完成。另有与开发无关的重复 issue，未据其文字执行任何操作。
- 当前基线最近 00935fc、262c914、f01264f 等为文档变更；#52 文档合并不证明 Dify/RAG/COS 或真实模型已连接。

## A/B 按仓库证据判断

| 成员 | 可核验事实 | 可报告状态 | 不能确认 |
|---|---|---|---|
| A | feature/diagnosis-research-agent、A、learning-agent、p1/integration 同为 115f267；树中无 src/agents/a-agent 模块。#6 正文包含 JS 模块/测试文字，但不是已提交文件 | 共享基线已有；A 独立实现未见落库证据 | 不据正文认定 A 已交付解析/真实模型/独立内容复核；不推断线下没做 |
| B | feature/action-planner-agent=59a1eaf，相对 115f267 ahead 8/behind 0；含 action_planner.py、b_capacity.py、b_joint_schedule.py、b_refinements.py 及相关测试；#10/#34 open | 规划代码交付存在，尚未合并；本轮 demo 使用基线中的 B 规则适配 | 不确认 B 负责三个样本的真人 V2、耗时或第三人可执行率 |
| C | 当前基线已有实际字节存储、schema/引用验证、版本锁、pending_review、复核回执、剩余计划与恢复模块 | 工程基础存在；本轮新增演示入口和证据资料 | 不认定全部 C 清单、样本或发布已完成 |

## C 完成与缺口

C 负责数智助老、无界智泊；还包括工程基线/原件哈希、schema、模型接入、版本保护、状态恢复、A/B 抽查、E2E 失败证据、同条件评估、PPT 汇总与发布放行。

本轮完成：固定源码、三份职责文档和 PR/issues 核验；解释历史 provenance；新增可运行演示入口并验证现有门；保存当前源哈希/SQLite/V1/V2/diff；生成一页来源包。没有修改现有业务模块。

尚缺：附件逐页对照；有授权的数智助老/无界智泊原件及冻结判据；真实模型七步验收；A 来源支持性独立抽查；真人 V2、独立内容复核；同条件普通 LLM 对照和 5–8 人试用；部署与官方期限核实；#21/#22 交叉试合并。应分别标 BLOCKED/NOT_RUN，不能以 demo 替代。

## provenance 原因

evidence/first-prize-v5/provenance.json 固定 input_commit=b191d849af7ede9801ccb5dbd21f5d943ab307e1（历史 10/12）。本轮 00935fc 有 9 个 module_blobs 不同：action_planner、learning_agent、learning_agent_server、team_dispatch、team_handoff、team_orchestrator、team_rescue、test_handoff、test_team_rescue。当前 learning_agent.py blob=00acf4f55f21bd1e4e543412d31c589f4921119e，历史预期 cd6fd23160758972af4c749e8398286cf6a2282a。差异是历史与当前代码版本不同，未据此认定损坏；旧包保留，不删除检查、不改旧 provenance。新 demo trace 保存本次每个 Python 文件 SHA256。

## 复现与验证

learning-agent 中执行 `python -X utf8 captain_demo.py`，每次创建独立目录；入口复用现有 test_general_loop / test_captain_review_gates 夹具，作为演示 harness，不是新增生产 AI。模型边界被控制，模型/人类角色均 SIMULATED。实际解析器、B 规则、状态机、持久化和引用校验被调用。

14 个事件与断言覆盖正常链和负例。输入 V1/V2 是人工例子，不使用真实项目名称。项目 mode=live 是现有代码启用实际材料门的开关；外层 trace/page 明确 SIMULATED，live_verified=false。脚本复用同一测试成员进行提交/确认，因此尤其不能宣称人员独立性或防自评已验收。

回归命令：`python -X utf8 -m unittest -q test_agent test_team test_general_loop test_captain_review_gates test_captain_runtime test_recovery test_team_recovery`。120 tests，OK。先前默认 Windows GBK 运行 120 tests，有 1 项读取 UTF-8 HTML 错误；设置 UTF-8 后通过，未改断言或业务代码。临时目录/SHANGAN_AGENT_DATA 定向工作目录。新连接读回状态已测；跨进程重启和网络请求续跑未测。

远程账号 guzmanelaine42@gmail.com 的设备江月的诗在线，ID 1527971c-6917-4fd0-9778-01f40b451bc0；先读目录才搜索。远程操作均只读；没有写入、同步或启动远程服务。
