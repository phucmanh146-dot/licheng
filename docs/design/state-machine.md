# 质量循环状态机

```text
标准草案 → 确认标准 → 选择缺口 → 开始行动 → 提交 V2
       → 复核进行中 → 复核 PASS → 迁移试做 → 方法已验证
```

## 关键不变量
1. **V2 提交必须重置复核**：`review.criteria` 全部置 `pending`，`completed=0`，`versionId` 指向新版本；旧 `reviews` 记录置为 `invalid`。
2. **复核绑定版本**：`reviews/finish` 只接受 `version_id=当前版本` 且 `status=in_progress` 的记录；作者不得复核自己的版本。
3. **空列表不可通过**：`criteria` 长度必须等于当前 rubric 项数，且每项都有 `review_items` 记录。
4. **归档阻断**：项目归档后，`member_role()` 返回空，所有子资源与写操作均不可访问。
5. **证据写入限 owner/member**：reviewer/observer 只读。
