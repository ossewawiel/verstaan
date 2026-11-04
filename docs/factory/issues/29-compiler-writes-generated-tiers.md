---
issue: 29
title: "The compiler writes engine/generated/<tier>/ from the store and tiers.toml"
milestone: M4
status: open
depends_on: [27, 28, 207, 211]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: 4
commit: null
worktree: null
github_issue: 345
---
## What

`tools/compiler/cli.py` is a skeleton. `engine/generated/fixture/` is a hand-written stand-in. SPEC
§3.5 is the contract: one file per array under `engine/generated/<tier>/` (ADR 0028),
`tests/golden/<tier>/*.txt` for a committed tier, a header, and a static library `verstaan_data_<tier>`. Quest 27's ADR
says what the tables hold and which words a tier keeps. Quest 211 makes the validator refuse any
store the compiler's reader would read differently from the engine's. Quest 207 may add a store
file the compiler must carry.

Gate step 6 arms the moment `--all-tiers` exists. `tools/factory/hooks/gate_full.sh:108-113` runs
`--all-tiers` and then `git diff --exit-code engine/generated/`. A run date in the header would fail
the gate the next day, on a branch that touched nothing. So the header carries the store's
`last_import` or no date, and this quest updates SPEC §3.5 to say which. Because the check arms
before quest 203, this quest also makes gate step 6 follow quest 27's rule on what a branch
compiles.

The golden text rows need a rule too. `tests/golden/row_loader.hpp:171` loads every
`tests/golden/**/*.txt`. Text rows have no `deferred` key, and their ids are `<file stem>_L<line>`,
so two tiers collide. `docs/standards/testing.md` says expected text never comes from the engine.
This quest states which rows it writes to `tests/golden/<tier>/`, how ids stay unique, and where
the expected text comes from. After this quest, `python -m tools.compiler --all-tiers` writes each
tier quest 27's ADR commits. The hand-written fixture is replaced by compiler output from the
xxa/xxb pair. The checkpoint is 4 because the first generated output sets how much the repository
grows.

## Acceptance criteria

- Two runs of the compiler give byte-identical output.
- The header carries the store's `last_import` or no date, and SPEC §3.5 says which.
- `gate_full.sh` step 6 and `.claude/commands/gate.md:3,64-67` compile what quest 27's ADR says a branch
  compiles: `python -m tools.compiler --changed --base origin/main`, then `git status --porcelain
  engine/generated/ tests/golden/` must be empty.
- `--tier <name>` writes one tier, `--all-tiers` writes the fixture build and `basic` only, and
  `--changed --base nosuchref` exits non-zero and writes nothing.
- Output takes the form in SPEC §3.5: one file per array, per language. Table files compile one at a time,
  in a Ninja pool of depth 1.
- `.gitignore` lists `engine/generated/phone/` and `engine/generated/connected/`. The compiler writes
  `tests/golden/<tier>/` only for a committed tier.
- CMake takes `VERSTAAN_TIERS`, default `fixture;basic`. Configure fails, naming the `--tier` command, when a
  named tier's files are absent.
- The compiler reads the store with the fixed-line reader quest 211's ADR makes the contract. Its tokens
  equal the table in `19-test-cases.md`.
- `docs/standards/testing.md` defines the label `data` and the `tests/golden/<tier>/` rule.
- The hand-off states the MSVC figure for `basic`. If MSVC exhausts its heap or passes the 15-minute
  timeout, its leg sets `VERSTAAN_TIERS=fixture`, and the Linux legs still build `basic` (owner's ruling, ADR 0028).
- A pytest proves a changed store entry changes the output.
- A pytest proves the top-N tie-break from quest 27's ADR.
- Every generated file carries the header SPEC §3.5 lists.
- The hand-off lists which rows go to `tests/golden/<tier>/` and how their ids stay unique.
- The rows of `27-test-cases.md` with quest 29 are turned into tests.
- `verstaan_data_<tier>` builds for each committed tier.
- The hand-off states the repository size the output adds.
- `ctest --preset linux-gcc -L fast` passes.
- `python -m tools.validate --changed` exits 0.

## Not in scope

Loading the tables: quest 30. Memory budgets: quest 32. The CI leg and the `data` job: quest 203.

## Done when

- [ ] `python -m tools.compiler --all-tiers` writes each tier quest 27's ADR commits.
- [ ] Two runs are byte-identical.
- [ ] `verstaan_data_<tier>` builds.
- [ ] The hand-written `engine/generated/fixture/` is gone.
- [ ] Gate step 6 follows quest 27's rule, and SPEC §3.5 matches.
- [ ] `git check-ignore engine/generated/phone/tables.cpp engine/generated/connected/tables.cpp` exits 0.
- [ ] `python -m tools.compiler --changed --base nosuchref` exits non-zero.
- [ ] `grep -n 'git diff --exit-code engine/generated' tools/factory/hooks/gate_full.sh .claude/commands/gate.md` finds nothing.
- [ ] The golden text rows and their ids are stated and tested.
- [ ] The repository size added is stated in the hand-off.
- [ ] `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
