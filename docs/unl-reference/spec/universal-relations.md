# Universal Relations

A Universal Relation is a labelled, directed edge between two Universal Words in a UNL graph:
`<rel>:<scope>(<source>, <target>)`. A relation names a semantic function, not a grammatical
one. "Agent" (`agt`) means "the one who initiates the event", a different idea from "the
grammatical subject", even though the two often coincide. The same relation can surface as a
subject, an adjective, a noun modifier, or a suffix, across different sentences and languages;
the relation label stays the one true name for the underlying semantic function.

## Reading a relation

`<relation>(<source>, <target>) => <target> is the <relation> of <source>`. The target defines
the relation, not the source:

- `agt(kill, Peter)` — Peter is the agent of kill.
- `tim(kill, yesterday)` — yesterday is the time of kill.
- `icl(document, book)` — book is a type of document.

Relation arguments are not commutative: `cnt(evidence, absence)`, "evidence of absence", is a
different fact from `cnt(absence, evidence)`, "absence of evidence". A scope id after the
relation label, e.g. `agt:01(kill, Peter)`, places the relation inside a named sub-graph
(a scope) instead of the sentence's main scope, `:00`.

## The hierarchy

Relations form a hierarchy: a lower relation is a more specific case of the relation above it.
The topmost relation, `rel`, only asserts that two nodes are semantically related, with no
further claim.

```
rel
├── agt (agent)
├── and (conjunction)
├── aoj (object of an attribute)
│   ├── ant (antonym, different from)
│   ├── equ (synonym, equal to)
│   ├── fld (field)
│   ├── icl (hyponym, a kind of)
│   ├── iof (example, instance of)
│   └── pof (meronym, part of)
├── ben (beneficiary)
├── cnt (content or theme)
├── con (condition)
├── exp (experiencer)
├── mod (modifier)
│   ├── mat (material)
│   ├── nam (name)
│   ├── pos (possessor)
│   └── qua (quantifier)
├── obj (patient)
│   ├── opl (objective place)
│   └── res (result)
├── or (disjunction)
├── per (proportion, rate, distribution or basis for comparison)
│   └── bas (basis for a comparison)
├── plc (location: physical or logical)
│   ├── gol (final place or state, destination)
│   ├── lpl (logical place, scene)
│   ├── src (initial place or state, origin)
│   └── via (intermediate place, path)
├── ptn (partner)
├── tim (time)
│   ├── tmf (initial time)
│   ├── tmt (final time)
│   └── dur (duration)
│       └── coo (co-occurrence)
├── man (manner)
│   ├── ins (instrument or method)
│   │   └── met (method)
│   └── pur (purpose)
├── rsn (reason)
└── seq (consequence)
```

A rule-author facing an ambiguous case can climb this tree: when the fine-grained relation is
uncertain, the parent relation plus an attribute often carries the same meaning. "Come from NY"
is `src(come, NY)`, equivalently `plc(come, NY.@from)`. This substitution loses no meaning for
place and time relations, but it does lose meaning for a few pairs, so it is used only when the
finer relation cannot be determined: `equ(Peter, John)` ("John is Peter") is not the same claim
as the weaker `aoj(Peter, John)`.

## Full list of relations

