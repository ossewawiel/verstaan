# Git workflow

## Branches

- `main` is always green and always releasable. Nothing is committed to it directly.
- One branch per issue, never one per milestone. A main-quest issue in milestone K uses
  `m<K>-NN-<slug>`; a side quest uses `side-NN-<slug>`. Post-M6 work uses `post-m6-<slug>`.
- Every branch is cut from `main` when its issue starts and merges once, per issue, right after
  that issue's own `/gate` and verifier pass. A milestone is a label, a GitHub milestone and a
  close-out issue; it is not a branch, and it merges nothing.

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
GitHub means running the fast-forward above against the root tree from inside a worktree session:
`cd <root> && git merge --ff-only origin/main`, or `git -C <root> merge --ff-only origin/main`,
fetching first if the worktree's own view of `origin/main` is stale. `require_gate.sh` (issue 97)
decides its `main`-only exemption from the tree the command names, following a `cd` in the same
command string or reading a `git -C <path>` directly, not from the hook's own working directory —
so both forms above are allowed, and a real unstamped merge into `main` written either way is
still refused.

Every Claude Code hook follows this same shape (`docs/factory/issues/93-hooks-as-tracked-scripts.md`):
the logic is a tracked script under `tools/factory/hooks/` with a pytest module under
`tools/factory/tests/`; `.claude/hooks/<name>.sh` is a wrapper of at most six lines that `exec`s
it. The permission classifier refuses agent edits under `.claude/hooks/` by design, since a hook
is the thing that checks the agent: an agent proposes the wrapper diff, a person applies it by
hand.

A tree is removed once its branch has merged, with:

```
git worktree remove .worktrees/<branch>
git branch -D <branch>
```

`-D`, not `-d`: it is the one command that removes the branch whether or not its own tip already
reads as an ancestor of `main`, so the merge path never has to check first.

The merge path removes the tree itself, right after `git pull --ff-only` has caught the root tree
up (`.claude/skills/factory-run/SKILL.md` step 10, `.claude/skills/quest/SKILL.md` §4), for every
branch prefix — `m*-*` and `side-*`/`quest-*` alike, since every branch now carries one issue and
merges once, on its own. No close-out issue ever removes a tree; a milestone's close-out issue
only tags `main` and writes the next map.

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
  `docs(#NN): <title>`, `chore(#NN): <title>`. Scope is the issue number. The one exception: when
  a test-writer pass ran, one `test(#NN): <title>` commit precedes the work commit, carrying the
  red suite on its own; the work commit then carries the implementation only.
- After the work commit, a `chore(#NN): close` commit flips `status: done` and fills `commit:` in
  the issue file with the work commit's hash.
- Right after the close commit, `python -m tools.factory.mirror_github` runs (`GH_TOKEN` from the
  environment) so the GitHub issue closes and its labels update in step with the file. This is
  what keeps `--check` clean; skipping it is what drift looks like. `.claude/skills/factory-run/SKILL.md`
  "After the agent hands off" is the one place this is scripted.
- Commit messages end with the attribution trailer the session provides.
- Do not amend. Do not force-push. Do not rebase interactively.

## Pull requests

`origin` is `ossewawiel/verstaan` on GitHub (issue 91), with `delete_branch_on_merge` set so a
merged branch leaves `origin` on its own. Every branch opens one normal pull request, never a
draft, at its first push, with `.github/PULL_REQUEST_TEMPLATE.md` (Summary, Issues closed, Gate
report, Verifier report, Checklist):

```
git push -u origin <branch>
gh pr create --base main --head <branch>
```

That pull request is the one that merges, per issue, whatever the branch prefix.

`main` is protected: no direct pushes, one approving review or the owner's own merge, and the
`gate` status check (`.github/workflows/gate.yml`) must pass. `gh pr create`, `gh pr ready` and
`gh pr merge` all refuse to run unless `/gate` has stamped HEAD (`require_gate.sh`). No pull
request here is ever a draft, so `gh pr ready` never runs. `gh pr merge --merge` merges it
directly, with a real merge commit, never a squash. The branch's own commits — `test(#NN)`,
`feat(#NN)`, `chore(#NN): close` — stay on `main` as ancestors, so issue 115's verifier check
still reads them from git. Its own `--delete-branch` flag removes the branch from `origin` in
the same call. Do not also run `git push origin --delete <branch>`: `--delete-branch` already
covers it, and the two commands race on the same delete.

Once any issue's merge lands, `git pull --ff-only` in the root tree, then `/factory-status`'s
steps compute `STATE.md`'s four fields fresh and commit the result there, in one commit
`chore: refresh STATE.md after merging #NN into main` — never inside a work branch, so no pull
request can conflict on it (`.claude/skills/factory-run/SKILL.md` step 10). Then tell the
developer, in this order:
1. Which issue merged, with its commit.
2. What the gate ran and how long it took.
3. What the verifier flagged and what was done about it.
4. The exact next command.

`docs/factory/issues/*.md` are mirrored onto GitHub issues and milestones by
`tools/factory/mirror_github.py` (idempotent; `--check` reports drift and exits non-zero). GitHub
is a rendering of the issue files, never the other way round: the mirror writes only the
`github_issue:` field back into a file, and a GitHub issue closed by hand is reported as drift,
never used to reopen or close a local file.

## Finishing a milestone

Every issue in the milestone has already merged on its own, per "Pull requests" above — there is
no branch left to merge here. A milestone's close-out issue is an issue like any other: it opens
its own branch and pull request, and merges the same way. It does two things only, on top of
that: it tags `main` with `m<K>`, and it writes the next milestone's issue files from what this
one found.

```
git tag m<K> main
git push origin m<K>
```

The merge, the `STATE.md` refresh and the hand-off follow "Pull requests" above, unchanged.
