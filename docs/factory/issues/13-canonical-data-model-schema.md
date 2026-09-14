---
issue: 13
title: "Write the canonical data model as a schema"
milestone: M2
status: done
depends_on: [12]
agent: implementer
agents: [implementer, docs-writer]
model: sonnet
effort: medium
checkpoint: null
commit: 70093b7
worktree: null
github_issue: 222
---
## What

Write the schema every M2 importer and the validator (`tools/validate`) read: a JSON Schema file
per record type under `tools/schema/`, plus `docs/factory/store-schema.md` describing each field
in prose. The schema names every field `SPEC.md` §3.2 and §3.3 list for a dictionary entry, a
grammar rule and a store file, and nothing else. Where `docs/architecture/archive-inventory.md`
shows the archive has no data behind a field for `afr` or `eng`, the schema keeps the field
(SPEC.md still requires it) but `store-schema.md` marks it `archive: none (afr, eng)` with the
reason, so issues 14 to 17 do not silently invent data to fill it.

Fields to mark, found while writing this issue:

- `grammar/disambiguation.yaml`: the archive DOES have per-language disambiguation exports.
  `data/archive/manifest.jsonl` lists 42 `dgrammar` files, including
  `data/archive/exports/afr/44.dgrammar.txt` and `47.dgrammar.txt`, real D-rules with comments
  (e.g. `(D,^AFT)({PUT,^BLK|STAIL})=0; determiners may not come at the end of the sentence`). A
  wiki page describes the format: `data/archive/wiki/English_Disambiguation_Grammar.wikitext`.
  Mark `disambiguation.yaml` `archive: present, format undocumented in
  docs/unl-reference/formats/ (gap — no disambiguation.md page exists yet)`. Issue 15 (the
  grammar importer) should import from these `*.dgrammar.txt` files, not skip them.
- Dictionary `lang` field: the archive's real `FLG` value is two letters (`af`, `en`), not the
  three-letter ISO 639-3 the wiki's formal syntax promises
  (`docs/unl-reference/formats/dictionary.md`, "Where the exports disagree with the wiki"). Mark
  `lang` `archive: two-letter, importer translates to iso3`.
- `meta.yaml` `counts`: the archive serves no single count-per-store-type endpoint; `languages.json`
  (issue 11) gives base forms, word forms, paradigms and frames read from the language table, not
  a count of records the importer actually wrote. Mark `counts` `archive: none, computed by the
  importer after import, not mirrored`.
- Grammar rule `conditions`: the archive's own rule syntax
  (`docs/unl-reference/formats/transformation-grammar.md`) embeds every condition — negation `^`,
  disjunction `{a|b}` — inside the left-hand `<NODE>` list; it never separates "the pattern" from
  "the conditions on the pattern" as two fields. Mark `conditions` `archive: embedded in lhs,
  importer must split` and flag for a rule-author: split by node-level negation/disjunction only,
  or keep `conditions` empty and leave everything in `lhs`. Open question, not decided here.
- `tools/schema/` as a package name: `tools/CLAUDE.md` names four canonical tool packages —
  `mirror`, `importer`, `compiler`, `validate`. `tools/schema/` is a fifth name and does not fit
  that list. This needs either an ADR admitting a fifth package, or a rename to fit an existing
  one (e.g. `tools/validate/schema/`). Flagged for the owner, not decided here.

## Acceptance criteria

- `tools/schema/dictionary-entry.schema.json` validates the three worked Afrikaans lines and the
  three worked English lines from `docs/unl-reference/formats/dictionary.md`, hand-converted to the
  YAML shape `SPEC.md` §3.2 gives, with `jsonschema` (`pip install jsonschema`) run as a doctest.
- `tools/schema/grammar-rule.schema.json` validates the three worked rules from
  `docs/unl-reference/formats/transformation-grammar.md`, hand-converted the same way, for one
  `kind` each: `analysis`, `inflection` (the `M2` example from `inflection.md`), `subcategorisation`
  (the `Y38` example from `subcategorisation.md`).
- `tools/schema/store-layout.schema.json` lists every file `SPEC.md` §3.3's tree names, including
  `grammar/disambiguation.yaml`, `tagset.yaml`, `corpus/<name>.yaml`, `tests/<name>.yaml` and
  `meta.yaml`, each with its required top-level keys.
- `docs/factory/store-schema.md` has one row per field with `archive:` status for `afr` and `eng`;
  every `none` row cites the manifest search or reference page that found the gap.
- `pytest tools/schema/test_schema.py` runs the three validations above and fails loudly if a
  hand-converted example is missing a required key.

## Not in scope

Writing the importers (issues 14 to 16). Deciding the `conditions`/`lhs` split — flagged for a
rule-author, not resolved here.

## Done when

- [x] Three schema files exist under `tools/schema/` and validate the worked examples above.
- [x] `docs/factory/store-schema.md` exists with every field marked, `none` rows cited.
- [x] `pytest tools/schema/test_schema.py` passes.
