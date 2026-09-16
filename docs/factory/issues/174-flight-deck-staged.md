---
issue: 174
title: "The flight deck, staged: the boarding pass first, the terminal spawn second"
milestone: M7
status: in-progress
depends_on: [173]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: .worktrees/m7-174-flight-deck-staged
github_issue: 259
---
## What

Starting a quest today means the owner reads `STATE.md`, opens a terminal and types
`claude --model <m> "/factory-run NN"` by hand, copying the model and quest number from a file
the console already parses. ADR 0016 stages the launch in three steps and asks for the first two
here: the boarding pass, then the terminal spawn. The SDK session, the third step and the
harness, is quest 178 and depends on this one landing first, so every quest from the flight
deck's second stage onward launches from the console before the harness exists.

After this quest the flight deck room has two launch paths. L1, the boarding pass: a Launch
button per open quest composes `claude --model <m> "/factory-run NN"` from that quest's front
matter (`model`, `issue`) and copies it to the clipboard, the same line the owner types today,
with nothing new that touches the process. L2, the terminal spawn: a `quest-start` row in
`kinds.ts` opens a real terminal with that line queued, one argv template per platform (the
console already resolves the OS for `console.cmd`/`console.sh`), `shell: false` so the line
never passes through a shell string, and refused with a clear reason while a restart is in
flight (`restart.ts`). This quest builds the bridge's Launch action from quest 173's next-quest
card.

## Acceptance criteria

- L1: a boarding-pass component on the bridge and the flight deck reads a quest's `model` and
  `issue` from its front matter (via the existing quest-list API) and writes
  `claude --model <model> "/factory-run <issue>"` to the clipboard on click; a toast confirms the
  copy; a Playwright test asserts the clipboard content for a known fixture quest.
- L2: `kinds.ts` gains a `quest-start` entry with its own `validateArgs`, behind the Host check
  (ADR 0011); one argv template per platform (Windows: `cmd /c start`, POSIX: `x-terminal-emulator
  -e` or the console's existing terminal-launch convention if one exists — read `console.cmd`/
  `console.sh` first); `shell: false` on every spawn call, no string concatenation into a shell.
- `quest-start` is refused with a 409 or equivalent, and a stated reason, while
  `restart.ts`'s in-flight flag is set.
- A test posts an unknown `kind` to the jobs endpoint and asserts a 400.
- Existing job-kind tests (`mirror`, any prior kind) pass unchanged.
- `/gate` and CI green.

## Not in scope

The Agent SDK session and `quest-run` (quest 178). Any change to the atlas or ship systems.
Editing an issue file from the console (quest 99's road list, item 1, still out of scope).

## Done when

- [ ] L1: Launch composes and copies `claude --model <m> "/factory-run NN"` from a quest's front
      matter.
- [ ] L2: `quest-start` in `kinds.ts`, one argv template per platform, `shell: false`.
- [ ] `quest-start` is refused during a restart with a stated reason.
- [ ] A test proves an unknown job kind returns 400.
- [ ] `/gate` and CI green.

Source: `docs/decisions/2026-09-16-console-as-cic/handoff.md`, quest table row 2; ADR 0014; ADR 0016.
