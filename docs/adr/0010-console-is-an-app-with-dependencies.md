# 0010 — The console is an app with dependencies; the engine still has none

Date: 2026-09-09 · Status: Accepted

## Context

ADR 0009 turned the console from a generated file into a zero-dependency Node service,
`node:http` and `node:fs` only, because the console's own criterion at the time was explicit: no
`npm install`. Quests 90, 95 and 98 then grew that service to render every room on every request
and swap content in place over server-sent events, to stop a timed reload from collapsing an open
card. The owner, 2026-09-09, after living with it: "it is still shitty ... what about a
lightweight node js web app ... good functionality that grows with the project." A page that
re-fetches its own HTML and replaces a block still rebuilds every node under that block; the
browser lays the whole panel out again, and a card mid-hover or mid-focus loses both. Filters, a
board view, a timeline, editing (quest 100 and the road it opens) all need a client that owns its
own state and diffs its own DOM, not a server that hands over bigger and bigger strings of HTML.

`docs/adr/0008-python-tooling-cpp-engine.md` fixed the engine's own rule: zero runtime
dependencies, because the engine ships to a translator's machine and every dependency is a
supply-chain review the project cannot outrun. The console never ships anywhere; it runs on the
owner's own loopback address, for the owner's own use, and stops mattering the moment the terminal
that started it closes. Those are two different things wearing the name "Verstaan", and this ADR
is the record that they are allowed to make two different calls.

## Decision

- The console becomes `apps/console/`, a small Node/React application, not a zero-dependency
  script under `tools/`. `apps/console/server/` is Fastify plus TypeScript; `apps/console/client/`
  is React 19, TypeScript and Vite. `npm install` is required here, and only here.
- The server exposes a read-only JSON API (`GET /api/state`, `/api/issues`, `/api/issues/:nn`,
  `/api/docs/*`, `/api/worktrees`, `/api/ledger`) and one change stream, `GET /events` over SSE,
  that names the section that changed. Nothing writes to the repository in this quest; the write
  layer is quest 100.
- The client owns its own state: TanStack Query caches every API response and one SSE
  subscription invalidates only the query for the section that changed, so a card the reader has
  not touched never re-renders. React Router gives every room a real path
  (`/quests/07`, `/library/docs/factory/PLAN.md`) so the back button and a deep link both work
  without a document request.
- The model layer — reading the repository, parsing frontmatter and issues, rendering Markdown —
  is the same logic `tools/console/src/{read,parse,markdown}.mjs` already had, ported into typed
  TypeScript modules under `apps/console/server/src/model/`. The `.mjs` files are not imported from
  the app; they stay the source for the file-based console below, and the two copies are kept in
  step by hand, the cost of not sharing a dependency-bearing package with a zero-dependency one.
- The file console, `tools/console/src/generate.mjs`, stays under `tools/`, zero dependencies,
  unchanged, for a `file://` reader with no service running. `tools/console/src/serve.mjs` — the
  Node-service half of ADR 0009, superseded by `apps/console/server` — is removed, along with its
  `test/run.mjs` coverage and `tools/console/theme/live.js`, the in-place-swap script it served.
  `tools/factory/hooks/console_serve.sh` now starts the built app's server
  (`apps/console/dist-server/server/src/index.js`) instead.
- The engine's rule does not move. `engine/` and the `tools/` Python packages stay at zero runtime
  dependencies (ADR 0008); `apps/console` is the one part of the repository allowed a lockfile,
  because it is the one part that never sits on the translation path and never ships to anyone
  but the owner running it locally.

## Consequences

- `npm ci` joins the gate ladder for `apps/console`: `/gate` step 3 and `gate.yml`'s `build` job
  run `npm ci && npm run build && npm test` there, and Playwright runs on the `ubuntu-latest` leg
  with its own bundled Chromium, not a system browser. A clean clone now needs Node 20 or later
  and network access to the npm registry once, the same trade ADR 0009 made for Node itself,
  extended to Node's own package ecosystem.
- `apps/console` carries a supply-chain surface the engine and the Python tools do not: a
  `package-lock.json`, and every transitive dependency it pins. That surface is bounded by where
  the app runs — loopback only, read-only, the owner's own machine — the same bound ADR 0009 drew
  around `serve.mjs`, now drawn around a bigger dependency tree instead of a smaller one.
- Two copies of the model layer exist for as long as both the file console and the app do: the
  `.mjs` originals under `tools/console/src/`, ported by hand into `apps/console/server/src/model/`
  as TypeScript. A fix to one does not reach the other automatically; `tools/console/test/run.mjs`
  and `apps/console/server/test/*.test.ts` each pin their own copy, so a drift between them fails
  its own suite rather than passing unnoticed.
- The console's dependency tree is generated-data-shaped, not engine-shaped: nothing in
  `apps/console` reads or writes `data/`, and `apps/console/dist/` (the built client) and
  `apps/console/dist-server/` (the compiled server) are build output, gitignored, not committed —
  the same rule `engine/generated/` and `docs/factory/console/` already followed.

## Alternatives rejected

- **Next.js.** A full framework buys server-side rendering and file-system routing the console
  does not need: every room here is already behind a loopback API with no SEO, no multi-tenant
  concern, and no need for a build step heavier than Vite's. Its dependency tree and build-time
  cost are disproportionate to five rooms and a handful of API routes.
- **SvelteKit.** Trades React's ecosystem — the house's own React coding standard already exists
  (`claude-prompts/guides/coding-standards/react-javascript-standards.md`) — for a smaller runtime
  the project would be the only user of. The console is exactly the kind of surface later quests
  (a board view, a timeline, an editing form) will keep growing, and the wider ecosystem matters
  more here than the smaller bundle.
- **Preact, vendored.** Keeps a React-shaped API without a `node_modules` dependency by copying
  Preact's source into the repository, the same zero-dependency shape ADR 0008 and 0009 both
  chose. Rejected because the owner's own ask was explicit — "node install possible" — and because
  vendoring a UI runtime means vendoring its patches too; TanStack Query and React Router both
  assume real React, and a compatibility shim for both is more maintenance than a lockfile.
- **Keep the hand-written DOM (`tools/console/theme/console.js` plus `live.js`).** This is what
  quests 90, 95 and 98 already built, and it is the thing this quest replaces: every new feature
  meant more hand-written DOM diffing, and the flicker this ADR's Context section describes is
  exactly what happens when hand-written string-swapping meets a card the reader has open. It
  stays only as the file console's read-only renderer, generating a page nothing writes back to.
