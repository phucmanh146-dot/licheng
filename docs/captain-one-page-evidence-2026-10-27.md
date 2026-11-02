# 队长 C｜一页来源与工程证据包

核验日期：2026-10-27（Asia/Shanghai）。基线 `00935fcb356a977a55db2ad6374b0219f26495b8`；本轮为离线工程演示，未部署。

**C 主责**：数智助老、无界智泊的集成；冻结代码/原件版本、抽查 A 的证据及 B 的行动卡、结构化 schema、任务状态机、expected_version、重复提交、恢复、模型失败和端到端证据汇总；统筹 PPT 与发布建议。

**职责来源**（仓库 docs/）：`team-dispatch-optimized-by-roles-and-provincial-prize-gates-2026-10-26.md` 第 2、10.3、11.2–11.3 节；`product-goal-original-features-and-team-dispatch-2026-10-26.md`；`team-total-dispatch-and-provincial-first-prize-acceptance-2026-10-25.md` 第 3、6、10 节。前两份固定在上述基线，第三份亦核对原链接 `7ba0ad4`。

**本轮工程产物**：`learning-agent/captain_demo.py` 是对已有夹具的可运行集成演示入口；复用 `team_ai.py`、`artifact_store.py`、`team_handoff.py`、`team_orchestrator.py`、`team_revision.py`。仅模型边界和角色操作为脚本；真实材料字节、引用校验、B 规则与 SQLite 正常执行。没有新增模型或替换已有底座。

**运行**：在 learning-agent 执行 `python -X utf8 captain_demo.py`。每次建立新的 demo-runs/run-* 目录，不打开原有运行数据库。输出 `index.html`、`trace.json`、`demo.sqlite3`、V1/V2 和 diff；trace 含当前 Python 源文件 SHA256。点击 HTML 每一步即可展开状态和拒收原因。

**已核验**：14 个事件/检查；旧 expected_version、缺失成果、无 A 回执、旧版复核引用及覆盖已完成项均被拒绝且持久状态不变；重复回执不增版本；V2 先 pending_review；重排保留完成项；新 SQLite 连接可读回状态。120 项既有回归在 UTF-8 模式通过。首次默认 GBK 回归为 119 通过、1 编码错误，失败记录保留。

**证据边界**：runtime mode=live 只为启用真实材料门；模型为 controlled-fixture，live_verified=false。脚本生成 V2、提交与确认，不能证明真人工作、独立人员复核、语义质量或用户效果。真实模型、真人 V2、独立内容复核、用户试用均 not_run。

**C 下一步**：取回 20 页框架与详细逐页分工原件，核实准确页码；固定有授权样本和判据；A 证据→C 抽查→B 首卡→非编卡者真人 V2→A 独立复核；补真实模型失败/超时、重启进程与两条不同场景闭环，再做同条件对照。当前 demo 的重新读取只证明连接恢复，不等于网络请求或进程自动续跑。

**A/B 状态**：A 分支/p1 同为 `115f267`；PR #6 正文有模块描述但文件树无 A 专属模块，不能确认交付。B `59a1eaf` 较该基线 ahead 8，有规划、容量、排程与测试；PR #10/#34 未合并，真人执行证据仍未知。
