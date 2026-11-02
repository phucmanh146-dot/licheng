# B 行动与排程：独立模块交付

## 启动和使用

`python learning_agent_server.py --port 8901`

打开 `http://127.0.0.1:8901/planner.html`。
可先手工录入目标、成员、来源及验收标准，或导入 A 的诊断 JSON。演示数据明确标记，不是比赛规则。
生成任务 → 编辑任务定义 → 勾选本轮要做的任务 → 为每名成员添加空档、临时占用或整天排满 → 预览排程 → 导出交接包。

页面显示已验收任务数 / 总任务数、待验收数量、日程、容量不足、变更理由及条件性截止倒推。它不是作品评分或获奖概率。

## 可独立使用的能力

- B1：没有来源、负责人、产物或验收条件的缺口停在待补充区。有效任务可反查 gap/source。
- B2：已验证能力跳过学习，其余走必要学习 → 小练习 → 当前作品；挂接 A 给出的同能力资料。没有资料时不会假装已检索。
- B3：估时范围和假设可编辑，依赖循环拒绝；记录累计实际用时和剩余估计，后续按剩余时间排程。剩余为零进入待验收，不是已完成。
- B4：按截止、个人容量和缓冲给出风险与调整选项；新增从截止反向分配容量的里程碑预测。预测假设可拆分且前置及时验收，独立于真正可执行日程。
- B5：用户勾选后才安排；支持多人共同任务取共同空档，分别占用每个人容量；支持拆分与连续块。
- B6：临时占用、满日、降低每日上限（如疲劳）、用时超出后重新预览；尽量保留不受影响时段。保留完成、待验收、历史与锁定安排；保护安排与新占用冲突时拒绝并解释。
- 草案操作：可编辑标题、负责人、步骤、产物、验收、估时、截止和依赖。修改任务会使其及下游原安排失效；受保护下游不允许直接覆盖。
- 草案恢复：当前浏览器 localStorage 自动保存，刷新可恢复；本次打开页面内可撤销最近 10 次草案修改；导入导出完整诊断+计划+时间设置包。

浏览器草案不代表队长正式采纳；请导出备份。正式项目数据库、跨设备并发、采用/撤销及验收权仍属于队长，B 不写队长的正式执行状态。

## 后端接口

POST `/api/agent/planner/` 下：

| 路径 | 请求 |
|---|---|
| `generate` | `{diagnosis, context:{deadline}}` |
| `validate` | `{diagnosis, plan}` |
| `edit` | `{diagnosis, plan, task_id, patch, expected_plan_version}` |
| `feedback` | `{diagnosis, plan, task_id, actual_minutes, remaining_minutes, expected_plan_version}` |
| `replan` | `{diagnosis, plan, settings, expected_plan_version}` |

`settings.members` 按 member_id 对应 `{windows, busy, full_dates, daily_limit, buffer_minutes}`。顶层为 `period_start,period_end,selected_task_ids,chunk_minutes,allow_split`，可附 `remaining_minutes`。
时区目前为 Asia/Shanghai；跨午夜空档拆为两天。共同任务是同时参与，不是自动分摊工作。

保留前版单成员 settings 兼容。Python `action_planner.generate(diagnosis, context)` 可接队长 PLANNER；未修改队长分支或完成端到端接线。

## A 交接字段

沿用 docs/p1-contract.md。gap.acceptance_criteria 必填；steps、estimate_minutes_range、estimate_basis、depends_on_gap_ids 可选。member_profiles[].verified_capabilities 是已验证能力名称列表，不能把自述直接充当验证。
缺少这些内容会显示限制，不补造比赛要求。诊断版本变化时旧计划拒绝继续提交。

## 验证与剩余边界

`python -m unittest test_action_planner test_b_independent test_planner_http test_agent`：58 项通过（含旧模块 27 项）。
`node --check planner.js`：通过。
真实 HTTP 验证了生成、编辑、用时反馈、无效导入拒绝及页面资源访问。

浏览器自动化脚本为 test_planner_ui.cjs：刷新恢复、编辑、撤销、导入导出、联合排程、待验收与移动宽度。2026-10-10 已在 Chromium 145 无头浏览器中通过真实页面与本地后端验收（1360×1000 桌面、390×844 移动视口）。通过共同排程、刷新恢复、编辑失效、撤销、交接包导入导出、容量不足、临时占用重排、无效导入保护、待验收反馈、新诊断清空旧进度；无页面 JavaScript 异常、移动页无横向溢出。截图经人工检查中文可读。测试中修复新诊断残留旧进度，以及用时更新后仍展示旧倒推结果的问题。验收仅针对 B 独立模块，不代表 A/队长或真实模型联调通过。

当前是规则规划模块，不是已完成真实模型调用。学习路线骨架和默认估时仍是可编辑假设；高质量的领域步骤取决于 A 的具体诊断、资料和后续模型接入。尚待 A/队长真实包契约联调、正式状态保存接线和真实用户验收。不能把本交付说成整个 Agent 已全部完成。

`b_capacity.py` 复用队长现有计算器、独立命名；`b_joint_schedule.py` 为新增共同排程与条件性倒推。联调后应与公共层收敛，避免两份日历逻辑长期分叉。

## 2026-10-10：按 B1—B6 补齐独立功能

- **产物细分**：任务卡点击“细分制作、修改与检查”，拆成准备、制作、修改、检查四张有产物和验收要求的卡片，保留 gap/source。总估时守恒，阶段比例明确为可编辑假设。学习仍独立成任务；等待时间不占工作容量，需前置 completed_at 计算最早开始。
- **技能路线**：将 A 资料的 title/url、section/locator、exercise 用到具体学习和练习步骤；展示候选资料的 estimated_learning_minutes 与 conditions。无资料或无估时仍标待确认，不能伪造专家路线。
- **历史校准**：同负责人、同 kind 至少 3 条已验收且有 actual_minutes 的记录，按实际/原估时中值校准；系数限定 0.5–3，记录样本 ID，不重复累乘，不改已完成任务。
- **具体备选**：对用户指定的暂缓任务、给定延期天数、已有验证能力与空档的接手候选重新排程，返回每个方案的日程和剩余缺口。可放入草案预览；不擅自删除必交项、延长官方截止或宣称接手人已确认。
- **课表与锁定**：每周重复空闲/固定占用在周期内展开并合并；任务锁定同时锁定各负责人的所有时段，支持解锁。变更处展开显示前后时段。
- **增量更新**：诊断版本递增才允许更新；未变缺口保留本地细分、执行进度和安排；更新受影响项及下游。若影响已完成、执行中、待验收或锁定任务，返回明确冲突并完整保留旧计划，交队长决定。

新增接口：`split`、`lock`、`calibrate`、`reconcile`、`alternatives`，统一接收 diagnosis、plan、expected_plan_version。reconcile 另收 new_diagnosis/context；alternatives 收 settings/optional_ids/extension_days。

验证：68 项后端/HTTP 测试通过；既有浏览器流程与 test_refinements_ui.cjs 均通过。新增浏览器验收包含锁定/解锁、每周安排、条件性备选、样本不足保护、阶段拆分、增量保留、移动宽度与无 JS 异常。

**交接边界仍然有效**：A 的真实资料质量、领域路线合理性、队长的正式状态保存/成果验收、真实模型调用和三方联合验收不能用本模块测试替代。本模块可独立用手工/JSON 输入完成上述流程。
