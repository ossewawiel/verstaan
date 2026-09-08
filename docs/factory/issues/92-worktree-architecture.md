---
issue: 92
title: "Worktree architecture: one tree per quest, never two sessions in one tree"
milestone: Side
status: done
depends_on: [2]
agent: implementer
agents: [implementer, docs-writer]
model: sonnet
effort: medium
checkpoint: 4
commit: 61a1bd7
---
## What

On 2026-09-08 two sessions worked in one working tree: one closed issue 02 on `m0-foundation`
while the other edited docs and untracked the console, and the second session's staged change
rode into the first session's close commit. Git worktrees give each quest its own tree on its own
branch, sharing one repository. This quest makes that the factory's shape and makes the console
show all trees at once. It needs no remote and should land before side quest 91.

## The shape

```
verstaan/                         the root tree, always on main. Planning, docs, the console. Read-mostly.
.worktrees/                       gitignored. One tree per branch:
  m1-mirror/                      the main quest
  side-91-source-control/         a side quest, in parallel
  side-92-worktrees/
```

- `/factory-run NN` works in the worktree of the issue's branch, creating it with
  `git worktree add .worktrees/<branch> <branch>` when absent. It never works in the root tree.
- The root tree stays on `main` and only changes by merge. Docs edits that are not an issue's
  work go through a `meta` side quest in their own tree, the same as code.
- A worktree is removed after its branch merges, by the close-out issue of the milestone.

## Acceptance criteria

- **Issue status gains `in-progress`.** `SPEC.md` §6 schema: `status: open | in-progress | done`,
  plus `worktree: <path>` set while in progress. `/factory-run` flips open → in-progress at the
  brief step and in-progress → done at the close commit. The console draws in-progress with `◐`
  and the label "fighting", and the map shows which tree it is in.
- **Two sessions cannot take one issue.** `/factory-run` refuses an issue already `in-progress`
  unless `--resume` is given, and says which tree holds it.
- **Worktree creation and removal** are steps in `factory-run/SKILL.md`, with the exact commands,
  and `git-workflow.md` describes the root-on-main rule.
- **The gate stamp is per tree.** Already true, because `require-gate.sh` and `/gate` use
  `git rev-parse --git-dir`, which is worktree-specific. A test in the report shows a stamp in one
  tree does not unlock a merge from another.
- **Hooks work inside a worktree.** `CLAUDE_PROJECT_DIR` is the worktree root; `refresh-console.sh`
  renders that tree's console into its own `docs/factory/console/`. Shown by running a session in
  `.worktrees/side-92-worktrees/`.
- **The root console shows every tree.** A "Trees" panel from `git worktree list --porcelain`:
  path, branch, head, dirty count, the in-progress issue, and whether its stamp matches. The
  root tree's own row is marked. `tools/console/src/read.mjs` gains `readWorktrees()`, tested.
- **Merging updates the root.** The post-merge git hook already regenerates the console; the
  close-out issues (06, 12) add `git worktree remove` for the merged branch.
- **`.worktrees/` is gitignored** and `install-git-hooks.sh` installs hooks that fire for every
  tree (hooks live in the shared `.git/hooks`, so this is already the case; the report confirms it).

## Not in scope

The GitHub remote (91). Locking across machines. Claude Code's own `EnterWorktree` tool: it may be
used by a session, but the factory's path is the explicit `git worktree add`, so it works from any
terminal.

## Done when

- [ ] `/factory-run` on a fresh open issue creates the tree, marks the issue in-progress, works
      there, closes it, and the root console shows the tree throughout. Not run end-to-end: the
      root tree here is still checked out on `m0-foundation`, not `main`, because the M0 work is
      mid-milestone and unmerged. `git worktree add` refuses a branch already checked out
      elsewhere, so this needs the root moved to `main` first — a real, visible change to this
      session's own working tree that issue 06's "first gated merge" is the natural place to make,
      not a side effect of building the mechanism. The mechanism itself is exercised directly with
      real `git worktree` commands (see report) and by unit test (`nextIssue` skips in-progress).
- [ ] The refusal on a second `/factory-run` of the same issue is shown in the report as the
      `SKILL.md` step and a `nextIssue()` test, not as a literal second `/factory-run` invocation,
      for the same root-on-`main` reason above.
- [x] The cross-tree stamp test is in the report.
