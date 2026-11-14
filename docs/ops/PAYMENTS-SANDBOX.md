# Paddle Billing v2 沙盒支付操作手册

本分支只写代码，没有迁移远端数据库、发布 Edge Function、部署 Pages 或设置 secrets。`PAYMENTS_ENABLED: true` 仅供本分支；main 在正式批准上线前必须为 `false`。公开 sandbox client token 已填入 `js/config.js`，environment 为 `sandbox`；price IDs 仍是占位符，会显示价格尚未配置的友好提示。

## 已完成与 Stephen 剩余步骤

Paddle Sandbox notification destination **sea-travel-weather webhook** 已创建，目标：

`https://nhrapkbdveuitczbjkee.supabase.co/functions/v1/paddle-webhook`

订阅事件：`transaction.completed`；`subscription.activated`, `subscription.canceled`, `subscription.created`, `subscription.imported`, `subscription.past_due`, `subscription.paused`, `subscription.resumed`, `subscription.trialing`, `subscription.updated`；`adjustment.created`, `adjustment.updated`。暂停按取消访问处理：立即撤销 VIP（admin / 人工永久 VIP 除外），记录 `paused`；恢复 active / trialing 后重新赋予到期日。

1. 在 Supabase Dashboard → Edge Functions → Secrets 写入 `PADDLE_WEBHOOK_SECRET`（上述 destination 的 endpoint secret）和 `PADDLE_API_KEY`。API key、webhook secret、service-role key 永远不能放进前端或代码库。函数还需要平台提供的 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`。
2. 使用 Node 24 在本地安全终端运行（也可请 bot 在已安全配置环境变量后代运行）：

   ```sh
   PADDLE_API_KEY=... node scripts/paddle-setup.mjs
   ```

   脚本只从环境变量读取 API key，不读取文件或参数、不打印 key。默认 `PADDLE_ENV=sandbox`；Supabase secrets 不会自动传入本地终端。可先无 key 运行 `node scripts/paddle-setup.mjs --dry-run`，仅打印请求和示例输出，不发送请求。脚本按 custom_data.key / 名称幂等查找或创建一个 **SEA Travel Weather VIP** product（standard tax category）及三个 USD prices：

   | 方案 | 价格 | Billing cycle | 配置键 / secret |
   | --- | --- | --- | --- |
   | VIP yearly | $24.99 | every 1 year | `yearly` / `PADDLE_PRICE_YEARLY` |
   | VIP monthly | $3.99 | every 1 month | `monthly` / `PADDLE_PRICE_MONTHLY` |
   | VIP 7-day pass | $2.99 | one-time | `pass7` / `PADDLE_PRICE_PASS7` |

   金额常量在 `scripts/paddle-setup.mjs` 顶部，与 `js/config.js` 展示金额保持一致。
3. 将输出的 prices block 粘贴到 `js/config.js`，并执行输出的 `supabase secrets set PADDLE_PRICE_YEARLY=... PADDLE_PRICE_MONTHLY=... PADDLE_PRICE_PASS7=...`（或在 Dashboard Secrets 填入）。
4. Checkout settings 设置 default payment link 为 `https://vietnamstephen.github.io/sea-travel-weather/pricing.html`；approved domain 为 `vietnamstephen.github.io`。Supabase Google Auth redirect allow-list 需包含 pricing.html（含允许的语言 query）以及 trips.html。`successUrl` 默认留空，overlay 完成后在原页轮询。
5. 在另行获授权的发布流程中，先应用 `20261114200000_vip_payments.sql`（依赖已有 profiles roles migration），再发布 `paddle-webhook` 和更新后的 `flight-proxy`，最后发布静态文件。`supabase/config.toml` 已为 webhook 设置 `verify_jwt=false`：身份通过原始请求 HMAC 验证。本次不执行发布。

## 沙盒验收步骤

