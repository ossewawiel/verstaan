---
issue: 20
title: "Dictionary lookup against the runtime store"
milestone: M3
status: in-progress
depends_on: [19, 24]
agent: implementer
agents: [rule-author, implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: .worktrees/m3-20-dictionary-lookup
github_issue: 243
---
## What

`engine/src/dictionary_lookup.cpp` takes the tokeniser's (issue 19) output and, for each token,
looks up every matching entry in `data/languages/<iso3>/dictionary/<a-z>.yaml` by first letter of
the lower-cased surface form, per `SPEC.md` §3.3's shard-per-letter layout. A token with more
than one sense (homograph) carries every matching entry forward; disambiguation between senses
is issue 22's job (the rule interpreter reads `grammar/disambiguation.yaml`), not this one's. A
token with zero matching entries is marked unresolved and carried forward with no entry, so the
pipeline (issue 25) can still report `partial` rather than stopping.

`data/languages/<iso3>/tagset.yaml` is read once at load time to validate that every looked-up
entry's `features` map uses attribute-value pairs the tagset defines; an entry using a value the
tagset does not list is a lookup-time warning, not a crash — the store validator (issue 17)
already treats this as a warning at M2 and M3 keeps that severity for lookup, per `SPEC.md` §3.3.

## Acceptance criteria

- `engine/src/dictionary_lookup.cpp` reads `data/languages/eng/dictionary/*.yaml` and
  `data/languages/afr/dictionary/*.yaml` (sharded a-z) and `data/languages/eng/tagset.yaml` /
  `data/languages/afr/tagset.yaml`.
- Looking up every token from the fifteen fixed English sentences (issue 24) returns at least
  one dictionary entry for every content word; a GoogleTest fixture lists the expected headword
  and `id` for each, so a wrong shard or a wrong `iso3` translation fails loudly.
- A token with no matching entry (a proper noun or a typo, chosen from the fixed set or added as
  a synthetic fixture line) returns the unresolved marker, not a thrown exception.
- A homograph token (English "bank" or an Afrikaans equivalent with two dictionary senses, found
  by grep against the store) returns both entries, proving disambiguation is deferred, not lost.
- `ctest -R dictionary_lookup` runs green.

## Not in scope

Sense disambiguation (issue 22 reads `grammar/disambiguation.yaml` for that). Inflection lookup
(also issue 22, via `grammar/inflection.yaml`).

## Done when

- [ ] `engine/src/dictionary_lookup.cpp` and its test exist.
- [ ] `ctest -R dictionary_lookup` is green against the fixed set.
