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
(`unlarium/dictionary/export_tagset.php`), and the two do not fully agree. Four disagreements,
found while comparing the two sources, are documented below. A full tag-by-tag audit of all 501
export tags against the wiki tree is still open work.

- **`RLT`, not `REL`, for the nominal class "relation".** The wiki tree lists the nominal concept
  category "relations between people or things or ideas" under the code `REL`. The real export
  defines that same concept as `RLT` ("relation — nouns denoting relations between people or
  things or ideas"). `REL` does not appear in the export at all. A rule-author who writes `SEM=REL`
  from the wiki page produces a tag the live tagset does not recognise; `SEM=RLT` is correct.
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

A rule-author who needs one of these eight tags should treat the export as authoritative and this
page's list as the record of the gap, not wait for the wiki to catch up.

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
