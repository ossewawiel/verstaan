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

## What is not here yet

- Dictionary entry format, tagsets and grammar rule formats. That is issue 10's scope, not this
  one: `docs/unl-reference/formats/` (planned).
- Anything about how Verstaan's own compiler, importer or engine use these specs. That lives in
  `docs/factory/SPEC.md`, not here. These pages describe the UNL specification only.
