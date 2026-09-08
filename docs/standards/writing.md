# Writing

One voice for the whole project: the house voice used by the interrogation-time,
investigation-time and system-critique skills. It is Simplified Technical English with two
allowances, room to explain the mechanism and room for one concrete scene. The rules are in
`voice.md`; the calibration sample is `voice-sample.md`. Read the sample before writing prose.
Do not drift terser than it. Do not drift more ornate.

## The rules that matter most, repeated here

- Procedural sentences 20 words or fewer, descriptive 25 or fewer. Active voice, present tense,
  named actor: "the importer skips the line", not "the line may be skipped".
- One fact per sentence. One term, one meaning; the glossary in `SPEC.md` §2 wins over synonyms.
- State the mechanism, not the label: cause, effect, what the caller sees.
- Colour is a concrete scene with a time, an actor and a consequence, never an adjective.
  One scene per card at most.
- Numbers go in tables, tiles or the mono face, not in running prose.
- No filler, no hedging stacks, no rhetorical questions, no emoji, no exclamation marks, no
  praise inside a finding, no recaps, no closing offers.
- Titles: a finding title is a claim; an option or quest title is a name of three words or fewer.

## Two densities, one voice

The voice does not change between files. The density does.

| Terse: tables and lists, no scenes | Full: mechanism and one scene allowed |
|---|---|
| `.claude/skills/*/SKILL.md` | `README.md` |
| `.claude/agents/*.md` | `docs/adr/*.md` |
| `.claude/commands/*.md` | `docs/factory/PLAN.md` |
| `docs/standards/*.md` | `docs/factory/README.md` |
| `docs/factory/SPEC.md` | `docs/architecture/*.md` |
| `CLAUDE.md`, smallest of all | `docs/unl-reference/*.md` |
| issue file frontmatter and criteria | issue file `## What` |
| the console's tiles and rails | the console's quest cards |

Terse means imperative mood, decision first, no persuasion, no restating. Terse is not licence to
be approximate.

## The game vocabulary

The console and `/factory-status` may say quest, encounter, party, save point. The voice rules
still apply: a quest card opens with where it sits in the map and what the party is trying to do
there, then the evidence, then the next move. No cheering, no "great job". A won encounter reads
like a calm incident write-up, because that is what it is.

## Applies to

Commit messages, code comments, issue files, agent reports, chat replies, the console, and every
document. South African English spelling. Afrikaans words in prose are italicised on first use.
