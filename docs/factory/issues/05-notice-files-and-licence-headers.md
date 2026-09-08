---
issue: 5
title: "NOTICE files, licence headers and a header check"
milestone: M0
status: open
depends_on: [2, 3]
agent: implementer
agents: [implementer]
model: sonnet
effort: low
checkpoint: null
commit: null
---
## What

Make the licence boundary of ADR 0002 and ADR 0003 visible in files. Every C++ and Python
source gets an SPDX header; every store file gets the data header from `SPEC.md` §4; each app
gets a `NOTICE` naming both licences; a check in `tools.validate` and in `/gate` refuses files
without one.

## Acceptance criteria

- `// SPDX-License-Identifier: MPL-2.0` on every `.cpp/.hpp` under `engine/` and `apps/`;
  `# SPDX-License-Identifier: MPL-2.0` on every `.py` under `tools/`.
- Generated files under `engine/generated/` carry the CC BY-SA header from `SPEC.md` §3.5.
- `apps/cli/NOTICE` names MPL-2.0 for the engine, CC BY-SA 4.0 for the data, and the UNL Archive.
- `python -m tools.validate --licences` fails on a file without a header. **Prove it fails.**

## Not in scope

The CLA check on pull requests (Post-M6).

## Done when

- [ ] Header check is green on the repo and its failing run is in the report.
- [ ] `/gate` step 1 calls the licence check.
