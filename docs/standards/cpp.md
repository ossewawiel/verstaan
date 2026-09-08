# C++

Applies to `engine/` and `apps/`. The house C++ standard at
`D:\SourceCode\claude-prompts\guides\coding-standards\cpp-coding-standards.md` is the baseline;
this file records where Verstaan is stricter.

## Build

- C++20. CMake ≥ 3.28 with presets in `CMakePresets.json`: `msvc-debug`, `msvc-release`,
  `clang-release`, `gcc-release`, `arm-basic`.
- `-Wall -Wextra -Werror -Wpedantic` (MSVC: `/W4 /WX /permissive-`).
- vcpkg manifest mode. The engine target depends on no port. Tests depend on `gtest`.
- One library target per component: `verstaan_core`, `verstaan_data_<tier>`, `verstaan_cli`.

## Code

- `#pragma once`. Includes in three groups: own header, project, standard library.
- Namespace `verstaan`. Files `snake_case.hpp/.cpp`. Types `PascalCase`. Functions and variables
  `snake_case`. Constants `kPascalCase`. Enums are `enum class`.
- No exceptions across the public API. Return `Status` or `std::expected`. Exceptions inside the
  engine are a bug.
- No `new`/`delete`. `std::unique_ptr` where ownership is needed. The `basic` tier allocates nothing
  after `Engine::load()`; a test asserts it with a counting allocator.
- No RTTI, no `dynamic_cast`. No global mutable state. The engine is `const` after load and safe
  to call from many threads.
- Strings are UTF-8 `std::string_view` in, `std::string` out. Never assume one byte per character.
- `engine/generated/` is never edited by hand and never included directly (ADR 0003).

## Tests

See `testing.md`. Every public function in `engine/include/` has a unit test. Every grammar rule
has a golden sentence. Every corpus sentence runs through both rule back ends.

## Tooling

- `clang-format` with the repo `.clang-format` runs on save from the auto-fix hook.
- `clang-tidy` runs in `/gate` with the repo `.clang-tidy`. Warnings are errors.
- Sanitizers (`-fsanitize=address,undefined`) on the `clang-release` preset in `/gate`.
