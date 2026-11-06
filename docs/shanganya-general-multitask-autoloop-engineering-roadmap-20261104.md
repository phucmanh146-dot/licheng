# 上岸鸭通用多任务 Autoloop Agent：产品边界、工程对标与升级路线
日期：2026-11-04
基线分支：feature/agent-rag-rerank-20261102
目的：把 Agent-Autoloop 的事件驱动、自动跟进、异常才打扰人原理应用到上岸鸭通用个人任务 Agent；同时以此前上传的执法文书智能生成审核系统作为工程对标。论文/交材料仅是任务示例，不是产品边界。

## 1. 产品定义（纠正范围）
上岸鸭不是论文 Agent、文书 Agent 或单一资料处理 Agent。它是通用个人多任务总控与执行系统：同一用户可以同时有学习、课程、比赛、项目开发、运营、求职、资料研究、文件处理、生活事务等多条任务线。任务类型只是插件/Skill/Workflow 的输入，不是产品边界。

首个有效信号触发后，系统自己读取已授权上下文、判断任务归属、拆解、派工、并行处理可独立子任务、协调依赖、执行、复核、重试、恢复和汇总。用户不必逐条查看中间结果或逐步指挥；只有需要本人拍板、高风险授权、无法消除的关键歧义、真实人类行动或真实成果证据时才打断用户。

“用户不用看结果”不是“系统不验收”：Agent 必须先做自动质检、独立复核、来源核验和完整性检查；最终只交付一份短摘要与例外项。不能自动证明的真人成果必须明确标为待证据/待人工确认，不可假装通过。

## 2. Agent-Autoloop 文章原理：学运行机制，不复制业务模板
依据用户指定文章（微信原文的 AIHOT 镜像翻译与代码分析）及官方仓库 README：
- Event → Kernel Rules → Agent dispatch → One bounded round → Receipt → auto-close / schedule later / ask card → resume original session。
- 同一主题短时间到达的事件合并，防止多个 Agent 同时处理同一目标造成冲突。
- 一轮执行完成即退出；等待人工决定时保存状态、进程退出，不轮询模型、不耗 Token；用户回复后恢复原会话。
- 四个内核机制：Zero-cost suspension、Append-only event sourcing、Instruction/data separation、8-hop circuit breaker。
- 四类插件边界：Event source、Agent adapter、Notification channel、Delivery pipeline。
- Agent 输出 ask / notice / resolve / later / events 等结构化回执；错误回执只修复回执，不重做已完成业务动作。
- 插件/外部事件正文视为不可信数据；规则、工具权限、Agent 选择、工作目录、授权由系统可信配置决定。
注意：官方 README 表示本地程序支持 macOS/Linux；部分 Webhook 示例只经本地 mock 验证。上岸鸭借鉴协议和机制，不把作者性能数字或全部场景当成上岸鸭已达到的指标。

## 3. 上岸鸭目标运行结构：一个总控，多个可插拔能力

### 3.1 控制面（确定性，不由 LLM 自己管理）
1. Event Gateway：收集用户消息、上传文件、任务状态、DDL、计划变化、外部应用事件、定时复查、工具/CI 结果。
2. Event Normalizer：统一 event_id、source、tenant/user_id、project_id、task_id、artifact_id/version、occurred_at、correlation_id。
3. Event Coalescer：同一任务/同一资料版本/同一故障窗口合并事件；保留原始事件，不丢来源。
4. Policy Router：按任务类别、风险、权限、依赖、截止时间、成本、并发和用户注意力预算选工作流/Agent/Skill。
5. Durable Queue + Worker：异步派发、租约、心跳、超时、有限重试、退避、死信队列、并发上限。
6. State Machine + Event Ledger：所有状态变更追加事实日志；从日志投影当前状态；事务写入、幂等、可回放。
7. Checkpoint / Resume：保存 run/session、上下文快照、材料版本、已完成步骤、工具结果、待办、下一动作；恢复时只补做未完成步骤。
8. Approval Gate：仅对审批策略命中的动作生成一张合并拍板卡；不依赖该决定的其他任务继续运行。
9. Scheduler：只唤醒到期/新事件相关任务；无变化的轻量检查不得调用 LLM。
10. Digest & Exception Center：日常只给简洁结果、失败例外、风险和拍板事项，不推送每个中间过程。

### 3.2 能力面（可替换插件）
- Task skills：学习/复习、课程实操、竞赛交付、项目开发、运营、求职、研究、文件整理、会议、个人事务等。
- Tools/MCP：浏览器、文件、GitHub、飞书、Obsidian、邮件、日历、代码测试、文档解析等；每个工具声明权限、输入输出 schema、是否可逆、成本和证据类型。
- Specialist workers：仅按需要启动研究、编码、文件解析、计划、验证等角色；不是固定常驻十几个 LLM。
- Delivery adapters：保存文件、更新任务、创建 PR、发送通知、部署等分别配置权限与审批级别。

