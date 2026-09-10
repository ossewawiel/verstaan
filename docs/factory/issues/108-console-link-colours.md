---
issue: 108
title: "Console prose and doc-rail links don't fit the amber theme"
milestone: Side
status: in-progress
depends_on: []
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: .worktrees/side-108-console-link-colours
github_issue: 51
---

## What

`apps/console/client/public/theme.css` sets the console's palette: amber phosphor on deep
hull-grey, the "Colonial" skin (`theme.css:1-29`). Status colour is a separate, reserved
vocabulary — `--st-in-progress` is cyan, `#36c6c0`, meant only for the glyphs and labels that
say a quest is live (`theme.css:26-29`, "status meaning never rides on hue alone").

Two link rules borrow that cyan for plain body links instead: `.prose a`
(`theme.css:208-209`) and `.doc-rail a` (`console.css:217-226`). A cold cyan link sitting in
warm amber prose reads as off-theme, and it reuses a colour a reader has learned means
"in progress" for a link that carries no such meaning.

The developer, 2026-09-10: "the console web app link colours do not go well with the theme.
use your excelent ui design skills to make it look better."

After this quest, `.prose a` and `.doc-rail a` use the theme's own link idiom — the muted-to-amber
pattern already proven in `.cic-bar__nav a` (`theme.css:76-81`): dim at rest, full amber on
hover and focus, border or underline carrying the affordance instead of a borrowed status hue.
`--st-in-progress` stops appearing anywhere outside status glyphs and labels.

## Acceptance criteria

- `grep -n "st-in-progress" apps/console/client/public/*.css` matches only status-glyph and
  status-label rules (`.legend__item--in-progress`, `.story--in-progress`, `.tip__label`,
  `.nn-row--now`) — no `a` selector.
- `.prose a` and `.doc-rail a` use `--amber-dim` (or `--ink-dim`) at rest and `--amber` on
  `:hover`/`:focus`/`:focus-visible`, matching the existing `.cic-bar__nav a` pattern.
- The console, loaded at `http://127.0.0.1:7864`, shows a doc page (e.g. the STATE panel's
  prose) with links that read as part of the amber theme at rest and on hover, checked with the
  Playwright MCP browser.
- `apps/console/e2e` (`npm run test:e2e`) still passes.

## Not in scope

- Any other colour in `theme.css` or `console.css`. Only the two link rules named above.
- Introducing a new CSS variable for links. Reuse `--amber-dim` / `--amber`, the tones the nav
  already uses for the same rest/hover shape.
- The `dist/` copies of `theme.css` and `console.css`. Those are build output; fix the source
  under `client/public/` and let the build regenerate them.

## Done when

- [ ] `.prose a` and `.doc-rail a` no longer reference `--st-in-progress`.
- [ ] Both use the amber-dim/amber rest/hover pattern, verified against `.cic-bar__nav a`.
- [ ] `grep -n "st-in-progress" apps/console/client/public/*.css` shows only status rules.
- [ ] Console checked live with the Playwright MCP browser: doc-page links read on-theme at
      rest and on hover.
- [ ] `npm run test:e2e` passes in `apps/console`.
