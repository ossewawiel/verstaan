---
issue: 111
title: "Console has no base link colour, so every unstyled anchor falls back to browser blue"
milestone: Side
status: done
depends_on: [108]
agent: implementer
agents: [implementer]
model: sonnet
effort: low
checkpoint: null
commit: PLACEHOLDER
worktree: null
github_issue: null
---

## What

Issue 108 fixed `.prose a` and `.doc-rail a`, the two links it named. The developer then found
two more unstyled anchors live at `http://127.0.0.1:7864`, 2026-09-10: the Console room's "Next"
row (`ConsoleRoom.tsx:52`) and its "Trees" panel issue link (`ConsoleRoom.tsx:95`), plus the
Library index's document list (`LibraryRoom.tsx:28`). All three are bare `<Link>`/`<a>` elements
with no class, so with no base rule for the `a` element anywhere in `theme.css` or `console.css`
they fell back to the browser default blue (`rgb(0, 0, 238)`).

The developer, 2026-09-10: "this needs to happen on all the pages, now and going forward." Fixing
each surface one at a time repeats issue 108's mistake — the next new link anywhere in the app
would default to blue again, since there was never a fallback.

After this quest, `theme.css` carries one base rule: `a` is `--amber-dim` at rest, `--amber` on
hover/focus, right after the `body` rule the palette itself lives beside. Every existing
component-specific rule (`.cic-bar__nav a`, `.doc-rail a`, `.prose a`, `.tile`) is more specific
than a bare-element selector, so none of them change; they now read as refinements of this
default (a border, a block display) rather than the only source of colour. A future link with no
class inherits the on-theme pair automatically.

## Acceptance criteria

- `theme.css` has one `a { color: var(--amber-dim); ... }` / `a:hover, a:focus-visible { color:
  var(--amber); }` pair, placed near the top with the other base rules.
- The Console room's "Next" row link and "Trees" panel link, and the Library index's document
  list, all render amber, not blue — checked live with the Playwright MCP browser.
- No existing component-specific link rule's rest/hover colours change (nav, doc-rail, prose,
  tiles) — verified by re-checking `.doc-rail a` and `.prose a` still match `--amber-dim`/`--amber`.
- `npm run test:e2e` still passes.

## Not in scope

- `.cic-bar__nav a` and `.cic-bar__here`, which intentionally use `--ink-dim`/`--amber`, a
  different rest colour than the new base default — a more specific selector, untouched.
- `a.drill__src` and any other link that colours itself from a status token on purpose.

## Done when

- [x] `theme.css` carries the base `a` rest/hover rule.
- [x] Console room ("Next" row, Trees panel) and Library index links checked live: amber, not blue.
- [x] `.doc-rail a` and `.prose a` re-checked live: unchanged, still amber-dim/amber.
- [x] `npm run test:e2e` passes.
