---
description: The full local gate before a pull request or merge — format check, all tier builds, all tests, clang-tidy, equivalence, data validation, tooling tests — run for real, not assumed.
---

Run every step. Do not skip a step because "it passed last time". Do not pipe any gate into
`head`, `tail` or `grep` and then read the exit code; a pipeline's exit code is the last
command's.

Step 0, stubs. `grep -rn 'not_implemented\|NotImplementedError' engine/src tools/ --include=*.cpp --include=*.py`
must return nothing outside `tests/`. A hit means an issue was closed on a stub.

Step 1, format. `clang-format --dry-run --Werror $(git ls-files 'engine/**/*.cpp' 'engine/**/*.hpp' 'apps/**/*.cpp' 'apps/**/*.hpp')`
and `ruff format --check tools/` and `ruff check tools/`.

Step 2, build every preset that exists in `CMakePresets.json`:
`cmake --preset <p> && cmake --build --preset <p>` for each. The `arm-basic` preset is required
from M4; before that it may be absent, and you say so.

Step 3, tests. `ctest --preset <p> --output-on-failure` for each built preset. Then
`python -m pytest tools/`. Then `python -m tools.validate --all`.

Step 4, tidy. `clang-tidy -p build/<clang preset> $(git ls-files 'engine/**/*.cpp')`. Warnings are errors.

Step 5, equivalence and tiers (M4 onward). `ctest --preset clang-release -L equivalence` and
`ctest --preset clang-release -L tier`.

Step 6, regenerate. `python -m tools.compiler --all-tiers && git diff --exit-code engine/generated/`.
A diff means someone edited generated code by hand or the compiler changed without regenerating.

Only if every step passed, and `git status --porcelain` is empty:
`git rev-parse HEAD > "$(git rev-parse --git-dir)/verstaan-gate-stamp"`

A failed gate leaves no stamp, which is what keeps the merge shut. Report each step's command,
exit code and time. Then hand over as `docs/factory/git-workflow.md` "Finishing a milestone" says.
