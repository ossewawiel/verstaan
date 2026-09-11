---
issue: 116
title: "The console's cut corners carry the border line: every snub card is framed on all six edges"
milestone: Side
status: open
depends_on: [99]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: null
github_issue: 81
---
## What

The web console's signature shape is the snub rectangle: a card with its top-left and
bottom-right corners cut on the diagonal. `apps/console/client/public/theme.css:62-67` draws
it with one `clip-path: polygon(...)` rule on `.snub`, `.cic-bar`, `.tile` and `.panel`, and
`--cut` sets the size of the cut. A tile then paints a one-pixel `border` in `--plate-edge`
and turns it `--amber` on hover (`theme.css:106-112`). The clip removes everything outside the
polygon, and the border is painted on the box's own rectangle, so the two diagonal edges have
no line at all. Open the console, look at a milestone tile on the front page: four straight
edges carry a thin frame, and at the two cut corners the frame simply stops and the card's
gradient meets the hull with no edge. Hover the tile and the amber frame lights up on four
sides and is missing on two.

The developer, 2026-09-11: "The borders of the cards in the web console where the corners are
cut is missing. since it is not rounded corners it is probably difficult to make but it will
look better if those cutouts also have borderlines."

After this quest every snub card is framed on all six edges. The diagonal edges carry the same
one-pixel stroke, in the same colour, as the straight ones, at rest and on hover and focus.
The frame is drawn once, in `theme.css`, as part of the snub idiom, not once per component.
The implementer picks the mechanism; the usual one is a layered pair, an outer box painted in
the border colour and clipped to the polygon, with the card's own background clipped to the
same polygon inset by the border width, so the border colour shows through as a stroke. A
pseudo-element or a wrapper is both fine. The `.tile__corner` triangle sits at the top-right,
which is not a cut corner, and stays where it is.

## Acceptance criteria

- In the running console, `http://127.0.0.1:7864/`, a milestone `.tile` shows a continuous
  one-pixel frame along all six edges, the two diagonals included. A Playwright screenshot of
  one tile at 2x device scale shows the stroke on the diagonal at the same weight and colour as
  on the straight edges.
- On hover and on keyboard focus the whole frame, diagonals included, turns `--amber` in one
  transition. No edge lags or stays dim.
- `.panel` shows the same six-edge frame. `.cic-bar`, which carries only a bottom border, is
  unchanged in appearance.
- `.tile--ghost` keeps its reduced opacity and its frame.
- The frame lives in the snub idiom block of `theme.css`, so a new element that takes the
  `snub` class gets its six-edge frame with no further CSS. `git grep -n polygon
  apps/console/client/public/theme.css` shows the polygon in that one block and nowhere else
  in the file except a shared inset variant, if one is needed.
- `npm run test:e2e` in `apps/console` stays green, `layout-shift.spec.ts` and
  `flicker.spec.ts` included: the frame adds no layout shift and no repaint on data refresh.
- `python -m tools.validate --all` exits 0. `/gate` and CI green.

## Not in scope

The file console under `tools/console/` draws no snub shape and gets no change. Any change to
`--cut`, to the palette, or to which components take the snub shape. Rounded corners, a
double-line or glow frame, or any new border weight. Status colour on the frame: the frame's
colour stays the edge and amber pair the tiles already use.

## Done when

- [ ] Every `.tile` and `.panel` shows the one-pixel frame on all six edges at rest, on hover
      and on focus, checked with a Playwright screenshot in the hand-off.
- [ ] The frame is defined once in the snub block of `theme.css`.
- [ ] `npm run test:e2e` in `apps/console` is green.
- [ ] PR merged through the gate check.
