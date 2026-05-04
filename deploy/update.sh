#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

before=$(git rev-parse HEAD)
git fetch --quiet origin main
git reset --hard --quiet origin/main
after=$(git rev-parse HEAD)

if [ "$before" != "$after" ]; then
  ./.venv/bin/pip install --quiet -r requirements.txt
  sudo /bin/systemctl restart clep.service
  echo "CLEP updated $before -> $after, service restarted."
else
  echo "CLEP already at $after."
fi
