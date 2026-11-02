# 真实作品闭环联调：测试记录与八个样本验收矩阵

日期：2026-10-26  
基线分支：`captain/real-artifact-gap-review-20261024`  
闭环方案：`docs/agent-closed-loop-optimization-and-three-artifact-integration-2026-10-26.md`  
总调度依据：`docs/team-total-dispatch-and-provincial-first-prize-acceptance-2026-10-25.md`  
作品元数据：`docs/all-works-manifest-20261023.json`  
提取检查记录：`docs/all-works-corpus-test-20261023.json`

## 1. 当前能证明什么，不能证明什么

- 仓库作品清单登记了 32 个材料条目；清单字段中 `model_verified=false`、`target_achieved=false`，不能据此声称模型已完成语义核验或作品已达成目标。
- 语料检查记录为 126 项通过，但文件明确标记 `not_model_or_human_result=true`，各条记录的状态也将语义核验标为未验证。这些结果只能支持提取/定位门的部分检查，不能代替 A 的内容复核。
- `work-012` 的滴水润疆 PPT 是 `image_only_needs_visual_review`；`work-013` 的菌润乡土 DOC 是 `not_parsed`；其他若干 PPT/图片需要视觉复核。此类输入不得直接生成“已核验”的语义结论。
- 当前工作副本中，闭环相关四组测试（`test_team`、`test_action_planner`、`test_captain_review_gates`、`test_team_recovery`）共 29 项通过。
- 全量 Python 测试初次运行发现 Windows 默认 GBK 读取 UTF-8 前端文件的测试环境错误。已将 `test_recovery.py` 中读取 `team.html` 和 `team-recovery.js` 的调用显式改为 UTF-8；定向回归测试通过。加入新增作品清单/状态保护测试后，全量 244 项测试通过。该结果是在拉取该分支后的独立本地副本中测得；合入分支后仍应由 CI 再跑一次。
- **尚未通过的门：** 原始作品逐页/逐段语义诊断、真实模型验证、真人执行形成的 V2、A 独立复核、第三人可执行性测试。没有原始文件/版本/定位时标 `blocked` 或 `unknown`，不能用元数据替代原件。

## 2. 八个样本：真实材料映射与闭环验收

| 样本（总调度名称） | 清单材料 ID | 该样本本轮重点 | 必须交付的证据 | 当前状态 |
|---|---|---|---|---|
| 嘉农芯生 | work-001、work-002 | 目标与真实需求是否明确；每条 gap 能否定位原件；改进动作是否来自材料 | V1 版本/哈希、目标标准、gap + locator、来源定位、至少一条真人执行 V2、A 复核 | `blocked_pending_original_runtime_review` |
| 滴水润疆 | work-011、work-012 | PDF 可提取文本与图片型 PPT 分开验收；视觉材料不能假装已解析 | PDF 定位证据、PPT 逐页视觉复核、unknown 清单、微行动卡、V2 与复核 | `blocked_visual_review` |
| 菌润乡土 | work-013、work-014 | 旧 DOC 尚未解析；PPT 的文字提取不等于视觉/语义核验 | DOC 转换或人工可读版本、PPT 逐页核对、证据 gap、V2 与复核 | `blocked_unparsed_source` |
| 文玩玉米 | work-005、work-006 | 由 A 已确认的 gap 驱动 B 行动卡；第三人是否无需口头解释即可执行 | gap_id、具体操作、产物、检查方式、依赖、耗时/卡点、V2 diff、A 复核 | `blocked_until_A_gap` |
| 本草云联 | work-008、work-009 | 方案从真实材料推导；验收目标可被客观检查 | 原文定位、行动卡、真实产物、验收记录、失败记录、V2 与复核 | `blocked_until_A_gap` |
| 湘匠织秀 / 湘秀未来 | work-010 | 以原件中的具体问题形成行动卡，不可只给“优化 PPT” | 真实 gap、定位、绑定 gap_id 的动作、真人产物、前后差异、A 复核 | `blocked_until_A_gap` |
| 数智助老 | work-003、work-004 | 服务链路与效果主张；所有效率/响应效果必须有真实基线和样本口径 | claim-evidence 表、基线/分母/样本、履约证据、V2、独立复核 | `blocked_missing_effect_baseline` |
| 无界智泊 | work-007 | 预约、状态转换、离场/结算异常及版本保护能否复现 | 有版本号的状态转换用例、操作/预期状态、日志、异常分支、V2、复核 | `blocked_pending_runtime_test` |

