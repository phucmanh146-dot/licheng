# 终止实验与代码位置批注

版本：PR35 / 7afaa4d。以已上传作品的证据链缺口设计场景；未虚构访谈或V2。实验状态是隔离构造，不是模型输出或真实作品达标证明。

## A：产物与复核（team_intervention.py:129）
A｜诊断/复核批注：新文件与引文通过这里只能证明产物存在，不能证明它补上原差距。当前测试已确认产物只进入 output_pending_review；请为真实V2补充“新文件但不支持原结论”的反例，要求A按原验收标准逐项给通过/未通过/未知，并核对原文位置。没有这一步，不得把省奖参考的说服力迁移成自己作品已达标。

## B：首步与执行（team_intervention.py:45）
B｜行动/执行批注：此处1—5分钟只校验成员估时；重跑测试确认6分钟被退回，但没有证明真人能在5分钟内启动。请将首卡绑定现有材料中的一个证据核对动作，单独记录实际开始时间、首次有效产物时间和失败路径；两轮无产物转求助，不要用填写估时替代执行效果。

## C：终止条件（team_intervention.py:162）
C｜闭环终止批注：独立11场景实验中，未完成/待复核/未知/旧版本/无确认均被阻止；但直接构造“任务completed、差距closed、applied_review_ids=['unverified-review-id']”而没有A回执，report仍给 ledger_complete_quality_unverified。quality_verified始终false，未证明HTTP绕过。建议终止摘要逐个核对review ID存在、来源A_handoff、当前诊断/计划/真实V2版本、逐项判据结果及人工确认配对，并对伪造/旧回执加回归；目前不能将该状态呈现为目标已达到。

## 本轮结果与复现
- 12项干预工程测试重新通过：在learning-agent目录执行 python -X utf8 -m unittest -v test_intervention；2.613秒，真实HTTP包含200及旧版本409。
- 新增11组隔离状态实验：项目根目录执行 python -X utf8 work/terminal_experiment.py。10组缺口场景均not_complete；1组伪造账本给ledger_complete_quality_unverified，quality_verified始终false。逐场景结果见terminal-experiment-20261023.json。
- 独立数据无修改真实作品项目；伪造账本是直接内存注入，尚未证明正常HTTP能产生该状态。
- Computer Use连接可用，已确认可用窗口；未将电脑控制连接成功记作产品流程测试。

## 目标闭环
真实V1与参考定位 → A差距/未知项 → B采用绑定版本和验收标准的动作 → 真人执行并提交V2 → A按原判据复核 → 人工确认 → 更新差距并仅重排剩余项。只有当前证据支持全部目标判据，才可讨论达标；参考案例奖项、任务完成或休息结束均不能代替该条件。仍无真实模型及真人V2证据，本轮只验证工程终止门槛。
