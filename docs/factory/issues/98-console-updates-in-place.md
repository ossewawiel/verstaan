---
issue: 98
title: "The console updates in place: no flicker, open cards and scroll survive"
milestone: Side
status: done
depends_on: [95]
agent: implementer
agents: [implementer]
model: sonnet
effort: low
checkpoint: null
commit: cf930a1
worktree: null
github_issue: 30
---
## What

Quest 95 made the console live by reloading the page on every change event, and the file console
reloaded itself every two minutes. The owner, 2026-09-09: "the console refresh is irritating, i
know it needs to happen but it cause screen flicker and it causes the links and expands to not
work." A full navigation repaints the page, collapses every open quest card, drops the scroll
position and the focused element, and a hash link that was just followed jumps back to the top.

The fix keeps the event and drops the navigation. On a change event the page fetches its own URL
again and swaps the content in place. The command console re-renders from the new data island
through a new `window.verstaanConsole.update`, which clears and refills the six containers.
Every other room swaps its `<main>`. Before the swap the script records which `<details>` are
open, the scroll position and the focused element, and restores them after. The header's
subtitle shows "updated HH:MM:SS" with a short pulse, so a change is visible without motion on
the content. The file console no longer reloads on a timer.

## Acceptance criteria

- `GET /` and every room carry `<script src="/live.js">`; `/live.js` is served with the JS MIME type.
- No page carries `<meta http-equiv="refresh">` and no script calls `location.reload()`.
- With `/quests.html` open in a browser, a closed card opened by the reader, and a JavaScript
  marker set on `window`, touching an issue file leaves the marker in place (no navigation), the
  card open, and the subtitle showing an updated time. **Proven with a real browser.**
- On the command console the same event re-renders tiles, map, side quests, trees, party and
  ledger with no duplicated rows: a second update leaves exactly one Save point tile.
- A change to a doc under the library updates a doc page's `<main>` without changing the URL.
- `node tools/console/test/run.mjs` covers: `/live.js` served, no meta refresh, no reload call in
  `live.js`, and `console.js` exposes `verstaanConsole.update`.
- `prefers-reduced-motion` disables the pulse transition.

## Report, 2026-09-09, uncommitted in this tree

Browser proof, Playwright against the service on port 7898 from this tree:

1. Opened `/quests.html`. In the page: set `window.__marker = 'alive'`, opened card `#issue-08`
   (it was closed), scrolled to 900 px. Header showed `updated 18:10:19`.
2. Touched `docs/factory/issues/98-console-updates-in-place.md` at 18:10:36.
3. Three seconds later, in the same page: `marker: "alive"` (no navigation happened),
   `cardOpen: true`, `scrollY: 900`, header `updated 18:10:46`, URL unchanged.

`node tools/console/test/run.mjs` is green with the five new checks.

Command console, same service: opened `/`, forced two in-place updates through
`window.verstaanLive.refresh()` 800 ms apart. Save point tiles before: 1; after two updates: 1.
Map sections: 2. Marker alive. Header `updated 18:11:09`. No duplicated rows.

The service that was already running on port 7864 keeps serving the old reload script until it is
restarted; `console.cmd` sees it answer `/health` and leaves it alone. Stop it once after this
merges (`Stop-Process` on the node process holding 7864), then run `console.cmd` again.

## Not in scope

Partial DOM diffing beyond the `<main>` swap. Editing from the page.

## Done when

- [x] The browser proof (marker, open card, updated time) is in the report with the steps.
- [x] Tests green in `node tools/console/test/run.mjs` and `/gate` step 3.
