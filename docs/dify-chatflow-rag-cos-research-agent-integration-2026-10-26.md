# 上岸鸭科研项目：AI 论文阅读 Agent + Dify Chatflow / RAG / COS 技术接入方案

更新日期：2026-10-26  
基于分支：captain/product-goal-dispatch-20261026  
方案分支：captain/dify-rag-cos-research-agent-20261026

## 0. 先定结论

**产品主参考选择 ScholarMind（AI 论文阅读 Agent）；工程架构参考 AI 智能学习助手后端。** 不把两者当成互斥方案，也不照搬简历中的性能数字。上岸鸭当前要证明的是“真实材料 → 证据诊断 → 可执行行动卡 → 真人产物 V2 → 独立复核 → 只调整剩余项”，所以借鉴论文阅读的科研场景能力，用后端工程方案承接上传、存储、检索、流式响应和审计。

本轮建议引入：
- **Dify Chatflow**：用于科研资料问答、追问澄清、检索增强回答和可视化调试。
- **RAG**：用于从用户授权的论文、项目文档、竞赛要求和实验记录中检索证据，回答时返回来源定位。
- **COS（腾讯云对象存储）**：保存原始 PDF、PPT、Word、图片、解析产物和版本化成果文件。
- **现有 FastAPI / Agent 调度器**：继续掌握项目状态、依赖排程、expected_version、V1/V2、复核状态和中断恢复。不要把业务状态机整体迁移到 Dify。
- **向量库**：存储分块后的 embedding 和检索元数据；COS 不替代向量数据库，向量数据库也不替代原始文件存储。

## 1. 两个参考项目怎么取舍

| 参考项目 | 借鉴内容 | 不直接照搬的内容 | 在上岸鸭中的位置 |
|---|---|---|---|
| ScholarMind：AI 论文阅读 Agent | 论文上传、翻译与深度理解、结构化笔记、多轮问答、RAG、跨文献检索、自检、联网补充资料 | 简历中的“76+ 工具”“7 轮迭代”“8/8 Case”是原项目自述，不能当作上岸鸭效果证据；不必一次复制所有功能 | 产品体验与科研工作流主参考 |
| AI 智能学习助手后端 | FastAPI、MySQL、Redis、SSE、RAG/向量检索、接口分层与数据服务 | 不直接宣称其 QPS、性能提升等数据适用于上岸鸭；不为技术栈而技术栈 | 工程实现参考，按现有代码缺口择优接入 |
| 上岸鸭现有 Agent | 证据诊断、行动卡、依赖与容量、版本保护、暂停恢复、独立复核、剩余项重排 | 不允许 Dify 或新 RAG 流程绕过版本和状态校验 | 产品差异化与核心状态控制层 |

## 2. 目标架构

~~~text
前端（科研工作台）
  ├─ 上传论文/项目文档
  ├─ 论文阅读：摘要、章节解释、多轮追问、引用来源
  ├─ 证据诊断：作品差距 / unknown
  └─ 行动卡、V2 提交、复核结果
          │
          ▼
FastAPI 后端（鉴权、项目隔离、状态机、版本、审计）
  ├─ 文件服务：COS 上传/下载授权、SHA256、版本和元数据
  ├─ 解析服务：PDF/DOCX/PPTX/OCR → 规范化文本 + 页码/段落 locator
  ├─ 知识服务：分块、索引、向量检索、关键词/混合检索
  ├─ Dify Adapter：调用 Chatflow API，后端保存 API Key
  ├─ Agent Orchestrator：诊断、行动规划、恢复、提交与复核
  └─ 数据库：project/artifact/chunk reference/task/run/review 状态
          │                    │
          ▼                    ▼
腾讯云 COS                 Dify Chatflow / Knowledge Retrieval
原件、解析产物、V1/V2      检索证据 → LLM 生成带引用回答
          │
          ▼
向量库（现有 ChromaDB 或项目已选向量库）
embedding、chunk_id、artifact_version、locator、权限元数据
~~~

边界原则：
1. COS 只保存对象和对象元数据，不作为 RAG 检索引擎。
2. 向量库保存分块索引，不是原始文件的唯一副本。
3. Dify 负责可视化编排的问答链；上岸鸭后端负责真实项目状态和不可被绕过的规则。
4. 所有回答必须能回到 `artifact_id + artifact_version + page/paragraph locator + chunk_id`。如果没有证据，返回 unknown/资料不足，而不是编造。
5. 真实服务商调用、Dify 模拟数据、mock 测试必须在日志与界面中区分。

