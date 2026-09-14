# UNL document structure

A UNL document is a plain text file. It carries one or more UNL sentences and the tags that
mark where each one starts and ends. The UNLization process (natural language to UNL, called
analysis in this project) writes a UNL document. The NLization process (UNL to natural
language, called generation in this project) reads one.

## The tag hierarchy

A document nests three levels of tag, document inside none, paragraph inside document,
sentence inside paragraph:

| Tag | Marks |
|---|---|
| `[D:<id>]` … `[/D]` | The whole document. |
| `[P:<id>]` … `[/P]` | One paragraph inside the document. |
| `[S:<id>]` … `[/S]` | One sentence inside the paragraph. |

Inside a sentence tag, three more tag pairs hold the sentence's three possible faces:

| Tag | Marks |
|---|---|
| `{org:<lang>}` … `{/org}` | The original sentence, in its source language. |
| `{unl:<id>}` … `{/unl}` | The UNL expression: the graph of Universal Words, Universal
Relations and Universal Attributes for this sentence. See `docs/unl-reference/spec/unl-sentence-structure.md`. |
| `{<lang>}` … `{</lang>}` | A target-language rendering of the same sentence, one pair per
language the document also carries. |

`<id>` is an optional identifier, usually an integer, for the document, paragraph, sentence or
UNL expression. `<lang>` is the language's ISO 639-2 or ISO 639-3 code. `{org:<lang>=<code>}`
may also carry a character encoding after the `=`.

## Worked example

A one-sentence document, English source, with its UNL expression:

```
[D:1]
[P:1]
[S:1]
{org:en}
John came yesterday.
{/org}
{unl:1}
agt(came.@past.@entry, John)
tim(came, yesterday)
{/unl}
{/S]
[/P]
[/D]
```

`[D:1]` opens the document, `[P:1]` opens its one paragraph, `[S:1]` opens its one sentence.
`{org:en}` carries the English original. `{unl:1}` carries the UNL expression: `came` is the
`@entry` (the sentence's main node, see `docs/unl-reference/spec/universal-attributes.md`),
`John` is its agent, `yesterday` is its time. A generation pass reading this document produces
an Afrikaans rendering by writing a new `{af}` … `{/af}` pair after `{/unl}`, without touching
the `{org}` or `{unl}` blocks already there.

## The document as a graph

A UNL document is, at minimum, a list of UNL sentences. The UNL Archive also describes treating
the whole document as one hypergraph: each sentence is a sub-hypergraph, and a relation `nxt`
("next") links one sentence to the next in sequence. The archive marks cross-sentential relation
work beyond `nxt` as still under discussion in its own material; this reference does not extend
past what the archive states.

Source: UNL Archive, data/archive/wiki/UNL_document.wikitext, https://unlarchive.org/wiki/api.php?action=query&prop=revisions&titles=UNL document, CC BY-SA 4.0
