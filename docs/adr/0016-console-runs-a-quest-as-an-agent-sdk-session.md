# 0016 — The console runs a quest as an Agent SDK session; every checkpoint passes through `canUseTool`

Date: 2026-09-16 · Status: Accepted

## Context

A factory run stops at checkpoints and waits for the owner. Today that wait is a terminal prompt:
the owner types `claude --model <m> "/factory-run NN"`, and `AskUserQuestion` blocks in that
window. The console-as-CIC line wants the same run started from the console after a reboot, with
each checkpoint shown as a card. The interrogation (Q12, Q13, Q17) sized four launch shapes.

A boarding pass composes the line and copies it; the owner pastes. A terminal spawn opens a
terminal with the line in it, one argv template per platform, and then loses sight of the run. A
headless `claude -p` run streams into the Jobs room, but the headless docs do not define what
happens when the model asks a question, and a print session cannot hold an artifact watch; it
was struck. The Agent SDK is the documented shape: `query()` takes the prompt, model and effort;
a `canUseTool` callback receives every tool call, `AskUserQuestion` included, and returns the
answer as the tool result; `resume: sessionId` continues a run by id after the host restarts.

The owner, on how far to take it: "lets see how far we can stretch it." On billing: "same plan as
terminal." That statement is unverified.

## Decision

- The console server runs a quest as an Agent SDK session. A job kind `quest-run` calls `query()`
  from `@anthropic-ai/claude-agent-sdk` with the same line the boarding pass composes: prompt,
  model and effort from the issue's front matter.
- Every checkpoint passes through `canUseTool`. The callback stores the question on the job
  record, the Jobs room renders it as a card with a text box, and the callback resolves when the
  room posts an answer. No checkpoint is a blocking MCP tool; the main loop backgrounds those
  after two minutes and the model would continue without the answer.
- The session id is written to the job record. The restart gate exempts `quest-run` from the
  "no job may run across a restart" rule (`restart-gate.ts`, `restart.ts`), and the server resumes
  the session by id after a rebuild.
- Every action stays a row in `kinds.ts` behind the Host check. `quest-start` (the terminal
  spawn), `lesson-promote` and `quest-run` are table entries with their own `validateArgs`, the
  shape ADR 0011 fixed. The SDK call is a second spawn site beside `runner.ts`'s one, and it is
  the only one; no kind builds a shell string.
- The flight deck is staged. The boarding pass ships first, the terminal spawn second, the SDK
  session last, so every quest from the second one on launches from the console and the harness is
  the last thing built, not the first thing depended on.
- The first `quest-run` prints its cost line to the job log, so the billing claim is seen once and
  not only believed.

## Consequences

- The console becomes a cockpit. A broken console blocks a console-launched quest until the owner
  falls back to the terminal, which keeps working; the boarding pass is the fallback and it is
  never removed.
- An artifact published by the session wakes the same session on "Send to Claude", because an SDK
  main loop holds the artifact watch and a print session does not. The graphical decision scene,
  options on a claude.ai page and a comment back, needs nothing new from the console; the console
  links out and shows the answered state when the run reads it back.
- A quest job can run for an hour and holds a model session. That is a new shape for the job
  runner, which until now ran processes that end. Restart, kill and the SSE log all meet it for
  the first time in the harness quest.
- Three things send this back to the runner-up, the terminal spawn with no SDK session. A cost line
  that differs from the terminal's. The restart exemption leaving a session orphaned twice. The
  owner finding the terminal's checkpoint prompt faster than a card.
- The party gains no new member. The harness runs the same `/factory-run` the terminal runs, with
  the same agents.

## Alternatives rejected

- **Headless `claude -p` with checkpoints in the console.** No defined behaviour at a question;
  `--permission-prompts none` removes the ask tool outright. A print session holds no artifact
  watch, so the feedback loop dies with it. Struck on the docs.
- **A console MCP server with a blocking `await_orders` tool.** Documented, and the only shape a
  headless run could use. Rejected with the headless run: the main loop backgrounds a tool call
  after two minutes, so the checkpoint would not block.
- **Terminal spawn only, stop there.** The runner-up. It wins on any of the three signals above.
  It loses in-run visibility and the artifact-answer loop; it keeps everything else.

## Addendum (2026-09-19, issue 178) — `canUseTool` auto-approves every tool but `AskUserQuestion`

The harness (issue 178) sets no `permissionMode` and returns `{ behavior: 'allow' }` from
`canUseTool` for every tool call except `AskUserQuestion`. This decision was never made explicit
above; it fell out of the implementation and a checkpoint-4 review named it. Recording it now,
deliberately, rather than leaving it as an unstated default.

A terminal `/factory-run` stops at whatever this repo's own Claude settings do not already allow.
A console-launched `quest-run` does not stop at all, for any tool but the one this ADR already
names. This is broader than terminal parity, not equal to it: "the party gains no new member"
describes which agents run, not what they may do unprompted once running.

The owner's call: ship it this way. A quest that would misbehave from the terminal would misbehave
from the console too — the harness does not grant a quest any capability the terminal session
lacks, it only removes a human's chance to catch a bad tool call before it runs. Revisit if a
console-launched quest ever does something a terminal session's own settings would have stopped.
