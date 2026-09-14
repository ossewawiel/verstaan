---
issue: 12
title: "Write the M2 issue files from the inventory, gate and merge M1"
milestone: M1
status: done
depends_on: [11]
agent: docs-writer
agents: [docs-writer, verifier]
model: sonnet
effort: low
checkpoint: 4
commit: 8156c23329bbe37a6c8099028e0d1de467aa1d09
worktree: null
github_issue: 12
---
## What

Using `PLAN.md` §7 and the inventory, write issues 13 to 18 for M2 in the shape of these files:
the canonical data model as a schema, the dictionary importer, the grammar importer, the tagset
and corpus importers, the validator, and the M2 close-out. Then `/factory-retro`, `/gate`, the
verifier, and merge `m1-mirror`.

## Acceptance criteria

- Each M2 issue has acceptance criteria a test can check and names the export files it parses.
- The data-model issue lists every field in `SPEC.md` §3.2 and §3.3 and marks any the inventory
  shows the archive does not have.
- `/gate` passes with the stamp; verifier report attached under `## Verifier`.
- The merge runs from the `m1-mirror` worktree, and once it lands, that worktree is removed from
  the root tree: `git worktree remove .worktrees/m1-mirror && git branch -d m1-mirror`.

## Not in scope

Starting any M2 issue.

## Done when

- [x] Six new issue files, `STATE.md` shows #13 as next.
- [ ] `main` contains the M1 merge.
- [ ] `.worktrees/m1-mirror` removed and the branch deleted after the merge.

## Verifier

One adversarial pass over `git diff main...HEAD` (the whole M1 milestone), before the fixes below:
13 findings, 2 critical, 3 high, 5 medium/low, 2 informational note-only. All were real, none were
false positives. Fixed before merge:

- Issues 13 and 15 claimed the archive has no disambiguation export; it has 42 `*.dgrammar.txt`
  files. Both issues now point the importer at them instead of writing an empty file.
- Issue 14 pointed the English dictionary importer at a 954-entry closed-class page
  (`export_cc.php`), not a real dictionary export. Fixed to a real AD/GD zip pair, with a note that
  the exact filename must be re-checked at M2 start since this worktree's copies were stale.
- Issue 15 asked the importer to guess a direction for `44.tgrammar.txt`, which is unparseable
  scratch content, not a grammar; `47.tgrammar.txt` is the one real, self-labelled file. Fixed.
- Issue 16 undercounted the undocumented tags (four, not eight) and wrongly called the `aa1`
  corpus project English-only (it covers 35 languages, just not Afrikaans). Fixed.
- `docs/unl-reference/formats/tagset.md` undercounted the archive's tagset (365 vs. the real 501)
  and overclaimed an exhaustive audit. `default-grammar.md` misquoted a worked rule (two negated
  conditions silently dropped) and misattributed another to the wrong file.
  `inflection.md` falsely claimed Afrikaans and English share paradigm `M16`'s meaning.
  `open-questions.md` was missing a real relation-version gap (`plf`/`plt` in the 2010 comparison
  table, absent from the mirrored relations page). All fixed.
- `tools/mirror/inventory.py`'s `render_markdown` hardcoded prose independent of its own data
  (an invented narrative about who changed a grammar export, a superlative claim, a fixed
  reference-set name list); two mutations (`max`→`min`, and the "not present" branch) survived the
  full test suite untested. Fixed: the three hardcoded sections are now computed from `rows`, and
  two new tests catch both mutations. Also caught and fixed during my own follow-up check: the
  reference-set bullet list was capped at six languages while the summary sentence listed all
  seven — same data, two different slices; both now use the full list.
- The worktree's `data/archive/` predated `main`'s later drain-chain issues (117-163), so the
  inventory report covered 5 languages instead of 47. Synced from `main` (data only, no code
  conflict) and regenerated.

Not fixed, left as informational notes for a human:
- `tools/schema/` as a new tool-package name doesn't fit `tools/CLAUDE.md`'s canonical four
  (`mirror`, `importer`, `compiler`, `validate`) — flagged in issue 13 for the owner, needs an ADR
  or a rename.
- Mirrored archive files (`44.dgrammar.txt`, `47.tgrammar.txt`) carry contributor names in their
  header comments, from `main` (issue 08), outside this diff. Worth a deliberate decision before
  M2 copies those bytes into `data/languages/`, but not this issue's fix to make.

Every fix was independently re-verified against the real archive files, not just re-run: `pytest
tools/mirror/` (96→96 passed, 2 new), `python -m tools.validate --all` (exit 0), full `/gate`
re-run clean after the fixes.
