---
issue: 113
title: "A milestone branch merges once, at its close-out, and a merged branch leaves origin"
milestone: Side
status: open
depends_on: [97, 109]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: 4
commit: null
worktree: null
github_issue: 66
---

## What

Issue 109 gave the merge path one rule per branch prefix. A `side-*` or `quest-*` tree goes when
its pull request merges. A milestone tree waits for its close-out issue. Nothing gave the merge
itself the same rule. `.claude/skills/factory-run/SKILL.md` step 10 offers the same four shipping
options whatever the branch, so "Gate, PR, merge" merges a milestone branch in the middle of its
milestone. `docs/factory/git-workflow.md` "Pull requests" says a milestone branch opens a draft
pull request at its first push. "Finishing a milestone" describes one merge that closes several
issues. The two texts disagree, and neither says which one wins.

On 2026-09-10 issue 07 closed on `m1-mirror`, and its pull request, #64, merged with `--squash`.
The squash wrote the content of `feat(#7)` and `chore(#7): close` onto `main` as the single commit
`0534b13`. It left the branch's own commits behind. `m1-mirror` stopped being an ancestor of
`main`. By 2026-09-11 it sat four commits and 290 lines behind, missing the console work from pull
requests #63 and #65, with issues 08 through 12 still scheduled to run in its tree.
`m0-foundation` merged once, with a merge commit, and is still an ancestor. The developer's ask
that day: "when the work is done and checked in and pushed from the worktree into remote pr and
the ci passed. the pr should be checkd in, then the agent should move to master. clear out the
work tree, delete the folders if all went through successfully, then rebase master locally so
that mastr sit on the latest." The branch was rebuilt from `main` by hand in that session so issue
08 could start. This quest is the rule.

After this quest, `factory-run` step 10 reads the branch prefix before it offers to merge. A
`side-*` or `quest-*` branch ships as it does today. A milestone branch does not merge there at
all: its draft pull request stays open, collects every issue on the branch, and the milestone's
close-out issue is the one thing that marks it ready and merges it. The merge path deletes a
merged branch from `origin` as well as from the local repository, and GitHub deletes one on its
own when a pull request merges.

## Acceptance criteria

- `.claude/skills/factory-run/SKILL.md` step 10 gates its four options on the branch prefix. For
  an `m*-*` branch the table offers gate, push and draft pull request, and names the close-out
  issue as the only thing that merges it.
- `docs/factory/git-workflow.md` "Pull requests" and "Finishing a milestone" say a milestone
  branch merges once, name `gh pr ready` as what ends the draft, and say a single-issue branch
  still merges per issue.
- Both texts say the same thing about a milestone branch. A reader following either one reaches
  the same command.
- `gh api repos/ossewawiel/verstaan --jq .delete_branch_on_merge` prints `true`.
- `factory-run` step 10 deletes the remote branch for a `side-*` or `quest-*` branch, by
  `gh pr merge --delete-branch` or an explicit `git push origin --delete <branch>`.
- `git ls-remote --heads origin` lists no branch that `git merge-base --is-ancestor <branch> main`
  already proves merged, apart from `main` itself.
- `python -m tools.validate --all` exits 0.

## Not in scope

- The merge method for a single-issue branch. A `side-*` or `quest-*` branch keeps squash-merging,
  one commit per issue on `main`.
- `require-gate`'s refusal of `git pull --ff-only` from an agent session. Issue 97 owns that, and
  this quest waits on it: every path here ends in that pull.
- Rebuilding `m1-mirror`. Done by hand on 2026-09-11, before this quest was written.
- Recovering issue 07's two commits. `0534b13` collapsed them on `main`, and they stay collapsed.
- Any change to how the console reads a tree. Issue 109's `merged` label already reads a
  squash-merged branch as unmerged. This quest removes that case instead of teaching the label to
  spot it.

## Done when

- [ ] `factory-run` step 10 gates its shipping options on the branch prefix, and an `m*-*` branch
      cannot merge there.
- [ ] `git-workflow.md` says a milestone branch merges once, at its close-out issue, and names the
      command that ends the draft.
- [ ] The merge path deletes the branch from `origin` for a `side-*` or `quest-*` branch.
- [ ] `delete_branch_on_merge` is `true` on the repository.
- [ ] `git ls-remote --heads origin` lists no already-merged branch.
- [ ] `python -m tools.validate --all` exits 0.
