# Verstaan — specification (agent-facing)

Terse on purpose. Section numbers match `PLAN.md`. Read this before writing code or data.

## 1. Scope

- Deterministic rule-based translation. Source text → UNL graph → target text.
- Languages at M3: eng, afr. Mirrored at M1: all archive languages. Seeded at M6: nld.
- No neural code in `engine/`. Ever. A fallback, if it comes, lives in `apps/service/`.

## 2. Terms

`docs/glossary.md` is the one glossary: UNL terms, system terms, factory and game terms, and the
words we do not use. Use those words. Do not introduce a synonym; add a term there instead.
The ones this file leans on most: UW, relation, attribute, UNL graph, analysis, generation,
transformation grammar, inflectional paradigm, subcategorisation frame, tagset, register,
context, dialect, tier, runtime tables, generated tables, trace, partial.

## 3. Pipeline contracts

### 3.1 Mirror (`tools/mirror`)

- Input: `mirror.toml` listing sources. Credentials from environment only (`UNL_USER`, `UNL_PASS`).
- Output: files under `data/archive/<source>/...`, byte-for-byte as served, plus one JSON line per
  file in `data/archive/manifest.jsonl`:
  `{"path", "url", "retrieved", "sha256", "licence", "licence_url", "title", "language"}`
- Idempotent. Re-running updates only changed files and appends a new manifest line for them.
- Never follows links off `unlarchive.org`. Rate limit 1 request/second.
- Sources: public pages (`index.php?unlweb=*`), wiki (`/wiki/*` via MediaWiki API, wikitext and
  rendered HTML), static grammars (`/grammars/*.txt`), UNLarium exports per language (dictionary,
  the four grammar exports, tagset, corpora), the user's Files page uploads.

### 3.2 Importer (`tools/importer`)

- Input: `data/archive/`. Output: `data/languages/<iso3>/` YAML.
- Dictionary entry (archive form `[headword]{id}"uw"(FEATURES)<lang,freq,pri>;`) becomes:
  ```yaml
  - headword: aalbessie
    id: 2357
    uw: "107744246"
    features: {LEX: N, POS: NOU, LST: MTW, NUM: SNG, PAR: M2, FRA: Y0}
    lang: af
    frequency: 0
    priority: 3
    source: {archive_path: "uploads/656.txt", line: 1}
  ```
- An entry with an empty UW is a closed-class record (`features.LEX` one of `C`, `D`, `P`), not an
  unparsed line.
- Grammar rule becomes `{id, kind, lhs, rhs, conditions, comment, source}`. `kind` ∈
  `analysis | generation | inflection | subcategorisation | disambiguation | default`.
- `lhs` holds the archive's left-hand side verbatim. `conditions` is `[]` at M2: the archive
  embeds every condition inside `lhs`, and the M3 rule interpreter decides whether it needs them
  split out. Schemas: `tools/validate/schema/`, owned by `tools/validate`.
