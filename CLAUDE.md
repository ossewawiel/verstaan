# Verstaan

A deterministic, rule-based translator built on the Universal Networking Language (UNL). Rules and
dictionaries live as data under `data/`; a compiler turns them into C++ tables; one engine runs them.
Afrikaans and English first, every archived language mirrored. Engine is MPL-2.0, data is CC BY-SA 4.0.

## Where things live

| Read | For |
|---|---|
| `docs/factory/STATE.md` | What is done and what is next. **Start here in any session.** |
| `docs/factory/SPEC.md` | Agent-facing: data model, pipeline, contracts, gates. **Read before coding.** |
| `docs/factory/PLAN.md` | Human-facing: decisions, architecture, milestones, kickstart prompts. |
| `docs/factory/issues/` | The backlog. **The issue files are the source of truth for status.** |
| `docs/adr/` | Why things are the way they are. One decision per file, title is the decision. |
| `docs/standards/` | How we write C++, data files, tests and prose. |
| `docs/glossary.md` | One term, one meaning. Use these words and no synonyms. |
| `docs/factory/playbook.md` | How an encounter, a gate, a checkpoint and a level work. |
| `console.cmd`, `console.sh` | The console: starts the local service and opens `http://127.0.0.1:7864`, live across every tree. |
| `docs/decisions/` | The interrogation brief that produced this plan. Reference only. |
| `verstaan.md` | The original vision and initial specification. |

When working in a sub-tree, read its `CLAUDE.md` first if one exists: `engine/`, `tools/`, `data/`.

## How we write

The house voice: Simplified Technical English with room for the mechanism and one concrete scene.
Short sentences, named actor, one fact each, no filler, no emoji. Agent-facing files are terse;
human-facing files carry the mechanism. Rules in `docs/standards/voice.md`, sample in
`docs/standards/voice-sample.md`, the density table in `docs/standards/writing.md`.

## Non-negotiables

- **Data is the source of truth; code is generated from it.** Never hand-edit generated C++ under
  `engine/generated/`. Fix the data or the compiler.
- **One work commit per issue, never on `main`.** An issue is done when its commit is on the
  milestone branch and the issue file says `status: done`. The git history is a deliverable.
- **A gate is not proven by watching it pass.** Prove it fails first. See `docs/standards/testing.md`.
- **Generated data stays a separate library.** It is CC BY-SA. The engine links to it and never
  copies it into engine source. See ADR 0003.
- **Never write archive credentials or personal data into the repo.** The mirror keeps only
  language data and documentation. `.gitignore` already blocks the mail export in this folder.
- **Attribute the archive.** Every mirrored item carries source URL, licence version and retrieval
  date in `data/archive/manifest.jsonl`.

## Resuming after any interruption

Run `/factory-status`. It regenerates `STATE.md` from the issue files and prints the next command.
If `STATE.md` and the issue files disagree, the issue files win.
