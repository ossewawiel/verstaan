---
issue: 165
title: "Every issue gets its own branch, pull request and gate run"
milestone: Side
status: done
depends_on: [113, 115]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: 4
commit: 8ac4da4
worktree: null
github_issue: 232
---

## What

A main-quest issue works in the milestone's shared tree, `.worktrees/m2-store` say, and pushes
its commits to one draft pull request that merges once, at the close-out issue (issue 113,
`docs/factory/git-workflow.md` "Finishing a milestone"). A side quest gets its own branch, its
own pull request and its own merge. The two shapes fight each other on the ground. Every close
on the milestone branch commits a `chore: refresh STATE.md` alongside the close, and every side
quest merge commits another one on `main`. On 2026-09-15 draft pull request #228 for `m2-store`
holds issues 13 to 16 done, fourteen commits, and GitHub reports it `CONFLICTING`: the one file
in conflict is `docs/factory/STATE.md`. The root tree's own `STATE.md` says #13 is next up and
carries a paragraph explaining that it is wrong. The `gate` check on the draft runs on the
cumulative diff, so a red run names no issue. Issue 15 is `effort: high` and sat on the draft
for four days with no review of its own. The developer, 2026-09-15: "each issue, even if part of
a bigger milestone, should get its own PR and gate run. Some issues are big and the refresh, due
to the fact that all sit on the same milestone worktree, can cause problems and feedback issues."

After this quest there is one shape. Every issue, main or side, works in its own tree on its
own branch cut from `main`: `m<K>-NN-<slug>` for a main quest in milestone K, `side-NN-<slug>`
for a side quest. Every branch opens a normal pull request, never a draft, and merges on its
own once `/gate` has stamped its head and the `gate` check is green, with
`gh pr merge --merge --delete-branch`: a merge commit, not a squash, so `test(#NN)`,
`feat(#NN)` and `chore(#NN): close` stay on `main` as ancestors and issue 115's verifier
check still reads them from git. The milestone branch and its draft pull request are gone. A
milestone is a label, a GitHub milestone and a close-out issue that writes the next map, tags
`main`, and merges nothing. `STATE.md` is committed only on `main` by the merge path, after
`git pull --ff-only`; a work branch never commits it, so no pull request can conflict on it
again. The transition happens inside this quest: `m2-store` merges once more, by hand, with
issues 13 to 16 on it, and issues 17 and 18 run under the new rule. Issue 17 waits on this
quest for that reason.

## Acceptance criteria

- `.claude/skills/factory-run/SKILL.md` step 5 names the branch for a main-quest issue as
  `m<K>-NN-<slug>`, cut from `main`, and step 6 always creates a fresh tree for it. Step 10 has
  one shipping table for every branch prefix, and its merge command is
  `gh pr merge --merge --delete-branch`. The `m*-*` exception paragraph is gone.
- `.claude/skills/factory-run/SKILL.md` step 8 and `.claude/commands/factory-status.md` say that
  `/factory-status` in a non-root tree prints `STATE.md` and does not write it. The merge path
  regenerates and commits `STATE.md` in the root tree after `git pull --ff-only`, in one commit
  `chore: refresh STATE.md after merging #NN into main`. `git log --oneline main..<branch>` for
  any open work branch shows no commit touching `docs/factory/STATE.md`.
- `docs/factory/git-workflow.md` "Branches", "Worktrees", "Pull requests" and "Finishing a
  milestone" describe the one shape: one branch per issue, one non-draft pull request per
  issue, one merge commit per issue, tree removed by the merge path for every prefix. A
  milestone's close-out issue tags `main` with `m<K>` and merges nothing.
- `docs/factory/PLAN.md` §7's Branch column reads `m<K>-NN-<slug>` per issue. `docs/factory/playbook.md`
  step 2, `.claude/commands/gate.md`, `.github/PULL_REQUEST_TEMPLATE.md` and the comment in
  `tools/factory/hooks/require_gate.sh` no longer speak of a milestone branch or a draft.
  `CLAUDE.md`'s non-negotiable reads "its commit is on `main`", not "on the milestone branch".
- `docs/factory/issues/18-m2-close-out.md` no longer merges `m2-store` or removes its tree; it
  tags `main` with `m2` and writes the M3 issue files.
- `docs/adr/0012-one-pull-request-per-issue.md` records the decision: one branch and one
  pull request per issue, merge commits, `STATE.md` written only on `main`. No earlier ADR
  covers branches; issue 113 was the rule until now, and the ADR names it.
- Draft pull request #228 is merged: the `STATE.md` conflict resolved by taking `main`'s copy and
  regenerating, `/gate` stamped on `m2-store`'s head, the verifier's read attached under
  `## Verifier` here, `gh pr ready 228`, `gh pr merge 228 --merge --delete-branch`.
  `git merge-base --is-ancestor m2-store main` held true before the branch was deleted.
  `.worktrees/m2-store` is removed and the local branch deleted.
