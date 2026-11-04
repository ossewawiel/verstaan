---
issue: 30
title: "Engine::generated(Tier) runs the compiled tables"
milestone: M4
status: open
depends_on: [29, 206, 210]
agent: test-writer
agents: [test-writer, implementer]
model: sonnet
effort: high
checkpoint: 3
commit: null
worktree: null
github_issue: null
---
## What

`Engine::generated` returns `not_implemented` (`engine/src/engine.cpp:20`). Every translation today
runs on runtime tables read from the store. Quest 29 produces `verstaan_data_<tier>`, and nothing
in the engine reads it. ADR 0003's boundary holds: the engine links `verstaan_data_<tier>` and
never copies it into engine source. SPEC §3.4 adds that the basic tier does not allocate after
load. Quest 27's ADR says what that covers.

After this quest, `Engine::generated(Tier)` translates from the compiled tables, and the golden
rows pass on that back end. The effort is one step above the test-writer's default because this
is engine core. The checkpoint is 3, PLAN §6.3's: the first time generated tables replace runtime
tables in a build. Quest 210 comes first, so load already reports a failure and reads the store
once. Quest 206 comes first, so the include-boundary lint guards ADR 0003 while this code lands.

## Acceptance criteria

- `Engine::generated(Tier::basic)` translates every eng-afr golden row with the same text and
  status as the runtime tables.
- `grep -rn generated/ engine/src engine/include` finds no direct include.
- A test shows no allocation after load in `basic`, to the scope quest 27's ADR gives.
- `27-test-cases.md` is turned into tests.
- The stub is gone.
- `ctest --preset linux-gcc -L fast` passes.
- `python -m tools.validate --changed` exits 0.

## Not in scope

The equivalence diff of text, graph and trace: quest 31. Memory budgets: quest 32.

## Done when

- [ ] The `Engine::generated` stub is retired.
- [ ] The golden rows pass on the generated back end.
- [ ] A test shows no allocation after load in `basic`, to quest 27's ADR scope.
- [ ] The grep above finds no direct include.
- [ ] `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
