---
issue: 25
title: "Superseded — Wire the English to UNL to Afrikaans pipeline for the fixed sentence set"
milestone: M3
status: done
depends_on: [22, 23, 24]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: null
github_issue: 248
---
## What

This issue assumed `Engine::translate` (issue 23) already ran the full pipeline against the
runtime-tables back end (issue 22) and only needed row-level fixes to translate the fifteen rows
in `tests/fixtures/languages/eng/tests/basic.yaml`. The implementer routed here (2026-09-28) found
that was not true: `Engine::translate` only tokenised English, disambiguated a flat node list, and
echoed English surface forms back with `⟦word⟧` for unresolved ones. It never populated
`Graph::relations`, never looked up the Afrikaans dictionary, never applied
`data/languages/afr/grammar/generation.yaml`, never applied Afrikaans disambiguation or inflection.
The implementer stopped without writing code rather than either building an unscoped subsystem or
gaming the acceptance gate (all fifteen rows are still `review: pending`, so "every confirmed row
passes" was vacuously true).

This issue is closed with `commit: null`, deliberately: no work landed under it. It is superseded
by three quests that build the missing stages, and a fourth that replaces this one as the true
integration pass:

- Issue 180 — relation extraction on the English analysis side.
- Issue 181 — the Afrikaans generation interpreter, dictionary lookup, disambiguation and
  inflection wiring.
- Issue 182 — three documented `generation.yaml` divergences from the corpus, and a missing `nam`
  handler.
- Issue 183 — the integration pass this issue's title describes, once 180–182 are real.

## Acceptance criteria

None — this issue does no further work. See issue 183.

## Not in scope

Everything. See issues 180, 181, 182, 183.

## Done when

- [x] Superseded by issues 180, 181, 182 and 183.
