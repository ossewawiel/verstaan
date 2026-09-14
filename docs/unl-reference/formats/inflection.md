# Inflection Format

Inflection is a change to a word's base form that expresses tense, mood, voice, aspect, person,
number, gender or case, without changing its lexical category or its core meaning: "kill" and
"killed" are the same verb, "nation" and "nationalize" are not. The archive represents inflection
two ways, chosen by how many words share the same behaviour: an inflectional paradigm for regular
behaviour shared by many words, and an inflectional rule for irregular behaviour limited to one
word or a handful.

## Inflectional paradigms

A paradigm is a numbered, named set of A-rules (affixation rules), defined once in the grammar and
referenced from many dictionary entries by number: `PAR=M2`. The entry does not repeat the rule;
it points at it.

## Inflectional rules

A rule is the same A-rule syntax, but written inline in the one dictionary entry it exceptions,
under the attribute `INFR` (inflectional rule) or a language-specific inflection attribute like
`FLX`: `INFR=FLX(PAS:="brought"; PTP:="brought";)`. A rule fires only for its own entry; it is not
shared.

## Syntax

```
<RULE>      ::= <ATTRIBUTE> "(" <VALUE> ":=" <a-rule> ( ";" <VALUE> ":=" <a-rule> )* ")"
<ATTRIBUTE> ::= <text>
<VALUE>     ::= <text> ( "&" <text> )*
```

`<ATTRIBUTE>` names the tag that triggers the rule (`PLR`, `PAS`, or a hyper-attribute like `FLX`
that bundles several: `3PS&PRS&IND`, for English verbal morphology, where person, tense and mood
are conflated into one suffix). `<VALUE>` is the condition that must hold on the word for that
branch of the rule to fire. `<a-rule>` is the affixation itself, e.g. `0>"s"` (add "s" to the end)
or `"y">"ies"` (replace a trailing "y" with "ies"). A dictionary rule is triggered from the grammar
by `!<ATTRIBUTE>`: the grammar asks "does this word carry the feature this rule needs", and if so,
runs every branch of the named rule against the word's current form.

## Worked example: three real English paradigms

From `export_grammar.php?type=M&lang=en`, the English inflectional-paradigm export, the catalogue
`PAR=Mxx` values point into:

**`M2` — add "s" to form the plural** (*table>tables; boy>boys; computer>computers*):
```
SNG:=0>"";
PLR:=0>"s";
```
Two branches on one attribute, `NUM`. `SNG` (singular): insert nothing at position 0 (the end) —
the base form is already the singular. `PLR` (plural): insert "s" at position 0. This is the
paradigm cited from `M16`'s regular-verb siblings and from any regular English noun's dictionary
entry, e.g. `PAR=M2`.

**`M7` — replace "man" by "men" to form the plural** (*man>men; woman>women; airman>airmen*):
```
SNG:=0>"";
PLR:="man":"men";
```
The `PLR` branch here is a replacement, not an insertion: wherever the base form ends in the
string "man", replace that substring with "men". This is exactly the case the wiki's own examples
call out as too irregular for a shared paradigm becoming, instead, a named paradigm because enough
English words ("man", "woman", "policeman", "airman"...) follow it to be worth a shared number
rather than a rule copied into each entry.

**`M16` — regular verbs** (*kill > killed, killed, killing, kills*):
```
INF:=0>"";
PAS:=0>"ed";
PTP:=0>"ed";
3PS&PRS:=0>"s";
GER:=0>"ing";
```
Five branches, one attribute condition each (`INF`, `PAS`, `PTP`, the hyper-attribute `3PS&PRS`
for third-person-singular present, `GER`), each appending a fixed suffix at the end of the base
form. This is the paradigm the Afrikaans and English dictionaries both point at from thousands of
regular verb entries via `PAR=M16`, rather than writing five affixation rules per entry.

## Inflection or agglutination

The archive draws one firm line: inflection changes the base form itself (Latin *campus* to
*campi*); agglutination or concatenation adds an appendix that leaves the base form untouched
(English *John* to *John's*). A rule-author deciding which applies checks only this: did the base
form's own spelling change, or did something get attached beside it unchanged. Spanish gender
looks agglutinative at first glance (*profesor* to *profesor+a*) but is inflectional in the
archive's terms, because the masculine already carries a zero morpheme that the feminine "a"
replaces, exactly as Latin's *magister* to *magistra* does.

## Check against the wiki

The three real paradigms above match the wiki's `<RULE>` syntax exactly, including the
hyper-attribute case (`3PS&PRS`, matching the wiki's own worked example `1PS&PRS&IND`). No
disagreement found between the wiki's inflection-rule grammar and the real export.

Source: UNL Archive, data/archive/wiki/Inflection.wikitext,
https://unlarchive.org/wiki/api.php?action=query&prop=revisions&titles=Inflection, CC BY-SA 4.0.
Checked against data/archive/exports/eng/export_grammar.php__type_M_lang_en
(manifest `exports/eng/export_grammar.php__type_M_lang_en`,
https://unlarchive.org/unlarium/grammar/export_grammar.php?type=M&lang=en, CC BY-SA 2.5 CH) and
data/archive/exports/afr/af_ana_u_c_ucl/af_ana_u_c_ucl_1.txt (PAR=M0 entries, cited in full in
`dictionary.md`).
