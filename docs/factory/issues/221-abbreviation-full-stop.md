---
issue: 221
title: "A full stop after an abbreviation does not start a sentence"
milestone: Side
status: open
depends_on: [207]
agent: rule-author
agents: [rule-author, test-writer, implementer]
model: opus
effort: high
checkpoint: 4
commit: null
worktree: null
github_issue: 362
---
## What

`starts_sentence` treats any `.` as a sentence end. The tokeniser splits `Mr.` into `Mr` and `.`, so the
next word counts as sentence-initial and takes quest 207's lower-case read. A user types a person's name
after a title and reads `Meneer hulsboom`, "Mister holly tree", with exit 0. `Mr Holly` with no full stop
stays right. The owner accepted this cost in 207 on 2026-11-05 and asked for this quest.

The same cause drops an initial. `A. Smith` gives `Smith`, exit 0, where main gave `A Smith`. `P.A.` gives
`P`, and `D.A.` gives `D`. After this quest, the store marks an abbreviation, and a full stop after a marked
word starts no sentence. No branch in `engine/src` names a language. The checkpoint is 4 because the
sentence start reaches every capital.

## Acceptance criteria

- `$V "Mr. Holly"` prints `Meneer Holly` and exits 0. `$V "Mr. Penny"` prints `Meneer Penny` and exits 0.
- `$V "A. Smith"` keeps a word for `A`.
- `$V "A book. A car."` still reads both articles: the second `A` is still sentence-initial.
- The ADR states how the store marks an abbreviation, and SPEC §3.3 matches if a store file is added.
- `ctest --preset linux-gcc -L fast` passes, and `python -m tools.validate --changed` exits 0.

## Not in scope

A sentence-initial preposition: quest 220. A sentence that really ends on an abbreviation, with a capital
after it, beyond what the ADR states.

## Done when

- [ ] An abbreviation's full stop starts no sentence, in a test.
- [ ] `Mr. Holly` and `A. Smith` read as the acceptance criteria state.
- [ ] `A book. A car.` still reads both articles.
- [ ] The ADR is accepted.
- [ ] `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
