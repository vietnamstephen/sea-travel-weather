# hospital-5 设计验收报告

分支：`wip/hospitals-vn-th`。目标基于 hospital-4；本轮未 push / 合并。仓库沙盒禁止写 `.git`，所以无法在这里创建任务卡要求的单独 commit。

## 完成的实现

- 桌面景点轨道：5 张及以上时按 `(100% - 48px)/4.4` 显示卡片，间距 16px；最多 4 张时等分。滚动位置通过 `is-start` / `is-end` 更新渐隐和箭头；箭头在支持 hover 的桌面显示，按三张卡片宽度滚动，并遵从 reduced-motion。移动端规则未改。
- 医院区块沿用 hospital-4 的默认 3 家、带 `+N` 的更多按钮和五种语言文案；OSM 来源文字增加 2px 左内边距，与医院卡片内容左边缘对齐（桌面 10px，窄屏 8px）。
- 中文景点名按人工覆盖 → 当地语言名回退；没有中文名或当地语言名时显示空名，不回退英文。新增 `data/attractions_overrides.json`，构建脚本会将覆盖值写回数据构建结果。
- Zone 5 Military Museum 改为「第五军区博物馆」；Son Tra Guanyin 改为「山茶半岛灵应寺观音像」。另为当前 91 条空中文/英文同名记录补覆盖或本地名，脚本 `scripts/list_missing_attraction_zh.py` 输出逐条清单；本报告下方附清单。对纯拉丁专名的部分条目标出待当地母语者复核。
- March 29 Park 增加 Wikimedia Commons 图片 [Martin Lewison 的照片](https://commons.wikimedia.org/wiki/File:March_29_Park,_Da_Nang_(49358095917).jpg)，标注作者 Martin Lewison 与 CC BY 2.0，许可证链接已写入数据。图像来自公园类别页内文件列表，许可证和作者信息以文件页为准。
- 新增 `scripts/hospital-5-playwright.mjs`：自带本地 HTTP 服务，使用 `createRequire` 加载 Playwright；生成岘港 1280/390 整页图、桌面轨道图和四城两种视口高度数据。整页截图前只在脚本中把 header 改为 `position:static`。

## 自动化验收状态

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

此清单由 `python3 scripts/list_missing_attraction_zh.py` 生成。输入是原数据中中文名为空或等于英文名的记录；已覆盖 91 个唯一 ID。带“待当地母语者复核”的译法保留在清单中，方便后续核对。

| 国家/城市 | 景点 ID | 英文名 | 当前中文显示 | 处理 |
|---|---|---|---|
| vn/hcm | `Q4448947` | Mariamman Temple, Ho Chi Minh City | Đền Bà Ấn (Thành phố Hồ Chí Minh) | 保留来源当地专名 / 保留来源当地名称（vi） |
| vn/danang | `Q18164670` | Zone 5 Military Museum | 第五军区博物馆 | 人工核定 / 人工译名；依据越南语 Bảo tàng Quân khu 5 |
| vn/danang | `Q60853845` | Son Tra Guanyin | 山茶半岛灵应寺观音像 | 人工核定 / 人工译名；依据景点专名与所在地 Son Tra Peninsula / Linh Ung Pagoda |
| vn/danang | `Q32176308` | March 29 Park | 三月二十九日公园 | 人工核定 / 人工译名；依据越南语 Công viên 29 tháng 3 |
| vn/phuquoc | `osm:node/3482735052` | Trúc Lâm Hộ Quốc Zen Monastery | Trúc Lâm Hộ Quốc 禅寺 | 译名待当地母语者复核 / 依当地通行地名直译；待当地母语者复核 |
| vn/phuquoc | `osm:way/32003769` | Long beach | Bãi Trường | 保留来源当地专名 / 保留来源当地名称（vi） |
| vn/phuquoc | `osm:node/5158463023` | Hung Quoc Convent | 兴国修道院 | 译名待当地母语者复核 / 依当地通行地名直译；待当地母语者复核 |
| vn/phuquoc | `osm:node/7148312785` | Tiên Sơn Đỉnh - good viewpoint | 仙山顶观景点 | 译名待当地母语者复核 / 依当地通行地名直译；待当地母语者复核 |
| vn/nhatrang | `Q8052668` | Yersin Museum | Bảo tàng Alexandre Yersin | 保留来源当地专名 / 保留来源当地名称（vi） |
| vn/quynhon | `Q10825825` | Banh It Cham Towers | Tháp Bánh Ít | 保留来源当地专名 / 保留来源当地名称（vi） |
| vn/quynhon | `Q10825860` | Doi Cham Towers | Tháp Đôi | 保留来源当地专名 / 保留来源当地名称（vi） |
| vn/quynhon | `Q10825827` | Binh Lam Cham Tower | Tháp Bình Lâm | 保留来源当地专名 / 保留来源当地名称（vi） |
| vn/dalat | `Q6554125` | Linh Son Pagoda | Chùa Linh Sơn (Đà Lạt) | 保留来源当地专名 / 保留来源当地名称（vi） |
| vn/dalat | `Q10752061` | Đà Lạt flower park | Công viên hoa Đà Lạt | 保留来源当地专名 / 保留来源当地名称（vi） |
| vn/dalat | `Q10800878` | Cam Ly Church | Nhà thờ Cam Ly | 保留来源当地专名 / 保留来源当地名称（vi） |
| vn/bacninh | `Q10748407` | Thần-quang Pagoda | Chùa Dạm | 保留来源当地专名 / 保留来源当地名称（vi） |
| vn/bacninh | `Q66092478` | Ham Long Buddhist temple | Chùa Hàm Long | 保留来源当地专名 / 保留来源当地名称（vi） |
| vn/haiphong | `osm:way/240479613` | Bảo tàng Hải quân | 越南海军博物馆 | 译名待当地母语者复核 / 依当地通行地名直译；待当地母语者复核 |
| vn/haiphong | `osm:way/962922519` | Bảo tàng Xi măng Việt Nam | 越南水泥博物馆 | 译名待当地母语者复核 / 依当地通行地名直译；待当地母语者复核 |
| vn/haiphong | `osm:way/1049831208` | Hai Phong Museum | 海防博物馆 | 译名待当地母语者复核 / 依当地通行地名直译；待当地母语者复核 |
| vn/haiphong | `osm:node/14086666270` | Bao Tàng Quan Khu 3 | 第三军区博物馆 | 译名待当地母语者复核 / 依当地通行地名直译；待当地母语者复核 |
| vn/haiphong | `osm:node/2797512242` | Bao Dai Villa | 保大别墅 | 译名待当地母语者复核 / 依当地通行地名直译；待当地母语者复核 |
| vn/binhduong | `Q16481110` | Phu Cuong Communal House | Đình Phú Cường | 保留来源当地专名 / 保留来源当地名称（vi） |
| vn/binhduong | `Q18461586` | Tan An Communal House | Đình Tân An | 保留来源当地专名 / 保留来源当地名称（vi） |
| vn/dongnai | `Q31992793` | Citadel of Bien Hoa | Thành cổ Biên Hòa | 保留来源当地专名 / 保留来源当地名称（vi） |
| vn/dongnai | `Q112648602` | Dong Nai Museum | Bảo tàng Đồng Nai | 保留来源当地专名 / 保留来源当地名称（vi） |
| vn/dongnai | `Q5003209` | Buu Phong Temple | Chùa Bửu Phong | 保留来源当地专名 / 保留来源当地名称（vi） |
| th/chiangmai | `Q843034` | Doi Suthep-Pui National Park | อุทยานแห่งชาติดอยสุเทพ-ปุย | 保留来源当地专名 / 保留来源当地名称（th） |
| th/chiangmai | `Q4818120` | Attaqwa Mosque | มัสยิดอัตตักวา | 保留来源当地专名 / 保留来源当地名称（th） |
| th/chiangmai | `Q15708582` | Op Khan National Park | อุทยานแห่งชาติออบขาน | 保留来源当地专名 / 保留来源当地名称（th） |
| th/chiangmai | `Q1642767` | Chiang Mai National Museum | พิพิธภัณฑสถานแห่งชาติ เชียงใหม่ | 保留来源当地专名 / 保留来源当地名称（th） |
| th/phuket | `Q48948294` | Holy Trinity Church | 圣三一教堂 | 译名待当地母语者复核 / 依当地通行地名直译；待当地母语者复核 |
| th/phuket | `Q13018175` | Thalang National Museum | พิพิธภัณฑสถานแห่งชาติ ถลาง | 保留来源当地专名 / 保留来源当地名称（th） |
| th/phuket | `Q16678462` | Phuket Seashell Museum | 普吉贝壳博物馆 | 译名待当地母语者复核 / 依当地通行地名直译；待当地母语者复核 |
| th/phuket | `Q56561800` | Wat Si Sunthon | วัดศรีสุนทร | 保留来源当地专名 / 保留来源当地名称（th） |
| th/pattaya | `Q13017342` | Phra Chuthathut Palace | พระจุฑาธุชราชฐาน | 保留来源当地专名 / 保留来源当地名称（th） |
| th/pattaya | `Q107057762` | Viharn Sien | อเนกกุศลศาลา | 保留来源当地专名 / 保留来源当地名称（th） |
| th/pattaya | `Q110354503` | USS LSM-333 | เรือหลวงกูด | 保留来源当地专名 / 保留来源当地名称（th） |
| th/pattaya | `Q28671215` | All Saints church | 诸圣堂 | 译名待当地母语者复核 / 依当地通行地名直译；待当地母语者复核 |
| th/pattaya | `Q115120592` | Giant Monk Statue, Ko Lan | 阁兰岛巨型僧侣像 | 译名待当地母语者复核 / 依当地通行地名直译；待当地母语者复核 |
| th/pattaya | `Q16004176` | Tham Mangkhon Khao | ถ้ำมังกรขาว | 保留来源当地专名 / 保留来源当地名称（th） |
| th/pattaya | `Q4294192` | Mini Siam | เมืองจำลองพัทยา | 保留来源当地专名 / 保留来源当地名称（th） |
| th/chonburi | `Q3576017` | Khao Kheow Open Zoo | สวนสัตว์เปิดเขาเขียว | 保留来源当地专名 / 保留来源当地名称（th） |
| th/chonburi | `Q53995363` | Chaloem Phrakiat Park | สวนเฉลิมพระเกียรติ ร.9 ชลบุรี | 保留来源当地专名 / 保留来源当地名称（th） |
| th/rayong | `Q1551842` | Khao Laem Ya – Mu Ko Samet National Park | อุทยานแห่งชาติเขาแหลมหญ้า-หมู่เกาะเสม็ด | 保留来源当地专名 / 保留来源当地名称（th） |
| th/rayong | `Q1132057` | Rayong Aquarium | สถานแสดงพันธุ์สัตว์น้ำระยอง | 保留来源当地专名 / 保留来源当地名称（th） |
| th/rayong | `Q13022367` | Suan Si Mueang | สวนศรีเมือง | 保留来源当地专名 / 保留来源当地名称（th） |
| th/rayong | `Q49567040` | สวนรัชมังคลาภิาษก | สวนรัชมังคลาภิษก | 译名待当地母语者复核 / 依当地通行地名直译；待当地母语者复核 |
| th/ayutthaya | `Q1062477` | Chao Sam Phraya National Museum | พิพิธภัณฑสถานแห่งชาติ เจ้าสามพระยา | 保留来源当地专名 / 保留来源当地名称（th） |
| th/ayutthaya | `Q55096367` | Phet Fort | ป้อมเพชร | 保留来源当地专名 / 保留来源当地名称（th） |
| th/ayutthaya | `Q1061764` | Chandra Kasem palace | พระราชวังจันทรเกษม | 保留来源当地专名 / 保留来源当地名称（th） |
| th/ayutthaya | `Q13017705` | Queen Suriyothai Monument | พระราชานุสาวรีย์สมเด็จพระสุริโยทัย | 保留来源当地专名 / 保留来源当地名称（th） |
| th/samutprakan | `Q16304373` | Chulachomklao Fort | ป้อมพระจุลจอมเกล้า | 保留来源当地专名 / 保留来源当地名称（th） |
| th/samutprakan | `Q107920843` | Phlaeng Faifa Fort | ป้อมแผลงไฟฟ้า | 保留来源当地专名 / 保留来源当地名称（th） |
| th/samutprakan | `Q124023139` | Wanatham Park | สวนวนธรรม | 保留来源当地专名 / 保留来源当地名称（th） |
| th/samutprakan | `Q16304359` | Phi Suea Samut Fort | ป้อมผีเสื้อสมุทร | 保留来源当地专名 / 保留来源当地名称（th） |
| th/samutsakhon | `Q109449352` | Wichien Chodok Fort | ป้อมวิเชียรโชฎก | 保留来源当地专名 / 保留来源当地名称（th） |
| th/samutsakhon | `Q141925262` | Samutsakhon Science Centre for Education | ศูนย์วิทยาศาสตร์เพื่อการศึกษาสมุทรสาคร | 保留来源当地专名 / 保留来源当地名称（th） |
| sg/singapore | `Q6819812` | Merlion Park | Taman Merlion | 保留来源当地专名 / 保留来源当地名称（id） |
| sg/jurong | `Q12497267` | Masjid Al-Firdaus | Masjid Al-Firdaus | 译名待当地母语者复核 / 译名/保留当地专名；源名来自景点数据；部分仅英文/拉丁拼写，译法待当地母语者复核 |
| sg/jurong | `Q13647385` | Masjid Al-Khair | Masjid Al-Khair | 译名待当地母语者复核 / 译名/保留当地专名；源名来自景点数据；部分仅英文/拉丁拼写，译法待当地母语者复核 |
| sg/jurong | `Q4986869` | Bukit Batok Nature Park | 武吉巴督自然公园 | 译名待当地母语者复核 / 依当地通行地名直译；待当地母语者复核 |
| sg/jurong | `Q134883157` | Masjid Pusara Aman | Masjid Pusara Aman | 译名待当地母语者复核 / 译名/保留当地专名；源名来自景点数据；部分仅英文/拉丁拼写，译法待当地母语者复核 |
| sg/jurong | `Q4504909` | Church of St Mary of the Angels | Gereja Santa Maria dari Para Malaikat, Bukit Batok | 保留来源当地专名 / 保留来源当地名称（id） |
| sg/changi | `Q2477258` | Masjid Al-Ansar | Masjid Al-Ansar | 译名待当地母语者复核 / 译名/保留当地专名；源名来自景点数据；部分仅英文/拉丁拼写，译法待当地母语者复核 |
| sg/changi | `Q1088320` | Masjid Al-Mawaddah | Masjid Al-Mawaddah | 译名待当地母语者复核 / 译名/保留当地专名；源名来自景点数据；部分仅英文/拉丁拼写，译法待当地母语者复核 |
| sg/changi | `Q4262113` | Masjid Darul Ghufran | Masjid Darul Ghufran | 译名待当地母语者复核 / 译名/保留当地专名；源名来自景点数据；部分仅英文/拉丁拼写，译法待当地母语者复核 |
| sg/changi | `Q712057` | Masjid Al-Istiqamah | Masjid Al-Istiqamah | 译名待当地母语者复核 / 译名/保留当地专名；源名来自景点数据；部分仅英文/拉丁拼写，译法待当地母语者复核 |
| sg/changi | `Q3720047` | Masjid Taha | Masjid Taha | 译名待当地母语者复核 / 译名/保留当地专名；源名来自景点数据；部分仅英文/拉丁拼写，译法待当地母语者复核 |
| sg/changi | `Q4262083` | Masjid Al-Abdul Razak | Masjid Al-Abdul Razak | 译名待当地母语者复核 / 译名/保留当地专名；源名来自景点数据；部分仅英文/拉丁拼写，译法待当地母语者复核 |
| sg/changi | `Q4262158` | Masjid Al-Istighfar | Masjid Al-Istighfar | 译名待当地母语者复核 / 译名/保留当地专名；源名来自景点数据；部分仅英文/拉丁拼写，译法待当地母语者复核 |
| my/penang | `Q7586151` | Sri Mahamariamman Temple, Penang | Kuil Shri Mariamman, Pulau Pinang | 保留来源当地专名 / 保留来源当地名称（id） |
| my/kotakinabalu | `Q15274240` | Sacred Heart Cathedral, Kota Kinabalu | Katedral Kota Kinabalu | 保留来源当地专名 / 保留来源当地名称（id） |
| my/kotakinabalu | `Q1464088` | St. Michael's Church, Penampang | Gereja Santo Mikael, Penampang | 保留来源当地专名 / 保留来源当地名称（id） |
| my/johor | `Q4749689` | An-Nur Kotaraya Mosque | An-Nur Kotaraya Mosque | 译名待当地母语者复核 / 译名/保留当地专名；源名来自景点数据；部分仅英文/拉丁拼写，译法待当地母语者复核 |
| my/johor | `Q12904639` | Masjid Jamek Larkin | Masjid Jamek Larkin | 译名待当地母语者复核 / 译名/保留当地专名；源名来自景点数据；部分仅英文/拉丁拼写，译法待当地母语者复核 |
| my/johor | `Q16869231` | Kolam Ayer Mosque | Kolam Ayer Mosque | 译名待当地母语者复核 / 译名/保留当地专名；源名来自景点数据；部分仅英文/拉丁拼写，译法待当地母语者复核 |
| my/johor | `Q16874356` | Ungku Tun Aminah Mosque | Ungku Tun Aminah Mosque | 译名待当地母语者复核 / 译名/保留当地专名；源名来自景点数据；部分仅英文/拉丁拼写，译法待当地母语者复核 |
| id/bali | `Q3025956` | Ubud Monkey Forest | Mandala Wisata Wenara Wana | 保留来源当地专名 / 保留来源当地名称（id） |
| id/surabaya | `Q60674533` | House of Sampoerna | 三宝麟博物馆 | 译名待当地母语者复核 / 依当地通行地名直译；待当地母语者复核 |
| id/surabaya | `Q12483951` | Church of the Birth of Our Lady, Surabaya | Gereja Katolik Kelahiran Santa Perawan Maria | 保留来源当地专名 / 保留来源当地名称（id） |
| id/yogyakarta | `Q2551916` | Fort Vredeburg | Benteng Vredeburg | 保留来源当地专名 / 保留来源当地名称（id） |
| id/yogyakarta | `Q4271636` | Sonobudoyo Museum | Museum Sonobudoyo | 保留来源当地专名 / 保留来源当地名称（id） |
| id/yogyakarta | `Q12499663` | Dharma Wiratama Museum | Museum Pusat TNI AD "Dharma Wiratama" | 保留来源当地专名 / 保留来源当地名称（id） |
| ph/manila | `Q1417648` | Masjid Al-Dahab | Masjid Al-Dahab Manila | 保留来源当地专名 / 保留来源当地名称（id） |
| ph/cebu | `Q1869800` | Cebu Taoist Temple | 宿务道教寺 | 译名待当地母语者复核 / 依当地通行地名直译；待当地母语者复核 |
| ph/cebu | `Q2110972` | Museo Sugbo | 宿务博物馆 | 译名待当地母语者复核 / 依当地通行地名直译；待当地母语者复核 |
| ph/cebu | `Q5052254` | Cathedral Museum of Cebu | 宿务主教座堂博物馆 | 译名待当地母语者复核 / 依当地通行地名直译；待当地母语者复核 |
| ph/davao | `Q19894703` | San Pedro Cathedral | Katedral Davao | 保留来源当地专名 / 保留来源当地名称（id） |
| ph/davao | `Q16966803` | People's Park | 达沃人民公园 | 译名待当地母语者复核 / 依当地通行地名直译；待当地母语者复核 |
| ph/davao | `Q28937529` | Magsaysay Park | 马格赛赛公园 | 译名待当地母语者复核 / 依当地通行地名直译；待当地母语者复核 |

共 91 条缺中文标签记录；已配置人工/当地语言覆盖 91 个唯一 ID。

## hospital-5f 收尾（2026-11-16 05:0x Asia/Saigon，Mac 包装环境实测）

- 根因（探针，岘港 1280）：真正溢出的是 `.attr-scroll ul`（scrollWidth 1564 > clientWidth 971，overflow-x:auto，scroll-snap x mandatory）；`.attr-scroll` 为 overflow:visible（1564/971 → 971/971）。点击「下一组」后 ul.scrollLeft 0 → 593，功能正常；验收脚本读的是外层 `.attr-scroll` 的 scrollLeft，所以恒为 0。脚本改为读取 `.attr-scroll ul`。scroll-snap 未吞掉平滑滚动，无需改 scrollTo。
- 箭头步长改为 3 ×（卡宽 + 列间距），一次前进 3 张卡；reduced-motion 下仍为 behavior:auto。
- 390 间距：`.city-row summary` 已有 column-gap:8px。7 个报 0 的城市是收起状态的 `.city-extra`（display:none，尺寸全 0）。脚本先点「显示全部城市」再测量，12 个城市间距均 ≥ 8px 且不换行。
- 结果：hospital-5-playwright 0 失败；hospital-3-playwright 0 失败；`node --test` 63/63 通过（本节取代上方 58/63 的记录）。
- 页高（px）：danang 3772 / 2784，hcm 3654 / 2758，samutsakhon 3663 / 3000，bangkok 3423 / 2635（390 / 1280）。
- 箭头随本次上线（未使用 视觉优化队列 #A1 降级方案）。
