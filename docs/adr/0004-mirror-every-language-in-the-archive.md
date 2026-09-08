# 0004 — Mirror every language in the archive

Date: 2026-09-08 · Status: Accepted

## Context

The UNL Archive is a volunteer's personal site. Logged-in reconnaissance on 2026-09-08 showed
Afrikaans has 8,959 base forms and 42 morphology rules, English has 209,178 base forms and a
working transformation grammar, Dutch has 4,595 base forms and no grammar. French, Spanish,
Russian, Arabic and German each carry tens of thousands of base forms and a grammar. The public
dictionary export endpoint is broken; the logged-in UNLarium exports work.

## Decision

Phase 1 mirrors the whole archive: every language's dictionary, grammar, tagset and corpus
exports, the static grammar files, the wiki, the public pages, and the owner's own uploads. Each
file lands verbatim with a manifest line. The mirror never rewrites content. A second output,
`docs/unl-reference/`, is an agent-readable rewrite of the specs and grammar documentation, with
the originals kept beside it.

## Consequences

- The project does not depend on the archive staying up.
- The well-resourced languages are the reference set for drafting Afrikaans and Dutch rules.
- Credentials come from the environment only. The mirror refuses to run with them on the
  command line or in a file under the repo.
