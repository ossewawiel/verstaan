# 0005 — We write our own tools from the specs, not from archived source

Date: 2026-09-08 · Status: Accepted

## Context

The archive's software page names EnCo, DeCo, IAN, EUGENE and a dictionary builder and says
their source is on GitHub. The link is inside an HTML comment, no GitHub organisation exists, and
no page behind the login links source. The owner has decided not to wait.

## Decision

The importer, compiler and engine are written from the UNL specifications (UNL2010 and the
earlier versions on the wiki), the grammar and dictionary specification pages, and the real
exported files. If the archived source turns up later it may be read for behaviour, but its
licence is unknown and none of it is linked or copied.

## Consequences

- The rule formats we support are the ones the exports actually use. The importer is written
  against the files, then checked against the wiki's grammar.
- Behaviour that the specs leave ambiguous is decided by the owner, recorded as an ADR, and
  pinned by a test sentence.
- An e-mail to admin@unlarchive.org asking for the source is worthwhile but on nobody's path.
