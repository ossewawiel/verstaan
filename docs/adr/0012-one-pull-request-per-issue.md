# 0012 — One branch and one pull request per issue

Date: 2026-09-15 · Status: Accepted

## Context

No earlier ADR covers branches. Issue 113 set the rule that held until now: a main-quest issue
works in its milestone's shared tree, `.worktrees/m2-store` say, and pushes to one draft pull
request that merges once, at the close-out issue. A side quest gets its own branch, its own pull
request and its own merge. The two shapes fight each other on the ground. Every close on the
milestone branch commits a `chore: refresh STATE.md` alongside the close, and every side quest
merge commits another one on `main`, so the two streams race to write the same file. On
2026-09-15 draft pull request #228 for `m2-store` held issues 13 to 16 done, and GitHub reported
it `CONFLICTING`: the one file in conflict was `docs/factory/STATE.md`. The root tree's own
`STATE.md` said issue 13 was next up and carried a paragraph explaining that it was wrong. The
`gate` check on the draft ran on the cumulative diff, so a red run named no issue. Issue 15 is
`effort: high` and sat on the draft for hours with no review of its own — every issue on a
shared milestone branch waits behind whichever issue on it is still open. The developer,
2026-09-15: "each issue, even if part of a bigger milestone, should get its own PR and gate run.
Some issues are big and the refresh, due to the fact that all sit on the same milestone worktree,
can cause problems and feedback issues."

## Decision

Every issue, main or side, works in its own tree on its own branch cut from `main`:
`m<K>-NN-<slug>` for a main quest in milestone K, `side-NN-<slug>` for a side quest. Every branch
opens a normal pull request, never a draft, and merges on its own once `/gate` has stamped its
head and the `gate` check is green, with `gh pr merge --merge --delete-branch`: a merge commit,
not a squash, so `test(#NN)`, `feat(#NN)` and `chore(#NN): close` stay on `main` as ancestors and
issue 115's verifier check still reads them from git. The milestone branch and its draft pull
request are gone. A milestone is a label, a GitHub milestone and a close-out issue that writes
the next map, tags `main`, and merges nothing. `STATE.md` is committed only on `main` by the
merge path, after `git pull --ff-only`; a work branch never commits it, so no pull request can
conflict on it again.

## Consequences

- Every issue gets its own `gate` run against its own diff, so a red run names one issue, not a
  cumulative branch.
- No two issues share a tree, so no two sessions can collide on the same worktree, and no issue
  waits hours or days behind another one's review.
- `STATE.md` never appears in a diff between a work branch and `main`, so no pull request can
  conflict on it. `git log --oneline main..<branch>` for any open work branch shows no commit
  touching `docs/factory/STATE.md`.
- A milestone's close-out issue is smaller: it tags `main` and writes the next milestone's issue
  files, and merges nothing, since every issue in it already merged on its own.
- The transition ran once, inside issue 165: `m2-store`'s existing draft pull request, #228, was
  merged by hand, carrying issues 13 to 16, after `/gate` passed and stamped its head and the
  `gate` check's timeout (a real, pre-existing performance bug in the dictionary importer, fixed
  in the same branch) was overridden with `gh pr merge --admin` on the owner's own say-so. Every
  issue after it follows this ADR with no such override.
