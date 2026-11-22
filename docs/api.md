# 砺程 API 契约（v0.2）

## 通用约定

- 基础路径：所有接口以 `/api` 开头；未匹配路径统一返回 JSON 404，不回退静态页。
- 认证：登录成功写入 `sy_session`（HttpOnly / SameSite=Lax / Max-Age=7d），响应体返回 `csrfToken`。
- CSRF：除 `POST /api/auth/login`、`POST /api/auth/register` 外，所有写操作（`POST`/`PATCH`/`DELETE`）必须同时带 `sy_csrf` Cookie 与 `X-CSRF-Token` 请求头。缺少时返回 403，不会误导前端跳登录页。
- 响应头：每个响应带 `X-Request-Id`；错误响应同时带稳定的 `code` 字段。
- 日志：服务端输出结构化 JSON 访问日志（时间、requestId、客户端、方法、路径、状态）。
- 错误码：`invalid_request`(400)、`unauthorized`(401 未登录)、`forbidden`(403 已登录但无权限/CSRF 失败)、`not_found`(404 不存在或已归档)、`conflict`(409 版本冲突)、`payload_too_large`(413)、`rate_limited`(429)、`internal_error`(500)。内部异常只进日志，不回显原文。
- 并发：`PATCH /api/projects/{id}` 支持 `If-Match: <revision>` 乐观锁；版本不符返回 409，要求客户端刷新。省略该头则按最新Revision写入。
- 事务：V2 提交、复核逐项判定、复核完成均为单事务；项目 payload 与审计事件同提交或同回滚。
- 连接：每个请求的连接在退出时明确 commit/rollback 并关闭，避免文件描述符泄漏。

## 公开接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查：`.ok`、`.db`、`uptimeSeconds`、`version`。DB 异常返回 503。 |
| GET | `/api/session` | 未登录返回 `authenticated:false`；已登录返回用户与项目列表。 |
| POST | `/api/auth/login` | `{email,password}`；失败 5 次锁定 5 分钟；旧 SHA-256 登录后自动升级为 scrypt。 |
| POST | `/api/auth/register` | `{name,email,password}`；创建账号、默认项目与评分标准。 |

## 项目与质量循环

以下写操作均需 owner/member 或 reviewer 角色，并带 CSRF。

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | `/api/projects` | 登录用户 | 新建项目。 |
| GET | `/api/projects/{id}` | 成员 | 项目详情；含 `revision`。 |
| PATCH | `/api/projects/{id}` | owner | 改名/目标/归档；支持 `If-Match`。 |
| DELETE | `/api/projects/{id}` | owner | 归档项目；归档后所有子资源与写操作返回 404。 |
| POST | `/api/projects/{id}/rubric/confirm` | owner/member | 确认本轮标准。 |
| POST | `/api/projects/{id}/gap/confirm` | owner/member | 确认缺口。 |
| POST | `/api/projects/{id}/actions/start` | owner/member | 开始行动。 |
| POST | `/api/projects/{id}/versions` | owner/member | 提交 V2，重置复核项并作废旧 review。 |
| POST | `/api/projects/{id}/reviews/start` | reviewer | 开始复核；作者本人不可复核自己的版本。 |
| POST | `/api/projects/{id}/reviews/criteria` | reviewer | `{index,value,note?}`，`value ∈ pass/fail/unknown`；判定写入 `review_items`，按复核者隔离。 |
| POST | `/api/projects/{id}/reviews/finish` | reviewer | 仅当该复核者本版本所有评分项均为 `pass` 可通过；空集合不可通过。 |
| POST | `/api/projects/{id}/transfer/advance` | owner/member | 换材料再试推进。 |

## 材料、证据与协作

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET / POST | `/api/projects/{id}/materials` | 成员 | 列表 / 新增；上传按魔数识别真实类型。`link` 类型仅记录来源。 |
| POST | `/api/materials/{id}/evidence` | owner/member | 证据定位；reviewer/observer 禁止写入（403）。 |
| GET | `/api/materials/{id}/download` | 成员 | `attachment` + `nosniff`。 |
| GET / POST | `/api/projects/{id}/rubric` | 成员 / owner | 评分标准。 |
| GET | `/api/projects/{id}/members` | 成员 | 成员列表。 |
| POST | `/api/projects/{id}/members/invitations` | owner | `{email,role}`，`role ∈ member/reviewer/observer`。 |
| POST | `/api/invitations/{token}/accept` | 登录用户 | 邮箱必须匹配邀请，接受后获得对应角色。 |
| GET | `/api/projects/{id}/audit\|versions\|reviews\|help` | 成员 | 审计事件、版本、复核记录、求助卡。 |

## 教练与检索

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/projects/{id}/agent/chat` | 非流式问答。 |
| POST | `/api/projects/{id}/agent/chat/stream` | SSE 流式问答。事件为单行 `data: {...}`；连接中断会标记“部分内容”，服务端流已开始后异常只关连接，不二次写响应。 |
| POST | `/api/agent/advice` | 本地规则建议。 |
| POST | `/api/agent/retrieve` | 检索流水线：`{query, profile:{level}, trace:true}`。输出路由、重写、元数据过滤、BM25+向量双路召回、RRF 融合、按画像组装答案与 trace。 |

## 复核状态机约束

1. V2 提交必须在同一事务内重置 `criteria/completed/versionId` 并把旧 review 置为 `invalid`。
2. `reviews/finish` 依次校验：版本存在且与项目绑定 → 作者回避 → 该复核者存在 `in_progress` review → 每个评分项都有本次 `review_items` 记录且为 `pass` → 才允许转到“成果复核 PASS”。
3. 多名复核者的判定互不覆盖：payload 中的 `criteria` 只是该复核者最近一次提交的展示快照，权威判定始终来自 `review_items`。

## 运行限制

- 有界线程池：默认最多 32 个并发请求，超限立即返回 503，不无限排队。
- 优雅关闭：`SIGINT`/`SIGTERM` 触发 `shutdown()` 并释放端口。
- 单实例部署：SQLite 不适合多进程并发写，横向扩展前需更换数据库。