- `git ls-remote --heads origin` lists no `m*-*` branch that is not `m<K>-NN-<slug>`.
- `docs/factory/STATE.md` on `main` names #17 as next up with no explanatory paragraph.
- `python -m tools.validate --all` exits 0. `node tools/console/test/run.mjs` passes. `/gate`
  and CI green.

## Not in scope

- The console's reading of trees or branches. `readWorktrees()` and the `merged` label key on
  git state, not on a branch prefix, and need no change. If the Quests room's "main quest is the
  current milestone branch" caption reads wrong afterwards, that is a one-line side quest.
- Starting issue 17 or 18. Issue 17 runs with `/factory-run 17` once this quest is on `main`.
- The squash-merge history of issues 07 and every side quest merged before this quest. It stays.
- Any change to `require_gate.sh`'s logic. Its stamp check already works per commit and per
  tree; only its comment changes.
- The M3 issue files. Issue 18 writes them.

## Done when

- [x] `factory-run/SKILL.md` steps 5, 6, 8 and 10 describe one shape for every branch, with
      `gh pr merge --merge --delete-branch` as the merge.
- [x] `/factory-status` never writes `STATE.md`; only the merge path commits it on `main` after
      `git pull --ff-only`, for every branch prefix, not only the milestone close-out.
- [x] `git-workflow.md`, `PLAN.md` §7's Branch column, `playbook.md`, `gate.md`, the PR template,
      `CLAUDE.md` and the `require_gate.sh` comment agree with the skill. A checkpoint-4 verifier
      pass also found and fixed six more files that still described the old shape:
      `docs/glossary.md`, `docs/factory/README.md`, `.claude/skills/create-map/SKILL.md`,
      `.claude/skills/quest/SKILL.md`, and comments in `tools/console/src/read.mjs`,
      `apps/console/server/src/model/read.ts`, `apps/console/e2e/fixture-repo.ts` and
      `tools/console/test/run.mjs`.
- [x] Issue 18's close-out merges nothing and tags `main`; its title no longer says "merge
      m2-store".
- [x] One ADR records the decision (`docs/adr/0012-one-pull-request-per-issue.md`).
- [x] Pull request #228 merged with a merge commit (`7d5600f`), `m2-store` tree and branch
      removed, the verifier's read under `## Verifier` below.
- [x] `STATE.md` on `main` names #26 next, not #17: #17's `depends_on` now names 165, so it stays
      blocked until this issue's own merge lands. No caveat paragraph either way.
- [x] `python -m tools.validate --all` exits 0 and the console tests pass.

## Verifier

One adversarial pass over the working-tree diff (`git diff main`, checkpoint 4), before the fixes
below: 12 findings, all real, none false positives. Fixed before this commit:

- The merge path's `STATE.md` refresh commit was never actually wired into `factory-run/SKILL.md`
  step 10's shipping table — the acceptance criterion existed only in prose elsewhere. Added the
  commit to the "Gate, PR, merge" row and moved its explanation from "Finishing a milestone"
  (milestone-only) into "Pull requests" (every issue).
- `factory-status.md` step 5 contradicted itself across three sentences, one of which authorised
  a root-tree write that no step ever committed — the next `/factory-run` would find a dirty tree
  and refuse to start. Rewritten so `/factory-status` never writes the file, anywhere.
- Every branch is now cut from local `main` once per issue instead of once per milestone, and no
  step refreshed it first — confirmed stale by eighteen commits in this very worktree. Added
  `git fetch origin && git merge --ff-only origin/main` before `git worktree add` in step 6.
- Issue 18's title still said "merge m2-store" after its body was rewritten to merge nothing.
- The ADR's Context overstated PR #228's wait (four days; git history shows under fifteen hours)
  and cited a commit count that changed before the PR merged. Corrected, and the Consequences
  section now records the real admin-merge override and why.
- The PR template's checklist line and `gate.md`'s hand-off pointer both still referenced
  `gh pr ready` or a "four points" list that no longer existed in the section they pointed to.
- `docs/glossary.md`, `docs/factory/README.md`, `docs/factory/playbook.md` and
  `.claude/skills/create-map/SKILL.md` still described the retired milestone-branch shape.
- Four console source comments asserted the repo squash-merges every pull request — no longer
  true now that every merge is a real merge commit — even though the logic they describe
  (never trust git ancestry, decide from the issue file) needed no change and still doesn't.
- One 52-word sentence in `git-workflow.md` lost its antecedent mid-edit ("stay on `main` as its
  own ancestors" with no noun for "its"); split and reworded.

Not fixed, by design: `require_gate.sh`'s `gh pr create --draft` exemption stays in the hook
(logic change was out of scope) — `docs/factory/README.md` now explains why the hole is safe
rather than leaving it unexplained.
