# engine/

The C++20 translation engine. MPL-2.0.

- Standards: `docs/standards/cpp.md`. API contract: `docs/factory/SPEC.md` §3.4.
- `include/verstaan/` is the public API. Changing it needs an ADR.
- `src/` is the core. No I/O, no clock, no network, no exceptions across the API.
- `generated/<tier>/` is compiler output, CC BY-SA. Never edit by hand, never `#include` directly;
  go through `include/verstaan/tables.hpp`. `generated/fixture/` is hand-written test data that
  imitates compiler output and is the one exception.
- Build: `cmake --preset msvc-debug && cmake --build --preset msvc-debug`. Tests: `ctest --preset msvc-debug -L fast`.
- Tests live in `../tests/`, not here.