### 3.3 多任务调度与并行规则
- 一个用户可有多个 Project / Workstream；任务必须归属一个项目或个人收件箱。
- Planner 先构建 Task DAG：依赖边、阻塞边、可并行边、截止时间、固定时间、资源需求、交付物、验收标准。
- 可并行：彼此无数据依赖、无共享写入、输入版本冻结的调研/资料提取/独立测试；使用 fan-out/fan-in。
- 必须串行：同一文件/代码分支的写入、依赖前置结果的任务、同一数据库迁移、最终发布/提交。
- 多 Agent 修改同一产物时，指定唯一 writer；其他 Agent 返回 patch/proposal/评审意见，由 writer 合并。
- 任务优先级综合硬截止、依赖链关键路径、风险、预计工作量、历史耗时、用户固定事务和精力容量；不可简单按“最新消息”抢占。
- 临时任务进入统一 inbox；先判断是否紧急、是否有硬截止、是否打断当前任务。若打断，保存原 checkpoint 并计算影响；不得无限把新任务插入下午时间表。
- DDL 前 72h 强制安排与风险检查；48h/24h/3h 按风险升级；固定事务、睡眠和休息缓冲优先保护。
- 用户注意力预算：普通状态变更静默写入；仅异常、审批和每日/阶段摘要打扰。拍板卡片按项目合并，不同项目互不阻塞。

## 4. 拍板规则：自动执行默认，审批是窄闸门
默认自动做（在已授权、可逆、低风险范围内）：读取/归档、检索、摘要、资料解析、计划草案、内部排期建议、任务拆解、去重、差异检查、代码只读分析、测试、草稿、内部修复、证据整理、质量复核、失败重试、恢复和状态汇总。

AI 对截止日期、优先级、用户完成状态等关键用户事实只能提出建议；涉及原任务字段的变更按用户既有确认规则执行。系统可自动更新自己生成的运行状态、工作流阶段和验证结果，但不能把“用户任务已完成”仅凭口头/点击标记为通过。

必须本人拍板：删除/覆盖原始资料或不可逆数据变更；付费/购买/新增资源费用；对外发送/发布/代表用户承诺；生产部署、合并 PR、权限/密钥变更；法律/学术诚信等边界决策；硬截止与固定事务冲突且无法自动化解；关键事实存在多种合理解释；用户明确保留决定权的事项。

一个任务 WAIT_APPROVAL 时，只冻结依赖该决定的动作；其他独立任务继续。等待时 Agent worker 退出，不发模型轮询；轻量调度器只监听用户回复/外部事件/复查时间。用户答复后恢复原 run/session 或完整 checkpoint。

## 5. 对照上传的执法文书系统：不要只比技术名词
用户上传材料中提及的对标技术链：LangGraph 工作流、Ollama/Qwen、Qdrant、关键词/元数据/向量混合检索、RRF/RapidFuzz、OCR、FastAPI、PostgreSQL、Redis、Vue/Element Plus、Docker Compose；流程为 OCR/材料抽取 → 检索 → 文书生成/规则/语义审核 → 人工复核/归档。该对标是单一专业业务流程系统。上岸鸭要在保留严谨证据能力的同时，向通用、多项目、长期运行、多任务协同升级；不是仅仅换模型或增加 OCR。

