#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
# The logic behind `.claude/hooks/refresh-console.sh`, which is a one-line wrapper that execs this
# file. Logic lives here so it is a normal tracked script with tests
# (`tools/factory/tests/test_refresh_console.py`); the wrapper under `.claude/` almost never changes.
#
# Tier: rendering, never blocking. Triggers: SessionStart; PostToolUse on Edit|Write when the file
# is a doc, an issue, an agent, a skill or a command; and from gate-fast.sh on every Stop.
# Regenerates docs/factory/console/ so the console always matches the files and git.
# The console is not committed (see .gitignore); it is a rendering, like STATE.md is.
set -u
input=$(cat 2>/dev/null || true)
root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

# On PostToolUse, only bother when a source of the console changed.
file=$(printf '%s' "$input" | sed -n 's/.*"file_path":"\([^"]*\)".*/\1/p' | head -1)
if [ -n "$file" ]; then
  case "$file" in
    *docs/*|*.claude/agents/*|*.claude/skills/*|*.claude/commands/*|*CLAUDE.md|*README.md|*verstaan.md|*CLA.md|*TRADEMARK.md|*CONTRIBUTORS.md) ;;
    *) exit 0;;
  esac
fi

command -v node >/dev/null 2>&1 || { echo "refresh-console: node not on PATH; console not refreshed" >&2; exit 0; }
out=$(cd "$root" && node tools/console/src/generate.mjs 2>&1) || echo "refresh-console: generate failed: $(printf '%s' "$out" | tail -n 5)" >&2
exit 0
