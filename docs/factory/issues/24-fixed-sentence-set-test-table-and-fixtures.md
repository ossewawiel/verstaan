---
issue: 24
title: "Write the fixed sentence set's test table and fixture YAML"
milestone: M3
status: in-progress
depends_on: [16]
agent: rule-author
agents: [rule-author]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: .worktrees/m3-24-fixed-sentence-set
github_issue: 247
---
## What

This issue runs *before* issues 19, 20, 22 and 23, not after — despite following them in number.
Those four issues each test against "the fifteen fixed sentences", so the sentences must exist
first; this issue reads only `data/languages/<iso3>/corpus/ugoa1.yaml` (already-imported store
data from issue 16) and the row shape issue 26 already documents, needing nothing from the
engine issues that come after it in the numbering (checkpoint-4 review, issue 18, 2026-09-15:
the original `depends_on: [16, 23]` created a real ordering problem — 19/20/23 would each need to
guess their own fifteen sentences before this issue ever ran).

Select fifteen sentences from the shared `ugoa1` corpus both `afr` and `eng` carry
(`data/languages/eng/corpus/ugoa1.yaml` and `data/languages/afr/corpus/ugoa1.yaml`, issue 16),
covering: at least one homograph `grammar/disambiguation.yaml`'s Afrikaans records already
resolve (issue 15's data — issue 21 only documents the format, issue 22 only reads it, neither
needs to be done for this issue to pick a sentence), at least one word from each of the
`M2`/`M7`/`M16` inflection paradigms (issue 15), at least one sentence with a word this issue
expects to be missing from the dictionary (to exercise `Status::partial`, which issue 23 wires up
later), and the rest plain sentences with full dictionary and grammar coverage.

Write `docs/factory/issues/24-test-cases.md`, the table `id | input | expected | status |
direction | register | review | rule ids | note` per issue 26's shape, and its YAML twin at
`tests/fixtures/languages/eng/tests/basic.yaml` (English → UNL → Afrikaans direction only, per
this milestone's scope). Every row's `expected` field is the Afrikaans translation a fluent
reader confirms by hand against the `ugoa1` corpus's own Afrikaans sentence for that row, not a
guess.

## Acceptance criteria

- `docs/factory/issues/24-test-cases.md` has exactly fifteen rows, each with a real `id`, `input`
  read from `data/languages/eng/corpus/ugoa1.yaml`'s `sentence` field, `expected` read from
  `data/languages/afr/corpus/ugoa1.yaml`'s matching row (same `ugoa1` source line number, both
  files' `source` field), `status: ok` or `status: partial` per row, `direction: eng-afr`.
- `tests/fixtures/languages/eng/tests/basic.yaml` carries the same fifteen rows in the YAML shape
  issue 26's loader reads.
- At least one row's `rule ids` column names an `id` from `grammar/disambiguation.yaml`'s 13
  Afrikaans records.
- At least one row's `rule ids` column names an `M2`, `M7` or `M16` inflection paradigm id from
  `grammar/inflection.yaml`.
- At least one row's `status` is `partial`, naming in its `note` column which word the dictionary
  (`data/languages/eng/dictionary/<a-z>.yaml`) does not cover.
- Every row's `review` column is `pending` or `confirmed`; a `confirmed` row's `expected` value
  has been checked against the `ugoa1` corpus by a human, per this issue's `agent: rule-author`.

## Not in scope

Running the rows through the engine (issue 25, and issue 26's loader). Afrikaans → UNL → English
(generation-to-English direction is not in this milestone's fixed set).

## Done when

- [x] `docs/factory/issues/24-test-cases.md` and `tests/fixtures/languages/eng/tests/basic.yaml`
      both exist with the same fifteen rows.
- [x] Every acceptance criterion above is checkable by reading the two files.