## 6. 上岸鸭当前仓库代码核验（feature/agent-rag-rerank-20261102）
以下是读取到的真实代码事实；代码存在不代表依赖已在生产安装、服务已配置或端到端运行成功。
- learning-agent/team_dispatch.py（blob 7f3d577）：当前 A 诊断→B 计划→生成 proposal，最后 stage='confirm' 等用户采用；与首信号后自动推进存在直接冲突。真实 providers 为空时会明确拒绝运行；这是正确 fail-closed，但需要自动接线和健康状态。
- learning-agent/team_sessions.py（blob af3ac02）：恢复项目匹配仍 needs_confirmation=True，confirm 后 auto_execute=False；恢复找回不等于自动恢复执行。
- learning-agent/team_runtime.py（blob 5b9e09b）：snapshot() 明确 read-only、auto_execute=False，只显示持久状态，不会自动唤醒或恢复。
- learning-agent/team_recovery.py（blob 8e77eb1）：已有带版本与指纹的暂停现场、返回条件、尝试记录和恢复；但用户触发式 resume 与事件自动唤醒尚未合并为完整 Autoloop。
- learning-agent/agent_schedule.py（blob 1b70977）：确定性依赖排期已有；当前核心输入主要是日期、每日分钟、不可用日期、容量和依赖。还需接入时段级固定事务、精力曲线、历史实际耗时、任务切片、关键路径与临时任务冲突重排。
- learning-agent/artifact_retrieval.py（blob 68f60d2）：已有 lexical/BM25 风格召回 + metadata + dense + RRF(k=60) + Cross-Encoder rerank；若 dense/reranker 服务不可用会回退并显式记录状态。不是从零开始做 RAG。
- learning-agent/semantic_retrieval.py：已有 Ollama embedding（默认模型 bge-m3）+ Qdrant，按 project_id、artifact_version、SHA256 等约束；未配置时返回 NOT_CONFIGURED。
- learning-agent/artifact_store.py（blob d13448d）：已有不可变材料版本、SHA256、DOCX/PPTX/TXT/MD/CSV/JSON/文本 PDF 解析、locator、图像 OCR 入口；当前文件大小上限 2MB，音频/视频没有统一入库流水线，复杂版式/扫描 PDF 有限制。
- learning-agent/team_ai.py（blob c350925）：已有结构化 JSON 约束、原文 quote catalog、locator 校验、unknown 保留、反占位动作校验和学术诚信边界；但这些 validator 不是完整语义质量保证。
- learning-agent/learning_agent.py：当前 SQLite 持久化、ThreadPoolExecutor(max_workers=3)、BoundedSemaphore(3)、工具/运行记录等本地服务底座。

## 7. 真正超过对标系统的工程升级（优先级）
### P0：从“可运行流程”升级成“多任务持续运行系统”
1. Durable Event Kernel：append-only event ledger、事务投影、稳定 event_id/idempotency_key、重放/审计、崩溃恢复。
2. Queue/Worker Runtime：持久队列、租约/心跳、超时、指数退避、有限重试、dead-letter、并发/每用户公平配额；不依赖单进程内存 executor 保证跨重启续跑。
3. Auto Dispatcher：首信号自动 A→B→安全计划采用→执行/复核；不再默认停在 proposal confirmation；用户关键字段仍遵守确认闸门。
4. Resume Engine：用户跨天/跨对话回来，不让其重复描述；恢复原任务版本、已完成步骤、工具回执和下一动作。
5. Exception-only UX：默认静默推进；按项目合并拍板卡；其余给最终摘要；无模型轮询。
6. Task DAG Scheduler：多项目全局容量、硬截止倒排、固定事务、精力/耗时学习、临时任务重排和关键路径。

### P1：从“能检索”升级成“能可靠理解多源工作”
7. Multimodal ingestion plugins：PDF/扫描件/图片/DOCX/PPTX/XLSX/网页/音频/视频统一成 Artifact + version + locator + provenance；按文件 SHA256 去重，解析缓存、增量更新和失败重试。
8. Advanced RAG evaluation：保留现有 BM25+metadata+dense+RRF+reranker；建立按任务类型分层的测试集，测 Recall@k、MRR/nDCG、引用正确率、答案支持率、未知项召回、延迟和成本；评测后才调整 chunking、embedding、reranker 或 GraphRAG。
9. Cross-project memory with strict isolation：用户偏好/固定事务/任务历史/项目记忆分层；Context Builder 只加载本任务相关上下文，跨项目只共享获准的个人偏好，不共享私人材料；旧记忆必须有来源和有效期。
10. Independent verifier：规划 Agent 不得自我宣布通过；独立检查器按 schema、证据、版本、工具副作用、交付物和验收标准复核；低置信度/无证据返回 UNKNOWN。
11. Knowledge/Task Graph：实体、材料、任务、DDL、依赖、决策、证据之间建图，支持“这份资料影响哪些任务”“一个任务延期会影响哪些链路”；先做关系型表与图投影，不盲目引入图数据库。

### P2：从“单机原型”升级成“生产级平台”
12. Tenant/auth/ACL：每用户独立任务、文件、向量、缓存、会话；所有 API、Qdrant filter、blob key、日志强制 tenant/project ACL。
13. Tool sandbox & policy：工具按 read/write/delete/external-send/deploy 分级；文件路径沙箱、网络 allowlist、命令参数数组、秘密管理、外部内容 prompt-injection 隔离。
14. Observability & cost governance：OpenTelemetry trace、每任务 token/费用/延迟/重试/失败率、预算和速率限制；无变化轮询不调模型；支持每项目成本上限和优先级。
15. Eval Harness + chaos testing：固定 golden tasks、端到端 replay、断网/重复事件/进程强杀/乱序回调/并发写入测试；PR CI 自动回归，失败不准发布。
16. Human attention metrics：用户被打断次数、重复提问率、需要拍板比率、自动解决率、任务准时率、返工率、证据覆盖率、错误自动执行率。
17. Plugin contracts & hot swap：Event/Agent/Tool/Channel/Delivery 插件接口统一 JSON Schema + capability manifest + contract tests；插件故障隔离，不污染内核。
18. Rollback & canary：数据库迁移、规则版本、模型/embedding版本、工作流版本都可回滚；灰度项目先跑，生产确认后扩展。

