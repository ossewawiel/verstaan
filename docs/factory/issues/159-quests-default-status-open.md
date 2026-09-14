---
issue: 159
title: "The Quests page opens to Status: Open, not Status: All"
milestone: Side
status: in-progress
depends_on: []
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: .worktrees/side-159-quests-default-open
github_issue: 205
---
## What

Today the Quests room reads its status filter straight from the URL: `apps/console/client/src/
rooms/QuestsRoom.tsx` line 60 sets `status` to `params.get('status') ?? ''`, so a bare `/quests`
visit shows every quest, done and open together. The developer asked, 2026-09-14: "can we ensure
the 'Quests' page on the battle console web defaults to Status: Open."

After this quest, a bare `/quests` visit shows only open quests. The `<select>` at line 136
already lists `open` as a value; the default just has to match it. A visit that already carries
a `status` query parameter, or one set from the filter dropdown, keeps working exactly as before,
including a deliberate `status=` (All).

## Acceptance criteria

- Load `/quests` with no query string: only quests whose `status` is `open` are listed, and the
  Status dropdown shows "Open" selected.
- Load `/quests?status=done`: only done quests are listed, Status dropdown shows "Done".
- Load `/quests?status=`: every quest is listed (the explicit "All" case still works).
- Picking "All" from the Status dropdown after load still clears the filter and shows every
  quest.

## Not in scope

- Milestone or agent filter defaults; both stay "All".
- Any change to how the server or `tools/console/src/generate.mjs` reports status.

## Done when

- [x] `apps/console/client/src/rooms/QuestsRoom.tsx` defaults `status` to `'open'` when the URL
      carries no `status` parameter.
- [x] A test (existing or new, under `apps/console/e2e/` or the client's own suite) covers the
      default-to-open case and the explicit-All case.
- [x] `npm run test:e2e` (or the client suite it runs) passes.
