---
issue: 102
title: "The console runs on Linux and macOS: console.sh, and the SessionStart starter that issue 95 promised"
milestone: Side
status: done
depends_on: [99]
agent: implementer
agents: [implementer]
model: sonnet
effort: low
checkpoint: null
commit: 6e3bc72
worktree: null
github_issue: 36
---
## What

The console had two launchers, `console.cmd` and `console.ps1`, both Windows. On the owner's
Linux machine nothing started it. The owner, 2026-09-10: "we need to get the console web app to
run on this environment."

Issue 95 also specified a SessionStart hook that starts the built server from the root tree
(`tools/factory/hooks/console_serve.sh`, tested), with a wrapper under `.claude/hooks/` and an
entry in `.claude/settings.json` for the owner to apply by hand. `docs/factory/README.md` has
described that hook as existing ever since. Neither the wrapper nor the entry was ever applied,
so the console only ran when started by hand.

## What changed

- `console.sh`: the Linux and macOS twin of `console.cmd`. Health probe with node, `npm ci` on
  the first run, rebuild when any client or server source is newer than the build, start with
  nohup, open the browser through `xdg-open` or `open`. `--no-browser` starts without a tab.
- `.claude/hooks/console-serve.sh` and the SessionStart entry in `.claude/settings.json`, exactly
  as issue 95 wrote them.
- A defect found while testing `console.sh` against a pipe, shared with `console_serve.sh`:
  `(cd dir && nohup node ... &)` backgrounds the whole `cd && nohup` list, and the helper subshell
  running it holds the caller's stdout for as long as the server lives. Claude Code reads a hook
  through a pipe, so the session start would have waited out the hook's timeout. Both scripts
  now background the node command alone. `tools/factory/tests/test_console_serve.py` gained a
  test that fails on the old form, and `tools/factory/tests/test_console_sh.py` covers the
  launcher the same way.
- `CLAUDE.md` and `docs/factory/README.md` name `console.sh` beside `console.cmd`.

## Acceptance

- `./console.sh` from the root tree on Linux starts the console and opens the browser; a second
  run reports "already running".
- `./console.sh 7912 --no-browser </dev/null | cat` returns while the server on 7912 is alive.
- `echo '{}' | bash tools/factory/hooks/console_serve.sh | cat` returns the same way.
- `python -m pytest tools/factory` passes, and the two new "returns while it runs" tests fail
  against the previous form of either script.
