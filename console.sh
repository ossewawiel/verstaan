#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
# Verstaan console on Linux and macOS: start the local service if it is not running, then open it
# in the browser. The twin of console.cmd and console.ps1 (issue 102). Run it from any terminal
# with an optional port: ./console.sh 7900. Safe to run twice. The first run installs the app's
# dependencies and builds it; every later run rebuilds only when the client or server source is
# newer than the last build. Pass --no-browser to start without opening a tab.
set -eu
cd "$(dirname "$0")"

port=7864
browser=1
for arg in "$@"; do
  case "$arg" in
    --no-browser) browser=0 ;;
    *) port="$arg" ;;
  esac
done
url="http://127.0.0.1:$port"

command -v node >/dev/null 2>&1 || { echo "console: node is not on PATH. Install Node 20 or later." >&2; exit 1; }

open_tab() {
  [ "$browser" = 1 ] || return 0
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$url/" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then open "$url/"
  fi
}

# Health probe with node itself, so this works where curl is absent. A wedged service must not
# hang the launcher, so the probe gives up after two seconds.
healthy() {
  node -e "const r=require('http').get('$url/health',r=>process.exit(r.statusCode===200?0:1));r.setTimeout(2000,()=>process.exit(1));r.on('error',()=>process.exit(1))" >/dev/null 2>&1
}

if healthy; then
  echo "console: already running at $url"
  open_tab
  exit 0
fi

app=apps/console
if [ ! -d "$app/node_modules" ]; then
  echo "console: installing dependencies (first run only)..."
  (cd "$app" && npm ci)
fi

# Rebuild when the build output is missing or any source file is newer than it.
need_build=0
dist="$app/dist/index.html"
[ -f "$dist" ] && [ -f "$app/dist-server/server/src/index.js" ] || need_build=1
if [ "$need_build" = 0 ] && [ -n "$(find "$app/client/src" "$app/server/src" -type f -newer "$dist" -print -quit)" ]; then
  need_build=1
fi
if [ "$need_build" = 1 ]; then
  echo "console: building..."
  (cd "$app" && npm run build)
fi

log="$(git rev-parse --path-format=absolute --git-common-dir)/console-serve.log"
# The `&` must apply to the node command alone. `(cd dir && nohup node ... &)` would background
# the whole `cd && nohup` list, and the helper subshell running that list keeps this script's
# stdout open for as long as the server lives, so a caller reading a pipe (a hook, a CI step)
# waits until the server dies (tools/factory/tests/test_console_sh.py).
(
  cd "$app" || exit 1
  VERSTAAN_CONSOLE_PORT="$port" nohup node dist-server/server/src/index.js --port "$port" >"$log" 2>&1 </dev/null &
)
sleep 1
echo "console: started at $url (log: $log)"
open_tab