1. 使用普通 Google 用户打开 pricing.html，确认显示 Sandbox badge；未登录点击升级进入 Google 登录，登录后返回方案页。price IDs 仍是占位符时应显示价格尚未配置的友好提示，不发起 checkout。
2. 先买 monthly。测试卡：`4242 4242 4242 4242`，任意未来到期日，CVC `100`（或任意三位数字），任意姓名；按 Paddle checkout 要求填测试地址。只在 sandbox 使用测试卡。
3. Checkout completed 后每 2 秒请求 `my_entitlement`，最多 10 次。webhook 到达后显示 VIP 和到期日；`sea:entitlement` 通知 trips UI，无需重载即可解锁。若 webhook 延迟，点击「刷新会员状态」。验证 trips 航班查询成功。
4. 换一个普通用户买 7-day pass：`vip_until` 应约为服务器当前时间 + 7 天；重复发送同一 event ID 不应重复加天数。不同交易第二次购买从 `max(now, vip_until)` 再加 7 天。先前人工授予的无限期 VIP 不会因购买而变短。
5. 订阅续费：在 Paddle webhook simulator 使用真实测试用户的 `custom_data.user_id` 和正确的 price ID，模拟更新后的 `current_billing_period.ends_at`；确认有效期延长。乱序发送较早 `occurred_at` 的 subscription update，不应覆盖新有效期。签名时间是投递时间，与事件 occurred_at 不同。
6. 取消：在 Paddle dashboard 找到测试 subscription，选择周期结束取消（或用 simulator 发送 `scheduled_change: {action:'cancel', effective_at:...}` 的 update）。应显示 cancel-at，当前付费周期内继续可用。实际 `subscription.canceled` 若仍包含未来的当前周期结束时间，也保留至该日；否则到 `canceled_at` / now 截断。另测 paused 立即失效并记录 paused，resumed 后按 active 周期恢复；trialing / imported 事件也应授予 active / trialing 周期权限。
7. 退款：在 dashboard 找到交易，创建 refund；或用 simulator 发相关 transaction/subscription ID、`action:'refund'` / `'chargeback'`、`status:'approved'` 的 adjustment。pending_approval 不撤销权限；仅 approved 且 type 不是 partial 的 refund / chargeback 立即撤销。partial refund 和 chargeback_reverse 只记录 payment_events，不撤销。Sandbox 退款可能需等待约 10 分钟审批；同时监听 created / updated。管理员仍是 admin，不被降级。
8. 验证过期：用管理员面板给测试 VIP 设置过去的日期，或在受控测试数据中设置 `vip_until` 为过去；刷新 entitlement 为 false，flight-proxy 返回 `403 VIP only`。面板 expiry 为空表示无期限；日期按该日 UTC 23:59:59 结束。撤销选择 normal。
9. 回归 `PAYMENTS_ENABLED=false`：trips 无 pricing nav、无升级/有效期控件、锁定按钮保持原行为，不加载 Paddle SDK、不调用 entitlement RPC；直接访问 pricing 显示 coming soon。

## Supabase 核对

在受控后台 SQL Editor 查看（不要把含个人数据的 payload 发到公开日志）：

```sql
select event_id, event_type, occurred_at, user_id, result
from public.payment_events order by processed_at desc limit 20;
select id, user_id, plan, status, current_period_end, cancel_at, last_event_at
from public.subscriptions order by updated_at desc limit 20;
select id, role, vip_until, paddle_customer_id from public.profiles;
```

前端用登录用户自己的 JWT 执行 `supabase.rpc('my_entitlement')`，预期 `{role, effective_role, is_vip, vip_until, plan, subscription_status, cancel_at}`。SQL Editor 默认没有用户 JWT；可在事务内设置测试用户（结束 rollback）：

```sql
begin;
select set_config('request.jwt.claim.sub', '<测试用户 UUID>', true);
set local role authenticated;
select public.my_entitlement();
rollback;
```

确认普通用户只能 SELECT 自己的 subscription；不能 INSERT/UPDATE/DELETE，也不能更改 profiles.role / vip_until / paddle_customer_id。authenticated 只有 role、vip_until 的列级 UPDATE grant，且仍受 admin-only RLS 限制；管理员可走原面板路径。`payment_events` 对 anon/authenticated 完全不可见。`private.effective_vip` 和原子写入 RPC `apply_paddle_event` 仅 service_role 可执行；用户 RPC 只读取 auth.uid() 本人。

