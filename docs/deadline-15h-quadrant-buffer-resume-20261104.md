# 上岸鸭：DDL前三天15:00拍板、四象限、过渡缓冲与24小时待安排处理（2026-11-04）

## 1. 用户要的行为（规则基线）

1. **DDL前三天15:00（项目本地时区，默认Asia/Shanghai）**：系统读取全部未完成任务、剩余分钟、固定事务、现有时间块和可用容量，重新倒排。
2. **排得下**：自动生成新的时间块，只调整受影响部分；固定事务、已完成任务、休息和睡眠不被覆盖，不弹无意义确认。
3. **排不下**：15:00只发一张合并拍板卡，明确缺多少分钟、冲突在哪里、哪些任务必须保留、哪些可以本轮暂缓；询问用户是否同意暂缓哪些任务。
4. **暂缓不是删除**：保留原任务、DDL、材料和执行记录，不标记完成，不从总任务池抹掉。用户不同意暂缓时，按优先级排出最大可行计划，并如实显示仍然排不下的任务，不制造“全部已安排”的假象。
5. **四象限**：工作量（任务步骤多/预计剩余时间长）×重要性：
   - Q1：任务多且重要，第一优先；
   - Q3：任务少但重要，第二优先；
   - Q2：任务多但不重要，次日必须先占固定时间块；
   - Q4：任务少且不重要，优先作为本轮暂缓候选。
   重要性没有明确字段时标记“待确认”，不得把未知自动判成不重要。
6. **任务间过渡缓冲**：默认每次切换不同任务预留10分钟，和每日总缓冲分开计算；缓冲作为真实不可占用时间块，不再把相邻任务排成无缝连续。
7. **待安排SLA**：任何任务一旦进入“待安排”，立刻进入自动分诊队列；必须在进入状态后24小时内给出处理决定。24小时未处理则产生超时升级事件。
8. **突发中断**：保存当前task_id、action_id、微动作、材料ID/版本/SHA、计划版本、已尝试步骤、失败原因和下一动作。恢复时复用已有材料引用，不让用户重新上传或重新讲一遍；只在原断点继续。若目标/计划/材料版本变化，先提示断点过期并只重算受影响部分。

## 2. 本轮已写入的工程改动

目标分支：`feature/agent-rag-rerank-20261102`

- `learning-agent/deadline_policy.py`
  - D-3 15:00触发判断（允许24小时内的迟到扫描恢复，避免Worker短暂停机漏掉提醒）。
  - 四象限识别、Q1→Q3→Q2→Q4排序。
  - 容量缺口与暂缓候选计算；暂缓只作为本轮软延期。
  - 24小时待安排SLA判断、Q2次日固定时间块请求。
- `learning-agent/autoloop_signals.py`
  - D-3 15:00事件进入现有持久队列。
  - 事件携带四象限、过渡缓冲、24小时SLA和软暂缓策略。
  - 扫描已采用计划中的待安排任务，发现后立即发出分诊事件；24小时仍未处理时再发SLA超时事件。
  - 继续复用项目已有输入材料的ID、版本和SHA，不重复上传。
- `learning-agent/period_planner.py`
  - 先按四象限顺序安排。
  - Q2任务从次日开始安排，并在次日生成首个固定预约块（最多60分钟）。
  - 不同任务之间预留真实过渡缓冲，写入 `plan.transition_buffers`。
  - 无法安排的任务保存 `unscheduled_since` 和 `triage_due_at`，同一任务持续未安排时保留首次进入时间。
- 新增回归测试：
  - `test_deadline_policy.py`
  - `test_period_planner_transition.py`
  - `test_autoloop_signals.py`
  - GitHub Actions 工作流已加入上述模块、测试文件和触发路径。

## 3. 自动触发链路

```text
period_planner 生成计划
   ├─ 排得下 → 保存新时间块 + 过渡缓冲
   └─ 排不下 → unscheduled_since / triage_due_at
                    │
research_graph.worker 每60秒扫描
                    │
         autoloop_signals.enqueue_due_deadlines
           ├─ D-3 15:00 → deadline.approaching
           └─ 待安排任务 → task.unscheduled_triage
                    │
            platform_store 持久队列
                    │
              LangGraph Worker
                    │
     自动计算 / 一张合并拍板卡 / 暂缓候选
                    │
      用户决定后沿原任务上下文继续
```

注意：D-3提醒由现有Worker每60秒调用一次扫描器，不需要每分钟调用大模型；只有扫描到新事件才入队。重复扫描使用稳定事件ID，不重复创建同一轮任务。

## 4. 中断恢复：已有能力与剩余缺口

已核实的现有代码：
- `team_recovery.pause()` 会保存checkpoint、返回条件、原阻塞、材料版本和当前微动作。
- `team_recovery.resume()` 会恢复原task/action并保留原材料引用，不会重新上传材料，也不会把恢复误记为完成。
- `team_runtime.snapshot()` 可读取当前执行现场并生成恢复上下文包。
- `autoloop_signals.classify()` 已识别 `recovery-pause` / `recovery-resume` 事件。

