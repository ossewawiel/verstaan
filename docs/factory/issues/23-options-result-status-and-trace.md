---
issue: 23
title: "Wire Options, Result, Status and the --trace flag"
milestone: M3
status: open
depends_on: [22, 24]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: null
github_issue: 246
---
## What

`engine/include/verstaan/engine.hpp` already declares `Options{Lang from, to; Register reg;
Context ctx}`, `Result{text, unl, trace, status}` and the four-member `Status` enum (`ok |
partial | no_parse | not_implemented`), per `SPEC.md` §3.4, but `Engine::translate` still returns
the M0 stub value. This issue retires the stub for the runtime-tables back end (issue 22's
`Engine::load(RuleSet)`), and makes each `Status` value real:

- `ok`: every token resolved, every rule fired to completion.
- `partial`: at least one token had no dictionary entry (issue 20's unresolved marker) or no rule
  covered it; `text` marks each such word `⟦word⟧` per `SPEC.md` §3.4.
- `no_parse`: the tokeniser (issue 19) or rule interpreter (issue 22) could not produce any UNL
  graph at all, not even a partial one.
- `not_implemented`: reserved for a `Lang`/`Register`/`Context` combination no store covers yet
  (e.g. a register this milestone's stores do not carry) — never returned for a plain afr/eng
  translation once this issue closes.

The CLI's `--trace` flag (an existing CLI entry point, or a new minimal one if none exists yet)
prints `Result.trace` one rule per line, in firing order.

## Acceptance criteria

- `Engine::translate("...", Options{Lang::eng, Lang::afr, ...})` returns `Status::ok` for every
  one of the fifteen fixed English sentences (issue 24) that issue 22's rule interpreter fully
  resolves, reading the same store files issue 22 names.
- At least one hand-built sentence with a word missing from `data/languages/eng/dictionary/*.yaml`
  returns `Status::partial` with that word wrapped `⟦word⟧` in `text`.
- At least one hand-built malformed input (unbalanced quote, or a token stream the tokeniser
  cannot segment) returns `Status::no_parse`.
- `--trace` on one of the fixed sentences prints every rule `id` the GoogleTest in issue 22
  already asserts fired, in the same order.
- `ctest -R engine_status` runs green.

## Not in scope

The generated-tables back end's own `Status`/`Trace` semantics — ADR 0007 says both back ends
share one semantics, so this issue's decisions bind M4 too, but M4 implements them, not this one.

## Done when

- [ ] `Engine::translate` returns real `Status` values for the runtime-tables back end.
- [ ] `--trace` prints `Result.trace` for a fixed sentence.
- [ ] `ctest -R engine_status` is green.
