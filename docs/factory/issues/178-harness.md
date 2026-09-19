---
issue: 178
title: "The harness: quest-run holds an Agent SDK session, checkpoints as Jobs cards, resumed across a restart"
milestone: M7
status: done
depends_on: [174, 177]
agent: implementer
agents: [implementer]
model: sonnet
effort: high
checkpoint: 4
commit: f04519c
worktree: null
github_issue: 263
---
## What

ADR 0016 stages the launch of a quest in three steps: the boarding pass (quest 174, L1), the
terminal spawn (quest 174, L2), and the Agent SDK session, struck last on purpose so every quest
from the second stage onward already launches from the console before this one exists. Today a
checkpoint is a terminal prompt: `AskUserQuestion` blocks in the window the owner typed
`/factory-run NN` into. The console has no way to hold that session, show its questions as cards,
or survive the server's own restart while a session is mid-run.

After this quest a `quest-run` job kind calls `query()` from `@anthropic-ai/claude-agent-sdk`
with the same line the boarding pass composes: prompt, model and effort from the quest's front
matter. A `canUseTool` callback intercepts every tool call; when the tool is `AskUserQuestion` it
writes the question onto the job record instead of blocking silently, the Jobs room renders it as
a card with a text box, and the callback resolves only once the room posts an answer back to that
job. The session id is written to the job record so a rebuilt server can find it again. The
restart gate (`restart-gate.ts`, `restart.ts`) exempts `quest-run` from the "no job may run
across a restart" rule and resumes the session by id (`resume: sessionId`) once the server comes
back. The first `quest-run` of this quest's own testing prints its cost line to the job log, so
the owner's "same plan as terminal" claim (unverified, per the handoff) is seen once, not only
believed. `quest-run` is a table row in `kinds.ts` behind the Host check, like every other action
(ADR 0011); it is the second spawn site in the codebase beside `runner.ts`, and the only one that
opens a model session rather than a process that ends.

## Acceptance criteria

- `kinds.ts` gains a `quest-run` entry with `validateArgs` checking the quest number resolves to
  an open issue file with a `model` and `effort` in front matter.
- `apps/console/server` imports `query()` from `@anthropic-ai/claude-agent-sdk` and starts a
  session with the same prompt/model/effort the boarding pass composes.
- `canUseTool` is implemented: every tool call passes through it; `AskUserQuestion` calls write a
  question object to the job record and block on a promise the Jobs-room answer endpoint
  resolves; no other tool call is altered.
- The Jobs room renders an open question as a card with a text box; submitting it posts to the
  job and resolves the held promise; a test simulates a question and answer end to end against a
  stubbed SDK.
- The job record carries `sessionId`; `restart-gate.ts` exempts jobs of kind `quest-run` from its
  "no job across a restart" check; on server start, any `quest-run` job with a `sessionId` and no
  terminal status resumes via `query({ resume: sessionId, ... })`.
- The job log for the first real `quest-run` in this quest's own test/verification run contains
  the SDK's cost line, visible in the log output, not swallowed.
- A test posts an unrecognised `kind` and gets 400 (regression check alongside quest 174's).
- `/gate` and CI green.

## Not in scope

Any new party member; the harness runs the same `/factory-run` and the same agents the terminal
runs (ADR 0016's "the party gains no new member"). A console MCP server or any blocking MCP tool
for checkpoints — struck by ADR 0016 on the two-minute background timeout. Redesigning the Jobs
room beyond the question card.

## Done when

- [x] `quest-run` job kind calls `query()` with prompt, model and effort from the quest's front
      matter.
- [x] `canUseTool` intercepts `AskUserQuestion` into a Jobs-room card with a text box.
- [x] The job record carries the session id.
- [x] The restart gate exempts `quest-run` and resumes the session by id after a rebuild.
- [x] The first run's cost line appears in the job log (proven against a stubbed SDK; the first
      real `quest-run` against the live SDK is a manual owner verification step, see hand-off).
- [ ] `/gate` and CI green.

Source: `docs/decisions/2026-09-16-console-as-cic/handoff.md`, quest table row 6; ADR 0016.
