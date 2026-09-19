#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
# Verstaan console on Linux and macOS: start the local service if it is not running, then open it
# in the browser. The twin of console.cmd and console.ps1 (issue 102). Run it from any terminal
# with an optional port: ./console.sh 7900. Safe to run twice. apps/console/server/scripts/
# build-if-stale.mjs decides both the install and the build: it installs when node_modules is
# missing or the lockfile moved since the last known-good install, and rebuilds when the client or
# server source is newer than the last build (issue 179 -- this script no longer tests for
# node_modules itself). Pass --no-browser to start without opening a tab. Pass --app-window to
# start without a tab, wait for /health, then open the console in its own Chromium app window
# instead of a browser tab -- what tools/console/install-desktop-entry.sh's launcher entry uses
# (issue 170).
set -eu
cd "$(dirname "$0")"

port=7864
browser=1
app_window=0
for arg in "$@"; do
  case "$arg" in
    --no-browser) browser=0 ;;
    --app-window) browser=1; app_window=1 ;;
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

# Chromium's --app mode: no tab strip, no address bar, its own taskbar entry. Tried in this order
# so the first chromium-class browser on PATH wins; none of these ship together, so this is never
# an actual choice on a real machine. A window opened this way reports the app_id
# "chrome-127.0.0.1__<port>-Default" to the window manager, which is why
# tools/console/install-desktop-entry.sh's entry sets StartupWMClass to exactly that string.
open_app_window() {
  [ "$browser" = 1 ] || return 0
  for bin in chromium chromium-browser google-chrome google-chrome-stable brave-browser brave microsoft-edge microsoft-edge-stable; do
    if command -v "$bin" >/dev/null 2>&1; then
      "$bin" --app="$url/" >/dev/null 2>&1 &
      return 0
    fi
  done
  echo "console: no chromium-class browser on PATH; opening a normal tab instead" >&2
  open_tab
}

open_console() {
  if [ "$app_window" = 1 ]; then open_app_window; else open_tab; fi
}

# Health probe with node itself, so this works where curl is absent. A wedged service must not
# hang the launcher, so the probe gives up after two seconds.
healthy() {
  node -e "const r=require('http').get('$url/health',r=>process.exit(r.statusCode===200?0:1));r.setTimeout(2000,()=>process.exit(1));r.on('error',()=>process.exit(1))" >/dev/null 2>&1
}

# Polled only for --app-window: a Chromium window opened before the server answers just shows a
# connection-refused page, and nothing then reloads it for the user. The plain-tab path keeps its
# older, looser "sleep 1 and hope" timing below, unchanged, so existing behaviour does not shift.
wait_healthy() {
  i=0
  while [ "$i" -lt 30 ]; do
    healthy && return 0
    i=$((i + 1))
    sleep 0.2
  done
  return 1
}

if healthy; then
  echo "console: already running at $url"
  open_console
  exit 0
fi

app=apps/console

# Install, then rebuild, when either is stale: node_modules is missing or the lockfile moved since
# the last known-good install; dist is missing, or client/src or server/src holds a file newer
# than the last known-good build. Shared with POST /api/restart (issues 162 and 179), which must
# make exactly these same two decisions from a detached Node process --
# apps/console/server/scripts/build-if-stale.mjs is the one place both rules are written, so
# console.sh and the restart endpoint can never drift apart on either. Lives under server/, not
# apps/console/scripts/ directly: a relative import reaching up two directory levels from
# server/test/ triggered a reproducible Vitest/Windows "Invalid or unexpected token" parse failure
# (checkpoint-4 review) -- one level up, matching every other cross-directory import in this app,
# does not.
if ! node "$app/server/scripts/build-if-stale.mjs" "$app"; then
  echo "console: install or build failed; see above." >&2
  exit 1
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
if [ "$app_window" = 1 ]; then
  wait_healthy || echo "console: service did not answer /health in time" >&2
else
  sleep 1
fi
echo "console: started at $url (log: $log)"
open_console
