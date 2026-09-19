# Disambiguation Rule Syntax

A disambiguation grammar, or D-grammar, is the ordered list of rules that discards a candidate
reading of a word, once the dictionary or an earlier analysis rule has offered more than one
sense for it (see the glossary's **disambiguation grammar** and **UW** entries, `docs/glossary.md`
§UNL and language). Each rule states a context that must not occur; when the context matches, the
matched span is deleted from the sentence. This page names the operators the archive's afr export
uses and shows one worked example under each.

## Rule shape

Every D-rule has the form `α=0;`, an `LL` rule in the transformation-grammar sense (see
`docs/unl-reference/formats/transformation-grammar.md`): the left side `α` is one or more
parenthesised nodes, each a comma-separated list of tagset features from
`data/languages/afr/tagset.yaml`; the right side is always the literal `0`, meaning "delete this
match". A D-rule never adds or rewrites — it only removes a reading that cannot be correct in the
context it was found. A trailing `; <comment>` documents the linguistic reason in English prose.

```
(TEMP,^DIGIT,^W)(^BLK,^PUT,^STAIL)=0; there must be a blank, a punctuation sign or the end of the
sentence after a temporary word, i.e., a temporary word cannot be followed by other word, except
for digits, as in "1st"
```

The importer (`tools/importer`, per `SPEC.md` §3.2) turns this into a `disambiguation.yaml` record
with `kind: disambiguation`, `lhs` holding the left side verbatim, `rhs: "0"`, and `conditions: []`
— M2 keeps every condition embedded in `lhs`; the M3 rule interpreter (issue 22) decides whether it
needs them split out.

## D-rule operators

| Operator | Meaning | Where seen |
|---|---|---|
| `^feature` | Negation: the node must not carry `feature`. | `44.dgrammar.txt` line 7, `^DIGIT` |
| `{a\|b}` | Disjunction: the node must carry `a` or `b`. | `44.dgrammar.txt` line 10, `{PUT,^BLK\|STAIL}` |
| `=0` | Deletion mark: the right side of every D-rule. Delete the matched span. | every line in both files |
| `(A)(B)` | Adjacency: `A` immediately followed by `B` in the word list. | `44.dgrammar.txt` line 7 |
| `feature=value` | Feature-value pair, not a bare flag. | `44.dgrammar.txt` line 14, `rel=plc` |
| `,` | Conjunction inside one node: every listed feature (or its negation) must hold. | `44.dgrammar.txt` line 7 |

### Negation (`^`)

```
(TEMP,^DIGIT,^W)(^BLK,^PUT,^STAIL)=0;
```
The first node carries `TEMP` (a temporary, ambiguous tag) and must not carry `DIGIT` or `W`
(word). The second node must not be a blank, a punctuation sign or the sentence tail. Read
together: a `TEMP` reading that is not a digit, followed by anything that is not a blank,
punctuation or the end of sentence, cannot stand — a temporary word never has another word butted
against it. On the input `1st`, the digit exception (`^DIGIT` on the first node) keeps this rule
from firing, so the `TEMP` reading of `1st` survives; on `catx`, where `TEMP` marks an unresolved
stem and `x` is a stray letter run, the rule fires and deletes the `TEMP` reading.

### Disjunction (`{a|b}`)

```
(D,^AFT)({PUT,^BLK|STAIL})=0;
```
The first node is a determiner (`D`) that is not tagged `AFT` (the distribution class that allows
trailing position, e.g. "enough"). The second node must match one of two branches inside the
braces: `PUT,^BLK` (a punctuation mark that is not itself a blank) or `STAIL` (the sentence tail).
Either branch satisfies the disjunction. Applied to a determiner sitting right before a full stop,
or right at the end of the sentence, the rule deletes that determiner reading — ordinary
determiners cannot close a sentence, only ones marked `AFT` can.

### Deletion mark (`=0`)

```
(TEMP)(PUT)(TEMP)=0;
```
The left side matches two `TEMP` nodes separated by one punctuation node. The right side, `0`, is
not a placeholder value — it is the instruction "remove this match from the candidate set". Every
D-rule in both files ends this way; a D-rule only ever prunes readings, it never rewrites one into
another (that is a transformation grammar's job, per `docs/unl-reference/formats/
transformation-grammar.md`). The archive source formats the mark loosely: `44.dgrammar.txt` line
16 writes `= 0` with a leading space, and some lines carry a trailing space before the semicolon
(`BLK )`) — the importer trims whitespace around tokens, so these are not separate operators.

## Where eng has no export

`data/languages/eng/grammar/disambiguation.yaml` holds `[]`. `data/archive/manifest.jsonl` lists
one `*.dgrammar.txt` export per language for every language the mirror has pulled a D-grammar for
(afr, ara, bul, chi, hrv, dut, est, ger, hun, ita, khm, lat, may, pan, pol, rum, rus, srp, slo,
slv, swe, tur, ukr) — `eng` is absent from that set entirely, not just thin. Nothing in the
archive's public pages, wiki or UNLarium exports for `eng` names a D-grammar file waiting to be
mirrored; the gap is the archive's, not the mirror's.

**Decision:** the M3 rule interpreter (issue 22) treats an empty `disambiguation.yaml` as "this
language has no disambiguation rules, so the first candidate sense for each word wins, in
dictionary order."

That sentence is the fallback issue 22 implements and issue 22's tests check directly. If a future
mirror pass finds an `eng` D-grammar export on unlarchive.org, a new issue imports it and this
fallback then applies only to languages still without one.

Source: UNL Archive, https://unlarchive.org/grammars/44.dgrammar.txt, CC BY-SA 2.5 CH,
and https://unlarchive.org/grammars/47.dgrammar.txt, CC BY-SA 2.5 CH
(manifest lines: `data/archive/manifest.jsonl:1195` and `data/archive/manifest.jsonl:1197`).
