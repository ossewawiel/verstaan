# UNL2010 changes from earlier versions

The UNL Specs have gone through several numbered and dated versions since 1996: 1.0, 1.5, 2.0,
1998, 3.0, 3.1, 3.2, 3.3, 2005 and 2010. The UNL Archive's own comparison table tracks which
relations existed in which version. This page lists what changed by UNL2010, the version this
reference corpus otherwise describes. The other five spec pages in this folder describe UNL2010
as it stands, not the history; this page is where the history lives.

## Relations dropped and folded into a broader relation

Several relations that existed through the 2005 spec do not appear in 2010, because a broader
relation already in the hierarchy (`docs/unl-reference/spec/universal-relations.md`) was judged
to subsume them:

| Dropped relation | Meaning | Subsumed by |
|---|---|---|
| `bas` | basis for a comparison | `per` (proportion, rate, distribution, measure or basis for comparison) |
| `cag` | co-agent | `ptn` (partner) |
| `coo` | co-occurrence | `dur` (duration) |
| `frm` | origin | `src` (source) |
| `met` | method | `ins` (instrument or method) |
| `to` | destination | `gol` (goal) |

## Relations dropped and replaced outright

Two relations were replaced by a different relation rather than folded into a broader one:

| Dropped relation | Meaning | Replaced by |
|---|---|---|
| `ppl` | physical place | `plc` (place) |
| `scn` | scene | `lpl` (logical place) |

## Relations reintroduced in 2010

Four relations appear in an early version, disappear for several intermediate versions, and
reappear in 2010, per the archive's comparison table:

| Relation | Meaning | Present in | Absent from | Reintroduced in |
|---|---|---|---|---|
| `ant` | antonym | 1.5 | 2.0, 1998, 3.0–3.3, 2005 | 2010 |
| `exp` | experiencer | 1.0 | 1.5, 2.0, 1998, 3.0–3.3, 2005 | 2010 |
| `fld` | semantic field | 1.5 | 2.0, 1998, 3.0–3.3, 2005 | 2010 |
| `mat` | material | 1996 | 1.0–3.3, 2005 | 2010 |

## The source-target order of `and` and `or`

Up to the 2005 spec, "Mary and John" was written `and(John, Mary)`: the first-named entity was
the target. From UNL2010 onward, the same phrase is written `and(Mary, John)`. The change keeps
`and` and `or` consistent with the general rule that the target defines the relation
(`docs/unl-reference/spec/universal-relations.md`): the target is now the entity conjunction
adds to the source, in the same left-to-right order the source text names them.

## Worked example

The English "traded books for jam" would, in the 3.3 spec, have used `to` for the recipient
side of the trade. In UNL2010, the same fact uses `gol`, because `to` no longer exists as a
separate relation:

```
gol(traded, jam)
```

A rule-author reading a dictionary entry or a transformation grammar mirrored from a pre-2010
source that still uses `to`, `frm`, `met`, `bas`, `cag`, `coo`, `ppl` or `scn` should treat that
entry as written against an earlier spec version, and map it to the UNL2010 relation this page
names before writing a rule against it.

Source: UNL Archive, data/archive/wiki/UNL_Specs_comparison.wikitext, https://unlarchive.org/wiki/api.php?action=query&prop=revisions&titles=UNL Specs comparison, CC BY-SA 4.0