仍需补齐：
- 当前恢复入口仍依赖明确的暂停/恢复信号；普通电脑应用突然关闭、网络断开、用户离开等情况尚未全部自动识别。
- `team_runtime.snapshot()` 明确是只读视图，不会自行恢复任务。
- 需要把checkpoint与Worker run/session_id建立稳定映射，并补“进程崩溃→租约过期→自动恢复同一run”的真实部署测试。
- 如果只是短暂切换任务，应该保存现场并切换到其他任务，不应把原任务标成失败或重建计划。

## 5. 与执法文书参考工程的差距

参考仓库已核对为：`sttyyy/law-enforcement-agent`，基准提交 `3b3c9030f814d5b0319e1a3548265f04bc15d16b`。
源码： https://github.com/sttyyy/law-enforcement-agent/tree/3b3c9030f814d5b0319e1a3548265f04bc15d16b

参考项目的强项是**单一专业文书流程的端到端质量闭环**：
- `backend/app/graph/builder.py`：LangGraph明确编排工单接入、要素抽取、投诉人模式、检索规划、类案召回、文书生成、规则检查、LLM风险复审和人工路由。
- `backend/app/services/retrieval.py`：dense、lexical、metadata三路召回，RRF融合，按案件类型/商品/法律依据/事实模式重排。
- `backend/app/services/embeddings.py` 与 `vector_store.py`：BGE-M3/Ollama向量和Qdrant维度检查。
- OCR：RapidOCR + ONNX；模型可离线运行。
- Redis缓存失败回源；PostgreSQL持久化工单、文书版本和审核状态。
- audit/metrics/evaluation分别记录操作、运行指标和评测结果；前端能看到节点轨迹、召回通道、风险路由和评测。

上岸鸭不应照搬“不予立案告知书”领域规则，而应吸收其工程质量：
1. **多阶段Graph与结构化状态**：上岸鸭已有A/B/诊断/计划/复核流程，但需要把每个节点的输入、输出、错误、耗时和证据统一追踪。
2. **真实多路RAG与评测**：上岸鸭已有BM25/RRF、BGE-M3/Qdrant与Cross-Encoder接入代码；仍需真实标注集和线上真实服务结果，不能只看配置状态。
3. **OCR与多模态证据**：参考项目有可运行OCR链路；上岸鸭目前的文档/OCR工具与真实扫描件评测尚未形成同等稳定的生产链路。
4. **规则检查 + 模型复审 + 人工复核分层**：上岸鸭有证据校验和独立复核结构；需要继续确保执行者不能自证、未知项不被自动判通过。
5. **持久化、审计、指标、评测**：上岸鸭已有事件/运行/材料版本/AI调用轨迹，但真实provider token/cost、端到端失败率和恢复成功率仍需真实运行数据。
6. **统一运行时**：参考项目的LangGraph负责一次专业工作流；Autoloop负责跨任务事件、等待、恢复和插件。上岸鸭要把两者组合：专业Graph完成任务，Autoloop管理任务何时启动、暂停、恢复和重新排期。

## 6. 本轮验证

在隔离验证目录 `D:\shangan-ya-autoloop-verify-20261104` 使用分支当前代码运行：

```powershell
cd D:\shangan-ya-autoloop-verify-20261104\learning-agent
python -m unittest -v test_deadline_policy test_period_planner_transition test_autoloop_signals
```

结果：**21 tests passed**。覆盖D-3 15:00、四象限、Q2次日固定预约、任务间缓冲、24小时待安排分诊、SLA超时升级、事件幂等和现有DDL提醒。

这不是完整仓库全量回归，也不是生产部署验收。当前本机原工作区存在未提交文件，本轮没有覆盖或切换它；验证使用独立克隆目录。

## 7. 下一批必须完成的生产验收

- 确认 Railway API 与 Worker 实际运行同一持久数据库，且Worker每60秒持续扫描。
- 对真实用户任务验证 D-3 15:00 只弹一次；容量充足时不问；容量不足时一张卡列出候选项。
- 用户选择“暂缓”后，原任务仍存在、DDL和证据保留；后续有空档可重新纳入。
- Q2次日固定预约真实出现在工作台日历中，而不只是保存在plan字段。
- 连续任务之间的10分钟过渡缓冲在桌面端/小程序端均可见，不能被其他任务再次占用。
- 新建待安排任务后，60秒内进入队列；24小时内必须有分诊结果；超时有升级记录。
- 模拟断网/强杀Worker，验证同一run、checkpoint、artifact版本和工具副作用幂等恢复。
- 真实V2、非执行者独立复核和证据验收仍按原标准执行；不得用本轮21个单元测试替代真实业务验收。
