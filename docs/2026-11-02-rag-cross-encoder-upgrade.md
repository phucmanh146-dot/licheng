# 上岸鸭 Agent 工程闭环增补：Cross-Encoder 与可操作 RAG（2026-11-02）

## 目标与边界

本轮基线为 `captain/80-point-evidence-closeout-20261102`，起始提交 `a254eef`。在独立 worktree 与分支 `feature/agent-rag-rerank-20261102` 修改，不覆盖原工作目录、原分支和已有未提交证据。

产品宗旨不变：

`真实作品 V1 → 目标质量标准 → 原文证据诊断 → 个性化微动作 → 真人执行 → 真实 V2 → 非执行者独立复核 → 只重排未通过/未知项`

同时保留卡住/中断后的现场、尝试、上下文和用户确认恢复。工程技术必须服务于这条业务闭环，而不是单纯堆技术名词。

## 本轮代码改动

1. 新增 `learning-agent/cross_encoder_rerank.py`：提供兼容 Jina/Cohere 风格与 Hugging Face TEI 风格结果的 Cross-Encoder HTTP 适配器；检查返回索引、分数、完整性和有限值；错误只记录错误类型，不泄露 endpoint、密钥或响应正文。
2. `artifact_retrieval.py` 将 BM25 词法召回、材料元数据召回、可选 Qdrant Dense 召回通过 RRF(k=60) 融合；对最多 50 条候选调用 Cross-Encoder 重排。
3. 未配置或服务不可用时，明确回退到原有确定性内容重合排序，并在 `reranker` / `reranker_trace.status` 标注 `content_overlap_fallback`、`NOT_CONFIGURED` 或 `UNAVAILABLE`；绝不宣称 Cross-Encoder 已运行。
4. 新增 4 项测试，覆盖未配置、正常排序、异常/不完整响应 fail-closed、真实材料引用在重排后仍绑定原始 artifact/version/SHA/locator。
5. 增加 `.env.engineering.example` 的 reranker 配置项。服务地址和密钥不写入仓库。
6. 在队长工作台增加项目内 RAG 操作入口：先查看召回原文、材料版本、召回通道、Dense 状态和 reranker 状态；可选请求真实模型生成局部诊断预览。预览不写入正式诊断、不采用计划、不标记任务完成。
7. 上传入口扩展图片文件选择器；扫描 PDF 在无可提取文本时走 RapidOCR/ONNX 适配器。低置信度 OCR 结果必须人工核对。

## RAG 实际链路

`项目权限与当前版本 → 读取不可覆盖原始材料 → 中文双字片段/英文词 BM25 → 材料元数据召回 → 可选 BGE-M3/Ollama Dense + Qdrant → RRF 融合 → 可选 BGE Reranker Cross-Encoder → 保留原始定位与 SHA256 → 模型诊断 → 原文引用/动作契约校验 → 仅预览 → 用户确认后进入既有 A/B/C 工作流`

注意：
- BM25 是关键词召回；Dense 是语义召回；两者都不等于模型理解质量。
- Qdrant 和 Ollama 必须真实配置且成功请求后，`dense_status` 才会为 `AVAILABLE`。
- Cross-Encoder 必须配置真实 `SHANGAN_RERANKER_URL` 并成功返回完整排序，`reranker_trace.status` 才会为 `AVAILABLE`。
- RRF 只合并候选排名；Cross-Encoder 只重排候选，不能替代人工确认、引用支持性复核或真实用户试做。
- 当前检索只取项目每份材料的最新版本；历史版本仍保留且可按版本过滤。无命中不代表材料中不存在相关事实。

## 服务配置

在本机私有 `.env.engineering` 或部署平台密钥管理中设置：

- `SHANGAN_OLLAMA_URL`：Ollama 服务地址
- `SHANGAN_EMBEDDING_MODEL=bge-m3`
- `SHANGAN_EMBEDDING_DIMENSIONS=1024`
- `SHANGAN_QDRANT_URL` 或本地持久化 `SHANGAN_QDRANT_PATH`
- `SHANGAN_RERANKER_URL`：兼容 `POST /rerank` 的 reranker endpoint
- `SHANGAN_RERANKER_MODEL=BAAI/bge-reranker-v2-m3`
- `SHANGAN_RERANKER_API_KEY`（服务需要认证时）
- `SHANGAN_RERANKER_TIMEOUT=20`

本轮没有私自部署新的向量服务或 reranker endpoint，也没有写入密钥。未配置时 UI 会显示未配置/回退状态。

## 竞赛评分对齐

官方大赛网站公开描述强调：面向真实业务场景，体现 AI Agent 可验证交互能力，解决行业实际问题，并关注创新、效率提升和落地应用。官网列有评审指南下载入口，但详细评审指南部分资料需要登录；公开页面未给出可核实的统一百分制权重。因此下面是团队内部 100 分工程验收权重，不是官方分值，不代表已获得 80 分：

