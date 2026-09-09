# tools/

Python 3.13 packages that build the data and the generated code. MPL-2.0. Not on the translation path.

- One package per tool: `mirror`, `importer`, `compiler`, `validate`. Run as `python -m tools.<name>`.
- Each has `tests/` with pytest. `ruff` formats and lints; the hook runs it on save.
- Contracts: `docs/factory/SPEC.md` §3.1, §3.2, §3.5. Data rules: `docs/standards/data.md`.
- Credentials from `UNL_USER` and `UNL_PASS` in the environment only. Refuse them on the command line.
- `mirror` writes only under `data/archive/` and never rewrites content. `importer` writes only
  under `data/languages/`. `compiler` writes only under `engine/generated/` and `tests/golden/`.
- `factory/` and `console/` are factory infrastructure (GitHub issue mirror, status console), not
  pipeline packages. Neither reads or writes `data/`.
