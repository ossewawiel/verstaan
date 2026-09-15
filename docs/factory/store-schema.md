# Store schema

Every field `SPEC.md` §3.2 and §3.3 name, one row each, with the schema that checks it
(`tools/validate/schema/`) and what the archive gives `afr` and `eng` for it. Nothing else appears here.
`archive: none` rows cite the search or reference page that found the gap.

## Dictionary entry (`tools/validate/schema/dictionary-entry.schema.json`)

One record in `dictionary/<a-z>.yaml`.

| Field | Type | Archive (afr, eng) | Note |
|---|---|---|---|
| `headword` | string | present | Archive `NLW` field, without the `[brackets]`. |
| `id` | integer | present | Archive `ID` field, the entry's primary key. |
| `uw` | string | present, more than one shape | Archive `UW` field. The narrow sample `dictionary.md`'s "Where the exports disagree with the wiki" section checked held only a UCN (a numeric code), not the UCL string the export filename and header promise — but at scale (issue 18, 2026-09-15) real entries also hold a UCL string (`zero(equ>no)`) and a pronoun placeholder regex (`00.@2.@dual.@female`), matching `dictionary.md`'s own formal grammar (`<UW> ::= <text> \| <REGULAR EXPRESSION>`). The validator checks printable text, not a digit shape. |
| `features` | object | present | Archive `FEATURE LIST` field, as attribute-value pairs. |
| `lang` | string | two-letter | Archive `FLG` is two letters (`af`, `en`), not the ISO 639-3 the wiki's formal syntax names. The importer translates to iso3 for the store folder; whether the field itself is rewritten is not decided here (`docs/unl-reference/formats/dictionary.md`, "Where the exports disagree with the wiki"). |
| `frequency` | integer, 0-255 | present | Archive `FRE` field. |
| `priority` | integer, 0-255 | present | Archive `PRI` field. |
| `source` | object | computed, not archive-sourced | The importer writes `archive_path` and `line` as it reads each line. No archive field carries this; losing it is a validation error (`docs/standards/data.md`, "Provenance"). |

## Grammar rule (`tools/validate/schema/grammar-rule.schema.json`)

One record in `grammar/<kind>.yaml`.

| Field | Type | Archive (afr, eng) | Note |
|---|---|---|---|
| `id` | string | present for `Mxx`/`Yxx`; none for T-rules and D-rules | Inflection and subcategorisation rules carry a catalogue number (`M2`, `Y38`). T-grammar and disambiguation rules carry none; the importer assigns one. |
| `kind` | string, enum | derived, not a line field | `analysis \| generation \| inflection \| subcategorisation \| disambiguation \| default`. The importer derives it from which export a rule came from, not from anything written on the line. |
| `lhs` | string | present | The rule's left-hand side (`α`), exactly as the archive writes it — including any condition, since the archive never separates the two. |
| `rhs` | string | present, empty for frames | The rule's right-hand side (`β`). Empty string for a subcategorisation frame, which declares an argument structure and has no right side. |
| `conditions` | array of string | **embedded in lhs; empty at M2** | The archive's own T-grammar syntax (`docs/unl-reference/formats/transformation-grammar.md`) embeds negation (`^`) and disjunction (`{a\|b}`) inside the left-hand `<NODE>` list; it never states a pattern and a condition on that pattern as two fields. Decided (owner, 2026-09-14): the importer writes `conditions: []` and keeps `lhs` verbatim. The M3 rule interpreter decides whether it needs a split; if it does, a rule-author fills `conditions` from `lhs` in one deterministic pass. `SPEC.md` §3.2 carries the rule. |
| `comment` | string | present for T-rules; absent per-line for M/Y | T-rules carry a free-text comment after `;`. Paradigm (`M`) and frame (`Y`) catalogue entries carry no per-rule comment; the importer writes one from the paradigm's or frame's own description. |
| `source` | object | computed, not archive-sourced | Same shape and same reasoning as the dictionary entry's `source`. |

## Grammar rule kinds and their archive export

For `docs/architecture/archive-inventory.md`'s afr/eng row:

