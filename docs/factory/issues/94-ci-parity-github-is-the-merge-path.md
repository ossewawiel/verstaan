---
issue: 94
title: "CI parity with /gate, then GitHub becomes the only merge path"
milestone: Side
status: open
depends_on: [6, 93]
agent: implementer
agents: [implementer, docs-writer]
model: sonnet
effort: medium
checkpoint: 4
commit: null
worktree: null
github_issue: null
---
## What

Today there are two ways to land a branch: `git merge --no-ff` from the root tree behind the
local stamp, and a pull request behind the `gate` Actions check. The verifier at issue 06's
checkpoint listed the gaps between the two: `gate.yml` skips `tools.validate --licences`, every
ctest label except `fast`, `clang-tidy`, and the regenerate step; `changelog.yml` opens its PR
with `GITHUB_TOKEN`, which never triggers `gate`, so branch protection cannot be satisfied on that
PR. Close those gaps, then make the pull request the one merge path and let the local stamp be a
pre-check: `require_gate.sh` refuses `git merge` into `main` outright.

## Acceptance criteria

- `.github/workflows/gate.yml` runs every step `.claude/commands/gate.md` runs, on the same
  presets the runner can build. Any step it cannot run on a hosted runner says so in a comment
  with the reason, not by omission.
- `changelog.yml` authenticates with a token that triggers `gate` on the PR it opens, or the
  changelog lands another way that does not need a PR.
- `gh` is a documented prerequisite (`docs/factory/README.md`), with the one-line install.
- `tools/factory/hooks/require_gate.sh`: `git merge <ref>` while on `main` is refused with a
  message naming `gh pr merge`; the test for it fails first.
- `docs/factory/git-workflow.md` "Pull requests" is the only merge procedure; "Finishing a
  milestone" points at it.
- The rest of the verifier's list from issue 06 is either fixed here or has its own issue:
  `/gate` step 0 scanning `engine/include` as well as `engine/src`; `overview.md` and
  `CMakePresets.json` both claiming this machine has no g++; `engine/CLAUDE.md` naming a
  `tables.hpp` that does not exist; the secret grep never looking for `UNL_PASS`; issue 90's
  `commit:` naming a `chore(#02)` commit; `SPEC.md` §3.4 listing three `Status` values against
  the header's four.

## Not in scope

Removing the local stamp. It stays as the fast pre-check that stops a PR opening on a red tree.

## Done when

- [ ] A PR with a deliberately failing tidy warning shows `gate` red.
- [ ] `git merge --no-ff <branch>` from the root tree exits 2 with the `gh pr merge` message.
- [ ] One milestone branch has landed through `gh pr merge` and nothing else.
