---
issue: 109
title: "A merged quest tree is removed by the merge path, and the console marks any tree whose branch is already on main"
milestone: Side
status: in-progress
depends_on: [92, 99]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: .worktrees/side-109-remove-tree-after-merge
github_issue: 52
---

## What

Issue 92 gives every branch its own tree under `.worktrees/<branch>`. `docs/factory/git-workflow.md`
"Worktrees" says a tree is removed once its branch has merged, and `.claude/skills/factory-run/SKILL.md`
step 10 says the opposite for its own merge path: "The tree itself is not removed here: it is
removed by the milestone's close-out issue". That rule is right for a milestone branch, `m1-mirror`,
where several issues share one tree. A side quest or a quest file has a branch of its own,
`side-NN-*` or `quest-NN-*`, and no close-out issue ever runs for it. So its tree stays on disk
after the PR merges.

On 2026-09-10 the root tree carried three such trees: `side-106-create-map`,
`side-107-playwright-mcp-plugin` and `quest-107-playwright-mcp-plugin`, all clean, all merged.
The web console listed all three under Trees with nothing to say they were finished, and the
developer read #107 as still active. The developer's ask: "how do we make the info more current
and ensure when quests are done the work trees are removed and updated in the future and now?"
The "now" was done by hand in that session. This quest is the "future".

After this quest, the merge path in `factory-run` step 10 and in the `quest` skill's hand-over
removes the tree and deletes the local branch once the PR is merged and the root tree has pulled,
when and only when the branch is a `side-*` or `quest-*` branch. A milestone tree is left alone,
as today. The console's Trees panel, file and web, labels any non-root tree whose branch is
already an ancestor of `main` as merged, so a tree that escaped the merge path still cannot read
as live. The `git-workflow.md` and `factory-run` texts say the same thing.

## Acceptance criteria

- `.claude/skills/factory-run/SKILL.md` step 10 and `.claude/skills/quest/SKILL.md` §4 name the
  removal, `git worktree remove .worktrees/<branch> && git branch -d <branch>`, as part of the
  "Gate, PR, merge" path after `git pull --ff-only` in the root, gated on the branch prefix
  `side-` or `quest-`. The paragraph "The tree itself is not removed here" says a milestone
  branch is the exception, not the rule.
- `docs/factory/git-workflow.md` "Worktrees" says which branch prefixes the merge path removes
  and which the milestone close-out removes.
- `readWorktrees()` in `tools/console/src/read.mjs` and its port in
  `apps/console/server/src/model/read.ts` return a `merged: true` field for a non-root tree
  whose `head` is an ancestor of `main` (`git merge-base --is-ancestor <head> main`), and
  `false` otherwise. The root tree reports `merged: false`.
- The file console (`tools/console/src/render.mjs`) and the web console's Trees panel show
  that field as a label, "merged", on the tree's row, and never show such a tree as the active
  one in Now/Next.
- `node tools/console/test/run.mjs` and `npm test` in `apps/console` carry a test each: a tree
  whose head is on `main` reports `merged: true`; the root tree reports `merged: false`;
  an unmerged tree reports `merged: false`.
- `git worktree list` in the root tree, run right after a `side-*` quest merges through the
  updated path, no longer lists that quest's tree.

## Not in scope

- Removing a milestone tree (`m*-*`). The close-out issue keeps that job.
- Deleting the remote branch on GitHub. `gh pr merge --delete-branch` can do it and is the
  developer's call per PR; this quest touches local trees and branches only.
- Pruning trees that already exist when this quest lands. The three from 2026-09-10 are gone;
  any other is a one-line `git worktree remove` by hand.
- Detecting a squash-merged branch whose commits are not ancestors of `main`. The
  `merge-base --is-ancestor` test reads such a tree as unmerged; the label says "merged" only
  when git can prove it.

## Done when

- [x] `factory-run` step 10 removes a `side-*`/`quest-*` tree and branch after the merge and pull.
- [x] `quest` skill §4 does the same for the quest-file branch it merges.
- [x] `git-workflow.md` "Worktrees" states the two removal paths by branch prefix.
- [x] `readWorktrees()` reports `merged` in both the file console and the web console model.
- [x] Both Trees panels show the "merged" label; Now/Next never picks a merged tree.
- [x] Tests for `merged` in `tools/console/test/` and `apps/console/server/test/` fail first, then pass.
- [x] `python -m tools.validate --all` exits 0.
