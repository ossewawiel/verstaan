---
issue: 21
title: "Document the disambiguation rule format and decide the eng gap"
milestone: M3
status: open
depends_on: [15]
agent: docs-writer
agents: [docs-writer, rule-author]
model: sonnet
effort: low
checkpoint: null
commit: null
worktree: null
github_issue: 244
---
## What

Issue 15 (M2, merged) flagged a gap: `data/languages/afr/grammar/disambiguation.yaml` holds 13
records imported from `data/archive/exports/afr/44.dgrammar.txt` and `47.dgrammar.txt`, but
`docs/unl-reference/formats/` has no `disambiguation.md` page describing the D-rule source
syntax those records came from. Issue 22 (the rule interpreter) reads
`grammar/disambiguation.yaml` at runtime and needs the field meanings settled first — this issue
is a rule-author decision, not an engineering one, and it blocks issue 22's disambiguation-kind
handling until it closes.

Write `docs/unl-reference/formats/disambiguation.md` per the reference-corpus rules
(`docs/standards/`): one page, headings that name the concept, a table of D-rule operators
(negation `^`, disjunction `{a|b}`, the `=0` deletion mark seen in `44.dgrammar.txt`'s worked
example), one worked example under each rule, `Source: UNL Archive, <manifest URL>, CC BY-SA
<version>` per the manifest line for `44.dgrammar.txt` and `47.dgrammar.txt`.

Separately, decide and record the `eng` gap: `data/languages/eng/grammar/disambiguation.yaml` is
`[]` because `data/archive/manifest.jsonl` lists no `*.dgrammar.txt` export for `eng`. Record the
decision in this page's own "Where eng has no export" section: either the rule interpreter (issue
22) treats an empty disambiguation file as "no disambiguation rules for this language, first
sense wins" (a documented fallback), or a future issue mirrors an `eng` D-grammar export if one
surfaces later in the archive. This issue decides which; issue 22 implements the chosen fallback.

## Acceptance criteria

- `docs/unl-reference/formats/disambiguation.md` exists, describes the operators found in
  `44.dgrammar.txt` and `47.dgrammar.txt` (checked against the raw files, not guessed), and ends
  with the `Source:` line citing both files' manifest entries.
- The page states the chosen `eng`-empty fallback in one sentence a test can check: issue 22's
  disambiguation handler either implements "first sense wins when the file is empty" or defers to
  a named follow-up issue; whichever is chosen is the sentence this page states.
- The page links back to `SPEC.md` §2's glossary entries for any term it introduces, per the
  reference-corpus rule that no UNL concept gets a new name.

## Not in scope

Writing new disambiguation rules for `eng`. Implementing the interpreter (issue 22) — this issue
only settles the format and the fallback decision issue 22 then codes against.

## Done when

- [ ] `docs/unl-reference/formats/disambiguation.md` exists with the `Source:` line.
- [ ] The `eng`-empty fallback decision is stated in one sentence issue 22 can implement.
