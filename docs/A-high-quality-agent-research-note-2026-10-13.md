# A 同学批注｜先去抖音、小红书和全网找高质量 Agent，再回来诊断我们作品

更新：2026-10-13

## 先说明：产品方向不改

我们的智能体仍然只解决这个问题：
**面向比赛、科研、创新实践，把“我要参赛/做科研/做项目”这种宏观目标，结合真实规则、当前作品、个人能力和时间，拆成非常细、马上能执行的小动作；做完后继续读取新版成果，只调整剩余问题。**

不要把项目改成万能人生助手，也不要为了显得高级去堆第 4 个、第 5 个 Agent。

---

## 给 A 的新增任务：先做一次“高质量 Agent 作品研究”

你不要只搜“Agent 是什么”，而是去抖音、小红书、GitHub、官方技术博客和真实产品里，找**已经体现真实执行能力**的 Agent 作品。重点看它们为什么不像 Demo。

### 1. 抖音：重点找真实工程型 Agent

本轮已经核实到的公开案例，可作为第一批样本：

- MiniCode（抖音，VibeCoding 大赏）
  - 链接：https://www.douyin.com/video/7647093315363491114
  - 值得拆：MCP / Skills 兼容、后台任务、会话级历史、多层上下文压缩、多语言实现。
  - 不要只记“功能很多”，要回答：这些能力分别解决了什么真实执行问题？

- Pi Durable Agent 实操（抖音）
  - 链接：https://www.douyin.com/video/7693717908941278490
  - 值得拆：SQLite 持久化、Tools、Skills、真实 bash/read 调用、长任务中断后 resume() 恢复。
  - 重点：这类“中断后继续”才是我们总调度需要借鉴的，不是多画一个流程图。

- MCP 与 A2A 架构边界（抖音）
  - 链接：https://www.douyin.com/video/7671212291295500649
  - 值得拆：工具调用和 Agent 间协作不是一回事；真实项目还要看权限、上下文、审计、异常处理。

### 2. 小红书：不要只看“教程笔记”，重点看真实 Agent 能力标准

公开可索引的小红书内容中，平台自己的 Agent 工程岗位和 AgentSphere 能力描述很有价值，可先作为工程校准：

- AI Agent 工程师：强调深度理解、自主规划、工具使用、长期记忆、持续迭代，以及真实业务的数据-评测-迭代闭环。
  - https://job.xiaohongshu.com/campus/position/22018

- Product Engineer（Agent）：强调“从回答问题走向判断事实并推动问题办结”，同时要求知识检索、工具调用、任务规划、效果评估。
  - https://job.xiaohongshu.com/campus/position/22481

- Agent Infra / AgentSphere：明确 Model、Harness、Context、Tool、Data、Execution Architecture 共同决定效果，并且要形成 Build → Evaluate → Gate → Release → Run → Observe → Evolve 的生产闭环。
  - https://job.xiaohongshu.com/campus/position/22062

注意：如果小红书具体笔记正文抓不到，就标“未读到正文”，不要把搜索摘要当原文。下一步可用浏览器真实打开小红书，再逐条记录。

### 3. GitHub / 全网：找可以复现、可以验证的项目

不要只看 Star 数。优先找这些特征：

- 有真实工具调用，而不是假按钮；
- 有持久状态 / Memory；
- 有中断恢复；
- 有 Trace / trajectory；
- 有 Evals；
- 有失败处理；
- 有可复现的测试或 benchmark；
- 有真实产物，不只输出一段文本。

可以重点看“Agent harness / orchestration / memory / eval / benchmark”类项目，比较它们如何证明自己不是 Demo。

---

## A 每找到一个优秀 Agent，必须按这个表提取，不许只写摘要

### 【案例卡】
- 作品名：
- 来源平台：抖音 / 小红书 / GitHub / 官方博客 / 产品
- 链接：
- 解决的真实问题：
- 用户是谁：
- 输入是什么：
- Agent 真的做了什么动作：
- 调用了什么 Tool：
- 有没有持久状态 / Memory：
- 有没有失败恢复 / resume：
- 有没有 Trace：
- 有没有 Eval：
- 有没有人工确认：
- 最终产生了什么真实产物：
- 为什么它不像 Demo：
- 哪一条适合我们：
- 具体应该改我们哪个文件 / 页面 / API：
- 哪一条不适合我们（不要硬抄）：

---

## A 的研究结果最后必须回到我们当前作品

不要研究完就结束。每个外部案例都必须落回到当前上岸鸭：

### 示例
外部作品：Pi Durable
观察：长任务中断后可以 resume。

不能只写：
“我们也应该增加持久化。”

必须写成：
“当前 C 总调度在 `EXECUTING` 阶段如果服务退出，下一次启动需要恢复同一个 project_id、artifact_version、current_stage 和 remaining_issue。对应检查 `learning-agent/team_orchestrator.py` 与持久化层；验收为：执行到一半主动重启服务，重新打开后仍停在同一任务，而不是重新生成计划。”

外部作品：MiniCode
观察：支持 Skills、后台任务、会话级历史和上下文压缩。

落到我们：
“不要为了名词照搬 Skills。先检查我们的 A/B 是否存在稳定 Tool Contract：read_artifact / diagnose_gap / generate_micro_steps / review_artifact / replan_remaining。若上下文开始过长，再补项目级摘要压缩，而不是一开始堆框架。”

---

## A 本轮交付物

1. 至少 10 个高质量 Agent 案例卡：抖音 ≥3、小红书 ≥3、GitHub/官方 ≥4。
2. 从 10 个案例中归纳“高级 Agent 不像 Demo”的 5 条共同标准。
3. 用这 5 条标准检查我们当前 V1，各给出：`已有 / 不足 / 无证据`。
4. 最终只挑 3 个最值得本周落地的改动，不许一次堆 20 个技术名词。
5. 每个改动必须定位到：具体文件 / 页面 / API / 状态 / 验收方法。

### 放行条件
如果最后交付还是“加强技术、增加记忆、增加工具、优化交互”这种泛话，不通过。
只有能回答下面三个问题才算通过：
- 优秀作品哪一处值得学？
- 为什么适合我们这个比赛/科研微行动场景？
- 具体改我们哪里，改完怎么验证？
