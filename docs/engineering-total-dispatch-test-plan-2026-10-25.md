# 上岸鸭工程总调度测试方案（可执行版）

更新日期：2026-10-25  
仓库：`phucmanh146-dot/shangan-ya`  
目标分支：`captain/real-artifact-gap-review-20261024`  
对应总调度：[team-total-dispatch-and-provincial-first-prize-acceptance-2026-10-25.md](team-total-dispatch-and-provincial-first-prize-acceptance-2026-10-25.md)  
核心目标：验证工程是否可复现、任务总调度是否守状态、私人定制是否真的因项目而异、真实 V1→行动卡→V2→独立复核能否闭环。

> 本文是测试执行单，不是测试通过声明。当前已有记录中的 36 项测试通过，只代表当时执行的 `test_agent.py` 与 `test_team.py`；每次改代码后必须按当前 commit 重跑。

## 0. 开始前的安全规则

1. 不直接在 `main` 上做实验；使用当前任务分支或独立测试分支。
2. 先看工作区，若有未提交修改，先备份/提交到个人分支或记录 diff。禁止 `git reset --hard`、强制覆盖、清理用户文件。
3. 不将 API Key、Authorization 头、用户隐私、未授权原始材料提交到仓库。
4. 不删除 provenance/hash 校验来让脚本通过；校验失败本身就是测试结果。
5. 每次报告必须记录 commit、分支、输入材料版本、命令、退出码、日志和复核人。

## 1. T0：工程基线与 provenance（队长 C，先做）

在 Windows PowerShell 中进入仓库根目录（不要照抄示例路径，先定位你实际的仓库路径）：

```powershell
git status --short --branch
git rev-parse --show-toplevel
git rev-parse HEAD
git branch --show-current
git diff --stat
git diff --name-only
```

再检查本轮关键文件：

```powershell
Test-Path .\learning-agent\learning_agent.py
Test-Path .\evidence\first-prize-v5\provenance.json
Get-FileHash .\learning-agent\learning_agent.py -Algorithm SHA256
git rev-parse HEAD:learning-agent/learning_agent.py
```

说明：工作区 SHA256 与 Git blob SHA 不是同一种编码，不能直接拿两个字符串判定相等；前者用于记录工作区文件，后者用于锁定提交对象。provenance 脚本会做其自身定义的 Git blob 校验，应以脚本的实际输出为准。

**通过条件：** commit、分支、工作区改动、关键文件存在性和输入版本已记录。  
**阻断条件：** 不知道当前目录/分支、工作区改动未保存、provenance 指向旧版本或文件缺失。此时只查原因，不跑会覆盖文件的操作。

## 2. T1：先跑已有单元测试

```powershell
Set-Location .\learning-agent
python --version
python -m unittest -v test_agent.py test_team.py
$LASTEXITCODE
```

**预期：** 退出码为 `0`，记录实际测试数、失败数和完整终端日志。历史记录为 36 项通过，但当前结果必须重新取得。  
**若失败：** 保存完整报错，记录首个失败测试、异常、文件与行号；不允许删断言或吞掉异常来制造绿灯。

然后确认项目中是否还有其他测试文件，再决定是否扩展测试范围：

```powershell
Get-ChildItem -Recurse -File -Include test_*.py,*_test.py | Select-Object -ExpandProperty FullName
```

不要未经检查就假设全仓库测试只有这两个模块。

## 3. T2：复现工程证据脚本

回到仓库根目录：

```powershell
Set-Location (git rev-parse --show-toplevel)
python .\evidence\first-prize-v5\prove_existing.py --output .\evidence\runs\engineering-proof-local.json
$LASTEXITCODE
```

**预期：** 只有在当前分支所需的 provenance 和固定源码快照匹配时才通过。成功输出中的 `status=engineering_checks_passed` 只表示该脚本覆盖的工程检查通过；脚本也明确将 `live_model_evaluation`、`user_study` 标为 `not_run`，不能宣传成真实模型或用户效果通过。

**若失败：**
- 保存完整 traceback 和当前 commit；
- 核对 `evidence/first-prize-v5/provenance.json` 是否存在、`input_commit`、`module_blobs` 与当前源码是否对应；
- 逐项比较文件路径和 Git blob，不要改成“跳过校验”；
- 由队长决定重建当前版本的 provenance，重建后从 T0 开始重跑。

## 4. T3：总调度状态与异常测试（A/B/C 共同验收）

用真实代码和明确的测试夹具逐项执行，保存每个 case 的输入、预期和实际结果。

