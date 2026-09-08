# 0008 — Python for tooling, C++20 with CMake and vcpkg for the engine

Date: 2026-09-08 · Status: Accepted

## Context

The mirror, importer and compiler are parsers and generators that will change weekly while the
data formats are learned. The engine must run on a Pi Zero with no runtime dependencies. The
owner's machine has Python 3.13 and vcpkg installed.

## Decision

- `tools/` is Python 3.13, one package per tool, `pytest`, `ruff`. No tool is on the translation
  path. No runtime dependency of the engine is Python.
- `engine/`, `apps/` are C++20, CMake 3.28 or later, vcpkg for GoogleTest and nothing else in the
  engine. `-Wall -Wextra -Werror`. `clang-format` and `clang-tidy` from the auto-fix and full gates.
- Windows with MSVC is the daily build. clang and gcc on Linux and an ARM cross-build are gate
  builds from M4.

## Consequences

- The rule compiler can be rewritten in C++ later if it must ship inside a management tool. The
  interface, YAML in and generated files out, does not change.
- vcpkg's manifest mode pins versions in `vcpkg.json`; the engine target itself lists no ports.
