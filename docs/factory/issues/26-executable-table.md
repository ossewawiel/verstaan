---
issue: 26
title: "The test table is the test: a golden loader runs every row, and a held-out slice runs only at the gate"
milestone: M3
status: open
depends_on: [12, 115]
agent: test-writer
agents: [test-writer, implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: null
github_issue: null
---
## What

An engine issue's tests are transcribed by hand. The rule-author writes
`docs/factory/issues/NN-test-cases.md`, a table with columns `id | input | expected | status |
direction | register | review | rule ids | note`, and the same rows again as YAML under
`tests/fixtures/languages/<lang>/tests/basic.yaml`. The test-writer then writes one GoogleTest
per row, at a context load and a hand-off per issue (`.claude/agents/test-writer.md`). Every
row the implementer works against is visible to it. The decision brief of 2026-09-11
(`docs/decisions/2026-09-11-agentic-testing-cycle/brief.html`) found that agents saturate a
visible suite and drop on a held-out one that composes the same features, and that the
transcription pass is the one pass in the engine cycle that adds no check. The owner chose the
brief's recommended option the same day.

After this quest the YAML twin is the test. One CTest case, labelled `golden`, reads every
`tests/fixtures/languages/*/tests/*.yaml` and `tests/golden/<tier>/*.txt`, runs each row through
`Engine::translate` and reports pass or fail per row id, with the rule trace on failure. The
test-writer lands the loader once, here, and from then on an engine issue is two passes:
rule-author, implementer. A second directory, `tests/held-out/`, carries rows in the same shape
that no issue file names and no agent brief loads; it runs under the `held-out` label in
`/gate` and CI only. The M3 engine-slice quests, 19 to 25, are not written yet; the M3 planning
pass adds the ones this loader needs to `depends_on`. Quest 115 settles the commit shape first,
so the loader's own red state is a commit.

## Acceptance criteria

- `tests/golden/loader_test.cpp` (or a name the test-writer chooses under `tests/golden/`)
  registers one CTest case per row id, from every fixture and golden YAML, via
  `gtest_discover_tests` or an equivalent that gives `ctest -R A09` one row.
- A failing row prints `id`, `input`, `expected`, `actual`, `status` and the rule trace.
- The loader takes expected text and status from the file only. A row with `review: pending`
  runs and is reported as pending, not skipped silently.
- `tests/held-out/` exists with at least one YAML file in the fixture-pair shape, at least
  three rows that compose two marks the visible rows test one at a time, expected values
  written by the owner and marked in the file's `# source:` line. The label is `held-out`.
- `.claude/commands/gate.md` step 3 and `.github/workflows/gate.yml` run `ctest -L held-out`.
  `tools/factory/hooks/gate_fast.sh` does not.
- `docs/standards/testing.md` "Test kinds" gains a `held-out` row and says the golden runner is
  the test for table rows, and `.claude/agents/test-writer.md` says a table row needs no
  hand-written test.
- `.claude/skills/factory-run/SKILL.md` "Routing" for `rule-author` reads rule-author then
  implementer, with the test-writer named only when an issue needs a test the table cannot
  express.
- The loader is proven red first: the `test(#26)` commit runs the fixture rows against the stub
  engine and every row fails with `not_implemented`.
- `/gate` and CI green.

## Not in scope

Any engine behaviour; the rows go red against the stub and stay red until the M3 slice quests
make them pass. Mutation testing or coverage. The equivalence label, which ADR 0007 gives to
M4. Moving the markdown table out of `NN-test-cases.md`; it stays the human-reviewed source
and the YAML stays its twin.

## Done when

- [ ] `ctest -L golden` runs one case per fixture row and `ctest -L held-out` runs the held-out
      rows, both red against the stub, both in the report with their commands.
- [ ] The routing table names two passes for an engine issue.
- [ ] `tests/held-out/` is named in no issue file other than this one, and in no agent file.
- [ ] PR merged through the gate check.
