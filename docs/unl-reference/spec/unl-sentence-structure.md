# UNL sentence structure

A UNL sentence, also called a UNL expression, is one sentence's worth of UNL: a hypergraph
whose nodes are Universal Words, whose edges are Universal Relations, and whose nodes carry
Universal Attributes. See `docs/unl-reference/spec/universal-words.md`,
`docs/unl-reference/spec/universal-relations.md` and
`docs/unl-reference/spec/universal-attributes.md` for the three node and edge kinds. This page
covers only how a UNL sentence is written down.

## Two formats, one content

The UNL specs define two ways to write the same UNL sentence: the list format and the table
format. Both carry the same Universal Words, relations and attributes; they differ in whether
the word list and the relation list sit apart or together.

### List format

The list format separates the words from the relations. A `[W]` block lists every Universal
Word with its attributes and a local id; an `[R]` block lists every relation as a pair of those
ids:

```
[W]
buy(agt>person,obj>thing).@past.@entry:01
John:02
[/W]
[R]
agt(01,02)
[/R]
```

Here `01` and `02` are UW-IDs, local labels a relation can reference. The relation block reads
`agt(01, 02)`: node `02` (`John`) is the agent of node `01` (`buy`).

### Table format

The table format folds the word and its attributes directly into the relation, so there is one
list, not two:

```
agt(buy(agt>person,obj>thing).@past.@entry, book(icl>publication).@def)
```

Each relation is written `<relation>(<source node>, <target node>)`, and each node is a full
Universal Word with its attributes and UW-ID inline. The table format is denser and is the
format used throughout `docs/unl-reference/spec/universal-relations.md`'s example column.

## The relation line, either format

Whichever format, one relation is:

```
<rel>:<scope>(<source>, <target>)
```

`<rel>` is the two- or three-letter relation label (`agt`, `obj`, `mod`, and the rest of the
table in `universal-relations.md`). `<scope>` is a two-character scope id, omitted when the
relation belongs to the sentence's main scope, `:00`. `<source>` is the node that assigns the
relation; `<target>` is the node that receives it.

## Worked example

"John killed Mary" as a UNL sentence, table format:

```
agt(kill(icl>do).@past.@entry, John)
obj(kill(icl>do).@past.@entry, Mary)
```

`kill` is the `@entry`, the sentence's main node (`docs/unl-reference/spec/universal-attributes.md`
covers `@entry`). `agt` names `John` as the one who provokes the killing; `obj` names `Mary` as
the one who undergoes it. The same sentence, list format, gives `kill` and each argument a
UW-ID first, then states the two relations by id:

```
[W]
kill(icl>do).@past.@entry:01
John:02
Mary:03
[/W]
[R]
agt(01,02)
obj(01,03)
[/R]
```

Source: UNL Archive, data/archive/wiki/UNL_sentence.wikitext, https://unlarchive.org/wiki/api.php?action=query&prop=revisions&titles=UNL sentence, CC BY-SA 4.0