## 3. Dify Chatflow 怎么搭

建议先建立一个独立应用：`上岸鸭科研阅读 Chatflow`。

节点建议：
1. **Start / User Input**：接收用户问题、project_id、artifact scope、任务类型。
2. **Query Rewrite（可选 LLM 节点）**：将“这篇论文说的啥”“这个实验为什么不成立”等自然语言转成检索问题；保留原问题用于答案核对。
3. **Knowledge Retrieval**：只检索当前用户/项目授权的知识库；先测试 top-k、阈值和元数据过滤。
4. **LLM**：根据检索片段生成回答，要求引用片段 ID、页码/章节、原文摘要，并明确区分原文事实、推断和未知。
5. **Answer**：输出简明结论、证据列表、尚缺资料和下一步建议。
6. **日志与反馈**：记录请求 ID、耗时、检索片段、用户反馈与错误类别，不记录密钥。

Chatflow 首轮只做“带来源的论文/项目文档问答”，不让它直接改任务状态、覆盖文件、关闭复核或自动更改排期。等证据召回、引用正确率和错误处理通过，再通过受控的后端 API 把结果转换为诊断建议或行动卡草稿。

## 4. RAG 具体要解决什么

### 4.1 文档处理链

原始文件上传 → 解析 → 文本/表格/页码提取 → 分块 → 生成 embedding → 保存索引 → 检索 → 重排/过滤 → 带来源回答。

每个 chunk 最少保存：
- `chunk_id`
- `project_id`、`owner_id`
- `artifact_id`、`artifact_version`、`sha256`
- `source_name`、`page_number` 或章节/段落定位
- `chunk_text`、`embedding_model`、`created_at`
- `visibility` / 权限范围

### 4.2 必须覆盖的资料类型

- PDF 论文：标题、摘要、章节、页码、参考文献；扫描 PDF 需 OCR，并标注 OCR 置信度或解析状态。
- 项目材料：PRD、实验记录、竞赛通知、评审意见、代码说明与测试报告。
- 图片/PPT：不能只靠文件名判断内容；图片文字需 OCR，复杂图表需保留“待人工核验”标记。
- 网页资料：保存 URL、抓取时间、正文和可定位段落；访问失败要明确失败原因。

### 4.3 RAG 质量测试

至少准备 20–30 个带标准答案的真实问题，包括：
- 直接事实题：论文某方法在哪一节定义？
- 跨段综合题：实验设计、指标与结论是否一致？
- 跨文档题：竞赛要求与当前作品差距是什么？
- 不可回答题：资料里没有给出某个数字时，系统是否明确说找不到？
- 权限隔离题：A 用户不能检索 B 用户的文件。
- 版本题：V1 的引用不能误指向 V2，旧 chunk 不得混入新版本回答。

记录 Recall@k / MRR（如可计算）、引用支持率、拒答正确率、跨用户泄露数、延迟和成本。第一阶段不设虚构的“准确率 100%”；先冻结数据集和计算方法，再报告实测结果。

## 5. COS 文件存储接入

### 5.1 存什么

- `raw/{owner_id}/{project_id}/{artifact_id}/v{n}/original.ext`：原始文件。
- `parsed/{owner_id}/{project_id}/{artifact_id}/v{n}/content.json`：解析文本与定位。
- `outputs/{owner_id}/{project_id}/{artifact_id}/v{n}/`：摘要、结构化笔记、V1/V2、评测证据包。

对象 Key 仅作示例，正式实现需采用随机/不可猜测 ID，不把手机号、邮箱或其他个人信息直接写进 Key。

### 5.2 安全要求

- Bucket 默认私有，禁止把用户科研文件设为公开读。
- COS SecretId/SecretKey 只放服务端环境变量或密钥管理系统，不放浏览器、仓库或日志。
- 上传下载由后端校验用户、项目权限和文件版本后签发短时效预签名 URL；URL 过期后需要重新申请。
- 上传后计算 SHA256，写入数据库和 manifest；版本更新生成新对象 Key，不静默覆盖原件。
- 设定文件大小、类型白名单、恶意文件检查、配额、生命周期和删除策略。
- 日志只保存 object key/状态/请求 ID，不记录密钥或完整签名 URL。
- 需要确认数据区域、预算、账号权限及用户同意后才能实际启用云资源。

## 6. FastAPI 与 Dify / COS 的接口边界

建议先定义以下服务端接口，最终路径需与现有 API 路由核对后再定：

