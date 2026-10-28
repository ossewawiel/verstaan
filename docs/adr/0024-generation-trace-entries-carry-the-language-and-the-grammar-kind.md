# 0024 — Generation trace entries carry the target language and the grammar kind in their id

Date: 2026-10-28 · Status: Accepted (owner decision, 2026-10-28)

## Context

`TraceEntry::rule` holds a bare record id: `"154"`, `"5"`. Archive ids restart at 1 in every grammar
file. Once `Engine::translate` runs generation, one trace holds ids from two languages and four
files.

Bare ids collide on rows that already pass. Row R01 of issue 198 counts exactly one `154`: afr
rule 154 is `PP(%x;%y,IAFT)`. Row R03 asserts no `5` on A08: afr-dis-5 is the rule issue 181
names for A08. G05 counts `172` and `176`; R05 counts `18` and `182`. Each of those is also an afr
generation id.

The test-case files already qualify ids: `eng-ana-NN`, `afr-gen-NN`, `afr-dis-NN`, `afr-inf-MNN`
(`docs/factory/issues/24-test-cases.md`, "How to read the rule ids").

## Decision

- Every entry the generation side appends carries `<iso3>-<kind>-<id>`: `afr-gen-35`, `afr-dis-5`,
  `afr-inf-M3`. `<iso3>` comes from the target `Lang`. `TraceEvent` is unchanged:
  `afr-gen-61` with `unsupported` is a valid entry.
- Analysis entries keep the bare id. Existing tests pin them. A later issue may qualify them.
- `RuleInterpreter::inflect` keeps its contract and appends the bare paradigm id. `generate` calls
  it with a scratch trace and appends the qualified id itself.

## Rejected

| Option | Why not |
|---|---|
| Bare ids | R01, R03, R05 and G05 read generation entries as analysis entries. |
| A new `TraceEntry` field for language and kind | Changes a public struct every consumer reads (CLI, console, equivalence tests) for what one string already says. |
| Qualify analysis ids in the same issue | Rewrites every trace assertion of issues 22, 180, 194, 195 and 198. Not this issue's work. |

## Consequences

- A trace reads `70 60 72 12 62 afr-gen-35 ... afr-inf-M3 afr-gen-231`. The analysis part comes
  first and is unchanged.
- Three tests compare a whole trace with `FiredIds` (`engine_status` G01, G02 and G03). They now
  compare the entries before the first `afr-` entry.
- The two id styles differ until a later issue qualifies analysis ids.
