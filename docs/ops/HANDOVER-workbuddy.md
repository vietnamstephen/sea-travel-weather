# 每日更新交接说明（codex ⇄ WorkBuddy）

## 当前负责方
- 自 2026-11-14 起：每日数据更新与发布由 Grok Bot「codex」负责（每天 01:00，越南时间 GMT+7）。
- WorkBuddy：负责归档；它原来的“东南亚出行天气 · 每日 01:00 更新并推送”定时任务请先暂停，避免两边同时推送。

## 每日流程（两边一致）
1. `git pull --rebase origin main`
2. `python3 scripts/update_data.py`：拉取 Open-Meteo / GDACS / GloFAS 公开数据，写入 `data/*.json`，不需要任何 Key。
3. 有变更才提交：`weather data update <generatedAt>`，作者为 vietnamstephen，然后推送到 main，GitHub Pages 自动部署。
4. 把当天运行结果追加到 `docs/ops/run-log.md`，作为归档：日期、generatedAt、成功和失败的城市数、commit。

## 归档方式
- 每次运行结果都写在 `docs/ops/run-log.md`，跟着仓库一起推送。WorkBuddy 只要 `git pull` 就能拿到完整归档，不需要额外传文件。

## 交回 WorkBuddy（不续费时）
1. 在 WorkBuddy 里重新开启原来的定时任务；它执行的就是 `scripts/sync_and_push.sh`，流程不变。
2. 推送前请继续追加 `docs/ops/run-log.md`，保持归档连续。
3. 第二阶段“我的行程”的后端在 Supabase（项目 nhrapkbdveuitczbjkee）：
   - 航班代理：Edge Function `flight-proxy`，密钥 `VARIFLIGHT_API_KEY` 存在 Supabase Secrets 里。
   - 数据表结构：`supabase/migrations/`。
   - 配置说明：`docs/SETUP-my-trips.md`。
   - 这些都不依赖每日任务。
