---
issue: 16
title: "Build the tagset and corpus importers"
milestone: M2
status: open
depends_on: [13]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: null
github_issue: null
---
## What

`tools/importer/tagset.py` reads `data/archive/exports/export_tagset.php` (one global export,
shared by every language) and writes `data/languages/<iso3>/tagset.yaml`: one entry per tag with
its category, its parent attribute if any, and its meaning, per
`docs/unl-reference/formats/tagset.md`. The same parsed table is written once per language store,
not once for the whole archive, so each language's `tagset.yaml` is self-contained per `SPEC.md`
§3.3's tree. Include the eight undocumented tags `tagset.md` names (`FOR`, `NEO`, `LOA`, `TXTA`,
`NOUA`, `X`, `XXX`, and `RLT` in place of the wiki's `REL`) — the export is authoritative, not the
wiki, per that page's own finding.

`tools/importer/corpus.py` reads a project's parallel corpus export and writes
`data/languages/<iso3>/corpus/<project>.yaml`, one entry per sentence: `{sentence, unl, source}`.
For `afr` and `eng`, the `ugoa1` project is the one corpus both languages share:
`data/archive/exports/corpus/ugoa1/export_corpus.php__project_ugoa1_lang_af_unl_ucl` and
`..._lang_en_unl_ucl` (UCL encoding, human-readable UNL, preferred over the `_unl_0` and `_unl_ucn`
siblings so a rule-author can read the `unl` field directly without a UW lookup).

## Acceptance criteria

- `data/languages/afr/tagset.yaml` and `data/languages/eng/tagset.yaml` each list `RLT`, `FOR`,
  `NEO`, `LOA`, `TXTA`, `NOUA`, `X` and `XXX` with the meaning `tagset.md` gives each.
- `data/languages/afr/tagset.yaml` and `data/languages/eng/tagset.yaml` are identical in content
  (same global export); a test diffs them and asserts equality, documenting that the tagset is
  archive-wide, not per-language, contra the per-language file `SPEC.md` §3.3 lays out.
- `data/languages/afr/corpus/ugoa1.yaml` and `data/languages/eng/corpus/ugoa1.yaml` each have the
  same sentence count, read from `export_corpus.php__project_ugoa1_lang_af_unl_ucl` and
  `..._lang_en_unl_ucl` respectively; a test asserts `len(afr_corpus) == len(eng_corpus)` as the
  parallel-corpus check.
- Every tagset entry validates against a `tools/schema/tagset-entry.schema.json` added alongside
  issue 13's other schema files (or added here if issue 13 did not anticipate it — note the gap in
  this issue's `## Verifier` section if so).
- Every corpus entry's `source` names the project and the 1-based line number it came from.
- A corpus line whose `unl` field will not parse as a UNL graph (checked with a permissive
  brace-balance check only, not a full UNL parser — that is M3's job) goes to `_unparsed.txt`.

## Not in scope

Dictionary and grammar importers (issues 14, 15). Any corpus project other than `ugoa1` for `afr`
and `eng` — `ugoa1` is the only project that has both `afr` and `eng`. `aa1` has `eng` but no
`afr` (35 other languages, not Afrikaans), so it's out of scope for the M3 afr/eng reference pair
specifically, not because it's English-only.

## Done when

- [ ] `tools/importer/tagset.py` and `tools/importer/corpus.py` run for `afr` and `eng`.
- [ ] `tagset.yaml` and `corpus/ugoa1.yaml` exist under both language directories.
- [ ] `pytest tools/importer/test_tagset.py tools/importer/test_corpus.py` passes.