| `kind` | Archive export | afr | eng |
|---|---|---|---|
| `analysis` | `exports/<lang>/nl_unl_tgrammar.txt` | present | present |
| `generation` | `exports/<lang>/unl_nl_tgrammar.txt` | present | present |
| `inflection` | `exports/<lang>/export_grammar.php__type_M_lang_<iso1>` | present, 19 rules | present, 30 rules |
| `subcategorisation` | `exports/<lang>/export_grammar.php__type_Y_lang_<iso1>` | present, 9 rules | present, 63 rules |
| `disambiguation` | `exports/<lang>/<id>.dgrammar.txt` | **present**: `44.dgrammar.txt`, `47.dgrammar.txt` | **none** — `grep '"path": *"exports/eng/[^"]*dgrammar' data/archive/manifest.jsonl` returns nothing |

`disambiguation.yaml`'s format is otherwise undocumented: no `docs/unl-reference/formats/disambiguation.md`
page exists yet, only a wiki page not yet turned into a reference
(`data/archive/wiki/English_Disambiguation_Grammar.wikitext`). Issue 15, the grammar importer,
reads the `*.dgrammar.txt` files directly rather than skip them.

## Tagset entry (`tools/validate/schema/tagset-entry.schema.json`)

One value in `tagset.yaml`, an object keyed by tag mnemonic (`store-layout.schema.json`'s
`tagsetFile` def: shape `object`, no fixed key set).

| Field | Type | Archive (afr, eng) | Note |
|---|---|---|---|
| `tag` | string | present | The tag mnemonic itself (`RLT`, `FOR`, `LEX`, ...), identical to the record's own key. |
| `meaning` | string | present | The export's short expansion before the tag's first parenthesis (`relation` for `RLT`). |
| `description` | string | present, empty for one tag | The export's longer description, from inside the parenthesis (or parentheses -- `123PP` carries two top-level groups, joined with a space). Empty string for `DFN` ("defineteness"), which the export gives no parenthetical at all. |
| `examples` | array of string | present, empty when the export gives none | The export's `<i>...</i>` list, split on top-level commas. |
| `category` | string or null | **none** | Always `null`. See "The category/parent gap" below. |
| `parent` | string or null | **none** | Always `null`, same gap. |
| `source` | object | computed, not archive-sourced | `archive_path` is always `exports/export_tagset.php` (one export, shared archive-wide). `line` is the tag's own mnemonic, an importer-assigned locator: the export has no per-tag physical line grain (below), the same allowance the dictionary/grammar `source` field already documents for a paradigm or frame catalogue number. |

### The category/parent gap

