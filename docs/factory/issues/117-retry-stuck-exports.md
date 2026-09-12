---
issue: 117
title: "The exports that did not make it: list them, and retry the stuck ones with a longer poll"
milestone: Side
status: in-progress
depends_on: [8]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: .worktrees/side-117-retry-stuck-exports
github_issue: 83
---
## What

Issue 08's live run on 2026-09-11 ended with 649 exports recorded as `status: timeout` in
`data/archive/manifest.jsonl`, beside 1966 `status: error` and 9 `status: empty`. Every timeout
is one of the sixteen static dictionary zips per language,
`/dics/<lang>_<ana|gen>_<a|u>_<c|e>_<ucl|ucn>.zip`. The archive builds each zip on request. It
answers with a 0-byte body until the build is done. `RateLimitedClient.get_while`
(`tools/mirror/http_client.py`) polls that body three times with a 1 s then 2 s backoff, a few
seconds in all, then `_store_export` (`tools/mirror/unlarium.py`) writes the 0-byte file and the
`timeout` line. The builds take longer than that. French got 0 of its 16 zips; Afrikaans, first in
the run, got 11. The same zip URL returned real content in one run and 0 bytes in the next, so the
state is transient, not a missing file. After the run, 32 of 681 zip files on disk hold a real
archive. `data/archive/exports/fre/fr_ana_a_c_ucl.zip` is 0 bytes with a `timeout` line behind
it. The 1966 errors are different: each one is the archive's own `mysqli_sql_exception: Table
... doesn't exist`, a settled answer for a dictionary/project/format/release combination that has
no table. A retry cannot change those.

The manifest holds the whole list, but nothing reads it back. There is no command that says
which exports are still stuck, and the only way to try again is the full two-hour `login` run,
which polls each zip for the same few seconds and gives the same answer. The developer,
2026-09-11: "we need to keep track of which dictionaries did not make it, so we can list them as
continues try quests and go back and retry when needed." The same day the developer chose the
shape: list both timeouts and errors, retry only the timeouts, and keep #12's M1 close-out free of
this quest, because the archive may never finish some of these builds.

After this quest `python -m tools.mirror stuck` reads the manifest, takes the latest line per
path, and prints every export whose latest line is `timeout` or `error`, grouped by language, each
line marked with its status, with a count per language and a total. It needs no credentials and
sends no request. `python -m tools.mirror retry` signs in as `login` does, re-fetches only the
paths whose latest line is `timeout`, and polls each one every 15 s for up to 5 min before it
gives up. A zip that lands is written over its 0-byte file and gets an `ok` line. One that does
not gets a fresh `timeout` line. `error` paths are never requested. The two flags
`--poll-seconds` and `--max-wait-seconds` change the budget. A second `retry` straight after the
first touches only what is still `timeout`.

## Acceptance criteria

- `python -m tools.mirror stuck` exits 0 with no `UNL_USER` or `UNL_PASS` set and makes no HTTP
  request. Proven by a test whose fake client fails on any call.
- `stuck` takes the latest manifest line per path. A path with an old `timeout` line and a newer
  `ok` line is not listed. Proven by a test with both lines in a fixture manifest.
- `stuck` prints one block per language, each path with `timeout` or `error`, a count of each per
  language, and a final total line. Run against the real manifest after issue 08 it lists 649
  timeouts and 1966 errors, or the difference is explained in the report.
- `python -m tools.mirror retry` exits 3 with one line when a credential is missing, and refuses
  a credential on the command line exactly as `login` does. Both proven by the existing
  `test_cli.py` shape.
- `retry` requests only paths whose latest line is `timeout`. Proven by a test whose fake site
  records every URL requested and holds one `timeout`, one `error` and one `ok` path.
- `retry` polls a still-empty body every `--poll-seconds` for up to `--max-wait-seconds`,
  defaults 15 and 300, through `RateLimitedClient.get_while` with a fake clock. Proven by a test
  that counts the polls and the sleeps.
- A zip that lands during `retry` overwrites the 0-byte file and appends an `ok` line; one that
  does not appends a `timeout` line. Proven by a test with one of each.
- `retry` obeys the 1 request/second rate limit and appends nothing for a path whose content and
  status are unchanged, as issue 07's store does.
- `retry` prints a summary line: attempted, landed, still stuck, bytes.
- One live `retry` run against unlarchive.org, with the report giving the summary line and the
  `stuck` count before and after.
- `/gate` and CI green.

## Not in scope

Retrying `error` paths; a missing table is not a slow build. Changing the poll budget of the
`login` run itself; it stays at its few seconds so a full run finishes in hours, and `retry` is
the slow pass. Parsing any export. Fetching anything the manifest does not already name; a new
export or a new language is a `login` run. Making the stuck list a page in the console.

## Done when

- [ ] `stuck` run against the real manifest is in the report, with its total line.
- [ ] One live `retry` run is in the report with its summary line and the `stuck` counts before
      and after.
- [ ] Every new test is proven failing before the code lands, and both runs are in the report.
- [ ] PR merged through the gate check.