| Case | 输入/操作 | 预期行为 | 失败判定 |
|---|---|---|---|
| DIS-01 缺少真实诊断 | A 未给来源定位或 gap_id | B 任务进入 `blocked/unscheduled`，列出缺少字段 | 系统生成泛化行动卡并声称可执行 |
| DIS-02 缺少 micro_steps | 诊断只有摘要，没有操作步骤 | 不放行到真人执行；要求补充具体操作 | 只有“继续完善/优化一下”仍显示通过 |
| DIS-03 版本不匹配 | 行动卡引用旧 V1，实际输入已更新 | 拒绝执行或要求重新诊断 | 把旧 gap 直接用于新版本 |
| DIS-04 已完成任务保护 | 排程时插入紧急任务/减少当天时间 | 已完成任务、证据和历史记录不变 | 完成项被重排、覆盖或删除 |
| DIS-05 模型失败 | 使用无效模型 ID/不可用服务 | 明确失败状态和脱敏错误，允许重试/替代路径 | 返回固定成功文本或静默切换模型 |
| DIS-06 任务中断恢复 | 执行中断后重启/恢复会话 | 恢复已保存状态，提示下一步和未完成项 | 丢失已完成结果或重复执行已确认动作 |
| DIS-07 人工复核门 | B 提交 V2，但 A 未复核 | 状态保持 `pending_review` | 自动标记闭环完成 |
| DIS-08 复核不通过后重排 | A 对一项判 `fail`，其他项通过 | 仅重排失败/未解决项，保留通过项 | 全量重置计划或覆盖通过项 |
| DIS-09 重复提交 | 同一 V2/同一任务重复提交 | 幂等或给出明确冲突状态 | 重复生成多个“已完成”记录 |
| DIS-10 容量与截止期冲突 | 减少可用分钟或缩短截止日 | 超出容量的项显式未排程，给出缺口分钟 | 超容量安排却显示全部可完成 |

**注意：** 这些是必须执行的用例规格，不代表当前所有用例都已经有自动化测试。先映射到现有测试/函数；缺失的用例要新增测试或人工验收记录，再写结论。

## 5. T4：私人定制差异测试（本项目的核心验收）

至少使用两个真实材料包：湘匠织秀和无界智泊。输入相同版本的上岸鸭代码，分别固定目标、阶段、用户能力、可投入时间、现有成果和限制条件。

每个样本保存：
- 原始材料及哈希（如有版权/隐私限制，保存脱敏版本与来源定位）；
- 目标标准和当前阶段；
- Agent 识别的 gap、每条 gap 的原文 locator、未知项；
- 第一张行动卡：具体打开什么、改哪里、如何做、交付什么、怎么自检、失败怎么办；
- 预计耗时、真实耗时、卡点与产物；
- V1/V2 差异及独立复核结果。

**差异通过标准：**
1. 湘匠织秀若缺的是授权/报价/样品/交付证据，首步应落在具体证据核查或交易链验证上，而不是泛泛优化 PPT。
2. 无界智泊若缺的是预约冲突/离场/结算状态验证，首步应落在可复现的状态转换用例上，而不是泛泛做用户调研。
3. 若真实材料显示的缺口与以上假设不同，必须按材料改写首步；不得为了符合示例而强行认定项目缺口。
4. 同一提示词下的两份输出不必完全不同，但 gap、第一步、交付物和验收标准必须能解释为由真实材料和目标决定。
5. 找一名没有参与行动卡编写的人，只给他输入材料和行动卡；记录是否能不靠口头解释完成任务。

**失败标准：** 两个样本输出基本相同的通用建议；gap 无原文定位；建议依赖不存在的功能；无法产生可检查产物；把计划或模拟数据写成真实效果。

## 6. T5：真实模型与真实资料测试（仅在安全配置完成后）

- 确认模型供应商、官方 API 地址、模型 ID 与后端代理配置；密钥只保存在安全配置/环境变量中。
- 用固定问题完成一次真实对话，保存时间、commit、模型 ID、输入哈希、响应摘要、耗时和脱敏错误码。
- 上传一份无敏感信息的小型真实 PDF/Word/Markdown，要求指出一个段落的准确位置；人工回到原文件核对。
- 用无效模型 ID 或错误配置测试失败路径；不得静默回退到 mock。
- 不把完整 Key、Authorization header 或敏感请求体写入日志、截图或 GitHub。

**通过条件：** 至少一次真实对话与一次真实资料定位通过，并可复现。模型连通只通过 `LIVE_MODEL` 子门，不代表真实作品或真人闭环通过。

## 7. T6：真人 V1→V2 闭环（最终关键门）

