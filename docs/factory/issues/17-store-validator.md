---
issue: 17
title: "Build the store validator"
milestone: M2
status: open
depends_on: [14, 15, 16]
agent: implementer
agents: [implementer, test-writer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: null
github_issue: null
---
## What

`tools/validate` (a `python -m tools.validate` CLI, per `SPEC.md` §5's gate table) checks a
language store against `tools/schema/` (issue 13) and against the store's own cross-references,
per `SPEC.md` §3.3's validate bullet: schema, feature values against `tagset.yaml`, UW references
resolve, every rule has at least one test sentence. Warning, not error, at M2; `SPEC.md` says this
tier of check becomes an error only from M3.

Four checks, each a separate function so a failing one names itself in the report:

- **Schema.** Every YAML record in `dictionary/`, `grammar/`, `corpus/` and `tagset.yaml` matches
  its `tools/schema/*.schema.json` file.
- **Feature values.** Every value in a dictionary entry's `features` map (e.g. `POS=NOU`) or a
  grammar rule's `lhs`/`rhs` that names an attribute-value pair resolves to a row in that
  language's `tagset.yaml`. A value like `SEM=REL` (the wiki's spelling, not the export's `RLT`,
  per `tagset.md`) must fail this check, proving it catches the exact disagreement that page found.
- **UW references resolve.** Every dictionary entry's `uw` field is a UCN string; this check
  confirms the string is well-formed (digits only, or the empty string for entries that carry
  none, per `dictionary.md`) — resolving it to a UCL gloss is out of scope until a UW-to-UCL table
  exists, which no current issue builds.
- **Rule coverage.** Every grammar rule's `id` appears in at least one `tests/<name>.yaml` entry's
  list of rules it exercises. At M2 a rule with no covering test is a warning line in the report,
  not a failed exit code; the report counts them so M3's stricter gate has a starting number.

## Acceptance criteria

- `python -m tools.validate --lang afr` and `--lang eng` both run to completion and print a report
  with one count per check (schema errors, unresolved feature values, malformed UW strings,
  uncovered rules).
- Running validate against a deliberately broken fixture (one entry with `POS=NOUN` instead of
  `POS=NOU`) fails the schema or feature-value check, proving the check is not a no-op; this is the
  "prove the gate fails first" fixture `docs/standards/testing.md` requires.
- The `SEM=REL` vs `SEM=RLT` fixture from `tagset.md`'s "Where the export adds tags" section is one
  of the checked-in failing fixtures.
- `python -m tools.validate --all` runs both `afr` and `eng` and exits 0 at M2 even with uncovered
  rules present, because coverage is a warning here, not an error; the report still prints the
  uncovered count.
- `pytest tools/validate/test_validate.py` covers all four checks, at least one passing and one
  failing case each.

## Not in scope

Making rule coverage a hard error — that is M3. Resolving a UW string to a UCL gloss.

## Done when

- [ ] `tools/validate` runs against the `afr` and `eng` stores issues 14 to 16 produced.
- [ ] The broken-fixture tests prove each of the four checks can fail.
- [ ] `pytest tools/validate/test_validate.py` passes.
