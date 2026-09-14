# Universal Words

A Universal Word, or UW, is one node in a UNL graph. UWs are interlinked by Universal Relations
and specified by Universal Attributes (`docs/unl-reference/spec/universal-relations.md`,
`docs/unl-reference/spec/universal-attributes.md`). A UW represents one sense conveyed by a
natural language's open lexical categories: noun, verb, adjective, adverb. Everything else a
sentence conveys — articles, prepositions, conjunctions, tense, number and the rest — is a
relation or an attribute, never a UW, no matter which language happens to spell that meaning
out as its own word.

## What "universal" means here

A UW is not a shared root word across languages, and it is not a semantic primitive. It is a
uniform identifier into the UNL Knowledge Base, the network that maps concepts and licenses
translation between them. A UW can name a concept lexicalised in every language ("cause to
die"), in one language only, or in none at all. What makes it universal is that any language's
grammar can process it as a single node, or unpack it into a sub-graph, once the UW exists.

## Permanent and temporary UWs

A permanent UW sits in the UNL Dictionary because some language has already lexicalised the
concept it names, as a single dictionary entry. A temporary UW has no dictionary entry: it names
a concept still being coined ("googlers"), a concept too narrow to catalogue ("Universal
Networking Digital Language Foundation"), or something with no translation at all ("3.14159",
"H2O"). A temporary UW is always written in double quotes and keeps the source language's own
spelling, including capitalisation.

## Simple, compound and complex UWs

Permanent UWs come in three shapes, by how far their meaning can be broken down:

| Shape | Structure | When it applies | Example |
|---|---|---|---|
| Simple | One isolated node. | The concept cannot be reduced to other UWs. | `big`, meaning "above average" |
| Compound | One node plus an attribute. | The concept is the simple UW modified by one attribute. | `big.@more`, meaning "bigger" |
| Complex | A sub-graph: a UW linked to other UWs by relations. | The concept is fully derivable from combining existing UWs. | `obj(stamp, letter)`, meaning "to stamp" as "affix a stamp to" |

A complex UW is itself a small UNL sentence — see `docs/unl-reference/spec/unl-sentence-structure.md`
for the graph notation it reuses.

## Lexical categories

Every permanent UW carries one lexical category (LEX), based on what it semantically denotes,
not on which part of speech any one language happens to use for it:

| LEX | Denotes | Example |
|---|---|---|
| N | Things | `book` |
| V | An action, a performance, or a state or condition existing | `run`, `exist` |
| J | Attributes | `beautiful` |
| A | Circumstances | `quickly` |

An adjectival UW like "beautiful" can surface in another language as a prepositional phrase
("with beauty") or a verb phrase ("possessing beauty"); the LEX classification follows the
concept, not the surface part of speech.

## Pro-UWs

Some content cannot be tied to any antecedent in the text. UNL represents that content with
the null UW, written `00`, carrying whatever attribute distinguishes the case:

| Case | Example | UW |
|---|---|---|
| Exophora (a pronoun referring outside the text, e.g. "I") | "I left" | `00.@1` |
| Indefinite pronoun | "everything" | `00.@every.@thing` |
| Interrogative pronoun | "who" | `00.@wh` |
| Interjection | "Ouch!" | `00.@pain` |
| Ellipsis with no recoverable antecedent | "To be or not to be?" | `aoj(exist, 00)` |

Whenever an antecedent exists, UNL uses it instead of a pro-UW: "Peter said that he will not
come" becomes `Peter(i)` in both places, not `00.@3`, once the analysis has resolved "he" to
Peter.

## Worked example

The word "stamp", used as a verb meaning "affix a stamp to", is a complex UW: a sub-graph
built from the simple UW for "stamp" (the noun) and the relation `obj`:

```
obj(stamp(icl>affix), letter)
```

Read as: `letter` is the object that receives the stamping. The simple noun UW for "stamp"
(the adhesive token, `icl>publication`-style restriction omitted here) supplies the node; the
`obj` relation and its `icl` restriction supply the rest of the verb's meaning, so no separate
simple UW for the verb sense is needed.

Source: UNL Archive, data/archive/wiki/Universal_Words.wikitext, https://unlarchive.org/wiki/api.php?action=query&prop=revisions&titles=Universal Words, CC BY-SA 4.0
