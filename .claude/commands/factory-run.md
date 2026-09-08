---
description: Regenerate STATE.md, pick up the next open issue (or the one given), route it to the right agents and gates, and stop at checkpoints.
argument-hint: [issue-number]
---

Run the `factory-run` skill. Issue: `$ARGUMENTS` (empty means the next open one).

Guard rails, in order:
- `git status --porcelain` must be empty. If not, stop and show it.
- Never work on `main`. Cut or check out the milestone branch named in `docs/factory/PLAN.md` §7.
- One issue, one work commit, one `chore(#NN): close` commit. Then stop and print the next command.
