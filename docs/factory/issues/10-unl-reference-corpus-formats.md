---
issue: 10
title: "Agent-readable UNL reference: dictionary, grammar and tagset formats"
milestone: M1
status: open
depends_on: [8, 9]
agent: docs-writer
agents: [docs-writer]
model: sonnet
effort: medium
checkpoint: null
commit: null
github_issue: 10
---
## What

Rewrite the wiki's Dictionary, Grammar, Tagset, Inflection, Subcategorisation and Default-grammar
pages into `docs/unl-reference/formats/`, and check each described form against real exported
files from issue 08. Where the wiki and the exports disagree, the export wins and the page says so.

## Acceptance criteria

- The dictionary entry grammar is written as a formal syntax with every field named, and three
  real lines from the Afrikaans and English exports are parsed by hand beside it.
- The transformation-grammar rule syntax is written the same way, with three real rules from
  `eng_unl_tgrammar.txt` explained line by line.
- The tagset page lists every feature and value the exports use, with the wiki's definition, and
  flags any value the exports use that the wiki does not define.
- Every page ends with its source lines (wiki page and export file manifest paths).

## Not in scope

Writing the importer. Verstaan's own YAML shape.

## Done when

- [ ] Six format pages exist and are indexed.
- [ ] The disagreements list is non-empty or the report says the check was done and found none.
