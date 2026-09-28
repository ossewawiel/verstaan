---
issue: 184
title: "Import the closed-class words the archive exports without a UW"
milestone: M3
status: in-progress
depends_on: [14]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: .worktrees/m3-184-import-closed-class-words
github_issue: 285
---
## What

The English store has no entry for `the`, `of`, `on`, `and` or `without`. The Afrikaans store has
no entry for `die` or `'n`. The UNLarium exports hold these words with an empty UW field, because a
function word carries grammar, not a concept. The dictionary importer (issue 14) requires a UW of
at least one character. It sends each such entry to `_unparsed.txt`: 1639 lines for `eng` and 1658
for `afr`. Issue 24's test-case table named this gap and said it needed its own issue
(`24-test-cases.md` lines 145-156). Issue 14 left the closed-class export, `export_cc.php`, out of
scope (`14-dictionary-importer.md` line 37). The mirror holds that export for both languages.

Every row of the fixed sentence set contains at least one of these words. `eng-ana-12` folds `the`
into `@def` on the next noun, but the lookup finds no `the` to fold. After this quest, both stores
hold their closed-class words as dictionary records with their features and no UW. The importer
reads the empty-UW entries from the dictionary exports and the entries in `export_cc.php`.

## Acceptance criteria

- `data/languages/eng/dictionary/` holds `the`, `a`, `of`, `on`, `and` and `without`, each with
  its archive features (for example `LEX: D` on `the`) and `source` provenance.
- `data/languages/afr/dictionary/` holds `die`, `'n` and `en` the same way.
- The schema under `tools/validate/schema/` accepts a dictionary record with no UW only when its
  features mark it closed-class. A content word with no UW is still an error.
- `SPEC.md` §3.2 states the rule in one line: an entry with an empty UW is a closed-class record,
  not an unparsed line.
- The `empty UW field` lines are gone from both `_unparsed.txt` files. Every other line stays.
- `tools/importer/test_dictionary.py` covers an empty-UW entry and an `export_cc.php` entry from
  fixture-sized copies under `tests/fixtures/archive/`, per SPEC §3.2.
- `python -m tools.validate --changed --base origin/main` exits 0.

## Not in scope

How the engine uses a record with no UW. Issue 180 (analysis) and issue 181 (generation) consume
these records. Closed-class words for any language other than `eng` and `afr`. The feature-value
mismatches issue 169 fixed.

## Done when

- [x] Both stores hold their closed-class words with features and provenance.
- [x] The schema accepts a UW-less record only when it is closed-class.
- [x] Neither `_unparsed.txt` has an `empty UW field` line.
- [x] Importer tests cover both sources.
- [x] `SPEC.md` §3.2 states the rule.
