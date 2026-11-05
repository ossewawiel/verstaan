# Data

Applies to `data/` and to anything that writes it.

## The two halves

- `data/archive/` is the mirror. Verbatim files plus `manifest.jsonl`. Written only by
  `tools/mirror`. Never hand-edited. Never reinterpreted.
- `data/languages/<iso3>/` is the canonical store. Written by `tools/importer` and by humans or
  agents adding rules. Layout in `SPEC.md` §3.3.

## Provenance

- Every store record carries `source`. A record without one fails validation.
- Every archive file carries a manifest line with `url`, `retrieved`, `sha256`, `licence`,
  `licence_url`. The CC BY-SA version is the one the page linked, not a default.
- Every store file starts with the licence header in `SPEC.md` §4.

## Format

- YAML, UTF-8, LF, two-space indent. Keys in the order `SPEC.md` §3.3 lists them.
- One record per list item. No flow-style mappings longer than one line.
- Feature names and values come from `tagset.yaml`. A new feature is added to the tagset first,
  with a comment saying which archive page defines it.
  - Exception: a bare tag the engine sets on a candidate, which no store record holds, stays out of the tagset. CAP is the one case. See ADR 0030.
- UWs are strings exactly as the archive writes them, including `(icl>...)` restrictions.
- Language codes: ISO 639-3 for folder names (`afr`, `eng`, `nld`), ISO 639-1 kept in `meta.yaml`.

## Rules

- A grammar rule without a test sentence is a warning. A test row whose `rules` entry names no
  rule is an error (SPEC.md §3.3, issue 187).
- A rule's `comment` says what it does in one line, in the writing voice. Not what it is.
- Never delete an archive-derived record to fix a bug. Mark it `deprecated: <reason>` and add the
  corrected one. The archive line stays traceable.
  - Exception: a grammar rule has no `deprecated` field. Edit it in place and set
    `archive_path: original`. See ADR 0020.
  - Exception: an owner's ruling may change a dictionary record's value, such as its `priority`.
    Edit the record in place. Set `archive_path: original` and write the ruling, its date and the
    old archive line in `line`. A re-import overwrites the edit and restores the archive value.
    A re-import must re-apply each `original` record, as ADR 0020 says of grammar rules. The
    `original` source is the list to apply.

## Credentials and privacy

- Archive login comes from `UNL_USER` and `UNL_PASS` in the environment. Never from a file in
  the repo, never on a command line the shell history keeps.
- The mirror keeps language data and documentation. It skips user profiles, statistics pages and
  anything that names a person other than as an author credit the archive itself shows.
