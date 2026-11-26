# 法律与同意体验准备记录

## 本次改动

- GA4 仅在 `vietnamstephen.github.io` 启用。首次访问先将 Consent Mode v2 四项同意设为拒绝；访客接受后才加载 `gtag.js` 并发送配置，拒绝状态不会请求 Google Analytics / Tag Manager。选择保存在浏览器本地；页脚“Cookie 设置”可重新打开选择框。改为拒绝时更新同意并清理当前站点 `_ga*` Cookie。
- 新增 `refund.html`，使用与服务条款相同的页眉、页脚和页面资源；退款段落由同一渲染函数提供。站点地图生成器与 `sitemap.xml` 已包含该页。
- 定价按钮下新增服务条款和退款政策链接；页脚加入五语联系邮箱和 Cookie 设置入口。
- 定价及权益的用户文案统一采用“行程包访问权 / Trip Pack access”等名称，并标注 7 天、1 个月和 1 年期限。

## 退款政策（已定稿）

7 天、1 个月和 1 年方案均可在每次购买或续费后 14 天内申请全额退款。服务条款的 `#refund` 段落、独立退款页及三个购买按钮旁的协议提示共用同一句五语文案。两处法律页面还提供 Paddle 收据、联系邮箱、交易号要求及退款获批后的访问权说明。

## 受保护文件改动清单

以下按当前工作区与 HEAD 的差异列出，包含上轮保留的改动及新增文件。

| 文件 | 实际改动 |
| --- | --- |
| `js/account.js` | 已登录付费用户的账号徽标由固定的 VIP 改为本地化行程包标签。改动仅涉及显示文字，原有权益判断、购买流程和付款调用均未改动。 |
| `js/payment-pages.js` | 调整方案标题、标签和法律链接，在条款页和退款页渲染五语退款政策，并在每个购买按钮旁显示退款期限和协议链接。 |
| `pricing.html` | 浏览器标题由“会员方案”改为“行程包方案”。 |
| `js/i18n.js` | 调整方案、账号及行程权益文案，新增五语退款、协议、Cookie 和联系文案；五个天气、洪水和趋势词条的五语值均与 HEAD 一致。 |
| `terms.html` | 增加条款页的 canonical 地址；退款正文由页面脚本按当前语言生成。 |
| `refund.html` | 新增独立退款页，带 canonical 地址，并复用法律页面的渲染脚本。 |
| `css/style.css` | 增加购买协议提示、Cookie 同意横幅及页脚法律入口样式。 |
| `js/app.js` | 按访客选择加载 GA，保存 Cookie 偏好，增加页脚设置与联系入口。 |
| `scripts/gen_sitemap.mjs` | 将退款页加入站点地图生成列表。 |
| `sitemap.xml` | 增加退款页地址。 |
| `tests/brand-seo.test.mjs` | 更新 GA 单元断言，检查生产域名限制和接受后加载。 |
| `tests/legal-prep.test.mjs` | 检查同意选择、五语政策、协议引用、定价名称范围及退款页站点地图条目。 |
| `scripts/legal-prep-playwright.mjs` | 在模拟生产域名上统计 GA 请求，并逐语言检查条款、退款页及三个购买按钮的协议。 |
| `docs/reports/legal-prep.md` | 记录最终政策、受保护文件差异与验收结果。 |

`js/payments.js`、`js/config.js` 和 `supabase/` 与 HEAD 一致。此次变更未修改价格 ID、支付处理、Webhook、Supabase 配置或数据库。

## 拒绝 Cookie 后的 GA 请求数

首次访问选择拒绝时，页面保存拒绝状态，跳过 GA 加载；再次打开页面时也会读取这一选择。Node 单元测试触发拒绝按钮，检查模拟脚本加载器中的 GA 请求数为 0；随后触发接受按钮，检查加载地址为 Google Tag Manager 的 `/gtag/js`。

Playwright 在首次导航前监听浏览器的 `request` 事件，统计所有发往 `google-analytics.com`、`googletagmanager.com` 及其子域名的请求。点击拒绝后断言累计请求数等于 0，再次访问后再次断言等于 0，并检查没有 `_ga*` Cookie。随后从页脚重新打开设置并接受，断言浏览器请求一次 `gtag.js`，并观察到测试替身脚本执行后发起的收集请求。

## 验收结果

- `PATH="$PWD/.venv/bin:$PATH" node --test`：76 项通过，0 项失败，0 项跳过。
- `NODE_PATH=~/WorkBuddy/pw/node_modules node scripts/legal-prep-playwright.mjs`：当前 macOS 沙盒拒绝 Chromium 注册 Mach 端口，浏览器在打开页面前退出。本次未取得浏览器实测请求数。

品牌与 SEO 的 Playwright 检查此前要求首次打开生产页面后立即出现 GA 收集请求。此次改为先验证收集请求数为零，再点击同意并等待真实的收集请求，同时保留对衡量 ID 的检查。localhost 仍须保持零请求。

城市页高度比较需使用相同的天气快照。此分支的 11 月 15 日快照会触发 36 小时未更新提示，桌面约增加 60 px；已同步 origin/main 的 11 月 21 日数据。页脚入口放在原有短标题行，避免占用移动端的更新说明行。Cookie 横幅继续固定在视口底部。

本轮 `node --test` 通过全部 76 项。沙盒拒绝 Playwright 测试服务监听 127.0.0.1，也拒绝 Chromium 注册 Mach 端口，因此本轮未实测城市页高度或接受后的生产 GA 请求。
