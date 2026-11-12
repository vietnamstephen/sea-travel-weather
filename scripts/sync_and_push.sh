#!/usr/bin/env bash
# SEA Travel Weather · 每日更新 + 推送 GitHub Pages
# 由定时任务在 01:00（本机 GMT+7）调用；有变更才 commit + push。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# 可选：从本机「未纳入 git」的配置文件读取航班 API Key（切勿把密钥写进仓库）
# 用法：mkdir -p ~/.config/sea-travel-weather && 在该目录的 env 文件里写
#   AVIATIONSTACK_API_KEY=xxx
#   AVIATIONSTACK_AIRPORTS=SIN,BKK
# 或 VARIFLIGHT_API_KEY=xxx（需另外接 MCP 客户端，见 update_data.py）
if [ -f "$HOME/.config/sea-travel-weather/env" ]; then
  set -a
  . "$HOME/.config/sea-travel-weather/env"
  set +a
fi

echo "=== [1/3] 拉取天气数据 ==="
python3 scripts/update_data.py

echo "=== [2/3] 检查变更 ==="
git add -A
if git diff --cached --quiet; then
  echo "NO_CHANGE"
  exit 0
fi

STAMP="$(python3 -c "import json;print(json.load(open('data/weather.json',encoding='utf-8'))['meta']['generatedAt'])")"

echo "=== [3/3] 提交并推送 ==="
git -c user.name=vietnamstephen \
    -c user.email=vietnamstephen@users.noreply.github.com \
    commit -q -m "weather data update ${STAMP}"
git push -q origin main
echo "PUSHED ${STAMP}"
