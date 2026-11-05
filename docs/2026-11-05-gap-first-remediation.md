# Gap-first remediation — 2026-11-05

## Scope
按《上岸鸭最新案例库 ABC 三人交互合并批注版》P4、P9 和视频式工作流要求，先修后端缺口，不先改页面布局。

## Confirmed defect
旧项目的 B 规划入口将缺少 current_locator/current_artifact 降级为 warning。对于部分未启用 artifact_storage_required 的项目，这会允许证据锚点不完整的 Gap 进入 B。

## Fix delivered
- verified / evidence_linked_pending_confirmation Gap 必须具备 current_artifact（artifact_id + artifact_version）、current_locator、current_evidence、target_result。
- 引用 reference 类型来源时必须提供 reference_locator。
- unknown / blocked Gap 不得夹带 micro_steps 进入 B；必须补证据并重新诊断。
- demo_fixture 明确作为模拟夹具并被拒绝进入真实 B 生产规划，不得被冒充为真实材料诊断。

## Code changes
- learning-agent/team_handoff.py
- learning-agent/test_handoff.py

## Validation
- A/B/C 核心流程定向回归：55 项通过；加入 4 项证据门测试后，handoff 专项 17 项通过。
- 全量 Python 回归：421 项通过。
- Python 编译检查和 JS 语法检查通过。
- 浏览器 E2E 未运行：本机缺少 Playwright。
- 本机没有 Docker Engine；BGE-M3、Qdrant、Reranker、PostgreSQL、Redis 的生产连通性未验收。
- 原始 27.8 秒视频文件没有在当前仓库目录找到；目前只核对视频参考链接和 PPT 的逐页交互批注。

## Next acceptance gate before UI polish
1. 确认真实 API 与 Worker 使用同一持久化数据库和项目版本。
2. 真实模型完成材料读取、定位、诊断；对真实项目抽查 3 条 Gap。
3. B 生成九字段行动卡，非编卡者照卡执行并提交 V2。
4. A 独立读取 V2，逐项 PASS/FAIL/UNKNOWN。
5. 只对 FAIL/UNKNOWN/remaining 重排，保留已通过成果和历史。
6. 在 team.html 按视频顺序跑桌面/移动浏览器 E2E 后再做视觉交互调整。

No production deployment, PR merge, database reset, or destructive operation was performed.
