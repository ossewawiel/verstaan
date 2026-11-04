---
issue: 202
title: "Prove the golden loader's deferred and pending paths, and count the xxa/xxb rows as skipped"
milestone: Side
status: in-progress
depends_on: [26]
agent: implementer
agents: [implementer]
model: sonnet
effort: low
checkpoint: null
commit: null
worktree: .worktrees/side-202-prove-loader-paths
github_issue: 326
---
## What

Issue 26 built the golden loader, `tests/golden/row_loader.hpp`. Its `run_row` has three paths that
no test has ever exercised. A `deferred` row that matches must fail with "Remove the `deferred`
key". A `deferred` row that mismatches must not fail. A `review: pending` row that mismatches must
be reported as pending and not fail. No row in the tree is pending, and no deferred row matches
today, so all three paths are only compiled. `docs/standards/testing.md` says a gate is not proven
by watching it pass. Today a broken stale-key check would let issue 201 merge with A14 and A15
still marked deferred, and nothing would show it.

`runnable()` in the same file drops every row whose direction is not `eng-afr`. The xxa->xxb and
xxb->xxa rows from issue 04 go to stderr as "not run", and the ctest summary never counts them.
After this quest a GoogleTest proves the three paths on rows built in memory, and the xxa/xxb rows
are registered as skipped, with the reason in the ctest output. The owner asked for both on
2026-11-04, after 26 merged: "yes, write the side quest". Issue 188 decides in M4 whether those
rows ever run.

## Acceptance criteria

- A GoogleTest under `tests/golden/` builds `Row` values in memory and calls `run_row` on them. It
  reads no fixture file. Using `EXPECT_NONFATAL_FAILURE` from `gtest/gtest-spi.h` or an
  equivalent, it asserts:
  - a deferred row whose expected text matches the engine output fails, and the message contains
    "Remove the `deferred` key";
  - a deferred row whose expected text does not match produces no failure;
  - a pending row whose expected text does not match produces no failure, and its output line says
    PENDING;
  - a confirmed row whose expected text does not match fails, the control case.
- The test is labelled `fast`, so the Stop hook runs it.
- The proof is shown red first. Break the stale-key branch in `run_row` by hand, run the test, see
  it fail, then restore the branch. The hand-off report pastes the failing output. No commit
  carries the broken branch.
- `ctest --preset linux-gcc -L golden` registers every xxa/xxb fixture row as a case. Each id is
  prefixed with its language pair, so no id collides with an eng id. Each case calls `GTEST_SKIP`
  with a reason that names issue 188, and the ctest summary counts them as skipped. The loader no
  longer prints "not run" on stderr.
- `ctest -R A09` still selects the one eng-afr row A09 in the golden suite.
- `docs/standards/testing.md` says, in one sentence, that rows in a direction the engine has no
  `Lang` for are registered as skipped.

## Not in scope

Running the xxa/xxb rows through the engine. That needs a `Lang` for each, or languages loaded
from data, and issue 188 writes that decision as an M4 quest or a written "no". Any other engine
behaviour. Removing the `deferred: 201` keys, which issue 201 owns.

## Done when

- [ ] The in-memory loader test passes with all four cases. The hand-off shows it failing once
      against a broken stale-key branch.
- [ ] `ctest -L golden` shows the xxa/xxb rows as skipped with a reason naming 188, and stderr
      carries no "not run" line.
- [ ] `docs/standards/testing.md` carries the skip sentence.
- [ ] PR merged through the gate check.
