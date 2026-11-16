# 隐藏开发说明热修复记录

分支：`wip/hide-devnotes`。未提交、未推送。

## 已改写

- `flight.providerOffTitle`（`js/i18n.js`）：五语旧文案“实时航班数据：未接入 / Live flight data: not connected / Dữ liệu bay thực tế: chưa kết nối / ข้อมูลเที่ยวบินสด: ยังไม่เชื่อมต่อ / Data penerbangan langsung: belum terhubung” → “航班信息提示 / Flight information / Thông tin chuyến bay / ข้อมูลเที่ยวบิน / Informasi penerbangan”。
- `flight.providerOffText`（`js/i18n.js`）：五语说明第三方接口、账号与密钥的旧文案 → 五语“航班状态请以机场或航司官方信息为准”自然译文。此键保留兼容但不再显示在关闭状态提示中。
- `flight.keyHint`（`js/i18n.js`）：五语含 `VARIFLIGHT_API_KEY`、`AVIATIONSTACK_API_KEY`、环境变量和每日任务的说明 → 空字符串（不展示）。
- 新增 `flight.officialHint`（`js/i18n.js`）：五语短提示“航班状态请以机场或航司官方信息为准”。
- 机场航班关闭状态（`js/app.js`）：原先渲染 `providerOffTitle`、`providerOffText`、`keyHint` 的开发说明框 → 只显示 `flight.officialHint` 一行。
- `trips.databaseSetup`（`js/i18n.js`）：五语要求管理员运行迁移、检查权限的技术错误 → “行程功能暂时不可用，请稍后再试”五语译文。
- `trips.flightVip`（`js/i18n.js`）：五语“联系管理员开通” → 五语“VIP 功能，即将开放”译文。
- `pricing.pending`（`js/i18n.js`）：五语支付价格尚不可用的文案；越南语移除“đang chờ sandbox”，泰语与印尼语同样移除沙盒状态。
- `footer.method`（`js/i18n.js`）：五语航班状态“默认未接入/需账号与 Key” → 以机场/航司官方信息核实的用户提示。
- `js/payment-pages.js`：`pricing.sandbox` 仅在管理员（`effective_role || role === 'admin'`）或 `payments_beta === true` 时显示；管理员状态仍单独展示，普通 VIP 用户的状态区不显示管理员文案。
- `js/data.js`：用户可读航班提供方说明由接口/Key/本机任务描述改为官方核实提示，并移除内部提供方标记清单。
- `data/flights.json`：`note` 的 `No key configured. Official flight boards + weather inference only.` → `Check official airport or airline information for flight status.`
- `js/app.js`、`js/trips.js`：清理包含 API Key、未接入、MCP 的开发注释；仅调整注释，不改业务逻辑。

### 文案逐项（按 zh / en / vi / th / id）

- `flight.providerOffTitle`：原“实时航班数据：未接入 / Live flight data: not connected / Dữ liệu bay thực tế: chưa kết nối / ข้อมูลเที่ยวบินสด: ยังไม่เชื่อมต่อ / Data penerbangan langsung: belum terhubung” → “航班信息提示 / Flight information / Thông tin chuyến bay / ข้อมูลเที่ยวบิน / Informasi penerbangan”。
- `flight.providerOffText`：原“飞常准 MCP / Aviationstack 等正式接口需要账号与 API Key。本站默认走「官方链接 + 天气推断」，Key 只保存在本机每日更新脚本的环境变量中，页面不含任何密钥。 / Official APIs (VariFlight MCP, Aviationstack, etc.) require an account and key. This site defaults to official links + weather inference; keys stay in the local updater environment only. / Các API chính thức (VariFlight MCP, Aviationstack…) cần tài khoản và API Key. Trang mặc định dùng liên kết chính thức + suy luận thời tiết; Key chỉ lưu ở biến môi trường trên máy chạy cập nhật. / API ทางการ (VariFlight MCP, Aviationstack ฯลฯ) ต้องมีบัญชีและ Key เว็บนี้ใช้ลิงก์ทางการ + การประเมินอากาศ และ Key เก็บเฉพาะในตัวแปรสภาพแวดล้อมของเครื่องอัปเดต / API resmi (VariFlight MCP, Aviationstack, dll.) memerlukan akun dan kunci. Situs ini memakai tautan resmi + inferensi cuaca; kunci hanya tersimpan di variabel lingkungan mesin pembaruan。” → 上述五语官方核实提示（整段替换，不再包含接口配置说明）。
- `flight.keyHint`：原五语均为如何填写 `VARIFLIGHT_API_KEY` / `AVIATIONSTACK_API_KEY` 的每日更新配置步骤 → 五语空字符串（隐藏）。
- 新增 `flight.officialHint`：五语依序为“航班状态请以机场或航司官方信息为准 / Please check official airport or airline information for flight status. / Vui lòng xem thông tin chính thức từ sân bay hoặc hãng hàng không để biết tình trạng chuyến bay. / โปรดตรวจสอบสถานะเที่ยวบินจากข้อมูลทางการของสนามบินหรือสายการบิน / Periksa informasi resmi bandara atau maskapai untuk status penerbangan.”
- `trips.databaseSetup`：原五语分别要求管理员运行迁移并检查权限（“行程数据库尚未配置完成，请管理员运行数据库迁移并检查访问权限后重试。”及相应英、越、泰、印尼译文）→ “行程功能暂时不可用，请稍后再试。 / Trips are temporarily unavailable. Please try again later. / Tính năng hành trình tạm thời không khả dụng. Vui lòng thử lại sau. / ฟังก์ชันทริปไม่พร้อมใช้งานชั่วคราว โปรดลองอีกครั้งภายหลัง / Fitur perjalanan sementara tidak tersedia. Silakan coba lagi nanti.”
- `trips.flightVip`：原五语分别为“航班查询为 VIP 专属功能，请联系管理员开通。”、“Flight lookups are for VIP members. Contact the admin for access.”、“Tra cứu chuyến bay dành cho VIP. Liên hệ quản trị viên để được cấp quyền.”、“การค้นหาเที่ยวบินสำหรับ VIP โปรดติดต่อผู้ดูแลเพื่อขอสิทธิ์”、“Pencarian penerbangan khusus VIP. Hubungi admin untuk akses.” → “VIP 功能，即将开放。 / VIP flight lookup is coming soon. / Tra cứu chuyến bay VIP sẽ sớm ra mắt. / บริการค้นหาเที่ยวบิน VIP จะเปิดให้ใช้เร็ว ๆ นี้ / Fitur pencarian penerbangan VIP segera hadir.”
- `pricing.pending`：原英文及中文为价格尚未配置，越文含“(đang chờ sandbox)”，泰文含“(รอแซนด์บ็อกซ์)”，印尼文含“(sandbox menunggu)” → “支付价格暂不可用。 / Payment pricing is temporarily unavailable. / Giá thanh toán hiện tạm thời chưa khả dụng. / ราคาชำระเงินยังไม่พร้อมใช้งานชั่วคราว / Harga pembayaran sementara tidak tersedia.”
- `footer.method`：五语各自仅将“航班实时状态：默认未接入，需账号与 Key” / “Live flight status: not connected by default (account & key required)” / “Trạng thái bay thực tế: mặc định chưa kết nối” / “สถานะบินสด: ยังไม่เชื่อมต่อตามค่าเริ่มต้น” / “Status penerbangan langsung: belum terhubung secara default” 替换为对应语言官方信息核实提示；其余天气风险方法说明保留。
- `data/flights.json` 的 `note`：`No key configured. Official flight boards + weather inference only.` → `Check official airport or airline information for flight status.`；`js/data.js` 的 `flightProvider.note` 同样改为该句，`supported` 从内部提供方名列表改为空列表。

