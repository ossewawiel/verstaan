# 0022 — A literal word in a generation rule takes the features of the target's closed-class record

Date: 2026-10-28 · Status: Accepted (owner decision, 2026-10-28)

## Context

Afrikaans generation rules name words in brackets on the right side: `[die]` (rule 35), `['n]`
(36), `[en]` (33), `[in]` (22, 234), `[alle]` (37), `[enkele]` (40), `[baie]` (42), `[voor]` (26).
The T-rule syntax calls `[text]` an `<ENTRY>`, a headword (`docs/unl-reference/formats/
transformation-grammar.md`). Issue 181's done-when: "`die`, `'n` and `en` come from the Afrikaans
closed-class records issue 184 imports, not from string literals in engine code."

Issue 184 imported closed-class records with an empty UW: `die` (`d.yaml` line 4114), `'n`
(`n.yaml` line 2), `en` (`e.yaml` line 5354), `oor`, `voor`, `al`, `vir`. Not every literal has
one. `in` has only three adverb entries, `LEX: A, POS: AAV`, each with a UW. `alle`, `enkele` and
`baie` have no closed-class record.

`Dictionary::lookup` keys a shard on the first byte of the surface. The importer shards on the first
ASCII letter (`tools/importer/dictionary.py`, `shard_letter`). So `lookup("'n")` finds no shard, and
the `'n` record in `n.yaml` is out of reach.

## Decision

- `[w]` on a generation right side makes a new word node. Its surface is `w`, the text the rule
  holds.
- When the target dictionary holds a closed-class record with headword `w` (an empty `uw`), the node
  takes the features of the first such record in store order. Then the rule's edits apply on top:
  `[die],+LEX=D,+POS=ART` gives `LEMMA=die, BF=die, LEX=D, POS=ART`.
- With no closed-class record, the node carries the rule's edits only. It never takes the features
  of an entry with a UW: `[in],LEX=P,POS=PRE` gives `LEX=P, POS=PRE`, not the adverb `LEX=A`.
- `Dictionary::lookup` keys a shard on the first ASCII letter in the surface, as the importer's
  `shard_letter` does, so `'n` reaches `n.yaml`.
- The engine holds no Afrikaans word. The surface comes from the rule; the features come from the
  record.

## Rejected

| Option | Why not |
|---|---|
| The literal's text alone, no lookup | The done-when names the records. A test could not tell the two apart. |
| Any entry with headword `w` | `[in]` would take an adverb reading and `[baie]` a pronoun reading (`LEX: R`). |
| A literal with no record retires the rule as `unsupported` | `[alle]` (A06) and `[in]` (A07) have no record. The archive builds them anyway. |

## Consequences

- A test reads the record through the node's features: the `die` node of A02 holds `LEMMA=die`.
- A misspelt literal still makes a node. It shows in the text, not as an error. `tools/validate`
  may check later that every literal has a record or is a known open word.
- The shard fix changes `Dictionary::lookup` for every caller. The shard key now matches
  `tools/importer`'s `shard_letter`: the first ASCII letter anywhere in the headword. Headwords the
  first-byte key could not reach become reachable: the eng store's `'hood`, `'tween` and `'twixt`,
  digit-initial headwords such as `3D`, and the afr `éclair`. No existing test reads one of them.
  (Corrected 2026-10-28: an earlier wording said no English headword starts with an apostrophe and
  a letter. That holds for the tests, not the store.)
