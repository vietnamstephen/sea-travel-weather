# 椰途品牌与 SEO 改动记录

## 改动清单

- 将多语言品牌字典及各页面静态 Logo 文字、标题改为「椰途」；中文显示「椰途」，其余语言显示「椰途 Yetu」。
- 首页、越南页、泰国页增加独立静态 title、description、canonical、Open Graph、Twitter 和 Search Console 空 meta 占位。运行时依当前语言及国家/城市更新标题、description、社交卡片与 canonical。
- 英文 OG/Twitter 标题使用 `Yetu – Southeast Asia Travel Weather`（有国家或城市时附加对应页面名称）。
- 在 `js/app.js` 配置 `GA_MEASUREMENT_ID = 'G-GX775Z6J31'`；仅 hostname 精确为 `vietnamstephen.github.io` 时直接加载 gtag.js 并调用 `gtag('config', ...)`。空 ID、localhost、127.0.0.1、file: 及其他主机都不会加载或发送 GA 请求；未加入 GTM。Search Console 的 `google-site-verification` 占位仍为空。
- 新增 `scripts/gen_sitemap.mjs`，从 `js/data.js` 生成 `sitemap.xml`，包含首页、越南和泰国国家页及所有城市 `?city=` URL；新增指向 sitemap 的 `robots.txt`。
- 新增 SEO 单元测试及 Mac Playwright 验收脚本 `scripts/brand-seo-playwright.mjs`。脚本从本地仓库文件模拟生产主页，拦截并中止 Google Analytics collect 请求、断言 measurement ID；另检查 localhost 不请求 gtag.js 或 collect。未增加联盟链接。

## 品牌文案对照

| 语言 | 旧写法 | 新写法 |
|---|---|---|
| 中文 | 东南亚出行天气与交通预警 | 椰途 |
| English | SEA Travel Weather & Transport Advisory | 椰途 Yetu |
| Tiếng Việt | Thời tiết & Cảnh báo giao thông Đông Nam Á | 椰途 Yetu |
| ไทย | สภาพอากาศและคำเตือนการเดินทางอาเซียน | 椰途 Yetu |
| Bahasa Indonesia | Cuaca & Peringatan Perjalanan Asia Tenggara | 椰途 Yetu |

Logo 与页面标题品牌部分按同一规则显示。首页英文 OG/Twitter 标题为 `Yetu – Southeast Asia Travel Weather`。

## 旧品牌 grep

检查范围：站点 HTML、`js/` 与 `data/` 中的用户可见旧品牌文案（排除本报告的历史对照、测试和 `node_modules`）。命令：

```sh
rg -n '东南亚出行天气与交通预警|SEA Travel Weather & Transport Advisory|Thời tiết & Cảnh báo giao thông Đông Nam Á|สภาพอากาศและคำเตือนการเดินทางอาเซียน|Cuaca & Peringatan Perjalanan Asia Tenggara' *.html js data
```

结果：0 条匹配。

## 验收记录

- `PATH="$PWD/.venv/bin:$PATH" node --test`：67/67 通过（2026-11-16）。
- `node scripts/gen_sitemap.mjs`：成功生成 sitemap。
- `xmllint --noout sitemap.xml`：通过。
- 本沙盒按环境说明未运行浏览器脚本；需由 Mac 包装环境补记 `NODE_PATH=~/WorkBuddy/pw/node_modules node scripts/brand-seo-playwright.mjs`、`scripts/hospital-3-playwright.mjs`、`scripts/hospital-5-playwright.mjs` 的结果。

### 本轮执行结果（日志末尾）

- `PATH="$PWD/.venv/bin:$PATH" node --test`：67 通过，0 失败。
- Playwright：本沙盒不运行浏览器验收；需在 Mac 包装环境分别运行 brand-seo、hospital-3、hospital-5 脚本并将实际结果追加于此。

## Search Console

首页 index.html 的 <head> 中已静态写入 google-site-verification（content=oY_OEjgf2vxLNr432av0qf_ePJnYVgWMDlOcG9QbMMs），不经 JS 注入；node 测试断言原始 HTML 含这一行。

## Mac 验收（07:3x）

node --test 67/67；brand-seo / hospital-3 / hospital-5 Playwright 全部通过；GA collect 1 次，tid=G-GX775Z6J31，localhost 0 次；xmllint 通过；旧品牌名 0 处。
