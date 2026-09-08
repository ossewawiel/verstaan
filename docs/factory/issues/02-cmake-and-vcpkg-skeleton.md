---
issue: 2
title: "CMake, vcpkg and preset skeleton for engine, apps and tests"
milestone: M0
status: open
depends_on: [1]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
---
## What

Turn the M0 issue-01 stub build into the real layout from `docs/standards/cpp.md`: presets,
targets, warnings as errors, GoogleTest through vcpkg manifest mode, CTest labels, `.clang-format`
and `.clang-tidy`.

## Acceptance criteria

- `CMakePresets.json` has `msvc-debug`, `msvc-release`, `clang-release`, `gcc-release`. Each
  configures on this machine or fails with one clear line naming the missing compiler.
- Targets: `verstaan_core` (static), `verstaan_data_fixture` (static, a hand-written stand-in for
  compiler output, under `engine/generated/fixture/`), `verstaan_tests`, `verstaan_cli` (prints
  version and exits).
- `-Wall -Wextra -Werror -Wpedantic` / `/W4 /WX /permissive-` on all targets. A file with an
  unused variable fails the build. **Prove it fails.**
- `vcpkg.json` lists `gtest` only. `verstaan_core` has no port dependency.
- CTest labels `fast`, `golden`, `equivalence`, `tier` exist; `ctest -L fast` runs one test.
- `.clang-format` (Google base, 100 columns, 2-space) and `.clang-tidy` (modernize, bugprone,
  performance, readability; warnings as errors) are present and run clean on the skeleton.
- `engine/include/verstaan/engine.hpp` declares the API in `SPEC.md` §3.4 with every method
  returning `Status::not_implemented`.

## Not in scope

Any translation behaviour. ARM preset (M4).

## Done when

- [ ] `cmake --preset msvc-debug && cmake --build --preset msvc-debug && ctest --preset msvc-debug` is green.
- [ ] The unused-variable failure run is in the report.
- [ ] `docs/standards/cpp.md` build section matches the presets that exist.
