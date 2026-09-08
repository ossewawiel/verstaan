# Verstaan

> **Verstaan** (Afrikaans): *to understand* or *to comprehend*. The word carries both meanings, and that ambiguity is itself the problem this project exists to solve: translation is never just words, it is words in context.

**Status:** Initial specification (draft 0.1). Superseded for planning by `docs/factory/PLAN.md` on 2026-09-08; this file stays as the vision.
**Owner:** Marsel Pretorius
**Date:** 2026-09-07

> Where to go next: `docs/factory/STATE.md` for status, `docs/factory/PLAN.md` for the plan and
> architecture, `docs/adr/` for the decisions, `docs/decisions/2026-09-08-verstaan/interrogation.html`
> for how they were reached.

---

## 1. Vision

Despite the rise of large language models and services such as Google Translate, there is still a real need for **fast, high-quality translation that works without an internet connection**, without a large statistical database, and without an LLM. Translation that is so fast it can be immediate in urgent situations.

Verstaan aims to build a **deterministic, rule-based ("mechanical") translator**. The rules of translation are hard-coded, so the same input always produces the same output, and the engine can run:

- on **small devices** for general-purpose translation, and
- as **larger services** for more comprehensive, accurate, well-formed and context-sensitive translation,

while remaining as fast and immediate as possible in both cases.

## 2. Background: the Universal Networking Language (UNL)

A little more than a decade ago I had the privilege of being part of the **UNL Web** undertaking. It was built on the theory of the **Universal Networking Language (UNL)**, a large research initiative undertaken by various universities, intellectuals and academics in the field of machine translation. Numerous papers and books describe it.

The core idea:

1. A sentence in a source language is analysed using **rules, context, words and concepts**.
2. It is converted into a **language-independent UNL representation** (a network of universal concepts and the relations between them).
3. From that UNL representation, the sentence can be **generated back into any target language** accurately, using that language's own rules.

### 2.1 How UNL captures a language

- **Dictionaries / libraries** are built around words and concepts. Each entry carries specific properties (part of speech, grammatical features, semantic attributes, and so on).
- **Grammar rules** for each language are captured separately: word order, agreement, sentence construction and the interconnectedness of sentence parts.
- **Analysis** ("enconversion"): a source sentence is progressively mutated by rules into a UNL sentence.
- **Generation** ("deconversion"): a UNL sentence is progressively mutated by the target language's rules into a natural sentence in that language.

### 2.2 Context, register and dialect

Words are tagged with **context**, so that when a translation is requested for a given context, the words flagged as favouring that context are preferred. The same mechanism applies to **register** (formal / informal / technical) and **regional dialects**.

## 3. Purpose of this project

To create, with the help of coding agents, the software needed to:

1. **Capture** all the grammar rules, dictionaries and concept libraries that UNL-style translation requires.
2. **Manage and enrich** that data through desktop-driven user interfaces.
3. **Compile** the captured rules into **extremely fast C++ libraries** that translate sentences from one language into another with immediate processing.
4. **Build testable applications** on top of those libraries, from small embedded translators to comprehensive translation services.

## 4. Goals and non-goals

### 4.1 Goals

- Deterministic, reproducible translation with no network dependency.
- Sub-second (ideally near-instant) translation of typical sentences on modest hardware.
- A scalable quality tier: a compact rule set for small devices, a full rule set for servers.
- Context-, register- and dialect-aware word selection.
- Tooling that makes rule and dictionary capture fast, verifiable and largely agent-driven.
- An initial language pair of Afrikaans ⇄ English, with the architecture open to any UNL-supported language. *(Assumption, to be confirmed.)*

### 4.2 Non-goals (for now)

- Competing with LLMs on open-ended, creative or highly idiomatic text.
- Speech recognition or speech synthesis (possible future integration points only).
- Building a general-purpose NLP research platform. The scope is UNL-based translation.

## 5. System overview

The project is made up of several distinct segments. Each will get its own detailed specification; this section fixes the overall shape.

| # | Segment | Purpose |
|---|---------|---------|
| 1 | **Archive harvesting** | Recover all documentation, dictionaries, grammar rules and data from the archived UNL Web site, and convert it into formats suitable for agentic coding and for loading into the data store. |
| 2 | **Core data model and store** | A canonical representation of UNL concepts, dictionary entries, attributes, relations, and per-language grammar rules, with versioning. |
| 3 | **Rule and dictionary management tools** | Desktop UIs and CLI utilities for capturing, enriching, validating and reviewing language data. |
| 4 | **Rule compiler** | Transforms the stored rules into generated C++ source and compiled libraries for the translation engine. |
| 5 | **Translation engine** | The fast C++ runtime: enconverter (source → UNL), deconverter (UNL → target), context/register selection. |
| 6 | **Applications** | Testable end-user applications built on the engine: CLI, desktop, embedded, and service/API deployments. |
| 7 | **Coding factory and agent tooling** | Prompts, skills, templates and pipelines that let coding agents do the bulk of the capture and implementation work reliably. |
| 8 | **Project presence and dashboards** | Beautiful project information site, management site, write-ups and progress dashboards. |

## 6. Architecture (initial)

```
                    ┌──────────────────────┐
  UNL Web archive ─►│ 1. Archive harvester │─► structured docs + raw data
                    └──────────┬───────────┘
                               ▼
                    ┌──────────────────────┐   ┌────────────────────────┐
                    │ 2. Canonical store   │◄──│ 3. Management desktop  │
                    │ (concepts, dicts,    │   │    UI + CLI tools      │
                    │  grammar rules)      │   └────────────────────────┘
                    └──────────┬───────────┘
                               ▼
                    ┌──────────────────────┐
                    │ 4. Rule compiler     │─► generated C++ + test vectors
                    └──────────┬───────────┘
                               ▼
                    ┌──────────────────────┐
                    │ 5. Translation engine│  (C++ libraries: enconvert,
                    │                      │   deconvert, context select)
                    └──────────┬───────────┘
                               ▼
        ┌─────────────┬────────┴────────┬──────────────┐
        ▼             ▼                 ▼              ▼
   6a. CLI       6b. Desktop      6c. Embedded    6d. Service / API
```

