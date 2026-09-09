---
issue: 96
title: "require-gate blocks the root tree from ever catching up with origin/main"
milestone: Side
status: in-progress
depends_on: [94]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: .worktrees/side-96-require-gate-blocks-its-own-sync
github_issue: null
---
## What

Issue 94 made `git merge` into `main` refuse outright, so the pull request is the only way in.
It refuses too much. After a PR merges on GitHub, the root tree is behind `origin/main` and the
only ways to catch up are both shut: `git merge --ff-only origin/main` hits the new refusal, and
`git pull` wants a gate stamp on `main`'s HEAD, which a *remote* merge never writes. The root tree
sat nine commits behind with no supported way forward the moment #94 landed.

A fast-forward from `origin/main` cannot carry unreviewed work. Every commit in it already passed
the `gate` check on a pull request. That is the case to allow; a real merge of a feature branch
into `main` stays refused.

Separately, the hook reads the command out of its stdin JSON with a greedy pattern:
`sed -n 's/.*"command":[[:space:]]*"\(.*\)".*/\1/p'`. Claude Code sends a `description` field after
`command`, so the `.*` runs past the command's closing quote to the last quote in the payload.
`git merge --no-ff somebranch` is read with a ref of `branch`. This predates #94; it has been
picking the wrong ref all along and only looked correct because the refusal fired anyway.

## Acceptance criteria

- On `main`, `git merge --ff-only origin/main` is allowed; the test for it fails first.
- On `main`, `git merge --no-ff <branch>` and a bare `git merge <branch>` are still refused, with
  the message naming `gh pr merge`. The existing tests for this keep passing unchanged.
- On `main`, `git merge --ff-only <some-other-branch>` is refused: `--ff-only` alone is not the
  licence, the ref being the branch's own upstream is.
- The command is extracted correctly from a payload that carries fields after `command`, and from
  a command containing an escaped double quote. `git merge --no-ff somebranch` resolves a ref of
  `somebranch`, not `branch`. Both cases have tests that fail first.
- Whatever extraction replaces the greedy `sed` keeps the hook fast enough to sit on every
  `PreToolUse`; if it shells out to another interpreter, say in a comment why that cost is
  acceptable.
- `docs/factory/git-workflow.md` "Worktrees" states how the root tree catches up after a PR
  merges, since #94 left that unsaid.
- `docs/factory/STATE.md` is refreshed: it merged in #94 still reading "not yet pushed or merged"
  against commit `0feadce`, which is stale on both counts.

## Not in scope

Relaxing the stamp requirement on `gh pr create`, `gh pr ready`, `gh pr merge` or `git pull` for
any branch other than the `main` fast-forward case above.

## Done when

- [ ] From the root tree on `main`, `git merge --ff-only origin/main` succeeds and the tree is
      level with `origin/main`.
- [ ] `git merge --no-ff <branch>` from the root tree still exits 2 naming `gh pr merge`.
- [ ] `tools/factory/tests/test_require_gate.py` covers both new behaviours and every test passes.
