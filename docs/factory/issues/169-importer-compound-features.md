---
issue: 169
title: "The dictionary importer splits compound feature strings wrong: 4,269 bogus attributes"
milestone: Side
status: done
depends_on: [14, 17, 168]
agent: implementer
agents: [implementer, test-writer]
model: sonnet
effort: medium
checkpoint: null
commit: c927186
worktree: null
github_issue: 241
---
## What

`python -m tools.validate --all` reports about 49,000 feature-value errors across the `afr` and
`eng` stores. Quest #168 took that sweep off the merge path, so it blocks nothing. The errors are
still real and the data is a deliverable.

This quest owns one of the two causes: **the dictionary importer splits a feature string wrong.**
4,269 errors name an attribute of `#01` or `#02`, with values like `#02=BF=up`, `#02=BF=out`,
`#02=BF=off`. The proof that this is a parse defect and not a missing tag: `BF` is already in
`REFERENCE_VALUED_ATTRIBUTES` at `tools/validate/store.py` line 92, so a correctly parsed `BF=up`
is skipped and never reported at all. These arrive as attribute `#02` holding the text `BF=up`.
The same family puts headword text in the attribute slot: `bok`, `België`, `Iowa` and `Louisiana`
each appear as a feature attribute. A third, smaller group belongs here too: `GOV=VC(FPR)` and
`GOV=VC(PP([with]));` are government patterns, not tagset mnemonics, and belong beside `LEMMA`
and `BF` on the skip list, or the check must learn their shape.

**What this quest does not own, and an earlier version of it got wrong.** The `SEM=ATT` (15,940),
`SEM=SOV` (13,214) and `SEM=REL` (2,150) errors are quest #167's, written by the session closing
issue #18. This file first claimed the mirrored `tagset.yaml` was missing rows the export uses —
that the tagset import was incomplete. That is false. `grep -oE '\b(ATT|SOV|RLT|ATR)\b'
data/archive/exports/export_tagset.php` returns `ATR` and `RLT` and nothing else: `ATT` and `SOV`
appear nowhere in the live export. The tagset mirror is faithful. The dictionaries are the stale
half — archive vintage drift, dictionary exports carrying semantic codes a decade older than the
tagset export that renamed or retired them. Do not "fix" that here by adding rows to
`tagset.yaml`; it would corrupt a faithful mirror of the archive.

Because the gate validates a touched store whole (#168, ADR 0013), a branch that edits
`data/languages/eng/` must leave the `eng` store fully valid. This quest and #167 therefore cannot
each land half of `eng`. Whichever runs second lands the store green; the first may need to wait,
or the two run as one branch.

## Acceptance criteria

- Re-running the dictionary importer over the same archive source produces no feature attribute
  matching `#\d+`, and no attribute that is a headword.
- `GOV` is resolved: on the skip list with a one-line reason, or checked by shape.
- No row is added to any `data/languages/*/tagset.yaml` by this quest. The tagset mirrors the
  archive export and stays faithful to it.
- `check_feature_values` still fails on the `POS=NOUN` and `SEM=REL` fixtures in
  `tools/validate/test_validate.py`. Neither fixture is deleted or weakened.
- A test covers the split-feature shape: a feature string that used to yield attribute `#02`,
  value `BF=up`, now yields attribute `BF`, value `up`.
- `python -m tools.validate --lang eng` and `--lang afr` report no feature-value error from this
  quest's family. The `SEM` family may remain until #167 lands.

## Not in scope

- The `SEM=ATT`/`SOV`/`REL` archive vintage drift. That is quest #167.
- The gate. Quest #168 settled that archive data is not a merge blocker; this quest adds no data
  check to any workflow.
- The 431 and 442 uncovered rules reported as warnings. They are warnings at M2 by design.
- The 326 UW errors (`uw ... is not digits-only or empty`). If they share a root cause with the
  parse defect, say so and write them their own quest rather than widening this one.
- Any language beyond `afr` and `eng`. No other store is tracked.

## Done when

- [x] The dictionary importer parses multi-part feature strings correctly, and a re-import leaves
      no `#01`/`#02` attribute and no headword-as-attribute.
- [x] `GOV` is resolved: on the skip list with a one-line reason, or checked by shape.
- [x] No `tagset.yaml` row is added or edited.
- [x] `tools/validate/test_validate.py` keeps both broken-store fixtures and gains a test for the
      split-feature shape.
- [x] `docs/unl-reference/formats/dictionary.md` records the compound feature-list shape the
      importer now handles, with one real example.
- [x] The gate passes on the branch.