Key principles:

- **Data is the source of truth; code is generated from it.** Rules live in the store, not hand-written in C++.
- **Everything is testable.** Every rule and dictionary entry should come with example sentences that become regression tests for the compiled engine.
- **Two build profiles** from one rule set: *compact* (small devices) and *full* (services).
- **Agent-first workflows.** Every repetitive task (capture, enrichment, test generation, documentation) is designed so a coding agent can do it from a prompt.

## 7. Technology (proposed)

| Area | Choice | Rationale |
|------|--------|-----------|
| Translation engine | **C++20**, CMake, no runtime dependencies | Speed, portability to small devices |
| Rule compiler | C++ or a scripting host (Python / Kotlin) generating C++ | Flexibility while the rule format stabilises |
| Data store | Structured text (YAML/JSON) under source control, with SQLite/PostgreSQL for the management tools | Diffable, reviewable, agent-friendly; DB for querying at scale |
| Management desktop UI | To be decided (candidates: Kotlin/Compose Desktop, Qt, Tauri) | Cross-platform desktop, rich editing |
| Project / management web sites | To be decided (candidate: Next.js + MUI, matching existing template library) | Existing house templates available |
| Testing | GoogleTest / Catch2 for C++, golden-file sentence tests, property tests for rule symmetry | Deterministic engine makes golden tests reliable |
| CI/CD | GitHub Actions (build matrix: Windows, Linux, ARM) | Verify small-device builds continuously |
| Source control | Git, monorepo with one directory per segment | Shared data model, single history |

These are proposals for discussion, not decisions.

## 8. Methodology

- **Specification-driven.** Each segment gets a functional specification (using the house *functional-specification-template*) before implementation starts.
- **Agentic coding.** Coding agents work from the specifications, the house coding standards, and a project-specific `CLAUDE.md`. Humans review, decide and enrich.
- **Small vertical slices.** The first slice is one language pair, a handful of grammar rules, a small dictionary, and a working end-to-end translation of a few sentences. Then widen.
- **Test-first for rules.** A rule is not accepted without example sentences that prove it.
- **Document as you go.** Write-ups accompany every milestone and feed the project site.

## 9. Phased roadmap

### Phase 0: Foundation
- Set up the repository, CI, coding standards, `CLAUDE.md`, and the documentation set (see section 10).
- Gather references: UNL papers, books and the archived web site.

### Phase 1: Archive harvesting
- Crawl and download everything from the archived UNL Web site.
- Convert documents to Markdown; extract dictionaries and rules into structured data.
- Produce an inventory: what exists, what is usable, what is missing.

### Phase 2: Data model and management tools
- Define the canonical data model for concepts, dictionary entries and grammar rules.
- Build CLI utilities for import, validation and export.
- Build the first desktop UI for browsing, editing and enriching data.

### Phase 3: Rule compiler and engine (vertical slice)
- Compile a small rule set into C++.
- Implement the enconverter and deconverter for one language pair.
- Translate a fixed set of test sentences end to end, with golden tests.

### Phase 4: Applications
- CLI translator, then desktop application, then embedded profile, then service/API.
- Each with its own test suite and performance benchmarks.

### Phase 5: Breadth and quality
- Additional languages, richer context/register/dialect handling.
- Performance tuning for small devices.
- Public project site, dashboards and write-ups.

## 10. Documentation set

The project should maintain at least the following documents:

- `verstaan.md` (this document): vision and initial specification.
- `docs/system-summary.md`: comprehensive system overview (house *system-summary-document-template*).
- `docs/specs/<segment>.md`: one functional specification per segment.
- `docs/architecture/`: architecture decision records (ADRs).
- `docs/data-model.md`: the canonical UNL data model.
- `docs/unl-reference/`: harvested and cleaned UNL reference material.
- `docs/write-ups/`: milestone write-ups and articles for the project site.
- `CLAUDE.md`: project instructions for coding agents.
- `CONTRIBUTING.md`, coding standards and naming conventions (referencing the global template library).

## 11. Project management

- **Work tracking:** Jira (or GitHub Projects) with one epic per segment, generated from the specifications.
- **Dashboards:** build status, test coverage, rule coverage per language, translation benchmark results.
- **Cadence:** milestone-based, tied to the phases above.
- **Project site:** a public-facing site with the vision, progress, write-ups and live dashboards. A separate management site for internal planning.

## 12. Open questions

These need answers from the project owner before the segment specifications are written.

1. **Reference projects for the coding factory.** Which existing projects should be studied for the coding-factory approach (prompts, skills, pipelines)?
2. **UNL Web archive access.** Web site address, paths to the archived content, and login details (to be stored securely, not in this document).
3. **Initial language pair.** Confirm Afrikaans ⇄ English as the first target, or specify another.
4. **Licensing.** Are the UNL dictionaries and rules from the archive free to reuse and redistribute? Under what licence will Verstaan itself be published?
5. **Target small device.** What is the smallest hardware profile the compact engine must run on (for example Raspberry Pi class, microcontroller class, mobile phone)?
6. **Desktop UI technology.** Preference among the candidates in section 7?
7. **Hosting.** Where will the project site, management site and service/API be hosted?

---

*Original notes preserved in `verstaan.original.md`.*
