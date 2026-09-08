#!/usr/bin/env bash
# Tier: fast, non-blocking. Trigger: Stop. Regenerates the local console so it always reflects
# this worktree's issue files and git state, even across intermittent sessions. Never blocks Stop:
# a failure here is a stale page, not a broken gate.
set -u
input=$(cat)
case "$input" in *'"stop_hook_active":true'*) exit 0;; esac

# shellcheck source=_env.sh
. "$(dirname "$0")/_env.sh"
root=$(repo_root); cd "$root" || exit 0

[ -f tools/console/src/generate.mjs ] || exit 0
command -v node >/dev/null 2>&1 || exit 0

node tools/console/src/generate.mjs >/dev/null 2>&1
exit 0
