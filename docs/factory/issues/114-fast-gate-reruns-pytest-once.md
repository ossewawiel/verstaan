---
issue: 114
title: "The fast gate re-runs a tooling suite once before it blocks, and records a flake as a flake"
milestone: Side
status: open
depends_on: [93]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: null
github_issue: 69
---
## What

The Stop hook's pytest leg blocks on the first non-zero exit
(`tools/factory/hooks/gate_fast.sh:50`). `fail()` writes a `pytest-red` line to the ledger, prints
the last thirty lines and exits 2, which refuses the stop
(`tools/factory/hooks/gate_fast.sh:29`). It cannot tell a test that says no from a machine that
will not start a process, so it treats both as work the developer must fix before stopping.

Nine times over 2026-09-09 and 2026-09-10, on issue 07, it was the machine. Every one of those
ledger lines ends in fixture errors inside `tools/factory/tests/test_require_gate.py`, and the
fullest of them names the cause: `git init` returned `3221225794`, which is `0xC0000142`,
STATUS_DLL_INIT_FAILED. The `repo` fixture is function-scoped, so one run spawns several hundred
short-lived git processes and Windows dropped a different random subset of them each time: 34
errors in one run, 20 in the next, 47 and 61 tests passing. The same suite passes 84 tests in
4.74 s on Linux, and the whole of `tools/` passes 232 in 6.66 s. The developer lost nine stops to
a suite that was never broken. The retro promoted how to read that exit code into
`docs/standards/testing.md` (commit 079b975); this quest stops the hook acting on it.

After this quest the pytest leg runs twice before it blocks. A suite that fails and then passes
writes a `pytest-flaky` line and lets the stop through. A suite that fails twice writes
`pytest-red` and blocks, as it does today. The developer, 2026-09-11: "Proposal A Approve as a
quest", scope chosen the same day: the pytest leg only, because it is the only leg the ledger
evidences. The build leg re-runs `cmake --preset` once already
(`tools/factory/hooks/gate_fast.sh:32`), so the shape is not new in this file.

## Acceptance criteria

- `tools/factory/hooks/gate_fast.sh` runs `pytest tools/<tool>/tests` a second time when the first
  run exits non-zero, for each changed tool, and blocks only when the second run also fails.
- A suite that fails twice exits 2, writes one `pytest-red` ledger line, and prints the second
  run's last thirty lines. **Proven by a stub tool whose tests always fail.**
- A suite that fails once and passes exits 0, does not block the stop, and writes one
  `pytest-flaky` ledger line naming the tool. **Proven by a stub tool whose tests fail on the
  first run and pass on the second**, for example one that creates a marker file on first run.
- A suite that passes first time runs pytest exactly once. Proven by counting invocations, so the
  common path does not pay for the retry.
- `capture_failure.sh` is called with its documented argument order, `<stage> <signature>
  <detail...>`, for both signatures; `pytest-flaky` carries stage `test`.
- The four existing cases in `tools/factory/tests/test_gate_fast.py` still pass unchanged, in
  particular `test_failing_tool_tests_block_with_exit_2_and_are_logged` and
  `test_stop_hook_active_suppresses_a_failure_that_would_otherwise_block`.
- Every new test is proven failing before the hook is changed, and both runs are in the report.
- `/gate` and CI green.

## Not in scope

The build, ctest and data-validation legs. The developer chose the pytest leg alone on
2026-09-11: it is the only leg the ledger evidences, a second full build doubles the worst case of
a tier already budgeted at 60 s, and a build failure is almost always real. Changing the
function-scoped `repo` fixture, which would cut the spawn count that provokes the crash, is a
separate quest and needs its own evidence. Any retry count above one; a suite that fails twice is
a failure.

## Done when

- [ ] Both proofs, fails-twice blocks and fails-once passes, are in the report with their
      failing-first runs.
- [ ] `pytest-flaky` appears in the ledger from a real run, not from a fixture.
- [ ] PR merged through the gate check.
