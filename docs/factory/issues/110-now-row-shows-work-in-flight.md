---
issue: 110
title: "The console's Now row shows the quest in flight, and clears when none is"
milestone: Side
status: in-progress
depends_on: [99, 109]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: .worktrees/side-110-now-row-shows-work-in-flight
github_issue: 55
---

## What

The web console's Now / Next panel carries a row labelled "Now". `ConsoleRoom.tsx:45` renders
`model.last` in it. `model.last` is `lastCompleted()`: the last quest whose status is `done`. So
the row never shows work in flight. It shows finished work, labelled "— done", and it keeps
showing it after that quest merges. During the run that closed #109 on 2026-09-10, the row could
name only #107, the last quest then marked done, while #109 was the quest being fought.

A second fault makes the panel later still. `startWatching()` in
`apps/console/server/src/index.ts` builds its watch list once, at startup, from the trees that
exist then. `/factory-run` creates `.worktrees/side-NN-<slug>` and writes `status: in-progress`
into that tree's issue file seconds later. No watcher covers that directory. The `.git/worktrees`
event that announces the new tree carries the section `worktrees`, and `shouldIgnoreGitEcho`
drops that section for 1500 ms after the console's own `git` call, which every read makes. A
30-second rescan adds the missing watcher, but it calls no `onChange`. The browser is never told,
so it holds its stale `/api/state` until some other watched path changes. The developer,
2026-09-10: "the 'Now' Does not get updated properly during the factory run. it is late to show
the quest in progress and it does not clean up after the quest is merged and local is refreshed."

After this quest, "Now" names every quest whose status is `in-progress`, lowest number first,
each with the tree it runs in. With no such quest, the row reads "Nothing in progress". The last
completed quest moves to its own "Last" row, so the panel keeps what it showed before. A tree
that `merged` marks as landed contributes nothing, so a stale in-progress file cannot hold the
row open (issue 109). The server watches the root's `.worktrees` directory, so a tree created
mid-run is watched as it appears, and adding a tree's watcher sends one `issues` change, so the
page refreshes at once instead of waiting for an unrelated event.

## Acceptance criteria

- `buildModel()` in `apps/console/server/src/model/parse.ts`, and its port in
  `tools/console/src/parse.mjs`, return `inProgress`: every issue with `status: in-progress`,
  ordered by number, each carrying `n`, `title`, `agent`, `model`, `effort` and `tree`.
- `tree` is the branch of the worktree whose issue file names that quest, the tree's path when
  that tree is detached, and `null` when only the root tree names it.
- An issue that is `in-progress` only in a tree `readWorktrees()` reports as `merged: true` does
  not appear in `inProgress`.
- The web console's Now row lists every `inProgress` entry, one line each, lowest number first.
  Each line links to the quest card and names its tree. An empty list renders the literal text
  "Nothing in progress".
- The Now / Next panel carries a "Last" row showing `model.last` as `#NN <title> — done`, or
  "Nothing closed yet" when no quest is done.
- `watchPaths()` in `apps/console/server/src/index.ts` watches the root's `.worktrees` directory,
  and `shouldIgnoreGitEcho` never drops an event from it.
- When the server starts watching a tree's `docs/factory/issues` directory after startup, it
  sends one change on `/events` naming the `issues` section.
- `node tools/console/test/run.mjs` and `npm test` in `apps/console` each carry tests for
  `inProgress`: one in-progress quest reports its tree; two report both, in number order; a quest
  in-progress only in a merged tree reports none; no in-progress quest returns an empty list.
- An `apps/console/e2e/` spec proves both Now states against a fixture repo: an in-progress quest
  is named on the row, and a fixture with none reads "Nothing in progress".

## Not in scope

- The file console's "Next move" rail (`tools/console/src/render.mjs`). It has no Now row and a
  different shape. Only the shared model layer gains `inProgress`, for parity.
- Starting, stopping or otherwise acting on a run from the page. Quest 100 owns that.
- Streaming an agent's progress or log inside a running quest. Quest 100's job runner owns that.
- Removing the 30-second rescan. It stays as the backstop for a tree that appears without a
  filesystem event this console sees.
- Judging a quest that an agent left `in-progress` after a failed run. The row reports the file
  as it stands.

## Done when

- [x] `inProgress` lists every in-progress quest with its tree, in both model layers.
- [x] A quest in-progress only in a merged tree contributes nothing to that list.
- [x] The web Now row lists them, lowest number first, each linked and naming its tree.
- [x] The web Now row reads "Nothing in progress" when the list is empty.
- [x] A "Last" row carries the last completed quest.
- [x] `watchPaths()` watches the root `.worktrees` directory, and the echo filter spares it.
- [x] Watching a tree's issues directory after startup sends one `issues` change on `/events`.
- [x] Tests for `inProgress` in `tools/console/test/` and `apps/console/server/test/` fail first,
      then pass.
- [x] An e2e spec proves both Now states.
- [x] `python -m tools.validate --all` exits 0.
