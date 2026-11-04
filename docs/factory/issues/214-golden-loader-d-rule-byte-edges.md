---
issue: 214
title: "Golden loader, D-rule and byte-level edges"
milestone: Side
status: open
depends_on: []
agent: test-writer
agents: [test-writer, implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: null
github_issue: 340
---
## What

Four small faults, each a wrong answer with a clean exit.

**F11, the golden loader.** `runs_in_engine` needs an `id` (`tests/golden/row_loader.hpp:132`), and
`skipped` drops an empty `id` too (`row_loader.hpp:148`). A row with no `id` is neither run nor
counted. The loader reads `tests/fixtures/languages` only (`row_loader.hpp:165`), so
`data/languages/eng/tests/basic.yaml` is an unread twin. A rule-author at M6 types `ids:` for
`id:`, or adds a row to the store copy. The gate stays green and the row never runs. Verifier
input: a scratch root with three rows, two with no `id` and wrong expected text, listed one row,
`Table/golden_row.  Row/A01`.

**F12, the D-rule.** D-rules go through the older flat parser (`rule_interpreter.cpp:268-294`). A
quoted regex there is an ordinary tag no reading carries, so `^"/zzz/"` is always true.
`apply_disambiguation_rule` never reads `rule.rhs` (`rule_interpreter.cpp:599-628`). No shipped rule
has either shape: all 23 right sides are `"0"`. On a scratch store with `eng-dis-1` edited:

```
([in],^"/zzz/")(POS=ART,#PREFERRED) = 0     a book in a box   exit=0  'n boek aan 'n boks
([in],POS=PRE)(POS=ART,#PREFERRED)  = 255   a book in a box   exit=0  'n boek aan 'n boks
```

The unedited store gives `'n boek in 'n boks`. The first imported D-rule with a regex deletes the
readings it was meant to spare.

**F13, bytes.** `apply_affix` counts bytes (`rule_interpreter.cpp:743-756`). The tokeniser knows
ASCII space and ASCII `'` only (`tokeniser.cpp:16-30`). Neither validates UTF-8. `Status` comes from
a search for `⟦` in the final text (`engine.cpp:225`), so an input mark counts as a fall-through
mark. With `négligé` on PAR M3 and M3 changed to `PLR:=1>"e"`, `housecoats` gives `néglig\xc3e`,
which breaks a JSON consumer. Also: `a<U+00A0>book` gives `⟦a book⟧`, `a book’s` gives `⟦book’s⟧`,
`$'\xff\xfe'` gives `⟦\xff\xfe⟧`, and `⟦x⟧` gives `⟦⟦x⟧⟧`, each exit 2.

**The ledger.** The M3 retro found faults in the failure ledger, `docs/factory/lessons.jsonl`.

- `capture_failure.sh`'s `esc` leaves tabs raw, and every other control byte too, and invalid
  UTF-8. So `\r`, an ESC colour code and `\xff` each give a line that does not parse.
  `retro_promote.py:64-71` and `parse.mjs:122` skip such a line without a word.
- `capture_failure.sh` takes a branch number by prefix. `side-2026-11-04-retro` logs 2026,
  `side-3-way-merge` logs 3, and a `worktree-agent-*` tree falls back to STATE.md's guess. The fix
  reads the in-progress issue whose `worktree:` names this tree, and logs `none` when there is
  none.

After this quest, each scene has a test that fails first and then passes.

## Acceptance criteria

- A golden row with no `id` fails the loader or runs, and is never dropped without a report, in a
  test.
- The loader reads the store copy of `basic.yaml`, or fails when the two copies differ, in a test.
- A D-rule with an unreadable test, and one with a right side other than `"0"`, retires with an
  `unsupported` trace entry or behaves as written, in a test.
- `apply_affix` cuts on a character boundary, and `housecoats` gives valid UTF-8, in a test.
- The four byte-level inputs above each give a stated result, in a test.
- A pytest shows `capture_failure.sh` writes a parseable line for a detail with a tab, a `\r`, an
  ESC colour code and a `\xff` byte.
- `retro_promote.py` and `parse.mjs` report a line they skip, in a test each.
- A pytest shows branch `side-2026-11-04-retro` and `side-3-way-merge` log the issue named by the
  in-progress file's `worktree:`, and a tree with none logs `none`.
- `ctest --preset linux-gcc -L fast` passes.
- `python -m tools.validate --changed` exits 0.

## Not in scope

Regex support in D-rules. A new tokeniser.

## Done when

- [ ] F11: each golden-loader scene has a test.
- [ ] F12: each D-rule scene has a test.
- [ ] F13: each byte-level scene has a test.
- [ ] The ledger writes a parseable line for every control byte and invalid UTF-8, in a pytest.
- [ ] The ledger takes its issue number from the `worktree:` field, and logs `none` when none matches, in a pytest.
- [ ] A skipped ledger line is reported by `retro_promote.py` and `parse.mjs`.
- [ ] `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