Issue 16 asks the importer to write "one entry per tag with its category, its parent attribute if
any, and its meaning". `docs/unl-reference/formats/tagset.md` describes the tagset as a tree (an
attribute like `LEX` sits above its own values, `A`/`N`/`V`/...), matching the wiki's hand-drawn
`Tagset.wikitext` page. The live export this importer reads
(`data/archive/exports/export_tagset.php`) draws no such tree: it is 509 `TAG = meaning
(description): <i>examples</i>` entries in one flat alphabetical run, with no field anywhere
stating that `A` is a `LEX` value or that a given tag is itself an attribute rather than a value.
Building `category`/`parent` from the wiki tree instead would use the source `tagset.md` itself
names as non-authoritative next to the live export (its own "Where the export adds tags the wiki
tree does not define" section). Decided: `tagset.py` writes `category: null` and `parent: null`
for every tag, a documented gap rather than a value invented from a source the issue's own
reference page has already moved past. The fields stay in the schema so a future pass that
recovers the link (the wiki tree, cross-checked against the live tagset) needs no migration.

### Tagset is archive-wide, not per-language

`SPEC.md` §3.3 lists `tagset.yaml` under the per-language tree, `data/languages/<iso3>/`. The
archive serves one export, shared by every language
(`store-layout.schema.json`'s own `tagsetFile` note: "one export, not per-language"). `tagset.py`
therefore writes the identical parsed table to both `data/languages/afr/tagset.yaml` and
`data/languages/eng/tagset.yaml`; a test diffs the two files byte-for-byte.

## Corpus entry (`corpus/<name>.yaml`, `{sentence, unl, source}`)

One record in `corpus/<name>.yaml`. `SPEC.md` §3.3 fixes the three keys; the notes below are the
interpretive calls the importer makes reading the real `ugoa1` export, not a schema (no
`corpus-entry.schema.json` exists: the three-key shape needs no further per-field constraint).

- **One record per source sentence ID, not per candidate translation.** A single `[S:ID]` block in
  the archive's UCL export can carry more than one natural-language rendering of the same UNL
  graph (`{af}...{/af}` appears twice for 24 of 248 `ugoa1`/`af` sentences). Writing one record per
  candidate would make `len(afr_corpus) != len(eng_corpus)` purely from how many alternate phrasings
  each language's translators happened to type in. Decided: the importer keeps the first candidate
  only, so every `[S:ID]` block becomes exactly one record in both language files.
- **English's fallback.** Every real `ugoa1`/`en` `[S:ID]` block carries an `{org:en}` block (248 of
  248); only some also carry a `{en}` block (108 of 248). The importer prefers `{en}` (the
  language's own designated tag, matching how `af` reads `{af}`) and falls back to `{org:en}` when
  absent.
- **`source.line` is a 1-based sequential count of `[S:ID]` blocks, not the archive's own sentence
  ID.** The export gives no physical per-sentence line: the whole corpus, past nine header lines,
  sits on essentially one physical line. Counting `[S:ID]` blocks in file order gives a real,
  checkable 1-based number, the same kind of importer-assigned unit the HTML grammar catalogues
  already use.
- **A permissive brace-balance check, not a UNL parser**, per issue 16's own instruction: the
  assembled `unl` text's `(`/`)` count must balance, or the sentence goes to `_unparsed.txt`. No
  real `ugoa1` `af`/`en` sentence fails this; it is exercised by a hand-built fixture.

## Store file layout (`tools/validate/schema/store-layout.schema.json`)

One row per file `SPEC.md` §3.3 names.

| File | Top-level shape | Required keys | Archive (afr, eng) |
|---|---|---|---|
| `dictionary/<a-z>.yaml` | array | dictionary entry fields, above | present |
| `grammar/analysis.yaml` | array | grammar rule fields, above | present |
| `grammar/generation.yaml` | array | grammar rule fields, above | present |
| `grammar/inflection.yaml` | array | grammar rule fields, above | present |
| `grammar/subcategorisation.yaml` | array | grammar rule fields, above | present |
| `grammar/disambiguation.yaml` | array | grammar rule fields, above | present (afr), none (eng), see table above |
| `tagset.yaml` | object | none fixed; keys are the feature names themselves | present, one export shared across languages: `exports/export_tagset.php` |
| `corpus/<name>.yaml` | array | `sentence`, `unl`, `source` | present: `exports/corpus/<project>/export_corpus.php__project_<p>_lang_<iso1>_unl_*` |
| `tests/<name>.yaml` | array | `input`, `expected`, `direction`, `tier`, `register` | none — authored by a rule-author or test-writer, never mirrored from the archive |
| `meta.yaml` | object | `iso1`, `iso3`, `name`, `licence`, `counts`, `last_import` | see field table below |

### `meta.yaml` fields

| Field | Archive (afr, eng) | Note |
|---|---|---|
| `iso1` | present | From `data/archive/languages.json` (issue 11). |
| `iso3` | present | The store folder name itself; also in `languages.json`. |
| `name` | present | From `languages.json`. |
| `licence` | present, fixed | CC BY-SA, version per the archive page a language's exports were retrieved from; not a `languages.json` field. |
| `counts` | **none, computed by the importer after import, not mirrored** | `languages.json` gives the archive's own base forms, word forms, paradigms and frames — counts read from the archive's language table, not a count of records the importer actually wrote. No single count-per-store-type endpoint exists in the archive; checked by reading `data/archive/languages.json` field names directly. |
| `last_import` | none, computed at import time | Not an archive concept; the importer stamps this the moment it finishes writing the store. |

## Decided after close

Both items issue 13 flagged were decided by the owner on 2026-09-14.

- **`conditions` / `lhs` split.** `conditions` stays empty at M2; `lhs` holds the archive's
  left-hand side verbatim. The archive is the source of truth and the split boundary is the rule
  interpreter's to choose, so M3 decides whether it wants one. The schema keeps `conditions` as an
  array, so filling it later needs no migration. `SPEC.md` §3.2 carries the rule.
- **Where the schemas live.** `tools/validate/schema/`, not a fifth top-level package. The
  validator is the schema's only runtime consumer; the importers produce store files and do not
  load the schema. The test lives with the validator's other tests,
  `tools/validate/tests/test_schema.py`. No ADR: a folder of JSON Schema files is not a package.

## Feature values the validator does not check

`tools/validate/store.py`'s `check_feature_values` (issue 17) checks that every dictionary
entry's `features` pair, and every grammar rule's `lhs`/`rhs` attribute=value pair, resolves to a
row in `tagset.yaml`. Seven attributes are exempt: `LEMMA`, `BF`, `PAR`, `FRA`, `SFR`, `FLX`,
`DIGIT`.

Decided (this issue, 2026-09-15): running the naive check against the real `afr` store first —
checking every `features` value, no exceptions — flagged 30,591 hits on `LEMMA` alone, plus tens
of thousands more on `BF`, `PAR` and `FRA`. Reading the flagged values shows why: `LEMMA` and `BF`
hold the entry's own lemma or base-form text (`aunt`, `maag`), not a tag; `PAR`, `FRA` and `SFR`
hold a paradigm, frame or subframe catalogue number (`M17`, `Y12`, `K702`) the grammar defines,
not a member of the flat, closed tagset. `tagset.yaml`'s own entries for `PAR`, `FRA` and `SFR`
say as much — "to be defined in the grammar" — and `LEMMA` is not even a `tagset.yaml` key, the
plainest signal it is not a categorical feature at all. `FLX` (an inflection-rule reference) and
`DIGIT` (a literal digit string) are the same shape. Checking these seven against `tagset.yaml`
would flag every real lemma, base form and catalogue reference as an "unresolved" value; excluding
them by name, not by a syntactic heuristic (a mnemonic-shaped value like `M2` or `K702` cannot be
told apart from a real tag by shape alone), keeps the check aimed at the class of bug it exists to
catch — a mistyped or wiki-sourced tag mnemonic like `POS=NOUN` or `SEM=REL`.

The same run also surfaced a handful of dictionary entries (`data/languages/afr/dictionary/b.yaml`
and `d.yaml`) whose `features` map carries extra keys taken verbatim from a multi-word headword's
comma-separated alternates (e.g. `Bok, bok, staan styf` produces feature keys `bok` and
`staan styf`, each mapping to itself). These are not exempted: they are a real importer artifact
from issue 14, out of scope for this issue to fix, and `check_feature_values` correctly reports
them as unresolved attributes.

## Rule coverage: the `rules` field and an empty tests/ directory

`check_rule_coverage` (issue 17) checks that every grammar rule's `id` appears in at least one
`tests/<name>.yaml` entry naming it. Two things this needs are not yet fixed anywhere else:

- **The field name.** `SPEC.md` §3.3 and `tools/validate/schema/store-layout.schema.json`'s
  `testsFile` def fix only five keys for a test row — `input`, `expected`, `direction`, `tier`,
  `register` — because no rule-author or test-writer pass has run yet
  (`tools/fixtures/languages/tests/basic.yaml`, the one example that exists, predates issue 13's
  real schemas and carries no rule-coverage field either). Decided (this issue): a test row names
  the rules it exercises in a `rules` field, e.g. `rules: [xxa-ana-01, M2]`. This is additive, not
  a change to the five required keys, so a test-writer filling it in later needs no migration.
- **A store with no `tests/` directory at all.** This is the real case for both `afr` and `eng`
  today — issue 16 ends before a test-writer pass starts. Decided: an absent or empty `tests/`
  directory is not a reason to skip the check. Every rule counts as uncovered, and the report
  prints that count as a warning, not a failure — exactly the number `SPEC.md`'s M3 gate (where
  coverage becomes an error) needs as its starting point.

## Real archive gaps this check found, now fully triaged (issue 18, 2026-09-15)

Running `check_feature_values` and `check_uw_references` against the real `afr`/`eng` stores
found the 1234/47679 feature-value total below is not one gap but two, plus a validator bug the
UW column was hiding:

- **`check_uw_references` was too strict, fixed in issue 18.** `dictionary.md`'s own grammar is
  `<UW> ::= <text> | <REGULAR EXPRESSION>`, not digits-only; the check enforced digits-only and
  flagged 326 real, valid entries (UCL strings like `zero(equ>no)`, pronoun placeholder regexes
  like `00.@2.@dual.@female`). Widened to printable text. UW errors are now 0 for both languages.
- **31304 lines (issue 167, Side, open): `SEM=ATT`/`SOV`/`REL`, an archive-internal vintage
  mismatch, not a store or importer bug.** `tagset.yaml` faithfully mirrors the *live* tagset
  export, which no longer defines these three codes; the *dictionary* exports (a decade older)
  still use them. `REL`→`RLT` is a known 1:1 rename (already documented below); `ATT` and `SOV`
  are two more of the same phenomenon, at far larger scale (15940 and 13214 occurrences), and
  `SOV` has no obvious replacement in the current export.
- **17609 lines (issue 168, Side, open): a real importer bug, plus three small tagset gaps.**
  17072 are one cause: the importer flattens `dictionary.md`'s `"#" <SUBNLWID> <FEATURE LIST>`
  compound sub-word feature lists into a bogus flat attribute (`"#01": "LEMMA=zero in,BF=zero,..."`)
  instead of parsing them. The rest: `GOV`'s value still gets checked though its attribute name is
  already exempt (250), `PER='3PE'` vs the export's `3PER` (100), and `POS=CCJ` (2, first found
  here, before the two vintage-mismatch tags below were confirmed to be the same pattern).