## 8. 多 Agent 的正确用法
Orchestrator 是总控，先按 task DAG 和能力目录决定单 Agent、工具工作流、并行 subagents 或串行接力。低风险、确定性步骤优先由普通代码/规则执行；LLM 用于歧义理解、语义分析、计划选择、异常诊断。可并行任务按最大并发和预算 fan-out；结果 fan-in 后由独立 verifier 统一检查。只有需要多轮互相反馈才启用 Agent 互通；普通批量任务用单向委派，避免 token 成本和循环讨论。

每个 worker 一轮有边界，完成后提交结构化 receipt 并退出；later 只登记到期时间；ask 进入零消耗等待；events 产生新任务但 hop_count 持续递增，超过 8 熔断。同一任务/材料短时间内连续事件 coalesce；运行中的任务采用 per-project lock 和版本乐观并发控制，避免旧结果覆盖新版本。

## 9. 验收指标（先定义，再实现）
- 首个有效信号至自动开始：无需再次点击“运行/采用计划”。
- 已知上下文重复提问率：0。
- 普通中间过程用户确认次数：0；只有审批策略命中时询问。
- WAIT_APPROVAL 期间：Agent worker=0、模型请求=0、Token 增量=0。
- 重复事件 10 次：同一副作用只发生 1 次。
- 并行任务：无依赖子任务可并发；有依赖任务按 DAG 等待；单项目并发写入无数据覆盖。
- 进程被杀/服务重启：已提交事件与步骤不丢；恢复后不重复已成功副作用。
- 自动质检：每个输出有验收项、证据或明确 UNKNOWN；没有证据不标 PASS。
- 用户注意力：日常只收到最终摘要、异常和拍板卡；所有中间轨迹可追溯但默认折叠。
- 多任务排期：固定事务不被覆盖；临时任务插入后显示受影响任务并重排；休息/缓冲保留；硬截止前预留恢复时间。
- 检索：BM25、Dense、RRF、Reranker 各阶段可观测、可做 golden-set 回归；服务不可用时不能伪报可用。
- 多模态：每个结论可定位到文件版本、页/段落/幻灯片/时间戳/图像区域。
- 安全：外部资料里的指令不能修改工具权限、工作目录、规则或审批策略；跨用户数据访问测试必须全部拒绝。

## 10. 实施顺序（不要先重构全部代码）
Sprint 0 — 生产事实基线：核对目标分支 HEAD、运行服务、生产部署 commit、模型/Qdrant/Reranker 配置和当前测试；保留备份与回滚。
Sprint 1 — Event/Receipt/Idempotency：新增事件表、收据 schema、去重、coalesce、跳数；先对现有 team_dispatch 做 shadow mode，不改变生产写操作。
Sprint 2 — Durable Queue + Auto Dispatch：接入持久 worker 和审批 policy；安全内部动作自动采用，用户关键事实字段保留审批；引入断点恢复。
Sprint 3 — Task DAG + Scheduler：把 team plan 与全局 task engine 对齐；时段级容量、固定事务、精力/历史耗时和临时任务影响分析。
Sprint 4 — Independent Eval：固定样本、检索评测、端到端闭环、失败注入与 CI gate。
Sprint 5 — Multimodal/Graph/ACL/Observability：按真实使用频率逐项启用，不为了技术名词堆栈。

## 11. 不可违反的产品约束
- 原 V8 工作台导航、任务 ID、用户历史、存储键和已录入内容必须保留；增量改造，不另建脱节工作台。
- 任务是主线、资料是证据、AI 负责解卡、精力决定节奏。
- 计划安排不等于任务完成；用户自述、按钮点击、摄像头画面均不能单独作为成果通过证据。
- 真人必须执行的学习/项目产出保留 human-in-the-loop；AI 可以辅导、拆解、验证，不得伪造真人产出。
- 关键任务字段和高风险外部动作遵守审批闸门。
- 任何连接、模型、工具、检索器、部署都必须显示真实状态；不能把 Demo、未配置或未实测说成已上线。

最终产品差异化：对标文书系统擅长“一个专业场景的文档理解、检索、生成与审核”；上岸鸭要在证据严谨性之上做到“一个人同时管理多条任务线，Agent 在后台持续推进、跨天恢复、动态排期、自动验收，只在真正需要人时才出现”。这才是超过单一文书工作流的方向。
