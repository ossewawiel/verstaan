# Tagset

The tagset is the UNDL Foundation's shared vocabulary of feature tags: the values that fill the
`FEATURE LIST` in a dictionary entry (`docs/unl-reference/formats/dictionary.md`) and the
conditions in a grammar rule (`docs/unl-reference/formats/transformation-grammar.md`). Every tag
is a three-character-or-shorter mnemonic in upper case, arranged in a hierarchy: a value like
`PGS` (progressive) sits under an attribute like `ASP` (aspect), which sits under no attribute at
all — attributes are the tree's top level. Verstaan's own tagset lives at
`data/languages/<iso3>/tagset.yaml`; this page describes the archive's tagset, the source the
importer reads from.

## Categories and the values each real export uses

The table below groups the 501 tags this reference checked into the categories the wiki's own
`Tagset.wikitext` page defines, then lists every value both the Afrikaans and the English exports
actually assign to real dictionary entries or reference in a real grammar file (not merely every
value the wiki's tree enumerates as theoretically possible).

| Category (attribute) | Values confirmed in the Afrikaans and English exports |
|---|---|
| Lexical category (`LEX`) | `A` (adverb), `D` (determiner), `J` (adjective), `N` (noun), `P` (adposition), `R` (pronoun), `V` (verb) |
| Part of speech (`POS`) | `AAV` (adjunct adverb), `AAV`/`SAV` (specifier adverb), `ADJ`, `ART`, `AUX`, `COO`, `NOU`, `PPN`, `PPR`, `PRE` (preposition — every real line in the English sample), `VER` |
| Lexical structure (`LST`) | `WRD` (simple word), `MTW` (multiword), `ABB` (abbreviation) |
| Inflectional paradigm (`PAR`) | `M0` (invariant), `M1` (irregular, rules in the entry), `M2`-`M16`+ (regular paradigms, see `inflection.md`) |
| Subcategorisation frame (`FRA`) | `Y0` (avalent), `Y38`, `Y259`, and the full `Y`-series, see `subcategorisation.md` |
| Semantic class (`SEM`) | `MAN` (manner), `PLC` (place), `TIM` (time) |
| Semantic frame (`SFR`) | `K0` |
| Lemma and base form | `LEMMA`, `BF` — attribute names, not values, that carry the string headword directly rather than a tagset code |
| Language, frequency, priority | `af`, `en` — the two-letter codes the exports actually use, see the disagreement in `dictionary.md` |

This is a sample, not the whole 501-tag inventory: the two dictionary exports checked for this
issue are single alphabetic runs (Afrikaans adverbs starting `aan`-`anders`; English prepositions
starting `aboard`-`above`) and do not exercise every category the canonical tagset export defines
— no entry in either sample carries a case tag, a mood tag, or a register tag, for instance. The
canonical list below is the full inventory the archive's tagset export actually serves.

## Where the export adds tags the wiki tree does not define

The wiki's `Tagset.wikitext` page draws a tree of attributes and values, by hand. The archive also
serves a live, generated export of the same tagset
(`unlarium/dictionary/export_tagset.php`), and the two do not fully agree. Six disagreements,
found while comparing the two sources, are documented below. A full tag-by-tag audit of all 501
export tags against the wiki tree is still open work.

Three of the six reach the dictionary exports as well, because the two archive exports are ten
years apart. The tagset export carries the header "Version of September 11, 2026". The Afrikaans
and English dictionary zips hold files stamped 5 February 2016. The older dictionary files still
assign three semantic-class codes that the newer tagset renamed. A validator that checks a
dictionary entry against the live tagset rejects all three. The importer rewrites them on the way
into the store (issue 167):

| The dictionary export writes | The live tagset defines | Entries (afr + eng) |
|---|---|---|
| `SEM=ATT` | `SEM=ATR` — attribute | 15940 |
| `SEM=SOV` | `SEM=SOC` — social | 13214 |
| `SEM=REL` | `SEM=RLT` — relation | 2150 |

- **`RLT`, not `REL`, for the nominal class "relation".** The wiki tree lists the nominal concept
  category "relations between people or things or ideas" under the code `REL`. The real export
  defines that same concept as `RLT` ("relation — nouns denoting relations between people or
  things or ideas"). `REL` does not appear in the export at all. A rule-author who writes `SEM=REL`
  from the wiki page produces a tag the live tagset does not recognise; `SEM=RLT` is correct. The
  2016 dictionary exports write `SEM=REL` too, on nouns such as `antipode`, `tangent`,
  `component part` and Afrikaans `verhouding` 'relation'. Six newer entries in the same exports
  already carry `SEM=RLT`. The importer maps `SEM=REL` to `SEM=RLT`.
- **`ATR`, not `ATT`, for the nominal class "attribute".** The 2016 dictionary exports write
  `SEM=ATT`. Every entry that carries it is a noun: `LEX=N` and `POS=NOU` hold on all 15940, in
  both languages. The set is the WordNet `noun.attribute` file nearly word for word — the
  deadjectival nouns `directness`, `handsomeness`, `subjectivity`, `plausibleness`, the colour
  terms `olive drab` and `cherry red`, and Afrikaans `aandag` 'attention', `aangenaamheid`
  'pleasantness', `afmeting` 'dimension'. `ATT` does not appear in the export. `ATR` ("attribute —
  nouns denoting attributes of people and objects") names that same class, and 24 newer entries in
  the same two exports already use it. The importer maps `SEM=ATT` to `SEM=ATR`.
- **`SOC`, not `SOV`, for the verbal class "social".** The 2016 dictionary exports write `SEM=SOV`
  on 13214 entries. 13170 of them are verbs of political and social activity: `abdicate`,
  `adjudicate`, `nominate`, `decolonise`, `rein in`, and Afrikaans `regeer` 'govern', `afdwing`
  'enforce', `stig` 'found'. `SOV` does not appear in the export. `SOC` ("social — verbs of
  political and social activities and events") appears in the export and on no dictionary entry at
  all. The two names describe one class, one name per vintage. The old name followed the
  verb-class pattern the export keeps elsewhere — `BOV` body, `CGV` cognition, `CMV` communication,
  `POV` possession — and the export dropped that pattern for this one class. The importer maps
  `SEM=SOV` to `SEM=SOC`. The other 44 entries are noun and adjective homographs of the same verbs
  (`decoy`, `embargo`, `financier`) that inherited the verb's class in the archive. They take
  `SOC` with the rest: the mapping rewrites a value and never reads the entry's category.
- **`FOR` (formal register) is undocumented.** The export defines `FOR = formal (A form that is
  used only in formal register.)`, alongside the register values the wiki does list (`ARC`, `CLQ`,
  `DIA`, `JGN`, `LIT`, `PEJ`, `SLG`, `TAB`). The wiki tree's `REG` (register) branch has no `FOR`.
- **`NEO` (neologism) and `LOA` (loanword) are undocumented.** Both are register-like word tags
  the export defines (`to google`, `café (en)` as its own examples) that the wiki's `REG` branch
  omits entirely.
- **`TXTA`, `NOUA`, `X` and `XXX` have no place in the wiki tree.** The export defines
  `TXTA` (text structure attributes: `@entry`, `@title`, `@topic`), `NOUA` (nominal attributes:
  `@about`, `@of`), `X` ("any head": nouns, verbs, adjectives, adverbs), and `XXX` ("other semantic
  classes": integers, fractions, quantifiers). None of the four appears anywhere in the wiki's
  attribute tree, though all four are live, defined tags a real dictionary or grammar entry can use.

A rule-author who needs one of these ten tags should treat the export as authoritative and this
page's list as the record of the gap, not wait for the wiki to catch up. The same rule settles the
vintage mismatch: where a 2016 dictionary entry and the 2026 tagset disagree, the tagset wins.
`ATT`, `SOV` and `REL` each map onto a code the live tagset already defines, so issue 167 added no
new row to `data/languages/<iso3>/tagset.yaml`. `ATR`, `SOC` and `RLT` are all there already.

### A second pass: three more renames, two wiki-only tags, one export artifact

Issue 167 settled `ATT`, `SOV` and `REL`. A whole-store validation run straight afterwards found
five more codes on real `afr` and `eng` records that the live tagset does not define, and one
token that is not a tag at all. Issue 171 resolved each. Three of the five are the same kind of
vintage rename as the three above:

| The dictionary or grammar export writes | The live tagset defines | Records (afr + eng) |
|---|---|---|
| `PER=3PE` | `PER=3PER` — third person | 80 |
| `PER=2PE` | `PER=2PER` — second person | 20 |
| `POS=CCJ` | `POS=COO` — conjunction (coordinating) | 6 |

- **`3PER` and `2PER`, not `3PE` and `2PE`, for person with the number left open.** This page's
  own opening sentence says every tag is three characters or shorter. The live tagset breaks that
  rule in exactly one branch: `1PER`, `2PER` and `3PER` are four characters long. The 2016
  dictionary export writes the three-character truncations. The person tags that also mark number
  are already three characters, so they cross the ten years untouched — the English store holds
  25015 entries on `PER=3PS` and not one validation error against it. Only the number-neutral
  tags truncate. The entries confirm the reading. All 20 `PER=2PE` entries are `you`, which is the
  export's single example for `2PER` ("second person: *you (en)*"). `PER=3PE` sits on the
  possessives and the relative and interrogative pronouns — `his`, `hers`, `its`, `their`,
  `theirs`, `who`, `whom`, `which`, `that`, `more`, `most` — where person is fixed and number is
  deliberately open. That is what `3PER` names and what `3PS` and `3PP` cannot say. Five of the 25
  headwords in the set read as first or second person to a speaker: `mine`, `our`, `your`, `yours`
  and `oneself`. The archive tags a possessive by the agreement of the thing possessed, not by the
  possessor, so the export files all five under `3PE` as well. The rename follows the export and
  re-judges nothing, the same discipline issue 167 applied to the 44 `SOV` homographs. No entry in
  either language writes `1PE`: the archive has no number-neutral first person. The importer maps
  `PER=3PE` to `PER=3PER` and `PER=2PE` to `PER=2PER`. The attribute stays `PER` in both cases;
  only the value changes.
- **`COO`, not `CCJ`, for the coordinating conjunction.** Afrikaans generation rules 33 and 34
  turn the UNL relations `and(%x;%y)` and `or(%x;%y)` into the words `en` and `of`, and tag the
  word they insert `LEX=C,POS=CCJ`. The live export defines six conjunction classes — `AVR`
  (adverbializer), `CMR` (complementizer), `COO` (coordinating), `CRC` (correlative), `RVZ`
  (relativizer), `SCJ` (subordinating) — and `CCJ` is not among them in any vintage. `COO`
  ("conjunction (coordinating) — a conjunction that links constituents without syntactically
  subordinating one to the other") carries the example *and*, which is the very word rule 33
  generates. Four further rules write `CCJ` bare, with no attribute in front of it:
  `(C,CCJ,^XP,^proj)` and `(CB,^CCJ,^proj,^XP,%cb)` appear in both `afr/grammar/analysis.yaml` and
  `eng/grammar/analysis.yaml`. `tools/validate`'s feature pattern reads `ATTR=VALUE` pairs only,
  so it flags the two attributed uses and never sees the four bare ones. The importer renames all
  six, wherever `CCJ` stands as a whole token: one tag deserves one spelling inside one store, and
  fixing only what the validator happens to read would leave the other spelling to surprise the
  M3 rule interpreter.

Two of the five go the other way. The wiki tree defines them, the live export drops them, and the
2016 dictionary export uses them.

- **`JJJ` (other adjectives) and `AAA` (other adverbs) stay, as wiki-only tags.** The wiki tree's
  "Adjective concepts" branch lists seven named classes — `AGE`, `COR`, `DMS`, `HPP`, `PHY`,
  `SPD`, `VLE` — and then a catch-all, `JJJ`. Its "Adverbial concepts" branch lists `DGR`, `MAN`,
  `PLE`, `TME`, then `AAA`. The live export defines all eleven named classes and neither catch-all.
  It dropped the two buckets and renamed nothing, so there is no rename to make. The entries show
  why no rename would work: `SEM=JJJ` covers 62 English and 34 Afrikaans adjectives that share no
  semantic class at all — `loud` is a physical property, `low` a dimension, `busy` a human
  propensity, `Jewish` a pertainym, `former` and Afrikaans `vorige` 'previous' neither. Sorting
  those 96 entries into `PHY`, `DMS` and `HPP` is lexicography, one judgment per entry, not a
  rename. `SEM=AAA` holds six entries: `just`, `merely` and `only`, three focus adverbs that are
  none of degree, manner, place or time. `SEM=XXX` ("others") was the alternative and it loses:
  the export's own examples for `XXX` are integers, fractions, quantifiers and pronouns, and 207
  English entries already use it in that closed-class sense. Folding adjectives into it would
  destroy a distinction the store still holds. Issue 171 therefore keeps both codes verbatim and
  adds one row per code to `data/languages/afr/tagset.yaml` and `data/languages/eng/tagset.yaml`,
  sourced to `wiki/Tagset.wikitext` rather than to the export, with the comment
  `docs/standards/data.md` requires. `tools/importer/tagset.py` reads the export and writes that
  file, so it must re-emit both rows; a plain re-import would otherwise drop them again.

Issue 167's closing rule needs one qualification after this. Where a 2016 entry and the 2026
tagset name the same class differently, the tagset wins. Where the tagset never mentions the code
at all, there is nothing to win against, and the wiki definition stands.

### `00` is not a tag

Fourteen English entries carry a feature written `00`, with no attribute and no `=`: `one`,
`that`, `whatever`, `which`, `who`, `whoever` and `whomever`, each twice. The raw archive line for
the first of them reads

```
[one]{531286}"00"(LEMMA=one,BF=one,LEX=R,POS=NPR,LST=WRD,NUM=SNGT,PER=3PS,PAR=M0,FRA=Y0,00)<en,255,255>;
```

`00` is no mnemonic in the live export, in the wiki tree, or in any other vintage. It is the
entry's own `uw` field, printed a second time at the end of the feature list. Two counts settle
it. Exactly seven lines in `en_ana_u_c_ucl.zip` have the bare placeholder `"00"` as their UW, and
all seven carry the trailing `,00)`. Exactly seven lines carry the trailing `,00)`, and all seven
have `"00"` as their UW. The correlation is total, in both directions. The neighbouring pronoun
entries prove the token is not a missing class: `[which]{531337}"00.@wh"` and
`[who]{531268}"00.@wh"` hold a UW with attributes, close cleanly on `SEM=XXX,SFR=K0)`, and carry
no trailing token. Only the bare placeholder leaks. `00` is a real UNL UW for a pronoun — the
English export writes `00.@wh`, `00.@3.@pl`, `00.@2.@polite.@singular` and dozens more — and the
serialiser that built these seven lines put it where a semantic class would sit.

The importer drops the token. It keeps the entry, the entry keeps `uw: "00"`, and the information
the token repeats is therefore still in the record, one field away. `docs/standards/data.md`
forbids deleting an archive-derived *record* to fix a bug; it says nothing about a serialiser
echo inside one. The distinction matters and holds here: no record disappears, no field empties,
the verbatim archive line stays under `data/archive/`, and each entry's `source.archive_path` and
`source.line` still point straight at it. A reader who wants the raw form has it. Nothing is added
to `REFERENCE_VALUED_ATTRIBUTES` in `tools/validate/store.py`: an attribute the importer never
writes needs no skip rule, and adding one would be dead configuration that hides a real `00`
should a later export ever mean something by it.

## Grammar-related attributes

Five tags name the fields that link a dictionary entry to a grammar file, rather than describing
the word itself:

| Tag | Meaning | Points into |
|---|---|---|
| `FLX` | Inflectional rules, inline in the entry | An A-rule, see `inflection.md` |
| `FRA` | Subcategorization frame number | The `Y`-series grammar export, see `subcategorisation.md` |
| `GOV` | Subcategorization rule, inline in the entry | An S-rule |
| `PAR` | Inflectional paradigm number | The `M`-series grammar export, see `inflection.md` |
| `SFR` | Semantic frame number | The UNL grammar |

Source: UNL Archive, data/archive/wiki/Tagset.wikitext,
https://unlarchive.org/wiki/api.php?action=query&prop=revisions&titles=Tagset, CC BY-SA 4.0.
Checked against data/archive/exports/export_tagset.php (manifest `exports/export_tagset.php`,
https://unlarchive.org/unlarium/dictionary/export_tagset.php, CC BY-SA 2.5 CH),
data/archive/exports/afr/af_ana_u_c_ucl/af_ana_u_c_ucl_1.txt and
data/archive/exports/eng/export_cc.php (both cited in full in `dictionary.md`).
The 2016 stamp on the dictionary side comes from the zip members' own dates, e.g.
data/archive/exports/eng/en_ana_u_c_ucl.zip and data/archive/exports/afr/af_ana_u_c_ucl.zip.
