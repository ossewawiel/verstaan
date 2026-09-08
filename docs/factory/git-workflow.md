# Git workflow

## Branches

- `main` is always green and always releasable. Nothing is committed to it directly.
- One branch per milestone: `m0-foundation`, `m1-mirror`, `m2-store`, `m3-engine`, `m4-compiler`,
  `m5-apps`, `m6-growth`. Post-M6 work uses `post-m6-<slug>`.
- A milestone branch is cut from `main` when its first issue starts and merged when `/gate` passes
  and the verifier has read the diff.

## Worktrees

The root checkout stays on `main` and changes only by merge; it is read-mostly, for planning,
docs and the console. Every branch that is being worked on gets its own tree under
`.worktrees/<branch>`, created with:

```
git worktree add .worktrees/<branch> <branch>            # branch already exists
git worktree add -b <branch> .worktrees/<branch> main     # branch does not exist yet
```

A session works inside that tree, never in the root. Two sessions never share a tree: an issue
marked `in-progress` names the tree that holds it in its `worktree:` field, and `/factory-run`
refuses to start an issue that is already `in-progress` unless given `--resume`, naming the tree
that holds it (`docs/factory/SPEC.md` §6, `.claude/skills/factory-run/SKILL.md`).

The gate stamp lives in each tree's own git directory (`git rev-parse --git-dir` resolves to
`.git` in the root and to `.git/worktrees/<branch>` inside a worktree), so a gate passed in one
tree unlocks nothing in another: `require-gate.sh` and `/gate` read only the current tree's stamp.

A tree is removed once its branch has merged, with:

```
git worktree remove .worktrees/<branch>
git branch -d <branch>
```

`.worktrees/` is gitignored. Hooks live in the one shared directory `git rev-parse
--git-common-dir` resolves to (not `--git-dir`, which is per-worktree and has no `hooks/` of its
own) and fire the same way for every tree; `tools/console/install-git-hooks.sh` installs there.
`CLAUDE_PROJECT_DIR` for a session working in a worktree is that worktree's root, so
`refresh-console.sh` renders that tree's own `docs/factory/console/`.

Closing an issue in its own worktree does not merge anywhere by itself, so the tree's on-disk
`status: done` exists only in that one checkout until the branch merges. `readRepo()` in
`tools/console/src/read.mjs` (`mergeIssuesAcrossWorktrees`) reads every worktree's own copy of
`docs/factory/issues/*.md`, not only the tree the console happens to be generated from, and keeps
whichever copy's status is furthest along per issue file. This is what makes an unmerged side
quest's close visible in the root's console the moment it lands, the same promise `worktree:`
attribution already made for `in-progress`. It is one-directional: a file the current tree does
not already have (a new issue proposed only on a branch) is not surfaced. `install-git-hooks.sh`'s
post-commit/checkout/merge hooks already regenerate both the committing tree's console and the
root's on every git operation in any tree — before this fix that call read stale data; after it,
no extra step is needed for the root's console to catch up.

## Commits

- One work commit per issue: `feat(#NN): <title>`, `fix(#NN): <title>`, `data(#NN): <title>`,
  `docs(#NN): <title>`, `chore(#NN): <title>`. Scope is the issue number.
- After the work commit, a `chore(#NN): close` commit flips `status: done` and fills `commit:` in
  the issue file with the work commit's hash.
- Commit messages end with the attribution trailer the session provides.
- Do not amend. Do not force-push. Do not rebase interactively.

## Pull requests

Until a remote exists, "open the PR" means: run `/gate`, let the verifier read the diff, then
`git merge --no-ff m<N>-<slug>` into `main`. When a GitHub remote exists, the milestone branch
opens a draft PR at its first commit and `gh pr ready` only after `/gate` has stamped HEAD. The
`require-gate` hook enforces that.

## Finishing a milestone

Tell the developer, in this order:
1. Which issues closed, with their commits.
2. What the gate ran and how long it took.
3. What the verifier flagged and what was done about it.
4. The exact next command.
