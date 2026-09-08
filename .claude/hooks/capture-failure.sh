#!/usr/bin/env bash
# Called by gate-fast.sh: capture-failure.sh <stage> <signature> <detail...>
# Appends one JSON line to docs/factory/lessons.jsonl. Issue number comes from STATE.md "Next up".
set -u
# shellcheck source=_env.sh
. "$(dirname "$0")/_env.sh"
root=$(repo_root)
stage=$1; sig=$2; shift 2; detail="$*"
issue=$(sed -n 's/^Next up:[[:space:]]*#\([0-9]*\).*/\1/p' "$root/docs/factory/STATE.md" 2>/dev/null | head -1)
ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' '; }
printf '{"sig":"%s","stage":"%s","issue":"%s","ts":"%s","detail":"%s"}\n' \
  "$(esc "$sig")" "$(esc "$stage")" "${issue:-none}" "$ts" "$(esc "$detail")" \
  >> "$root/docs/factory/lessons.jsonl"
