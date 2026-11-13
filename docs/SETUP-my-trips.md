# Stephen 的「我的行程」部署指南

这是纯静态 GitHub Pages 页面，无需构建。Supabase UMD SDK 固定为 v2.119.0，支持 sb_publishable_ 公开密钥。清空 URL 或公开密钥后的未配置状态只显示即将上线，不加载 Supabase SDK，也不请求 Supabase。天气仍读取本站每日快照。请先在测试项目验证，再发布配置。

## 1. Supabase 项目已创建（DONE）；下一步运行迁移

- 项目已创建，project ref：`nhrapkbdveuitczbjkee`。
- Project URL：`https://nhrapkbdveuitczbjkee.supabase.co`。
- `js/config.js` 已填写该 URL 和 Stephen 提供的公开 publishable key；无需再创建项目。区域建议新加坡（Singapore），已有项目以实际区域为准。
- Google provider 尚未启用；航班代理 URL 仍为空，航班查询按钮会禁用并提示未配置。

**现在先做这一件事：** 打开 Supabase Dashboard → 选择该项目 → SQL Editor → New query，将 `supabase/migrations/20261114000000_my_trips.sql` 文件全文粘贴进去，点击 Run。

运行后打开 Table Editor，确认 public 下存在 `trips` 和 `flight_cache` 两张表，并在 Authentication / Database 策略界面确认 trips 启用 RLS 且四种操作均有 authenticated 策略。flight_cache 启用 RLS，但没有客户端策略。SQL 可重复运行：已存在的表和索引保留，触发器与策略重建；它不会自动升级结构不同的同名旧表。

本项目关闭了“auto-expose new tables”。迁移已显式授予 authenticated 对 public schema 的 usage 和 trips 的 select / insert / update / delete，撤销 anon 对 trips 的权限。UUID 不使用序列。缓存仅授予 service_role，触发器 helper 的直接执行权限也仅授予 service_role。

如果后续需要重建项目，可在 Supabase 创建项目（建议 Singapore），在 Settings → API / API Keys 获取 Project URL 和 anon（旧版 JWT）或 publishable key（新版公开密钥）。前端的 `SUPABASE_ANON_KEY` 字段可放任一种公开密钥。

CLI 替代方法（与 SQL Editor 二选一）：

```sh
supabase login
supabase link --project-ref nhrapkbdveuitczbjkee
supabase db push
```

手动 SQL 与 CLI 迁移历史需要自行统一；不要把“重复运行安全”误认为 CLI 已记录手工执行的迁移。

地点限制：前端接受三个英文字母的机场代码，或者 data.js 中任一城市 ID / 五语完整名称。未知机场可保存，但天气会显示不在数据范围内。数据库还限制字段长度、日期和航班号格式。每个登录用户只能访问自己的行程。缓存没有客户端 RLS 策略。

## 2. Google 登录

在 Supabase → Authentication → URL Configuration 设置：

- Site URL：`https://vietnamstephen.github.io/sea-travel-weather/`
- Redirect URLs：`https://vietnamstephen.github.io/sea-travel-weather/trips.html`
- 本地回调：`http://localhost:8000/trips.html`
- 最省事：再加一条通配符 `https://vietnamstephen.github.io/sea-travel-weather/**`（以及 `http://localhost:8000/**`），这样带 `?lang=zh/en/vi/th/id` 的回调都能匹配。

在 Google Cloud Console：

1. 创建或选择项目，配置 OAuth consent screen（Google Auth Platform 的 Branding / Audience / Data Access）。测试模式下添加 Stephen 和其他测试用户，申请基本 email / profile 权限。
2. Credentials → Create credentials → OAuth client ID → Web application。
3. Authorized JavaScript origins 添加 `https://vietnamstephen.github.io` 和 `http://localhost:8000`，这里不能带仓库路径。
4. Authorized redirect URIs 添加 `https://nhrapkbdveuitczbjkee.supabase.co/auth/v1/callback`。这里是 Supabase 回调地址，不是 trips.html。
5. 把 Client ID / Client Secret 填入 Supabase → Authentication → Sign In / Providers → Google，启用并保存。

页面使用 Google OAuth，登录后显示邮箱，支持退出登录。当前 Google provider 尚未启用，点击会通过公开 Auth settings 检查并友好提示；OAuth 返回的错误参数也会从 URL 清理。若数据库缺表或缺权限，会提示管理员先运行迁移。Google 未启用时也可以在 config 中关闭按钮。Zalo 始终显示禁用的“即将推出”：后续通过 Supabase Edge Function 自定义 OAuth 或 custom OIDC 实现，不能仅将配置改为 true 就视为已接入。

## 3. Variflight 和航班代理

在 `https://ai.variflight.com` 控制台注册、创建 API key，确认账户额度和航空 MCP 权限。

在仓库根目录执行（替换占位符）：

```sh
supabase login
supabase link --project-ref nhrapkbdveuitczbjkee
supabase secrets set VARIFLIGHT_API_KEY='<your-key>' ALLOWED_ORIGINS='https://vietnamstephen.github.io,http://localhost:8000' CACHE_TTL_MINUTES=20
supabase functions deploy flight-proxy --no-verify-jwt
```

`SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY` 通常由 Edge Function 环境自动提供，无需复制到前端。函数优先使用 `SUPABASE_SERVICE_ROLE_KEY`，若不存在则使用 `SUPABASE_SECRET_KEY`；验证用户所用公开密钥优先读取 `SUPABASE_ANON_KEY`，否则读取 `SUPABASE_PUBLISHABLE_KEY`。如运行环境只提供新版密钥，请通过平台支持的环境配置方式确认对应变量可用（CLI 对 SUPABASE_ 前缀可能有限制）。服务角色 / secret 密钥只留在服务端。配置的 ALLOWED_ORIGINS 是逗号分隔的 origin（无路径）；默认允许 GitHub 域名，同时接受 http localhost / 127.0.0.1 的任意端口。

`supabase/config.toml` 已设置 `verify_jwt = false`（部署命令也带 `--no-verify-jwt`）：新版 publishable/secret key 和非对称 JWT 下网关校验可能误拒合法用户，所以改由函数内部调用 `auth.getUser` 校验登录用户——未登录或 token 无效一律返回 401，飞常准接口不会被匿名调用。前端 Authorization 发送的是用户 access token，apikey 才是公开的 publishable key。

代理仅接受 searchFlightsByNumber、searchFlightsByDepArr、getFutureWeatherByAirport；参数严格校验。先读取共享缓存，未命中才调用 Variflight，默认缓存 20 分钟，环境变量范围限定 15–30 分钟。上游返回 JSON 或 SSE 均支持；遇到缺少初始化 / 会话的错误时会执行 initialize、initialized 再重试。失败不会缓存或向浏览器返回密钥。

## 4. 前端已配置；航班代理部署后再补 URL

`js/config.js` 的 Supabase 项目 URL 和公开 publishable key 已填好；无需再替换它们。只有完成 Variflight 密钥配置和函数部署后，才把 FLIGHT_PROXY_URL 改为 `https://nhrapkbdveuitczbjkee.supabase.co/functions/v1/flight-proxy`。完整配置格式如下（key 占位符应保留为当前文件已有的公开值）：

```js
window.SEA_CONFIG = {
  SUPABASE_URL: 'https://nhrapkbdveuitczbjkee.supabase.co',
  SUPABASE_ANON_KEY: '<anon-or-publishable-key>',
  FLIGHT_PROXY_URL: 'https://nhrapkbdveuitczbjkee.supabase.co/functions/v1/flight-proxy',
  AUTH_PROVIDERS: { google: true, zalo: false }
};
```

anon / publishable key 是公开安全的项目标识，数据权限由用户 JWT 和 RLS 控制。**绝不能把 service role 或 Variflight key 放到前端、Git 历史或公开补丁中。** 不需要航班数据时保持 FLIGHT_PROXY_URL 为空，仍可保存行程和查看天气。

在仓库根目录运行 `python3 -m http.server 8000`，访问 `http://localhost:8000/trips.html`。分别验证五种语言、Google 登录、添加 / 编辑 / 删除、刷新后数据保留、两账号隔离、未知机场、超出预报日期、航班查询和缓存命中。天气是风险推断，不是官方预警，也不能证实航班延误。

## 5. 费用与运维

本方案预算参考：searchFlights 查询 50 credits ≈ ¥0.5/次，天气工具 10 credits/次；价格及工具实际扣费以 Variflight 控制台为准。默认 20 分钟缓存可减少重复扣费。本站行程天气使用每日静态快照，不自动调用付费机场天气工具。另请留意 Supabase 数据库、Auth、函数调用和流量套餐额度。

上线后按需清理过期缓存（在 SQL Editor 或受保护的计划任务执行 `delete from public.flight_cache where expires_at < now();`）。共享缓存不是严格限流；公开推广前按使用规模增加用户配额、速率限制和费用监控，避免合法账号频繁查询造成额外费用。

## 6. 提交与推送权限

box 上没有 GitHub 登录，所以本次只在本地提交、没有推送。Stephen 可以选择：

- A：在 GitHub 仓库 Settings → Collaborators 添加协作者；或创建 fine-grained PAT，仅授权这个仓库，Repository permissions → Contents: Read and write。使用受信任的凭据管理方式交付，不把 token 写入仓库。
- B：自己应用补丁（codex 已在本地 `feature/my-trips` 分支提交并导出 `sea-travel-weather-my-trips.patch`）：在本地仓库 `git checkout -b feature/my-trips && git am sea-travel-weather-my-trips.patch`，然后 `git push origin feature/my-trips` 并在 GitHub 合并到 main。

每日数据机器人 `scripts/sync_and_push.sh` 会持续向 main 推送。合并前先检查远端更新，保留机器人最新的 data/ 和 scripts/，使用独立功能分支并谨慎 rebase / merge，避免覆盖每日数据。

参考：[Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser)、[函数认证头](https://supabase.com/docs/guides/functions/auth-headers)、[MCP Streamable HTTP 2025-03-26](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)。
