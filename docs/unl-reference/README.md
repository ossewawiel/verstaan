# UNL reference

The UNL Archive's wiki, rewritten as one page per specification topic, in the house voice, for
a rule-author to work from without opening the archive. Each page keeps the archive's own terms
and ends with a `Source:` line naming the manifest entry it was rewritten from.

## Pages

| Page | Covers |
|---|---|
| `spec/unl-document-structure.md` | The `[D]`/`[P]`/`[S]` tag hierarchy that wraps a UNL document, and the `{org}`/`{unl}`/`{<lang>}` tags inside a sentence. |
| `spec/unl-sentence-structure.md` | The list format and the table format for writing one UNL sentence, and the `<rel>:<scope>(<source>, <target>)` relation line both use. |
| `spec/universal-words.md` | What a Universal Word is, permanent vs temporary, simple vs compound vs complex, lexical categories, and the null UW (`00`) for pronouns and ellipsis. |
| `spec/universal-relations.md` | The full relation hierarchy and a table of every relation: label, meaning, one UNL example, one English gloss. |
| `spec/universal-attributes.md` | The full attribute list by category (aspect, degree, time, voice, and the rest), and what `@entry` marks. |
| `spec/unl2010-changes.md` | Which relations UNL2010 dropped, folded, replaced or reintroduced from earlier spec versions, and the `and`/`or` argument-order change. |
| `formats/dictionary.md` | The dictionary entry line format, every field named, checked against real Afrikaans and English exports. |
| `formats/transformation-grammar.md` | The seven transformation-rule types and their formal syntax, checked against a real English grammar file. |
| `formats/tagset.md` | The feature tags dictionary entries and grammar rules use, checked against the archive's live tagset export. |
| `formats/inflection.md` | Inflectional paradigms and inflectional rules, checked against the real English paradigm export. |
| `formats/subcategorisation.md` | Subcategorisation frames and rules, checked against the real English frame export. |
| `formats/default-grammar.md` | The language-independent default transformation grammar, checked against the real shared grammar file. |

## What is not here yet

- Anything about how Verstaan's own compiler, importer or engine use these specs. That lives in
  `docs/factory/SPEC.md`, not here. These pages describe the UNL specification only.
