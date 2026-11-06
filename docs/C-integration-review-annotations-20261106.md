# C 侧总控与交互集成核查批注（2026-11-06）

## 1. 责任边界

本报告对应用户负责的 C 角色：队长/总控、工程集成、模型与工具接入、状态/事件/日志/恢复、统一交互入口与最终交付。

A 负责证据诊断与独立复核；B 负责行动卡、规划器、容量计划与真人执行。C 负责把 A/B 的交付接入统一项目与事件链，不代替 A/B 伪造业务验收。

## 2. 已进入 main 的工作（已核实）

| 项目 | GitHub 状态 | 口径 |
|---|---|---|
| PR #92 V10 对话式 AI 教练 | merged → main | 对话式任务教练接口及 V10 页面接入已进入 main；工程合并不等于真实模型配置/生产调用已验收 |
| PR #107 排期 Worker 日期测试修复 | merged → main | 日期无关测试夹具；本机 415 项 Python 测试、编译、21 个 JS 语法检查通过 |
| PR #106 C 侧工程收尾 | merged → main | 以 PR 合并记录为准；合并不替代真人项目闭环验收 |
| PR #105 PPT 优化排期 | merged → main | 以 PR 合并记录为准 |
| PR #103 A/B/C 统一闭环 | 已在此前 main 历史中合并 | 保留统一闭环及技术栈，不重复合并历史分支 |
| PR #102 B 链路 | 已在此前 main 历史中合并 | 先前记录的 B 链路 57/57 是工程测试，不等于真人 V2 完成 |

最新 main SHA（核对时）：`e6658f4cc0472841ec728b5318aa9c0056dbccea`。该提交对应的 Shared Agent regression 与 Agent Event Kernel 两个 GitHub Actions 工作流均为 success。

## 3. C 侧当前未合并项

### PR #108 — Cloud Agent Hub（当前 C 侧主交付）

- 分支：`feature/cloud-agent-hub-20261105`
- PR：`https://github.com/phucmanh146-dot/shangan-ya/pull/108`
- 24 commits / 14 files；相对 main 24 ahead / 10 behind。
- GitHub 返回 `mergeable=false`、`mergeable_state=dirty`；尚未合并，当前保持 Draft。
- 涉及：`cloud_hub.py`、Hub OpenAPI、Hub HTML/JS、浏览器桥接扩展、Shared API、Cloud Hub 测试、Universal Autoloop 设计与 Skill。

**修改批注**
1. 先同步最新 main，逐项解决冲突；不得回退 main 已合并的 PR #92 对话教练、共享事件内核和测试修复。
2. Cloud Hub 专项测试、主项目回归、Python/JS 语法检查全部通过后附 CI run 与 commit SHA。
3. 实测 Railway health、ChatGPT Action 配对、浏览器扩展配对、证据回传、任务 claim/lease、审批、幂等、执行回执、失败恢复。
4. Universal Autoloop 文档当前状态为“工程设计基线/待实现与验收”；没有运行证据的 Worker、checkpoint 恢复和外部工具执行器必须标 NOT_RUN/BLOCKED，不得标 LIVE。
5. Hub 交互逐项实测：未连接、已连接、待审批、排队、执行中、待证据、失败、恢复；每种状态要有真实接口响应或运行日志。

**放行条件**：冲突清零 + CI 全绿 + 生产健康检查 + Action/浏览器证据链真实通过。当前不能合并。

## 4. 其他未合并 PR 的逐项批注

以下 PR 均仍开放且为 Draft；它们的 base/head 属于较早的 V7/V8/V9/V10 分支栈，不能把整条旧分支直接并入当前 main。已在各 PR Conversation 留下修改批注。

