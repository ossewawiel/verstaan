#!/usr/bin/env bash
# Tier: auto-fix. Trigger: PostToolUse on Edit|Write. Runtime: ~1 s.
# Formats the one file that was just written. Never blocks. Prints failures to stderr instead of
# swallowing them, so a missing formatter is visible in the transcript.
set -u
# shellcheck source=_env.sh
. "$(dirname "$0")/_env.sh"

input=$(cat)
file=$(printf '%s' "$input" | sed -n 's/.*"file_path":"\([^"]*\)".*/\1/p' | head -1)
[ -z "$file" ] && exit 0
[ -f "$file" ] || exit 0

case "$file" in
  *.cpp|*.hpp|*.cc|*.h)
    if command -v clang-format >/dev/null 2>&1; then
      clang-format -i "$file" || echo "fast-format: clang-format failed on $file" >&2
    else
      echo "fast-format: clang-format not on PATH; skipped $file" >&2
    fi ;;
  *.py)
    if command -v ruff >/dev/null 2>&1; then
      ruff format -q "$file" || echo "fast-format: ruff failed on $file" >&2
    else
      echo "fast-format: ruff not on PATH; skipped $file" >&2
    fi ;;
esac
exit 0
