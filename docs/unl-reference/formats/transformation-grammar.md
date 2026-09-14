# Transformation-Grammar Rule Syntax

A transformation grammar, or T-Grammar, is the ordered list of rules that rewrites a sentence one
step at a time: natural language into UNL during analysis, UNL into natural language during
generation. Every rule shares one shape, `α:=β;` — a condition `α` on the left, an action `β` on
the right — but the shape of `α` and `β` changes with what the rule rewrites: a list of words, a
tree, or a semantic network. This page names the seven rule types and shows three real English
rules parsed against them.

## The seven rule types

Analysis and generation both pass the sentence through the same three data structures, in
opposite directions: list (an ordered sequence of words) to tree (a hierarchy) to network (a UNL
graph), or back. A rule type is named for what it reads and what it writes:

| Type | Reads | Writes | Used for |
|---|---|---|---|
| `LL` | list | list | Pre-editing (analysis) or post-editing (generation) the word sequence. |
| `LT` | list | tree | Parsing: turning a flat word list into a surface syntax tree. |
| `TT` | tree | tree | Turning a surface tree into a deep tree, or back. |
| `TN` | tree | network | Projecting a deep syntax tree into a semantic (UNL) network. |
| `NN` | network | network | Post-editing (analysis) or pre-editing (generation) the UNL graph. |
| `NT` | network | tree | Reorganising a UNL graph as a deep tree, for generation. |
| `TL` | tree | list | Linearising a tree back into a word sequence, for generation. |

## Formal syntax

```
<TRANSFORMATION RULE> ::= <LL RULE> | <LT RULE> | <TT RULE> | <TN RULE>
                         | <NN RULE> | <NT RULE> | <TL RULE>
<LL RULE> ::= ( "(" <NODE> ")" )+ ":=" ( ("-"|"+")? "(" <NODE> ")" )* ";"
<TT RULE> ::= (<SYN>)+ ":=" ( ("-"|"+")? <SYN> )* ";"
<NN RULE> ::= (<SEM>)+ ":=" ( ("-"|"+")? <SEM> )* ";"
<LT RULE> ::= ( "(" <NODE> ")" )+ ":=" ( <SYN> )+ ";"
<TL RULE> ::= (<SYN>)+ ":=" ( "(" <NODE> ")" )+ ";"
<TN RULE> ::= (<SYN>)+ ":=" ( <SEM> )+ ";"
<NT RULE> ::= (<SEM>)+ ":=" ( <SYN> )+ ";"
<SYN>, <SEM> ::= <TEXT> "(" <NODE> ";" <NODE> ")"
<NODE>       ::= ( <DESCRIPTION> ( "," <DESCRIPTION> )* )?
<DESCRIPTION>::= <STRING> | <ENTRY> | <SUB-ENTRY> | <FEATURE> | <INDEX> | <RELATION>
<INDEX>      ::= ( "%" ( [01-99] | [a-zA-Z_]+ ) )+
```

Named: `α` is one or more `<NODE>` (for `LL`/`LT`) or relation terms (`<SYN>`/`<SEM>`, for the
rest), on the left of `:=`; `β` is the same shape on the right. `%x` is an index: a variable that
binds a node so the right side can refer back to it. A leading `+` on the right side adds without
deleting the left side's matches; a leading `-` deletes without touching anything else; no sign
means replace. `^feature` on the left negates a condition: "this node does not carry `feature`".
`{a|b}` is disjunction, allowed only on the left side. Special-purpose rule types build on this
same `α:=β;` shape: an A-rule for affixation, a C-rule for compounding, an L-rule for word order,
an N-rule for normalisation, an S-rule for syntactic structure (see
`docs/unl-reference/formats/subcategorisation.md`).

## Worked example: three real English rules

From the archive's English analysis transformation grammar for corpus UC-A1, section 1.2
(verb morphology):

**Rule 1 — mark plural nouns:**
```
(N,PLR,^@pl,^@multal,^@paucal,^@all):=(+att=@pl); books > book.@pl
```
An `LL` rule. Left side: one node carrying the features `N` (noun) and `PLR` (plural), that does
not yet carry the attribute `@pl`, `@multal`, `@paucal` or `@all`. Right side: `+att=@pl` adds the
attribute `@pl` to that same node, leaving everything else on it untouched (`+` is additive, per
the syntax above). Applied to the surface word "books" (already tagged `N,PLR` by the dictionary),
the rule fires once, turning it into `book.@pl` — the base form carrying the UNL attribute for
plural, ready to enter the UNL graph.

**Rule 2 — fold an auxiliary's tense onto its verb:**
```
(AUX,%x)(GER,%y):=(%y,+att=@progressive,+att=%x);  is.@present killing > killing.@progressive.@present
```
An `LL` rule matching two adjacent list nodes: an auxiliary indexed `%x`, followed by a gerund
indexed `%y`. The right side keeps only `%y` — the auxiliary node itself disappears from the list,
consistent with "conservation": nothing is deleted unless the rule's right side omits it — and
adds two attributes to it: `@progressive` (fixed, because this is the gerund construction) and
whatever `%x` carried (here `@present`, copied from the auxiliary "is"). "is.@present killing"
becomes one node, "killing.@progressive.@present": the auxiliary's tense has moved onto the verb
it governed, because UNL has no separate node for an auxiliary.

**Rule 3 — attach negation to the word it negates:**
```
({[not]|[n't]})({V,^AUX|J|N|A|D},%x):=(+att=@not,%x); not kill > kill.@not
```
An `LL` rule with a disjunction on its first node: the literal word `[not]` or the contraction
`[n't]`. The second node, indexed `%x`, must be a verb that is not itself an auxiliary, or an
adjective, noun, adverb or determiner — the set of things "not" can negate. The right side omits
the first node entirely, deleting it, and rewrites `%x` with the attribute `@not` added. "not
kill" becomes "kill.@not": negation, in UNL, is an attribute on the negated concept, not a
separate node.

## Check against the wiki

The three rules above match the `LL RULE` formal syntax exactly: parenthesised nodes on both
sides, comma-separated feature lists, `%index` variables, `^` negation, `{a|b}` disjunction on the
left only, and a leading `+` for addition. No disagreement found between the wiki's rule grammar
and this real grammar file.

Source: UNL Archive, data/archive/wiki/T-rule.wikitext,
https://unlarchive.org/wiki/api.php?action=query&prop=revisions&titles=T-rule, CC BY-SA 4.0,
and data/archive/wiki/Rule.wikitext,
https://unlarchive.org/wiki/api.php?action=query&prop=revisions&titles=Rule, CC BY-SA 4.0.
Checked against data/archive/grammars/eng_unl_tgrammar.txt (manifest `grammars/eng_unl_tgrammar.txt`,
https://www.unlarchive.org/grammars/eng_unl_tgrammar.txt), CC BY-SA 2.5 CH.
