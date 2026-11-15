# 每日更新交接说明（GitHub Actions）

## 当前负责方
- 自 2026-11-15/16 起，每日数据更新与发布由 `.github/workflows/daily-data.yml`（daily-data）负责。
- 主任务每天 01:00 GMT+7（18:00 UTC），备用任务 01:30 GMT+7（18:30 UTC）；备用任务发现当天 17:00 UTC 后已生成数据，或最近两小时内已有 `weather data update` 提交，会成功跳过。
- Grok Bot「codex」定时任务在并行运行验证后退役；WorkBuddy 原来的定时任务保持暂停，不再需要交回 WorkBuddy。

## 每日流程与归档
1. Actions 从 main 检出，使用 Python 3.11 执行 `python3 scripts/update_data.py`，只使用标准库，不需要安装依赖或配置 Key。
2. 脚本拉取 Open-Meteo / GDACS / GloFAS 公开数据，更新 `data/`。退出码非零或失败城市超过 3 个时记为 FAIL；已写入的部分数据仍提交，全部城市失败时脚本保留旧数据。
3. 每次未跳过的运行都追加 `docs/ops/run-log.md`，包含 GMT+7 日期、generatedAt、结果及 Actions 运行链接。无数据变化时只提交运行日志。
4. 以 vietnamstephen 提交，pull --rebase 后推送 main，最多尝试三次。站点使用 legacy GitHub Pages（main /），推送后另行请求 Pages build，结果记录在 Actions 日志及运行摘要中；构建请求失败不影响数据任务结果。
5. 数据结果为 FAIL 时最后一步返回失败，以触发 GitHub 失败通知邮件；推送等步骤失败也会使运行失败。仓库所有者请在 GitHub 通知设置中启用 Actions 失败邮件并关注运行记录。

## 手动触发与备用方案
- 手动补跑：Actions tab → daily-data → Run workflow。手动运行不会使用备用任务的跳过条件。
- `scripts/sync_and_push.sh` 保留为人工备用入口；使用前先确认 Actions 未在运行，避免同时推送。人工补跑仍需追加运行日志。
- 归档跟随仓库保存，WorkBuddy 如需查看只要 `git pull`，不需要额外传文件。

## Supabase（独立于每日任务）
第二阶段“我的行程”的后端在 Supabase（项目 nhrapkbdveuitczbjkee）：
- 航班代理：Edge Function `flight-proxy`，密钥 `VARIFLIGHT_API_KEY` 存在 Supabase Secrets 里。
- 数据表结构：`supabase/migrations/`。
- 配置说明：`docs/SETUP-my-trips.md`。
- 这些都不依赖每日任务。
