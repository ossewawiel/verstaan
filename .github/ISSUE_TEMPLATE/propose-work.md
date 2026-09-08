---
name: Propose new work
about: The issue files are the source of truth here, not GitHub issues.
title: ""
labels: []
---

Verstaan does not take new work as GitHub issues. The issue files under `docs/factory/issues/`
are the backlog and the source of truth; GitHub's issue list is a rendering of them, kept in
step by `tools/factory/mirror_github.py`. Opening a GitHub issue directly would not be seen by
the factory and would drift from the files the next time the mirror runs.

To propose something:

1. Read `docs/factory/playbook.md` for how an issue file is shaped and how an encounter runs.
2. Write `docs/factory/issues/NN-a-short-slug.md` following the schema in `docs/factory/SPEC.md` §6.
3. Open a pull request that adds only that file.

The maintainer reviews the file the same way any other issue is reviewed, and the mirror creates
its GitHub issue once it is accepted. Bug reports about the engine or the data are welcome the
same way: describe the failing input and the expected output as a `## What` and `## Acceptance
criteria` in a new issue file, not as free text here.

If you are proposing a contribution rather than a bug report, read `CLA.md` first.
