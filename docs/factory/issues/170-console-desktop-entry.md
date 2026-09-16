---
issue: 170
title: "Verstaan Console as a desktop app: one launcher entry starts the service and opens its own window"
milestone: Side
status: done
depends_on: [102]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: e96fbb0
worktree: null
github_issue: 250
---
## What

Today the console has two front doors and both are a terminal. `console.sh` starts the service
and calls `xdg-open`, so the console lands as one more tab in a browser window that already
holds twenty. `console.cmd` does the same on Windows. Neither one is reachable from the app
launcher: `ls ~/.local/share/applications` lists Basecamp, Discord, GitHub and Gmail, and no
Verstaan. The developer asked, 2026-09-15: "i need a shortcut or app to run to start up the
console web 'Verstaan Console' maybe?"

After this quest, SUPER+SPACE finds "Verstaan Console". One click starts the service if it is
down, waits for `/health`, and opens `http://127.0.0.1:7864/` in a Chromium app window: own
title, own icon, no tab bar, no address bar. A tracked installer writes the entry, so the
desktop file is generated from the repo and never hand-edited. Linux only for now, by the
developer's choice on 2026-09-15; `console.cmd` still covers Windows from a terminal, and a
later quest can name Windows and macOS shortcuts.

The mechanism the implementer must get right: a Chromium `--app=` window reports an `app_id` of
`chrome-127.0.0.1__7864-Default`, not the desktop file's name. Hyprland matches a window to its
desktop entry by that string, so the entry carries `StartupWMClass=chrome-127.0.0.1__7864-Default`
or the bar and the alt-tab list show a generic Chromium icon instead of the Verstaan one.

This quest was written as #167 on 2026-09-15 and renumbered to #170 the same day: a second
session working issue #18 had already claimed #167 for the SEM tagset mismatch and mirrored it
to GitHub. The number moved, nothing else did.

## Acceptance criteria

- `tools/console/install-desktop-entry.sh` run from a clean checkout writes
  `~/.local/share/applications/verstaan-console.desktop` and exits 0. Run twice, it rewrites the
  same file and still exits 0.
- `desktop-file-validate ~/.local/share/applications/verstaan-console.desktop` reports no error.
- With the service stopped, launching the entry starts it and opens the console. `curl -s
  http://127.0.0.1:7864/health` answers 200 afterwards.
- With the service already running, launching the entry opens the window and starts no second
  server: exactly one `dist-server/server/src/index.js` process is listed.
- The window is a Chromium app window, not a tab: no tab strip and no address bar, and its title
  reads "Verstaan Console".
- The launcher entry shows the Verstaan icon, and the icon file it names is tracked in the repo.
- `console.sh` keeps its current behaviour with no arguments and with `--no-browser`; the new
  flag is additive.
- `python -m tools.validate --changed --base origin/main` and the console tooling suite pass.

## Not in scope

- Windows and macOS shortcuts. `console.cmd` and `console.sh` still serve those from a terminal.
- A packaged desktop application (Electron, Tauri, a system tray). This entry drives the existing
  local service and nothing else.
- The M5 "first desktop shell" in PLAN §7, which is the translator's own application, not this
  factory console.
- The page favicon and any in-app branding beyond the one icon file the entry needs.
- Auto-start at login.

## Done when

- [x] `console.sh` accepts a flag that starts the service without a browser, waits for `/health`,
      then opens the console in a Chromium app window, falling back to the first browser it finds
      among the chromium-class ones on `PATH`.
- [x] An icon file for the console is tracked in the repo and named by the desktop entry.
- [x] `tools/console/install-desktop-entry.sh` writes the entry, is idempotent, and resolves the
      repository path itself rather than hard-coding one.
- [x] The entry sets `StartupWMClass` so Hyprland matches the app window to the icon.
- [x] A test under `tools/factory/tests/` covers the installer: the file is written, it is valid,
      and a second run leaves it unchanged.
- [x] `README` or `docs/factory/playbook.md` names the installer in one line, next to `console.sh`.
- [ ] The gate passes on the branch.
