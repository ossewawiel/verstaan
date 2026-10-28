# 0018 — A D-rule deletes each reading once, and never prunes a `#PREFERRED` node

Date: 2026-10-28 · Status: Accepted (owner decision, 2026-10-28)

## Context

`RuleInterpreter::disambiguate` runs the D-rules of `grammar/disambiguation.yaml`. For each rule it
tries every combination of readings across a window of words. Each combination that matches marks
its reading at every word that still has more than one reading. The pass then erases the marked
readings.

Issue 195 writes the first English D-rules, for `in`, `on` and `about`. Its rule-author pass found
two faults in the matcher (`docs/factory/issues/195-test-cases.md`, "Blocker").

- **B1, duplicate marks.** A reading matched by several combinations is marked several times.
  `apply_disambiguation_rule` erases by index, so after the first erase the duplicate index points
  at the next reading, and that one goes too. Scene: A07, `a book in a box`, rule
  `([in],^POS=PRE)(POS=ART)`. `in` has 10 non-preposition readings. `a` has 3 article readings.
  The matcher records 30 marks on `in`. The duplicates erase all 13 preposition readings. Only the
  adverb survives, the reverse of the rule's purpose.
- **B2, the context word is pruned too.** The same loop marks the article's matching readings.
  Once B1 is fixed, the rule strikes all three article readings of `a`, and the noun reading
  "a" (the letter) moves to the front.

The archive names B2 and its cure. `data/archive/wiki/D-rule.wikitext` lines 154–155: "In order to
prevent the system from replacing the rightmost nodes, we have to assign #PREFERRED to the nodes to
be preserved", with the form `(R)(N,#PREFERRED)=0;`. The matcher read `#PREFERRED` as an ordinary
tag that no reading carries, so such a rule never matched.

## Decision

1. **A D-rule deletes a reading once per rule.** Before the erase, the matcher removes duplicate
   `(position, candidate)` pairs. However many combinations matched a reading, it is deleted once.
2. **A `#PREFERRED` term always matches.** In `(N,#PREFERRED)`, the term is true on every reading.
   It adds no test.
3. **A position whose node carries `#PREFERRED` is never pruned.** The matcher marks no reading
   at that position, even when the whole window matches. The node stays as context.

Both rules live in `engine/src/rule_interpreter.cpp`. No public name changes.

### Where the project is simpler than the archive

In the archive, `#PREFERRED` orders the replacements. It says "try first other candidate tokens for
the other strings before trying other candidate tokens for this string" (lines 88–111). It governs
which nodes get replaced first. Our matcher has no replacement order. It marks all matches and
deletes them together. So `#PREFERRED` here has one job: it shields a position from pruning. We
keep the archive's spelling and its use in the example at line 155. We do not implement the order.
`#FINAL` stays unimplemented, and a D-rule with it is planned for a later milestone.

## Consequences

- D-rules 1 to 3 of `eng/grammar/disambiguation.yaml` now match. A07 keeps `in` as a
  preposition and leaves `a` with its three article readings.
- No `afr` rule carries `#PREFERRED`, so decisions 2 and 3 leave `afr` alone. Decision 1 changes
  `afr` only where duplicate marks over-deleted before.
- A rule-author may write `#PREFERRED` on any node of a window to say "this word is context, not
  target". A window with `#PREFERRED` on every node deletes nothing.
- Tests pin each rule: D01, D04, D07, D08 and D12 pin deletion once; D02, D05 and D12 pin the
  shield (`195-test-cases.md`).
- A reading shared by two different rules is still deleted by the first and absent for the second.
  Rule order stays as in the file.
