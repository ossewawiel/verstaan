# 0023 — Lexical choice takes the highest-priority lemma entry for the UW

Date: 2026-10-28 · Status: Accepted (owner decision, 2026-10-28)

## Context

Generation reads a UW and must pick one Afrikaans word for it. The archive defines the field for
this. `data/archive/wiki/Dictionary.wikitext` lines 192 to 200: "priority is used for natural
language generation ... The first natural language word candidate for the UW "uw" will be [nlw3]
because it has the highest priority ... In case of words with the same priority, the first natural
language word to be matched is the first one to appear in the UNL-NL dictionary."

The afr store merges the generation and the analysis dictionaries. The analysis dictionary adds
inflected forms as their own entries: `boeke` (`BF: boek`, `NUM: PLR`), `dae` (`BF: dag`). In
`d.yaml`, `dae` stands before `dag`. The store shards by first letter, so "first in the dictionary"
has no single file to point at.

The priorities in the store, copied from `af_gen_u_c_ucl.zip`, disagree with three corpus words:

| UW | Entries, priority | Highest | Corpus row |
|---|---|---|---|
| `102958343` car | `kar` 1, `motor` 2 | `motor` | A11 `die mooi kar`, A12 `'n baie mooi kar` |
| `102883344` box | `boks` 2, `doos` 1 | `boks` | A07 `'n boek in 'n doos` |
| `103797390` mug | `beker` 2, `koppie` 0 | `beker` | A14 `... en 'n beker` |
| `300217728` beautiful | `mooi`, `pragtig`, `skoon`, all 0 | tie | A08, A11, A12 `mooi` |

## Decision

- `Dictionary::lookup_uw(uw)` returns every entry with that UW in store order: shard `a` to `z`,
  file order within a shard.
- Lexical choice keeps the lemma entries: headword equal to `BF`, or no `BF`. A paradigm makes the
  inflected form (issue 181 requires M2, M3, M7 and M16 to apply).
- It orders them by `priority`, highest first, then store order. Store order stands in for "first in
  the UNL-NL dictionary".
- The first is the node's reading. The rest are its alternatives for the disambiguation grammar
  (ADR 0021, "After the loop").

## Rejected

| Option | Why not |
|---|---|
| Store order alone | Picks `kar`, but ignores the field the archive defines for this choice. Still picks `boks`. |
| Lowest priority first | Contradicts the wiki. Picks `koppie` over `beker` on A14. |
| The entry whose `NUM` matches the node (`boeke` for `@pl`) | Bypasses the paradigms the issue requires. Rules 37, 40 and 56 set `NUM` after the choice, so the choice cannot read it. |

## Consequences

- A08 picks `mooi` (tie, `m` before `p` and `s`). A10 picks `dag`, not `dae`.
- **A11 and A12 yield `motor`, and A07 yields `boks`.** The corpus writes `kar` and `doos`. The
  owner ruled on 2026-10-28 to accept the archive's choice. Rows A07, A11 and A12 of
  `docs/factory/issues/24-test-cases.md` and `tests/fixtures/languages/eng/tests/basic.yaml` now
  read `'n boek in 'n boks`, `die mooi motor` and `'n baie mooi motor`. The archive's own
  `exports/afr/44.tgrammar.txt` (lines 56 to 58) writes `die mooi motor`.
- Rejected with this ruling: raising the priority of `kar` and `doos` in the afr store. A
  dictionary record has no `deprecated` field, and ADR 0020 covers grammar rules only.
- A14, `a car, a book and a mug`, also yields `motor` under this rule. Its row still reads `kar`;
  the owner has not ruled on A14, which is out of issue 181's scope.
- The plural follows the entry: `motor` takes paradigm M2, `motors`.
