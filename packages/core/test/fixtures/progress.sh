#!/usr/bin/env bash
# Emits progress from 10% to 100% then exits. Used by watcher tests.
# Usage: progress.sh [delay_seconds_between_steps]
set -euo pipefail
delay="${1:-0}"
for pct in 10 20 30 40 50 60 70 80 90 100; do
  echo "working... ${pct}%"
  if [ "$delay" != "0" ]; then sleep "$delay"; fi
done
echo "done"
