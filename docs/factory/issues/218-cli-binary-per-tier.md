---
issue: 218
title: "Each built tier gets its own CLI, and verstaan_cli refuses --tier"
milestone: Side
status: open
depends_on: [29, 30, 210]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: 4
commit: null
worktree: null
github_issue: 354
---
## What

`apps/cli/src/main.cpp:141` parses `--tier` and ignores it. `verstaan_cli --tier basic "book"` runs
the runtime tables and prints a translation, so a reader believes `basic` answered. No binary links a
data library: `apps/cli/CMakeLists.txt` links `verstaan_core`, and quest 30 proves `verstaan_cli`
links no `generated_tables`. ADR 0028 says one binary links one data library. Quest 27's checkpoint
found that no open quest wires the flag. The owner, 2026-11-04: "help me to fix this", and chose one
binary per tier.

After this quest, `verstaan_cli` stays runtime-only and refuses `--tier`, with a load failure that names
the binary to run. CMake adds `verstaan_cli_<tier>` for each tier in `VERSTAAN_TIERS`, except the
fixture build. `verstaan_cli_basic` links `verstaan_data_basic`, calls `Engine::generated(Tier::basic)`
and reads no store. Quest 32 cross-builds it, and quest 205 takes it to the Pi. The checkpoint is 4
because the command line is a public API.

## Acceptance criteria

- `verstaan_cli --tier basic "book"` prints nothing to stdout, names `verstaan_cli_basic` on stderr, and
  exits with quest 210's load-failure code.
- `verstaan_cli_basic "book"` and `verstaan_cli_basic --tier basic "book"` each print `boek` and exit 0.
- `verstaan_cli_basic --tier phone "book"` prints nothing to stdout and exits with the load-failure code.
- `verstaan_cli_basic "slumbrous"` prints `⟦slumbrous⟧` and exits 2. `"German"` prints `⟦German⟧` and
  exits 2. `"Slumbrous"` prints `Slumbrous` and exits 0, the exception the owner accepted (ADR 0028 R6,
  row T105).
- `strings build/linux-gcc/apps/cli/verstaan_cli_basic` finds no `data/languages`, because this target
  does not define `VERSTAAN_REPO_ROOT`. A test runs the binary from an empty folder and gets `boek`.
- `nm -u build/linux-gcc/apps/cli/verstaan_cli` still lists no `generated_tables`. So `main.cpp` does not
  call `Engine::generated` in that target.
- `cmake -S . -B build/t -DVERSTAAN_TIERS=fixture` configures and builds no `verstaan_cli_basic`. The MSVC
  fallback (ADR 0028 R3) needs this.
- After `python -m tools.compiler --tier phone`, `-DVERSTAAN_TIERS=phone` builds `verstaan_cli_phone`. Its
  test carries the label `data`.
- Red proof: make `verstaan_cli` ignore `--tier` again, see the refusal test fail, restore it, and paste the
  failure in the hand-off.
- SPEC §3.6 names both binaries and the refusal. The header comment in `apps/cli/CMakeLists.txt` no longer
  says "not yet wired".
- No file under `engine/include/` changes.
- `ctest --preset linux-gcc -L fast` passes.
- `python -m tools.validate --changed` exits 0.

## Not in scope

The `arm-basic` cross-build and the memory budgets: quest 32. The CI legs: quest 203. Running on a Pi:
quest 205. Which directions generated tables serve: quest 30 decides that, and this quest passes `--from`
and `--to` through unchanged. Register and context on a tier binary: M5.

## Done when

- [ ] `verstaan_cli --tier basic "book"` refuses, names `verstaan_cli_basic`, and exits with the load-failure code.
- [ ] `verstaan_cli_basic "book"` prints `boek` and exits 0, from an empty folder.
- [ ] `strings build/linux-gcc/apps/cli/verstaan_cli_basic` finds no `data/languages`.
- [ ] `nm -u build/linux-gcc/apps/cli/verstaan_cli` lists no `generated_tables`.
- [ ] `-DVERSTAAN_TIERS=fixture` configures and builds no `verstaan_cli_basic`.
- [ ] The red proof is pasted in the hand-off.
- [ ] SPEC §3.6 names both binaries.
- [ ] `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
