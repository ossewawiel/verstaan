---
issue: 99
title: "The console as a web client: state in the browser, repaint only what changed"
milestone: Side
status: open
depends_on: [98]
agent: implementer
agents: [implementer, docs-writer, verifier]
model: sonnet
effort: high
checkpoint: 4
commit: null
worktree: null
github_issue: 31
---
## What

Quests 90, 95 and 98 grew the console from generated HTML into a served page with in-place
swaps. The owner, 2026-09-09: "it is still shitty. what about a proper lightweight nodejs based
web client for this that do proper reloading without flickering and status jumps." A page that
re-fetches its own HTML and replaces `<main>` still rebuilds every node under it, so the browser
lays the whole panel out again, focus and hover are lost inside it, and any card that was
animating open snaps. The console is an application now; it needs a client that holds the
state and repaints only the nodes whose data changed.

This quest replaces the served pages with a small single-page client and a JSON API. It keeps
the zero-dependency rule: no `npm install`, no bundler, no build step. The client library is
vendored once into `tools/console/vendor/` and served as static files.

## Shape

- **Server** (`tools/console/src/serve.mjs`, extended): `GET /api/state` returns the model
  `buildModel(readRepo())` as JSON; `GET /api/doc/<path>` returns one rendered document as
  `{title, html, headings, path}`; `GET /api/issue/<nn>` returns one issue's rendered body;
  `GET /events` stays as the change stream, now sending `state` with the new model inline so the
  client needs no second round trip. The old room routes redirect to the client.
- **Client** (`tools/console/app/`): Preact with `htm` for templates, vendored as two ES modules
  (`preact.module.js`, `htm.module.js`, both MIT, about 14 KB together), loaded from
  `/vendor/`. A hash router (`#/`, `#/quests`, `#/quests/07`, `#/playbook`, `#/library`,
  `#/library/<path>`, `#/glossary`) so moving between rooms never loads a page. One store holds
  the model; the SSE handler replaces it; Preact's virtual DOM diff touches only changed nodes.
  Quest cards keep their open state in the store, keyed by issue number, so an update never
  closes one. Rendered document HTML comes from the server's own escaping renderer and is
  inserted as a fragment; the rule that nothing from the repo lands as markup without escaping
  stays the server's job and is tested there.
- **No flicker rule, made testable**: an update must not remove and re-add a node whose data
  did not change. Proven with a MutationObserver in the browser test: count added and removed
  nodes across an update that changes one issue's status; the count must be small and local,
  not the whole panel.
- **Status stays put**: the header shows the last update time in a fixed-width slot, so text
  never shifts the layout; tiles have fixed heights; a change in a number pulses the tile's
  metric, not the tile.
- **The file console** (`generate.mjs`) stays for `file://` use and is not changed by this quest.
- **Playbook and glossary** are documents, served through `/api/doc`.

## Acceptance criteria

- `GET /api/state` returns JSON with `Content-Type: application/json`; the shape equals what
  `buildModel` returns; a test asserts the two are `JSON.stringify`-equal.
- `GET /` serves the client shell; `#/quests/07` opens with card 07 expanded; the browser back
  button moves between rooms without a request for HTML.
- An SSE `state` event updates the page. MutationObserver proof: with `#/quests` open and card
  08 expanded, changing issue 07's status from open to in-progress in a worktree file adds or
  removes fewer than 20 nodes in total, and card 08 remains expanded. Recorded in the report.
- Scroll position, focused element and hover state survive an update; no `location.reload`,
  no `<main>` replacement, no meta refresh anywhere in the client. A test greps the client for
  all three.
- The client works with JavaScript modules only: no `fetch` of HTML, no `innerHTML` of anything
  but the server's rendered document fragments. Grep-tested.
- Vendored files carry their upstream licence text beside them in `tools/console/vendor/LICENSE-*`.
- Keyboard: every card and room is reachable by Tab; Escape closes an expanded card.
- Under 60 KB transferred for a cold load of `#/` excluding fonts; measured in the report.
- `node tools/console/test/run.mjs` covers the API routes and the SSE `state` payload;
  `docs/factory/README.md` console section and `PLAN.md` §6.6 describe the client; an ADR
  records the choice of Preact and htm over a bundled framework and over hand-written DOM code,
  with the alternatives and why.
- Verifier at checkpoint 4 reads the whole diff.

## Not in scope

Editing from the page. Authentication. Charts beyond the existing bars. Replacing the file
console. Any server-side framework.

## Done when

- [ ] The MutationObserver proof and the transfer size are in the report.
- [ ] Old room URLs (`/quests.html` and friends) redirect to their hash routes.
- [ ] `/gate` green in the tree; PR merged through the gate check.