## 行为选择与边界

- Compute-on-read 是唯一到期机制，无 cron。保留数据库原始 `role='vip'`，权限取决于 `vip_until`；`null` 表示人工永久 VIP，admin 始终有效。
- `past_due` 保留到 `current_billing_period.ends_at`，不另加 grace period。支付不会缩短人工永久 VIP；明确批准退款/chargeback 会立即设置到期为 now（admin 除外）。
- subscription transactions 若带 billing_period 则赋予对应有效期，否则只记录 customer、交易关联并等待 subscription events。subscriptions 也存储 one-time transaction rows 与 recurring transaction aliases，供退款按 transaction ID 查找用户；因此每个用户可能有多行。会员页面显示最近事件行。
- 退款按当前单一用户会员到期值撤销；尚未实现多个并行订阅/通行证的独立权益合并。正式上线前应决定是否允许叠加购买，；部分退款仅记录、不撤销权益。
- Webhook 使用 raw text 的 HMAC-SHA256，支持多个 h1，默认允许服务器时间前后 300 秒。旧 event occurred_at 可用于重放测试，但 header ts 必须新鲜；同 event_id 去重。数据库事务将 profile/subscription 更新和 receipt 一并提交，失败回滚、Paddle 可重试；并发 snapshot 冲突最多重算三次后返回 500 交由重试。
- 未能解析用户的受支持事件返回 500，不吞掉付款；优先 custom_data.user_id，再 subscription / transaction row，最后 customer ID。Simulator 请使用已有 profile 的 UUID。
- 前端 feature flag 关闭支付入口与新 UI，不删除已有付费权限、不终止 Paddle 自动续费，也不关闭安全 webhook；如需停收款/终止订阅，还需在 Paddle 单独操作。
- 提醒、每月 20 次配额和新路线规划仍为方案草稿/待上线能力；页面明确说明当前支持航班查询与建议，本改动没有新增提醒或配额后端。

## 切换 live（本次不执行）

1. 开通独立 live 账户，完成业务验证、域名 approval / verification。
2. 建 live products / prices，替换三个 price IDs 和对应 Supabase secrets。
3. 使用 live client-side token（`live_...`），`PADDLE.environment='production'`。
4. 创建 live notification destination，同一事件列表、全新 webhook secret；不要复用 sandbox secret。正式切换前清理或隔离沙盒账务数据，避免混合 sandbox/live customer IDs；保留审计记录。
5. 审核并定稿 terms/privacy/refund，移除 Draft banner；确认适用消费者保护、退款规则和 Paddle 审核要求。核实商业天气数据 licence（包括现有数据供应商与地图/航班服务的商业使用许可）。
6. 完成端到端验收后，才在 main 开启 `PAYMENTS_ENABLED` 并走另行授权的部署流程。

## 回滚

将 `js/config.js` 的 `PAYMENTS_ENABLED` 改为 `false` 并通过授权流程发布。保留 additive migration、审计记录和 webhook，以便继续处理已存在订阅的取消/退款。该 flag 只关闭新入口；不会停止 Paddle 的现有 recurring billing。

## 本地检查

```sh
node --experimental-strip-types --test tests/
node --check scripts/paddle-setup.mjs
node scripts/paddle-setup.mjs --dry-run
node --check js/config.js
node --check js/i18n.js
node --check js/app.js
node --check js/trips.js
node --check js/payments.js
node --check js/payment-pages.js
```

参考：[Paddle signatures](https://developer.paddle.com/webhooks/about/signature-verification/)、[Sandbox](https://developer.paddle.com/sdks/sandbox)、[Adjustment updated / sandbox refund approval](https://developer.paddle.com/webhooks/adjustments/adjustment-updated)、[Supabase Edge authentication](https://supabase.com/docs/guides/functions/auth)。
