# shangan-ya 未合并 PR 全量盘点（2026-11-04）

## 当前结论

截至本次盘点，仓库有 15 个 Open PR（包含本次创建的 #97）。其中只有 #96 已合并；#97 是本次科研个性化/Autoloop 集成的 Draft PR。其余 13 个历史 PR 分属不同目标分支，不能把 open 理解为都应直接合入 main。

本轮已完成：
- #96：手机号＋密码交互 Demo，1 个文件、95 行；head regression 检查通过，已 squash 合并到 main，merge commit 5f98aae12e4f6c40a46299faa1448dc8f9c30a69。
- #97：事件驱动 Runtime + 科研个性化 + AI 努力度量，已建立 Draft PR；当前分支相对 main 有大量历史差异，未做生产部署，不能直接合并。
- 开发分支本次新增的个性化与 AI 努力度量代码：GitHub Actions Run 41833617475 通过，22 项测试通过。

## Open PR 清单

| PR | 内容 | Head → Base | GitHub 状态 | CI/检查 | 建议 |
|---|---|---|---|---|---|
| #97 | Autoloop + 科研个性化 + AI ROI | feature/agent-rag-rerank-20261102 → main | Draft；当前可合并性/状态需复查 | Run 41833617475 成功 | 保持 Draft；先做 main 差异整合、全量回归和生产验收 |
| #95 | 微信小程序手机号注册、密码登录、旧账号迁移 | feature/phone-first-miniapp-v8 → fix/v10-preserve-ui-ddl-energy-planner | Draft；clean | 无检查 | 不能只凭 clean 合并；需真机、服务端认证、旧账号迁移与安全测试 |
| #92 | V10 对话式 AI 教练 | feat/v10-conversational-ai-coach → captain/80-point-evidence-closeout | clean | 1 项成功 | 可在目标分支验证后合入；不是直接合 main |
| #91 | 跨会话恢复版本保护与验收 | captain/80-point-evidence-closeout → main | clean | 1 项成功 | 需确认与 #92 的先后关系、主线完整回归后再合入 |
| #83 | 将 main 同步到 feature/orchestrator-agent（反向 PR） | main → feature/orchestrator-agent | clean | 2 项成功 | 方向是 main → 功能分支；仅在确认该分支仍需同步时合入，不是向 main 发布 |
| #78 | 红色 DDL 警报与近期目标 | feat/v10-red-ddl-goals-need-decision → fix/v10-preserve-ui-ddl-energy-planner | dirty（冲突） | 无检查 | 先解决冲突并回归，不合并 |
| #71 | EnergyFlow 与工作台去重整合 | fix/energyflow-dedup → feature/source-task-center | clean | 1 项成功 | 与 #66/#63/#60/#53 同目标分支；需先做组合回归 |
| #66 | 任务关联 AI 安全接入 | feat/task-linked-ai-safe-integration → feature/source-task-center | dirty（冲突） | 1 项成功 | 先解冲突；和 #71 等重叠文件需统一整合 |
| #64 | V8 能量自适应工作台 | feature/energy-adaptive-v8 → main | dirty（冲突） | 无检查 | 不可直接合并；需重新基于 main 整理差异 |
| #63 | V9 精力自适应与 AI 辅助 | feat/comfort-energy-ai-v1 → feature/source-task-center | Draft；clean | 1 项成功 | 先与 #71/#66/#60/#53 统一文件版本并做组合回归 |
| #60 | V9 任务监测与服务端 AI 备忘解析 | fix/v9-comfort-ai-memo-monitor → feature/source-task-center | Draft；dirty（冲突） | 无检查 | 先解决冲突和服务端集成测试 |
| #53 | 经验型任务估时与精力校准 | codex/adaptive-energy-calibration → feature/source-task-center | Draft；clean | 无检查 | 需补自动化测试并与 #71/#66/#63/#60 组合验证 |
| #39 | 综合工作台、AI 接入与微信历史流程 | feature/workbench-integration-v8-1 → feature/wechat-history-crawler-v8 | clean | 无检查 | 依赖目标分支版本；先核对 #38 的基础变更并做浏览器回归 |
| #38 | 微信历史增量采集与启动修复 | feature/wechat-history-crawler-v8 → feature/linked-task-ai-v7 | dirty（冲突） | 无检查 | 先解决冲突、隐私授权与采集回归，不合并 |
| #34 | Action Planner Agent | feature/action-planner-agent → feature/diagnosis-research-agent | clean | 无检查 | 补 planner/依赖/浏览器测试后再合入目标分支 |

## 为什么不能“全部点合并”

1. 这些 PR 的 base 并不都是 main；很多是堆叠分支，合入顺序会改变结果。
2. #71/#66/#63/#60/#53 多个 PR 同时修改 V8/V9 同一工作台文件，单独 clean 不代表组合后没有覆盖。
3. #38/#39 是微信采集与工作台整合的分支链；基础分支存在冲突时，不能把上层 PR 当作独立发布。
4. #95 是小程序认证与旧账号迁移，不能以浏览器 Demo 代替服务端安全和真机验收。
5. #34/#39/#53 等没有可核验的自动化检查；没有失败记录不等于测试通过。

## 推荐合并顺序

1. **先处理分支链**：#34、#38/#39、#71/#66/#63/#60/#53、#92/#91 分别在各自目标分支上建立集成候选，不跨链强行合并。
2. **同一工作台只保留一个最终 writer**：先比较 #71/#66/#63/#60/#53 的文件差异，按功能优先级把所需改动合成一个候选，再跑完整浏览器回归。
3. **冲突 PR 单独修复**：#78/#64/#66/#60/#38 先解决冲突，不能用关闭冲突或强制覆盖的方式处理。
4. **main 发布只接受独立验收完成的集成 PR**：#91、#97 等先核对 main 当前版本、运行全量测试、浏览器 E2E、API/Worker 和部署。
5. **每次合并后重新跑测试**：上游分支测试通过不能替代合并后测试。

## 本轮未做的危险操作

- 没有关闭任何仍有价值的历史 PR。
- 没有强推分支、覆盖用户工作区或批量合并有冲突的 PR。
- 没有把测试缺失写成测试通过。
- 没有将 Draft PR 标为 Ready 或部署到 Railway。
