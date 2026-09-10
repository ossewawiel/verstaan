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

The gate stamp names a commit, not a tree. `/gate` writes an empty file
`<git-common-dir>/verstaan-gate-stamps/<sha>` when every step passed in a clean tree, and the
store is shared by every worktree. So "commit X passed the gate" is a fact any tree can check
before `gh pr ready` or `gh pr merge` runs: `git merge` into `main` is refused outright, on any
tree, stamped or not; the pull request in "Pull requests" below is the only way in. `gh pr create`,
`gh pr ready`, `gh pr merge` and `git pull` still ask whether HEAD is stamped. The logic is
`tools/factory/hooks/require_gate.sh` (tested in `tools/factory/tests/test_require_gate.py`);
`.claude/hooks/require-gate.sh` is a one-line wrapper that execs it, and is edited by hand only.

The root tree catches up with `origin/main` after a PR merges on GitHub with `git merge --ff-only
origin/main`, or `git pull --ff-only`. Both are exempt from the refusal above: a fast-forward of
`main` from its own tracked upstream cannot carry unreviewed work, since every commit on it already
passed the `gate` check on a pull request. `--ff-only` on its own is not the licence — `git merge
--ff-only some-other-branch` still refuses — only a fast-forward from `main`'s own upstream is.
`git pull --ff-only` loses the exemption the moment it names an explicit repository or refspec; the
hook does not parse enough of `git pull` to tell that an explicit target is the tracked upstream and
nothing more, so it falls back to asking whether HEAD is stamped.

"`main`'s own upstream" means `main@{upstream}` when that is configured, else `origin/main` by
name if that ref exists. A repo reached by `git clone` gets `branch.main.remote`/`branch.main.merge`
written for free; this repository's own root checkout was `git init`-ed locally and only later got
`git remote add origin`, so `main@{upstream}` has never resolved there. The name-based fallback in
`require_gate.sh` is what makes the exemption fire on that tree at all.

Since issue 92, a session's working directory is a worktree, never the root tree — this is now
the normal case, not the exception. Catching the root tree up after a pull request merges on
GitHub therefore means running the fast-forward against the root tree from inside a worktree
session: `cd <root> && git merge --ff-only origin/main`, or the same thing written as
`git -C <root> merge --ff-only origin/main` without changing directory. Either way, the intent is
the same fast-forward "Pull requests" describes above, aimed at the root tree instead of run from
it. **This does not work cleanly today.** `require_gate.sh` runs as a `PreToolUse` hook in the
session's own working directory, so it decides the exemption from the worktree's branch, not the
root tree's — `git branch --show-current` inside a worktree is never `main`, so the exemption
never fires, and the hook refuses the fast-forward even though the root tree is on `main` and
clean. `git -C <root> merge --ff-only origin/main` is worse, not better: the hook's own segment
matcher does not recognise the `-C <root>` form at all, so that command passes through
unexamined — evading the gate rather than satisfying it, and, symmetrically, a real unstamped
merge into `main` written the same way is not caught either. Issue 97 tracks fixing the hook to
decide the exemption from the tree the command actually targets; until it lands, catching the
root tree up from a worktree session needs a person to run the fast-forward from a shell the hook
does not intercept (a terminal outside the agent's tool calls), not `git -C`, and not an agent
tool call from the worktree.

Every Claude Code hook follows this same shape (`docs/factory/issues/93-hooks-as-tracked-scripts.md`):
the logic is a tracked script under `tools/factory/hooks/` with a pytest module under
`tools/factory/tests/`; `.claude/hooks/<name>.sh` is a wrapper of at most six lines that `exec`s
it. The permission classifier refuses agent edits under `.claude/hooks/` by design, since a hook
is the thing that checks the agent: an agent proposes the wrapper diff, a person applies it by
hand.

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

Two hooks refresh the console, and they are not the same file. `refresh-console.sh` fires on
SessionStart and on a doc/agent/skill/command edit; `console-refresh.sh` fires on Stop, alongside
`gate-fast.sh`, so the console is current even across intermittent sessions. Both call
`tools/console/src/generate.mjs` and never block; neither depends on the other.

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
- Right after the close commit, `python -m tools.factory.mirror_github` runs (`GH_TOKEN` from the
  environment) so the GitHub issue closes and its labels update in step with the file. This is
  what keeps `--check` clean; skipping it is what drift looks like. `.claude/skills/factory-run/SKILL.md`
  "After the agent hands off" is the one place this is scripted.
- Commit messages end with the attribution trailer the session provides.
- Do not amend. Do not force-push. Do not rebase interactively.

## Pull requests

`origin` is `ossewawiel/verstaan` on GitHub (issue 91). A milestone branch opens a draft PR at its
first push, with `.github/PULL_REQUEST_TEMPLATE.md` (Summary, Issues closed, Gate report,
Verifier report, Checklist):

```
git push -u origin <branch>
gh pr create --draft --base main --head <branch>
```

`main` is protected: no direct pushes, one approving review or the owner's own merge, and the
`gate` status check (`.github/workflows/gate.yml`) must pass. `gh pr ready` only works after
`/gate` has stamped HEAD; the `require-gate` hook refuses it otherwise, the same way it refuses
`git merge`.

`docs/factory/issues/*.md` are mirrored onto GitHub issues and milestones by
`tools/factory/mirror_github.py` (idempotent; `--check` reports drift and exits non-zero). GitHub
is a rendering of the issue files, never the other way round: the mirror writes only the
`github_issue:` field back into a file, and a GitHub issue closed by hand is reported as drift,
never used to reopen or close a local file.

## Finishing a milestone

The merge procedure is "Pull requests" above; there is no other. Once `gh pr merge` has landed
the branch, tell the developer, in this order:
1. Which issues closed, with their commits.
2. What the gate ran and how long it took.
3. What the verifier flagged and what was done about it.
4. The exact next command.
