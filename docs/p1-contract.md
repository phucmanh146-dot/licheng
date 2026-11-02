# P1 三人交接约定 v0.1

**2026-10-13适配器增补：**本文前10节保留早期v0.1接口与历史边界；当前优化分支通过`--with-team-ai`显式绑定真实模型适配器，使用实际上传字节与引文核对。当前你与A的交接要求见[新版任务表](team-goal-tasks-2026-10-13.md)，下方历史“尚未接入”不能直接用作当前进度。

**v5交付要求（2026-10-12）：**实现与证据验收见[三人任务v5](first-prize-delivery-v5.md)及[论证协议](../evidence/first-prize-v5/protocol.md)。本文仍描述当前v0.1运行接口；v5新增的材料SHA、事实核对与实际调用证据不是已生效的API必填字段，详见第10节。

这是依据协作手册整理的交接约定。队长已实现总控接收、版本保存与成果验收，见 [队长交付与 API](captain-delivery.md)。B 的实际规则规划已接线，A 的生成/复核模块仍待交付；原学习路线未自动迁移到新格式。

## 1. 共用上下文

| 字段 | 含义 |
| --- | --- |
| `schema_version` | 数据格式版本；本草案为 `0.1` |
| `mode` | `demo` 或 `live`；标记生成方式，不能仅靠此字段声称真实调用通过 |
| `project_id` | 项目唯一标识 |
| `member_id` | 成员标识，不以邮箱当作公共标识 |
| `artifact_id` / `artifact_version` | 材料与版本 |
| `deadline` / `timezone` | 带时区的截止日期；按用户所在地确认 |

## 2. A 交给 B：Diagnosis

包含 `diagnosis_version`、`requirements`、`sources`、`artifact_status`、`member_profiles`、`gaps`、`resource_candidates`、`unknowns`。

每个 gap 至少有 `gap_id`、`current_evidence`、`target_result`、`gap_type`、`related_member_ids`、`required_capabilities`、`source_refs`、`priority_reason` 和 `verification_status`。实际调用 B 还要求非空 `acceptance_criteria` 文字列表、有效来源和负责人、1–100 条实际 gap；空报告模板不能生成计划。成员可提供 `verified_capabilities` 文字列表；缺少已验证能力不会跳过所需学习。

来源区分官方要求、用户材料、参考案例和 Agent 建议。未知不能被空字符串悄悄覆盖；缺少来源的结论写明待核验。

## 3. B 交给队长：Plan

包含 `plan_version`、`based_on_diagnosis_version`、`tasks`、`learning_paths`、`time_blocks`、`dependencies`、`unscheduled` 和 `assumptions`。

每个 task 至少有 `task_id`、`gap_ids`、`owner_ids`、`steps`、`deliverable`、`acceptance_criteria`、`estimate_minutes_range`、`depends_on`、`deadline`、`source_refs` 和 `status`。

状态为 `candidate → scheduled → in_progress → pending_review → completed`；`blocked` 表示卡住。验收失败返回修改意见并回到进行中或卡住，不直接写成 completed。队长需要映射现有代码的旧字段与状态，迁移时保留已有进度。

## 4. 队长反馈给 A/B：Feedback

包含 `task_id`、新产物版本、`actual_minutes`、`blocker`、`unexpected_event`、`availability_change` 和 `expected_plan_version`。

A 复核新证据与相关差距；B 重算受影响安排，返回前后差异和原因。队长展示、由用户选择采用后保存。版本冲突应要求刷新；完成任务与锁定安排不得被重排覆盖。

## 5. 第一轮只需验证这个例子

以下是**人工构造的 Demo 片段，不是已实现接口响应，也不是正式比赛要求**。

```json
{
  "mode": "demo",
  "project_id": "example-project",
  "diagnosis_version": 1,
  "gap": {
    "gap_id": "gap-1",
    "current_evidence": "本示例输入里没有操作说明",
    "target_result": "首次使用者能按步骤跑通一次流程",
    "verification_status": "demo_fixture"
  },
  "plan": {
    "plan_version": 1,
    "based_on_diagnosis_version": 1,
    "task_id": "task-1",
    "gap_ids": ["gap-1"],
    "owner_ids": ["member-captain"],
    "first_step": "打开现有页面，记下从输入到出现结果的第一个操作",
    "deliverable": "一份操作说明和一次试用记录",
    "acceptance_criteria": ["另一位成员照说明跑通并记录卡点"],
    "estimate_minutes_range": [20, 40],
    "status": "candidate"
  }
}
```

上例为理解交接关系而缩短，省略的正式字段按前文补齐。示例估时是待校准假设，不能当作所有成员的固定能力标准。

## 6. 三方共同验收

