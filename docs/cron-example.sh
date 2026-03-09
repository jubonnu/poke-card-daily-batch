#!/bin/bash
# 日次差分バッチの cron 実行例
# 毎日 6:00 に実行する場合: crontab -e で以下を追加
# 0 6 * * * /path/to/poke-card-daily-batch/docs/cron-example.sh

cd "$(dirname "$0")/.." || exit 1
export PATH="/usr/local/bin:/usr/bin:$PATH"

# .env を読み込む（cron では明示的に必要）
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

npm run batch:diff
