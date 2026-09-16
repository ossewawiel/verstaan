# Dictionary Entry Format

A dictionary entry is one line: a headword, an id, an optional Universal Word, a feature list,
and a `<language, frequency, priority>` triple. The archive builds four dictionaries from this
one syntax: the UNL Dictionary (UD, UWs only), the NL Dictionary (ND, one language's words), the
Generation Dictionary (GD, UNL to NL), and the Analysis Dictionary (AD, NL to UNL). Verstaan's
importer reads GD and AD exports; this page describes the line format itself, not the importer.

## Formal syntax

```
<UNL-NL Dictionary entry> ::= "[" <NLW> "]" "{" <ID> "}" """ <UW> """ "(" <FEATURE LIST> ")"
                               "<" <FLG> "," <PRI> "," <FRE> ">;"
<NLW>          ::= <SIMPLE NLW> | <COMPOUND NLW> | <REGULAR EXPRESSION>
<ID>           ::= <positive integer>
<UW>           ::= <text> | <REGULAR EXPRESSION>
<FEATURE LIST> ::= <FEATURE> ( "," <FEATURE> )*
<FEATURE>      ::= <VALUE> | <ATTRIBUTE> "=" <VALUE> | <RULE LIST> | "#" <SUBNLWID> <FEATURE LIST>
<ATTRIBUTE>    ::= <text>
<VALUE>        ::= <text> ( "&" <text> )*
<FLG>          ::= ISO 639-3 language code
<PRI>          ::= 0-255
<FRE>          ::= 0-255
```

Every field, named:

| Field | Holds | Notes |
|---|---|---|
| `NLW` | The natural-language word, in `[brackets]`. A simple word, a compound `[[a][b]]`, or a regular expression `[/re/]`. | Analysis dictionaries key on this field. |
| `ID` | The entry's primary key, in `{braces}`. | One dictionary can hold several entries with the same `NLW` and different `ID`s, one per sense. |
| `UW` | The Universal Word, in `"quotes"`. A UCL string (`book(icl>publication)`) or a UCN numeric code. Empty for entries that carry no UW, e.g. punctuation. | See "Disagreement" below: the real exports do not always match this. |
| `FEATURE LIST` | Comma-separated tags from the tagset (`docs/unl-reference/formats/tagset.md`), attribute-value pairs (`POS=NOU`), or inflection rules (`FLX(PLR:=0>"s")`). | `#01(...)`, `#02(...)` scope a feature list to one sub-word of a compound `NLW`. |
| `FLG` | The three-letter language code. | See "Disagreement" below. |
| `FRE` | Frequency, 0-255. Used only for analysis (which NL word to prefer for a given surface form). | |
| `PRI` | Priority, 0-255. Used only for generation (which NL word to prefer for a given UW). | |
| `;` and trailing text | Terminator, then a free-text comment to the end of the line. | Not machine-read. |

## Worked example: three real Afrikaans lines

From the Afrikaans-UNL Unabridged Analysis Dictionary of Common Words, UCL export, file 1:

```
[aan]{22319}"400068368"(LEMMA=aan,BF=aan,LEX=A,POS=AAV,LST=WRD,PAR=M0,FRA=Y0,SEM=MAN)<af,2,0>;
[aanhou]{25928}"400143068"(LEMMA=aanhou,BF=aanhou,LEX=A,POS=AAV,LST=WRD,PAR=M0,FRA=Y0,SEM=MAN)<af,2,0>;
[alleen]{28823}"400004722"(LEMMA=alleen,BF=alleen,LEX=A,POS=SAV,LST=WRD,PAR=M0,FRA=Y0,SEM=MAN,SFR=K0)<af,10,0>;
```

Field by field:

| | `NLW` | `ID` | `UW` | `FEATURE LIST` | `FLG` | `FRE` | `PRI` |
|---|---|---|---|---|---|---|---|
| Line 1 | `aan` | `22319` | `400068368` | `LEMMA=aan, BF=aan, LEX=A` (adverb), `POS=AAV` (adverb, adjunct use), `LST=WRD` (simple word), `PAR=M0` (invariant paradigm), `FRA=Y0` (avalent, no subcategorisation), `SEM=MAN` (manner) | `af` | `2` | `0` |
| Line 2 | `aanhou` | `25928` | `400143068` | Same shape, `SEM=MAN` | `af` | `2` | `0` |
| Line 3 | `alleen` | `28823` | `400004722` | `POS=SAV` (specifier adverb, e.g. "very"), `SFR=K0` (a semantic frame reference) added on top of the usual set | `af` | `10` | `0` |

## Worked example: three real English lines

From `export_cc.php`, the English Analysis Dictionary in UCL export (alphabetic run, prepositions):

```
[aboard] {516110} "534001" (LEMMA=aboard,BF=aboard,LEX=P,POS=PRE,LST=WRD,PAR=M0,FRA=Y259) <en, 0, 0>;
[about] {515821} "119402" (LEMMA=about,BF=about,LEX=P,POS=PRE,LST=WRD,PAR=M0,FRA=Y259) <en, 0, 0>;
[above] {515753} "118441" (LEMMA=above,BF=above,LEX=P,POS=PRE,LST=WRD,PAR=M0,FRA=Y259) <en, 0, 0>;
```

Field by field:

| | `NLW` | `ID` | `UW` | `FEATURE LIST` | `FLG` | `FRE` | `PRI` |
|---|---|---|---|---|---|---|---|
| Line 1 | `aboard` | `516110` | `534001` | `LEX=P` (adposition), `POS=PRE` (preposition), `LST=WRD`, `PAR=M0` (invariant), `FRA=Y259` (the complement of the preposition is a noun phrase, see `subcategorisation.md`) | `en` | `0` | `0` |
| Line 2 | `about` | `515821` | `119402` | Same shape | `en` | `0` | `0` |
| Line 3 | `above` | `515753` | `118441` | Same shape | `en` | `0` | `0` |

## Where the exports disagree with the wiki

Two disagreements, both about fields the wiki page states as fixed. The export wins in both.

**`FLG` is two letters, not three.** The wiki's formal syntax names `FLG` an ISO 639-3 (three-letter)
code. Every real line in both the Afrikaans and the English exports uses the two-letter form
instead: `af`, not `afr`; `en`, not `eng`. A rule-author reading `<af,2,0>` in a live export must
not treat the two-letter code as a typo: it is the archive's actual practice, consistently, across
every project file checked (`af_ana_u_c_ucl`, `export_cc.php`). Verstaan's own store keys
languages by ISO 639-3 (`data/languages/afr/`, `data/languages/eng/`); the importer is the layer
that must translate two-letter export codes to three-letter store codes, not this reference.

**The `UW` field holds a UCN, not the UCL string the export's own filename promises.** The
Afrikaans file is named `af_ana_u_c_ucl` — "unabridged, common, UCL format" — and its header
repeats "UCL format". UCL (Universal Words in Concept List) is the human-readable string form,
`book(icl>publication)`. Every entry's `UW` field, in both the Afrikaans and the English samples
above, holds a bare numeric code instead (`400068368`, `534001`): a UCN (Universal Concept
Number), the machine-readable form the wiki's own `Dictionary.wikitext` page also permits
("The UW may be represented by the corresponding UCL or UCN"). The filename and header claim UCL;
the content is UCN. A rule-author reading these exports resolves the UW field as an opaque numeric
key into a separate UW-to-UCL lookup, not as a parseable UCL string.

**A compound `NLW`'s `#01(...)`/`#02(...)` sub-word scope holds its own nested `FEATURE LIST`,
comma-separated like the outer one, and a `VALUE` inside that outer list can itself hold a
literal comma the archive never escapes.** Real example, `en_gen_u_c_ucl`, `[[earth] [up]]`,
id 443140: `(LEMMA=earth up,BF=earth,LEX=V,POS=VER,LST=MTW,TRA=TST,#01(LEMMA=earth
up,BF=earth,LEX=V,POS=VER,PAR=M16,FRA=Y38),#02(BF=up),SEM=CTC)`. `#02`'s own list is one
attribute-value pair, `BF=up`, describing the second sub-word ("up"), not a feature named `#02`.
Issue 169 fixes the importer to parse both shapes: `#NN(...)` recursively, and a comma inside an
unparenthesised value (e.g. the headword `[Bouillon, België]`'s `LEMMA=Bouillon, België`) as part
of that value, not a new feature.

Source: UNL Archive, data/archive/wiki/Dictionary.wikitext,
https://unlarchive.org/wiki/api.php?action=query&prop=revisions&titles=Dictionary, CC BY-SA 4.0.
Checked against data/archive/exports/afr/af_ana_u_c_ucl/af_ana_u_c_ucl_1.txt (from
data/archive/exports/afr/af_ana_u_c_ucl.zip, manifest `exports/afr/af_ana_u_c_ucl.zip`,
https://unlarchive.org/dics/af_ana_u_c_ucl.zip) and data/archive/exports/eng/export_cc.php
(manifest `exports/eng/export_cc.php`, https://unlarchive.org/unlarium/dictionary/export_cc.php),
both CC BY-SA 2.5 CH.
