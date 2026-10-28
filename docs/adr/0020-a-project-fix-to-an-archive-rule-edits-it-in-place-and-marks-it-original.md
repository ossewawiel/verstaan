# 0020 — A project fix to an archive-derived rule edits it in place and marks it `original`

Date: 2026-10-28 · Status: Accepted (owner decision, 2026-10-28)

## Context

`docs/standards/data.md` says: never delete an archive-derived record to fix a bug; mark it
`deprecated: <reason>` and add the corrected one. For grammar rules this cannot be done.

- The rule schema has `additionalProperties: false`. It has no `deprecated` field.
- The C++ reader expects exactly seven lines per record. It has no slot for one either.
- A deprecated rule left in the grammar still runs. Scene: issue 180 parses `both books`. The
  dictionary gives `book` the feature `@both`. Rule 1, lhs `(N,PLR,^@pl,^@multal,^@paucal,^@all)`,
  adds `@pl`, because it has no `^@both` guard. Rule 177, lhs `(@pl,{@multal|@paucal|@all|@both})`,
  removes `@pl` again. Each firing re-enables the other. The pair alternates until both reach
  `kTreePassRuleCap` (1024, ADR 0017), and each logs a `capped` entry. The fix adds `^@both` to rule
  1, so it never matches a `@both` noun. A kept copy of the old rule 1 would keep the loop alive.

## Decision

A project fix to an archive-derived grammar rule **edits the record in place**. The record's source
moves to `archive_path: original`. Its `line` note cites the archive line it adapts.

First case: `eng-ana-1` gains `^@both` (issue 180). Issue 195 used the same marking for its D-rules.

## Consequences

- The archive line stays traceable through the `line` note. The archive text stays in `data/archive/`.
- `archive_path: original` marks every record the project has changed. A search for it lists them.
- A full re-import of the eng grammar restores the archive text and drops the fix. A re-import must
  re-apply each `original` record. The `original` source is the list to apply.
- `docs/standards/data.md` keeps its rule for dictionary entries and other records. Grammar rules are
  the exception.
