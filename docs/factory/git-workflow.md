# Git workflow

## Branches

- `main` is always green and always releasable. Nothing is committed to it directly.
- One branch per milestone: `m0-foundation`, `m1-mirror`, `m2-store`, `m3-engine`, `m4-compiler`,
  `m5-apps`, `m6-growth`. Post-M6 work uses `post-m6-<slug>`.
- A milestone branch is cut from `main` when its first issue starts and merged when `/gate` passes
  and the verifier has read the diff.

## Worktrees

Planned in side quest 92; the rule holds from now. The root checkout stays on `main` and changes
only by merge. Each branch that is being worked on gets its own tree under `.worktrees/<branch>`
with `git worktree add`, and a session works there. Two sessions never share a tree; an issue
marked `in-progress` names the tree that holds it. The gate stamp lives in each tree's own git
directory, so a gate passed in one tree unlocks nothing in another. A tree is removed when its
branch has merged.

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
