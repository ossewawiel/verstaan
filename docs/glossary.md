# Glossary

One term, one meaning, for the whole project. This file is the source. `SPEC.md` §2 points here.
Use these words in code, data, issues, chat and the console. Do not introduce a synonym; add a
term here instead, with the file that defines it.

## UNL and language

| Term | Meaning | Defined in |
|---|---|---|
| UNL | Universal Networking Language. A language-independent representation of a sentence as a graph of concepts and relations. | `docs/unl-reference/spec/` (M1) |
| UW | Universal Word. One UNL concept, written as a headword with restrictions, e.g. `book(icl>publication)`. | UNL specs |
| Relation | A labelled binary edge between two UWs, e.g. `agt` (agent), `obj` (object), `mod` (modifier). | UNL specs |
| Attribute | A flag on a UW carrying grammatical or pragmatic information, e.g. `@def`, `@past`, `@pl`. | UNL specs |
| UNL graph | The set of relations and attributes for one sentence. The interlingua form. | `SPEC.md` §3.4 |
| Analysis | Natural language into a UNL graph. The archive calls this UNLization or enconversion. | `SPEC.md` §2 |
| Generation | A UNL graph into natural language. The archive calls this NLization or deconversion. | `SPEC.md` §2 |
| Transformation grammar | Rules that rewrite a sentence structure step by step in one direction, analysis or generation. | `docs/unl-reference/formats/` (M1) |
| Disambiguation grammar | Rules that choose between candidate readings. | same |
| Inflectional paradigm | Rules that produce word forms from a base form. | same |
| Subcategorisation frame | The arguments a lexical item takes and where they go. | same |
| Tagset | The feature vocabulary used in dictionary entries and rules: `LEX`, `POS`, `NUM` and the rest. | `data/languages/<iso3>/tagset.yaml` |
| Dictionary entry | One headword with its features, UW, language and priority. | `SPEC.md` §3.2 |
| Base form | The dictionary form of a word. The archive counts languages by base forms. | archive language table |
| Word form | An inflected surface form of a base form. | same |
| Register | formal, informal or technical. A tag on dictionary entries that steers word choice. | `SPEC.md` §2 |
| Context | A domain tag on dictionary entries, e.g. medical, rescue. | `SPEC.md` §2 |
| Dialect | A regional tag on dictionary entries. | `SPEC.md` §2 |
| Corpus | Sentences with their UNL graphs, used as tests and as reference. | `SPEC.md` §3.3 |
| Golden sentence | An input with the expected output, written by a human or taken from the corpus, never by the engine. | `docs/standards/testing.md` |
| Trace | The ordered list of rules that fired for one translation. The audit trail. | `SPEC.md` §3.4 |
| Partial | A translation where some words fell through untranslated and are marked `⟦word⟧`. | `SPEC.md` §3.4 |

## System

| Term | Meaning | Defined in |
|---|---|---|
| Archive | The UNL Archive at unlarchive.org, and its verbatim copy under `data/archive/`. | ADR 0004 |
| Mirror | `tools/mirror`, the crawler that copies the archive verbatim with a manifest. | `SPEC.md` §3.1 |
| Manifest | `data/archive/manifest.jsonl`, one line per mirrored file: url, date, hash, licence. | `SPEC.md` §3.1 |
| Importer | `tools/importer`, which parses archive formats into the store. | `SPEC.md` §3.2 |
| Store | `data/languages/<iso3>/`, the canonical YAML data. | `SPEC.md` §3.3 |
| Compiler | `tools/compiler`, which turns the store into generated C++ tables per tier. | `SPEC.md` §3.5 |
| Engine | `engine/`, the C++ core that runs the rules. One engine, two rule back ends. | ADR 0007 |
| Runtime tables | Rules loaded from the store at run time, for authoring and tests. | ADR 0007 |
| Generated tables | Rules compiled into `engine/generated/<tier>/`, for shipping. | ADR 0003 |
| Equivalence test | A test that runs one sentence through both back ends and diffs the result. | ADR 0007 |
| Tier | A compile-time build profile: `basic`, `phone`, `connected`. | ADR 0006 |
| Fixture pair | `xxa` and `xxb`, two invented languages used only for engine tests. | `docs/standards/testing.md` |
| Reference set | The well-resourced archive languages used as models when drafting rules: eng first, then deu, fra, spa. | `.claude/agents/rule-author.md` |

## Factory and game

| Term | Meaning | Defined in |
|---|---|---|
| Factory | The agents, commands, hooks and files that build Verstaan. | `docs/factory/PLAN.md` §6 |
| Map | The repository and its milestones. Explored ground is merged code. | `PLAN.md` §6.6 |
| Main quest | The current milestone branch. | `PLAN.md` §7 |
| Side quest | An open issue whose milestone is `Side` or `Post-M6` and whose dependencies are met. | `PLAN.md` §6.6 |
| Encounter | One issue and its one work commit. The archive of encounters is the git history. | `docs/factory/git-workflow.md` |
| Quest giver | Interrogation or investigation work that decides what to do next. | `docs/decisions/` |
| Party | The five agents, each costed to a model and an effort. | `.claude/agents/` |
| Skill | A named procedure the party uses: the TDD sequence, the gates, the retro. | `.claude/skills/` |
| Gate | A check the build enforces. Three tiers: auto-fix, fast, full. | `SPEC.md` §5 |
| Stamp | An empty file `<git-common-dir>/verstaan-gate-stamps/<sha>`, one per commit the full gate passed on. Shared by every worktree. | `.claude/commands/gate.md` |
| Save point | `STATE.md` plus the stamp: where a cold session resumes. | `CLAUDE.md` |
| Checkpoint | A point where the factory stops for a human. Four kinds. | `PLAN.md` §6.3 |
| Boss fight | Checkpoint 4: the verifier reads the whole diff before a merge. | `.claude/agents/verifier.md` |
| Ledger | `docs/factory/lessons.jsonl`, one line per fast-gate failure. | `.claude/hooks/capture-failure.sh` |
| Signature | The `sig` field of a ledger line. Three of a kind is ripe for the retro. | `.claude/skills/factory-retro/SKILL.md` |
| Level | A rule promoted from the ledger by the retro, with approval. | same |
| Console | The app: `apps/console/`, a Fastify server and a React client at `http://127.0.0.1:7864`, read-only, rooms as real routes, updated live over SSE. The one part of the repository allowed its own dependencies. A zero-dependency file-based copy for `file://` use stays under `tools/console/`. | ADR 0010 |
| Library | The console's index of every project document. | `apps/console/` |
| Issue file | `docs/factory/issues/NN-title.md`. The source of truth for status. | `SPEC.md` §6 |
| Test-cases companion | `NN-test-cases.md`, the rule-author's table that becomes tests. | `.claude/agents/rule-author.md` |

## Words we do not use

| Instead of | Say | Why |
|---|---|---|
| enconvert, deconvert | analysis, generation | one term per direction |
| UNLization, NLization | analysis, generation | same |
| ticket, story, task | issue, encounter | the file is an issue; the act of doing it is an encounter |
| sprint | milestone | there is no clock, only a branch |
| interpreter | runtime tables | there is one engine, not two |
| fallback model, LLM | neural layer | and it lives only in the connected tier |
