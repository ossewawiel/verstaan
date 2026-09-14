# Store schema

Every field `SPEC.md` §3.2 and §3.3 name, one row each, with the schema that checks it
(`tools/schema/`) and what the archive gives `afr` and `eng` for it. Nothing else appears here.
`archive: none` rows cite the search or reference page that found the gap.

## Dictionary entry (`tools/schema/dictionary-entry.schema.json`)

One record in `dictionary/<a-z>.yaml`.

| Field | Type | Archive (afr, eng) | Note |
|---|---|---|---|
| `headword` | string | present | Archive `NLW` field, without the `[brackets]`. |
| `id` | integer | present | Archive `ID` field, the entry's primary key. |
| `uw` | string | present, wrong format label | Archive `UW` field. Both samples hold a UCN (a numeric code), not the UCL string the export filename and header promise (`docs/unl-reference/formats/dictionary.md`, "Where the exports disagree with the wiki"). |
| `features` | object | present | Archive `FEATURE LIST` field, as attribute-value pairs. |
| `lang` | string | two-letter | Archive `FLG` is two letters (`af`, `en`), not the ISO 639-3 the wiki's formal syntax names. The importer translates to iso3 for the store folder; whether the field itself is rewritten is not decided here (`docs/unl-reference/formats/dictionary.md`, "Where the exports disagree with the wiki"). |
| `frequency` | integer, 0-255 | present | Archive `FRE` field. |
| `priority` | integer, 0-255 | present | Archive `PRI` field. |
| `source` | object | computed, not archive-sourced | The importer writes `archive_path` and `line` as it reads each line. No archive field carries this; losing it is a validation error (`docs/standards/data.md`, "Provenance"). |

## Grammar rule (`tools/schema/grammar-rule.schema.json`)

One record in `grammar/<kind>.yaml`.

| Field | Type | Archive (afr, eng) | Note |
|---|---|---|---|
| `id` | string | present for `Mxx`/`Yxx`; none for T-rules and D-rules | Inflection and subcategorisation rules carry a catalogue number (`M2`, `Y38`). T-grammar and disambiguation rules carry none; the importer assigns one. |
| `kind` | string, enum | derived, not a line field | `analysis \| generation \| inflection \| subcategorisation \| disambiguation \| default`. The importer derives it from which export a rule came from, not from anything written on the line. |
| `lhs` | string | present | The rule's left-hand side (`α`), exactly as the archive writes it — including any condition, since the archive never separates the two. |
| `rhs` | string | present, empty for frames | The rule's right-hand side (`β`). Empty string for a subcategorisation frame, which declares an argument structure and has no right side. |
| `conditions` | array of string | **embedded in lhs, importer must split** | The archive's own T-grammar syntax (`docs/unl-reference/formats/transformation-grammar.md`) embeds negation (`^`) and disjunction (`{a\|b}`) inside the left-hand `<NODE>` list; it never states a pattern and a condition on that pattern as two fields. **Open question for a rule-author, not decided by this schema**: split by node-level negation/disjunction, or keep `conditions` empty and leave everything in `lhs`. This schema's worked examples all use the second option, as a placeholder, not a decision. |
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

## Store file layout (`tools/schema/store-layout.schema.json`)

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

## Flagged, not decided here

- **`conditions` / `lhs` split.** See the grammar rule table above. This is a rule-author decision
  (issue 15's scope), not a schema decision. The schema keeps `conditions` as an array so either
  answer fits it without a migration.
- **`tools/schema/` as a package name.** `tools/CLAUDE.md` names four canonical tool packages:
  `mirror`, `importer`, `compiler`, `validate`. `tools/schema/` is a fifth name and holds no
  Python package (`tools.schema`), only JSON Schema files and one pytest file — it does not run
  as `python -m tools.schema`. This needs either an ADR admitting a fifth package, or a move to
  fit an existing one (e.g. `tools/validate/schema/`). Flagged for the owner; this issue does not
  rename it.