| PR | 主题 | 修改/验收批注 | 当前状态 |
|---|---|---|---|
| #95 | V10 小程序手机号验证/密码登录/旧账号迁移 | 已修复 reset-password 倒计时语法；仍需同步当前 V10 基线，验收正式 AppID、真实验证码、密码/会话、迁移、真机登录/重置和体验版凭证 | Draft / 未合并 |
| #78 | 红色 DDL 警报/必要性判断/近期目标 | 补齐提醒→必要性判断→接受/延后/拒绝→三天倒排→固定时间块→15:00 未推进处理的完整交互和测试；保护原工作台导航 | Draft / 未合并 |
| #71 | EnergyFlow 去重与整合 | 只提取独有交互；统一任务 ID/状态源，消除重复入口，保留左侧导航和原页面层级 | Draft / 未合并 |
| #66 | Task-linked AI 安全集成 | 验证当前任务/材料版本/DDL/固定事务/历史尝试上下文，AI 结果回写正确任务，权限失败显示 BLOCKED | Draft / 未合并 |
| #63 | 精力感知舒适排期 | 验证精力/历史耗时/固定事务/DDL/缓冲联动；临时任务、超时跨日、疲惫处理、延后不等于完成 | Draft / 未合并 |
| #60 | 任务监控与 AI 备忘录 | 监控基于真实事件/耗时/证据；备忘录保留来源和原文；重复事件幂等；死磕预警给出可执行恢复动作 | Draft / 未合并 |
| #53 | 自适应耗时与精力校准 | 首次耗时与复做耗时分开；样本不足不预测；按任务类型/熟练度隔离；估时变化可解释；保护硬截止和睡眠 | Draft / 未合并 |
| #39 | V8 综合工作台 | 对照当前 main 提取独有交互；保留左侧导航；资料读取与关联本机任务分开；补齐微信授权/去重/恢复说明 | Draft / 未合并 |
| #38 | 微信历史增量采集 | 只提取 main 缺失功能；明确授权范围、游标、去重、附件状态、断点续传；不绕过平台权限 | Draft / 未合并 |

## 5. 分支状态核查

与当前 main 比较，以下历史职责分支没有 ahead commits，属于已落后分支，不应再直接合并：

- `feature/orchestrator-agent`
- `p1/integration`
- `feature/action-planner-agent`
- `feature/diagnosis-research-agent`

当前唯一发现仍有独立 C 侧提交待集成的是 `feature/cloud-agent-hub-20261105`（PR #108）。A/B 的旧职责分支应以当前 main 中已合并的实现和独立验收证据为准；不能因为分支存在就报告已完成。

## 6. 统一交互验收清单

按用户端实际点击顺序核验，不按文件是否存在判定：

1. 新建项目：目标、硬截止、交付物、执行人、版本冻结。
2. 导入材料：V1/官方标准/参考案例分类，读取状态、哈希、失败原因。
3. A 诊断：Gap、双边 locator、原文引用、UNKNOWN。
4. 证据门：证据不足显示 UNKNOWN/BLOCKED，不允许交给 B。
5. B 行动卡：九字段、micro_steps、产物、自检、估时、失败下一步。
6. 真人执行：开始/暂停/求助/恢复；求助自动带上下文和 checkpoint。
7. 提交 V2：新版本、SHA256、diff、证据清单。
8. 独立复核：复核者不是执行者，逐条 PASS/FAIL/UNKNOWN。
9. 结果页：PASS 锁定；FAIL/UNKNOWN/BLOCKED 返回 B 重排；版本与失败轨迹可追溯。
10. C 总控：project_id、artifact/version、task_id、action_card_id、event_id、checkpoint_id 一致；事件幂等、状态迁移有日志、失败可恢复。

## 7. 状态词典

- MERGED：GitHub 已合并到指定目标分支。
- CI_PASS：对应 commit 的 CI 已通过。
- DEPLOYED：生产部署记录可查且健康检查通过。
- LIVE_VERIFIED：真实模型/工具/浏览器链路有运行证据。
- HUMAN_V2_VERIFIED：真人执行产物 V2 可查。
- INDEPENDENT_REVIEW_PASS：非执行者逐项复核通过。
- NOT_RUN：尚未运行。
- BLOCKED：被权限/配置/依赖/冲突阻塞。
- UNKNOWN：证据不足，不能判定。

任何一个状态不得由另一个状态推断。工程合并不等于生产上线，CI 通过不等于真人闭环通过。
