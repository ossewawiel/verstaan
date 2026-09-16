---
issue: 171
title: "Resolve the remaining afr/eng vintage-drift and parse-artifact feature errors"
milestone: Side
status: done
depends_on: [14, 17, 167, 169]
agent: rule-author
agents: [rule-author, implementer]
model: sonnet
effort: small
checkpoint: null
commit: 3aca3a1
worktree: null
github_issue: null
---
## What

Issues #167 and #169 together were expected to leave `eng` and `afr` fully valid (SPEC.md §3.3,
"every rule has at least one test sentence"; ADR 0013, "the gate validates a touched store
whole"). After both landed, `python -m tools.validate --lang eng` and `--lang afr` still report a
small residual: 168 in `eng`, 36 in `afr`, all distinct from either issue's family. Because this
branch already touches both stores, the whole-store gate check blocks merge on these too, same
reasoning as #167.

Six categories, all found by running the validator after #167 and #169 landed:

- `SEM=JJJ` — 62 `eng` + 34 `afr` entries, all adjectives (`able`, `certain`, `chief`, `former`,
  `hard`, `seker` 'certain', `eerste` 'first').
- `SEM=AAA` — 6 `eng` entries, all adverbs (`just`, `merely`, `only`).
- `PER=3PE` — 80 `eng` entries: possessives and relative pronouns (`his`, `hers`, `their`,
  `theirs`, `who`, `which`, `that`).
- `PER=2PE` — 20 `eng` entries, all `you`.
- `feature attribute '00'` — 14 `eng` entries (`one`, `that`, `whatever`, `which`, `who`,
  `whoever`, `whomever`), each with a bare `00` token in the feature list, e.g.
  `(...,FRA=Y0,00)`. Not a tagset mnemonic in any vintage; may be a parse artifact rather than
  drift — investigate before assuming it is the same kind of fix as the other five.
- `POS=CCJ` — 2 rules in `afr/grammar/generation.yaml` (rules 33, 34). Grammar, not dictionary;
  a different file shape from the other five.

## Acceptance criteria

- Each of `SEM=JJJ`, `SEM=AAA`, `PER=3PE`, `PER=2PE`, `POS=CCJ` is resolved the same way #167
  resolved `ATT`/`SOV`/`REL`: a documented 1:1 mapping to a current tagset code in
  `docs/unl-reference/formats/tagset.md`, "Where the export adds tags", or a documented decision
  that none exists and a new tagset.yaml entry is needed, added deliberately.
- The `00` bare-tag case is investigated on its own terms — it may not be vintage drift at all
  (no `SEM=`/`PER=`/`POS=` prefix, just a bare numeral). Document what it actually is (check the
  raw archive line, e.g. `data/archive/exports/eng/en_ana_u_c_ucl.zip`, entry `one`, id 531286)
  before deciding whether to skip-list it, map it, or drop it, and say why in the same doc.
- `tools/importer/dictionary.py` (or `tools/importer/grammar.py` for the `POS=CCJ` case — check
  which importer produces `grammar/generation.yaml`) applies whatever each decision is.
- `python -m tools.validate --lang eng` and `--lang afr` report zero feature-value errors after
  this lands. Combined with #167 and #169, this closes out the `--all` sweep issue 18 opened.
- `tools/importer/test_dictionary.py` (and/or the grammar importer's test file) gains a fixture
  case for at least the `SEM=JJJ` and the `00` shapes, the two largest/most novel.

## Not in scope

- Anything #167 or #169 already resolved.
- Any language beyond `afr` and `eng`.
- The 431/442 uncovered-rule warnings and the corrupted `ATR` tagset.yaml description #167's
  rule-author flagged as a side finding — that is its own issue.

## Done when

- [x] `SEM=JJJ`, `SEM=AAA`, `PER=3PE`, `PER=2PE`, `POS=CCJ` are each resolved and documented in
      `docs/unl-reference/formats/tagset.md`.
- [x] The `00` bare-tag case is investigated and resolved, documented separately from the vintage
      codes since it may not be one.
- [x] `python -m tools.validate --lang eng` and `--lang afr` report zero feature-value errors.
- [x] A test fixture covers at least `SEM=JJJ` and the `00` case.
- [x] The gate passes on the branch, with `eng` and `afr` both fully valid.
