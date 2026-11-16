# 应用内浏览器登录提示

## 改动

- 新增 `js/inapp-browser.js`，提供可在浏览器和 Node.js 中调用的 `isInAppBrowser(ua)`、`platform(ua)`，识别微信、Zalo、Facebook、Instagram、Line、TikTok / musical_ly / BytedanceWebview 和 Android WebView。
- 在登录流程开始前识别应用内浏览器，显示中文、英语、越南语、泰语或印尼语帮助面板。面板提供复制当前链接；Android 可尝试用 Chrome 打开，iOS 显示 Safari 操作提示。
- 普通浏览器沿用原 Google OAuth 路径；未修改 Supabase 认证配置、支付或价格逻辑。
- 增加 Node UA 测试和独立 Playwright 验收脚本。脚本覆盖应用内与普通浏览器登录，以及四个城市在 390px / 1280px 的页面高度上限；带 `?city=` 的页面不会点击城市摘要。

## 验证

`node --test tests/inapp-login.test.mjs` 通过（3 项）。完整 `node --test` 共 72 项，67 项通过；5 项既有 attractions 测试因沙盒 Python 缺少 `requests` 模块而失败（`ModuleNotFoundError`），与本次改动无关。浏览器验收由包装环境在 Mac 终端执行 `scripts/inapp-login-playwright.mjs`；沙盒内未运行浏览器脚本。

页面高度上限（手机 / 桌面）：岘港 3288 / 2776px，胡志明市 3152 / 2732px，北榄府 3475 / 2992px，曼谷 2899 / 2627px。

## 分支说明

工作目录原先位于 `wip/hide-devnotes`。沙盒禁止写 `.git`，因此无法切换到 `wip/inapp-login`；本次改动留在工作树中，未提交或推送。开始时本地 `wip/inapp-login` 指向 `origin/main` 的现有记录 `b31809d`，无法在沙盒内刷新远端状态。

## 邮箱验证码登录

账户、行程和升级入口共用登录弹窗。应用内浏览器优先显示邮箱验证码登录，并保留打开系统浏览器使用 Google 的选项；普通浏览器优先 Google，也可选择邮箱。邮箱流程调用 `signInWithOtp` 发送 6 位数字验证码，并使用 `verifyOtp` 完成验证，不使用邮件链接登录。验证成功后沿用现有会话、账户权益和行程刷新流程。界面文本已补齐中文、英语、越南语、泰语和印尼语。弹窗固定覆盖显示，不增加页面内容高度。

## 需要 Stephen 批准后在 Supabase 后台修改的设置

以下均为后台待办建议；本次代码改动没有修改任何认证设置。

- 启用 Email 登录提供方，并采用邮箱验证码登录。
- 将 Email OTP 长度设为 6 位，并设置合理的有效期。
- 邮件模板需包含 `{{ .Token }}`，不要只依赖 `{{ .ConfirmationURL }}`。例如：

  **中文主题：** 登录验证码

  **中文正文：**
  ```text
  你好，

  你的登录验证码是：{{ .Token }}
  请在有效期内输入此验证码完成登录。
  如果这不是你发起的操作，请忽略此邮件。
  ```

  **English subject:** Your sign-in code

  **English body:**
  ```text
  Hello,

  Your sign-in code is {{ .Token }}.
  Enter this code before it expires to finish signing in.
  If you did not request this, you can ignore this email.
  ```
- 自定义 SMTP 服务商待 Stephen 选择。Supabase 默认邮件服务有发送频率限制，正式启用前应配置经选择的 SMTP 服务。
- 检查并按实际邮件服务能力调整发送速率限制，避免过宽松设置；发送失败或触发限制时，前端会显示本地化提示。
- 保持现有 Redirect URLs 不变；验证码流程不依赖邮件重定向地址。
