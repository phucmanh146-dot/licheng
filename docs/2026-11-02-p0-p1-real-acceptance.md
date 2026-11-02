# P0/P1 真实服务与真实成果验收补强（2026-11-02）

## 不变的产品闭环

真实项目 V1 → 目标质量标准 → 原文证据诊断 → 个性化微动作 → 真人执行 → 真实 V2 → 非执行者独立复核 → 只对失败/未知项重新规划。模型草稿、演示数据、模型自评和自动化测试都不能代替真人 V2 或独立复核。

## 本轮工程改动

- Cross-Encoder 支持 Hugging Face TEI 的 `/rerank`（`texts` 参数）以及 Jina/Cohere 风格 `documents` 参数；真实服务没有响应时仍明确降级，不伪造 AVAILABLE。
- 增加 `engineering_health.py` 和登录保护的 `GET /api/v1/engineering/health`（Docker 生产入口）。普通探测区分已配置与真实可用；`?deep=1` 执行 BGE-M3 embedding 与 reranker 的真实推理探测。
- `compose.engineering.yml` 增加持久化 Ollama、BGE-M3 模型拉取、TEI BGE Reranker、Qdrant、PostgreSQL、Redis；PostgreSQL/Redis 有健康检查和持久化卷。
- 增加 OCR 人工标注评测器 `evaluate_ocr.py`，输出 corpus CER、字符准确率和低置信度数量；没有真实扫描件+人工转录时不能产出“准确率通过”结论。
- 增加 `verify_two_real_projects.py`，必须传两个不同项目 ID，并核对 V1/V2 文件哈希、显式执行人、非执行者人工复核回执及最终人工确认。
- 增加人工复核专用入口 `review-manual`：复核包必须声明 `method=manual`、`content_read_confirmed=true`，且服务端仍验证当前提交版本、非执行者身份、逐项判据和原文证据引用。

## 本机/Compose 部署

1. 复制 `.env.engineering.example` 为 `.env.engineering`，替换 PostgreSQL/MinIO 随机强密码、实际前端 Origin 和真实业务 AI 模型凭据；不要提交密钥。MinIO 用于满足现有生产 API 的对象存储要求。
2. 在有 Docker Engine 的部署机执行：
   ```powershell
   docker compose --env-file .env.engineering -f compose.engineering.yml up -d --build
   docker compose --env-file .env.engineering -f compose.engineering.yml ps
   ```
3. 首次启动会拉取 Ollama 的 `bge-m3`。TEI 容器首次启动会下载 `BAAI/bge-reranker-v2-m3`，CPU 推理较慢；生产建议独立 GPU/模型服务或受控推理 API。
4. API 健康检查（需先登录并携带同一会话 Cookie）：
   ```powershell
   Invoke-RestMethod 'http://127.0.0.1:8000/api/v1/engineering/health'
   Invoke-RestMethod 'http://127.0.0.1:8000/api/v1/engineering/health?deep=true'
   ```
   只有每项返回 `AVAILABLE` 且 summary.ready=true 才能认为本部署的依赖就绪。RAG 实测还需把真实项目资料导入并执行带人工标注的检索集。

## P0 验收

- BGE-M3：deep health probe 返回实际 embedding dimensions=1024；在真实项目上完成语义查询并确认 Qdrant 点数、项目隔离、版本与 SHA256 过滤。
- BGE Reranker：deep health probe 返回 provider=tei、scored_candidates=2；用人工标注集对比 RRF 前后 MRR/nDCG/Recall@K，保留原始结果和模型 trace。
- 两个真实项目：分别上传真实 V1，完成实际任务执行并上传真实 V2；执行：
  ```powershell
  python verify_two_real_projects.py --project-id <真实项目ID1> --project-id <真实项目ID2>
  ```
  只有两条均 passed 才算通过。成员 ID 是系统内身份声明，不等于外部身份认证；业务效果仍需业务方确认。

## P1 验收

- OCR：准备真实扫描 PDF/图片和人工逐字转录 JSON：
  ```json
  {
    "human_labeled": true,
    "samples": [
      {"id": "scan-001", "file": "scans/page-01.png", "ground_truth": "人工逐字转录文本"}
    ]
  }
  ```
  运行 `python evaluate_ocr.py annotations.json --output ocr-report.json`。至少按文件类型/清晰度分层看 CER，不把 OCR 字符准确率等同于语义正确率。
- PostgreSQL/Redis：health report 必须真实返回 AVAILABLE；另外做数据库迁移、重启恢复、并发写冲突与 Redis 缓存失效演练。Redis 仅缓存，不是事实源。
- 浏览器 E2E：运行现有 `test_team_browser.cjs` 与 `test_general_browser.cjs`，分别覆盖桌面端和移动端；需要可用 Playwright Chromium。没有浏览器执行记录不标记通过。
- 普通模型 vs Agent：先执行 `python compare_model_agent.py --project-id <真实项目ID> --query "当前项目最关键的可验证差距是什么？" --output comparison.json`。同一项目与已连接模型下分别运行普通模型全材料诊断、Agent 检索增强诊断；记录 prompt hash、结果、检索轨迹和实测耗时。再由不知道输出模式的复核者按同一 rubric 盲评事实准确性、引用支持性、动作可执行性、未知项识别、结果完整性。没有 provider usage 时成本必须标为估算，不能冒充账单值。

## 当前运行环境限制

本次检查的远程 Windows 机器没有 Docker Engine；本机 Ollama endpoint 不可达，11434/6333/5432/6379 没有监听。因此本轮只能补齐部署定义、探测器和验收脚本，不能宣称真实 BGE-M3/Qdrant、Reranker、PostgreSQL/Redis 已连通。真实扫描件、两项目 V2 和独立复核也必须由实际材料与执行人完成。
