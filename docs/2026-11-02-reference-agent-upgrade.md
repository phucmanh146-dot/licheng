# 上岸鸭参考仓库改造记录

## 基线与结论

- 上岸鸭：main `8db31cb329656e1b7ad80ca6532a8ded08b4b5fc`。
- 参考：sttyyy/law-enforcement-agent `3b3c9030f814d5b0319e1a3548265f04bc15d16b`。
- 分享对话未读到正文；用户随后直接给出参考仓库，已克隆并阅读源码。
- 本轮完成第一批本地代码改造；不宣称达到80分。未提交、推送、合并或部署。
- Remote Desktop Commander 调用返回 Unknown tool，未访问远程设备；本轮操作的是当前电脑中新克隆的源码，没有改写远程原有工作区。

## 真实技术与适配差距

| 参考源码 | 已核实技术 | 上岸鸭取舍/现状 |
|---|---|---|
| backend/requirements.txt、app/main.py | FastAPI、SQLAlchemy、PostgreSQL | 保留当前标准库HTTP和SQLite；迁移数据库需要事务、恢复和版本兼容验证，尚未实施 |
| app/graph/builder.py、state.py | LangGraph StateGraph；明确抽取→检索→生成→规则→语义复审节点 | 现有A/B/C调度和持久化已在用；不另建竞争状态源。图编排适配尚未实施 |
| app/services/retrieval.py | dense/filtered dense/lexical/metadata召回、RRF(k=60)、业务加权重排 | 本轮迁入多路召回和RRF思想，词法使用BM25、中文双字片段；语义向量和业务重排未接入 |
| app/services/embeddings.py、vector_store.py | Ollama bge-m3、Qdrant；embedding维数检查、失败降级 | 当前返回dense_status=NOT_CONFIGURED，未用随机/哈希向量冒充语义向量 |
| app/services/cache.py | Redis热查询/会话缓存，失败回源 | 目前SQLite为真实持久状态；尚未增加Redis |
| app/services/evaluation.py、metrics.py、audit.py | 评测、指标、审计 | 现有模型run trace继续复用，本轮把检索范围写入诊断输入/输出及其trace；未建立统一监控台 |
| frontend/package.json | Vue3、Element Plus、Vue Router、Vite | 保留原页面；README提及Pinia但依赖表未声明，不据此认定已用 |
| requirements-ocr.txt、OCR服务 | RapidOCR/ONNX | 上岸鸭有可选OCR依赖，当前artifact_store仍只解析文字；未假称扫描件OCR已接通 |

参考源码URL：https://github.com/sttyyy/law-enforcement-agent/tree/3b3c9030f814d5b0319e1a3548265f04bc15d16b

产品保持：真实V1→证据诊断→个性化微动作→真人V2→非执行者复核→只重排剩余项。参考项目的规则/模板兜底不能作为上岸鸭真实模型成功的替代。

## 本轮实现

1. 新增artifact_retrieval.py：从原有不可覆盖材料库读最新版本，按项目隔离；中文双字片段/英文词BM25与标题/来源类型元数据独立召回，用RRF融合。每路候选最多90条，最后按数量和字符预算选择完整原文单元，不切断原文伪造定位。
2. 返回原artifact_id/version、sha256、locator、原文、召回通道、预算及遗漏数，明确coverage=partial。无命中不代表事实不存在；超预算的完整单元可能被省略。
3. 新增POST /api/agent/team/artifact-retrieve：只检索，不调用模型。
4. 新增POST /api/agent/team/rag-diagnosis-preview：检索→现有真实模型适配→原引用/动作校验。局部诊断明确未召回内容未知；拒绝引用或动作跳出召回范围。真实模型未配置则报错，不输出假诊断。保留模型run输入、检索轨迹、结果和失败记录。
5. 预览不写入项目诊断、不采用计划、不确认能力、不改变任务状态；原完整诊断默认行为保留。两个端点当前为API能力，尚无页面入口。

请求示例（project_id与expected_version须来自当前项目）：

```json
{"project_id":"实际项目ID","expected_version":1,"query":"有效分母和缺失人数","limit":12,"max_chars":18000}
```

## 80分目标设计（待用户原评分表核对）

以下是工程验收建议权重，不是已取得分数，也不是官方赛事评分。

| 维度 | 权重 | 放行依据 |
|---|---:|---|
| 真实模型与可执行质量 | 20 | 两个不同真实项目的诊断、动作及未知项经人工逐条核查 |
| RAG与证据版本 | 20 | 标注集Recall@K/引用准确率；当前版本隔离；语义、词法、元数据召回轨迹 |
| 有限循环、工具与失败恢复 | 15 | 工具超时、重试上限、重启后接续、不重复执行副作用 |
| 上下文与跨会话记忆 | 10 | 超预算保留关键约束，跨项目隔离，恢复需明确确认 |
| 依赖排程及真人复核 | 15 | 真实V2、独立复核、失败项重排，完成/锁定项保护 |
| 可观测性与评测 | 10 | run/case/材料hash关联；模拟、接口、浏览器、LIVE分别统计 |
| 交互与交付可靠性 | 10 | 桌面/移动端、刷新恢复、错误可理解、可复现启动 |

获得总分至少80还必须满足硬门：无伪造引文、无版本覆盖、无假LIVE成功、无代造真人V2、无执行者自评冒充独立复核。当前缺真实验收，不能给出已达80的结论。

## 测试与剩余工作

- 最终learning-agent回归：287项通过，约20.1秒。含模拟模型、真实SQLite/文件及HTTP测试；不等于287个真实模型或用户用例。
- 新增检索5项测试：最新版本、原文引用、项目隔离、无命中、整单元预算、稳定顺序、输入校验、真实HTTP路由。
- 新增RAG诊断测试：使用明确的SYNTHETIC模型回复，真实检索→诊断校验通过；项目版本未改变。不是LIVE质量验收。
- git diff --check通过。
- 浏览器：连接后导航报错，未执行本轮应用浏览器验收。
- 真实模型：本机configured=false、hasKey=false、verified=false；未运行。请在产品AI连接页配置，不在聊天或仓库中粘贴密钥。
- 仍需：真实embedding/Qdrant适配、检索评测集、按实际评分表收敛验收、统一节点/工具指标、浏览器验证、真实模型验证及真人V2独立复核。LangGraph/Redis/PostgreSQL没有被本轮冒称接入。

- visual-workflow回归：57项通过，约28.0秒；不含浏览器或真实模型验收。
