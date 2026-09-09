---
description: The full local gate before a pull request or merge — format check, all tier builds, all tests, clang-tidy, equivalence, data validation, tooling tests — run for real, not assumed.
---

Run every step. Do not skip a step because "it passed last time". Do not pipe any gate into
`head`, `tail` or `grep` and then read the exit code; a pipeline's exit code is the last
command's.

Step 0, stubs. `grep -rn 'not_implemented\|NotImplementedError' engine/src engine/include tools/ --include=*.cpp --include=*.hpp --include=*.py | grep -v '/tests/' | grep -v 'engine/include/verstaan/engine.hpp'`
must return nothing. A hit means an issue was closed on a stub. `engine.hpp` is excluded on
purpose: it declares `Status::not_implemented` as a permanent enum member, the M0 stub value every
real `Engine::translate` call retires (`SPEC.md` §3.4) — not an unfinished stub to flag.

Step 1, format, licences and secrets. `clang-format --dry-run --Werror $(git ls-files 'engine/**/*.cpp' 'engine/**/*.hpp' 'apps/**/*.cpp' 'apps/**/*.hpp')`
and `ruff format --check tools/` and `ruff check tools/`. Then `python -m tools.validate --licences`
must exit 0; a nonzero exit names the file missing its SPDX or CC BY-SA header, or a broken
`apps/cli/NOTICE` (issue 5). Then
`git grep -nIE '\bghp_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b' -- .`
must find nothing; a hit means a live-shaped GitHub token was committed (issue 91). No path is
excluded. The pattern requires the token-length suffix, not just the prefix, so this file and the
issue files that mention the prefixes in prose never trip it. Then
`git grep -nIE '^[[:space:]]*(export[[:space:]]+)?UNL_PASS[[:space:]]*[:=][[:space:]]*["'"'"']?[^[:space:]$"'"'"'][^[:space:]]{3,}' -- . ':(exclude)**/tests/**'`
must find nothing; a hit means an actual `UNL_PASS` value was assigned in a committed file, not
just the bare env var name. The assignment must start the line (bare or after `export`), which is
what keeps prose out: this file, the issue files and the workflow comments all mention
`UNL_PASS=` mid-sentence and none of them trip it. A value beginning with `$` is skipped too, so
`UNL_PASS=${UNL_PASS}` and `UNL_PASS: ${{ secrets.UNL_PASS }}` read as references, not leaks.
`tests/` is excluded because `tools/mirror/tests/test_cli.py` legitimately constructs
`UNL_PASS=hunter2` to prove the CLI refuses it as an argument (issue 5's credential-refusal test);
a real leak of the same shape would still be caught outside `tests/`. The known gap is an
assignment buried mid-line inside a longer command; catching that would flag every file that
documents this check.

Step 2, build every preset that exists in `CMakePresets.json`:
`cmake --preset <p> && cmake --build --preset <p>` for each. The `arm-basic` preset is required
from M4; before that it may be absent, and you say so.

Step 3, tests. `ctest --preset <p> --output-on-failure` for each built preset. Then
`python -m pytest tools/`. Then `node tools/console/test/run.mjs` (the console's parsers,
renderer and service). Then `python -m tools.validate --all`.

Step 4, tidy. `clang-tidy -p build/<clang preset> $(git ls-files 'engine/**/*.cpp')`. Warnings are errors.

Step 5, equivalence and tiers (M4 onward). `ctest --preset clang-release -L equivalence` and
`ctest --preset clang-release -L tier`.

Step 6, regenerate. `python -m tools.compiler --all-tiers && git diff --exit-code engine/generated/`.
A diff means someone edited generated code by hand or the compiler changed without regenerating.

Only if every step passed, and `git status --porcelain` is empty:
`d="$(git rev-parse --path-format=absolute --git-common-dir)/verstaan-gate-stamps" && mkdir -p "$d" && touch "$d/$(git rev-parse HEAD)"`
The stamp names the commit, not the tree, so a branch gated in its worktree can be merged from
the root. `tools/factory/hooks/require_gate.sh` is what reads it.

A failed gate leaves no stamp, which is what keeps the merge shut. Report each step's command,
exit code and time. Then hand over as `docs/factory/git-workflow.md` "Finishing a milestone" says.
