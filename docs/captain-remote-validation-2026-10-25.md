# 队长 C 远程核验记录（2026-10-25）

## 执行环境
- 远程设备「江月的诗」已 Online。
- 本机核验仓库：`C:\Users\jiang\code\shangan-ya-captain`，分支 `feature/orchestrator-agent`，基线 `203e7cc`。
- 本文只记录实际测试；不将受控夹具等同真实模型、真实作品或用户收益。

## 已执行结果

### Python 后端
执行 `python -m unittest discover -q`：**93 tests passed**（Windows / Python 3.13）。

### Chromium 浏览器
下列脚本均通过，`browserErrors=[]`：

| 脚本 | 检查数 | 覆盖 |
|---|---:|---|
| `test_team_browser.cjs` | 9 | 创建、A→B 示例、预览/采用、执行、待验收、刷新恢复、证据验收、API 状态、移动端 |
| `test_guidance_browser.cjs` | 9 | Live 边界、诊断位置/版本、非法版本拦截、指导预览、不可信文本、逐条件复核、版本留存、移动端 |
| `test_dispatch_browser.cjs` | 7 | 调度预览、确认采用、旧计划失效、重新诊断、Live/模拟区分、移动端 |
| `test_period_browser.cjs` | 9 | 周期容量、预览/采用、突发扣减、30 分钟缺口、撤销恢复、版本保留、移动端 |
| **合计** | **34** | 人工构造夹具；不是模型质量或用户收益结果 |

## 本轮修复
1. `test_guidance_browser.cjs` 在 Windows 下通过 Python 子进程生成中文 JSON 时，默认输出编码可能与 Node 的 UTF-8 解码不一致，导致定位字段乱码。改用 `python -X utf8`，保留原断言后 9 项检查通过。
2. `prove_existing.py` 的 Git blob 校验现在先把 CRLF 规范为 LF，匹配 Windows `core.autocrlf=true` 下 Git 文本 blob 的规范化行为。

## 历史证据复现边界
修正换行核验后，`prove_existing.py` 仍拒绝当前 `learning-agent/learning_agent.py`，因为源码 SHA 与 `provenance.json` 固定值不同。清单的 `input_commit=b191d849af7ede9801ccb5dbd21f5d943ab307e1`，而本机基线为 `203e7cc`，其间已有后续代码改动。该拒绝符合“代码变化后不静默沿用旧证据”的原则。不得改写旧 SHA 来伪造复现；当前版本应另建 manifest 和结果文件重新运行。

## 真实作品闭环状态
`evidence/first-prize-v5` 中 S01 文档案例、S02 CSV 案例均标记为人工构造开发材料；`live_model_evaluation` 与 `user_study` 为 `not_run`。本轮未在该证据目录中找到可用于正式验收的“数智助老”及“湘匠织秀/湘秀未来”原始作品冻结版本，因此没有伪造原文 locator、真实 V2、模型响应或真人指标。

## C/队长判定
- 工程后端：**PASS（93 项）**
- 浏览器流程：**PASS（34 项，受控夹具）**
- 历史固定版本复现：**BLOCKED（当前源码与固定 SHA 不一致）**
- 两类真实作品私人定制：**NOT RUN**
- 10 份真实材料的真实模型稳定性测试：**NOT RUN**
- 独立执行真实 V2、盲复核、四项用户对照指标：**NOT RUN**
- 最终集成审批：**BLOCKED / NOT_VERIFIED**

## 下一步责任
1. **A：** 从原件提交两类作品各至少 3 条有原文定位的 gap、版本、证据和冻结判据。
2. **B：** 仅针对已核验 gap 交付差异化行动卡，含依赖、时间、产物、自检、失败路径与验收条件。
3. **C：** 为当前 commit 生成独立版本化工程证据；保存至少 10 份真实材料的真实模型请求/响应；冻结版本/hash 与判据并组织独立执行复核。
4. **独立复核人：** 留存真实 V2、耗时、卡点、产物版本/hash、逐项 PASS/FAIL/UNKNOWN 和四项对照指标的原始分母。
5. 证据齐全后再将最终审批从 BLOCKED 改为 PASS。


## 2026-10-25 补充：恢复在线后的本机复测

### 远程连接与仓库安全
- Desktop Commander 账号 `guzmanelaine42@gmail.com` 已显示设备「江月的诗」Online，设备 ID `1527971c-6917-4fd0-9778-01f40b451bc0`，版本 0.2.52。
- 实际验收仓库：`C:\Users\jiang\code\shangan-ya-captain`，当前 commit `203e7ccc972502ec23091c1b3d3478e404b41ece`（`feature/orchestrator-agent`）。本机已有两项未提交改动（`evidence/first-prize-v5/prove_existing.py`、`learning-agent/test_guidance_browser.cjs`）；本轮没有覆盖、重置或提交这两项改动。
- 为审查队长文档另建独立 Git worktree，避免切换或改写原工作目录。

### 本轮实测（2026-10-25 本机 Windows / Python 3.13.11 / Node 24.16.0）
- `python -m unittest discover -q`：**93 tests passed**，退出码 0。
- `node test_team_browser.cjs`：**9 checks passed**，`browserErrors=[]`。
- `node test_guidance_browser.cjs`：**9 checks passed**，`browserErrors=[]`；覆盖 live-provider 边界、诊断位置/版本、非法版本拦截、待复核状态与证据版本保留。
- `node test_dispatch_browser.cjs`：**7 checks passed**，`browserErrors=[]`；覆盖预览确认、重新诊断、Live/模拟区分与移动端。
- `node test_period_browser.cjs`：**9 checks passed**，`browserErrors=[]`；覆盖容量、突发扣减、撤销恢复、版本保留与移动端。
- 浏览器受控夹具合计 **34 checks passed**。以上是工程/夹具测试，不计为真实模型质量或真人收益。

### 仍然阻塞的验收
- `python evidence/first-prize-v5/prove_existing.py` 重新运行仍以退出码 1 失败：`learning-agent/learning_agent.py` 与 `provenance.json` 固定源 SHA 不一致。不得改写旧 SHA 伪造复现；应为当前 commit 新建版本化 manifest 和结果。
- 两类真实作品（数智助老、湘匠织秀/湘秀未来）的冻结原件、至少各 3 条原文定位 gap、差异化行动卡、独立执行真实 V2、独立复核记录，本轮均未完成或未发现可直接用于正式验收的冻结证据。
- 至少 10 份真实材料的真实模型请求/响应、trace、错误处理与稳定性记录仍为 `NOT RUN`；真人对照的四项指标仍为 `NOT RUN`。本轮未读取或输出任何模型密钥，也未把 mock/fixture 算作 live pass。

### C/队长当前结论
- `ENGINEERING_PASS`：当前工作目录的 Python 93 项 + 浏览器 34 项通过（需在目标集成分支再复跑）。
- `LIVE_MODEL_PASS`：`NOT RUN`。
- `REAL_ARTIFACT_PASS`：`NOT RUN`。
- `HUMAN_LOOP_PASS`：`NOT RUN`。
- 最终审批仍为 **BLOCKED / NOT_VERIFIED**。

### 下一动作
1. A 提交两类原始作品的冻结版本、hash、原文 locator 与至少 3 条 grounded gap。
2. B 只依据 A 已核验 gap 制作两组实质不同的行动卡，明确产物与验收条件。
3. C 以当前 commit 生成新的可复现工程 manifest；在模型已安全配置且真实材料获授权后，运行 10 份 live 测试并保留去敏后的请求/响应证据。
4. 安排非作者独立执行、交付 V2、冻结判据复核、失败项重排与四项用户对照；缺证前不放行。
