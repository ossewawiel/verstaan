---
issue: 99
title: "The console as a web app: a Node service and a React client that grow with the project"
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
swaps. The owner, 2026-09-09: "it is still shitty ... what about a lightweight node js web app,
node install possible ... good functionality that grows with the project and gets updated with
awesome project management functionality as we go along." A page that re-fetches its own HTML
and replaces a block rebuilds every node under it; the browser lays the panel out again, focus
and hover are lost, and a card mid-animation snaps. And a page has nowhere to grow: filters,
boards, timelines, editing, all need a client that owns state.

This quest turns the console into a proper web app in `apps/console/`: a Node server with a
JSON API and a change stream, and a React client built with Vite. Dependencies are allowed here
and only here; the engine keeps its zero-dependency rule (ADR 0008), and the app never sits on
the translation path.

## Stack, decided for this quest

| Layer | Choice | Why |
|---|---|---|
| Server | Node 20+, Fastify, TypeScript | Small, fast, typed routes and schemas; SSE is one plugin. Reuses `tools/console/src/{read,parse,markdown}.mjs` as the model layer, moved into the app as TypeScript modules. |
| Client | React 19, TypeScript, Vite | The house has React standards (`claude-prompts/guides/coding-standards/react-javascript-standards.md`); the widest ecosystem for project-management widgets later. |
| Data | TanStack Query for server state, one SSE subscription that invalidates queries | Diffed re-renders, no manual DOM. Nothing repaints unless its data changed. |
| Routing | React Router, real paths (`/`, `/quests/07`, `/library/docs/factory/PLAN.md`) | Deep links and the back button without a page load. |
| Styling | Plain CSS with the Colonial tokens from `tools/console/theme/theme.css`; no UI kit yet | Keeps the CIC look; a kit can come when a widget needs one. |
| Tests | Vitest for units, Playwright for the flicker proof and keyboard paths | Same tools the house uses. |
| Packaging | `apps/console/package.json` with a lockfile; `npm ci` in the gate and CI; `console.cmd` runs the built server | Reproducible installs. |

## Shape

- `apps/console/server/`: routes `GET /api/state`, `GET /api/issues`, `GET /api/issues/:nn`,
  `GET /api/docs/*`, `GET /api/worktrees`, `GET /api/ledger`, `GET /events` (SSE; sends `state`
  with the changed section named). The model layer is the existing readers, typed. Nothing
  writes to the repo in this quest; the write layer is the next quest.
- `apps/console/client/`: rooms as routes. Console (next move, tiles, map, trees, party,
  ledger), Quests (list with filters by milestone, status, agent; a card per issue; a detail
  route), Playbook, Library (tree of documents with the on-this-page rail), Glossary.
- Build: `npm run build` emits the client into `apps/console/dist/`; the server serves it.
  `npm run dev` runs Vite with proxy for daily work.
- `console.cmd` and `console.ps1`: `npm ci` if `node_modules` is missing, `npm run build` if
  `dist` is older than `src`, then start the server. Same port 7864, same health route.
- The file console (`tools/console/src/generate.mjs`) stays for `file://` use, untouched.
  The old `serve.mjs` is removed once the app serves the same rooms.

## The road it opens, for later quests, not this one

1. Editing from the page: change an issue's status, tick a done-when box, write an acceptance
   line; the server writes the file and commits `docs(#NN)` in the right worktree.
2. A board view: columns by status, swimlanes by milestone, drag to reorder `depends_on`.
3. Timeline and burn-up from git history and the issue files' commit dates.
4. The ledger as charts; a retro inbox where a ripe signature becomes a proposal you approve.
5. The rule-author's review inbox: pending test sentences, approve or correct in place.
6. Worktree management: create a tree for a quest, see its gate stamp, open its PR.
7. GitHub in the page: PR checks, review state, mirror drift.

## Acceptance criteria

- `npm ci && npm run build && npm test` succeeds from a clean clone with Node 20 or later and
  nothing else installed; the lockfile is committed.
- `GET /api/state` returns `application/json` equal to `buildModel(readRepo())`; a Vitest test
  asserts it.
- All five rooms render from the API; `/quests/07` deep-links to card 07 expanded; back and
  forward move between rooms with no document request (Playwright asserts zero navigations).
- **Flicker proof**: with `/quests` open and card 08 expanded, changing issue 07's status in a
  worktree file produces an SSE event; a MutationObserver in the Playwright test counts fewer
  than 20 added or removed nodes, card 08 stays expanded, scroll and focus are unchanged.
  Recorded in the report with the numbers.
- The header's update time sits in a fixed-width slot; a changed tile pulses its metric only.
  No layout shift on update, measured with `layout-shift` entries in the Playwright test.
- Keyboard: every room and card reachable by Tab, Escape collapses a card, focus visible.
- Cold load of `/` under 250 KB transferred excluding fonts; measured in the report.
- `/gate` step 3 and `gate.yml` run `npm ci`, `npm run build`, `npm test` in `apps/console`;
  Playwright runs in CI on ubuntu with the bundled browser.
- ADR: the console is an app with dependencies, the engine is not; records Fastify, React,
  Vite, TanStack Query, React Router, the alternatives weighed (Next.js, SvelteKit, Preact
  vendored, hand-written DOM) and why each lost.
- `docs/factory/README.md` console section, `PLAN.md` §6.6 and §5, `docs/glossary.md`
  (Console: the app) updated. `console.cmd` and `console.ps1` updated and tested by hand.
- Verifier at checkpoint 4 reads the whole diff.

## Not in scope

Any write to the repository from the page. Authentication. A UI kit. Replacing the file
console. Hosting anywhere but the loopback address.

## Done when

- [ ] The flicker proof, layout-shift count and transfer size are in the report.
- [ ] The old room URLs redirect to the new routes and `serve.mjs` is gone.
- [ ] `/gate` green in the tree; PR merged through the gate check.
