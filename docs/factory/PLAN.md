# Verstaan — the plan

Human-facing. This file says what we decided, why, and how the work is cut. `SPEC.md` carries the
agent-facing detail and keeps these section numbers so a reference to "§3" means the same thing in
both files. Status lives in `docs/factory/issues/` and is rendered into `STATE.md`; this file does
not track progress.

## 1. What we are building

A deterministic, rule-based translator built on the Universal Networking Language. The vision is in
`verstaan.md`. The decisions below came out of a five-turn interrogation on 2026-09-07 and
2026-09-08; the brief is at `docs/decisions/2026-09-08-verstaan/interrogation.html`.

The engine is the product. Its job is to find out how far rules can go. Neural translation is not
in the translation path and only ever enters as a last resort in the connected tier, behind a
measured trigger that has not been defined yet and will not be defined before M5.

## 2. Decisions already made

Each one has an ADR under `docs/adr/`. The one-line versions:

| ADR | Decision |
|---|---|
| 0001 | The engine is UNL-native and rule-based; Apertium, neural and phrasebook shapes are struck. |
| 0002 | Licence package "Shared Files": MPL-2.0 engine, CC BY-SA 4.0 data, Apache ICLA, name policy. |
| 0003 | Generated data builds as a separate library; the engine links to it and never copies it in. |
| 0004 | Phase 1 mirrors every language in the UNL Archive, with a manifest of source, licence and date. |
| 0005 | We write our own tools from the UNL specs, wiki and archive pages; the archived tool source is not available. |
| 0006 | Three compile-time tiers: basic comms, phone, connected. The first two are rules-only. |
| 0007 | One engine, two rule back ends: tables loaded at run time for authoring, generated code for shipping. Both must produce identical output. |
| 0008 | Rule compiler and mirror tooling in Python; engine in C++20 with CMake and vcpkg. |

## 3. Architecture

```
  unlarchive.org ──► tools/mirror ──► data/archive/          (raw exports + manifest, CC BY-SA)
                                          │
                                   tools/importer
                                          ▼
                                  data/languages/<lang>/     (canonical YAML: dictionary, grammar,
                                          │                   tagset, corpus, test sentences)
                       ┌──────────────────┴──────────────────┐
                       ▼                                     ▼
              engine (runtime tables)              tools/compiler ──► engine/generated/<tier>/
              for authoring and tests                       (C++ tables, one static lib per tier)
                       └──────────────────┬──────────────────┘
                                          ▼
                                  engine/ core (C++20)
                              tokenise → analyse → UNL graph → generate → inflect
                                          │
                     ┌────────────┬────────┴────────┬──────────────┐
                     ▼            ▼                 ▼              ▼
                apps/cli     apps/desktop      tier: basic     apps/service
                                                (Pi Zero)      (connected)
```

Key shapes, in the order the data flows:

- **Mirror** (`tools/mirror`): a Python crawler for the public pages, the MediaWiki, the static
  grammar files and the logged-in UNLarium exports for every language. Output is verbatim files
  under `data/archive/` plus `manifest.jsonl`. It never rewrites content.
- **Importer** (`tools/importer`): parses the UNLarium dictionary and grammar formats into
  canonical YAML under `data/languages/<iso3>/`. The archive formats are documented in the wiki
  pages the mirror fetches; the parser is written against those pages and the real exports.
- **Canonical store** (`data/languages/`): one folder per language. `dictionary/*.yaml`,
  `grammar/{analysis,generation,inflection,subcategorisation,disambiguation}.yaml`, `tagset.yaml`,
  `corpus/*.yaml`, `tests/*.yaml`. Diffable, reviewable, agent-friendly.
- **Engine** (`engine/`): C++20, no runtime dependencies. Loads rules either from runtime tables
  (YAML converted to a binary blob at build time) or from generated code. Same rule semantics
  either way, tested for equivalence.
- **Compiler** (`tools/compiler`): Python. Reads the store, emits C++ tables and dispatch code per
  tier, plus the golden test vectors.
- **Applications** (`apps/`): CLI first, then desktop, then service.

## 4. Repository layout

```
CLAUDE.md                     index only, under 70 lines
docs/factory/                 PLAN, SPEC, STATE, README, git-workflow, lessons.jsonl, issues/
docs/adr/                     NNNN-decision-as-a-sentence.md
docs/standards/               cpp.md · data.md · testing.md · writing.md
docs/architecture/            overview.md and per-component design notes, grown per milestone
docs/unl-reference/           agent-readable UNL specs and grammar docs, produced by M1
docs/decisions/               interrogation brief (reference)
data/archive/                 mirror + manifest.jsonl   (CC BY-SA)
data/languages/<iso3>/        canonical store           (CC BY-SA)
engine/                       C++ core, engine/generated/<tier>/ is compiler output
tools/mirror · importer · compiler · validate
apps/cli · desktop · service
tests/                        engine tests, golden files, equivalence tests
.claude/                      the factory: agents, skills, commands, hooks, settings.json
```

## 5. Technology

