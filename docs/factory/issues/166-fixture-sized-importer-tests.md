---
issue: 166
title: "Fixture-sized importer tests: the gate stops importing the real archive"
milestone: Side
status: open
depends_on: [14, 15, 16]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: null
github_issue: 236
---
## What

The `gate` workflow's build job carries `timeout-minutes: 15`. Since 11:24 UTC on 2026-09-15
every run has been cancelled at that cap, and the last two merges (#234, #235) went in with
`gh pr merge --admin`. The step logs name one cause. The C++ configure, build, ctest and
clang-tidy finish in under 30 seconds on every leg. Then `tools/importer/test_dictionary.py`'s
module-scoped `eng_store` fixture runs the real importer on the 6 MB English AD and GD zips
under `data/archive/exports/eng/`, writes 175 MB of shards into a temp directory, and reads
every shard back with the pure-Python `yaml.safe_load`. That fixture takes 780 seconds on the
owner's machine and 10 to 14 minutes on a hosted runner; the other 534 tests in the suite
finish in about 20 seconds. The three sibling modules, `test_grammar.py`, `test_corpus.py` and
`test_tagset.py`, read the real archive too and cost under a second each, but they share the
same `ARCHIVE_ROOT` and `skipif` shape.

The owner asked on 2026-09-15: "do we really need to run 6 MB of data imports to prove it is
working? That is basically working data. We can just cater for the exceptions to ensure it
imports properly." Yes. Every assertion in the dictionary module is a property of a line or a
shard, not of the archive's size: the `aan` worked example, input lines equal parsed plus
unparsed, `_unparsed.txt` holds every reported line, shards named a to z with the licence
header, `lang` is the ISO 639-3 code, every entry passes the schema. `docs/standards/testing.md`
already says fixture data lives under `tests/fixtures/` and expected values come from the raw
archive bytes. After this quest the four importer modules read carved fixture zips of a few
hundred verbatim archive lines under `tests/fixtures/archive/`, the pytest step takes about half
a minute on every leg, and the full-archive import is an owner-run regenerate-and-diff step
documented next to the mirror. Decision brief: the "Gate Time Budget" investigation of
2026-09-15, option "Fixture-sized imports", chosen by the owner the same day. Issue 18 waits on
this quest so its own pull request merges through a gate that can pass.

## Acceptance criteria

- `tests/fixtures/archive/afr/` and `tests/fixtures/archive/eng/` each hold an AD and a GD zip
  whose members carry a few hundred lines copied verbatim from the real exports, and
  `tests/fixtures/archive/manifest.jsonl` names, per zip, the source zip under
  `data/archive/exports/`, its licence, its retrieval date and the line ranges taken.
- The English fixture holds: the `aboard` line issue 14 settled on; one headword per shard
  letter a to z; one all-symbol headword; one line per unparsed reason `parse_line` knows
  (blank, comment, empty UW, unknown FLG, frequency above 255); the compound and `#01(...)`
  sub-word shapes; and headwords YAML reads as a bool or null (`off`, `no`, `on`, `yes`, `null`,
  `true`, `false`, `Off`). The Afrikaans fixture holds the `aan` line, `id: 22319`, and one
  headword per shard letter the real export has.
- The grammar, corpus and tagset fixtures under the same folder are cut the same way from the
  files `test_grammar.py`, `test_corpus.py` and `test_tagset.py` name today, and those modules'
  worked-example assertions pass unchanged against them.
- `tools/importer/test_dictionary.py`, `test_grammar.py`, `test_corpus.py` and `test_tagset.py`
  point `ARCHIVE_ROOT` at `tests/fixtures/archive/` and carry no `skipif` on archive presence.
  The line-accounting tests read their expected counts from the fixture zip's own members, never
  from the importer's output.
- `python -m pytest tools/ -q --durations=15` on a clean checkout finishes in under 60 seconds
  on the owner's machine and prints no item over 5 seconds.
- `.github/workflows/gate.yml`'s pytest step carries `--durations=15`, so a test that quietly
  reads the real archive again names itself in the job log.
- `docs/factory/SPEC.md` §3.2 or the mirror's own documentation carries the owner-run step that
  re-imports the full archive and diffs `data/languages/`, in one paragraph, so the full import
  is still proven when the archive changes.
- A gate run on this quest's pull request shows every build leg green in under 8 minutes,
  including `validate --all`.

## Not in scope

The two-suite split with a separate Linux data job (the brief's runner-up); it returns when
`validate --all` or M3's corpus tests outgrow the build legs. `validate --all`'s exit 1 on the
real stores, held by issue 18. Importer speed. The 15-minute cap itself stays as it is.

## Done when

- [ ] `tests/fixtures/archive/` holds the afr and eng AD, GD, grammar, corpus and tagset
      fixtures with a `manifest.jsonl` line per file.
- [ ] The four importer test modules read the fixture folder and have no archive `skipif`.
- [ ] `python -m pytest tools/ -q --durations=15` passes in under 60 seconds locally.
- [ ] `gate.yml`'s pytest step carries `--durations=15`.
- [ ] The owner-run full-archive regenerate-and-diff step is documented.
- [ ] The pull request's gate run is green on all three build legs without an admin override.
