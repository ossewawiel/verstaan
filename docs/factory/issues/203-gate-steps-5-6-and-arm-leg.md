---
issue: 203
title: "Gate steps 5 and 6 run for real, and CI gains an ARM leg"
milestone: M4
status: open
depends_on: [31, 32]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: 4
commit: null
worktree: null
github_issue: 329
---
## What

Only step 6 echoes. `.github/workflows/gate.yml` line 247 prints `tools.compiler --all-tiers does
not exist yet (M4) -- skipping`. Step 5 in `gate.yml` is a comment over a run with no label, and
`tools/factory/hooks/gate_full.sh:95-101` already runs it. On Linux, step 5's `clang-release`
preset means `linux-clang`, and today only a local note says so. The gate must say so itself.

After this quest, the job is step 6, the ARM leg, and a real `-L equivalence` and `-L tier` line in
`gate.yml`, `.claude/commands/gate.md` and `gate_full.sh`. CI gains an ARM leg for `arm-basic`.
Quest 27's ADR defines a `data` job that compiles the real stores only on a branch that changes
data or the compiler. A pull request compiles the xxa/xxb pair. Each step is proved red: a hand
edit under `engine/generated/` fails step 6, and a changed table fails step 5.

## Acceptance criteria

- `gate.yml` has no step 6 skip, and runs `ctest -L equivalence` and `ctest -L tier` as real lines.
- Step 6 in `gate.yml` runs `python -m tools.compiler --changed --base <pull request base SHA>`, then fails
  when `git status --porcelain engine/generated/ tests/golden/` prints anything.
- The `data` job runs on the paths in `tiers.toml`'s `compile_when_changed`. It compiles the real stores,
  builds `phone` and `connected`, runs the label `data`, and passes when skipped.
- The rows of `27-test-cases.md` with quest 203 are turned into tests, and it fails if the `phone` case
  is not registered (row T79). Paste the failure.
- `gate.md` and `gate_full.sh` carry no skip for steps 5 or 6.
- The gate names `linux-clang` for step 5 on Linux in its own text.
- Red proof for step 6: a hand edit under `engine/generated/` fails. Paste the failure.
- Red proof for step 5: a changed table fails. Paste the failure.
- The hand-off names what `gate.yml` runs on a docs-only branch.
- The hand-off names what `gate.yml` runs on a branch that changes `data/` or `tools/compiler/`.
- `ctest --preset linux-gcc -L fast` passes.
- `python -m tools.validate --changed` exits 0.

## Not in scope

The include-boundary lint and coverage floor: quest 206. Running on a Pi: quest 205.

## Done when

- [ ] `grep -n "does not exist yet (M4)" .github/workflows/gate.yml` finds nothing.
- [ ] `gate.yml` contains `-L equivalence` and `-L tier` lines that run.
- [ ] Each red proof is pasted.
- [ ] `grep -n 'status --porcelain engine/generated/' .github/workflows/gate.yml` finds the step 6 check.
- [ ] CI has an ARM leg for `arm-basic`.
- [ ] The docs-branch and data-branch runs are named in the hand-off, each from a real run.
- [ ] `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
