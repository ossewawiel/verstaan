---
issue: 195
title: "English disambiguation rules for in, on and about"
milestone: M3
status: open
depends_on: [21, 22]
agent: rule-author
agents: [rule-author, test-writer, implementer]
model: opus
effort: high
checkpoint: null
commit: null
worktree: null
github_issue: null
---
## What

`data/languages/eng/grammar/disambiguation.yaml` holds an empty list, because the archive exports
no D-rules for English. Issue 21 decided the fallback for that case: the first candidate in
dictionary order wins. For `in`, `on` and `about` the first candidate is the adverb. In A07,
`a book in a box`, the lookup keeps `in` as an adverb, so rule 15 never sees a preposition and no
`plc` edge can form. Issue 180's rule-author pass stopped on this on 2026-09-28 as blocker B2. The
owner chose the split on 2026-10-27, flight plan answer D1: "English D-rules (B2), before 180."

After this quest, the English store holds hand-written D-rules that keep the preposition reading
of `in`, `on` and `about` before a noun phrase. Each rule carries a comment that names the row it
serves, and `source` provenance that marks it as project-written, not archived. The empty-list
fallback still applies to every word these rules do not reach.

## Acceptance criteria

- `data/languages/eng/grammar/disambiguation.yaml` holds at least one rule per word, in the format
  `docs/unl-reference/formats/disambiguation.md` describes.
- `195-test-cases.md` lists one firing row and one must-not-fire row per rule, from
  `tests/fixtures/languages/eng/tests/basic.yaml`.
- A test shows `in` on A07 and `about` on A09 leave `disambiguate` as `P`, not as the adverb.
- A test shows `on` in A15 leaves as `P`.
- A test shows a sentence with an adverbial `in`, for example `come in`, keeps the adverb.
- `ctest -L fast` passes. `python -m tools.validate --changed` exits 0.

## Not in scope

Relations built from these prepositions: issue 198 (`plc`, `cnt`). D-rules for any word not
named above. A D-rule import for English, since the archive has none to import.

## Done when

- [ ] `eng/grammar/disambiguation.yaml` holds rules for `in`, `on` and `about`.
- [ ] Each rule has a firing row and a must-not-fire row in `195-test-cases.md`.
- [ ] The tests for A07, A09, A15 and the adverbial case pass.
- [ ] `ctest -L fast` and `python -m tools.validate --changed` are green.