1. A 的 gap_id 到 B 的 task 再到执行记录保持一致。
2. 修改诊断版本后，旧计划能被识别并提示更新。
3. 同一组任务，30 分钟与 90 分钟的安排不同且无冲突。
4. 前置任务未完成、来源未核实、模型失败均显示相应状态。
5. 成果验收改变差距状态，并保留所用证据版本。
6. Demo 只验证数据传递；Live 另以真实模型与搜索记录验收。

## 7. 精细指导扩展：队长接收层已支持，真实生成仍待 A/B

2026-10-11 队长分支开始校验、保存并展示以下可选字段。旧 v0.1 数据仍可使用；没有 `micro_steps` 的任务会显示“待 B 补充精细指导”。字段齐全只代表格式与引用关系合格，不代表定位、数据或建议已经核实。

### A 的材料与差距

| 字段 | 格式与约束 |
| --- | --- |
| `Diagnosis.artifact_versions` | 可选列表；每项含非空 `artifact_id`、正整数 `artifact_version`、非空 `title`；同一材料同一版本不能重复 |
| `gap.current_artifact` | 可选对象 `{artifact_id, artifact_version}`；必须在上述材料列表中登记 |
| `gap.current_locator` / `target_locator` | 可选非空文字，例如文档章节、表格行列、代码文件与函数；缺少位置时省略并在 unknowns 说明，不能虚构 |
| `gap.reason` / `applicability` / `verification_method` | 可选非空文字，分别解释差距原因、参考适用条件和核验方法 |

总控没有读取这些材料文件，因此材料列表是 A 的声明，不是自动验真。实际文件版本、页码、数据口径及引用内容由 A 核实。

### B 的细步骤

`task.micro_steps` 是可选的非空对象列表；一旦提供，每项必须包含：

| 字段 | 内容 |
| --- | --- |
| `step_id` | 本任务内唯一的非空标识 |
| `input_version` | 对象 `{artifact_id, artifact_version}`，必须引用 A 已登记的材料版本 |
| `target_locator` | 具体操作位置，非空文字 |
| `action` / `reason` | 做什么、为什么这样做，非空文字 |
| `expected_change` / `output` | 做完有什么变化、留下什么产物，非空文字 |
| `self_check` / `failure_next` | 怎样自检、卡住后怎样推进，非空文字 |
| `capability_basis` | 操作所需能力与成员现有证据；未知需写明待确认，不能假定成员已具备 |
| `source_refs` | 可选的非空来源 ID 列表，必须存在于 Diagnosis.sources；省略时页面展示任务的来源 |

`steps`、`acceptance_criteria`、依赖、DDL 等原字段继续保留。材料名加版本能定位引用对象；总控尚不能证明 B 的动作真实可执行、估时准确或参考方法适合本任务。

### 人工逐项验收

精细任务的 `POST /feedback` 在 `action=approve` 时必须附 `criterion_results`，顺序和数量与该任务 `acceptance_criteria` 一致：

```json
{
  "criterion_results": [
    {"criterion": "对应的验收条件原文", "passed": true, "evidence": "实际看到的成果位置、数字或验证记录"}
  ]
}
```

每项必须有非空证据和布尔通过状态；任一未通过就不能写成 completed，使用 reject 退回修改。记录与已提交成果版本一起保存。旧任务的旧 API 调用仍兼容；新版页面统一引导逐项核对。成员选择仍是本机记录，不是身份认证；这里不是 A 的自动成果复核。

`change_impacts`、`reference_breakdown`、`capability_evidence` 等更完整的研究输出及差距自动关闭，仍需 A/B 的实现和共同联调，本次不声称已接通。

## 8. 实际 B 规划接线与 A 复核交付

所有写入均包含 `project_id`、`expected_version`；版本冲突返回 409，失败不覆盖正式计划或成果。`POST /handoff-check` 附 Diagnosis，只检查交付条件；`POST /generate-b` 调用 B 已交付的规则生成/增量处理，返回计划预览；`POST /apply` 仍需成员确认。`--with-b-planner` 将同一函数绑定总调度，A 没有配置时仍停在待交付阶段。

`GET /handoff?id=项目ID` 导出项目/诊断/计划版本、当前 Diagnosis、待验收任务及 submission、反馈。A 需核实实际新成果，返回以下完整对象交给 `POST /review-receive` 的 `review` 字段：