`REL` and `ATT`, for the record — `REL` is the first-found, already-documented case; `ATT` is the
second:

- `SEM=REL` appears in real dictionary entries (2150 across both languages); the live tagset
  has no `REL` tag, only `RLT` ("relation") — documented in
  `docs/unl-reference/formats/tagset.md`, "Where the export adds tags".
- `SEM=ATT` appears in real dictionary entries (15940 across both languages); the live tagset has
  no `ATT` tag, only `ATR` ("attribute"). Same wiki/export-vintage mismatch pattern as `REL`/`RLT`,
  one letter off, not yet mapped (issue 167).

## `python -m tools.validate --all` exit code on the real stores (known M2 finding)

`--all` exits 1 against the real `afr`/`eng` stores, not 0: schema errors are 0 for both, but
`check_feature_values` is a real error at M2 (only `check_rule_coverage` is a warning, per
`SPEC.md` §3.3), and the real archive-derived data has genuine defects issues 167 and 168 above
now fully account for. Counts from the 2026-09-15 run, after issue 18's UW-check fix:

| | schema | feature-value | UW | uncovered rules (warning) |
|---|---|---|---|---|
| `afr` | 0 | 1234 | 0 | 431 |
| `eng` | 0 | 47679 | 0 | 442 |

This is the validator doing its job against data issues 14 and 16 imported, not a defect in
issue 17 itself; the M2 gate was stamped over this nonzero exit on the owner's call (2026-09-15),
treating `--all` as a reporting step here rather than a blocking one, with both root causes now
tracked as issues 167 (the `SEM` vintage mismatch, 31304 lines) and 168 (the importer's
compound-feature-list bug plus three small tagset gaps, 17609 lines) — 31304 + 17609 = 48913, the
full 1234 + 47679 total, with nothing left untriaged.
