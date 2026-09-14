# Default-Grammar Format

The default grammar is the one language-independent transformation grammar the archive loads
after every language-specific grammar, to catch what the language grammar does not cover. It only
ever runs as a transformation grammar (see `docs/unl-reference/formats/transformation-grammar.md`)
and it only ever runs in one direction: there is a default grammar for analysis (NL to UNL) and a
separate one for generation (UNL to NL). Verstaan mirrors both, unmodified by language: the same
file, byte for byte, is served for Afrikaans and for English.

## The analysis default grammar's six sections

The NL-to-UNL default grammar runs its rules in this fixed order, each section a distinct rule
type from `transformation-grammar.md`:

| Order | Section | Rule type | Does |
|---|---|---|---|
| 1 | Pre-processing | `LL` | Prepares the raw word list: merges adjacent proper-name nodes, normalises punctuation and time expressions, deletes blank spaces once they have done their job. |
| 2 | Parsing | `LT` | Builds a surface syntax tree from the word list, following X-bar theory: complementation, adjunction, specification. |
| 3 | Transformation | `TT` | Converts the surface tree into a deep tree, moving constituents that the surface order hides, e.g. the subject of a negated verb phrase. |
| 4 | Dearborisation | `TN` | Converts the tree into a network: rewrites X-bar relations (`XP`, `XB`) as head-driven syntactic relations (`XS`, `XC`, `XA`). |
| 5 | Interpretation | `NN` | Maps the syntactic network onto a semantic network by reading each argument's own features, e.g. a node tagged `tim` turns a generic syntactic relation into the semantic relation `tim`. |
| 6 | Post-processing | `NN` | Cleans up the finished UNL graph: removes redundant attribute combinations, e.g. `@pl` next to `@multal`, since `@multal` already implies plural. |

## The generation default grammar's six sections

The UNL-to-NL default grammar runs the same idea backwards, through the same three data
structures in the opposite order:

| Order | Section | Rule type | Does |
|---|---|---|---|
| 1 | Pre-processing | `NN` | Prepares the UNL graph for arborisation. |
| 2 | Arborisation | `NT` | Converts the semantic network into a syntactic tree — the reverse of dearborisation. |
| 3 | Transformation | `TT` | Converts the deep syntactic structure into the surface structure, e.g. moving a specifier back to its surface position. |
| 4 | Linearisation | `TL` | Converts the tree into a word list. |
| 5 | Morphological generation | `LL` | Triggers every inflectional rule the word's dictionary entry or paradigm carries, via the `!<ATTRIBUTE>` operand (see `docs/unl-reference/formats/inflection.md`). |
| 6 | Post-processing | `LL` | Removes leftover scopes, inserts blank spaces and commas, capitalises the sentence-initial word. |

## Worked example: three real rules from the shared default grammar

The first two rules are from `nl_unl_tgrammar.txt`, the analysis default grammar both the
Afrikaans and English mirrors serve, byte-identical (same SHA-256 in the manifest for both
languages — confirming it truly is one shared file, not two copies that happen to agree today).
The third is from `unl_nl_tgrammar.txt`, the generation default grammar, equally shared.

**Pre-processing — merge a broken time expression:**
```
(DIGIT,^HOUR,^MINUTE,%h)(":",%a)(DIGIT,^MINUTE,^SECOND,%m):=(%h,+HOUR)(%a)(%m,+MINUTE); by default DD:DD = HH:MM
```
An `LL` rule: two digit nodes separated by a colon, neither yet tagged `HOUR` or `MINUTE`, are
tagged as such by default, so "9:30" is read as 9 hours 30 minutes unless a language grammar has
already decided otherwise upstream.

**Parsing — build an intermediate verbal projection:**
```
(VB,%vb)({NP|PP|JP},%xp):=(VB(%vb,+proj;%xp,+comp,+proj),+XB=VB,+LEX=V,%new);
```
An `LT`-shaped rule: an existing verbal-bar node `%vb` next to a noun, prepositional or adjective
phrase `%xp` (matched by the `{NP|PP|JP}` disjunction) combines into a new verbal-bar node, with
`%xp` marked as its complement (`+comp`). This is the X-bar complementation step that turns
"killed" plus "Mary" into the intermediate projection "killed Mary".

**Morphological generation — the one rule that triggers every inflection:**

From `unl_nl_tgrammar.txt`, the generation-direction default grammar:
```
(%x,^inflected,FLX):=(%x,!FLX,+inflected);
```
This single `LL` rule is the entire morphological-generation section: any node not yet marked
`inflected` that carries an `FLX` rule runs it (`!FLX`), then marks itself `inflected` so the rule
does not fire twice. This is the same trigger mechanism `inflection.md` describes for a dictionary
entry's inline `FLX` rules and for a paradigm's `PAR=Mxx` rules copied onto the entry during
generation.

## Check against the wiki

The wiki names the parsing section's five steps "Complementation, Adjunction, Specification,
Maximal projection, Intermediate projection"; the real export runs them under the single header
"2. PARSING (ARBORIZATION)" without restating the five sub-steps as separate comment blocks, but
the rules themselves — complementation first, by node count — match the wiki's own worked example
rule for rule. No disagreement found in rule syntax or section order between the wiki page and the
real shared grammar file.

Source: UNL Archive, data/archive/wiki/Default_grammar.wikitext,
https://unlarchive.org/wiki/api.php?action=query&prop=revisions&titles=Default grammar,
CC BY-SA 4.0. Checked against data/archive/exports/eng/nl_unl_tgrammar.txt and
data/archive/exports/afr/nl_unl_tgrammar.txt (manifest `exports/eng/nl_unl_tgrammar.txt` and
`exports/afr/nl_unl_tgrammar.txt`, both from https://unlarchive.org/grammars/nl_unl_tgrammar.txt,
CC BY-SA 2.5 CH, identical SHA-256 across both language mirrors).
