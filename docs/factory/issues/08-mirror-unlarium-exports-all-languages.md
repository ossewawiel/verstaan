---
issue: 8
title: "Mirror the logged-in UNLarium exports for every language"
milestone: M1
status: open
depends_on: [7]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
---
## What

With `UNL_USER` and `UNL_PASS` from the environment, `tools.mirror --login` signs in at
`/user/index.php?page=login`, reads the language list at `/user/index.php?unlweb=language`, and
for each language with a non-zero dictionary or grammar count fetches the dictionary export, the
four grammar exports (`type=M|Y`, `direction=G` or analysis), the tagset, and the corpus exports,
via the UNLarium `index.php?unlarium=dictionary&lang=<code>` and `?grammar=export` pages. It also
fetches the owner's Files page uploads. Exit 3 with one line if the credentials are missing.

## Acceptance criteria

- The language table is saved as `data/archive/languages.json` with `iso1, iso3, name, users,
  base_forms, word_forms, paradigms, frames, dict_level, grammar_level` for all rows.
- For each language: `data/archive/exports/<iso3>/` holds every export that returned content.
  An export that says "No grammar available" is recorded in the manifest with `status: empty`.
- The session cookie is never written to disk. Shown by grep of the repo after a run.
- Credentials on the command line are refused (issue 03's rule) and the test still passes.
- Rate limit and idempotence as issue 07.
- A summary table in the report: languages seen, exports fetched, empties, errors, total bytes.

## Not in scope

Parsing. The statistics, profile, assignments and problems pages. Anything naming a user other
than the archive's own author credits inside export files.

## Done when

- [ ] Afrikaans, English and Dutch exports are present and non-empty where the language table
      says they should be.
- [ ] The count of languages with a non-empty dictionary export matches the table's non-zero
      base-form rows, or every difference is explained in the report.
