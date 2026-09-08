# Architecture overview

M0 built the skeleton: every target configures and links, every CTest label has at least one test,
and the engine API exists with every method returning `Status::not_implemented`. No step below
translates a real sentence yet. Each later milestone updates its own section of this page.

## The flow

Source text goes in one end and target text comes out the other, and every step in between is
either data or a rule that reads data:

1. **Tokenise.** Split the input into tokens using the source language's tagset rules. Planned
   for M3.
2. **Look up.** Each token finds its dictionary entries, with features and candidate UWs. Planned
   for M3.
3. **Analyse.** The source language's analysis transformation grammar rewrites the token
   sequence, step by step, into a UNL graph. Disambiguation rules choose between candidates.
   The trace records every rule that fires. Planned for M3.
4. **Generate.** The target language's generation transformation grammar rewrites the UNL graph
   into a token sequence. Subcategorisation frames place the arguments. Planned for M3.
5. **Inflect.** The target's inflectional paradigms produce the surface word forms. Planned for M3.
6. **Select.** Register, context and dialect tags on dictionary entries choose between
   synonyms at steps 2 and 4. Planned for M3.

The engine is one C++20 static library, `verstaan_core`, that will run steps 1 to 6 against a rule
set. The rule set will reach it either as runtime tables (`Engine::load`, for authoring and tests)
or as generated code (`Engine::generated(Tier)`, for shipping); the two must agree (ADR 0007). At
M0 both entry points exist in `engine/include/verstaan/engine.hpp` and both return
`Status::not_implemented`.

## What exists now

### Build

`CMakeLists.txt` at the repo root adds three subdirectories: `engine/`, `apps/`, `tests/`.
`CMakePresets.json` defines four configure/build/test presets: `msvc-debug`, `msvc-release`,
`clang-release` (exports `compile_commands.json` for `clang-tidy`), and `gcc-release` (present for
machines with a MinGW g++; the reference machine has none installed). All four inherit a `base`
preset that points at `$env{VCPKG_ROOT}` and the `x64-windows` triplet (`gcc-release` overrides
the triplet to `x64-mingw-dynamic` for ABI reasons — see the preset's own `description`).

### Targets

| Target | Kind | Defined in | Links | Status |
|---|---|---|---|---|
| `verstaan_core` | static lib, C++20 | `engine/CMakeLists.txt` | nothing at runtime | API stubs only, every method returns `Status::not_implemented` |
| `verstaan_data_fixture` | static lib | `engine/generated/CMakeLists.txt` | nothing | hand-written stand-in for compiler output, imitates a real tier |
| `verstaan_tests` | GTest binary | `tests/CMakeLists.txt` | `verstaan_core`, GTest | one real test (`unit/engine_test.cpp`), CTest label `fast` |
| `golden_placeholder_test`, `equivalence_placeholder_test`, `tier_placeholder_test` | executables | `tests/CMakeLists.txt` | nothing | keep the `golden`, `equivalence`, `tier` CTest labels usable before real content lands |
| `verstaan_cli` (apps/cli) | executable | `apps/cli/CMakeLists.txt` | `verstaan_core` (no data lib yet) | links the core, `main.cpp` prints the version and exits |

`engine/generated/<tier>/` other than `fixture/` does not exist yet: no tier has been compiled.
`fixture/` is the one hand-written exception inside `engine/generated/`, documented in
`engine/CLAUDE.md`.

### Python packages (`tools/`)

Each of `mirror`, `importer`, `compiler`, `validate` is a package with a `__main__.py`, a `cli.py`,
and a `tests/` directory run with pytest. All four run as `python -m tools.<name>` and all four are
skeletons at M0: `tools/mirror`'s CLI already refuses credentials passed as arguments (SPEC.md
§3.1) but makes no network call yet; `importer`, `compiler` and `validate` parse arguments and
exit 0 without reading or writing the store. `tools/validate/tests/test_fixture_languages.py` and
`test_licences.py` already check real invariants against `tests/fixtures/languages/`.

`tools/factory/` and `tools/console/` are factory infrastructure — GitHub issue mirroring and the
status console — not part of the translation pipeline in the table below.

### Data

`data/archive/` and `data/languages/` exist as empty directories (`.gitkeep` only): nothing has
been mirrored or imported yet. `data/LICENSE` (CC BY-SA 4.0) is in place. The fixture language pair
used by tests lives at `tests/fixtures/languages/xxa/` and `xxb/`, not under `data/`: it is test
data, not archive data, and follows the store layout from SPEC.md §3.3 (`dictionary/`, `tagset.yaml`,
`grammar/{analysis,generation,disambiguation,inflection,subcategorisation}.yaml`, `corpus/`,
`tests/`, `meta.yaml`) so that fixtures and the real store diverge only in content, never in shape.

## Components (target shape)

| Component | Language | Depends on | Produces | Status |
|---|---|---|---|---|
| `tools/mirror` | Python | the archive, credentials from env | `data/archive/` + manifest | skeleton, no network call (planned for M1) |
| `tools/importer` | Python | `data/archive/` | `data/languages/<iso3>/` | skeleton (planned for M1) |
| `tools/validate` | Python | the store | pass / fail, one line per problem | partially real: checks fixture shape and licences today |
| `tools/compiler` | Python | the store, `tiers.toml` | `engine/generated/<tier>/`, golden tests | skeleton (planned for M2+) |
| `engine/` `verstaan_core` | C++20 | nothing at runtime | the API in `SPEC.md` §3.4 | builds and links, every method a stub |
| `engine/generated/<tier>` `verstaan_data_<tier>` | generated C++ | compiler | tables the core links to | only the hand-written `fixture` tier exists |
| `apps/cli` | C++20 | core + one data lib | the `verstaan_cli` command | links the core; the `--from`/`--to`/... argument contract and a linked data lib arrive with the real engine |

## Tiers

See ADR 0006. The compiler decides what goes into a tier; the engine never knows which tier it is
running except through the size of its tables and the `Engine::generated(Tier)` entry point. No
tier has been compiled yet; `fixture` is a hand-written stand-in, not a real tier.

## What is deliberately not here

- A neural model. See ADR 0001 and 0006.
- A database. The store is YAML in git. An SQLite index for the management UI is a later
  convenience built from the YAML, never the other way round.
- A network call in the engine.

## Related pages

- `docs/architecture/archive-inventory.md`, produced by issue 11.
- `docs/unl-reference/`, produced by issues 09 and 10.
