# 推送到 GitHub

本地仓库已经初始化并完成首次提交，remote 已指向 `https://github.com/phucmanh146-dot/licheng.git`（你给的 `shangan-ya` 链接会重定向到这个仓库）。**没有执行 push**，因为这台机器没有配置 GitHub 凭证。按下面步骤自己推送。

## 0. 确认当前状态

```powershell
cd E:/作业31/上岸鸭/上岸鸭
git log --oneline -1        # 应看到 8eae8f2
git remote -v               # 应看到 origin -> licheng.git
```

如果提交者身份想换成你自己的：

```powershell
git config user.name "你的GitHub用户名"
git config user.email "你的邮箱"
git commit --amend --reset-author --no-edit
```

## 1. 配置凭证（二选一）

### 方式 A：Personal Access Token（推荐）

在 GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) 生成 token，勾选 `repo` 权限。然后把 token 作为密码推送（用户名填你的 GitHub 用户名）：

```powershell
git push -u origin main
# 提示 Username：填 GitHub 用户名
# 提示 Password：粘贴 token（不是 GitHub 登录密码）
```

Windows 想让 Git 记住凭证，避免每次粘贴：

```powershell
git config --global credential.helper manager
```

### 方式 B：Git Credential Manager / 已登录的桌面端

如果装了 Git for Windows 并勾选了 Credential Manager，或已用 GitHub Desktop 登录过，`git push` 会自动弹窗认证：

```powershell
git push -u origin main
```

## 2. 处理"远端已有内容"

远端仓库目前有旧版 README 等文件，本地是全新历史，直接 push 会被拒绝（non-fast-forward）。因为你刚 init、远端是历史包袱，**推荐强制覆盖**（会丢弃远端旧提交，确认那些内容不需要后再执行）：

```powershell
git push -u origin main --force
```

如果想保留远端历史，改成先拉取再合并（可能产生冲突需手动解决）：

```powershell
git pull origin main --allow-unrelated-histories
git push -u origin main
```

## 3. 验证

打开 <https://github.com/phucmanh146-dot/licheng>，确认：
- README 显示新版（含"部署为网站"章节）。
- 有 `Dockerfile`、`docker-compose.yml`、`Procfile`、`frontend/manifest.webmanifest`。
- `data/`、` .env` 不在仓库里。

## 4. 后续更新

以后每次改完代码：

```powershell
git add -A
git commit -m "说明这次改了什么"
git push
```
