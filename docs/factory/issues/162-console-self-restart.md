---
issue: 162
title: "The console can restart itself: a button for structural changes style hot-reload never picks up"
milestone: Side
status: open
depends_on: [100, 102]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: 4
commit: null
worktree: null
github_issue: null
---
## What

Vite's client dev build hot-reloads style and markup edits into the open tab on its own. A
change to `apps/console/server/src/` or to a dependency does not: the running Node process
still serves the old code until someone stops it and runs `console.sh` again by hand. The
developer, 2026-09-14: "i need a button or something in the battle console web to restart its
service if structural changes has been made that does not reflect by itself from style updates
etc."

Issue 100 ruled this out on purpose: "The console cannot stop itself: a page that kills the
server serving it leaves no way back from the page, and only `console.sh` in a terminal or the
SessionStart hook starts it again." This quest reopens that non-goal, on the developer's
explicit ask, and builds the one safe way to do it: the server rebuilds and relaunches itself
from a detached process before the old one exits, so a failed rebuild never leaves the page with
nothing behind it.

After this quest, the console has one Restart control. It rebuilds the server and client if
their source is newer than `dist`/`dist-server` (the same staleness check `console.sh` already
makes), relaunches on the same port from a process the current one does not depend on surviving,
and the page polls `/health` and reloads itself once the new instance answers.

## Acceptance criteria

- A `POST /api/restart` endpoint: spawns a detached process that runs the same build-if-stale-
  then-start logic as `console.sh` (extracted so both share it, not copied), responds `202`
  immediately, then this process exits after the response flushes. No job-runner allow-list
  entry; `service stop` naming the console stays refused exactly as issue 100 left it, this is a
  new, narrower endpoint, not a hole in that rule.
- A visible Restart control on the Console room, armed like a destructive action (issue 100's
  keyboard rule): first Enter or Space arms it, second fires it.
- Restart while a job is running for any tree is refused with the reason named, not queued: a
  killed job leaves no exit code.
- **Proven by breaking it and fixing it**: edit a file under `apps/console/server/src/`, hit
  Restart, and show the new code answering `/health` — page reloads on its own once it does.
- **Proven by a failed rebuild**: a syntax error in `server/src/` makes the spawned rebuild fail;
  the old process has not yet exited when the client learns this from the response, and the page
  reports it instead of showing a dead tab.
- `/gate` and CI green; verifier at checkpoint 4, specifically on the exit-after-old-process-
  confirmed-detached ordering — this is the one place the console can strand itself.

## Not in scope

Detecting staleness on its own and showing a banner without a click — the developer confirmed a
manual button is enough for now. That is a later quest if wanted. Restarting any service other
than the console itself: `service start`/`service stop` in the existing job-runner allow-list
already cover those. Remote access to this endpoint — loopback only, same as every other job.

## Done when

- [ ] `POST /api/restart` rebuilds only when stale, relaunches detached, and the old process
      exits only after the new one is spawned.
- [ ] The Restart control is on the Console room, keyboard-armed, refused while a job is running.
- [ ] Both proofs (structural change picked up; failed rebuild reported, not a dead tab) are in
      the report.
- [ ] PR merged through the gate check.
