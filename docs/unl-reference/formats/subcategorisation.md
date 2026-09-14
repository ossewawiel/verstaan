# Subcategorisation Format

Subcategorisation names the arguments a word needs to project the smallest possible phrase around
itself: a noun phrase, a verb phrase, an adjective phrase. "Apple" needs nothing — "apples" alone
is a well-formed noun phrase. "Give" needs a subject and two objects even when a sentence leaves
one implicit ("I gave the book" — a recipient exists, just unstated). Subcategorisation records
only these necessary arguments, never the optional ones: "Peter killed Mary yesterday in the
kitchen" subcategorises "killed" for a subject and an object, not for "yesterday" or "in the
kitchen", because "Peter killed Mary" is already a complete verb phrase without them.

## Subcategorisation frames and rules

Exactly parallel to inflectional paradigms and rules (`docs/unl-reference/formats/inflection.md`):
a subcategorisation frame is a numbered, shared pattern referenced from a dictionary entry by
number (`FRA=Y38`), used when many words share the same argument structure. A subcategorisation
rule is the same S-rule syntax written inline in one entry, used when the pattern is too specific
to share — a fixed idiom like "throw someone to the lions", where the second object is not just
any noun phrase but the fixed string "to the lions".

## Syntax

```
<HD SYNTACTIC ROLE> "(" <ARGUMENT> ")" ";"
```

`<HD SYNTACTIC ROLE>` is a head-driven syntactic role: `VS` (specifier of a verbal phrase, usually
the subject), `VC` (complement of a verbal phrase, usually an object), `NC` (complement of a noun
phrase), `JC` (complement of an adjective phrase), `AC` (complement of an adverbial phrase), and
so on for every phrase type in the tagset's syntactic-role branch. `<ARGUMENT>` is the maximal
projection the role must be filled with (`NP`, `PP`, `VP`...), optionally narrowed by tagset
features (`NP,NOM` — a noun phrase in the nominative case) or fixed to a specific headword
(`PH([of])` — a prepositional phrase headed by the entry `[of]`) or a literal string (`"to the
lions"` for a fixed complement not itself in the dictionary). One rule per required argument; a
ditransitive verb's frame chains two: `VS(NP)VC(NP)VC(NP);`.

## Worked example: three real English frames

From `export_grammar.php?type=Y&lang=en`, the English subcategorisation-frame export, the
catalogue `FRA=Yxx` values point into:

**`Y38` — direct transitive verb** (*accept, accomplish, acknowledge*):
```
VS(NP)VC(NP);
```
One specifier (the subject, a noun phrase) and one complement (the object, a noun phrase). This is
the frame the dictionary example in `dictionary.md`'s companion page cites for "choose" and
"kill": any plain transitive verb without a fixed preposition points here.

**`Y42` — indirect transitive verb selecting the preposition "to"** (*appeal, pertain*):
```
VS(NP)VC(PH([to]));
```
One specifier (a noun phrase subject), one complement that is not a bare noun phrase but a
prepositional phrase headed specifically by the dictionary entry `[to]`. `PH([to])` says: the
complement must be a PP, and that PP's head must be the exact word "to", not any preposition.

**`Y259` — the complement in a prepositional phrase is a noun phrase** (*book of [Peter]; book
about [Peter]*):
```
PC(NP);
```
This is the frame the real English dictionary sample in `dictionary.md` cites for "aboard",
"about" and "above" (`FRA=Y259`): every preposition in that sample takes a noun phrase as its
complement, with no further restriction on which preposition or which noun.

## Check against the wiki

All three real frames use the exact `<HD SYNTACTIC ROLE>(<ARGUMENT>);` shape the wiki page
defines, including the headword-fixed complement pattern (`PH([of])`) the wiki's own examples use
for "of", "in" and "on". No disagreement found between the wiki's subcategorisation syntax and the
real `Y`-series export. One gap worth flagging for a rule-author: the wiki page's own list of
"examples of subcategorization frames" does not use real frame numbers (it writes out the rules
inline, e.g. "Indirect transitive verbs selecting prepositional phrases headed by 'on'"); the real
export assigns those same patterns scattered, non-sequential numbers (`Y42`, `Y43`, `Y57`...) with
gaps in the sequence (no `Y2` through `Y30` appear in the export at all), so a rule-author cannot
assume frame numbers are dense or assigned in the wiki's presentation order.

Source: UNL Archive, data/archive/wiki/Subcategorization.wikitext,
https://unlarchive.org/wiki/api.php?action=query&prop=revisions&titles=Subcategorization,
CC BY-SA 4.0. Checked against data/archive/exports/eng/export_grammar.php__type_Y_lang_en
(manifest `exports/eng/export_grammar.php__type_Y_lang_en`,
https://unlarchive.org/unlarium/grammar/export_grammar.php?type=Y&lang=en, CC BY-SA 2.5 CH) and
data/archive/exports/eng/export_cc.php (FRA=Y259 entries, cited in full in `dictionary.md`).
