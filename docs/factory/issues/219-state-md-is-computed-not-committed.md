---
issue: 219
title: "STATE.md goes: the status script is the only rendering, and a merge leaves main level with origin"
milestone: Side
status: open
depends_on: [216]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: 4
commit: null
worktree: null
github_issue: 358
---
## What

`docs/factory/STATE.md` is committed, and `python -m tools.factory.status` already computes all
four of its fields. The merge path in `factory-run` and `docs/factory/git-workflow.md` commits the
refresh to local `main` after every merge. `main` takes no direct push, so that commit stays
behind, one ahead of `origin/main`, until a later pull request carries it. After issue 28,
`a6d4d2e` sat there alone. Pull request #357 landed it, with a 184 s gate and a full CI run for
three changed lines. That merge moved `main` again, so the file named `703c603` while `main` was
at `4c49666`. The next refresh would leave local `main` ahead once more.

After this quest, no `STATE.md` exists. The owner chose on 2026-11-04 to remove the file and not
keep it gitignored. The script is the only rendering, and its `--write` flag goes. A merge makes
no commit on `main`, so local `main` is level with `origin/main` once `git pull --ff-only` runs.
The clause in ADR 0012 that commits the file only on `main` is replaced by a new ADR, so the
checkpoint is 4. This quest waits on 216, because every reader then relies on the script's
`Next up`, and 216 stops that field being blank.

## Acceptance criteria

- `git ls-files docs/factory/STATE.md` prints nothing.
- `python -m tools.factory.status --write` exits non-zero, because the flag no longer exists.
- `python -m tools.factory.status` prints the four fields, and `tools/factory/tests/test_status.py`
  proves the run writes no file.
- `git grep -n 'STATE\.md' -- . ':(exclude)data' ':(exclude)docs/factory/issues' ':(exclude)docs/adr' ':(exclude)docs/decisions' ':(exclude)docs/factory/lessons.jsonl' ':(exclude)docs/factory/map.yaml' ':(exclude).github/cliff.toml'`
  prints nothing.
- `factory-run` step 10's "Gate, PR, merge" row and `docs/factory/git-workflow.md` "Pull requests"
  make no commit on `main` after a merge. They still pull, and they still remove the tree.
- `/factory-status` and step 1 of the `quest` skill take status from the script, not from a file.
- `CLAUDE.md`, `README.md`, `verstaan.md` and the glossary's "Save point" name the command.
- `capture_failure.sh` reads no status file. A tree with no number in its branch logs `none`, and
  `tools/factory/tests/test_capture_failure.py` proves it.
- Neither console's "Start here" list names the file: `LIBRARY` in `tools/console/src/read.mjs`
  and its copy in `apps/console/server/src/model/read.ts`.
- A new ADR records the decision, and ADR 0012 names it beside the clause it replaces.
- `node tools/console/test/run.mjs` and `npm test` in `apps/console/` pass.
- `ctest --preset linux-gcc -L fast` passes.
- `python -m tools.validate --changed` exits 0.

## Not in scope

The `Next up` and `Last completed` rules: quest 216. The in-progress lookup in
`capture_failure.sh`: quest 214. A status page for a reader on GitHub. Closed issue files and old
ADRs, which stay as written. The `chore: refresh STATE.md` skip in `.github/cliff.toml`, which
still has to match old commits.

## Done when

- [ ] `docs/factory/STATE.md` is removed, and the script's `--write` flag and its test are gone.
- [ ] A pytest proves a status run writes no file.
- [ ] The merge path makes no commit on `main`, in `factory-run` and `git-workflow.md`.
- [ ] `/factory-status`, the `quest` skill and every doc named above use the command.
- [ ] `capture_failure.sh` reads no status file, with a pytest.
- [ ] Both console "Start here" lists drop the file.
- [ ] The new ADR exists, and ADR 0012 points to it.
- [ ] The `git grep` above prints nothing.
- [ ] The console tests, `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