| Area | Choice | Why |
|---|---|---|
| Engine | C++20, CMake ≥ 3.28, vcpkg for test deps only | Speed, portability, the user's existing toolchain at `D:\SourceCode\vcpkg` |
| Compilers | MSVC on Windows for daily work; clang and gcc in CI; ARM cross-build for the basic tier | The basic tier must be proven on a Pi |
| Tests | GoogleTest via vcpkg; golden-file sentence tests; equivalence tests between rule back ends | Deterministic engine makes golden tests reliable |
| Format and lint | clang-format, clang-tidy | The auto-fix gate tier |
| Tooling | Python 3.13, `uv` or venv, pytest, ruff | Fast to iterate on parsers and the compiler |
| Data | YAML in git; SQLite index built on demand for the management UI later | Reviewable in pull requests |
| CI | Local hook gates from day one; GitHub Actions matrix (windows, ubuntu; arm from M4) running the same gate steps, added by side quest 91 | The gate ladder is the CI on day one, and the remote runs the same ladder |
| Source control | Git, single repository, milestone branches, one commit per issue; GitHub milestones, labels and pull requests as a mirror of the issue files, never the other way round (side quest 91) | The history is a deliverable; the files stay the only truth |
| Console | Node 20+, Fastify, TypeScript server; React 19, TypeScript, Vite client; TanStack Query; React Router; plain CSS (side quest 99, ADR 0010) | The one part of the repository allowed dependencies of its own — it never sits on the translation path (ADR 0008 keeps the engine and the Python tools at zero) |

## 6. The code factory

Copied in shape from `timewarp`, adapted for C++ and data work. Three principles hold it up:

1. **The issue files are the state.** `STATE.md`, memory and any tracker are renderings.
2. **A rule the build enforces beats a rule an agent has to remember.** Formatting, compile, fast
   tests and coverage run from hooks. The full gate stamps the commit; a pre-tool hook refuses to
   open a pull request without that stamp.
3. **Failures become data, then rules, with a human in the loop.** The Stop hook appends to
   `lessons.jsonl`; `/factory-retro` proposes; a human approves.

### 6.1 Components

| Piece | Where | Job |
|---|---|---|
| `/factory-status` | `.claude/commands/` | Regenerate `STATE.md`, print the next command. Cold-start safe. |
| `/factory-run [n]` | `.claude/skills/factory-run/` | Pick the next open issue, route it to agents, run gates, stop at checkpoints. |
| `/gate` | `.claude/commands/` | The full local gate before a pull request. Writes the stamp. |
| `/quest [main\|side] [seed]` | `.claude/skills/quest/` | The quest giver: plan one quest with the developer, write its issue file, validate, mirror. Never starts the work. |
| `/factory-retro` | `.claude/skills/factory-retro/` | Turn repeated failures into rules. Never applies without approval. |
| `implementer` | `.claude/agents/` | Makes failing tests pass; builds tooling and engine code. Sonnet, medium. |
| `test-writer` | `.claude/agents/` | Turns a test table into failing tests. Sonnet, medium. |
| `rule-author` | `.claude/agents/` | Drafts grammar rules and dictionary entries against the reference languages, with test sentences. Opus, high. |
| `docs-writer` | `.claude/agents/` | Prose documentation and the UNL reference corpus. Sonnet, low. |
| `verifier` | `.claude/agents/` | One adversarial read of the diff before a pull request. Opus, high, read-only. |
| Hooks | `.claude/hooks/` | `fast-format`, `gate-fast` (Stop), `require-gate` (PreToolUse), `capture-failure`. |

### 6.2 Routing

| Issue kind | Agents | Model / effort |
|---|---|---|
| Tooling, mirror, importer, compiler | implementer | sonnet / medium |
| Engine core design | rule-author for the test table, then test-writer, then implementer | opus high, sonnet medium, sonnet medium |
| Grammar and dictionary growth | rule-author, then test-writer | opus high, sonnet medium |
| Documentation, reference corpus | docs-writer, in parallel with the above | sonnet / low |
| Pre-PR | verifier | opus / high |

The three-pass sequence is expensive. Use it for engine core issues and rule design. Tooling
issues take one implementer pass.

### 6.3 Checkpoints

The factory stops and waits for a human at four points: after the first issue of each milestone
lands (checkpoint 1), when a grammar rule set for a language first parses a whole test corpus
(checkpoint 2), before the compiler's generated code first replaces runtime tables in a build
(checkpoint 3), and before every pull request (checkpoint 4, the verifier runs here).

### 6.4 Gate ladder

| Tier | Trigger | Contents | Time |
|---|---|---|---|
| Auto-fix | PostToolUse on `.cpp .hpp .py .yaml` | clang-format, ruff format | ~1 s |
| Fast, blocking | Stop hook | configure, build the engine target, run `ctest -L fast`, validate changed data files | < 60 s |
| Full, explicit | `/gate` before a PR | everything above plus all tests, clang-tidy, equivalence tests, tier builds, data validation of the whole store | minutes |

### 6.5 Why CLAUDE.md is short

