---
issue: 193
title: "Engine initializer lists carry the trailing comma LLVM 23's clang-tidy requires"
milestone: Side
status: done
depends_on: [6]
agent: implementer
agents: [implementer]
model: haiku
effort: low
checkpoint: null
commit: 0b05e89
worktree: null
github_issue: null
---
## What

`/gate` step 4 runs clang-tidy with `readability-*` and warnings as errors (`.clang-tidy`,
`docs/standards/cpp.md`). LLVM 23.1.3 reached this machine on 2026-10-20 and adds
`readability-trailing-comma`. On 2026-10-27 the check flags eight designated initializers in
`engine/src/dictionary_lookup.cpp`, `engine/src/engine.cpp` and `engine/src/rule_interpreter.cpp`.
The engine has not changed since 2026-09-20, so every branch now fails step 4 on this machine. The
quest branch for 189 to 192 hit it first. The owner's choice for issue 192, to fix gate drift on
that branch, applies here too.

After this quest, each flagged list ends in a trailing comma, and clang-format lays it out. The
check stays on. CI's older clang-tidy accepts both forms, so CI does not move.

## Acceptance criteria

- `clang-tidy -p build/linux-clang $(git ls-files 'engine/**/*.cpp')` reports no
  `readability-trailing-comma` diagnostic and exits 0.
- `clang-format --dry-run --Werror` on the three files exits 0.
- `.clang-tidy` is unchanged.
- `cmake --build --preset linux-clang && ctest --preset linux-clang` exits 0.

## Not in scope

Pinning the local LLVM version. A CI leg on the newest LLVM, which would catch the next new check
before a branch does.

## Done when

- [x] The eight initializer lists end in a trailing comma.
- [x] clang-tidy and clang-format pass on the engine sources.
- [x] The engine builds and every test passes.
