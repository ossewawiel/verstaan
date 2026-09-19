---
issue: 19
title: "Build the tokeniser for the fixed sentence set"
milestone: M3
status: in-progress
depends_on: [12, 16, 24]
agent: implementer
agents: [rule-author, implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: .worktrees/m3-19-tokeniser-fixed-sentence-set
github_issue: 242
---
## What

`engine/src/tokeniser.cpp` splits input text into a token list before dictionary lookup (issue
20) runs against it. It reads no store file itself, but its output shape (a token: surface
form, offset, one candidate `POS` guess or none) is what issue 20's lookup consumes, so this
issue fixes that shape first. Rules: split on whitespace and the punctuation set English and
Afrikaans corpus sentences use (`.`, `,`, `!`, `?`, `;`, `:`, apostrophe inside a word kept,
apostrophe at a word boundary split off). Case is preserved; lower-casing for dictionary lookup
is issue 20's job, not the tokeniser's.

The fixed sentence set is the fifteen `ugoa1` sentences issue 24's table names. This issue's
tests run the tokeniser only against those fifteen English and fifteen Afrikaans lines from
`data/languages/eng/corpus/ugoa1.yaml` and `data/languages/afr/corpus/ugoa1.yaml`'s `sentence`
field, not the whole corpus.

## Acceptance criteria

- `engine/src/tokeniser.cpp` reads `data/languages/eng/corpus/ugoa1.yaml` and
  `data/languages/afr/corpus/ugoa1.yaml` (the `sentence` field of the fixed rows issue 24
  selects) and produces a token list a test can compare position by position.
- A GoogleTest fixture tokenises all fifteen fixed English sentences and all fifteen fixed
  Afrikaans sentences; each row's expected token count and boundary set is checked, not just a
  smoke pass.
- An apostrophe-in-word case (English "don't") and an apostrophe-at-boundary case (a possessive
  `'s` on a proper noun in the fixed set, or a synthetic fixture line if none of the fifteen has
  one) both tokenise correctly, proving the split rule is not a no-op.
- `ctest -R tokeniser` runs green.

## Not in scope

Dictionary lookup (issue 20), lower-casing, sentence segmentation across a paragraph (the fixed
set is one sentence per row already).

## Done when

- [x] `engine/src/tokeniser.cpp` and its test exist.
- [x] `ctest -R tokeniser` is green against the fixed set.