| 接口意图 | 服务端职责 | 不允许 |
|---|---|---|
| 创建上传授权 | 校验用户/项目、生成短时效上传授权、记录 pending artifact | 前端拿 COS 长期密钥 |
| 确认上传完成 | 校验对象存在、大小、类型、hash，状态改为 uploaded | 仅凭前端“上传成功”就当解析成功 |
| 解析并索引 | 提取文本、页码、版本、chunk，写向量索引 | 文件名或空文本进入已索引状态 |
| 科研问答 | 后端带 project scope 调用 Dify Chatflow，过滤并返回引用 | 浏览器直连 Dify 私密 API Key |
| 生成诊断草稿 | 将带引用回答转成 gap 草稿，再走现有 schema/证据门 | Chatflow 直接把 gap 标记为 verified |
| 生成行动卡草稿 | 只接受已通过证据门的 gap，调用现有 planner | Dify 绕过依赖、容量和 expected_version |
| 保存 V2 / 复核 | 走现有 commit/review 状态机，写版本差异和审计 | Chatflow 自行覆盖原文件或自动关闭 review |

MySQL 继续保存关系型状态；Redis 仅在确认需要缓存、限流或任务队列时加入，不作为必须依赖。SSE 可用于把解析、检索、生成过程的状态逐步推送到前端；不要为了复刻简历中的技术栈而在没有需求时增加复杂度。

## 7. 分阶段实现与验收

### P0：先跑通 COS 文件闭环
交付：私有 Bucket、服务端上传授权、文件元数据、SHA256、下载授权、版本不覆盖、权限隔离。
验收：
- A 用户不能获取 B 用户文件的上传/下载授权。
- 上传后可通过后端确认对象存在并计算/核对 hash。
- 新版本不覆盖旧版本；旧版本仍可按权限读取。
- 浏览器和 Git 仓库中均找不到长期密钥。

### P1：打通解析与 RAG
交付：至少一种可解析 PDF 路径、chunk 元数据、向量索引、带页码/章节引用的检索。
验收：
- 20–30 个问题集跑完并留存原始输出。
- 无答案问题能正确拒答。
- 引用可回查到对应 artifact_version 和页码/段落。
- 旧版本和跨用户检索负例全部通过。

### P2：接入 Dify Chatflow
交付：Chatflow 应用、Knowledge Retrieval、服务端 Dify Adapter、超时与错误映射、请求 ID 和 trace。
验收：
- 同一固定问题在 Dify 测试与 FastAPI 接入下结果可对照。
- Dify 不可用、模型超时、无效 Key、无检索结果时，前端显示明确状态，不伪装成功。
- API Key 只在后端；回答包含证据定位和 unknown。
- 每次调用能关联 project_id、artifact_version、run_id、检索片段和耗时。

### P3：接回上岸鸭闭环
交付：论文/项目材料问答 → gap 草稿 → 证据门 → 行动卡 → 真人修改 V2 → 独立复核 → 剩余项重排。
验收：
- Chatflow 无权直接更改任务状态。
- 未通过证据门的回答不能变成正式 gap。
- V2 提交后状态为 pending_review。
- 只有 FAIL/UNKNOWN/BLOCKED 项被重排；已完成与待复核项保持不变。
- 每个结果可以从 V2 反查原始文件、版本、chunk、run、gap 和 review。

## 8. 当前状态与实现纪律

本文件是技术接入方案，不代表 Dify、COS 或新的 RAG 已在当前环境开通或接通。正式开始前，技术负责人需要确认：
- 当前部署环境、数据库、对象存储与向量库现状；
- 是否已有 Dify 服务地址、应用 ID、API Key（密钥不得发到聊天或提交到 Git）；
- 是否已有腾讯云 COS Bucket、Region 和最小权限策略；
- 当前论文解析、ChromaDB、FastAPI 路由与现有 Agent 状态机的真实代码位置；
- 预算、数据区域、文件保留期限和测试样本授权。

没有上述配置时，状态填写 `blocked` 或 `not_run`。不得把计划、模拟数据、HTTP 200 或 mock 结果写成生产接入成功。

## 9. 官方参考

- Dify 知识库检索节点： https://docs.dify.ai/guides/knowledge-base/retrieval
- Dify Knowledge Pipeline： https://dify.ai/zh/rag
- 腾讯云 COS 上传对象： https://cloud.tencent.cn/document/product/436/65820
- 腾讯云 COS 上传/下载说明： https://cloud.tencent.com/document/product/436/30740
