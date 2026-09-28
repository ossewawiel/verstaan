---
issue: 185
title: "The fixture file records each row's review, and the owner confirms the fixed set"
milestone: M3
status: open
depends_on: [24]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: null
github_issue: null
---
## What

Issue 24 wrote the fixed sentence set twice: a markdown table in `24-test-cases.md` and a YAML
twin in `tests/fixtures/languages/eng/tests/basic.yaml`. The `review` column exists only in the
table. The YAML has no `review` key. Issues 183 and 26 both pass on "every row marked `review:
confirmed`", so a harness that reads the YAML finds no confirmed row and checks nothing. All
fifteen rows are still `pending`. `.claude/agents/rule-author.md` names the owner as the reviewer,
and nothing schedules that review.

The owner decided on 2026-09-28 to confirm the rows in this quest's pull request. After this
quest, every row in the YAML carries `review: pending` or `review: confirmed`. The owner has read
each row's `input` and `expected` and marked the ones they accept as `confirmed`, in both files.

## Acceptance criteria

- Every row in `tests/fixtures/languages/eng/tests/basic.yaml` has a `review` key, with the value
  `pending` or `confirmed`.
- `python -m tools.validate` refuses a fixture row with no `review` key or any other value.
- The `review` column in `24-test-cases.md` and the YAML agree row for row. A test proves it and
  fails when they disagree.
- The pull request description lists the fifteen rows with their input and expected text, so the
  owner can review them on one screen.
- The owner marks rows `confirmed` in a commit on this branch before the merge. A row the owner
  rejects keeps `pending`, with the reason in its `note`.

## Not in scope

Changing any `expected` value. A rejected row needs a rule-author pass, which is a new quest. The
golden loader, issue 26. The store's own `tests/` directory, issue 187.

## Done when

- [ ] Every fixture row carries `review`, and the validator refuses a missing or unknown value.
- [ ] A test fails when the table and the YAML disagree.
- [ ] The owner has confirmed or rejected each of the fifteen rows in this branch.
