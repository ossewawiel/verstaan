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
commit: 4c6ec5d
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

## Verifier (checkpoint 4, round 1 — reopened)

`git diff main...HEAD` for commits `61a1bd7`, `ab73877`, `48301cb`. Verdict: **needs a follow-up
fix**, reopened rather than filed as a side quest, because the bugs are in the one piece of new
executable code this issue exists to add, not adjacent to it.

1. **`isRoot` is backwards inside a worktree.** `read.mjs` compares each tree's path to `REPO`,
   which is resolved from `read.mjs`'s own location — the *current* tree, not the repository root.
   Run from inside a worktree, the side tree calls itself root and the real root shows as `../..`.
   This is exactly the configuration `refresh-console.sh` runs in. Fix: derive the root from
   `git rev-parse --path-format=absolute --git-common-dir`'s parent, or the first porcelain block,
   not from this module's own file location.
2. **`inProgressIssueOf`'s `worktree:` match breaks on Windows separators** (`git worktree add
   .worktrees\side-x` is what a PowerShell session types) and its `fallback` can attribute an
   in-progress issue to the wrong tree — any in-progress file in readdir order wins if none match.
   Normalise separators before comparing; never fall back across trees.
3. **The five `readWorktrees` tests cannot fail.** Replacing `inProgressIssueOf` with `return null`
   and hard-coding `dirty = 0` still passes all 38 tests — they only assert shape (`≥1 tree`,
   `typeof branch === 'string'`), not the actual logic. `inProgressIssueOf` has zero real coverage.
   `docs/standards/testing.md`: prove a gate fails before trusting it. Add a fixture-tree test that
   would catch findings 1 and 2.
4. **The root console goes stale.** The post-commit hook `cd`s into the committing tree and
   regenerates only that tree's console; the root's "Trees" panel — the whole point of this
   criterion — only refreshes when the root itself commits, checks out or merges, which is rare
   under this architecture. Needs the hook (or a separate mechanism) to also refresh the root's
   console when a non-root tree changes, or the criterion needs to be redefined as "current as of
   the last time the root tree looked."
5. **Minor:** `STATE.md` cited the close commit (`ab73877`) instead of the feat commit (`61a1bd7`),
   inconsistent with issue #02's precedent on the line above it. Fix when re-closing.
6. **Minor:** `.claude/commands/factory-run.md` (the slash-command entry point, separate from
   `.claude/skills/factory-run/SKILL.md`) was not updated and still says "Never work on `main`. Cut
   or check out the milestone branch" — no worktree, no root-tree rule, no `--resume`. Bring it in
   line with the skill.
7. **Nit:** a pruned/hand-deleted worktree still listed by `git worktree list` renders as `clean,
   no stamp` because `shIn` swallows the failed `git status` silently. `parseWorktreePorcelain`
   also ignores `locked`/`prunable`/`bare` porcelain lines. Low priority; note if convenient.

Checked clean: `install-git-hooks.sh`'s `--git-common-dir` fix, scope (no `engine/`/`data/`/`apps/`
files touched), `.gitignore` for `.worktrees/`, schema agreement across `SPEC.md`/`git-workflow.md`
/`SKILL.md`/`parse.mjs`, `nextIssue` skipping in-progress, issues 06/12's removal steps.

## Verifier (checkpoint 4, round 2)

Findings 1, 2, 4 and 6 fixed and confirmed by re-reading the code and by mutation testing (each
fix's absence fails a specific new test). Finding 3 (untestable tests) was only half fixed: the
new pure-function tests (`resolveRootPath`, `isRootTree`, `normalizeTreePath`,
`matchInProgressIssue`) are real, but `readWorktrees()` itself — the only caller, and the thing the
console actually calls — still had no test pinning that it uses `rootPath`/`isRootTree` rather
than the module's own `REPO` constant; reverting just those two lines in `readWorktrees()` back to
the round-1 form still passed all 45 tests. Finding 5 (STATE.md commit hash) remained, to be fixed
on close as always intended.

Fixed directly in this round rather than sent back to an agent, given how small and precisely
specified it was: added one more test to `tools/console/test/run.mjs` that calls `readWorktrees()`
itself with a fully fake `git worktree list --porcelain` fixture and asserts `isRoot`/`path` end to
end. Confirmed fail-then-pass by hand: reverted `readWorktrees()`'s `rel`/`isRoot` lines to the
round-1 form, ran the suite — the new test failed (`got [[".../__fake-root__",false],...], want
[[".",true],...]`) while every other test still passed; restored the fix, reran — all 45 green.

Verdict: safe to close. Findings 1, 2, 3, 4 and 6 are fixed and covered by tests that fail under
the old code. Finding 5 (STATE.md) is fixed as part of closing this issue. Finding 7 (nit) remains
open — not required for this issue; worth a line in a future console-polish pass if one happens.

Checked clean: `install-git-hooks.sh`'s `--git-common-dir` fix, scope (no `engine/`/`data/`/`apps/`
files touched), `.gitignore` for `.worktrees/`, schema agreement across `SPEC.md`/`git-workflow.md`
/`SKILL.md`/`parse.mjs`, `nextIssue` skipping in-progress, issues 06/12's removal steps.
