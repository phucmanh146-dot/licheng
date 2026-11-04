# 上岸鸭科研个性化与 AI 投入产出审计（2026-11-04）

## 结论摘要

本次以 `feature/agent-rag-rerank-20261102` 为审查基线，目标不是给所有同学发同一套科研任务，而是围绕每个人、每项能力和当前研究产物做分层指导；同时让每次模型调用有可追溯的成本估算、验证结果和后续真实成果状态。

本次新增了“按技能、按证据分层”的指导元数据和模型调用努力度记录。它是工程改进，不代表已经证明 AI 投入产出比为正；真实 ROI 仍需供应商 usage、费用、人工基线、真人 V2 与独立复核数据。

## 一、科研任务如何因人而异

### 1. 不建立一个全局学生等级

每个成员按每项任务所需技能分别评估。一个同学可能 Python 已能独立使用，但访谈设计仍需指导；不能用一个总分把他归为“初级”或“高级”。

新增 `learning-agent/research_personalization.py`：

| 证据状态 | 指导路径 | 系统行为 |
|---|---|---|
| 无确认的产物证据 | `unverified` / 诊断试做 | 先给最小试做，不直接塞整套课程 |
| 最近一次确认未通过 | `needs_support` / 针对性补救 | 只补当前错误对应的方法，再做练习与复试 |
| 一份有效通过证据 | `guided` / 清单＋反馈 | 不再重复基础课，保留步骤提示与结果反馈 |
| 两个不同任务的有效通过证据 | `independent` / 独立执行 | 减少讲解，给独立产物和抽查标准 |
| 三个不同任务的有效通过证据，且明确记录迁移验证 | `transfer` / 挑战任务＋同伴复核 | 增加跨场景任务，不把熟练误判为研究能力全面成熟 |

有效证据必须有成员确认、通过/未通过判定、验收标准、真实 artifact_id 和版本。自我介绍、模型推断、观看课程或点击完成都不能升级能力等级。科研能力按技能分别记录，不做人格或学生价值排名。

### 2. 现有指导链继续复用

`personal_guidance.prerequisites()` 仍负责生成试做、补方法、最小练习和复试任务；本次只给每个学习路径和动作补充：
- `proficiency_level`
- `support_mode`
- `capability_evidence_count`

不另建一套任务库，也不改变正式成果差距必须由真实 V2 和独立复核关闭的规则。

## 二、AI 投入产出比怎么衡量

新增 `learning-agent/ai_efficiency.py`，并接入 `team_ai.call_json()` 的模型运行轨迹。

每次调用记录：
- 模型调用次数、校验重试次数；
- 请求/响应字符数；
- 按字符数除以 4 估算的输入/输出 Token；
- 执行耗时；
- schema 与来源校验是否通过；
- 是否有供应商真实 usage 与费用。

重要边界：
- 当前模型适配器只返回文本，没有供应商 usage 明细，所以 Token 是估算，实际费用为 null，不伪造人民币金额。
- JSON/引用结构校验通过不等于科研成果被接受；ROI 必须等待真人产物、独立复核和人工基线。
- 复用缓存必须输入哈希一致且原结果通过校验；不能因为相似主题就复用旧结论。
- 无新信号时不调用模型；重复上传/重复上下文应优先复用已有材料版本和节点检查点。
- 每次 AI 工作都应绑定当前缺口、预期产物和验收标准；没有可验证输出时停止继续扩写。

建议后续正式指标：
1. 每个已验收成果的真实模型费用（供应商 usage × 当期价格）。
2. 从同一输入到首个可用成果的耗时，与人工/普通模型基线比较。
3. 引用正确率、验收通过率、返工率、重复提问和重复上传次数。
4. AI 生成建议被真人采纳并形成 V2 的比例。
5. 每单位成本产生的独立复核 PASS 数量。
6. 未通过、UNKNOWN 和无效调用必须计入分母，不能只报告成功案例。

在没有对照实验之前，不宣传“节省 X%”“效率提高 X 倍”或“AI 投入产出已成正比”。

## 三、与事件驱动 Runtime 的衔接

本次改动继续基于现有：
- `platform_store` 持久化队列；
- `research_graph` LangGraph 流程；
- `artifact_store` 材料版本与 SHA256；
- `team_ai` 原文引用和验证；
- `personal_guidance` 能力差距学习路径；
- 既有真人执行、V2、独立复核和失败后重排机制。

事件驱动控制面负责何时启动/挂起/恢复；个性化模块负责同一个缺口应给这个成员什么指导；成本记录负责解释 AI 为这次结果花了多少调用与时间。三者不能互相替代。

## 四、本次提交记录

- 新增 `learning-agent/research_personalization.py`
- 新增 `learning-agent/test_research_personalization.py`
- 修改 `learning-agent/personal_guidance.py`
- 新增 `learning-agent/ai_efficiency.py`
- 新增 `learning-agent/test_ai_efficiency.py`
- 修改 `learning-agent/team_ai.py`
- 修改 `.github/workflows/agent-event-kernel.yml`，将新模块纳入语法检查与回归测试。

## 五、仓库与未合并状态

审查时：
- 目标开发分支相对 `main`：72 commits ahead、7 commits behind，状态为 diverged（在 PR #97 创建时核对）。
- 原 open PR #96（手机号＋密码登录交互 Demo）已通过 regression 检查并 squash 合并，merge commit：`5f98aae12e4f6c40a46299faa1448dc8f9c30a69`。该 PR 与科研/Autoloop改造无关。
- 已为本次开发分支创建 Draft PR #97：https://github.com/phucmanh146-dot/shangan-ya/pull/97。GitHub 当前标记 `mergeable=false`，不可直接合并。
- 用户 Windows 本机 `D:\\shangan-ya-rag-rerank-20261102` 工作区存在未提交的 `planner.js`、浏览器测试修改、科研文档和 evidence 文件。本次没有覆盖、清理或擅自提交这些本地改动。
- 本机 checkout 的 HEAD 为旧的 `3db3406`，与本次 GitHub 分支后续提交不一致；本机 Python 环境的 FastAPI/Pydantic 二进制依赖异常，且缺少本地新文件。因此本机定向测试不能作为当前 GitHub HEAD 的验收结果。

## 六、尚未通过的生产验收

- 新增测试需由本次 GitHub Actions 对最新提交执行；此前成功的 Run 41830431660 只验证早先事件接入，不覆盖本次新改动。
- 真实供应商 usage / 价格接入尚未完成。
- 不同基础同学的真实对照样本、真人 V2 和独立盲审尚未完成。
- Railway API + Worker 同库部署、事件自动触发、等待零 Token、恢复同一任务的生产验收尚未完成。
- 开发分支与 main 的 4 个提交差异尚未整合；不得直接强推或盲目合并。

## 放行标准

只有在最新 CI 通过、分支差异完成审查、生产 API/Worker 同库运行、至少两种能力水平的真实同学完成差异化科研任务、真人 V2 被非执行者独立复核，并取得真实模型 usage 与对照基线后，才可以声明该系统实现了可证明的 AI 投入产出优势。
