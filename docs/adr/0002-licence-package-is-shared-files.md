# 0002 — The licence package is "Shared Files"

Date: 2026-09-08 · Status: Accepted

## Context

The owner wants the project open so that no one can claim it, and named "preventing misuse" as
the concern. The archive data is CC BY-SA. Three packages were weighed: Apache-2.0 with a CLA,
GPLv3 throughout with a DCO, and MPL-2.0 with a CLA.

## Decision

- Engine and tools: Mozilla Public License 2.0. Anyone who changes an engine file and ships it
  must publish that file. Linking the engine into a closed application stays legal.
- Data under `data/`: CC BY-SA 4.0, with each mirrored item's original version recorded. The
  UNLarium pages link BY-SA 2.5 CH; the archive's terms page says 4.0. The manifest records which.
- Contributors sign the Apache individual CLA once, recorded as a line in `CONTRIBUTORS.md`.
- The name is covered by `TRADEMARK.md`, because neither licence grants trademark rights
  (MPL-2.0 §2.3, CC BY-SA 4.0 §2(b)(2)).

## Consequences

- A device maker can ship the engine in closed firmware; engine improvements come back.
- The CLA keeps the right to move to GPLv3 later if closed forks become a problem.
- Apertium's GPL dictionaries cannot enter a CC BY-SA store. The whole-archive mirror (ADR 0004)
  makes that loss small.
- Sources: https://creativecommons.org/share-your-work/licensing-considerations/compatible-licenses/
  and https://www.mozilla.org/en-US/MPL/2.0/
