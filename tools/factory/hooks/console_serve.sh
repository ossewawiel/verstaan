#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
# The logic behind `.claude/hooks/console-serve.sh`, a one-line wrapper that execs this file
# (issue 93's shape: logic tracked here with tests in tools/factory/tests/test_console_serve.py;
# the wrapper under .claude/ is hand-edited only).
#
# Tier: rendering, never blocking. Trigger: SessionStart. Starts the console service
# (tools/console/src/serve.mjs) from the ROOT tree if nothing answers on the port, so the owner's
# open tab is live from the first session of the day. Idempotent: a second session sees the
# health endpoint answer and does nothing. Every path exits 0; a console that did not start is a
# stale page, not a broken gate (docs/factory/issues/95-console-as-a-local-service.md).
set -u
cat >/dev/null 2>&1 || true   # SessionStart payload is not needed

port="${VERSTAAN_CONSOLE_PORT:-7864}"
command -v node >/dev/null 2>&1 || { echo "console-serve: node not on PATH; console service not started" >&2; exit 0; }

common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
root=$(dirname "$common")
serve="$root/tools/console/src/serve.mjs"
[ -f "$serve" ] || exit 0

# Health check with node itself, so this works where curl is absent.
if node -e "require('http').get('http://127.0.0.1:$port/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" >/dev/null 2>&1; then
  echo "console-serve: already running at http://127.0.0.1:$port"
  exit 0
fi

log="$common/console-serve.log"
(cd "$root" && VERSTAAN_CONSOLE_PORT="$port" nohup node "$serve" >"$log" 2>&1 &)
echo "console-serve: started http://127.0.0.1:$port (log: $log)"
exit 0
