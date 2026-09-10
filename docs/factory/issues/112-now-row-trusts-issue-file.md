---
issue: 112
title: "The Now row trusts the issue file, and the merged label stops guessing from ancestry"
milestone: Side
status: in-progress
depends_on: [109, 110]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: .worktrees/side-112-now-row-trusts-issue-file
github_issue: 61
---

## What

`readWorktrees()` sets a tree's `merged` field from one command,
`git merge-base --is-ancestor <head> main` (`apps/console/server/src/model/read.ts:157`, mirrored
in `tools/console/src/read.mjs:116`). That command answers a narrower question than the field
name suggests: it asks whether the branch holds any commit `main` lacks. A tree branched from
`main` that has not committed yet holds none, so it reads as merged. The repo squash-merges
every pull request, and a squash keeps none of the branch's commits, so a branch whose work has
truly landed always holds commits `main` lacks and reads as unmerged. The field is inverted
against both cases it exists to separate. Measured in the root tree on 2026-09-10: the fresh
`m1-mirror` tree read `merged: true`; `side-106`, `side-107`, `quest-107` and `side-109`, the
four leftover trees issue 109 was written for, each read `merged: false`.

`inProgressQuests()` then drops a quest whose every claimant tree carries that flag
(`apps/console/server/src/model/parse.ts:137`, `tools/console/src/parse.mjs:88`). On 2026-09-10
issue 7 ran in `.worktrees/m1-mirror`, `/api/state` reported it `in-progress` with that tree, the
quests room and the Trees panel both showed it, and the Now row read "Nothing in progress". The
developer: "the quest page shows it correctly and in console page the tree card shows it but the
now/next card is not updated. that is the issue." The row stays empty until the tree's first
commit, and a tree that only falls behind `main` reads as merged again.

After this quest the issue file decides what is in flight, as `CLAUDE.md` already says it decides
status: `inProgressQuests()` lists every `status: in-progress` quest with the tree its
`worktree:` field names, and consults no git ancestry. `merged` is replaced by a field that
answers the question issue 109 asked — is this tree finished, so the merge path may remove it —
from the same source: a non-root tree is finished when no in-progress issue file names it and its
working tree is clean. Ancestry cannot answer that question, because a tree that has not started
and a tree whose work has landed are the same shape in git.

## Acceptance criteria

- `inProgressQuests()` in `apps/console/server/src/model/parse.ts` and `tools/console/src/parse.mjs`
  reads no tree flag. Every issue with `status: in-progress` appears, ordered by number, carrying
  the tree its own `worktree:` field names, or `(this tree)` when that tree is the root.
- `readWorktrees()` in `apps/console/server/src/model/read.ts` and `tools/console/src/read.mjs`
  reports `finished: true` for a non-root tree that no in-progress issue file names and whose
  `dirty` count is 0, and `false` otherwise. The root tree always reports `false`. No caller runs
  `git merge-base --is-ancestor`.
- The web console's Trees panel and `tools/console/src/render.mjs` label a finished tree
  "finished", where they label a merged one today.
- With one worktree whose head equals `main`'s head and whose issue file says `in-progress`, the
  Now row on `http://127.0.0.1:7864/` names that quest and its tree. Checked live with the
  Playwright MCP browser against the real `.worktrees/m1-mirror`.
- `node tools/console/test/run.mjs` and `npm test` in `apps/console` each carry a test that fails
  before the change: a tree at `main`'s head whose issue file says in-progress contributes its
  quest to `inProgress`. Each also carries a test that a clean tree no in-progress file names
  reports `finished: true`.
- An e2e spec in `apps/console/e2e` proves the Now row names a quest whose tree sits at `main`'s
  head.
- `python -m tools.validate --all` exits 0.

## Not in scope

- The removal rule itself. `.claude/skills/factory-run/SKILL.md` step 10, the `quest` skill §4
  and `docs/factory/git-workflow.md` keep saying a `side-*` or `quest-*` tree goes at merge and a
  milestone tree waits for its close-out issue. Only the label the console prints changes.
- Detecting a squash-merged branch from git alone. This quest stops asking git that question
  rather than answering it better.
- `docs/factory/STATE.md` and `/factory-status`, which read the root tree's issue files only and
  so still call issue 7 "Next up" while a worktree runs it. A separate quest if it matters.
- The "Next" row's rule. It keeps naming the lowest open main quest whose dependencies are done,
  and reads "None open" when an in-progress quest has left none.

## Done when

- [x] `inProgressQuests()` consults no tree flag in either model layer.
- [x] `merged` is gone from both `readWorktrees()` ports, replaced by `finished` as defined above.
- [x] No file under `apps/console/` or `tools/console/` runs `git merge-base --is-ancestor`.
- [x] Both Trees panels label a finished tree "finished".
- [x] Tests in `tools/console/test/` and `apps/console/server/test/` fail first, then pass.
- [x] An e2e spec proves the Now row names a quest whose tree sits at `main`'s head.
- [x] The live console at `http://127.0.0.1:7864/` names issue 7 and `m1-mirror` in its Now row,
      checked with the Playwright MCP browser. Proved as an A/B against the real tree on
      2026-09-10: the old code served the same repo at "Nothing in progress" and labelled the
      tree "merged"; the new code names "#07 ... — m1-mirror" and drops the label.
- [x] `python -m tools.validate --all` exits 0.
