# 上岸鸭 Universal Autoloop 跨对话接入记录（2026-11-04）

## 本次实现范围

目标是在现有上岸鸭项目、资料、证据和 LangGraph 持久化队列之上增加通用对话入口，不复制第二套任务数据库，也不把外部 Autoloop 代码照搬进来。

### 已写入工程

- `learning-agent/universal_autoloop.py`
  - 每条用户消息先持久化到 `autoloop_events`。
  - 用 `autoloop_threads` 绑定用户、对话和项目；同一项目的不同对话可以复用项目级历史事件。
  - 读取最近 8 条项目事件及最近 3 次运行结果摘要作为增量上下文，不要求重新上传已登记材料。
  - 用户身份由登录会话传入，不接受请求体自行声明 user_id。
  - 项目归属不明确时保存为 `needs_project`，不猜错项目；没有可检索输入材料时保存为 `needs_material`。
  - 对话消息正文始终视为不可信数据，不可提升权限或覆盖系统规则。
  - `dispatch_pending` 作为 Outbox 补偿扫描器，恢复消息已落盘但进程在入队前中断的情况；也会在资料补齐后重新派发 `needs_material` 事件。
  - `bind_thread` 在用户明确选择项目后派发之前保存的待路由消息。

- `learning-agent/shared_api.py`
  - 增加 `POST /api/v1/autoloop/events`。
  - 增加 `GET /api/v1/autoloop/threads/{conversation_id}`。
  - 增加 `POST /api/v1/autoloop/threads/{conversation_id}/bind`。
  - 三个入口都使用现有登录会话和 CSRF 校验。

- `learning-agent/research_graph.py`
  - API 启动时初始化跨对话事件表。
  - Worker 每 5 秒检查 Outbox；无事件时不调用模型。
  - 继续复用原来的队列、租约、LangGraph 检查点和 deadline watcher。

- `learning-agent/visual-workflow/shared-workbench.js`
  - 将工作台“输入问题”入口接入统一 Autoloop API。
  - 同一登录用户、同一项目复用浏览器端 conversation_id；每条消息生成唯一 message_id。
  - 对话状态跨页面刷新保留；任务仍走原来的运行记录和检查点。

- `learning-agent/test_universal_autoloop.py`
  - 测试跨对话消息入队、重复消息幂等、跨用户项目隔离、项目不明确时先保存不误路由。

## 权限策略

- 自动：读取已授权项目、复用已登记资料、检索、分析、生成草稿、运行已有队列工作流。
- 自动但留痕：满足现有规则的内部可回滚计划采用。
- 等待用户审批：对外发送、发布、合并、部署、删除、覆盖、付费、权限变更和不可逆动作。
- 必须保留未知：缺材料、项目归属不明、证据不足时，不允许模型声称已完成。

## 本次验证

- `node --check visual-workflow/shared-workbench.js`：通过。
- `python -m py_compile universal_autoloop.py shared_api.py research_graph.py`：通过。
- `test_universal_autoloop`、`test_universal_autoloop_api`、`test_autoloop_signals`、`test_event_kernel`：22 项通过（Python 3.11）。
- `shared_api` 在 Python 3.11 环境可成功导入，且确认注册了 Autoloop events 路由。
- `test_shared_platform` 尚未完成：当前 Python 3.11 环境缺少 langgraph；默认 Python 3.13 环境的 pydantic_core 二进制扩展加载失败。没有为了测试擅自修改用户 Python 环境。

## 不能宣称已经完成的部分

1. 目前已接入上岸鸭共享工作台的 AI 问题输入框和既有业务事件；这不等于 ChatGPT 产品中的所有独立聊天窗口都已自动接入。外部聊天平台必须通过其授权连接器/Webhook 接入。
2. 现有 LangGraph 主链能自动读取材料、诊断、生成计划，并在无阻塞时自动采用内部计划；它还不是通用桌面/浏览器操作器。GitHub、飞书、微信、Windows 桌面等真实外部动作需要分别实现和授权工具适配器。
3. 需要决策时的状态目前仍以现有 `awaiting_confirmation` 流程为主；下一阶段需把新回复映射到同一 correlation/thread 并恢复可续接的执行状态，而不是仅创建新的诊断 run。
4. 当前分支还未部署到 Railway，也未完成真实环境的数据库迁移、API+Worker 联合启动、重启恢复和端到端验收。

## 下一阶段

- 为任务执行建立受权限策略约束的工具注册表和动作结果协议：`continue / done / later / ask / blocked`。
- 把审批回复与原始 `correlation_id`、`run_id`、checkpoint 关联，真正续接等待中的动作。
- 将任务状态、DDL、精力、卡壳、证据、资料版本等业务事件全部映射到统一入口。
- 接入经过用户授权的 GitHub、飞书、浏览器和桌面工具适配器；逐项验证工具副作用和回滚能力。
- 通过 Python 3.11 工程依赖环境运行共享 API、Worker、PostgreSQL 和故障恢复端到端测试后再部署。
