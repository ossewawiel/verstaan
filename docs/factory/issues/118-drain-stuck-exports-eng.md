---
issue: 118
title: "Drain the stuck exports one language at a time: English first, and the close writes the quest for the next language"
milestone: Side
status: done
depends_on: [117]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: dd38d6c
worktree: null
github_issue: 87
---
## What

After issue 117, `python -m tools.mirror stuck` lists 620 exports whose latest manifest line is
`timeout`, spread over 44 languages, and `python -m tools.mirror retry` re-fetches them until
unlarchive.org's CDN answers HTTP 429, which it does after about thirty zips in a short time and
lifts about ten minutes after the polling stops. One run therefore lands about thirty zips in
whatever order the paths sort, and then exits 4. There is no way to say which language a run
should spend those thirty on, no way to wait through the window and go again, and nothing that
says which language is next. The developer, 2026-09-12: "can we somehow make this a recurring
side quest? we have a list of the languages which are not complete. so every time it is ran it
start with the first one in the list not completed, then try and complete it. if successfull,
pr'd and a new side quest, exactly the same rules for the next incomplete language and so on
until all are complete. the important one's UNL, English, Afrikaans, Nederlands, Duetch, France."
Afrikaans has no stuck zip left after issue 117's live run, and the archive has no UNL language
row, so the order that remains is English, Dutch, German, French, then every other language.

After this quest `mirror.toml` carries a `[retry]` table with `priority = ["eng", "dut", "ger",
"fre"]`. `python -m tools.mirror stuck --next` prints the first language in that list that still
has a `timeout` path, then, once the list is drained, the language with the most base forms in
`data/archive/languages.json` that still has one; it prints nothing and exits 1 when no language
has one. `python -m tools.mirror retry --language <iso3>` requests only that language's
`timeout` paths. `retry` gains `--passes` and `--pause-seconds`, defaults 3 and 600: a pass that
meets a 429 stops, the run sleeps the pause, and the next pass takes only what is still
`timeout`, until the language is complete or the passes are spent. The run exits 0 when the
language has no `timeout` path left and 4 otherwise. A folder unzipped by hand next to a static
zip, `data/archive/exports/afr/af_ana_a_c_ucn/` say, no longer makes the root tree dirty; that
ignore rule lands with this quest file, in the same pull request, because `/factory-run`
refuses a dirty root before it can start. This quest's own live run drains English. At
its close, `/quest` writes issue 119 for the language `stuck --next` names, in this same shape,
and the chain ends with the quest whose `stuck --next` prints nothing.

## Acceptance criteria

- `python -m tools.mirror stuck --next` against the current manifest prints `eng`. Against a
  fixture manifest where `eng` has no `timeout` line it prints `dut`; where every priority
  language is drained it prints the stuck language with the most base forms; where no language
  is stuck it prints nothing and exits 1. Each case is a test.
- `python -m tools.mirror retry --language dut` requests only paths whose language is `dut` and
  whose latest line is `timeout`. Proven by a test whose fake site records every URL and holds
  `timeout` paths for two languages.
- A pass that meets a 429 sleeps `--pause-seconds` through the fake clock, and the next pass
  requests only the paths still `timeout`, at most `--passes` passes. Proven by a test that
  counts the sleeps and the URLs per pass.
- `retry` exits 0 when the chosen language has no `timeout` path left after the run and 4
  otherwise. Proven by one test each, through the `test_cli.py` shape.
- `retry` prints one summary line per pass and a final line: language, passes used, landed,
  still stuck.
- One live `retry --language eng` run, with the report giving every pass's summary line and
  `stuck`'s English count before and after. The zips that landed and their manifest lines are
  in the work commit.
- Issue 119 exists for the language `stuck --next` names after the live run, written with
  `/quest`, with this quest in its `depends_on` and this section's shape.
- `/gate` and CI green.

## Not in scope

Retrying `error` paths. Any language other than English in this quest's live run; each later
language is its own quest in the chain. Running the chain unattended from CI or a schedule; each
quest is one `/factory-run`. Reading the archive's project pages to predict which zips have
content; the language table already carries the counts. Showing the chain in the console.

## Done when

- [x] `stuck --next`, `retry --language`, `--passes` and `--pause-seconds` land with every new
      test proven failing first.
- [x] English is drained as far as three passes allow: each pass's summary line and the English
      `stuck` count before and after are in the report, and the landed zips are in the work
      commit.
- [x] Issue 119 for the next language is on `main`, or the report records that `stuck --next`
      printed nothing and the chain has ended.
- [ ] PR merged through the gate check.