It is loaded every session, so it is the most expensive real estate we own. Cross-cutting rules
only. Demotion order for any new rule: a gate, then the relevant skill file, then a standards file,
then CLAUDE.md as a last resort.

### 6.6 The game and the console

The factory plays as an exploration: the map is the repository and the milestones, a main quest
is the current milestone branch, a side quest is an unblocked out-of-order issue, an encounter is
one issue and its commit, the party is the five agents costed to a model and effort each, and
levelling is a lesson promoted to a rule by the retro. The quest giver is the interrogation and
investigation work that decides what to do next. The console is a small Node/React app
(`apps/console/`, side quest 99, ADR 0010): a Fastify server with a read-only JSON API over the
issue files, git, the gate stamp and the ledger, and a React client that renders five rooms —
Console, Quests, Playbook, Library, Glossary — as real routes and diffs its own DOM on every
change instead of reloading. It never invents state and never writes to the repository; that is
quest 100. Its top panel is always one next move to type and one side task under ten minutes that
only the owner can do. A zero-dependency file-based copy stays under `tools/console/` for a
`file://` reader with no service running (`node tools/console/src/generate.mjs`). Skin: the
Colonial CIC theme from bob's docsite, amber phosphor on hull grey, cut-corner panels, status
carried by glyph and label as well as colour. Voice: `docs/standards/voice.md`, no cheering. The
console was a Post-M6 side quest, pulled forward once already (quest 95) and again for quest 99,
because the owner keeps it open every session.

## 7. Milestones and backlog

Issues are `docs/factory/issues/NN-kebab-title.md`. The numbers below are the plan; the files win.

| Milestone | Branch | Goal | Issues |
|---|---|---|---|
| M0 Foundation | `m0-foundation` | Repo, licences, factory, CMake and Python skeletons, gates proven to fail | 01–06 |
| M1 Mirror | `m1-mirror` | Every language exported, manifest complete, UNL reference corpus readable by agents, inventory report | 07–12 |
| M2 Store | `m2-store` | Canonical data model; importer for dictionaries, grammars, tagset, corpora; validator | 13–18 |
| M3 Engine slice | `m3-engine` | Tokeniser, dictionary lookup, rule interpreter on runtime tables, English → UNL → Afrikaans for a fixed sentence set, golden tests | 19–26 |
| M4 Compiler and tiers | `m4-compiler` | Generated tables per tier, equivalence tests, basic tier cross-built and run on a Pi Zero, Argos benchmark beside it | 27–32 |
| M5 Applications | `m5-apps` | CLI translator, register and context selection, first desktop shell | 33–38 |
| M6 Growth | `m6-growth` | Rule-author workflow for Afrikaans grammar growth, Dutch seeded from German and English references, CLA check, project site | 39–44 |
| Post-M6 | — | Neural fallback trigger, service tier, dashboards, bob harvest into a C++ project type | later |

The M0 and M1 issue files exist now. Later milestones get their issue files at the checkpoint
that opens them, written from this table and from what M1 finds in the archive.

## 8. Kickstart prompts

Copy-paste blocks for a cold session.

**Prompt 0, status.** `/factory-status`

**Prompt 1, run the next issue.** `/factory-run`

**Prompt 2, run a specific issue.** `/factory-run 07`

**Prompt 3, retro.** `/factory-retro` — once mid-milestone and once before each pull request.

**Prompt 4, gate and PR.** `/gate` then open the pull request as `git-workflow.md` describes.

**Prompt 5, write the next milestone's issues.** "Read PLAN.md §7 and SPEC.md, then write the
issue files for M2 in the shape of `docs/factory/issues/07-*.md`, one per row, with acceptance
criteria that a test can check. Do not start any of them."

## 9. Things only the owner can do

- Change the UNL Archive password. It was pasted into a chat on 2026-09-08.
- Move the Gmail export out of this folder. `.gitignore` hides it, but it should not live here.
- Write to admin@unlarchive.org asking for the EnCo, DeCo, IAN and EUGENE source, in case it
  turns up later. Nothing in this plan depends on it.
- Decide whether to plant bob (`/bob:build-me`, setup-only mode) over this factory once the C++
  gates work, and harvest the result back as bob's first C++ project type.
- Say when to run side quest 92, which gives each quest its own git worktree so two sessions never
  share a tree. It needs no remote and should run before 91.
- Say when to run side quest 91, which creates the GitHub remote, mirrors the issue files to
  milestones and labels, and adds Actions. Until then, gates are local and the "PR" in the
  workflow is a merge into `main` after `/gate`. Decide then whether the repository is public.

## 10. How context survives between sessions

| File | Who reads it | When |
|---|---|---|
| `CLAUDE.md` | every agent | every session, automatically |
| `STATE.md` | the human and `/factory-run` | first thing |
| the current issue file | the routed agent | when it starts |
| `SPEC.md` | any agent about to write code | before the first edit |
| `lessons.jsonl` | `/factory-retro` | mid-milestone and pre-PR |
| memory (`~/.claude-private/projects/.../memory/`) | Claude | recall; never authoritative over the files |

That is the whole resume story. No separate progress tracker to keep in sync.
