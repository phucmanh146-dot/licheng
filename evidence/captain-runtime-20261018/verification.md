# 队长运行机制工程核验记录

核验日期：2026年10月18日（本轮用户日期）。关联Issue #7。代码候选分支：feat/captain-runtime-20261018。

## 输入与范围

- 本轮读取Issue #7正文及全部16条评论。
- 本地读取用户上传《上岸鸭_新版PRD与总调度_20261017(3).html》及《上岸鸭_新版PRD_任务接续与状态调度_20261017(3).docx》，没有通过文件库重新读取附件。
- 代码基线：PR #22 5aa5c817a63cb422232c82b469d135ebe706c58b；集成PR #21 32f68654a6cd59a31f442e5fb3c9b008d84eab7e。
- 在隔离worktree修改，原有未提交工作保留。

## 已取得的工程结果

### 09:24追加核验：C复核与阻塞交接

新增`test_captain_review_gates.py`，5项检查。修改前复现：直接批准跳过A收件、旧计划复核仍可批准、人工确认缺review_id，以及首次预览/已有计划重排将缺微动作的blocked改为candidate后校验失败。修改后实际输出：

```text
Ran 227 tests in 9.521s
OK
```

新HTTP检查验证：未收A复核时feedback approve返回400，项目版本和pending_review不变；review-receive返回200且仍待确认；人工确认后保存准确review_id，状态进入待处理剩余问题。版本变更拒收、接收当前新复核后的恢复，以及两类blocked预览/采用/禁止开始均通过。

`team.js`语法、相关Python文件py_compile与Git差异检查通过。旧任务接续夹具补上A实际复核收件，未放松生产验收。模型答复受控，不是实际用户成果。

### 最终双环境与Chrome结果

验证提交：`5aa6e6455f0eddb18e25a868b6ab495896152a06`，代码树`8fd9b31b4ad47ab02d13e7252f2516921fb79a36`；后续补交只更新文档。本地全套227项再次通过9.461秒。用户Windows独立检出同一GitHub提交，实际读取保存日志与结果JSON确认：

```text
Ran 227 tests in 27.655s
OK
tests_exit_code: 0
syntax_passed: true
```

Windows首次失败的环境原因已定位：C盘可用空间0导致SQLite/临时文件建库失败，改用D盘`captain-qa-20261018/temp`及独立data目录；随后独立进程恢复检查的中文stdout编码不一致，已在`test_captain_runtime.py`对子进程显式指定`-X utf8`，保留原恢复内容和断言后复验通过。未删除用户文件，临时环境变量仅作用于测试进程。日志为`captain-windows-review-verification-D-final.log`，结果为`captain-windows-review-result.json`。

同一Windows提交，Chrome独立配置与19019端口独立数据服务实际取得：

| 状态 | DOM与API实际结果 |
| --- | --- |
| pending，未收A结果 | “等待新版复核 · 已验收0 · 待复核1”；验收通过按钮disabled |
| ready，收到当前A结果 | 仍待复核1；验收通过按钮启用，未自动完成 |
| confirmed，调用人工确认接口 | 保存controlled-review编号；“处理剩余问题 · 已验收1 · 待复核0”，原验收按钮消失 |

读取进程回执含`CAPTAIN_BROWSER_REVIEW_PASSED`、退出码0，实际用时8.64秒；结果写入`captain-browser-review-result.json`。夹具目标明确为“工程验收夹具：复核门页面验证（非真人科研成果）”。这验证页面渲染、真实HTTP与SQLite状态响应；人工确认由API发送，未冒充真人按钮操作、真实模型语义或科研V2。早前19018端口页面也已补读到“先补齐本轮材料”，原超时只是当时未取得回执。

### 早前四机制基线

最终本地组合命令：python -m unittest discover -q。实际输出：

```text
Ran 222 tests in 6.883s
OK
```

JavaScript：node --check team.js、team-recovery.js、team-runtime.js通过。Python相关文件py_compile和git diff --check通过。

### 用户Windows独立复现

- 设备：江月的诗；采用新的独立Git检出，没有覆盖原工作目录。
- 目录：`D:\HuaweiMoveData\Users\jiang\Desktop\shangan-captain-runtime-20261018`。
- 实际检出的Git提交：`2b8be89c1398aaed6e863a73715f05480085f15a`；对应经过本地验证的代码树 `9989f7902e60ede39d2f95815fca4e9199a87e93`。后续本轮补交只更新核验说明。
- 命令：在learning-agent执行 `D:\python\python.exe -X utf8 -m unittest discover -q`。
- 已另起命令读取保存的captain-windows-verification.log，确认以下实际结果；没有只凭进程启动判定通过：

```text
Ran 222 tests in 28.714s
OK
```

- `C:\Users\node.exe --check` 检查team.js、team-recovery.js、team-runtime.js，取得 `CAPTAIN_WINDOWS_SYNTAX_PASSED` 回执。
- Windows PowerShell会将原生程序的stderr包装为NativeCommandError/RemoteException；原生测试日志末尾为OK，脚本已改用退出码与保存的日志核对结果。
- 浏览器检查命令选择独立Chrome配置目录和19018端口，并拟验证真实API创建的空项目入口。仅取得脚本语法通过的启动输出；后续进程输出和只读日志核对命令均远程超时，尚未读到DOM或后续服务健康结果。没有把启动命令、空项目或受控测试算为真人科研成果，也未宣称网页实际操作通过或服务仍在线。

| 边界 | 实际证据 | 范围 |
| --- | --- | --- |
| 静态入口→服务 | GET team.html、team-recovery.js与team-runtime.js返回200 | 静态资源及脚本语法；没有冒充浏览器实际点击 |
| API→SQLite | 保存现场、记录尝试、显式会话确认，经HTTP可重新读取 | 受控材料字节与实际SQLite |
| 新会话→准确现场 | recover先返回未关联候选；confirm后读到同一checkpoint、action与原文 | 不开始任务、不改变项目版本 |
| 并发与隔离 | 旧版本confirm返回409；同名artifact另项目原文不混入；旧诊断焦点失效 | 确定性防护，不是多租户认证证明 |
| 工具与循环 | 实际SQLite保存failed/blocked记录；重复read在有限轮数内终止 | 受控工具故障与模型输出 |
| 重试与上下文 | 完整messages每次检查；第二次请求不重复全套原文；超限不调用模型 | 字符预算，不是token计费或模型质量 |
| 进程恢复 | 新Python进程读同一SQLite，找到原checkpoint与blocked状态；包含在本地与Windows各自通过的222项中 | 两个环境分别运行工程夹具，没有迁移用户真实科研数据 |
| 成果保护 | 提交准确V2仍pending_review，保留提交版本和原动作 | 不以按钮/找回动作自动验收 |

新增测试在test_captain_runtime.py，共17项。现有跨会话测试更新为“明确确认后才关联”；现有卡点测试使用行动卡的实际step_id，保留对伪造ID和旧版本的拒收测试。

## 未取得的验收

- 真实模型的模糊意图匹配、诊断准确性及失败后策略质量。
- 另一成员独立按卡完成真实V2、有效复核、人工确认与剩余计划采用。
- 保留集、同条件效果与真实用户试用。
- 完整人工点击流程与真实科研材料/模型演示；Chrome三状态DOM及API确认已通过，输入为工程夹具。
- 用户电脑长期运行与实际使用效果；独立检出、227项工程回归和三份脚本语法检查已通过，不再列为未知。
- main合并、公网部署及赛事提交。

工程夹具、HTTP检查与真实用户收益分别记账。上述未知项继续保留，不关闭Issue #7的真人闭环要求。