- Every record keeps `source`. Losing provenance is a validation error.
- Unparseable lines go to `data/languages/<iso3>/_unparsed.txt` with the reason. Never dropped silently.
- `tools/importer/test_dictionary.py`, `test_grammar.py`, `test_corpus.py` and `test_tagset.py`
  read fixture-sized copies of the real archive under `tests/fixtures/archive/`, not
  `data/archive/` itself (issue 166: the real English AD/GD zips took 780s to import and blew the
  gate's 15-minute build cap). `tests/fixtures/archive/manifest.jsonl` names the source zip,
  licence, retrieval date and line range for every fixture file. Proving a full import against the
  real archive is an owner-run step, not part of the gate: run
  `python -m tools.importer.dictionary --iso3 <afr|eng> --ad <zip> --gd <zip>` (and the
  `tools.importer.grammar`/`corpus`/`tagset` equivalents) against `data/archive/`, writing to a
  scratch `--store-root`, then diff that output against the committed `data/languages/` tree. Run
  this after `data/archive/` changes for afr or eng, or after an importer change the fixtures do
  not exercise.

### 3.3 Store (`data/languages/<iso3>/`)

```
dictionary/<a-z>.yaml      entries sharded by first letter
grammar/analysis.yaml      transformation rules, analysis direction
grammar/generation.yaml
grammar/inflection.yaml
grammar/subcategorisation.yaml
grammar/disambiguation.yaml
tagset.yaml                feature names and allowed values
corpus/<name>.yaml         sentence, unl, source
tests/<name>.yaml          input, expected, direction, tier, register, deferred (optional)
meta.yaml                  iso1, iso3, name, licence, counts, last_import
```

`tools/validate` checks: schema, feature values against `tagset.yaml`, UW references resolve,
test rows name real rules, and rule coverage. A `rules` entry on a test row is a qualified id,
`<iso3>-<kind>-<id>` (`eng-ana-12`, `afr-gen-4`). An entry that names no rule in the store its
prefix points at is an error. A rule that no test row names is a warning, at M3 and after (owner
ruling 2026-09-28; writing those test sentences is the M6 rule-author workflow). Each store's
`meta.yaml` `counts` come from `python -m tools.importer.meta`, which every importer also calls at
the end of a run.

### 3.4 Engine (`engine/`)

- C++20, `-Wall -Wextra -Werror`, no exceptions across the public API, no RTTI needed.
- `basic` tier, no allocation to read a table after `Engine::generated(Tier::basic)` returns (ADR
  0028). Dictionary arrays are `static const`, with constant initialisation. A dictionary read returns
  views. Load parses each rule's text once. `translate` opens no file, parses no rule text, builds no index
  and fills no cache. `translate` still allocates its working state (forest, trace, `Result`) and
  frees it on return; §7's RAM budget bounds the peak. `Result` keeps its shape.
- Public API (`engine/include/verstaan/engine.hpp`):
  ```cpp
  struct Options { Lang from; Lang to; Register reg = Register::neutral; Context ctx = Context::none; };
  struct Result { std::string text; Graph unl; Trace trace; Status status; };
  class Engine {
   public:
    static Engine load(const RuleSet&);        // runtime tables
    static Engine generated(Tier);             // compiled tables
    [[nodiscard]] Result translate(std::string_view, Options) const;
  };
  ```
- `Status` ∈ `ok | partial | no_parse | not_implemented`. `partial` means some words fell through
  untranslated and are marked in `text` with `⟦word⟧`. `not_implemented` is the M0 stub value
  every real `Engine` method retires; never guess. Never confuse this four-member enum with
  `Result`'s four fields (`text, unl, trace, status`) — the counts match by coincidence.
- `Trace` lists every rule fired in order. The CLI `--trace` flag prints it. This is the audit trail.
  `TraceEntry::event` is `fired` for a firing; the tree pass also writes `capped` and
  `unsupported` entries (ADR 0017).
- Two rule back ends, one semantics (ADR 0007). Both run the same `RuleInterpreter`; generated
  tables hold rule text, not rule code (ADR 0028). `tests/equivalence/` diffs `text`, `unl`, `trace`
  and `status` between the runtime back end and generated tables: the 248 eng corpus sentences on
  `phone`, the xxa/xxb rows on the fixture build. It never diffs `basic`, which holds fewer words.
  Golden rows test `basic` (quest 30).

### 3.5 Compiler (`tools/compiler`)

- Input: store + `tiers.toml` (languages, dictionary, `n`, budget, `committed` per tier; the
  `[fixture]` build; the paths that compile the real stores).
- Output: `engine/generated/<tier>/`: `tables_<iso3>_{pool,features,rows,index}.cpp` per language,
  `rules.cpp`, `tables.cpp`, `tables.hpp`. `engine/generated/fixture/` has the same form, from the
  xxa/xxb pair. `tests/golden/<tier>/*.txt` only for a committed tier. Header of every generated file:
  source hash, tier, date,
  `// GENERATED — do not edit. Licence: CC BY-SA 4.0 (data). See data/LICENSE.`
- `rules.cpp`: one array per language and grammar file. One row per rule, `{id, kind, lhs, rhs,
  comment}`, byte for byte, in file order. The array names the list, not `kind` or `id`. No rule code
  (ADR 0028).
- Per language: rows `{headword, uw, features, id, frequency, priority}` in store order, shard `a` to
  `z` then file order, with entries that differ only in `source` all kept. Strings sit in one pool of
  `uint64_t` words; rows hold byte offsets. One index by headword, one by UW, each keeping store order.
  An empty UW is not in the UW index. No `source`.
- `top_n` selection, per language (ADR 0028). Pins are always kept and take no ranked place: every
  headword with a closed-class record, every headword a fixed-set row needs, every capitalised
  headword. Capitalised: first character is Unicode `Lu`, and no space (owner, 2026-11-04). Rank the
  rest: partner headwords first, then highest `frequency` of the headword's entries, then lowest UTF-8
  bytes. Keep the first `n`. A partner headword has an entry with a non-empty UW that is also a UW in
  the pair's other language. A kept headword keeps every entry. Fail, writing nothing, when `n` is
  below a language's count of partner headwords that no pin holds.
- `engine/include/verstaan/generated_tables.hpp` holds the row structs and declares
  `generated_tables()`. `tables.cpp` implements it. `Engine::generated` sits in its own source file,
  so a binary that never calls it links no data library.
- Builds as static library `verstaan_data_<tier>`. `engine/` links it. One binary links one. The
  fixture library answers `Tier::basic`. Any other unlinked tier is a load failure. ADR 0003, ADR 0028.
- Table files compile one at a time: `JOB_POOL_COMPILE`, a pool of depth 1.
- `python -m tools.compiler --all-tiers` writes the fixture build and every tier with
  `committed = true`. `--tier <name>` writes one tier. `--changed --base <ref>` writes the fixture
  build, and also every tier when the branch changes a path in `[real_stores].compile_when_changed`.
  A `<ref>` that does not resolve fails. The list holds both runtime store readers and the table reader.
- Git holds `engine/generated/fixture/`, `engine/generated/basic/` and `tests/golden/basic/`. `phone`
  and `connected` are ignored. CMake's configure fails, naming the `--tier` command, when
  `VERSTAAN_TIERS` names a tier whose files are absent. If MSVC cannot build `basic`, its leg sets
  `VERSTAAN_TIERS=fixture` (owner, 2026-11-04).

### 3.6 Applications (`apps/`)

- `apps/cli`: `verstaan --from eng --to afr [--register formal] [--context medical] [--trace] [--tier basic] "text"`.
  Exit 0 on `ok`, 2 on `partial`, 3 on `no_parse`.

### 3.7 Atlas (`docs/factory/map.yaml`)

- Hand-authored, never generated (ADR 0015). The owner places every region and every tile.
- One region per `PLAN.md` §7 milestone row, eight in total (`m0`-`m7`): `{id, name, goal, x, y,
  size}`. ADR 0015 says "seven"; it was written the same day as `PLAN.md`'s M7 row, before that
  row existed. Each milestone keeps its own region, `m6` included, so an unbuilt milestone stays
  genuinely empty, and so fogged, independent of how much work another region has landed (the
  whole point ADR 0015's "Consequences" names: "a milestone nobody has built has no node to fog").
- `id` is always a YAML string, quoted when it would otherwise parse as a number (`'08'`, not
  `08`) -- PyYAML (the validator) and the `yaml` npm package (the server) resolve an unquoted
  leading-zero scalar differently, and an unquoted numeric id silently drops its own issue
  prefix's leading zero on one side of that split.
- One tile per issue-number prefix under `docs/factory/issues/`: `{id, region, title, x, y, size}`.
  `id` matches the prefix exactly, e.g. `"04"` for both `04-fixture-language-pair.md` and
  `04-test-cases.md`. `region` names one region's `id`.
- Tile state is never stored here; the console computes it from issue front matter and, for
  cleared-for-jump only, a GitHub read (ADR 0014, ADR 0015).
- `tools/factory/validate_map.py` refuses an issue prefix with no tile, a tile with no matching
  issue file, a tile naming an unknown region, a duplicate tile or region `id`, a region/tile
  whose `id` is not a string, or a region/tile missing `x`, `y`, `size` or (tile only) `title`.
  Wired into `python -m tools.validate --all` and `--changed` (issue 177).

## 4. Data rules

- YAML, UTF-8, LF, two-space indent, keys sorted as in §3.3, one entry per list item.
- Never edit `data/archive/` by hand. Fix the mirror.
- Every store change to `grammar/` needs a matching change or addition in `tests/`.
- Licence header at the top of every store file: `# Licence: CC BY-SA 4.0. Source: UNL Archive, see data/archive/manifest.jsonl`.

## 5. Gates

| Tier | Command | Must |
|---|---|---|
| Auto-fix | `clang-format -i`, `ruff format` | never block |
| Fast | `cmake --build build --target verstaan_core && ctest --test-dir build -L fast` and `python -m tools.validate --changed` | pass before the session may stop |
| Full | `/gate`: fast + `ctest` all + `clang-tidy` + equivalence + committed tiers configure and build + `python -m tools.compiler --changed --base origin/main`, then `git status --porcelain engine/generated/ tests/golden/` is empty + `python -m tools.validate --changed --base origin/main` + pytest | pass before a PR; writes the stamp |

`--changed` finds the files a branch touched, then validates every store one of those files sits
in, whole — touching one file in a store validates every file beside it, not the touched file
alone. `--all`, the full sweep of every store, is not a gate step. It is run by hand for
deliberate data work; the archive is CC BY-SA data, not generated code, and is not a merge
blocker for a branch that never touches it (issue 168).

A branch that changes a path in `tiers.toml`'s `[real_stores].compile_when_changed` also compiles the
real stores, builds `phone` and `connected`, and runs the 248-sentence equivalence diff. In CI that is
the `data` job, a pass when skipped. It fails if the `phone` case is not registered (ADR 0028).

Never pipe a gate into `head`, `tail` or `grep` and then read the exit code.
Prove a gate fails before trusting it (`docs/standards/testing.md`).

## 6. Issue file schema

```yaml
---
issue: 7
title: "Mirror the public pages and the wiki"
milestone: M1
status: open            # open | in-progress | done
depends_on: [6]         # every number must be an existing issue; may cross main and side (issue 104)
agent: implementer
agents: [implementer, docs-writer]
# model and effort take values from docs/factory/loadouts.json; the validator refuses others
model: sonnet
effort: medium
checkpoint: null        # 1..4 or null
commit: null
worktree: null          # .worktrees/<branch>, set while status is in-progress, cleared at close
github_issue: null      # written only by tools/factory/mirror_github.py (issue 91); drifts from the local number
---
## What
## Acceptance criteria
## Not in scope
## Done when
```

## 7. Tiers

| Tier | Languages | Dictionary | Target | In git | RAM budget |
|---|---|---|---|---|---|
| basic | 2 chosen at build | top-N headwords, partners first, N from `tiers.toml`; pins and every capitalised headword added (§3.5, ADR 0028) | Pi Zero 2 W, ARMv8 | yes | 64 MB total, measured on x86-64 until quest 205 runs it on a Pi (ADR 0027) |
| phone | any set | full | Android/iOS via CLI first | no, `--tier phone` | 256 MB |
| connected | all | full; corpora arrive when something reads them | x86-64 service | no, `--tier connected` | unbounded |
