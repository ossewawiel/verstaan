# Verstaan

*Verstaan* is Afrikaans for both "to understand" and "to comprehend". That double meaning is the
problem this project works on: translation is never only words, it is words in context.

Verstaan is a deterministic, rule-based machine translator built on the Universal Networking
Language (UNL). Sentences are analysed into a language-independent graph and generated back out in
the target language by that language's own rules. No network, no statistics, no large language model
in the translation path. The same input always gives the same output, fast enough to be immediate.

## Status

Early. The plan is settled and the factory that builds it is in place. See
`docs/factory/STATE.md` for exactly where things stand and `docs/factory/PLAN.md` for the whole plan.

## Layout

```
data/        dictionaries, grammars, corpora  (CC BY-SA 4.0)
engine/      the C++ translation engine       (MPL-2.0)
tools/       mirror crawler, rule compiler, validators
apps/        command-line and other front ends
docs/        plan, specification, decisions, standards
```

## Licences

- Engine and tools: Mozilla Public License 2.0, see `LICENSE`.
- Language data under `data/`: Creative Commons Attribution-ShareAlike 4.0, see `data/LICENSE`.
  Much of it derives from the UNL Archive (https://unlarchive.org), whose materials are CC BY-SA.
  Each item's origin is recorded in `data/archive/manifest.jsonl`.
- The name "Verstaan" is not covered by either licence. See `TRADEMARK.md`.

Contributions require a one-time signed contributor licence agreement, see `CLA.md`.