```text
冻结 V1 + 目标判据
  → A：真实证据 gap（每条带 locator）
  → B：逐 gap 行动卡（具体操作/产物/自检/失败下一步）
  → 非行动卡作者的执行者完成修改
  → 保存 V2、diff、耗时、卡点
  → A：不看作者自评，按原判据独立复核
  → B：只重排 fail/unknown 项
  → 队长检查状态、版本与证据是否一致
```

每个状态必须可追溯：`diagnosis_ready`、`action_ready`、`in_progress`、`pending_review`、`pass/fail/unknown/blocked`。实际枚举以代码为准，若命名不同，在报告中注明映射，不要只为文档强行改代码。

**放行条件：** 至少一个真实项目完成完整闭环，V1/V2、差异、执行记录、A 的独立复核和只重排剩余项均存在；第三人能按文档重现主要步骤。

## 8. 汇报记录模板

```text
case_id：
负责人/角色：
仓库/分支/commit：
输入材料版本/哈希：
目标标准：
执行命令或调用方式：
预期结果：
实际结果：
退出码/HTTP 状态：
日志/产物路径：
V1/V2 与 diff：
复核人及结论：
状态（pass/fail/unknown/blocked）：
失败原因与下一责任人：
```

## 9. 总调度放行标准

- `ENGINEERING_PASS`：当前 commit 下相关自动化测试可复现通过，provenance 一致，失败日志可追溯。
- `ORCHESTRATION_PASS`：缺证据会阻断，版本冲突/模型失败/重启/容量冲突按预期处理，已完成成果不被覆盖。
- `PERSONALIZATION_PASS`：至少两个真实项目的 gap、首步、交付物和验收标准体现材料驱动的差异。
- `LIVE_MODEL_PASS`：真实模型调用与真实资料定位有证据。
- `REAL_ARTIFACT_PASS`：有真实 V2 和独立内容复核。
- `HUMAN_LOOP_PASS`：非作者执行者完成任务，A 独立复核，B 只重排剩余项。
- `AWARD_READINESS`：必须在上述证据齐备后另行评审；任何工程测试数量都不能直接推出获奖概率或“达到省一”。

任何一层未通过，就保留相应状态，不用综合分掩盖阻断项。


## 10. 已执行的现场验证记录（2026-10-25）

执行设备：Desktop Commander 连接的 Windows 工作副本  
本地路径：`C:\\Users\\jiang\\code\\shangan-ya-captain`  
**注意：本次本地代码与本文目标分支不是同一个 ref，且工作区存在未提交修改；以下结果只属于本地 HEAD，不代表 GitHub PR #42 的 head 已经通过。**

### 10.1 本地单元回归

- 本地分支：`captain/contest-conversion-20261025`
- 本地 HEAD：`12adc0a1520d1a89587a1761b5293938e1b8c2e1`
- 工作区状态：存在未提交修改 `evidence/first-prize-v5/prove_existing.py`、`learning-agent/test_guidance_browser.cjs`，以及未跟踪文件 `docs/AB-acceptance-2026-10-25.md`、`evidence/first-prize-v5/report/acceptance-engineering-20261025.txt`。
- 命令：在 `learning-agent` 目录运行 `python -m unittest -q test_agent.py test_team.py`
- 实际结果：**36 tests passed，退出码 0**。
- 结论：`test_agent.py` 与 `test_team.py` 的这次回归通过；不代表真实模型、真实材料质量或真人闭环通过。

### 10.2 工程证据复现脚本

- 命令：`python .\\evidence\\first-prize-v5\\prove_existing.py --output $env:TEMP\\shangan-ya-engineering-proof-20261025.json`
- 实际结果：**失败，退出码 1**。
- 失败点：`source_audit` 检查 `learning-agent/learning_agent.py` 时触发 `Source differs from pinned input`。
- 结论：`ENGINEERING_PROOF_SCRIPT=blocked`。这不是通过；需要先比对当前文件、provenance 的 `module_blobs`、输入 commit 和工作区改动。禁止删除或跳过 SHA 校验。
- 未执行：本轮没有切换本地分支、没有覆盖工作区、没有修改本地未提交文件；也没有运行真实模型请求。

### 10.3 下一步

1. 队长先保存/确认上述未提交修改归属，避免切分支造成丢失。
2. 在本地确认 `git rev-parse HEAD:learning-agent/learning_agent.py`、`git diff -- learning-agent/learning_agent.py`、provenance 中对应 SHA 与 `input_commit`。
3. 在干净的目标分支工作副本中，重新执行 T0、T1、T2；测试报告中明确写出分支和 commit。
4. 只有目标分支的脚本复现通过，才可把该分支的 `ENGINEERING_PASS` 标为通过；36 项单测通过不得覆盖脚本失败状态。
