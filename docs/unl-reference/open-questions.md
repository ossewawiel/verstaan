# Open questions

Places where the mirrored archive material disagrees with itself, or leaves a choice a
rule-author must make. One entry per question, resolved by a rule-author before it affects a
dictionary entry or a grammar rule.

## 1. Pre-2010 relations may still appear in older archive material

`spec/unl2010-changes.md` lists eight relations UNL2010 dropped or replaced: `bas`, `cag`,
`coo`, `frm`, `met`, `to`, `ppl`, `scn`. The archive's other mirrored pages, corpora and
dictionary excerpts span every spec version from 1996 onward, and some of that material was
written against a pre-2010 spec. A rule-author reading a dictionary entry or a transformation
grammar snippet that uses one of these eight labels must decide, case by case, whether to
translate it to its UNL2010 replacement or treat the source as out of scope. This page does not
resolve that; `unl2010-changes.md`'s table gives the mapping, but which mirrored artefacts still
carry the old labels has not been surveyed.

## 2. `plf` and `plt` are in the 2010 comparison table but missing from the mirrored relations page

`data/archive/wiki/UNL_Specs_comparison.wikitext` marks `plf` (initial place) and `plt` (final
place) as present in its 2010 column. Neither relation appears in
`docs/unl-reference/spec/universal-relations.md`'s 38-row table, otherwise verified correct
against the wiki. A rule-author who meets `plf` or `plt` in a corpus should know this gap exists,
rather than assume the mirrored relations page is fully consistent with the 2010 spec.

## 3. No other version contradiction found

Beyond the relation gaps covered in questions 1 and 2, the wiki pages mirrored for this reference
(document structure, sentence structure, Universal Words, Universal Attributes) describe one
consistent UNL2010 picture. The attribute list carries no version markers in the archive's own
tree diagram, so no attribute-level contradiction across spec versions was found. If a future
mirror pass adds pre-2010 attribute material, it should be checked against
`spec/universal-attributes.md` for the same kind of drift found in the relations table.
