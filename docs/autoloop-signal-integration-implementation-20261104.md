# 上岸鸭 × Agent-Autoloop：P0 信号接入实施记录

日期：2026-11-04  
分支：`feature/agent-rag-rerank-20261102`

## 本轮实际修改

本轮不是安装一套平行 Agent 产品，而是在上岸鸭现有认证 API、持久化运行队列、LangGraph Worker 和项目材料版本上接入轻量事件控制面。

### 新增

- `learning-agent/autoloop_signals.py`
  - 把资料新增、成果提交、任务卡壳、执行状态变化、精力/可用时间反馈、项目截止信息变化、恢复任务等操作映射为标准事件。
  - 使用项目版本与事件类型生成稳定幂等键。
  - 事件以已登录用户 ID 入队，继续使用既有 `platform_store.enqueue` 与 Worker。
  - 自动引用已登记输入材料的 artifact_id/version/SHA256，不重复上传、不把原文件复制进事件。
  - 事件正文明确标记为不可信数据，不能改变系统指令或工具权限。
  - 增加 DDL watcher：Worker 每 60 秒只读取项目元数据，进入 72h/24h/6h 窗口时生成一次事件；没有变化不调用模型。日期字段目前只有 YYYY-MM-DD，因此按项目时区的当日 23:59:59 解释。

### 修改

- `learning-agent/shared_api.py`
  - 认证操作成功后，把合适的领域变化交给 Autoloop adapter。
  - 使用当前已认证用户 ID；没有绕过项目 ACL。
  - API 返回新增的 `autoloop` 运行引用，方便界面显示自动处理中状态。
- `learning-agent/research_graph.py`
  - 既有后台 Worker 每 60 秒触发一次轻量 DDL 元数据扫描。
  - 扫描失败会记录异常但不终止 Worker。
  - 队列仍由既有持久化运行机制领取；没有事件时不发起模型请求。
- `.github/workflows/agent-event-kernel.yml`
  - 增加 Autoloop adapter 测试，并在 push / pull_request 中执行。
- `learning-agent/test_autoloop_signals.py`
  - 覆盖事件路由、幂等键、Demo 排除、无输入材料不派发、DDL 事件和不可信文本边界。

## 复用而非重写的能力

- `platform_store.py`：数据库适配、运行队列、租约、幂等键、运行事件和节点检查点。
- `research_graph.py`：既有 LangGraph 检索、诊断、验证、计划和安全采用规则。
- `compose.engineering.yml`：已有独立 `worker` 服务，执行 `python research_graph.py`；不再新增第二个 Worker。
- `artifact_store.py`：已有材料版本和哈希，事件只传引用。

## 本轮验证

GitHub Actions：
- Run：`41829490934`
- Commit：`bce11070610a5830422794088719ef3d90a0d2b6`
- 结果：Python compileall、event_kernel + autoloop_signals 单元测试、team.js 语法检查均通过。

## 仍未完成、不能冒称上线的部分

1. 当前 LangGraph 工作流完成的是材料检索、证据诊断、计划校验与安全采用；它还不是可以对任意学习/项目任务自主调用全部外部工具、持续产出 V2 的通用执行循环。
2. 当前 `awaiting_confirmation` 是已保存并退出的等待态；完整的用户答复后恢复同一运行/会话、并对任意工具副作用做到 exactly-once，仍需进一步实现和验收。现有节点检查点支持恢复已完成节点，但不等于已经实现完整会话恢复。
3. 当前自动信号依赖已认证共享 API 的项目操作；旧版 loopback API 和网页其他版本尚未全部统一接入。
4. DDL watcher 目前使用项目级日期字段；任务级精确时刻、用户固定事务、多个任务的三天倒排与精力曲线联动，仍需接入现有任务排期数据并做真实项目验证。
5. GitHub Actions 通过不代表 Railway/生产服务已部署。需要把该分支部署到目标环境，确认 API 与 Worker 使用同一持久化数据库/对象存储/配置，再进行真实账号、真实材料和断线恢复验收。

## 交付判定

本轮完成的是“领域变化 → 稳定事件 → 已认证持久化队列 → 既有 LangGraph Worker”的 P0 信号接入，以及项目级 DDL 轻量 watcher。没有把测试通过等同于生产部署，也没有把自动生成计划等同于真人成果已完成。