## 已隐藏 / 保留

- `flight.providerOffText` 与 `flight.keyHint` 现不参与普通用户关闭状态渲染；页面直接使用单行 `flight.officialHint`。
- `pricing.sandbox`、`pricing.adminStatus`：保留对应字典文案，分别由管理员/`payments_beta` UI 门控；未改支付流程、价格 ID、Supabase、Webhook 或联盟代码。
- `trips.paymentHint`：按要求保留，未含环境变量或密钥说明。
- `privacy.html` 中的 `Draft privacy policy / 隐私政策草稿`：保留（待 Stephen 决定）；按要求未改隐私法律文本。
- `legal.draft` / `legal.refund` 及条款页法律草稿标记：保留为法律审阅状态，不属于集成配置说明。
- `scripts/` 中的数据更新、支付配置开发说明，以及 `js/config.js`、`js/payments.js` 的运行配置/支付环境逻辑：属于维护代码或支付配置，不是普通页面文案；未改支付逻辑或配置。
- `data/*.json`：检查了所有数据文件；除航班数据 `note` 外，未发现含本次目标开发说明词的用户可见字段。

## 验收文件

- `tests/hide-devnotes.test.mjs`：检查 i18n 文案与静态 HTML，不允许出现 API_KEY、API Key、环境变量、environment variable、MCP、VARIFLIGHT、AVIATIONSTACK、TODO。
- `scripts/hide-devnotes-playwright.mjs`：本地 HTTP 服务和登录登出态页面验收脚本，覆盖首页、仓库现有全部六个国家页（vn、th、my、sg、id、ph）、定价页、行程页五种语言及城市页高度上限。当前沙盒不运行浏览器；由包装脚本在 Mac 上执行。

## 补充：法律页「草稿 / Draft」字样（Stephen 决定，已改写）

| 位置 | 原文 | 处理 |
|---|---|---|
| js/payment-pages.js 条款页 / 隐私页顶部提示 legal.draft | 草稿·待审 / Draft – pending review（5 种语言） | 已改写：不再渲染这条提示 |
| 条款页正文开头 | Draft service terms / 服务条款草稿： | 已改写：删除前缀，正文不变 |
| 隐私页正文开头 | Draft privacy policy / 隐私政策草稿： | 已改写：删除前缀，正文不变 |
| 退款段 | DRAFT, pending review: / 草稿待审： | 已改写：删除前缀，正文不变 |
| 退款段结尾 | These drafts must be reviewed before live sales. 上线真实支付前须完成审核。 | 已改写：删除这句 |
| i18n legal.refund | 退款政策（草稿）等 5 种语言 | 已改写：去掉「草稿 / draft」 |

另：Codex 把价格页会员状态的显示条件改成了 `admin || beta && vip`，会让非 beta 的 VIP 看不到自己的会员状态，已改回 `admin || vip`（pricing.adminStatus 本来就只给 admin）。
