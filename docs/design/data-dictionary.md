# 数据字典（核心表）

| 表 | 关键字段 | 说明 |
|---|---|---|
| `users` | `password_hash` | `scrypt$salt$digest`；旧 SHA-256 在登录成功后自动升级 |
| `sessions` | `token`, `expires_at` | 登录轮换；启动时清理过期行 |
| `projects` | `payload` | JSON，含 `archivedAt`（归档标记）与 `review.versionId` |
| `project_members` | `role` | `owner/member/reviewer/observer` |
| `materials` | `mime_type`, `status` | MIME 由文件魔数判定；链接材料状态为「仅记录来源（未解析）」 |
| `evidence_citations` | `excerpt`, `location` | 仅 owner/member 可写 |
| `rubrics` | `items_json` | 判断标准版本 |
| `material_versions` | `version`, `created_by` | V2 记录 |
| `reviews` | `version_id`, `status` | `in_progress/passed/invalid` |
| `review_items` | `rubric_item_id`, `result` | 与某次 review 绑定 |
| `agent_messages` | `role`, `provider` | 对话历史 |
| `schema_migrations` | `version` | 迁移版本 |

## 迁移
`app/migrations.py` 按版本号顺序执行，禁止直接修改已发布 schema 而不升版本。
