# hospital-4 城市默认展示修复报告

分支：`wip/hospitals-vn-th`，基于 hospital-3 `51e4080`。本轮已在 Mac 终端完成 Playwright 验收、截图、单元测试与单独 commit。未 push、未合并。

## 改动

- 越南前五默认顺序固定为胡志明、河内、岘港、芽庄、富国；泰国为曼谷、清迈、普吉、芭提雅、春武里。医院城市数据无华欣对应 ID，故依卡片规则顺延到实际存在的 `chonburi`。
- 「显示全部」增加总城市数和剩余城市数，支持中文、英文、越南文、泰文、印尼文。例如中文「显示全部 12 个城市（还有 7 个）」。
- 城市链接支持 `?city=<id>`、`#city=<id>` 与 `#<id>`；目标在折叠区时先展开城市列表，再展开目标卡片并滚动定位。医院定位成功后，最近城市若属于当前国家，也会执行同样的展开与滚动。
- `.hospitals` 与 `.city-row` 依据实际吸顶 `.topbar` 高度设置 `scroll-margin-top`，避免跳转后标题和急救电话被遮挡。
- **滚动修复：** `revealCity` 原先在一次 `requestAnimationFrame` 里对 `.hospitals`（若已插入）调用 `scrollIntoView`。定位到折叠区城市（如春武里府的 Samut Sakhon）时，`hospitals.json` 往往已缓存，医院区块会在下一帧前插入，于是页面滚到医院区块，城市标题被送到视口上方（验收曾测到 `top: -332`，吸顶栏底 91.75）。现改为等 `show-all` 与 `<details>` 展开完成布局（双 `requestAnimationFrame`）后，滚动目标改为城市行 `.city-row` 本身，并沿用 `scroll-margin-top`。
- 扩展 `scripts/hospital-3-playwright.mjs`：检查四城两种宽度高度、默认顺序、数量文案、query/hash 跳转、定位到隐藏城市、医院行内跳转可见性、既有岘港医院区块/拨打区域/tel 链接及定位排序。截图前缀 `hospital-4-`，输出到 `~/WorkBuddy/cards/shots/`。

## 验收

- `PATH="$PWD/.venv/bin:$PATH" node --test`：62/62 通过。
- `NODE_PATH=~/WorkBuddy/pw/node_modules node scripts/hospital-3-playwright.mjs`：通过，`failures: []`（2026-11-16 02:47 Asia/Saigon）。此前 02:43 仅 1 项失败（定位到 Samut Sakhon 滚过了目标），代码修复后复跑已通过。

### 卡片 6 项

| # | 要求 | 结果 |
|---|---|---|
| 1 | 默认 5 城按热度固定顺序 | 通过。越南 `hcm, hanoi, danang, nhatrang, phuquoc`；泰国 `bangkok, chiangmai, phuket, pattaya, chonburi`（无华欣 id，顺延春武里）。 |
| 2 | 链接 / 搜索 / 定位跳到折叠区城市时自动展开并滚动，标题和急救号码在吸顶栏下方可见 | 通过。`?city=quynhon`、`#quynhon`、`#city=quynhon` 均展开并打开归仁；定位到 Samut Sakhon 展开并滚动（修复后不再滚过）；岘港行内「医院」跳转后「应急医院」标题和「急救 115」在吸顶栏下方可见。 |
| 3 | 「显示全部 N 个城市（还有 M 个）」五种语言 | 通过。中英越泰印尼文案已写入 `js/i18n.js`；验收脚本确认按钮包含总数和剩余数。截图可见「显示全部 12 个城市（还有 7 个）」。 |
| 4 | 四城最差情况高度：390 ≤ 5000，1280 ≤ 3000；超限只报数字，不自行改为 4 城 | 通过，见下表。默认仍为 5 城，未压缩。 |
| 5 | 跳转预留吸顶栏高度，标题和急救可见 | 通过。见第 2 项与 `hospital-4-jump-danang-390.png`、`hospital-4-city-query.png`。 |
| 6 | hospital-3 已达标项不回退：岘港移动端医院区块 ≤700px，拨打点击区 ≥44px，tel: 链接，定位 E2E | 通过。岘港 390 医院区块 **686px**；所有拨打区最小高度 44px；急救为 `tel:115` / `tel:1669`；岘港、曼谷定位 E2E 均按距离排序且最近医院名称正确。 |

### 高度表（Playwright 实测，Asia/Saigon 02:47）

| 城市 | 390 宽高度（上限 5000） | 1280 宽高度（上限 3000） | 390 医院区块高度 | 医院数 | 拨打最小高度 |
|---|---:|---:|---:|---:|---:|
| 岘港 danang | 3455 | 2747 | 686（≤700） | 5 | 44 |
| 胡志明 hcm | 3147 | 2635 | 362 | 2 | 44 |
| 龙仔厝 samutsakhon | 3466 | 2751 | 470 | 3 | 44 |
| 曼谷 bangkok | 2915 | 2531 | 236 | 1 | 44 |

1280 宽距上限最近的是龙仔厝 2751（余 249px）和岘港 2747（余 253px），均未超限。

## 截图与目视

截图目录：`~/WorkBuddy/cards/shots/hospital-4-*.png`，已拷到 box `/workspace/shots/`：

- `hospital-4-vn-danang-1280.png` / `hospital-4-vn-danang-390.png`
- `hospital-4-vn-hcm-1280.png` / `hospital-4-vn-hcm-390.png`
- `hospital-4-th-samutsakhon-1280.png` / `hospital-4-th-samutsakhon-390.png`
- `hospital-4-th-bangkok-1280.png` / `hospital-4-th-bangkok-390.png`
- `hospital-4-city-query.png`（`?city=quynhon` 视口图）
- `hospital-4-jump-danang-390.png`（行内医院跳转后的医院区块）

Gemini（`gemini-3-flash-preview`）检查了岘港 1280、岘港 390、跳转 390、胡志明 1280 四张。它报告整页图中蓝色吸顶栏遮挡了「应急医院」内容。这是 Playwright `fullPage` 截图把 `position: sticky/fixed` 的顶栏画在长图中部的常见伪影，不是实际滚动时顶栏离开页面顶部。视口截图 `hospital-4-city-query.png` 中顶栏在页面顶部，归仁标题、「应急医院」和「急救 115」均在顶栏下方完整可见。跳转局部图中标题、急救 115、拨打按钮和 OSM 署名完整。景点图未变形，许可署名可见。Gemini 另提到降雨表图标与数字间距偏紧，属既有样式，本轮未改。中文界面仍有 “Zone 5 Military Museum” 英文名，已列入 hospital-5 必修项。建议后续整页截图前将 header 设为 `position:static`（hospital-5 建议项）。

人工抽查了上述岘港 1280/390、跳转 390、归仁 query、胡志明 1280，结论与上相同：未发现真实的顶栏遮挡、图片变形或署名截断。
