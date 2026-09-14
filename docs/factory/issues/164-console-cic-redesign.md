---
issue: 164
title: "The console looks like a CIC and reports like a quest log: one design system, the Console and Quests rooms, and half-screen done properly"
milestone: Side
status: open
depends_on: [99, 104, 116, 162]
agent: implementer
agents: [implementer]
model: sonnet
effort: high
checkpoint: null
commit: null
worktree: null
github_issue: 229
---
## What

The console wears the Colonial skin quest 99 copied from the bob template: amber phosphor on
hull grey, the snub-cornered panel, Courier for everything. Quests 108, 111 and 116 patched
colours and corners, but nobody has designed the page. At 1440 px wide an 1100 px column sits
in dead margin, and every block on the Console room is the same panel at the same weight: Now
/ Next, Actions, four small status panels, four milestone tiles, Trees, then the Party as a wall
of prose. Nothing is the hero. The milestone tile says "6 of 6 won" and then "6/6" under it.
The Actions title renders "ACTIONS — ." when no tree is named. At 720 px, half of a 1440 screen,
the nav wraps into two ragged rows with the clock orphaned on its own line, and the remote URL
clips mid-word inside its panel. The Quests room is a readable table, and only a table: no
cost, no progress, no reward, though the project runs as a game. The developer, 2026-09-14:
"make the web console look stunning as a battlestar galactica themed console with a hack and
slash like 'diablo' type reporting style for our game like approach to the project regarding
reporting. so work with what is there already and figure out what can be improved and layed out
better. also make sure half screen size works beatifully as well."

After this quest the console has one design system, written down before any code, and the two
rooms that carry the game are rebuilt on it. The system keeps what the brief pins: amber on
hull, the snub shape, the CIC register. It decides what the brief leaves open: a display face
for headlines and a monospace for data, chosen on purpose; a type scale; a grid that uses a wide
screen and folds cleanly at half of one; case used deliberately, not shouted everywhere. The
Console room opens on the active encounter, the quest in flight, as its hero. The milestone
tiles become experience bars. The Quests room becomes a quest log: each card carries a rarity
tier read from its loadout, and the ledger shows recent wins as loot, what each dropped. The
`frontend-design` skill (installed at user scope on 2026-09-14) guides the work; its process is
plan, review the plan against the brief, build, critique with screenshots. The implementer has
no Skill tool, so it reads the skill file straight from disk: `find ~/.claude/plugins -path
'*frontend-design*' -name SKILL.md`. Effort is `high`, one step above the implementer's default,
because a look that reads as one hand across two rooms and three widths is design judgement
before it is plumbing; the skill's plan-review-build-critique loop needs the headroom.

## Design brief, fixed here

- **Pinned by the brief.** Amber phosphor (`--amber` and its two dims) on the hull greys. The
  snub-rectangle silhouette from quest 116, frame line included. The CIC voice in the copy:
  encounters, quests, the party, the boss fight; `docs/glossary.md` has the words. No new
  colour beyond the five status tones already in `theme.css`.
- **Open, to be decided in the design plan.** Two typefaces, one display and one monospace,
  named with a fallback stack, loaded from the package (no CDN; the console runs offline). A
  type scale of no more than six steps. Where case is upper and where it is not. The grid.
  Which single element gets the boldness: the skill says spend it in one place.
- **The four game devices.** Rarity tier on a quest card, from its loadout: sonnet/low is
  common, sonnet/medium uncommon, sonnet/high rare, opus/high legendary; each tier is a border
  or edge treatment plus a text label, never hue alone (the accessibility rule `theme.css`
  already states). An experience bar per milestone tile: won over total, with the numbers once.
  The Now row as the active-encounter banner, the hero of the Console room: quest number, title,
  tree, loadout, the party member on it, the elapsed time from `startedAt` if the job runner
  has one. The ledger as a loot log: the last five `status: done` quests with commit hash and
  the lesson each logged, newest first, from `GET /api/ledger` and the issue files.
- **Three widths, tested.** 1440 (a full screen), 960 (half of 1920), 720 (half of 1440). At
  every width: no horizontal scroll, no text clipped by its container, the nav in one row or in
  one deliberate collapsed form, every button reachable and labelled. The doc-rail breakpoint at
  900 px in `console.css` becomes part of the system, not an exception.
- **Quality floor, from the skill, held silently.** Visible keyboard focus everywhere; the
  keyboard-arm rule from quest 100 unchanged; `prefers-reduced-motion` respected; one
  orchestrated motion at most, on page load, and none per card; line lengths under 80
  characters for prose.

## Acceptance criteria

- `apps/console/DESIGN.md` exists and was written before the code: palette as named hex values,
  the two typefaces and their roles, the type scale, an ASCII wireframe of the Console room and
  of the Quests room at 1440 and at 720, the one bold element, and one paragraph on what was
  revised after reviewing the plan against the brief and why. The work commit's diff shows the
  file's first version predates the first change under `client/`.
- The Console room at 1440: the active encounter is the first thing on the page below the bar;
  each milestone shows one bar and one figure; the Party is a row of five names with loadout,
  not five paragraphs; no panel title carries a stray "— ."
- The Quests room at 1440: every card shows its rarity tier as an edge treatment and a text
  label; a filter by tier exists beside milestone, status and agent; the side-quest half shows
  the loot log when the filter leaves it empty, not "None match the filter."
- `npx playwright test` in `apps/console` includes a new `e2e/widths.spec.ts` that loads `/` and
  `/quests` at 1440×900, 960×900 and 720×900 and asserts, at each: `document.documentElement
  .scrollWidth <= window.innerWidth`; no element with text overflows its own box (`scrollWidth
  > clientWidth` on `.panel`, `.tile`, `.story__summary`, `.cic-bar__nav`); the nav's bounding
  box is one row tall or has the collapsed class; every `button` has an accessible name.
- Every existing e2e spec passes unchanged: `flicker`, `layout-shift`, `keyboard`, `actions`,
  `now-row`, `loadout`, `main-and-side`, `quest-status-filter`, `routing`, `transfer-size`. The
  transfer-size ceiling from quest 99 holds with the two typefaces bundled; if a face does not
  fit, the plan says which subset was cut and why.
- Six screenshots in the pull request body, the two rooms at the three widths, taken with the
  Playwright MCP from `.mcp.json`, with one sentence each on what the eye lands on first.
- `/gate` and CI green.

## Not in scope

The other rooms. Jobs, Library, Playbook, Glossary, DocPage and ArtifactPage keep their markup
and inherit only what the shared tokens and type give them; a follow-up quest applies the system
to each, room by room, from `DESIGN.md`. Any change to what the server reports: the API is the
API of quest 99 and 100, and a device that needs a field the model does not carry is cut from
this quest and named in the follow-up, not added here. The bob template's `theme.css` upstream:
this quest edits the console's copy only. Editing issue files from the page (quest 99's road
list, item 1). `console.cmd` and `console.ps1`.

## Done when

- [ ] `apps/console/DESIGN.md` holds the design plan, written before the code, with the
      revision paragraph.
- [ ] Two typefaces bundled and named, the type scale in the tokens, case decided, and the
      all-caps-everywhere rule gone from `theme.css`.
- [ ] Console room: active-encounter hero, experience bars, party as a row, no stray "— .".
- [ ] Quests room: rarity tier on every card with label and edge, tier filter, loot log in the
      empty side-quest half.
- [ ] `e2e/widths.spec.ts` green at 1440, 960 and 720 for both rooms; every prior spec green.
- [ ] Six screenshots in the PR, one sentence each.
- [ ] PR merged through the gate check.
