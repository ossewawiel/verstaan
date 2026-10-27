---
issue: 192
title: "The console's shipped dependencies clear npm audit at high"
milestone: Side
status: done
depends_on: [99]
agent: implementer
agents: [implementer]
model: haiku
effort: low
checkpoint: null
commit: f01dfb8
worktree: null
github_issue: null
---
## What

`/gate` step 3 runs `npm audit --omit=dev --audit-level=high` in `apps/console/`. On 2026-10-27
it fails on `main`. Advisories published after the last merge flag `zod`, `body-parser`,
`brace-expansion` and `@modelcontextprotocol/sdk` as high, and four more packages as moderate.
All eight come through the existing lockfile, and every fix stays inside its current major. While
the step fails, no branch earns a gate stamp, so no pull request merges. The quest branch for
189 to 191 hit it first. The owner chose on 2026-10-27 to land this fix on that branch, in its
own work commit.

After this quest, `npm audit fix` has moved `apps/console/package-lock.json` to patched versions.
`package.json` keeps its ranges. The loadout is Haiku at low, the repeat-quest tier: the change is
one command and a lockfile, and the console's own tests decide whether it holds.

## Acceptance criteria

- `npm audit --omit=dev --audit-level=high` in `apps/console/` exits 0.
- `git diff main -- apps/console/package.json` is empty. Only `package-lock.json` changes.
- `npm ci`, `npm run build` and `npm test` in `apps/console/` exit 0.
- `bash tools/factory/hooks/gate_full.sh` exits 0 and writes the stamp.

## Not in scope

The moderate advisories in dev-only tooling, which the gate's `--omit=dev` excludes. A scheduled
audit that catches the next advisory before a branch does, which is a quest of its own.

## Done when

- [x] The audit step passes at high.
- [x] Only the lockfile changed.
- [x] The console builds and its tests pass.