| 字段 | 约束 |
| --- | --- |
| `review_id` / `task_id` / `reviewer_id` | 非空；task 须待验收，reviewer 须属于 Diagnosis 的成员；相同编号相同包幂等，不同内容拒收 |
| `plan_version` / `diagnosis_version` | 正整数，与当前有效计划/诊断一致 |
| `artifact_id` / `artifact_version` | 与该任务已提交的新成果完全一致 |
| `method` / `note` | method 为 manual/model/rules，note 非空；声明 model 不代表总控已验证模型 |
| `criterion_results` | 数量、顺序、criterion 原文对应任务条件；passed 为布尔，evidence 非空 |
| `gap_results` | gap_id 与当前任务逐项对应且不重复；status 为 closed/remaining/unknown；每项 evidence 非空，非 closed 时还需 remaining_issue |

验收条件未全部通过，不能把 gap 声明为 closed。保存复核不改变任务状态或原 Diagnosis；`content_independently_verified=false`。人工批准仍需逐条件填写证据，A 已报未通过的条件不能直接跳过；任务通过不自动关闭 gap，学习/练习完成时差距可以仍然存在。

服务端 `REVIEWER(project_snapshot, review_request)` 返回同一 review 对象，`POST /review-run` 传 `task_id` 触发。当前 A 真实函数未配置，调用会明确拒绝；没有任意客户端代码/URL绑定入口。复核期间项目版本变化时旧回调不能覆盖新状态。

## 9. 求助与具体动作关联

`POST /rescue-start` 附 `expected_plan_version`、`task_id`、`gap_id`、`action_id`、非空 `note`（最多 2500 字），以及可选 `frames`、`mediaKind`、`urls`。任务须尚需执行且计划有效；gap 须属于任务；action 使用 `micro_steps.step_id`，旧 steps 使用本计划版本内的 `step:1`、`step:2` 等标识。

使用现有求助引擎与 AI 连接；未配置返回 CONFIG_REQUIRED/409，不生成执行记录。同一动作同一计划已有求助运行时拒绝重复。保存 incident_id、run_id、关联 ID 与诊断/计划版本；`POST /rescue-sync` 只接收本项目的 incident_id，读取服务端实际执行结果，不接受客户端伪造结果。

前端图片压缩后提交；30 分钟以内录屏取起始/中间/末尾三张画面，不处理音频。媒体解码期间任务或版本变化就拒绝绑定。原始画面不写入执行日志或项目 SQLite；解答与反馈保存，但不自动修改任务、差距或计划。之后诊断/计划变化时，即使已保存的解答也标为旧版本，待成员核对。

## 10. v5更严格的交付与证据验收

v5增强的是交付质量与论证要求，当前`schema_version=0.1`保持兼容，不因文档更新自动新增字段或改变状态机。若需迁移格式，应另交迁移、旧数据兼容及集成验证。

| 环节 | v5必须交的实际证据 | 当前接口不能证明的部分 |
| --- | --- | --- |
| A诊断 | 输入材料版本/SHA256、原文定位、结论支持程度、未知、试做与实际生成记录 | 字段齐全不证明引用存在、事实正确或能力已经验证 |
| B行动 | 对应gap、材料位置、操作/理由/产物/自检/失败下一步、估时与实际试做 | 规则输出或卡片展示不证明另一人能照做；估时不等于真实耗时 |
| A复核 | 实际提交成果版本与内容、逐条件判断、所见证据、剩余问题 | 收到review不等于已读取成果，不自动完成任务或关闭gap |
| 队长集成 | 同项目实际请求/响应、状态前后、人工确认、失败恢复、对照与用户原始记录 | 标记live、接口通过、模拟案例均不代表已证明用户收益 |

材料清单、来源核对及原始调用可先作为配套证据文件，由现有ID/版本关联；未接入的字段明确标待开发。真实A/B适配接线后，再以同一输入验证内容与状态；人工参考答案不得冒充模块输出。原始记录格式见论证协议。

## 11. 当前目标和材料交接包（优化分支）

`GET /api/agent/team/handoff?id=项目ID`现在允许在诊断前导出。保留原字段，新增`project_context`、`member_task_briefs`、`brief_history`、`artifact_manifest`、`diagnosis_needs_refresh`、`plan_stale`、`response_context`和`documents`。`documents`从当前项目实际字节重新解析，包含最新诊断输入、原差距所用版本、待复核提交版本及已记录能力证据；去重后正文超过60000字拒收，不截断。

`response_context`给出本次`project_id`和`expected_version`。A按该快照返回，提交时沿用这组版本；发生冲突则重新读取并核对目标，不把旧诊断结果直接改成新版本号。此包提供实际内容和读取核对，语义判断仍需验收。仅声明的旧版项目返回空`documents`，不能据此标为已读原文。

目标/条件变化后，旧诊断需刷新、旧计划暂失效；成果及版本仍保存。实际复核对应任务、诊断、计划和提交文件版本，旧目标复核不能通过。试做/学习复核限定为任务证据，成果差距保持待验收；制作任务另需有依据的成果差距判断。
