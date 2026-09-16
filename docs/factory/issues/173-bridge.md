---
issue: 173
title: "The bridge: a landing room that names the next quest and the ship's status at a glance"
milestone: M7
status: in-progress
depends_on: []
agent: implementer
agents: [implementer]
model: sonnet
effort: low
checkpoint: null
commit: null
worktree: .worktrees/m7-173-bridge
github_issue: 258
---
## What

The Console room (quest 99, redesigned by quest 164) opens on the active encounter, but a cold
visitor with no encounter running lands on a page that says nothing about what to do next. The
console-as-CIC decision (`docs/decisions/2026-09-16-console-as-cic/handoff.md`, 2026-09-16)
rebuilds this room as the bridge: the first thing a returning owner sees, landing on the same
information a terminal `/factory-status` prints, painted instead of typed. ADR 0016 names the
console as the place a quest launches from; ADR 0014 names GitHub and the model as live
dependencies the bridge must show as reachable or not. Quests 99, 116, 162 and 164 built the
chassis and the design system this room now wears.

After this quest the bridge shows, without scrolling at 1440 px: the next quest from
`STATE.md`, with its milestone, agent, model and effort read straight from that quest's issue
file front matter; the last five events from `GET /api/events`; and a status line carrying the
current branch, the dirty file count, whether the gate stamp on `HEAD` is current, and whether
GitHub answers (the comms-lost chip from ADR 0014). A boot sequence plays once per page load,
the amber systems-check the CIC voice implies, and it honours `prefers-reduced-motion`: a
visitor with that preference sees the finished state immediately, no animation frames spent.

## Acceptance criteria

- The bridge room reads `docs/factory/STATE.md` (or the API route that already serves it) for
  the next quest number, and reads that quest's own issue file for milestone, agent, model and
  effort; it never hardcodes a quest number.
- `GET /api/events` (or the existing events endpoint) backs a five-row list, newest first, with
  no client-side truncation bug that shows fewer than five when more exist.
- The status line shows branch, dirty count (`git status --porcelain` count via the server),
  gate-stamp freshness against `HEAD`, and a GitHub-reachable chip; GitHub down shows
  comms-lost, not an error state, per ADR 0014.
- The boot sequence is a CSS/JS animation gated by `window.matchMedia('(prefers-reduced-motion:
  reduce)')`; a Playwright test asserts it plays once per load (no repeat on a re-render) and is
  skipped entirely when the media query matches.
- `npx playwright test` in `apps/console` passes, including a new bridge spec, at 1440, 960 and
  720 px, with the width-safety assertions quest 164's `widths.spec.ts` already checks.
- `/gate` and CI green.

## Not in scope

Redesigning any other room. The flight deck's Launch button (quest 174). The atlas (quest 177).
Any change to `kinds.ts` or the job runner. A new GitHub API call beyond the reachability check
ADR 0014 already names.

## Done when

- [x] A cold visitor sees the next quest, with milestone/agent/model/effort, without scrolling.
- [x] The last five events show, newest first, without scrolling.
- [x] The status line shows branch, dirty count, gate-stamp freshness and GitHub reachability.
- [x] The boot sequence plays once per load and is skipped under `prefers-reduced-motion`.
- [x] `/gate` and CI green.

Source: `docs/decisions/2026-09-16-console-as-cic/handoff.md`, quest table row 1; ADR 0014; ADR 0016.
