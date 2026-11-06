# A/B/C 视频式交互批注与 B 工程闭环验收（2026-11-05）

> 本文把仓库当前真实页面与既有视频工作流要求对齐。交互主线采用 `learning-agent/WORKFLOW.md` 已记录的层级：**目标 → 阶段成果 → 任务 → 操作动作 → 验收证据**。参考视频入口：[止止吉祥《用 AI 做日程管理》](https://jingxuan.douyin.com/m/video/7666825453981715721)。不声称取得该视频完整字幕；以下逐步操作以仓库现有控件和 API 为准。

## 0. 先打开正确入口

- 总控/真实项目入口：启动 `python learning_agent_server.py --port 8901`，打开 `/team.html`。
- B 独立规划器：同一服务打开 `/planner.html`；可导入 A 的诊断 JSON，试做后导出交接包。
- 真实项目数据以服务端 SQLite 的 project/version/history/artifact 为准；B 独立规划器的 localStorage 草案不是正式项目状态。
- 页面中的“演示”只用于验证控件，不可作为真实作品、真人执行或复核证据。

## 1. 三人责任与交接边界

### A｜真实材料诊断与独立复核

**入口/操作**
1. C 在 `team.html` 的“从磁盘选择或拖入真实材料”上传当前作品、官方条件或参考作品；选择用途为“诊断输入”，保存并解析。
2. A 从项目材料中核对真实正文和版本，逐条形成 gap；每条必须能回到当前作品和目标/参考来源的具体位置。
3. 在“01 · A 的诊断”中接收完整 Diagnosis，点击“校验并保存诊断”；不完整字段保留 unknown/blocked，不让 B 用模板补位。
4. 真人提交新版成果后，在“队友交付接线”导出待复核包；A 对照原判据重新读取 V2，逐条提交 pass/fail/unknown 及证据。

**每条 gap 必填/核对**
- `current_artifact + artifact_version + current_locator + current_evidence`
- `target_criterion + source_refs + reference_locator + gap_reason + verification_status`
- 给 B 的 `micro_steps` 候选必须指向真实版本和位置；不能编页码、段落或来源。

**A 的验收**
第三人随机抽 3 条 gap，能从每条 gap 直接定位“当前作品哪里、原文证据、目标要求、参考位置、差距原因”。无法定位就 unknown/blocked；A 不替 B 编动作。

### B｜有证据约束的行动卡、真人执行指导与剩余项重排

**总控页面实际点击顺序**
1. A 诊断保存后，进入“队友交付接线”。
2. 点击“检查 A 的交付能否进入 B”，查看 errors/warnings；有 errors 不继续。
3. 点击“调用 B 规划器并预览”；后端调用 `POST /api/agent/team/generate-b`，由 `team_handoff.generate → planner → action_planner.generate` 生成 proposal。
4. 在“02 · B 的计划预览”逐项检查 gap、source、负责人、微动作、依赖、估时、失败下一步和 unscheduled；确认后点击“采用这份计划”。采用前是 proposal，不是正式执行状态。
5. 在“03 · 执行与成果验收”选任务，点击“开始任务”；按行动卡操作并记录实际步骤/分钟。
6. 点击“提交成果”，上传真实 V2（新增 artifact version），填写成果证据和实际耗时；后端只能进入 `pending_review`，不能直接 completed。
7. 回到“队友交付接线”，导出当前目标、材料与待复核成果给 A；A 回传逐项复核 JSON。导入后点击“核对版本并保存复核”。
8. 只有复核对应当前 diagnosis/plan/artifact version、复核人独立、判据逐项有证据，C 才能人工确认通过或退回。
9. 若有 fail/unknown/remaining，调用“确认复核后更新剩余计划”；B 仅为剩余问题生成新计划，已完成、执行中、待验收、锁定项和历史记录不得被覆盖。

**每张 production action card 必须有**
`input_version / target_locator / action / reason / expected_change / output / self_check / failure_next / capability_basis / source_refs`，以及负责人、依赖、估时范围、验收条件。PPT、论文、调研、代码、数据必须按真实对象生成不同动作结构。无 grounded `micro_steps` 时必须 `blocked/unscheduled`，不能用“打开材料→完成目标→检查”的万能三步。

**B 当前工程事实（按 main 当前代码）**
- 已有规则规划器、micro_steps 校验、能力学习/试做链、单人/多人容量排程、依赖、拆分、锁定、历史校准、增量诊断 reconcile、备选方案。
- 已有总控适配 `team_handoff.py`、正式 proposal/采用、执行反馈、待复核交接、版本冲突保护及 remaining-plan 流程；页面按钮与 `learning_agent_server.py` 路由已存在。
- B 的独立页面 `planner.html` 仍是草案工作区；正式项目状态由 `team.html` 总控页面和服务端项目存储负责。不要把 localStorage 草案误认为正式项目已保存。
- 当前规划器是确定性规则，不代表真实模型已调用；缺少 A 证据、真实 V2 或独立复核时，不能标记真实业务闭环通过。

### C｜总控、集成、版本与验收

1. 创建/选择真实项目，登记目标、截止、成员、材料与版本。
2. 冻结当前输入版本和判据；确认 A 的 diagnosis 与来源/locator。
3. 通过 `handoff-check → generate-b → proposal → apply` 组织 B。
4. 保护已完成、进行中、待验收、锁定任务；冲突时拒绝覆盖并说明原因。
5. 监督真人提交 V2、A 独立复核；检查 reviewer、artifact version、diagnosis version、plan version 一致。
6. 只对 fail/unknown/remaining 触发 B 局部重排；保存 before/after、reason、project history 和运行 trace。

## 2. 全链路状态图

```text
真实材料 V1 + 目标/官方标准
  → C 冻结项目与材料版本
  → A 读取原文并提交 grounded gaps
  → C 校验来源/locator/版本
  → B 生成具体 micro-step proposal
  → C/用户核对并采用
  → 真人按卡执行，保存尝试、产物与实际耗时
  → 上传真实 V2（artifact version + evidence）
  → WAITING_REVIEW / pending_review
  → A/非执行者独立逐项复核
  → PASS：保留成果并进入下一阶段
  → FAIL/UNKNOWN：B 只重排 remaining issues
  → C 保存新旧版本、差异、失败记录和恢复点
```

## 3. 验收矩阵（不把工程通过冒充真人通过）

| 关口 | 工程验收 | 真实业务验收 |
|---|---|---|
| A → B | schema、source_refs、locator、版本校验 | 真实材料随机抽查 3 个 gap |
| B 规划 | 无 micro_steps 阻塞；依赖/容量/版本检查 | 陌生执行者仅凭行动卡 5 分钟内开始 |
| 真人执行 | 开始/尝试/反馈/提交状态正确 | 真实文件 V1→V2、实际耗时与操作证据 |
| A 复核 | reviewer 独立、版本匹配、逐项结果 | 非执行者读取 V2，逐项 PASS/FAIL/UNKNOWN |
| B 重排 | 只重排剩余项，保护受保护任务 | 失败项修改后重新提交 V3 并复核 |
| C 归档 | SQLite/history/trace 可恢复 | 另一人能复现完整证据链 |

状态标签必须分开：`ENGINEERING_PASS`、`SIMULATED_PASS`、`LIVE_MODEL_PASS`、`REAL_ARTIFACT_PASS`、`HUMAN_LOOP_PASS`。没有实测就写 `NOT_RUN`；任何按钮点击、演示夹具、规则输出或测试通过都不能替代真实 V2 和独立复核。

## 4. 本轮发现的边界与处理

- 仓库 main 已有 B 与总控接线；因此本轮不是重写 B，而是把真实入口、调用顺序、状态边界和评注对齐，防止旧文档误称“未接线”。
- `B-HANDOFF.md` 中“未修改队长分支或完成端到端接线”已过时：当前 main 的 `team_handoff.py` 和 server route 已调用 B；但真人 V2 与独立内容复核仍待实测。
- 原始视频文件没有随本轮消息附上。视频参考链接可访问，但完整字幕/逐帧时间戳未核验；本文只按仓库实际页面标注点击顺序，不虚构视频时间点。
- 当前远程工作区发现 C 盘空间不足，Git fetch/repack 因磁盘空间失败；本轮没有覆盖原工作区未提交修改，也没有宣称已在该机跑通全套测试。应先释放经用户确认可清理的空间，再执行完整回归。

## 5. 可直接跳转的源码

- [总控交互页面](../learning-agent/team.html)
- [总控前端逻辑](../learning-agent/team.js)
- [A/B 接线前端](../learning-agent/team-handoff.js)
- [B 规划器](../learning-agent/action_planner.py)
- [B 总控适配](../learning-agent/team_handoff.py)
- [B 规划器独立页面](../learning-agent/planner.html)
- [B 规划器独立说明](../learning-agent/B-HANDOFF.md)
- [总控服务端路由](../learning-agent/learning_agent_server.py)
- [B 总控联调测试](../learning-agent/test_handoff.py)
- [B 规划器测试](../learning-agent/test_action_planner.py)
- [视频式十步工作流](../learning-agent/WORKFLOW.md)
