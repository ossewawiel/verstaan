---
issue: 28
title: "The engine takes its languages from data, and the xxa/xxb rows run"
milestone: M4
status: done
depends_on: []
agent: rule-author
agents: [rule-author, test-writer, implementer]
model: opus
effort: high
checkpoint: 4
commit: 39bbda4
worktree: null
github_issue: 344
---
## What

`enum class Lang` holds eng, afr and nld (`engine/include/verstaan/engine.hpp`).
`Engine::translate` returns `not_implemented` for anything but eng to afr (`engine/src/engine.cpp:164`).
The golden loader's `run_row` loads eng and afr by name. So the 17 xxa/xxb rows are registered as
skipped (issue 202), and a third language would need engine code before it translated one word.

The owner chose on 2026-11-04 that these rows run. A 140 KB pair gives quests 29 and 31 a subject
small enough for every pull request. It also proves a new language needs no engine code before
Dutch at M6. Only the direction check has been read so far, so the rule-author first reports what
other coupling exists. After this quest, the engine reads its languages from data, and
`tests/fixtures/languages/` rows drive the runner by their `direction`. The direction reads
`xxa->xxb` beside `eng-afr`, so the runner accepts both.

Row ids must stay unique. The xxa/xxb rows use ids A01 to A17 and eng uses A01 to A15. Removing the
skip branch drops the prefix that separates them, so ids stay prefixed. The change touches the
public API, so one ADR records it. The checkpoint is 4 because `engine/include/` changes.

The owner ruled on 2026-11-04, after the rule-author's report. ADR 0029 is accepted. This quest also
rewrites the fixture store in the engine's rule syntax, because the store's invented notation fires
no rule (`28-test-cases.md`, "Drafted fixture store"). Row A09 now expects `kinda vidra ⟦glimu⟧`,
`partial`, the text ADR 0025 gives. Row A12 now expects `hundo`, `ok`, and row A13 expects `kano`,
`ok`, the same behaviour as eng row A01. The fixture pair then holds no `no_parse` row.

## Acceptance criteria

- The rule-author's report lists every place the engine names a language, before any test exists.
- The ADR exists, and the owner has accepted it.
- `ctest -L golden` runs all 17 xxa/xxb rows and counts none as skipped.
- The fixture store uses the engine's rule syntax, and every drafted rule fires in the rows that name it.
- Rows A09, A12 and A13 expect the owner's ruled values in the fixture, `04-test-cases.md` and
  `27-test-cases.md`.
- Fixture rows drive the runner by their `direction`, and the runner accepts `xxa->xxb` and
  `eng-afr`.
- Row ids stay unique across languages, shown by a test.
- `docs/standards/testing.md`'s sentence about skipped rows is updated.
- SPEC §3.4 matches the new `Lang`.
- `Lang` maps from an iso3 code, because generated tables key each language by iso3 (ADR 0028).
- `ctest --preset linux-gcc -L fast` passes.
- `python -m tools.validate --changed` exits 0.

## Not in scope

Dutch. Register and context selection: M5.

## Done when

- [x] The ADR is accepted.
- [x] The fixture store is rewritten in the engine's rule syntax, and its validator tests follow it.
- [x] The 17 xxa/xxb rows run under `ctest -L golden`, with the owner's ruled values for A09, A12
      and A13.
- [x] The skip branch and its test are removed or repointed.
- [x] Row ids stay prefixed and unique, with a test.
- [x] `docs/standards/testing.md`'s skip sentence and SPEC §3.4 are updated.
- [x] `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