| Label | Meaning | UNL example | English gloss |
|---|---|---|---|
| `agt` | agent — a participant that provokes a change of state or location | `agt(killed, John)` | John killed Mary (or: Mary was killed by John) |
| `and` | conjunction between two entities | `and(John, Mary)` | John and Mary |
| `ant` | opposition or concession — two entities do not share meaning or reference | `ant(Peter, John)` | John is not Peter |
| `aoj` | object of an attribute — the subject of a stative verb, or the predicative subject | `aoj(sad, John)` | John is sad |
| `ben` | beneficiary — advantaged or disadvantaged by an event | `ben(works, Peter)` | John works for Peter |
| `cnt` | content or theme — the object of a stative or experiential verb | `cnt(love, Mary)` | John loves Mary |
| `con` | condition of an event | `con(I will tell him, I see him)` | If I see him, I will tell him |
| `dur` | duration or co-occurrence | `dur(worked, five hours)` | John worked for five hours |
| `equ` | synonym or paraphrase — two entities share meaning or reference | `equ(evening star, morning star)` | The morning star is the evening star |
| `exp` | experiencer — receives a sensory impression or undergoes an experiential event | `exp(love, John)` | John loves Mary |
| `fld` | field — the semantic domain of an entity | `fld(sentence, linguistics)` | sentence (linguistics) |
| `gol` | final state, place, destination or recipient | `gol(gave, Mary)` | John gave the book to Mary |
| `icl` | hyponymy, is a kind of | `icl(mammal, dogs)` | Dogs are mammals |
| `ins` | instrument or method — an inanimate entity an agent uses | `ins(cut, knife)` | The cook cut the cake with a knife |
| `iof` | is an instance of | `iof(human being, John)` | John is a human being |
| `lpl` | logical place — a non-physical place where an entity or event occurs | `lpl(works, politics)` | John works in politics |
| `man` | manner — how the event is carried out | `man(bought, quickly)` | John bought the car quickly |
| `mat` | material — what an entity is made of | `mat(box, wood)` | a wood box |
| `mod` | general modification of an entity | `mod(book, beautiful)` | a beautiful book |
| `nam` | the name of an entity | `nam(city, New York)` | the city of New York |
| `obj` | patient — undergoes a change of state or location | `obj(killed, Mary)` | John killed Mary |
| `opl` | objective place — a place affected by an action | `opl(hit, face)` | John was hit in the face |
| `or` | disjunction between two entities | `or(John, Mary)` | John or Mary |
| `per` | proportion, rate, distribution, measure or basis for comparison | `per(beautiful, Peter)` | John is more beautiful than Peter |
| `plc` | the location or spatial orientation of an entity or event | `plc(work, NY)` | John works in NY |
| `pof` | is part of | `pof(family, John)` | John is part of the family |
| `pos` | the possessor of a thing | `pos(book, John)` | John's book |
| `ptn` | partner — a secondary, non-focused participant | `ptn(fight, Peter)` | John fights with Peter |
| `pur` | the purpose of an entity or event | `pur(book, children)` | book for children |
| `qua` | the quantity of an entity | `qua(book, 2)` | two books |
| `res` | result or factitive — what results from an entity or event | `res(bake, cake)` | The cook bakes a cake |
| `rsn` | the reason for an entity or event | `rsn(John left, it was late)` | John left because it was late |
| `seq` | consequence | `seq(I think, I am)` | I think therefore I am |
| `src` | initial state, place, origin or source | `src(came, NY)` | John came from NY |
| `tim` | the temporal placement of an entity or event | `tim(came, yesterday)` | John came yesterday |
| `tmf` | initial time | `tmf(worked, early)` | John worked since early |
| `tmt` | final time | `tmt(worked, late)` | John worked until late |
| `via` | an intermediate state or place | `via(went, Paris)` | John went from NY to Geneva through Paris |

## Worked example: relations depend on the verb's own frame

The same syntactic slot maps to different relations, by the semantics of the governing verb:

- "to kill": the subject provokes the action, so it takes `agt`; the object is transformed, so
  it takes `obj`. `agt(killed, John)`, `obj(killed, Mary)`.
- "to love": the subject does not act on anything, it experiences, so it takes `exp` instead of
  `agt`. The object is a theme, not a patient, so it takes `cnt` instead of `obj`.
  `exp(love, John)`, `cnt(love, Mary)`.

The relation set is defined by the UNL Specs and is not open to casual extension: a rule-author
who needs a new distinction reaches for an existing relation plus an attribute, per the
hierarchy above, before proposing a new label.

Source: UNL Archive, data/archive/wiki/Universal_Relations.wikitext, https://unlarchive.org/wiki/api.php?action=query&prop=revisions&titles=Universal Relations, CC BY-SA 4.0