| 内部维度 | 权重 | 必须提供的证据 |
|---|---:|---|
| 真实模型与可执行质量 | 20 | 两个不同真实项目的诊断、行动卡和未知项人工逐条复核 |
| RAG 与证据版本 | 20 | 人工标注检索集、Recall@K、引用支持性、版本隔离、Dense/RRF/Reranker 轨迹 |
| Agent 工具与失败恢复 | 15 | 有限工具循环、失败重试上限、幂等、重启恢复和副作用保护 |
| 上下文与跨会话记忆 | 10 | 关键约束保留、项目隔离、用户确认恢复 |
| 排程、真人执行与独立复核 | 15 | 真人 V2、非执行者复核、失败项重排、已完成项保护 |
| 可观测性与评测 | 10 | case/run/trace/材料 hash 关联，Mock/HTTP/浏览器/LIVE 分开统计 |
| 交互与交付可靠性 | 10 | 桌面/移动端、刷新恢复、清晰错误、可复现部署 |
| **合计** | **100** | **80 分内部目标必须逐项有证据** |

硬性阻断：伪造引用、旧版本覆盖新版本、把 mock 当 LIVE、把助手草稿当真人 V2、执行者自评冒充独立复核。任何一项发生，都不能通过完整闭环验收。

## 验收命令

```powershell
cd learning-agent
python -m unittest -v test_cross_encoder_rerank
python -m unittest discover -p 'test_*.py' -q
python -m py_compile artifact_retrieval.py cross_encoder_rerank.py
node --check team-rag.js
git diff --check
```

全量测试需使用 `requirements-engineering.txt` 的隔离环境；系统全局 Python 的 FastAPI/Pydantic 安装损坏或缺少 qdrant-client 时，不得把依赖导入失败写成产品逻辑通过/失败。所有测试仍须明确区分 SYNTHETIC、真实服务、真实材料和真人成果。

## 当前未声称完成的事项

- 本轮尚未取得并核实适用于本队、当前赛道的官方详细评分表；需要从官网评审指南/报名系统取得后逐项映射。
- 本轮尚未配置和实测生产 Cross-Encoder 服务；默认仍会清晰显示 fallback。
- 本轮尚未配置和实测真实 Ollama + Qdrant 服务与人工标注检索集。
- OCR 代码路径已接入材料解析，但 RapidOCR/ONNX 实际识别准确率仍需真实扫描件样本复核。
- 两个真实项目的真人 V2、非执行者独立复核、普通模型同条件对照仍未完成。
- PostgreSQL、对象存储、Redis 的生产连接、迁移和权限隔离仍需单独演练。
- 新 UI 必须在当前分支完成浏览器桌面/移动端验收后，才可宣称可操作闭环通过。

## 官方公开参考

- 第二届全国人工智能应用创新大赛官网：https://www.ai-race.com.cn/
- 大赛通知（中国海洋大学）：https://ibs.ouc.edu.cn/terc/2026/1001/c32359a538436/page.htm
- Qdrant Hybrid Search / RRF / reranking： https://qdrant.tech/documentation/tutorials-basics/reranking-hybrid-search/
- LangGraph Human-in-the-loop interrupts： https://langchain-ai.github.io/langgraph/concepts/human_in_the_loop/

## 追加核查：PostgreSQL 适配边界

复核 `shared_database.py` 与 `learning_agent.py` 后确认，仓库已有 SQLAlchemy + psycopg 的 PostgreSQL 兼容层：进程启动前配置 `SHANGAN_DATABASE_URL` 时，`learning_agent.connection()` 走 PostgreSQL 适配层；未配置时走 SQLite 本地回归。账号、项目 ACL、运行队列、节点事件和 checkpoint 通过 `team.connection()` 使用该连接层。适配层包含问号参数转换、BLOB/BYTEA 转换、事务锁和部分 upsert 语法兼容；`migrate_shared.py` 提供迁移入口。

本轮没有连接真实 PostgreSQL 实例，也没有完成生产数据迁移、并发/故障恢复、备份还原和旧数据校验。因此只能确认代码适配路径存在，不能声称生产 PostgreSQL 已联调通过。健康接口会在数据库连接后执行 `SELECT 1`，但这不替代迁移和恢复验收。

## 本轮最终执行结果（独立工程虚拟环境）

- 使用 `D:\.venvs\shangan-ya-engineering-20261102`，按 `requirements-engineering.txt` 安装隔离依赖；没有改动系统全局 Python。
- 全量 Python 回归：**322 tests，62.164 秒，OK**。
- Cross-Encoder/RAG 专项：**5 tests，OK**，包含 provider 正常排序、异常/不完整响应、RRF 后引用保持、工作台静态资源 HTTP 200。
- `node --check team-rag.js`：通过。
- Python `py_compile`：通过。
- `git diff --check`：通过。
- 发现并修复静态资源白名单遗漏：新增 `team-rag.js` 最初返回 404，加入 `learning_agent_server.py` 允许列表后，工作台 HTML 和 JS 均返回 HTTP 200。

限制仍然有效：没有 Playwright，未完成真实浏览器桌面/移动端 E2E；没有配置生产 Cross-Encoder、Ollama/Qdrant 或真实模型；322 项回归主要证明工程逻辑与合成测试稳定，不等于真实模型质量、真人 V2 或官方 80 分。
