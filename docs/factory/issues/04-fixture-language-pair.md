---
issue: 4
title: "Fixture language pair xxa and xxb for engine tests"
milestone: M0
status: open
depends_on: [3]
agent: rule-author
agents: [rule-author, test-writer, implementer]
model: opus
effort: high
checkpoint: null
commit: null
github_issue: 4
---
## What

A tiny invented pair of languages under `tests/fixtures/languages/{xxa,xxb}/` in the canonical
store layout of `SPEC.md` §3.3: ten dictionary entries each, one inflection paradigm each, three
analysis rules, three generation rules, a tagset, and a corpus of five sentences with their UNL
graphs. It exists so that engine mechanics can be tested without real-language ambiguity and
without any archive dependency.

## Acceptance criteria

- Every file validates with `tools.validate --all` once issue 13 lands; until then, validates
  against the YAML shape by a pytest in `tools/validate/tests/`.
- The five corpus sentences cover: a simple subject-verb-object, a definite article, a plural,
  a past tense, and one word absent from the dictionary (expected `partial`).
- Each rule has a comment in the writing voice and a `source: original`.
- `docs/factory/issues/04-test-cases.md` holds the table, block **A**, with `review: n/a`
  because the languages are invented.

## Not in scope

Any engine code beyond stubs. Real languages.

## Done when

- [ ] Fixture files exist and are loadable by a YAML reader without error.
- [ ] Test table A exists with at least eight rows.
- [ ] The rule-author's open decisions are listed as ADR candidates in the report.
