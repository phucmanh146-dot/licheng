# 上岸鸭事件入口与现有 LangGraph 工作流接线记录
日期：2026-11-04
目标分支：feature/agent-rag-rerank-20261102

## 本次代码改动
本次没有引入另一套 Agent 产品，也没有复制上游项目的 CLI、插件或运行时。事件入口复用上岸鸭自己的 platform_store 持久运行队列和 research_graph LangGraph Worker。

新增/修改：
- learning-agent/event_kernel.py：事件类型白名单、项目版本检查、事件载荷大小限制、稳定幂等键、事件入口与状态查询。
- learning-agent/platform_store.py：持久化运行输入时同时保存事件来源、事件类型、事件 ID 和事件载荷；仍使用现有 PostgreSQL/SQLite 兼容边界。
- learning-agent/learning_agent_server.py：新增 POST /api/agent/events 与 GET /api/agent/events?run_id=...。
- learning-agent/research_graph.py：事件触发的 LangGraph 工作流完成材料读取、Hybrid RAG、诊断、计划生成和既有校验；符合安全规则时自动采用内部计划，否则保留待拍板状态。
- learning-agent/team_orchestrator.py：新增带明确审计动作的 apply_automated，复用原计划校验、版本保护和回滚字段。
- learning-agent/team.js：真实项目的总调度按钮改为提交事件、查询后台运行状态；Demo 仍使用原 Demo 路径。
- learning-agent/test_event_kernel.py：覆盖事件白名单、版本冲突、Demo 隔离、幂等键和载荷校验。

## 事件接入契约
POST /api/agent/events：
```json
{
  "project_id": "现有项目ID",
  "expected_version": 4,
  "event_type": "user_signal",
  "source": "team-workbench",
  "query": "基于当前项目目标与已登记材料诊断缺口并生成行动计划",
  "payload": {"trigger": "dispatch-button"}
}
```

允许事件类型：
user_signal、material_added、task_created、task_blocked、schedule_changed、deadline_changed、evidence_submitted、checkin_received、project_resumed。

同一事件如需跨网络重试，应携带稳定的 event_id；不传时系统按项目、版本、类型、查询和载荷生成稳定指纹。事件仅作为数据进入工作流，不会成为系统指令或工具权限。

运行状态：
GET /api/agent/events?run_id=<run_id>

## 自动推进与拍板边界
- 事件必须指向现有 live 项目，项目版本必须匹配；Demo 项目不进入真实后台执行。
- 事件进入现有 platform_runs 持久队列，由现有 research_graph.py Worker 领取；无需新增第二套队列。
- LangGraph 复用已有材料读取、artifact locator、Hybrid RAG、诊断、计划验证节点。
- 仅当诊断无 unknowns、计划无 unscheduled 项、任务无 blocked 状态及外部依赖时，自动采用已验证的内部计划。
- 其余情况保存诊断和计划预览，状态为 awaiting_confirmation，返回具体拍板原因。
- 自动采用只更新上岸鸭内部计划，不代表真人任务已完成，不代替真人提交成果、外部发布或独立复核。
- 所有任务完成仍以原有真实材料版本、执行记录、证据和独立验收为准。

## 启动与部署
本地：
1. 启动现有 API：python learning_agent_server.py
2. 启动现有 LangGraph Worker：python research_graph.py
3. 确保 live 项目所需模型、Qdrant、Embedding、Reranker 与材料存储已真实配置。

工程 Compose 已有 worker 服务执行 python research_graph.py；API 和 Worker 必须连接同一持久化数据库。不要只启动 API 而遗漏 Worker。

## 当前验证边界
- 已增加事件入口单元测试文件，但本次 GitHub 远程文件编辑没有在用户 Windows 机器或生产环境执行 Python/浏览器/数据库端到端测试。
- 本次没有修改 Railway 生产部署，也没有声称线上已经运行。
- 本次接线的是现有团队工作台的真实项目总调度入口。其他事件类型已定义统一契约，但资料上传、精力反馈、DDL 定时器、GitHub Webhook 等来源仍需分别调用事件入口，不能把白名单存在说成这些来源已经全部接通。
- 文书系统的架构能力按此前确认的工程资料复用：LangGraph 节点编排、OCR/文档定位、Hybrid RAG、Qdrant、RRF/重排、PostgreSQL/Redis 服务化与审计思路；不复制其执法业务规则或专用数据模型。
