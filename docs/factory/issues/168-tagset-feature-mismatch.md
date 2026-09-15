---
issue: 168
title: "The importer and the tagset disagree: main's gate is red on 49,000 feature values"
milestone: Side
status: open
depends_on: [14, 17]
agent: implementer
agents: [implementer, test-writer]
model: sonnet
effort: high
checkpoint: null
commit: null
worktree: null
github_issue: 240
---
## What

`main` is red. The three build jobs on `dd2bdea` fail, and the last three CI runs on `main` fail
the same way. The failing step is `python -m tools.validate --all`, and it prints about 49,000
errors of one family: `feature value SEM='ATT' is not in tagset.yaml`. Every pull request is
blocked behind this, including a quest file that touches no data. Found on 2026-09-15 while
opening the pull request for quest #167.

The check itself is right. Issue 17 built it on purpose and proved it with fixtures: `POS=NOUN`
must fail because the real tagset says `POS=NOU`. The disagreement is in the data the drain
quests imported, and it has three separate causes, not one.

**One: the importer splits a feature string wrong.** 4,269 errors name an attribute of `#01` or
`#02`, and the commonest values read `#02=BF=up`, `#02=BF=out`, `#02=BF=off`. `BF` is already in
`REFERENCE_VALUED_ATTRIBUTES` in `tools/validate/store.py` line 92, so a correctly parsed `BF=up`
is skipped and never reported. These reach the validator as attribute `#02` with value `BF=up`,
which is a parse defect in the dictionary importer, not a missing tag. The same family puts
headword text where an attribute belongs: `bok`, `België`, `Iowa` and `Louisiana` all appear as
feature attributes.

**Two: the mirrored tagset is missing rows the export uses.** `SEM=ATT` (15,940), `SEM=SOV`
(13,214), `SEM=REL` (2,150), `SEM=JJJ` and `PER=3PE` are real mnemonics in the imported
dictionaries. `data/languages/eng/tagset.yaml` line 3370 defines `SEM` as a tag with four
examples and no value rows at all. Either the tagset export is incomplete or the importer reads
the wrong column; `docs/unl-reference/formats/tagset.md` already records that the export adds
tags the wiki tree does not define, and its `SEM=REL` versus `SEM=RLT` note is the thread to pull.

**Three: `GOV` holds a pattern, not a mnemonic.** `GOV=VC(FPR)` and `GOV=VC(PP([with]));` are
government patterns. They belong with `LEMMA` and `BF` on the skip list, or the check needs to
learn their shape.

After this quest, `python -m tools.validate --all` exits 0 on the `afr` and `eng` stores, and CI
on `main` is green. Each of the three causes is fixed where it belongs: the importer, the data,
or the validator's skip list — never by loosening the check that issue 17 proved.

Effort is `high` rather than the implementer's default: the work spans the importer, the mirrored
tagset and the validator, and it has to tell a parse defect apart from a real missing tag across
3,968 distinct attribute-value pairs before it changes anything.

## Acceptance criteria

- `python -m tools.validate --all` exits 0 from a clean checkout.
- The `gate` workflow is green on `main` after this merges.
- Re-running the dictionary importer over the same archive source produces no feature attribute
  matching `#\d+` and no attribute that is a headword.
- Every tagset value the stores now use resolves to a row in `tagset.yaml`, and each row added
  carries its `source: {archive_path, line}` the way the existing rows do.
- `check_feature_values` still fails on the `POS=NOUN` and `SEM=REL` fixtures in
  `tools/validate/test_validate.py`. Neither fixture is deleted or weakened.
- A test covers the `#02=BF=up` shape: a feature string that the importer used to split wrong now
  parses to attribute `BF`, value `up`.

## Not in scope

- The 431 and 442 uncovered rules the validator reports as warnings. They are a warning at M2 by
  design.
- The 326 UW errors (`uw ... is not digits-only or empty`) reported alongside these. If they turn
  out to share a root cause, say so and write them their own quest.
- Re-importing any language beyond `afr` and `eng`. The other stores are not tracked yet.
- Tagging `m2` or writing the M3 issue files. That is quest #18.

## Done when

- [ ] The dictionary importer parses multi-part feature strings correctly, and no `#01`/`#02`
      attribute or headword-as-attribute survives a re-import.
- [ ] The missing tagset rows are present in `data/languages/*/tagset.yaml`, each with its source.
- [ ] `GOV` is resolved: on the skip list with a one-line reason, or checked by shape.
- [ ] `tools/validate/test_validate.py` keeps both broken-store fixtures and gains a test for the
      split-feature shape.
- [ ] `python -m tools.validate --all` exits 0.
- [ ] `docs/unl-reference/formats/tagset.md` records what the export defines that the wiki tree
      does not, updated from what this quest found.
- [ ] CI on `main` is green.
