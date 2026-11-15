# hospital-3 修复报告

分支 `wip/hospitals-vn-th`。应用改动提交 `5fa29c6`，本报告与验收脚本为后续提交。基线对照取自 `c37d41a` 的 git worktree（`/tmp/h2`，测完已移除）。未 push、未合并。工作树里未跟踪的 `node_modules/` 是 vitest 缓存，未安装 Playwright，也未纳入提交。

## 实施

- 桌面和移动端的城市列表均默认显示前 5 城，其他城市通过「显示全部 / 展开全部」展开。
- 景点桌面卡片使用四卡可视宽度的横向轨道；展开后增加可横向滚动的卡片，不再产生新网格行。卡片图片维持 `object-fit: cover` 和 16:10 比例；署名作者可省略，许可链接保留。
- 医院移动卡片缩小垂直留白；拨打链接与本地号码合并，点击高度实测 44px，链接继续使用 E.164 `tel:`。
- 急救电话按国家数据渲染为可点击的 `tel:` 链接。岘港为 `tel:115`。
- 从医院清单移除「Trung tâm Y tế quận Hải Châu」：名称和官方卫生部门页面表明它是区级卫生中心，达不到本项目医院目录的收录标准。岘港剩余 5 家。
- 「Bệnh viện Đa khoa Bình Dân」补回越南语声调，依据院方名称与越南卫生部机构目录核实。

## 高度与视觉验收

最差情况 = 只展开目标城市 + 点击「医院更多」（若有）+ 点击「景点更多」（若有，移动端该按钮本身隐藏）。单位 px。

| 城市 | 390 改前 | 390 改后 | 390 上限 | 1280 改前 | 1280 改后 | 1280 上限 |
|---|---:|---:|---:|---:|---:|---:|
| danang | 3587 | 3455 | 5000 | 3242 | **2747** | 3000 |
| hcm | 3621 | 3613 | 5000 | 3148 | **2941** | 3000 |
| samutsakhon | 3478 | 3466 | 5000 | 2713 | 2751 | 3000 |
| bangkok | 2919 | 2915 | 5000 | 2956 | **2531** | 3000 |

改后四种宽度全部达标。岘港 / 胡志明市桌面高度从超限降到 3000 以内，主要来自景点改为横向展开。北榄府 1280 由 2713 升到 2751（+38，仍低于上限），因为该城景点不超过 4 个、没有纵向网格可收，而桌面现在也会显示「展开全部」城市按钮。

### 移动端医院区块（岘港 390，全部展开）

| 项 | 改前 | 改后 | 上限 |
|---|---:|---:|---:|
| `.hospitals` 高度 | 818 | **686** | 700 |
| 展开后医院条数 | 6 | 5（已去掉区卫生中心） | 最多 6 |
| 拨打按钮最小点击高度 | 44 | 44 | ≥44 |

医院区块 686px，低于 700，余量约 14px。

## 急救电话与定位

- 岘港急救链接实测 `href="tel:115"`（390 与 1280 均通过）。泰国页面急救为 `tel:1669`，符合数据。
- Playwright 授予 geolocation 后点击「用我的位置」：
  - 岘港（16.0715, 108.2155）→ 最近城市 `vn/danang`，列表首条「Bệnh viện Đà Nẵng」，状态「已按距离排序」。
  - 曼谷（13.7563, 100.5018）→ 最近城市 `th/bangkok`，列表首条「โรงพยาบาลธนบุรีบำรุงเมือง」，状态「已按距离排序」。
- 两端到端均通过。

## 数据核对

- 已移除 `osm:way/1226646134` 海珠区卫生中心。
- `osm:node/729405667` 名称改为 `Bệnh viện Đa khoa Bình Dân`；来源：[院方官网](https://binhdanhospital.vn/)、[越南卫生部医院目录](https://benhandientu.moh.gov.vn/benh-vien/1214/benh-vien-da-khoa-binh-dan-cong-ty-tnhh-benh-vien-da-khoa-binh-dan)。
- 已扫当前医院数据名称，未发现其他 health center、clinic 或 medical centre 条目。
- 6 个 PTI 标记尚未对照 PTI 最新名册复核（仍待上线前检查）。

## 视觉检查

Gemini（`gemini-3-flash-preview`）预检了岘港/胡志明市的 1280 与 390 全页截图，结论是没有明显重叠、截断、图片变形、许可署名截断或标签错位。

人工抽查（岘港桌面景点区、岘港移动医院区，使用元素截图避免 sticky 顶栏在全页长图里的拼接伪影）：

- 桌面景点四卡横向排列，16:10，未见拉伸。署名完整：Jean-Pierre Dalbéra · CC BY 2.0、Dragfyre · CC BY-SA 3.0、CEphoto, Uwe Aranas · CC BY-SA 3.0、Mosbatho · CC BY 4.0。标题右侧的「7」是景点数量，不是错位。
- 移动医院区：标题「应急医院」、粉色「急救 115」、5 家卡片、拨打按钮与号码同一行、地址一行、OSM 注记完整。标签整齐。
- 移动景点作者名可能被省略号截断（如 Jean-Pierre D…），许可「CC BY 2.0」等仍完整，与「署名作者可省略，许可链接保留」一致。

### 残留问题（未改应用代码）

1. 点击城市行里的「医院」跳转时，`scrollIntoView({ block: "start" })` 没有给 sticky `.topbar`（移动端约 92px）留出 `scroll-margin-top`，标题和「急救 115」会被顶栏挡住，需要再向上滚一点才能看到、点到。链接本身是对的，高度 44px。建议后续给 `.hospitals` 加 `scroll-margin-top`。
2. Playwright 全页长图会把 sticky 顶栏重复叠在中段内容上，这是截图拼接问题，不是页面上真的一直重叠。
3. 桌面点击「景点更多」后按钮隐藏，多出的卡片只能横向滑；四卡刚好铺满宽度，第 5 张几乎露不出来，可发现性一般。高度已经达标，本轮未改。

## 测试与脚本

- `PATH="$PWD/.venv/bin:$PATH" node --test`：62 项通过，0 失败。
- `scripts/hospital-3-playwright.mjs`：已修好验收脚本（不是为了让测试过而改页面）：
  - 目标城市若在前 5 城之外（`.city-extra`），先点 `.city-more` 再展开该行。
  - 对不存在或隐藏的 `.hosp-more` / `.attr-more` 不再空等 30 秒。
  - 超限或断言失败会记录后继续测完，最后统一给出结果。
  - 可用 `HOSPITAL3_ROOT` 指向 worktree 测基线；`HOSPITAL3_ASSERT=0`、`HOSPITAL3_SHOTS=0` 只测高度不截图。
- 运行：`cd ~/WorkBuddy/stw-fallback && NODE_PATH=~/WorkBuddy/pw/node_modules node scripts/hospital-3-playwright.mjs`
- 本轮验收：`~/WorkBuddy/cards/hospital-3-pw3.log`（改后，failures 空，EXIT=0）；`~/WorkBuddy/cards/hospital-3-pw3-baseline.log`（`c37d41a` 基线）。
- 截图（Mac）：`~/WorkBuddy/cards/shots/hospital-3-*.png`；同步到 box 的 `/workspace/shots/hospital-3-*.png`。另有元素截图 `hospital-3-el-*.png`（含去掉顶栏遮挡后的 `hospital-3-el-hospitals-danang-390-clear.png`），未提交进仓库。
