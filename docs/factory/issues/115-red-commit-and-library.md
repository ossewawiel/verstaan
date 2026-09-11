---
issue: 115
title: "The red suite is its own commit, the coverage figure goes, and the decision brief joins the library"
milestone: Side
status: open
depends_on: [93, 114]
agent: implementer
agents: [implementer, verifier]
model: sonnet
effort: medium
checkpoint: 4
commit: null
worktree: null
github_issue: null
---
## What

An engine issue runs three passes: the rule-author writes the sentence table, the test-writer
lands failing tests, the implementer makes them pass. Then `/factory-run` step 3 makes one work
commit from the whole tree (`.claude/skills/factory-run/SKILL.md`, "After the agent hands off").
Tests and implementation land in the same commit, so git holds no red state. The verifier's
check 2 says "did each closed issue's tests exist before its implementation commit? `git log
--follow` on the test files. A test born green is a finding" (`.claude/agents/verifier.md`), and
that command cannot answer the question it asks. The proof that the suite could fail lives only
in the test-writer's hand-off report. `docs/standards/testing.md:33` names 80 % line coverage
for `verstaan_core`, "measured in `/gate`"; neither `.claude/commands/gate.md` nor
`.github/workflows/gate.yml` has a coverage step. The decision brief that found both gaps,
`docs/decisions/2026-09-11-agentic-testing-cycle/brief.html`, sits on disk and the console's
Library room does not list it. The owner, 2026-09-11: "Ok, I will go with the recommended
option. this artifact needs to become part of the console library as well."

After this quest the test-writer's red suite is a commit of its own, `test(#NN): <title>`, made
before the implementer starts, so an engine issue's history reads `test`, `feat`, `close`. The
verifier reads git for check 2 instead of a report. The coverage line is gone from the testing
standard; coverage as a regression signal returns with a later sensors quest once M3 has engine
code and a verified toolchain path. The brief is in the Library beside the interrogation brief.
`CLAUDE.md`'s non-negotiable keeps its meaning, one issue's work in one commit, and gains the
red commit as the one exception, stated in the same line.

## Acceptance criteria

- `.claude/skills/factory-run/SKILL.md` "Routing" and "After the agent hands off" say that when
  the sequence includes the test-writer, its hand-off ends with `git add -A && git commit -m
  "test(#NN): <title>"` in the worktree, before the implementer is started, and that the work
  commit that follows carries the implementation only.
- `.claude/agents/test-writer.md` "Report" names the commit hash and the exact ctest or pytest
  command that shows the suite red at that commit.
- `.claude/agents/verifier.md` check 2 reads: for each closed engine issue, `git log
  --format=%s -- tests/` shows a `test(#NN)` commit before the `feat(#NN)` commit, and the
  suite is red at the `test` commit. A `feat` commit that adds or edits a test file is a finding.
- `docs/factory/git-workflow.md` "Commits" and `CLAUDE.md` "Non-negotiables" state the shape:
  one work commit per issue, preceded by one `test(#NN)` commit when a test-writer pass ran.
- `docs/standards/testing.md` no longer names a coverage figure. `git grep -n "80 %"
  docs/standards/testing.md` returns nothing.
- `tools/console/src/read.mjs` `readArtefacts()` and `apps/console/server/src/model/read.ts`
  `readArtefacts()` list `docs/decisions/2026-09-11-agentic-testing-cycle/brief.html` with the
  title "Decision brief: testing cycle" and a one-line blurb. The Library room shows it and
  opens it. The file console's Library page shows it after `node tools/console/src/generate.mjs`.
- `docs/factory/playbook.md` "An encounter, start to finish" step 6 describes the `test` commit
  in one sentence.
- `python -m tools.validate --all` exits 0. `/gate` and CI green.

## Not in scope

The golden loader and the held-out corpus: quest 26. Coverage or mutation as gate steps: a
later sensors quest, after M3 has engine code. Any change to the fast gate's legs. Any change
to the tooling-only sequence, where no test-writer runs and one work commit stays the whole
story.

## Done when

- [ ] The skill, both agent files, `git-workflow.md`, `CLAUDE.md` and the playbook agree on the
      `test` then `feat` shape, and the verifier's check 2 names a command that can fail.
- [ ] The coverage figure is gone from `testing.md`.
- [ ] Both `readArtefacts()` lists carry the brief and the Library room opens it.
- [ ] PR merged through the gate check.
