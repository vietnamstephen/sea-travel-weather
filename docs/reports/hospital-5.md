# hospital-5 设计验收报告

分支：`wip/hospitals-vn-th`。目标基于 hospital-4；本轮未 push / 合并。仓库沙盒禁止写 `.git`，所以无法在这里创建任务卡要求的单独 commit。

## 完成的实现

- 桌面景点轨道：5 张及以上时按 `(100% - 48px)/4.4` 显示卡片，间距 16px；最多 4 张时等分。滚动位置通过 `is-start` / `is-end` 更新渐隐和箭头；箭头在支持 hover 的桌面显示，按三张卡片宽度滚动，并遵从 reduced-motion。移动端规则未改。
- 医院区块沿用 hospital-4 的默认 3 家、带 `+N` 的更多按钮和五种语言文案；OSM 来源文字增加 2px 左内边距，与医院卡片内容左边缘对齐（桌面 10px，窄屏 8px）。
- 中文景点名回退顺序为 `data/attractions_overrides.json` 覆盖 → Wikidata 中文标签（zh-hans / zh-cn / zh，繁体经 OpenCC 转简体，已落入 `name.zh`）→ 当地语言名；界面不回退英文。
- Zone 5 Military Museum 改为「第五军区博物馆」；Son Tra Guanyin 改为「山茶半岛灵应寺观音像」。另为当前 91 条空中文/英文同名记录补覆盖或本地名，脚本 `scripts/list_missing_attraction_zh.py` 输出逐条清单；本报告下方附清单。对纯拉丁专名的部分条目标出待当地母语者复核。
- March 29 Park 增加 Wikimedia Commons 图片 [Martin Lewison 的照片](https://commons.wikimedia.org/wiki/File:March_29_Park,_Da_Nang_(49358095917).jpg)，标注作者 Martin Lewison 与 CC BY 2.0，许可证链接已写入数据。图像来自公园类别页内文件列表，许可证和作者信息以文件页为准。
- 新增 `scripts/hospital-5-playwright.mjs`：自带本地 HTTP 服务，使用 `createRequire` 加载 Playwright；生成岘港 1280/390 整页图、桌面轨道图和四城两种视口高度数据。整页截图前只在脚本中把 header 改为 `position:static`。

## 自动化验收状态

### hospital-5g 修复（2026-11-16）

- 中文名显示恢复覆盖 → Wikidata `name.zh`（构建端依次选 zh-hans / zh-cn / zh，繁体转简体）→ 当地语言名；岘港前三项保留为「岘港占族雕刻艺术博物馆」「耶稣圣心主教座堂」「灵应寺」。缺中文名清单已重生成：0 条。
- `.attr-nav` 与 `.attr-arrow` 默认隐藏；仅 `(hover:hover) and (min-width:768px)` 且轨道溢出时启用，导航层绝对定位在相对定位轨道上。手机岘港增加景点区约 220px 及箭头不可见断言。医院到景点区的空白来自两区块相邻各自的 12px 上边距；景点区改为 4px，并略减上内边距。
- 新增对比 `d96937c:data/attractions.json` 的 node 回归测试，旧有中文名丢失数为 0。
- `PATH="$PWD/.venv/bin:$PATH" node --test`：64/64 通过。Playwright 受沙盒限制未运行；四城本轮实测高度、浏览器断言和截图仍待 Mac 包装环境运行。脚本只会写 `hospital-5-danang-390.png` 与 `hospital-5-danang-rail.png`。

### hospital-5c 窄修

- Samut Sakhon 桌面整页高度在 Mac 复跑为 3010px，超出 3000px 限制 10px。将 `.shell` 底部留白从 40px 收至 30px，压缩整页高度 10px；不改变卡片/医院块、P6 景点内容或默认城市数。移动端医院区块高度不受此规则内部布局影响，页面外部留白仅缩短。
- 为桌面溢出轨道的起点下一页箭头和终点上一页箭头增加明确显示规则，避免通用隐藏规则覆盖箭头；Playwright 点击改为限定在 `has-overflow is-start` 轨道内，并等待可见后点击，原有滚动断言保留。
- 本轮静态改动尚未在浏览器环境实测；Mac 包装环境验收命令仍为下方两条 Playwright 命令。更新高度表须以该次运行输出为准。
- 当前沙盒运行 `PATH=$PWD/.venv/bin:$PATH node --test`：63/63 通过。浏览器两项脚本依环境要求留待 Mac 包装环境执行，本报告不伪报浏览器通过。

依任务卡要求，浏览器脚本不可在当前沙盒运行（本环境无浏览器且不能监听端口）。Mac 包装环境可运行：

```sh
NODE_PATH=~/WorkBuddy/pw/node_modules node scripts/hospital-5-playwright.mjs
```

输出目标：`~/WorkBuddy/cards/shots/hospital-5-danang-1280.png`、`hospital-5-danang-390.png`、`hospital-5-danang-rail.png`。脚本对箭头、渐隐、滚动、拨打点击区和高度上限断言；四城高度表将在脚本 JSON 输出中生成。hospital-4 上轮报告的基线高度如下，供比较；它们不是 hospital-5 实测，不能代替本轮通过记录。

### 本轮修复与新增断言（2026-11-16）

- hospital-3 的 `[]` 是验收脚本时序问题：它在 `domcontentloaded` 之后立即读取由应用脚本异步渲染的城市行。现已等待首个 `.city-row` 挂载后再检查默认顺序。
- hospital-5 桌面箭头在 `(hover:hover)` 媒体条件不成立时会保持隐藏，和桌面轨道箭头验收/点击要求冲突。已改为宽度 ≥640px 且轨道溢出时显示箭头；脚本检查轨道状态并点击验证滚动。
- 富国岛无医院数据，收起行不再显示 🏥 标记；展开后检查零医院、急救条和“暂无核实的医院信息”。新增富国岛及岘港收起行截图。
- 390px 脚本对所有城市检查城市名 `nowrap`、名字与风险标记不重叠，以及医院标记与风险标记间距至少 8px。
- `hospital-5-design.md` 未在当前工作树找到；这些断言依用户卡片中列出的 A/B 验收要求实现。

截图新增：`hospital-5-phuquoc-collapsed.png`、`hospital-5-danang-collapsed.png`。浏览器验收仍需在 Mac 包装环境运行，本沙盒不启动 Playwright。

| 城市 | 390 基线 | 1280 基线 | 上限 390 / 1280 |
|---|---:|---:|---:|
| 岘港 | 3455 | 2747 | 5000 / 3000 |
| 胡志明 | 3147 | 2635 | 5000 / 3000 |
| 龙仔厝 | 3466 | 2751 | 5000 / 3000 |
| 曼谷 | 2915 | 2531 | 5000 / 3000 |

`node --test` 本轮结果：63 项中 58 项通过、5 项失败。失败均来自本机缺少 Python 景点构建依赖 `requests`，致使 `tests/attractions.test.mjs` 导入 `scripts/build_attractions.py` 失败；新增医院/覆盖数据测试通过。与先前报告一致，需在具备项目 Python 依赖的环境重跑，不能据此宣称 63/63。浏览器截图、高度、箭头和医院定位验收仍待 Mac 包装环境运行；hospital-4 报告记录过医院移动端 686px、拨打区 44px、tel 链接及定位 E2E 通过。

「显示全部城市」的数量文案已在 hospital-4 完成，本轮未改。

## 中文名缺失记录清单

此清单由 `python3 scripts/list_missing_attraction_zh.py` 生成。按覆盖 → Wikidata 中文名 → 当地语言名的回退链检查当前数据；只有全链为空的记录才列出。

| 国家/城市 | 景点 ID | 英文名 | 当前中文显示 | 处理 |
|---|---|---|---|

共 0 条缺中文标签记录；已配置人工/当地语言覆盖 91 个唯一 ID。
