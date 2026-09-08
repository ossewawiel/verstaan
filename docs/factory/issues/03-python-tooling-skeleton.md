---
issue: 3
title: "Python tooling skeleton: mirror, importer, compiler, validate packages"
milestone: M0
status: open
depends_on: [1]
agent: implementer
agents: [implementer]
model: sonnet
effort: low
checkpoint: null
commit: null
github_issue: 3
---
## What

Four Python packages under `tools/`, each runnable as `python -m tools.<name>`, each with a
`tests/` folder and one passing pytest, sharing one `pyproject.toml` at `tools/` with `ruff`
configured. No behaviour yet beyond `--help` and `--version`.

## Acceptance criteria

- `python -m tools.mirror --help`, `tools.importer`, `tools.compiler`, `tools.validate` all print
  usage and exit 0.
- `tools.validate --changed` and `--all` exist and exit 0 on an empty `data/languages/`.
- `tools.mirror` refuses to start if `UNL_USER` or `UNL_PASS` is passed as an argument, and reads
  them from the environment only. A test proves the refusal.
- `ruff check tools/` and `ruff format --check tools/` are clean.
- `pytest tools/` runs four tests, all green.

## Not in scope

Any network call. Any parsing.

## Done when

- [ ] All five criteria shown in the report with commands and exit codes.
- [ ] `gate-fast.sh` runs pytest for a changed tool, shown once.
