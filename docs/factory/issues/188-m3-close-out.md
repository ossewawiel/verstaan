---
issue: 188
title: "M3 close-out: retro, verifier, tag m3, write the M4 quests"
milestone: M3
status: open
depends_on: [26, 183, 184, 185, 187]
agent: docs-writer
agents: [docs-writer, verifier]
model: sonnet
effort: low
checkpoint: 4
commit: null
worktree: null
github_issue: null
---
## What

M1 closed with issue 12, and M2 with issue 18. Each close-out tagged `main` and wrote the next
milestone's quest files (`git-workflow.md` "Finishing a milestone"). M3 had no close-out. Without
one, nothing tags `m3` and nothing writes the M4 quests, so M4 has no issue files at all.

After this quest, `main` carries the tag `m3`, and the M4 quests exist, written from PLAN.md §7's
"M4 Compiler and tiers" row and from what M3 found. The M4 row promises the compiler that turns
the store and `tiers.toml` into `engine/generated/<tier>/` (SPEC §3.5, ADR 0003).
It also promises:

- `Engine::generated(Tier)`, which is still a stub today.
- The equivalence suite that diffs both back ends (ADR 0007).
- The three tiers and their memory budgets (SPEC §7, ADR 0006).
- The basic tier cross-built and run on a Pi Zero 2 W with the Argos benchmark beside it.
- Gate steps 5 and 6.

## Acceptance criteria

- `/factory-retro` has run, and its proposals are listed under `## Verifier` with the owner's
  answer to each.
- The verifier has read `git diff m2...main` for the M3 engine code, and its findings are listed.
  Each finding is fixed, or has its own quest.
- The M4 quest files exist with loadouts, `depends_on` and Done-when lines a test can check. They
  cover every M4 promise above, and `docs/factory/map.yaml` has a tile for each.
- Three decisions are recorded, each as a quest or a written "no" with its reason:
  - the 2026-09-16 engine-test-data brief (carve small store fixtures, so engine tests stop
    reading the 175 MB store); the owner deferred it to this quest on 2026-09-28;
  - the sensors quest issue 115 promised once M3 had engine code (an include-boundary lint, a
    coverage floor, mutation testing on changed engine files);
  - an M7 close-out and an `m7` tag; M7's quests 172 to 178 are done and it has neither.
- `PLAN.md` §9 no longer asks the owner to schedule side quests 91 and 92, which are done.
- `main` is tagged `m3` after this issue's own commit merges: `git tag m3 main && git push origin m3`.

## Not in scope

Starting any M4 quest. M5 quests: they wait on the desktop UI technology, an open owner decision
(`verstaan.md` open question 6). Merging any other branch.

## Done when

- [ ] The retro and verifier results are recorded under `## Verifier`.
- [ ] The M4 quest files exist, with a tile each, and `STATE.md` names the first one next.
- [ ] The carved-fixture, sensors and M7 close-out decisions are recorded.
- [ ] `main` carries the tag `m3`.
