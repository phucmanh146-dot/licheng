# 砺程工程版（licheng）

> 品牌说明：产品统一使用「砺程 / licheng」。`上岸鸭` 与 `shangan-ya` 是项目仓库的历史代号，PPT 中的链接指向同一工程；README、前端与代码中的正式名称以「砺程」为准。

这是“砺程｜学生科研与创新项目质量进阶 Agent”的可运行工程。原型工作台已接入本地持久化服务：账号、项目、判断标准确认、缺口选择、行动开始、改进版本提交、逐项复核和换材料再试都会写入 SQLite，并留下审计事件。

## 启动

需要 Python 3.10 或更高版本（已在 3.11 / 3.13 验证）。服务本身只用标准库；PDF/Word 文本提取是可选依赖。

```powershell
python -m pip install -r requirements.txt   # 可选解析依赖
python run.py
```

打开 <http://127.0.0.1:8787>。登录页点「填入演示账号」可自动填入负责人账号（`li.student@example.com / quality123`）；复核者账号 `chen.teacher@example.com / review123`。演示账号仅 `LICHENG_DEMO_MODE=1` 时注入，生产务必关闭。

配置 DeepSeek 时复制 `.env.example` 为 `.env` 并填写 Key；未配置或网络失败时自动降级为本地规则回答。所有非 GET 请求需要 CSRF Token：登录响应会返回 `csrfToken` 并写入 `sy_csrf` Cookie，前端自动带上 `X-CSRF-Token` 头。

## 部署为网站

这是一个完整的 Web 应用（标准库 HTTP 服务 + SQLite），可部署到任意 Python 主机、容器平台或云服务器。`run.py` 与 `python -m app.server` 读取同一组环境变量。

本地开发（仅本机可访问）：

```powershell
python run.py
```

服务器 / 容器（允许外部访问）：

```powershell
$env:LICHENG_HOST = "0.0.0.0"
$env:LICHENG_PORT = "8787"      # 云平台注入 PORT 时会自动使用
python run.py
```

三种上线方式：

- **Docker**：`docker compose up -d --build`，访问 `http://服务器IP:8787`；数据在 `./data` 卷持久化。
- **PaaS（Railway / Render / Heroku）**：仓库含 `Procfile`（`web: python run.py`）与 `runtime.txt`，平台注入 `PORT` 后自动监听；需挂一个持久化卷到 `data/`，否则重启丢数据。
- **自有服务器**：gunicorn/反代可选；务必用 Nginx 终止 HTTPS 并反代到 `0.0.0.0:8787`，同时设 `LICHENG_SECURE_COOKIE=1` 开启安全 Cookie。

上线前的安全检查：

1. 设 `LICHENG_DEMO_MODE=0` 关闭演示账号，自行注册真实账号（否则弱口令可被直接登录）。
2. 全程 HTTPS 后设 `LICHENG_SECURE_COOKIE=1`，否则浏览器不会回传 Cookie。
3. 把 `data/` 作为持久卷挂载并保证进程对它有写权限；`.env` 不进仓库。
4. 单实例部署：SQLite 不支持多进程并发写，横向扩展前需换 PostgreSQL。

站点已提供 favicon、Web App Manifest、`robots.txt`、`/api/health` 健康检查，以及缺失静态资源的 404 响应。

## 测试

```powershell
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m pytest -v tests/
```

测试覆盖主流程、材料/证据、成员、SSE 降级，以及状态机、权限、上传与归档回归。

## 主流程验收

1. 登录后选择“湘秀未来”。
2. 确认本轮标准 → 选缺口 → 开始这一步。
3. 提交改进版本（表单已去除预填答案）。
4. 复核者账号登录后“开始复核”，逐项选择“达标”，完成检查。
5. 负责人回到“换材料再试”，连续推进三次，看到“方法已验证”。
6. 收到邀请的成员可在登录页点“接受项目邀请”，粘贴邀请码加入。

所有关键状态迁移由服务端校验：新 V2 会重置复核项并作废旧复核；`finish` 校验版本绑定、作者回避和逐项记录。

## 目录

- `app/server.py`：标准库 HTTP 服务、路由、权限与质量循环 API。
- `app/security.py` / `app/multipart.py`：密码哈希、CSRF、上传魔数校验与 multipart 解析。
- `app/retrieval/`：检索层（路由、重写、混合检索、RRF、按画像组装、碎片收件箱）。
- `frontend/`：正式前端（必须经后端访问）；`prototype/`：只读设计稿，可直接双击打开。
- `docs/design/`：架构、状态机与数据字典。
- `tests/`：pytest API 集成测试。
- `data/`：SQLite 数据库与上传目录（已 Git 忽略）。

## API 摘要

基础：`GET /api/health`、`GET /api/session`、`POST /api/auth/login|register|logout`。

项目动作：`rubric/confirm`、`gap/confirm`、`actions/start`、`actions`、`versions`、`reviews/start`、`reviews/criteria`、`reviews/finish`、`transfer/advance`（均在 `/api/projects/{id}/` 下）。

材料与协作：`GET/POST /api/projects/{id}/materials`、`POST /api/materials/{id}/evidence`、`GET /api/materials/{id}/download`、`GET/POST /api/projects/{id}/rubric`、`GET /api/projects/{id}/members`、`POST /api/projects/{id}/members/invitations`、`POST /api/invitations/{token}/accept`、`GET /api/projects/{id}/audit|versions|reviews|help`、`GET/POST /api/projects/{id}/agent/chat|chat/stream`、`POST /api/agent/advice`、`PATCH/DELETE /api/projects/{id}`。

检索：`POST /api/agent/retrieve`（输入 `query`、`profile`、`trace`；输出路由、重写、混合召回、RRF、画像化答案与 trace）。

## 已知边界

- 链接材料目前只记录来源，不做服务端抓取（避免 SSRF），状态显示为“仅记录来源（未解析）”。
- 图片材料保留为“待人工标注”，不内置 OCR。
- `.env` 不随交付包发布；仓库只保留 `.env.example`。
