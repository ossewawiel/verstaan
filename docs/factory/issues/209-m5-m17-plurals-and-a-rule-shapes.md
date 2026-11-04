---
issue: 209
title: "M1, M5 and M17 plurals inflect, and an a-rule shape the engine refuses shows in the trace"
milestone: Side
status: open
depends_on: []
agent: rule-author
agents: [rule-author, test-writer, implementer]
model: opus
effort: high
checkpoint: 4
commit: null
worktree: null
github_issue: 335
---
## What

Rule 227 calls `inflect` for each noun with a paradigm. `is_unsupported_affix` refuses comma lists
and duplication (`engine/src/rule_interpreter.cpp:670-680`). `inflect` then returns the base form
and appends nothing (`rule_interpreter.cpp:840-843`). `inflect_node` sees an empty scratch trace and
moves on (`generation.cpp:477-483`). The trace shows `afr-gen-227` with no `afr-inf-` entry and no
`unsupported` entry. M5 is `PLR:=[-2]:"",0>"e"` and M17 is `PLR:=[-1]+,>"e"`. ADR 0021's list of
unsupported shapes names no a-rule shape.

M5 has 1,082 lemma records and M17 has 1,370: 2,452 of the 22,077 lemma records with a `PAR`
value, 11.1 percent. A user translates `the cities` and gets `die stad`, "the city". The number
has changed, the exit code is 0, and even `--trace` does not show the skip.

F3 misfiled that scene. All four `stad` records carry `PAR: M1`, and three carry a per-entry
`FLX: PLR:="ad":"ede"`. No `M1` rule exists in `inflection.yaml`, and `dictionary_lookup.cpp:87`
says the module does not interpret FLX. M1 has 463 records, 301 of them not `NUM: PLR`, on top of
the 2,452 above.

```
$V --trace "cats"    1 72 62 afr-gen-56 afr-gen-227 / kat   exit=0
$V "the cities"      exit=0  die stad
$V "knives"          exit=0  mes
$V "attacks"         exit=0  aanval
$V "shares"          exit=0  aandeel
```

After this quest, one ADR names the a-rule shapes the engine supports and the ones it refuses
(finding F10.5). Its list covers M1 and per-entry FLX as well as M5 and M17. `the cities` gives
`die stede`, `aandeel` gives `aandele`, `mes` gives `messe` and `aanval` gives `aanvalle`, or the
owner has ruled otherwise on a form. A shape the engine refuses leaves an `unsupported` trace entry.

## Owner rulings

2026-11-04, the owner: the targets are `stede`, `messe`, `aanvalle` and `aandele`. A shape the engine
still refuses is a loss under quest 208's ruling: it leaves an `unsupported` trace entry, keeps the
base form and reports `partial`. Any other form still comes to the owner, and is recorded here.

## Acceptance criteria

- `the cities`, `knives`, `attacks` and `shares` give `die stede`, `messe`, `aanvalle` and
  `aandele`, or the owner has ruled otherwise on a form. `the cities` no longer gives `die stad`.
- A shape `is_unsupported_affix` still refuses leaves an `unsupported` trace entry and reports `partial`, in a test.
- The ADR names every a-rule shape, supported or refused, including M1 and per-entry FLX, and is
  accepted.
- `ctest --preset linux-gcc -L fast` passes.
- `python -m tools.validate --changed` exits 0.

## Not in scope

The rule cap: quest 208. The byte-level cut in `apply_affix`: quest 214.

## Done when

- [ ] `die stede`, `messe`, `aanvalle` and `aandele` come out, or the owner has ruled on a form.
- [ ] A refused shape leaves an `unsupported` trace entry, in a test.
- [ ] The ADR is accepted.
- [ ] `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
