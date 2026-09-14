---
issue: 14
title: "Build the dictionary importer"
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

`tools/importer/dictionary.py` reads a language's Analysis Dictionary (AD) and Generation
Dictionary (GD) exports and writes `data/languages/<iso3>/dictionary/<a-z>.yaml`, one file per
first letter of `headword` per `tools/schema/dictionary-entry.schema.json` (issue 13). It parses
the line grammar `docs/unl-reference/formats/dictionary.md` documents, against the real files, not
the wiki's formal syntax where the two disagree.

For `afr`: `data/archive/exports/afr/af_ana_u_c_ucn.zip` (analysis, unabridged, common, UCN
encoding, the largest Afrikaans dictionary export the mirror has drained, 18,547 lines) and
`data/archive/exports/afr/af_gen_u_c_ucn.zip` (generation, matching encoding).

For `eng`: an AD/GD zip pair under `data/archive/exports/eng/` (`en_ana_*.zip` /
`en_gen_*.zip` variants), the largest non-empty pair by encoding and abridgement, the same shape
as the `afr` pair above (`en_ana_u_c_ucl.zip` reports 387,134 lines in
`docs/architecture/archive-inventory.md` at the time this issue was written). In this worktree the
`en_gen_*.zip` files are currently 0 bytes — the milestone branch predates the drain-chain's later
work on `main`. The M2 implementer must run `python -m tools.mirror inventory` when they start
work and pick the largest non-empty AD/GD zip pair for `eng` at that time, rather than trusting the
filename hardcoded here. `data/archive/exports/eng/export_cc.php` is the English Closed-Class
Dictionary, a small HTML page (19 lines, 954 entries: prepositions, articles, auxiliaries) — it is
out of scope for this issue. A closed-class supplement importer could be a follow-up issue.

Every line becomes one entry: `headword` from `NLW`, `id` from `ID`, `uw` from the `UW` field kept
as the opaque UCN string it is (never resolved to UCL here, per `dictionary.md`'s "Where the
export disagrees" section), `features` as the attribute-value map, `lang` translated from the
export's two-letter `FLG` to the store's three-letter `iso3` (`af` → `afr`, `en` → `eng`),
`frequency` from `FRE`, `priority` from `PRI`, `source: {archive_path, line}` pointing at the exact
zip member or file and 1-based line number the entry came from.

## Acceptance criteria

- Running the importer on `af_ana_u_c_ucn.zip` produces `data/languages/afr/dictionary/a.yaml`
  containing an entry for `aan` matching the worked example in `dictionary.md` field for field
  (`id: 22319`, `uw: "400068368"`, `features.LEX: A`, `lang: afr`, `frequency: 2`, `priority: 0`).
- The English run produces an entry for `aboard` (`id: 516110`, `uw: "534001"`, `lang: eng`)
  matching `dictionary.md`'s English worked example.
- Every entry validates against `tools/schema/dictionary-entry.schema.json` (issue 13);
  `pytest tools/importer/test_dictionary.py -k schema` checks this on both languages' output.
- A line the parser cannot match the grammar for is appended to
  `data/languages/<iso3>/_unparsed.txt` with the raw line and a one-sentence reason. Zero entries
  silently dropped: `len(input_lines) == len(parsed_entries) + len(unparsed_lines)` for both `afr`
  and `eng`, checked by a test that counts both.
- `data/languages/afr/dictionary/*.yaml` and `data/languages/eng/dictionary/*.yaml` each start with
  the licence header `SPEC.md` §4 requires.
- Compound `NLW` entries (`[[a][b]]`) and `#01(...)` sub-word feature scoping parse without error;
  a fixture file with one of each, hand-built from `dictionary.md`'s formal syntax, proves it.

## Not in scope

Grammar, tagset and corpus importers (issues 15, 16). Resolving a UW to its UCL string — the store
keeps the UCN, per ADR-worthy note in issue 13.

## Done when

- [ ] `tools/importer/dictionary.py` runs on both `afr` and `eng` exports named above.
- [ ] `data/languages/afr/dictionary/` and `data/languages/eng/dictionary/` exist, sharded a-z.
- [ ] `pytest tools/importer/test_dictionary.py` passes, including the unparsed-line count check.
