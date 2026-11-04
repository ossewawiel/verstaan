---
issue: 213
title: "Docs and code agree on the M3 engine"
milestone: Side
status: open
depends_on: []
agent: implementer
agents: [implementer, docs-writer]
model: sonnet
effort: medium
checkpoint: 4
commit: null
worktree: null
github_issue: 339
---
## What

The M3 verifier found docs and code that disagree (F9, F10.6). A reader who trusts the docs gets
the wrong engine:

- SPEC §3.3's row keys omit `id`, `status`, `review` and `source`. The fixture file's own header
  admits the addition.
- SPEC §3.4 calls `not_implemented` "the M0 stub value every real `Engine` method retires".
  `engine/src/engine.cpp:164` still returns it for afr to eng and for any register or context.
- SPEC §3.6 advertises `--register formal`. `$V --register formal "a book"` prints a blank line
  and exits 1. SPEC §3.6 lists exits 0, 2 and 3 only.
- `$V --bogus "a book"` gives `'n boek ⟦--bogus⟧`, exit 2. `apps/cli/src/main.cpp:142-147` treats
  any unknown flag as text.
- `meta.yaml` counts are stale. SPEC §3.3 says `counts` come from `tools.importer.meta`. The
  validator requires the key and does not compare it with the store:

  ```
  key                         meta.yaml   store
  eng rules_analysis          182         183
  eng rules_disambiguation    5           10
  eng dictionary_entries      576884      576885
  afr rules_generation        234         236
  ```
- Issue 183 is `done` with two unchecked Done-when boxes. One names `ctest -R pipeline_fixed_set`,
  and `d8a8452` deleted that test.
- `dictionary.hpp:6` and `rule_set.hpp:5` say an ADR guards a change to the public API, not every
  addition. `engine/CLAUDE.md:6` says "Changing it needs an ADR". Three new public headers rest
  on the first reading. This needs the owner: whether every public-API addition needs an ADR.

After this quest, each line is fixed in the doc or in the code, an unknown CLI flag exits with a
usage error, the validator compares `counts` to the store, and the ADR sentence reads one way in
all three files. The checkpoint is 4 because the last line is a decision. The I/O line of F9 is
quest 210's.

## Owner rulings

The ruling on F10.6 is recorded here, with its date. Not yet ruled.

## Acceptance criteria

- The owner has ruled on F10.6 before the ADR sentence changes.
- `grep -n "id\b" docs/factory/SPEC.md` shows SPEC §3.3 listing `id`, `status`, `review` and `source`.
- `grep -n "not_implemented" docs/factory/SPEC.md` finds a sentence that matches `engine.cpp`.
- `$V --register formal "a book"` and SPEC §3.6 agree on the output and exit code, in a test.
- An unknown CLI flag exits with a usage error, in a test.
- The validator compares `counts` to the store, and a stale count fails, in a pytest.
- `python -m tools.validate --all` exits 0 after `meta.yaml` is corrected.
- `grep -n "ADR" engine/CLAUDE.md engine/include/verstaan/dictionary.hpp engine/include/verstaan/rule_set.hpp`
  shows one reading of the sentence.
- Issue 183's two boxes are ticked or corrected, and none names a deleted test.
- `ctest --preset linux-gcc -L fast` passes.
- `python -m tools.validate --changed` exits 0.

## Not in scope

The load-failure API and the I/O in `src/`: quest 210.

## Done when

- [ ] SPEC §3.3 row keys list `id`, `status`, `review` and `source` (`grep` above).
- [ ] SPEC §3.4's `not_implemented` sentence matches `engine.cpp`.
- [ ] SPEC §3.6's `--register` and exit-code lines match the CLI, in a test.
- [ ] An unknown CLI flag exits with a usage error, in a test.
- [ ] `meta.yaml` counts match the store, and the validator compares them, in a pytest.
- [ ] Issue 183 has no unchecked box and no deleted test name.
- [ ] The ADR sentence reads one way in all three files (`grep` above).
- [ ] `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
