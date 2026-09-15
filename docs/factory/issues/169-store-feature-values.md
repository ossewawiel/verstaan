---
issue: 169
title: "The afr and eng stores disagree with their tagset: 49,000 feature values, three causes"
milestone: Side
status: open
depends_on: [14, 17, 168]
agent: implementer
agents: [implementer, test-writer]
model: sonnet
effort: high
checkpoint: null
commit: null
worktree: null
github_issue: null
---
## What

`python -m tools.validate --all` reports about 49,000 errors across the `afr` and `eng` stores,
all of one shape: `feature value SEM='ATT' is not in tagset.yaml`. Quest #168 takes this off the
merge path, so it blocks nothing. It is still wrong, and the data is a deliverable.

The check is not at fault. Issue 17 built it deliberately and proved it with two broken-store
fixtures: `POS=NOUN` must fail because the real tagset says `POS=NOU`. Three separate causes sit
behind the one message. Counts are from the full sweep on `dd2bdea`, over 3,968 distinct
attribute-value pairs.

**One, the importer splits a feature string wrong.** 4,269 errors name an attribute of `#01` or
`#02`, with values like `#02=BF=up`, `#02=BF=out`, `#02=BF=off`. `BF` is already in
`REFERENCE_VALUED_ATTRIBUTES` at `tools/validate/store.py` line 92, so a correctly parsed `BF=up`
is skipped and never reported at all. These arrive as attribute `#02` holding the text `BF=up`,
which is a parse defect in the dictionary importer. The same family puts headword text in the
attribute slot: `bok`, `België`, `Iowa` and `Louisiana` each appear as a feature attribute.

**Two, the mirrored tagset is missing rows the export uses.** `SEM=ATT` (15,940), `SEM=SOV`
(13,214), `SEM=REL` (2,150), `SEM=JJJ` and `PER=3PE` are mnemonics the imported dictionaries
carry. `data/languages/eng/tagset.yaml` line 3370 defines `SEM` as a tag with a description and
four examples, and no value rows. Either the tagset export is incomplete or the importer reads
the wrong column. `docs/unl-reference/formats/tagset.md` already records that the export adds
tags the wiki tree does not define, and its `SEM=REL` versus `SEM=RLT` note is the thread to pull.

**Three, `GOV` holds a pattern, not a mnemonic.** `GOV=VC(FPR)` and `GOV=VC(PP([with]));` are
government patterns. They belong beside `LEMMA` and `BF` on the skip list, or the check must
learn their shape.

After this quest, `python -m tools.validate --all` exits 0 on both stores, and each cause is
fixed where it belongs — the importer, the data, or the skip list. Never by loosening a check.

## Acceptance criteria

- `python -m tools.validate --all` exits 0 from a clean checkout.
- Re-running the dictionary importer over the same archive source produces no feature attribute
  matching `#\d+`, and no attribute that is a headword.
- Every tagset value the stores use resolves to a row in `tagset.yaml`, and each added row carries
  its `source: {archive_path, line}` the way existing rows do.
- `check_feature_values` still fails on the `POS=NOUN` and `SEM=REL` fixtures in
  `tools/validate/test_validate.py`. Neither fixture is deleted or weakened.
- A test covers the split-feature shape: a feature string that used to yield attribute `#02`,
  value `BF=up`, now yields attribute `BF`, value `up`.

## Not in scope

- The gate. Quest #168 already settled that archive data is not a merge blocker; this quest adds
  no data check to any workflow.
- The 431 and 442 uncovered rules reported as warnings. They are warnings at M2 by design.
- The 326 UW errors (`uw ... is not digits-only or empty`) reported alongside these. If they share
  a root cause with cause one, say so and write them their own quest rather than widening this one.
- Any language beyond `afr` and `eng`. No other store is tracked.

## Done when

- [ ] The dictionary importer parses multi-part feature strings correctly, and a re-import leaves
      no `#01`/`#02` attribute and no headword-as-attribute.
- [ ] The missing tagset rows are present in `data/languages/*/tagset.yaml`, each with its source.
- [ ] `GOV` is resolved: on the skip list with a one-line reason, or checked by shape.
- [ ] `tools/validate/test_validate.py` keeps both broken-store fixtures and gains a test for the
      split-feature shape.
- [ ] `docs/unl-reference/formats/tagset.md` records what the export defines that the wiki tree
      does not, updated from what this quest found.
- [ ] `python -m tools.validate --all` exits 0.
