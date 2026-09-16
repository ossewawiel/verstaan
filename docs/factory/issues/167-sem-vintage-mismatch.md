---
issue: 167
title: "Resolve the SEM=ATT/SOV/REL archive vintage mismatch"
milestone: Side
status: done
depends_on: [14, 17]
agent: rule-author
agents: [rule-author, implementer]
model: sonnet
effort: medium
checkpoint: null
commit: 3aca3a1
worktree: null
github_issue: 239
---
## What

`python -m tools.validate --all` exits 1 (issue 18's close-out found this, 2026-09-15). After the
UW-check fix (issue 18, same pass) the remaining failures are `feature-value` errors: 1234 in
`afr`, 47679 in `eng`, 48913 lines total. This issue tracks only the largest, cleanest slice of
that total: `SEM=ATT` (15940 occurrences across both dictionaries), `SEM=SOV` (13214) and
`SEM=REL` (2150) — 31304 of the 48913, values `data/languages/<iso3>/tagset.yaml` does not list.
The remaining 17609 are a *different* bug (the importer mis-parsing compound multiword feature
lists, plus three small unrelated tagset gaps), tracked as issue 169.

This is not an importer bug and not a `tagset.yaml` bug. `tagset.yaml` faithfully mirrors the
live archive tagset export (`data/archive/exports/export_tagset.php`, "Version of September 11,
2026" — current); confirmed by direct check, `ATT` and `SOV` do not appear in that export at all,
and `REL` doesn't either (`RLT` is the live export's code for that concept, already documented in
`docs/unl-reference/formats/tagset.md`, "Where the export adds tags"). The dictionary exports
that use `SEM=ATT`/`SOV`/`REL`, though, are dated February 2016 in their own header — ten years
older than the tagset export. The archive itself has drifted: dictionary entries still carry
semantic-class codes a decade-old tagset export has since renamed or dropped, and nothing in
the mirror or the importer can detect or fix that drift on its own.

`REL` → `RLT` is a known 1:1 rename (`tagset.md` already documents it). `ATT` has no confirmed
replacement — `ATR` ("attribute — nouns denoting attributes of people and objects") is the
closest candidate by name and definition, but this needs a rule-author's judgment against real
entries (`aandag` 'attention', `Albedo`, `aanspraak` 'claim' among the 1234+47679 flagged), not an
automatic string swap. `SOV` has no obvious replacement candidate in the current 513-tag export at
all — this may be a genuinely retired category with no direct successor, in which case the
resolution is deciding what these ~13000+ entries' `SEM` should become, not finding a code that
already exists.

**Landing alongside issue 169.** Because the gate validates a touched store whole (#168,
ADR 0013), a branch that edits `data/languages/eng/` must leave the `eng` store fully valid.
Issue 169's own text flagged that this issue and #169 cannot each land half of `eng`; the two run
as one branch, in the same worktree, `side-169-importer-compound-features`.

## Acceptance criteria

- For each of `ATT`, `SOV`, `REL`, one of: a documented 1:1 mapping to a current tagset code (add
  it to `docs/unl-reference/formats/tagset.md`'s "Where the export adds tags" section, alongside
  the existing `RLT` entry), or a documented decision that no mapping exists and the importer
  should mark these entries some other way (e.g. a `SEM` value reserved for "archived, no current
  tagset equivalent" — needs its own tagset.yaml entry if so, added deliberately, not silently).
- `tools/importer/dictionary.py` applies whatever mapping this issue decides, and re-running the
  importer against `data/archive/` reproduces the fix (`tools/importer/test_dictionary.py` gets a
  fixture case for at least one of the three codes).
- `python -m tools.validate --all`'s `feature-value` counts drop by exactly 31304 (15940 + 13214 +
  2150) once this lands — not necessarily to 0; issue 169's 17609 is separate and lands in the
  same branch.

## Not in scope

- The `#01`/`#02` compound-feature parse defect, the headword-as-attribute defect and `GOV`. Those
  are issue 169's, landing in the same branch but as their own commit.
- Any language beyond `afr` and `eng`. No other store is tracked.

## Done when

- [x] `ATT`, `SOV` and `REL` are each resolved: a documented 1:1 mapping applied by the importer,
      or a documented deliberate replacement value with its own tagset.yaml entry.
- [x] `docs/unl-reference/formats/tagset.md` records the decision for each of the three codes.
- [x] `tools/importer/test_dictionary.py` gains a fixture case for at least one of the three codes.
- [x] A re-import of `afr` and `eng` drops the `feature-value` error count by exactly 31304.
- [x] The gate passes on the branch, with `eng` and `afr` both fully valid.
