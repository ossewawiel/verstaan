# Universal Attributes

A Universal Attribute is an arc from a node back to itself: a one-place annotation, unlike a
Universal Relation's two-place edge (`docs/unl-reference/spec/universal-relations.md`). An
attribute is written `@` followed by a lower-case name, e.g. `@past`, `@pl`, `@entry`.
Attributes carry the information natural languages fold into bound morphemes and closed word
classes: tense, number, gender, mood, articles, adpositions, conjunctions, modal verbs, degree
adverbs. They also mark structural facts about the graph itself, such as which node is the
sentence's head, and pragmatic facts about the utterance, such as politeness or speech act.

Attributes attach to a UW by a dot: `book.@pl.@def` is "the books". A UW can carry more than one
attribute, each dot-joined in sequence.

## Full list of attributes, by category

| Category | Attribute | Meaning | UNL example | English gloss |
|---|---|---|---|---|
| Animacy | `@person` | The entity is a person. | `worker.@person` | the worker, a person |
| Animacy | `@thing` | The entity is a thing. | `worker.@thing` | the worker, a thing (e.g. a machine) |
| Aspect | `@causative` | The event is caused by another. | `die.@causative` | cause to die |
| Aspect | `@continuative` | The event is continuous. | `sleep.@continuative` | keep sleeping |
| Aspect | `@experiential` | The event marks an experience. | `visit.@experiential` | have visited (at some point) |
| Aspect | `@habitual` | The event is habitual. | `smoke.@habitual` | smokes (habitually) |
| Aspect | `@imperfective` | The event is uncompleted. | `write.@imperfective` | was writing |
| Aspect | `@inceptive` | The event is beginning. | `run.@inceptive` | start to run |
| Aspect | `@inchoative` | The event marks a change of state. | `redden.@inchoative` | become red |
| Aspect | `@iterative` | The event repeats. | `knock.@iterative` | knock repeatedly |
| Aspect | `@perfect` | The event is perfect (completed with present relevance). | `arrive.@perfect` | has arrived |
| Aspect | `@perfective` | The event is completed. | `write.@perfective` | wrote (to completion) |
| Aspect | `@permissive` | The event is permitted. | `leave.@permissive` | may leave |
| Aspect | `@persistent` | The event persists. | `wait.@persistent` | keeps waiting |
| Aspect | `@progressive` | The event is ongoing. | `write.@progressive` | is writing |
| Aspect | `@prospective` | The event is imminent. | `leave.@prospective` | is about to leave |
| Aspect | `@result` | The event denotes a result. | `break.@result` | broken (as a result) |
| Aspect | `@terminative` | The event ceases. | `smoke.@terminative` | stop smoking |
| Degree | `@almost` | Approximative. | `full.@almost` | almost full |
| Degree | `@also` | Repetitive. | `come.@also` | also come |
| Degree | `@again` | Iterative, positive degree. | `come.@again` | come again |
| Degree | `@emphasis` | Emphasis, positive degree. | `big.@emphasis` | big indeed |
| Degree | `@enough` | Sufficiently, positive degree. | `big.@enough` | big enough |
| Degree | `@extra` | Excessively (too), positive degree. | `big.@extra` | too big |
| Degree | `@minus` | Downtoned (a little), positive degree. | `big.@minus` | a little big |
| Degree | `@plus` | Intensified (very), positive degree. | `big.@plus` | very big |
| Degree | `@more` | Comparative of superiority. | `big.@more` | bigger |
| Degree | `@less` | Comparative of inferiority. | `big.@less` | less big |
| Degree | `@equal` | Comparative of equality. | `big.@equal` | as big |
| Degree | `@most` | Superlative of superiority. | `big.@most` | biggest |
| Degree | `@least` | Superlative of inferiority. | `big.@least` | least big |
| Emotion | `@anger`, `@attention`, `@consent`, `@contentment`, `@disagreement`, `@discontentment`, `@dissent`, `@hesitation`, `@pain`, `@relief`, `@surprise`, `@weariness` | The utterance expresses this feeling. | `00.@pain` | "Ouch!" |
| Figure of speech (schemes) | `@brachylogia`, `@chiasmus`, `@climax`, `@consonance`, `@ellipsis`, `@epanalepsis`, `@interruption`, `@parallelism`, `@pleonasm`, `@polyptoton`, `@polysyndeton`, `@symploce` | The sentence uses this rhetorical scheme. | `sentence.@chiasmus` | a sentence built as a chiasmus |
| Figure of speech (tropes) | `@anthropomorphism`, `@antiphrasis`, `@antonomasia`, `@catachresis`, `@double_negative`, `@dysphemism`, `@epanorthosis`, `@euphemism`, `@hyperbole`, `@irony`, `@metaphor`, `@metonymy`, `@onomatopoeia`, `@oxymoron`, `@paradox`, `@paronomasia`, `@periphrasis`, `@repetition`, `@synecdoche`, `@synesthesia`, `@zoomorphism` | The sentence uses this figure of speech. | `sentence.@metaphor` | a sentence built as a metaphor |
| Gender | `@female`, `@male`, `@neutral` | The entity's gender. | `cat.@female` | a female cat |
| Information structure | `@comment` | What is said about the topic. | `tired.@comment` | (John,) tired — "tired" is the comment |
| Information structure | `@focus` | Information contrary to the interlocutor's presuppositions. | `John.@focus` | it was JOHN (who came) |
| Information structure | `@topic` | What is being talked about. | `John.@topic` | (as for) John, (he left) |
| Lexical category | `@adjective`, `@adverb`, `@noun`, `@verb` | The surface part of speech realising the UW. | `beauty.@adjective` | beautiful, surfacing as an adjective |
| Manner (also covers many prepositions/conjunctions) | `@according_to`, `@against`, `@although`, `@and`, `@as`, `@as.@if`, `@as_far_as`, `@as_of`, `@as_per`, `@as_regards`, `@as_well_as`, `@barring`, `@because`, `@because_of`, `@besides`, `@but`, `@by`, `@by_means_of`, `@concerning`, `@despite`, `@due_to`, `@even.@if`, `@except`, `@except.@if`, `@except_for`, `@excluding`, `@failing`, `@for`, `@given`, `@if`, `@if.@only`, `@in_accordance_with`, `@in_addition_to`, `@in_case`, `@in_case_of`, `@in_favor_of`, `@in_place_of`, `@in_spite_of`, `@including`, `@instead_of`, `@like`, `@notwithstanding`, `@off`, `@on_account_of`, `@on_behalf_of`, `@or`, `@owing_to`, `@pace`, `@per`, `@pursuant_to`, `@qua`, `@regarding`, `@regardless_of`, `@save`, `@so`, `@than`, `@thanks_to`, `@that_of`, `@unless`, `@unlike`, `@versus`, `@with`, `@with_regard_to`, `@with_relation_to`, `@with_respect_to`, `@without`, `@worth` | The manner or logical connective linking the node to its relation. | `man(kill, knife.@with)` | kill with a knife |
| Modality | `@ability`, `@advice`, `@agreement`, `@assertion`, `@assumption`, `@belief`, `@command`, `@conclusion`, `@condition`, `@confirmation`, `@consequence`, `@conviction`, `@decision`, `@deduction`, `@desire`, `@determination`, `@doubt`, `@exclamation`, `@exhortation`, `@expectation`, `@fear`, `@hope`, `@hypothesis`, `@intention`, `@interrogation`, `@invitation`, `@judgement`, `@narrative`, `@necessity`, `@obligation`, `@opinion`, `@permission`, `@possibility`, `@prediction`, `@presumption`, `@probability`, `@prohibition`, `@promise`, `@regret`, `@request`, `@speculation`, `@suggestion`, `@threat`, `@warning` | The speaker's stance toward the event. | `leave.@obligation` | must leave |
| Nominal attributes | `@about`, `@round`, `@of` | Prepositional attachment on a nominal node. | `book.@about` | a book about (something) |
| Person | `@1`, `@2`, `@3` | First, second, third person. | `00.@1` | I |
| Place — location | `@above`, `@among`, `@around`, `@at`, `@back`, `@behind`, `@below`, `@beside`, `@between`, `@beyond`, `@bottom`, `@front`, `@in`, `@inside`, `@left`, `@on`, `@opposite`, `@outside`, `@over`, `@right`, `@side`, `@top`, `@under`, `@within` | Spatial location. | `plc(work, office.@in)` | works inside the office |
| Place — position | `@contact`, `@far`, `@near` | Spatial proximity. | `plc(stand, wall.@near)` | stands near the wall |
| Place — direction | `@across`, `@along`, `@clockwise`, `@down`, `@from`, `@through`, `@throughout`, `@to`, `@towards`, `@up` | Spatial direction. | `plc(come, NY.@from)` | come from NY |
| Polarity | `@yes` | Affirmative. | `agree.@yes` | does agree |
| Polarity | `@not` | Negative. | `agree.@not` | does not agree |
| Polarity | `@maybe` | Dubitative. | `agree.@maybe` | may or may not agree |
| Quantification | `@any` | Existential quantifier. | `00.@any.@person` | anyone |
| Quantification | `@all` | Universal quantifier. | `00.@all.@thing` | everything (all things) |
| Quantification | `@entire`, `@half`, `@majority`, `@minority`, `@no`, `@part` | Proportion quantified. | `cake.@half` | half the cake |
| Quantification | `@generic` | No quantification. | `dog.@generic` | dogs (in general) |
| Quantification | `@pl` | Plural, with sub-cases `@dual`, `@trial`, `@quadrual`, `@paucal`, `@multal`. | `book.@pl` | books |
| Quantification | `@singular` | Singular (the default). | `book.@singular` | a book |
| Quantification | `@times` | Multiplicative. | `three.@times` | three times |
| Quantification | `@tuple` | Collective. | `student.@tuple` | the students (as a group) |
| Quantification | `@unit` | Unit. | `soldier.@unit` | a unit of soldiers |
| Register | `@archaic`, `@colloquial`, `@dialect`, `@jargon`, `@literary`, `@pejorative`, `@slang`, `@taboo` | The register of the wording. | `money.@slang` | dough (slang for money) |
| Social deixis | `@equivalent`, `@familiar`, `@inferior`, `@intimate`, `@polite`, `@reverential`, `@superior` | The social relation the wording encodes. | `you.@polite` | you (polite register, e.g. French "vous") |
| Specification | `@also`, `@circa` | Additive or approximative specifier. | `hundred.@circa` | about a hundred |
| Specification | `@def` | Definite, with sub-cases `@both`, `@distal`, `@each`, `@either`, `@medial`, `@other`, `@own`, `@proximal`, `@same`, `@such`. | `book.@def` | the book |
| Specification | `@even` | Even (specifier). | `he.@even` | even he |
| Specification | `@indef` | Indefinite, with sub-cases `@certain`, `@wh`. | `book.@indef` | a book |
| Specification | `@neither`, `@only`, `@ordinal` | Further specifiers. | `time.@ordinal` | the first time |
| Syntactic structures — conventions | `@angle_bracket`, `@brace`, `@double_parenthesis`, `@double_quote`, `@parenthesis`, `@single_quote`, `@square_bracket` | The node is set off by this typographic convention. | `note.@parenthesis` | (a note) |
| Syntactic structures | `@entry` | Marks the sentence's main (starting) node. | `came.@entry` | came, the sentence's head |
| Syntactic structures | `@relative` | Marks the head of a relative clause. | `book.@relative` | (the man) who wrote the book |
| Syntactic structures | `@speech` | Marks direct speech. | `leave.@speech` | "I will leave," he said |
| Syntactic structures | `@title` | Marks a title. | `book.@title` | *The Little Prince* (as a title) |
| Syntactic structures | `@vocative` | Marks a vocative. | `John.@vocative` | John, come here |
| Time — absolute tense | `@past` | Before the moment of utterance. | `came.@past` | came |
| Time — absolute tense | `@present` | At the moment of utterance. | `come.@present` | comes |
| Time — absolute tense | `@future` | After the moment of utterance. | `come.@future` | will come |
| Time — absolute tense | `@recent` | Close to the moment of utterance. | `arrive.@recent` | just arrived |
| Time — absolute tense | `@remote` | Remote from the moment of utterance. | `arrive.@remote` | arrived long ago |
| Time — relative tense | `@anterior` | Before some other time than the moment of utterance. | `eat.@anterior` | had eaten (before then) |
| Time — relative tense | `@posterior` | After some other time than the moment of utterance. | `eat.@posterior` | would eat (after then) |
| Time — other | `@after`, `@before`, `@during`, `@following`, `@prior_to`, `@since`, `@subsequent_to`, `@until` | The temporal relation named. | `tim(work, summer.@during)` | work during the summer |
| Voice | `@active` | The subject performs the action. | `build.@active` | He built this house in 1895 |
| Voice | `@passive` | The subject undergoes the action. | `build.@passive` | This house was built in 1895 |
| Voice | `@reflexive` | The subject acts on itself. | `kill.@reflexive` | He killed himself |
| Voice | `@reciprocal` | The subjects act on each other. | `kill.@reciprocal` | They killed each other |

## Three kinds of information an attribute carries

The UNL Specs group what attributes are for into three kinds:

1. The node's role in the graph — `@entry` marks the sentence's main node, the one a generation
   pass starts rendering from.
2. Bound morphemes and closed classes — gender, number, tense, aspect, mood, voice, articles,
   adpositions, conjunctions, modal and quasi-modal verbs, degree adverbs.
3. The external context of the utterance — prosody, text structure, politeness, rhetorical
   scheme, social deixis, speech act.

## Worked example: `@entry` and `@past` together

"John came yesterday", written as a UNL sentence, marks `came` as both the past-tense event and
the sentence's head:

```
agt(came.@past.@entry, John)
tim(came, yesterday)
```

`came.@past.@entry` reads: the node `came` carries `@past` (this event happened before the
moment of utterance) and `@entry` (this is the node a generation pass renders the sentence
around). Drop `@past` and the same graph renders as "John comes yesterday", a mismatch a
rule-author can spot immediately, because the attribute — not the label "came" — is what fixes
the tense.

Source: UNL Archive, data/archive/wiki/Universal_Attributes.wikitext, https://unlarchive.org/wiki/api.php?action=query&prop=revisions&titles=Universal Attributes, CC BY-SA 4.0
