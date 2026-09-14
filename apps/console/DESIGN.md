# The console's design system

Written before any change under `client/`, per quest 164. This file is the one design system the
Console and Quests rooms are built on; the other rooms (`docs/factory/issues/164-...md`, "Not in
scope") inherit only the shared tokens and type, not a redesign of their own markup.

## The brief, restated

Battlestar Galactica CIC on a screen, Diablo's loot log in the reporting. Amber phosphor on hull
grey, the snub-rectangle panel, the CIC voice — all pinned by quest 99 and quest 116, kept as-is.
What was missing: a hierarchy. At 1440 px every block was the same panel at the same weight, and
nothing said "look here first." At 720 px the nav broke and the remote URL clipped.

## Palette — pinned, named again here so the tokens are traceable to one file

| Token | Hex | Role |
|---|---|---|
| `--hull` | `#0d0f0e` | Deep background |
| `--hull-2` | `#15110a` | Warmer panel base |
| `--plate` | `#1c1812` | Raised panel surface |
| `--plate-edge` | `#2e2718` | Panel border, dividers |
| `--amber` | `#ffb000` | Primary phosphor — headlines, the one bold element, the "done" status |
| `--amber-dim` | `#b87a12` | Secondary phosphor — labels, rare-tier edge |
| `--amber-faint` | `#5e4410` | Faint phosphor — hairlines |
| `--ink` | `#f4e3c1` | Primary text on dark |
| `--ink-dim` | `#b8a988` | Secondary text |
| `--ink-faint` | `#7d7257` | Tertiary text, common-tier edge |
| `--st-done` | `#ffb000` | Status: landed (same hex as `--amber`, one phosphor) |
| `--st-in-progress` | `#36c6c0` | Status: live, draws the eye — also the uncommon-tier edge |
| `--st-todo` | `#6f6750` | Status: not started |
| `--st-deferred` | `#8a6fb0` | Status: parked |
| `--st-folded` | `#50463a` | Status: absorbed elsewhere |

No new hue. The four rarity tiers (below) are built from this list alone, by weight and edge
treatment, never by inventing a sixth colour.

## Type

Two faces, both bundled from an npm package (`@fontsource/*`), no CDN — the console runs offline.

- **Orbitron** (`--font-display`, fallback `"Segoe UI", sans-serif`) — the display face. A
  geometric, engraved-panel letterform, built for instrument faces and HUD read-outs; it is not
  a default AI pick (no warm-serif, no near-black-with-one-accent), it is genre-accurate to a
  bridge console. Used in exactly one place per room: the hero headline. Weights bundled: 400,
  700.
- **JetBrains Mono** (`--font-mono`, fallback `ui-monospace, "DejaVu Sans Mono", monospace`) — the
  data face, replacing the generic `"Courier New"` stack `theme.css` shipped with. Sharper
  x-height, a true monospace built for reading numbers and identifiers at small sizes: quest ids,
  commit hashes, elapsed timers, the whole body. Weights bundled: 400, 700.

Four font files, latin subset only, ~55 KB total uncompressed (already woff2-compressed, so this
is close to the wire cost) — see "Transfer budget" below.

## Type scale — six steps

| Step | Size | Use |
|---|---|---|
| `--step-0` | `0.72rem` | Eyebrow, status label, nav link |
| `--step-1` | `0.86rem` | Meta text, card loadout line |
| `--step-2` | `1rem` | Body |
| `--step-3` | `1.25rem` | Card title, panel title |
| `--step-4` | `1.75rem` | Section head, the encounter's own quest title |
| `--step-5` | `clamp(2.1rem, 5vw, 3.6rem)` | The hero headline only |

## Case

Not shouted everywhere. `theme.css` carried `text-transform: uppercase` on most labels; this
quest keeps it only where it marks a short, structural tag read at a glance and never grows past
a word or two: the altitude band, status labels, the rarity-tier label, drill/idea eyebrow tags.
Panel titles, section titles, nav links, quest-half titles and prose headings drop to sentence
case — they are content, long enough that shouting them hurts reading, not chrome.

## Grid — one breakpoint, reused everywhere

`console.css` already broke `.doc-layout` at 900 px. This quest promotes that number to the
system's one breakpoint, not an exception: **wide** (`> 900px`, covers both 1440 and 960) and
**narrow** (`<= 900px`, covers 720). One media query, one number, applied consistently, rather
than three separate per-width rules. `.room`'s max-width grows from `1100px` to `1320px` on wide
screens, so 1440 stops leaving 340 px of dead margin; narrow stays a single column at `100%`
minus gutters.

The nav is the one place a second, finer rule is needed: at `<= 900px` `.cic-bar__nav` switches
from `flex-wrap: wrap` (the old ragged two-row break, with the clock orphaned) to
`flex-wrap: nowrap` with its own `overflow-x: auto` — a single row, always, that scrolls
internally rather than breaking the bar. `widths.spec.ts` checks exactly this: the nav's own
bounding box stays one row tall at every tested width.

## Layout concept — one paragraph each

**Console room.** The active encounter is the hero: a wide banner directly under the lede,
Orbitron for the quest's own title, the elapsed time as a large tabular-numeral read-out, the
tree/loadout/party member as a compact meta line underneath. Below it, actions; below that, the
status row; below that, the milestones as experience bars, not tiles repeating the same number
twice; then Trees; then the Party as one row of five name-tags, not five paragraphs.

**Quests room.** Filters, then two halves exactly as now (main / side), but every card carries a
rarity-tier edge and label from its loadout, and a Tier filter sits beside the other three. The
side-quest half's empty state, when the filter leaves nothing to show, becomes the ledger's loot
log instead of a flat "None match the filter": the last five landed quests, newest first, each
its commit hash and (where the ledger can name one) the lesson it left behind.

## The one bold element

The active-encounter hero's headline, set in Orbitron at `--step-5`, amber, with the same
text-shadow glow `theme.css` already uses for `.headline`. Nothing else on either room uses the
display face or that size. Every other headline-shaped thing (panel titles, quest-half titles,
the hero's own meta line) stays in JetBrains Mono at a quieter step.

## Wireframes

### Console room, 1440 px

```
+--------------------------------------------------------------------------------+
| ▲ Verstaan / Console         Console  Quests  Playbook  Library  Glossary  Jobs   12:04:09 |
+--------------------------------------------------------------------------------+
| CIC · combat information centre                                                |
| Verstaan                                                                        |
| 6 / 41 quests won. Branch m1-mirror at a1b2c3d, clean.                         |
|                                                                                  |
| +------------------------------------------------------------------------+    |
| | ACTIVE ENCOUNTER                                          03:41:12    |    |
| | #164 The console looks like a CIC and reports like a quest log        |    |
| | tree .worktrees/side-164-... · implementer / sonnet / high            |    |
| | on station: implementer                                               |    |
| +------------------------------------------------------------------------+    |
|                                                                                  |
| [ Actions: fast gate | full gate | validate | drift check | sync | list trees ]|
|                                                                                  |
| [ Gate stamp ]        [ Remote ]           [ Ledger ]         [ Restart ]      |
|                                                                                  |
| M0 ############----------  6/6      M1 ##############------  9/12             |
| M2 --------------------  0/8        Side ####----------------  3/14           |
|                                                                                  |
| Trees                                                                          |
|  .worktrees/side-164-...  — side-164-console-cic-redesign @ a1b2c3d, 2 dirty  |
|                                                                                  |
| Party   [implementer] [rule-author] [test-writer] [docs-writer] [verifier]    |
+--------------------------------------------------------------------------------+
```

### Console room, 720 px

```
+----------------------------------------+
| ▲ Verstaan / Console          12:04:09 |
| [Console Quests Playbook Library ...]->| (nav: one row, scrolls)
+----------------------------------------+
| CIC · combat information centre        |
| Verstaan                               |
| 6 / 41 quests won. Branch m1-mirror... |
|                                         |
| +------------------------------------+ |
| | ACTIVE ENCOUNTER        03:41:12   | |
| | #164 The console looks like a CIC  | |
| | and reports like a quest log       | |
| | tree .worktrees/side-164-...       | |
| | implementer / sonnet / high        | |
| | on station: implementer            | |
| +------------------------------------+ |
|                                         |
| [ fast gate ] [ full gate ] [ ... ]     |
|                                         |
| [ Gate stamp ]                          |
| [ Remote ]                              |
| [ Ledger ]                              |
| [ Restart ]                             |
|                                         |
| M0 #######-------  6/6                 |
| M1 ##########-----  9/12               |
|                                         |
| Trees                                   |
|  .worktrees/side-164-... — ...         |
|                                         |
| Party                                   |
|  [implementer]                          |
|  [rule-author]                          |
|  [test-writer]                          |
|  [docs-writer]                          |
|  [verifier]                             |
+----------------------------------------+
```

### Quests room, 1440 px

```
+--------------------------------------------------------------------------------+
| Quests                                                                          |
| The backlog                                                                     |
| The main quest line and the side quests, filtered by milestone, status, tier.  |
|                                                                                  |
| Milestone [All v]   Status [Open v]   Agent [All v]   Tier [All v]             |
|                                                                                  |
| Main quests                                                                     |
|  M1                                                                             |
|   |legendary| #106 Create map ........................ ● done                 |
|   |rare     | #164 The console looks like a CIC ....... ◐ in progress         |
|                                                                                  |
| Side quests                                                                     |
|   |common   | #109 ... ○ open                                                  |
+--------------------------------------------------------------------------------+
```

### Quests room, 720 px, side half empty under a filter

```
+----------------------------------------+
| Quests                                  |
| The backlog                             |
| ...                                     |
| Milestone [All v]                       |
| Status    [Open v]                      |
| Agent     [All v]                       |
| Tier      [All v]                       |
|                                          |
| Main quests                             |
| M1                                      |
|  |rare| #164 The console looks ... ◐    |
|                                          |
| Side quests                             |
| Loot log — no side quest is open here.  |
| The last five landed:                   |
|  #162 The console can restart itself    |
|    9ecbfdf                              |
|  #116 ...                               |
|    <commit>                             |
+----------------------------------------+
```

## Revised after reviewing the plan against the brief

Three cuts from the first pass. Numbered step markers (01/02/03) on the milestone bars were the
first draft; the milestones are not a sequence, they run in parallel, so the marker was dropped —
each bar carries only its own name and one won/total figure. An eyebrow label above the hero
banner ("ACTIVE ENCOUNTER — .") reproduced exactly the stray-dash bug quest 164 was filed to fix,
so the banner's title is now the first thing in it, no label, no dash. Per-quest lesson
attribution in the loot log was planned as a join between `/api/ledger`'s lessons and the issue
that logged them, but `parseLessons()` only returns lessons grouped by signature
(`{sig, count, last}`); the raw line's own `issue` field (present in `lessons.jsonl` itself) never
reaches the client. That join needs a field the API does not carry — per quest 164's own "Not in
scope," it is cut here and named for a follow-up: `GET /api/ledger` would need to return
lesson lines keyed by issue number, not only the signature summary. The loot log in this quest
ships without a lesson line, commit hash and title only, until that follow-up lands.

## Transfer budget

Quest 99 held `/`'s cold load under 250 KB, excluding fonts (none were bundled then). This quest
bundles four font files (Orbitron 400/700, JetBrains Mono 400/700, latin subset, woff2):

| File | Bytes |
|---|---|
| `orbitron-latin-400-normal.woff2` | 6,396 |
| `orbitron-latin-700-normal.woff2` | 6,528 |
| `jetbrains-mono-latin-400-normal.woff2` | 21,168 |
| `jetbrains-mono-latin-700-normal.woff2` | 21,908 |
| **Total** | **56,000 (~54.7 KB)** |

No further weights or italics are bundled — the design only ever asks for 400 and 700 of each
face. `transfer-size.spec.ts`'s 250 KB ceiling now covers fonts too (the old comment claiming
"no fonts are loaded" is corrected in the same change); the JS bundle measured ~93 KB gzipped
before this quest, so the fonts fit inside the remaining budget with headroom.
