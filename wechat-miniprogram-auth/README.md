# 上岸鸭 V10 微信小程序认证与首页骨架

## 已实现的代码范围
- 首次注册：手机号 +86、请求真实短信、短信验证码校验、用户协议勾选、设置密码、创建成功。
- 登录：手机号 + 密码；服务端验证，错误密码不会创建会话。
- 忘记密码：短信验证后重设密码。
- 唯一账号：服务端对 users.phone 建立唯一索引；同一手机号只能注册一次。
- 数据归属：沿用账号 users.id / storage 的独立空间；小程序使用 Bearer session token 识别用户。
- 首页与账号页：读取真实 /me 接口，支持退出登录；任务、排期、验收页明确标记为待接入真实 V10 数据接口，不展示假任务。

## 视觉依据
手机号注册、设置密码、创建成功、手机号密码登录四个界面对应 Figma 文件：
https://www.figma.com/design/0RxS3joAwcmYlS5QpYKgJB/上岸鸭-V10-精品小程序-UI
本分支采用用户最新截图的深绿色视觉作为颜色优先级，并保留 Figma 的三步流程与版式结构。

## 正式短信配置（必须由管理员在 Railway 服务端完成）
当前后端使用腾讯云短信 API，服务端需要配置：
- TENCENTCLOUD_SECRET_ID
- TENCENTCLOUD_SECRET_KEY
- TENCENT_SMS_SDK_APP_ID
- TENCENT_SMS_SIGN_NAME
- TENCENT_SMS_TEMPLATE_ID
- TENCENT_SMS_REGION（可选，默认 ap-guangzhou）

短信模板参数依次为验证码、有效分钟数（5）。签名和模板必须通过腾讯云审核。密钥只能保存在 Railway Variables，不得写入小程序代码、GitHub 或聊天记录。未配置时，接口明确返回“短信服务未配置”，不生成固定验证码，也不会伪装发送成功。


### 国内短信资质限制（重要）
腾讯云 2026-08-31 使用须知说明：个人实名认证用户可以申请国内验证码/通知短信，但个人主体不能直接完成国内短信运营商签名实名报备；若要发国内短信，需要准备符合要求的企业证件及授权材料申请他用资质，或将腾讯云账号升级为企业认证。国内签名还需运营商报备通过，通常约 7–10 个工作日，具体以审核为准。签名、模板未审核/生效时不得宣称真实短信可用。

如果当前腾讯云账号是个人认证且没有可用企业授权资质，先不要在小程序中承诺“短信已发送”；应先确认短信服务商的资质路径，或换用具备合规资质的短信服务商。

## 正式发布前必须配置
1. 将 utils/api.js 的 API_BASE 设置为当前实际 Railway HTTPS 域名。
2. 将 project.config.json 中 touristappid 替换为用户自己的正式小程序 AppID；不得用占位 ID 发布。
3. 在微信公众平台配置 request 合法域名，域名必须完成 HTTPS 和平台要求的合规校验。
4. 微信公众平台配置业务域名（若后续接 web-view），并完成小程序备案与审核。
5. 微信开发者工具中上传体验版、真机验证短信、注册、重复注册、登录、错误密码、重置密码、退出登录及账号隔离。

## API
- POST /api/mini-auth/sms/send { phone, purpose: register|reset }
- POST /api/mini-auth/sms/verify { phone, code, purpose } -> verificationToken
- POST /api/mini-auth/register { phone, verificationToken, password } -> token + user
- POST /api/mini-auth/login { phone, password } -> token + user\n- POST /api/mini-auth/legacy-login { name, password } -> token + user\n- POST /api/mini-auth/bind-phone { phone, verificationToken, password } (Bearer token required; preserves original user id/storage)
- POST /api/mini-auth/password/reset { phone, verificationToken, password }
- GET /api/mini-auth/me (Authorization: Bearer token)
- POST /api/mini-auth/logout (Authorization: Bearer token)

## 安全与验收
- 验证码：5 分钟有效、60 秒重发间隔、最多 5 次校验错误。
- 密码：8–128 位，必须同时包含字母和数字；服务端 scrypt 加盐哈希。
- Session：随机 256-bit token，数据库只存 SHA-256 摘要，30 天过期。
- 注册挑战：短信验证后产生一次性 10 分钟 challenge，创建账号必须持有 challenge。
- 账号唯一：SQLite 唯一索引，数据库层防并发重复注册。
- 旧用户名且已有密码的账号不自动创建新账号；可先用原用户名/密码登录，再短信绑定手机号并设置新密码，原 users.id 和 storage 不变。若旧账号由设备自动创建且 password 为空，目前尚未提供免密码迁移入口，需要先在原已登录工作台完成身份绑定；不能直接在小程序中迁移。
- 短信发送是否成功必须以服务商 SendStatusSet.Code=Ok 为准。
