# 砺程工程版

这是“砺程｜学生科研与创新项目质量进阶 Agent”的首版可运行工程。工程按砺程品牌维护，启动脚本和数据路径保持稳定。它把原型里的个人/团队项目工作台接到一个本地持久化服务：账号、项目、判断标准确认、缺口选择、行动开始、改进版本提交、逐项复核和换材料再试都会写入 SQLite，并留下审计事件。

## 启动

需要 Python 3.10 或更高版本，首版只使用标准库，不需要 Node、Docker 或外部模型服务。

```powershell
cd <项目目录>
python run.py
```

打开 <http://127.0.0.1:8787>。演示负责人账号是 `li.student@example.com` / `quality123`，演示复核者账号是 `chen.teacher@example.com` / `review123`。数据文件会自动生成在 `data/app.db`；删除该文件即可重新生成演示数据。

## 主流程验收

1. 登录后选择“湘秀未来”。
2. 点击“确认本轮标准”。
3. 点击“选它作为这次要改的地方”，再点击“开始这一步”。
4. 提交改进版本。
5. 打开“请别人帮我检查”，逐项选择“达标”，完成检查。
6. 用 `chen.teacher@example.com / review123` 登录“请别人帮我检查”，先开始复核，再逐项选择“达标”；回到负责人账号打开“换材料再试”，连续推进三次，看到“方法已验证”。

所有关键状态迁移都由服务端校验，浏览器只负责展示即时状态。材料工作区支持上传 PDF、Word、图片和文本，也支持粘贴文本或链接。文件保存到 `data/uploads/`，单文件上限 50MB。PDF/Word 在安装解析依赖后会自动提取文本；图片保留为“待人工标注”。

## 目录

- `app/server.py`：标准库 HTTP 服务、SQLite 初始化、权限和质量循环 API。
- `frontend/`：从原型迁入的响应式工作台和 API 连接层。
- `data/`：本地数据库和后续材料上传目录。
- `tests/`：无第三方测试依赖的 API 主流程验收。
- `docs/design/`：模块、架构、接口和实现计划。

## API 摘要

`GET /api/health`、`GET /api/session`、`POST /api/auth/login`、`POST /api/auth/register`、`GET /api/projects`、`POST /api/projects`，以及项目状态动作：

- `POST /api/projects/{id}/rubric/confirm`
- `POST /api/projects/{id}/gap/confirm`
- `POST /api/projects/{id}/actions/start`
- `POST /api/projects/{id}/actions`（负责人分派动作卡）
- `POST /api/projects/{id}/versions`
- `POST /api/projects/{id}/reviews/criteria`
- `POST /api/projects/{id}/reviews/finish`
- `POST /api/projects/{id}/transfer/advance`

材料、成员和记录接口：

- `GET/POST /api/projects/{id}/materials`
- `POST /api/materials/{id}/evidence`
- `GET /api/materials/{id}/download`
- `GET /api/projects/{id}/rubric`、`POST /api/projects/{id}/rubric`
- `GET /api/projects/{id}/members`
- `POST /api/projects/{id}/members/invitations`
- `POST /api/invitations/{token}/accept`
- `GET /api/projects/{id}/audit`
- `GET /api/projects/{id}/versions`、`GET /api/projects/{id}/reviews`
- `POST /api/projects/{id}/reviews/start`
- `POST /api/projects/{id}/help`
- `GET /api/projects/{id}/help`
- `PATCH/DELETE /api/projects/{id}`（编辑/软归档）
- `POST /api/auth/logout`

## 后续迭代边界

当前 Agent 默认使用本地、可解释的规则建议；配置 DeepSeek 后可在“对话”入口进行真实项目化对话。当前 DeepSeek Provider 使用 Python 标准库直接调用 OpenAI 兼容的 Chat Completions/SSE 接口，工程尚未引入 LangChain 依赖；上下文组装、权限边界、流式传输和持久化由砺程后端自行控制，后续如需 LangChain 可在此 Provider 边界内替换。图片 OCR 和对象存储适配器仍作为后续可替换实现。

### 配置 DeepSeek 对话

复制 `.env.example` 为 `.env`，填写你自己的密钥：

```text
DEEPSEEK_API_KEY=sk-your-real-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

填写 `.env` 后点击“砺程教练”→“对话”即可进行项目化对话；Provider 配置会在每次请求时重新读取，修改 Key 后无需依赖旧进程中的环境变量。回答通过 SSE 流式返回，前端显示“思考中”和打字效果；对话框支持添加一张图片或一个 PDF、Word、文本附件，图片以多模态内容发送，文档在后端临时提取文字后发送，临时文件处理完即删除；“问教练怎么做”也会打开同一套项目对话。后端只发送当前项目、当前质量循环、已确认标准、材料摘要和当前用户消息；`.env` 已被 Git 忽略，不能把真实 Key 提交或发给他人。没有配置 Key、网络失败或接口返回异常时，会自动降级为本地规则回答。对话记录会保存到 `data/app.db` 的 `agent_messages` 表，附件本身不写入对话历史。



