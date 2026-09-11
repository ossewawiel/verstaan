---
issue: 97
title: "require-gate decides the branch from the session's tree, not the command's"
milestone: Side
status: done
depends_on: [96]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: d964eb0
worktree: null
github_issue: 27
---
## What

Issue 96 gave `main` one exemption: `git merge --ff-only <main's own upstream>` is allowed without
a gate stamp, because a fast-forward cannot carry unreviewed work. The exemption is guarded by
`branch=$(git branch --show-current)` and fires only when that is `main`.

`require_gate.sh` runs as a `PreToolUse` hook, so that command runs in the session's working
directory. Since issue 92 the session's working directory is a worktree, never the root tree. The
hook therefore reads the worktree's own branch and the exemption never fires, whatever tree the
blocked command was aimed at.

Proven on 2026-09-09, from the session that shipped issue 95. Pull request #25 merged as `9f44fd6`.
The root tree was clean and on `main`, one commit behind:

```
$ git branch --show-current            # session cwd: .worktrees/side-95-console-service
side-95-console-service
$ git -C D:/SourceCode/private/verstaan branch --show-current
main
$ cd D:/SourceCode/private/verstaan && git merge --ff-only origin/main
require-gate: no gate stamp for origin/main (9f44fd61...). Run /gate on that commit first.
```

Issue 96's own "Done when" says "From the root tree on `main`". That is exactly the case it proves
and the only case that works. Its tests call the script with the tree under test as the working
directory, so they pass and the gap stays invisible. The result is that after issue 92, the sync
issue 96 exists to unblock is blocked in every session that does real work.

`9f44fd6` carries no stamp because GitHub created it. That is the normal state of every merge
commit and the reason the exemption exists.

There is no safe way around it from a worktree. `git -C <root> merge --ff-only origin/main` does
not match the hook's `"git merge"|"git merge "*` segment pattern at all, so it is allowed through
unexamined. That is evading the gate, not satisfying it, and it would also let a real merge into
`main` past the refusal. Do not adopt it as the workaround; treat it as a second finding.

Separately, `last_positional` reads a shell redirection as the ref:

```
$ git merge --ff-only origin/main 2>&1
require-gate: '2>&1' is not a commit I can resolve.
```

`2>&1` is not a flag by the `-*` test, so it wins the "last positional" slot. Any command carrying
a redirection after the ref is refused with a message that names the redirection as a commit.

A third finding, met while opening the pull request for this very issue. The hook matched a
command inside a heredoc body. The pull request text quoted the failure above, so the payload
carried this line:

```
$ cd D:/SourceCode/private/verstaan && git merge --ff-only origin/main
```

`gh pr create --body-file - <<EOF ... EOF` was refused with "no gate stamp for origin/main". The
hook splits the command on `&&` and matched the quoted line as a real segment. Its own comment
says it "matches only at the start of a command segment (after &&, ||, ;, | or a newline), so the
words inside a string literal do not trigger it", and on 2026-09-08 a printf argument caused the
same thing. Segment splitting is not shell parsing: a heredoc body, a quoted argument and a real
command all look alike to it. This is the same root cause as the finding above, which is that the
hook reasons about command text it has not actually parsed.

One more fact worth recording rather than fixing blind: `main@{upstream}` is unset in this clone,
so `main_upstream`'s `origin/main`-by-name fallback is what resolves the upstream here. The
comment in the script predicts this for a repository that was `git init`-ed and later given a
remote. Any change to the exemption must keep that fallback working.

## Acceptance criteria

- The exemption is decided from the tree the command acts on, not from the session's working
  directory. A `cd <root> && git merge --ff-only origin/main` issued from inside a worktree is
  allowed when the root tree is on `main` and clean. The test fails first.
- Every refusal issue 96 established still holds, from a worktree as well as from the root tree:
  `git merge --no-ff <branch>` into `main` is refused naming `gh pr merge`; `git merge --ff-only
  <some-other-branch>` is refused; a stamp is still required for `gh pr create` (non-draft),
  `gh pr ready`, `gh pr merge` and `git pull` everywhere else.
- `git -C <path> merge` and `git -C <path> pull` are recognised and gated on the tree at `<path>`,
  rather than passing through unexamined. A test proves a real merge into `main` written that way
  is refused.
- A redirection or any other shell token after the ref does not become the ref. `git merge
  --ff-only origin/main 2>&1` resolves a ref of `origin/main`. The test fails first.
- A gated command quoted inside a heredoc body or a single-argument string does not fire the hook.
  A `gh pr create --body-file - <<EOF` whose body contains the line
  `cd /repo && git merge --ff-only origin/main` is allowed. The test fails first, and the
  2026-09-08 printf case keeps its own test.
- The hook still costs no more than it does now on every `PreToolUse`. If reading the target tree
  needs another `git` call, say in a comment why that cost is acceptable.
- `tools/factory/tests/test_require_gate.py` runs at least one case from a working directory that
  is not the tree the command targets, so this class of bug cannot return unseen.
- `docs/factory/git-workflow.md` "Worktrees" says how the root tree catches up after a pull request
  merges when the session is running inside a worktree, which is now the normal case.

## Not in scope

Widening the exemption beyond `main` fast-forwarding from its own upstream. Removing the stamp
requirement anywhere. Changing what `/gate` stamps.

## Done when

- [x] From a session whose working directory is a worktree, the root tree on `main` can
      fast-forward from `origin/main`, and the tree is level with `origin/main`.
- [x] A merge into `main` written as `git -C <root> merge --no-ff <branch>` is refused.
- [x] `git merge --ff-only origin/main 2>&1` resolves the ref as `origin/main`.
- [x] A gated command quoted inside a heredoc body does not trigger the hook.
- [x] Every existing test in `tools/factory/tests/test_require_gate.py` still passes.
