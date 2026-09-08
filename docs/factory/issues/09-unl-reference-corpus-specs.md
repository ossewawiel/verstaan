---
issue: 9
title: "Agent-readable UNL reference: the specifications"
milestone: M1
status: open
depends_on: [7]
agent: docs-writer
agents: [docs-writer]
model: sonnet
effort: medium
checkpoint: null
commit: null
---
## What

Rewrite the mirrored wiki specification pages into `docs/unl-reference/spec/`: one page each for
UNL document structure, sentence structure, Universal Words, Universal Relations (a full table),
Universal Attributes (a full table), and the UNL2010 changes from earlier versions. Each page is
a rewrite in the writing voice, keeps every term as the archive spells it, has an example under
every rule, and ends with its source line.

## Acceptance criteria

- The relations table lists every relation the wiki lists, with label, meaning, one UNL example
  and one English gloss. Same for attributes.
- Every page's `Source:` line names the manifest `path` and `url` of the wiki page it came from.
- A `docs/unl-reference/README.md` index with one line per page and a "what is not here yet" list.
- No page describes Verstaan behaviour. These are the UNL specs, nothing more.
- Any place the spec versions contradict each other is listed in
  `docs/unl-reference/open-questions.md` for a rule-author to decide.

## Not in scope

Grammar and dictionary format pages (issue 10). The engine.

## Done when

- [ ] Six spec pages plus the index and open-questions file exist.
- [ ] A rule-author can answer "what does `agt` mean" and "what does `@entry` do" from the
      reference alone, checked by the reviewer reading two random entries.
