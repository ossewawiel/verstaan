---
issue: 11
title: "Archive inventory: what exists, what is usable, what is missing"
milestone: M1
status: open
depends_on: [8, 10]
agent: implementer
agents: [implementer, docs-writer]
model: sonnet
effort: medium
checkpoint: 2
commit: null
---
## What

`tools.mirror inventory` reads `manifest.jsonl` and `languages.json` and writes
`docs/architecture/archive-inventory.md`: per language, the export files present, their sizes,
entry and rule counts by a first-pass line count, which grammar kinds are non-empty, and a
readiness grade for use as a reference language. The docs-writer adds a prose summary naming the
reference set for M2 and M3.

## Acceptance criteria

- One table row per language with a non-empty export. Sorted by dictionary base forms descending.
- Readiness grade rule written in the page: A = dictionary > 50k and all four grammar exports
  non-empty; B = dictionary > 10k and generation grammar non-empty; C = anything else non-empty.
- The Afrikaans, English and Dutch rows match what the interrogation recorded on 2026-09-08 or
  the difference is explained.
- The page names the languages M3 will use (eng, afr) and the reference set for rule drafting.

## Not in scope

Parsing beyond line counts.

## Done when

- [ ] Inventory page exists and is linked from `docs/architecture/overview.md`.
- [ ] The report states the three counts for `afr` and `eng` in the page.
