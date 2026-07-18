#!/usr/bin/env bash
# Jumps progress from 5% to 95% in a single step, then exits. Used to verify
# milestone coalescing (one notification, not nine).
set -euo pipefail
echo "starting 5%"
echo "almost there 95%"
echo "done"