以上状态表示“当前证据尚不足以放行下一阶段”，不是对作品最终质量的负面判定。原件补齐后，应按测试矩阵重新运行并更新状态。

## 3. 每个样本必须执行的共同闭环

1. **冻结 V1：** 记录文件名、材料 ID、版本、SHA-256、代码 commit 和目标标准。
2. **A 诊断：** 每条 gap 包含 `gap_id`、原文定位、当前证据、目标结果、来源、验证状态、unknown 与验收标准。没有定位的 gap 不得标 `verified`。
3. **C 抽查证据门：** 确认 locator 指向真实文件/页/段/代码位置；来源内容确实支持 gap；无法确认则退回 A。
4. **B 生成行动卡：** 每步绑定 gap、输入版本、操作、理由、预期变化、输出产物、自检、失败后的下一步、依赖与估时依据。缺少动作时保持 blocked。
5. **真人执行：** 由未编写行动卡的人尝试执行，记录实际耗时、求助次数、卡点、输出文件和版本。
6. **提交 V2：** 保留 V1，不覆盖原件；记录 V2 SHA-256 与 diff，状态转为 `pending_review`。
7. **A 独立复核：** 对照冻结标准逐项 `pass / fail / unknown`，每项附证据位置与原因；未通过不能关闭 gap。
8. **B 重排剩余项：** 只处理 fail/unknown/blocked 项；completed、in_progress、pending_review 和已锁定证据不得被重置。
9. **C 回归与归档：** 保存输入/输出版本、run_id、命令、结果、错误与脱敏日志；区分 `ENGINEERING_PASS`、`REAL_ARTIFACT_PASS`、`LIVE_MODEL_PASS`、`HUMAN_LOOP_PASS`。

## 4. 工程回归用例

| Case | 操作 | 必须满足的结果 |
|---|---|---|
| RT-01 | verified gap 缺原文 locator 或原件版本 | 拒绝 verified / 阻断生产动作，不得补编定位 |
| RT-02 | 原件为 image-only 或未解析 DOC | 保留视觉复核/未解析状态，不能直接进入语义通过 |
| RT-03 | gap 有来源但来源内容不支持判断 | 退回 A 或标 unknown |
| RT-04 | B 缺 grounded micro_steps | 生产任务 blocked，不能排入可执行时间块 |
| RT-05 | V1 更新后提交旧版本行动卡 | 拒绝旧版本或要求重新诊断 |
| RT-06 | 同一 expected_version 并发提交 | 仅一个写入成功；另一方收到 Conflict |
| RT-07 | V2 已提交但 A 未复核 | 保持 pending_review，不能自动 completed |
| RT-08 | A 的复核回执对应旧计划版本 | 不接受旧回执，要求当前版本复核 |
| RT-09 | 新紧急任务触发重排 | completed/in_progress/pending_review 与锁定时段不变 |
| RT-10 | 模型配置无效或请求失败 | 明确失败；不得返回 LIVE 成功或静默伪造模型输出 |
| RT-11 | 重启后恢复项目 | project_id、版本、证据、状态、复核回执仍可追溯 |
| RT-12 | 三人交接 | A gap → B 行动卡 → 第三人执行 → A 复核 → B 重排 → C 归档，逐步有产物 |
| RT-13 | 八个样本分别输入 | 业务 gap、首步、产物和验收标准由真实材料决定；只替换项目名判失败 |
| RT-14 | 反查最终 V2 | 能从 V2 反查 V1、gap、来源、行动卡、执行者和复核回执 |

## 5. 本次改动与验收状态

- 修复 `test_recovery.py` 的 Windows 编码依赖：读取 UTF-8 HTML/JS 时显式指定 `encoding='utf-8'`。
- 新增 `test_real_artifact_closed_loop.py`：检查八个总调度样本均映射到真实作品清单；清单没有虚报模型/目标通过；126 项语料提取检查不会被误解为语义/人工通过；图片型与未解析材料保持阻断。
- 定向编码回归：通过。
- 新增作品闭环清单测试：5 项通过；与编码回归合计 6 项通过。
- 修复后全量 Python 测试：244 项通过。
- 以上测试只验证工程回归和作品清单/状态保护；不代表八个原始作品已经完成真人闭环。
