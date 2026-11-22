# 架构说明

## 品牌说明
产品品牌统一为「砺程 / licheng」。`上岸鸭` 与 `shangan-ya` 是项目仓库的历史代号；README、前端、PPT 引用仓库时请统一说明这一关系。

## 模块
- `run.py` / `app/server.py`：标准库 HTTP 服务、路由、会话、项目状态机、静态资源。
- `app/security.py`：密码哈希（scrypt）、CSRF 双提交校验、上传魔数检测。
- `app/multipart.py`：Python 3.13 兼容的 multipart 解析（替代已移除的 `cgi`）。
- `app/retrieval/`：检索层（查询路由、查询重写、混合检索、RRF、按画像组装、碎片收件箱）。
- `frontend/`：经后端访问的正式前端；`prototype/` 为只读设计稿。
- `tests/`：API 集成测试、状态机与安全回归测试。

## 请求约定
- 会话 Cookie：`sy_session`（HttpOnly）+ `sy_csrf`（前端可读）。
- 所有非 GET 请求必须携带 `X-CSRF-Token: <sy_csrf>`。
- 未匹配的 `/api/*` 返回 JSON 404；静态资源回退仅在非 API 路径生效。
- 错误响应：400 参数错误、401 未登录/无权限、404 不存在、500 统一文案，细节只写服务端日志。

## 数据
SQLite 单文件 `data/app.db`，上传文件在 `data/uploads/`。连接开启 WAL 与 `busy_timeout`。数据库结构变更通过 `app/migrations.py` 中的版本化迁移执行。
