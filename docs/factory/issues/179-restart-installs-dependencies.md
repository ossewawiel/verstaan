---
issue: 179
title: "The restart installs what a merge added: npm ci when the lockfile moved, not only on the first run"
milestone: Side
status: in-progress
depends_on: [102, 162, 178]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: .worktrees/side-179-restart-installs-deps
github_issue: 271
---
## What

Today the console installs its dependencies once and never again. `console.sh` guards the install
with `[ ! -d "$app/node_modules" ]`, first run only; `console.cmd` and `console.ps1` carry the same
test. `build-if-stale.mjs`, the one staleness rule `console.sh` and `POST /api/restart` share,
rebuilds when `client/src` or `server/src` is newer than the last good build and stops there. Its
own header says why: "Nothing here touches `node_modules`: a restart runs long after the first
`npm ci`, so installing dependencies again is out of scope." Issue 162 wrote that line when no
quest had ever added a dependency. Quest 178 added `@anthropic-ai/claude-agent-sdk` to
`apps/console/package.json`. The merge landed the import and the new lockfile; the root tree's
`node_modules` kept the 167 packages it already had. The next restart rebuilt, `tsc` stopped with
`Cannot find module '@anthropic-ai/claude-agent-sdk'`, and the console never came back. The owner,
2026-09-19: "the console failed to restart please check why". One `npm ci` by hand fixed it, and
nothing in the console pointed at the install.

After this quest `build-if-stale.mjs` decides two things in order: install, then build. An install
is due when `node_modules` is missing, or when `package.json` or `package-lock.json` is newer than
the stamp of the last install this script recorded as good — the same stamp shape `isStale` already
uses for the build, for the same reason: a failed install must never read as fresh. The three
launchers drop their own first-run test and let the shared script decide, so a launcher and the
restart endpoint can never disagree about the install, the rule issue 162 already set for the
build. A failed `npm ci` stops the restart exactly as a failed build does: the old server stays
bound to the port, and the error it reports names the install.

## Acceptance criteria

- `build-if-stale.mjs` exports an install-staleness check beside `isStale`, with its own stamp
  file, and runs `npm ci` before `npm run build` when that check says an install is due.
- Removing `apps/console/node_modules/@anthropic-ai` and touching `apps/console/package-lock.json`,
  then running `node apps/console/server/scripts/build-if-stale.mjs apps/console`, installs,
  builds and exits 0.
- Running that same command a second time installs nothing, builds nothing, and says the tree is
  up to date.
- `POST /api/restart` against a tree whose lockfile moved since the last install brings the console
  back on the same port, with the install named in the restart output.
- A failing `npm ci` leaves the old server running and reports the install's own output, the way
  `restart-launch.mjs` already reports a failing build.
- `console.sh`, `console.cmd` and `console.ps1` no longer test for `node_modules` themselves.
- Unit tests cover a missing `node_modules`, a lockfile newer than the stamp, and an up-to-date
  tree, against a throwaway fixture directory with the install command injected — the suite never
  runs a real `npm ci`.
- `/gate` and CI green.

## Not in scope

- `npm install` and any dependency upgrade. This quest runs `npm ci` only, which installs the
  committed lockfile and nothing else; a version bump stays a change someone commits on purpose.
- Auditing the dependencies. The gate's own `npm audit --omit=dev --audit-level=high` step is
  unchanged.
- A lockfile that moved in a worktree the console is not serving. The check reads the tree the
  console runs from, the `appDir` `build-if-stale.mjs` already takes.
- The `quest-run` session, its `canUseTool` card or its restart resume (quest 178).
- Installing dependencies for anything outside `apps/console`. The engine and `tools/` have no
  npm install step to share.

## Done when

- [ ] `build-if-stale.mjs` owns the install decision beside the build decision, with its own stamp.
- [ ] A restart after a lockfile change installs, builds, and comes back on the same port.
- [ ] A failed install leaves the old server up and names the install in its output.
- [ ] `console.sh`, `console.cmd` and `console.ps1` no longer decide the install themselves.
- [ ] Unit tests cover a missing `node_modules`, a moved lockfile and an up-to-date tree, with no
      real `npm ci` in the suite.
- [ ] `/gate` and CI green.
