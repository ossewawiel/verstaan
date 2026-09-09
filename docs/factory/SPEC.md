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
- Grammar rule becomes `{id, kind, lhs, rhs, conditions, comment, source}`. `kind` ∈
  `analysis | generation | inflection | subcategorisation | disambiguation | default`.
- Every record keeps `source`. Losing provenance is a validation error.
- Unparseable lines go to `data/languages/<iso3>/_unparsed.txt` with the reason. Never dropped silently.

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
tests/<name>.yaml          input, expected, direction, tier, register
meta.yaml                  iso1, iso3, name, licence, counts, last_import
```

`tools/validate` checks: schema, feature values against `tagset.yaml`, UW references resolve,
every rule has at least one test sentence that exercises it (warning at M2, error from M3).

### 3.4 Engine (`engine/`)

- C++20, `-Wall -Wextra -Werror`, no exceptions across the public API, no RTTI needed, no
  dynamic allocation after `Engine::load()` in the `basic` tier.
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
- Two rule back ends, one semantics (ADR 0007). `tests/equivalence/` runs every corpus sentence
  through both and diffs `text` and `unl`.

### 3.5 Compiler (`tools/compiler`)

- Input: store + `tiers.toml` (which languages, which dictionary shards, size caps per tier).
- Output: `engine/generated/<tier>/{tables.cpp, tables.hpp, rules.cpp}` and
  `tests/golden/<tier>/*.txt`. Header of every generated file: source hash, tier, date,
  `// GENERATED — do not edit. Licence: CC BY-SA 4.0 (data). See data/LICENSE.`
- Builds as static library `verstaan_data_<tier>`. `engine/` links it. ADR 0003.

### 3.6 Applications (`apps/`)

- `apps/cli`: `verstaan --from eng --to afr [--register formal] [--context medical] [--trace] [--tier basic] "text"`.
  Exit 0 on `ok`, 2 on `partial`, 3 on `no_parse`.

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
| Full | `/gate`: fast + `ctest` all + `clang-tidy` + equivalence + all tiers configure and build + `python -m tools.validate --all` + pytest | pass before a PR; writes the stamp |

Never pipe a gate into `head`, `tail` or `grep` and then read the exit code.
Prove a gate fails before trusting it (`docs/standards/testing.md`).

## 6. Issue file schema

```yaml
---
issue: 7
title: "Mirror the public pages and the wiki"
milestone: M1
status: open            # open | in-progress | done
depends_on: [6]
agent: implementer
agents: [implementer, docs-writer]
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

| Tier | Languages | Dictionary | Target | RAM budget |
|---|---|---|---|---|
| basic | 2 chosen at build | top-N by frequency, N from `tiers.toml` | Pi Zero 2 W, ARMv8 | 64 MB total, measured |
| phone | any set | full | Android/iOS via CLI first | 256 MB |
| connected | all | full + corpora | x86-64 service | unbounded |
