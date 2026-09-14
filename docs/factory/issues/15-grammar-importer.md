---
issue: 15
title: "Build the grammar importer"
milestone: M2
status: done
depends_on: [13]
agent: implementer
agents: [implementer]
model: sonnet
effort: high
checkpoint: null
commit: fe59d98
worktree: null
github_issue: 224
---
## What

`tools/importer/grammar.py` reads a language's transformation-grammar, inflection and
subcategorisation exports and writes `data/languages/<iso3>/grammar/{analysis,generation,
inflection,subcategorisation,disambiguation}.yaml`, one record per rule per
`tools/validate/schema/grammar-rule.schema.json` (issue 13). Every record keeps `{id, kind, lhs, rhs,
conditions, comment, source}`; `id` is assigned sequentially per file since the archive's own rule
text carries no stable id.

Per-language files, named exactly, per language:

- `afr` custom transformation grammar: only `data/archive/exports/afr/47.tgrammar.txt` is a real
  custom transformation grammar. It self-labels its direction in its own header (`; RuleSet:(MX)
  TGrammer`) with rules like `agt(kill,he) > VS(vermoor,hy)` — UNL into Afrikaans, i.e. the
  generation direction. `data/archive/exports/afr/44.tgrammar.txt` contains no parseable rules
  (keyboard-mash scratch content, no `:=` rule syntax anywhere); the importer treats every line in
  it as unparsed, appended to `_unparsed.txt` with reason "no rule syntax found", not guessed at a
  `kind`.
- `afr` and `eng` shared default grammar, both directions:
  `data/archive/exports/afr/nl_unl_tgrammar.txt` (analysis default),
  `data/archive/exports/afr/unl_nl_tgrammar.txt` (generation default), and the byte-identical
  `data/archive/exports/eng/` copies of the same two files (same SHA-256 in the manifest, per
  `docs/unl-reference/formats/default-grammar.md`). Import once per language store even though the
  bytes match every other language's copy; `kind: default` on every record from these two files.
- `eng` custom transformation grammar: `data/archive/grammars/eng_unl_tgrammar.txt` (analysis
  direction, mirrored as a static file rather than a per-language export). No generation-direction
  custom grammar file exists for `eng` in the manifest; `grammar/generation.yaml` for `eng` holds
  only the shared default's generation rules until one is mirrored.
- Inflection, both languages: `data/archive/exports/afr/export_grammar.php__type_M_lang_af`
  (analysis) and `..._type_M_direction_G_lang_af` (generation); the `_lang_en` equivalents for
  English. Parsed per `docs/unl-reference/formats/inflection.md`'s `<RULE>` syntax, one YAML record
  per numbered paradigm (`M2`, `M7`, `M16`, ...).
- Subcategorisation, both languages: `data/archive/exports/afr/export_grammar.php__type_Y_lang_af`
  and the `_direction_G` and `_lang_en` equivalents. Per `subcategorisation.md`, the analysis and
  generation exports are byte-identical for this rule kind; import the analysis file only and mark
  `comment: "generation export identical, not re-imported"` rather than duplicating every record.
- `disambiguation.yaml`: import from the `*.dgrammar.txt` file(s) per language, e.g.
  `data/archive/exports/afr/44.dgrammar.txt` and `47.dgrammar.txt` for `afr` (issue 13). The
  format is undocumented in `docs/unl-reference/formats/` — flag this gap; a future docs pass
  should add a `disambiguation.md` reference page before this importer is built in earnest.

## Acceptance criteria

- The three worked rules in `docs/unl-reference/formats/transformation-grammar.md` appear, field
  for field, in `data/languages/eng/grammar/analysis.yaml` after import from
  `grammars/eng_unl_tgrammar.txt`.
- The `M2`, `M7` and `M16` paradigms from `docs/unl-reference/formats/inflection.md` appear in
  `data/languages/eng/grammar/inflection.yaml` with `kind: inflection` and the right-hand affixation
  string preserved verbatim (`0>"s"`, `"man":"men"`, `0>"ed"`). `data/languages/afr/grammar/
  inflection.yaml` holds the equivalent paradigms parsed from
  `data/archive/exports/afr/export_grammar.php__type_M_lang_af`.
- `Y38`, `Y42` and `Y259` from `docs/unl-reference/formats/subcategorisation.md` appear in
  `data/languages/eng/grammar/subcategorisation.yaml` with `kind: subcategorisation`.
- Every record validates against `tools/validate/schema/grammar-rule.schema.json`;
  `pytest tools/importer/test_grammar.py -k schema` checks both languages.
- `data/languages/afr/grammar/disambiguation.yaml` holds records parsed from
  `44.dgrammar.txt` and `47.dgrammar.txt`. `data/languages/eng/grammar/disambiguation.yaml` holds
  the equivalent English `*.dgrammar.txt` export(s), or is empty with an `archive: none for eng`
  comment if none exist for `eng` — check `data/archive/manifest.jsonl` at import time.
- A rule the parser cannot match `transformation-grammar.md`'s grammar for goes to
  `data/languages/<iso3>/_unparsed.txt`, never dropped; a count check as in issue 14.

## Not in scope

Dictionary, tagset and corpus importers (issues 14, 16). Writing new disambiguation rules — there
is nothing to import.

## Done when

- [x] `tools/importer/grammar.py` runs on every file named above for `afr` and `eng`.
- [x] Five grammar files per language exist; `afr`'s `disambiguation.yaml` holds records from
      `44.dgrammar.txt`/`47.dgrammar.txt`, `eng`'s is empty with its `archive: none for eng` comment
      (no `*.dgrammar.txt` export exists for `eng` in the manifest).
- [x] `pytest tools/importer/test_grammar.py` passes, including the unparsed-line count check.
