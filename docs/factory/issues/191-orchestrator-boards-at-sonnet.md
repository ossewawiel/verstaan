---
issue: 191
title: "The /factory-run session boards at Sonnet; the quest's loadout goes to its first pass"
milestone: Side
status: open
depends_on: [189]
agent: implementer
agents: [implementer, docs-writer]
model: sonnet
effort: medium
checkpoint: 4
commit: null
worktree: null
github_issue: 294
---
## What

The console boards a quest with `claude --model <issue.model> /factory-run N`
(`apps/console/server/src/jobs/kinds.ts:168-172`), and the SDK runner (`sdk-runner.ts`, issue
178) opens its session at the same model. Each subagent already takes its model from its own
file, or from the per-pass rule issue 189 writes. So the issue's `model:` only decides the
orchestrator: the session that reads status, runs gates, commits, mirrors and writes the hand-off.
None of that is design. Quest 180 runs four passes and three gate rounds, and every gate log
passes through an Opus context at twice the Sonnet price. The owner chose "Sonnet orchestrator"
(flight plan D2) on 2026-10-27.

After this quest, `quest-start` and `quest-run` open the session at `sonnet`. The quest's `model`
and `effort` travel into the `/factory-run` prompt as the first pass's loadout. The boarding pass
shows two lines, the orchestrator and the first pass. The docs-writer amends ADR 0016 with the
change and the reason. The checkpoint is 4, because the change alters a job kind's contract and
an ADR.

## Acceptance criteria

- `questStartArgv` and the SDK runner open the session at `sonnet` for every quest, whatever the
  quest's `model:`. A server test proves it for an `opus` quest.
- The `/factory-run` prompt carries the quest's `model` and `effort` for the first pass. A test
  reads them out of the composed prompt.
- The boarding pass renders "orchestrator sonnet" and "first pass <agent> <model> <effort>". A
  Playwright case under `apps/console/e2e/` checks both lines.
- `docs/adr/0016-console-runs-a-quest-as-an-agent-sdk-session.md` carries an amendment dated
  with this quest's merge, naming the D2 decision.
- `factory-run` "Routing" says the session model is Sonnet when the console boards it, and the
  quest loadout belongs to the first pass.
- The console server tests, `npm run test:e2e` and `python -m tools.validate --changed` exit 0.

## Not in scope

The orchestrator's model when the owner types `/factory-run` in a terminal session, which stays
the session's own choice. Per-pass overrides inside one quest file, which no quest needs yet.

## Done when

- [ ] Both boarding paths open the session at Sonnet.
- [ ] The quest's loadout reaches the first pass through the prompt.
- [ ] The boarding pass shows both lines, and an e2e case checks them.
- [ ] ADR 0016 carries the amendment.
- [ ] `factory-run` names the session model.
