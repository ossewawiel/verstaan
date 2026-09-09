---
issue: 95
title: "The console as a local service: one URL, every tree, live"
milestone: Side
status: done
depends_on: [92, 93, 94]
agent: implementer
agents: [implementer, docs-writer]
model: sonnet
effort: medium
checkpoint: 4
commit: 07ac78b
worktree: null
github_issue: null
---
## What

The console is the owner's lifeline: the page that says where the project is. Since quest 92 the
work happens in worktrees, and the page the owner keeps open lives in the root tree. A hook
firing inside a worktree regenerated that tree's page, not the root's, so the lifeline went stale.
The owner's words on 2026-09-09: "the console web is the game, the life line of the project".

Two slices. Slice 1 is done in this tree: the generator run from any tree also regenerates the
root console, and the root page reloads itself every two minutes. Slice 2 replaces the file-based
console with a small local service, the way munserv serves its dashboard rather than writing
files: one URL, rendered on request from every tree, with live reload pushed to the browser.

## Slice 1, done 2026-09-09

- `tools/console/src/generate.mjs`: after writing its own tree's console, if this tree is not the
  root (`git rev-parse --git-common-dir`), it runs the root tree's generator with an env flag
  that stops chaining. Proven from a temporary worktree: the root page's `generated` stamp moved
  from 07:52:25Z to 07:52:32Z and its Trees panel listed the temporary tree.
- `tools/console/src/render.mjs`: the console page carries `<meta http-equiv="refresh" content="120">`.
  The other rooms do not reload.
- `tools/console/src/read.mjs`: `mergeIssuesAcrossWorktrees` now also surfaces an issue file that
  exists only in a worktree, so a quest written on its branch shows on the root console before
  merge. The earlier rule hid it; the test that asserted the old rule was rewritten to the new
  one, with a comment saying why.

## Slice 2, the service

This section described the plan before the build. It is superseded by what was actually built;
see "Slice 2 report", "Slice 2 closeout" and "Checkpoint 4 fixes" below for what exists today.

- `node tools/console/src/serve.mjs [--port 7864]`: a zero-dependency Node HTTP server. On every
  `GET /` it rebuilds the model from the root tree and every worktree (the existing `readRepo`)
  and renders in memory; nothing is written to disk. The other rooms render the same way from
  the root tree's docs. Static assets from `tools/console/theme/`. Reality: the model is now
  cached and invalidated by the watch signal (checkpoint 4, gap 5) rather than rebuilt on every
  request.
- Live reload: `GET /events` is a server-sent events stream. The server watches
  `docs/factory/issues/`, `docs/factory/lessons.jsonl`, `docs/factory/STATE.md` and
  `.git/HEAD`, `refs/`, `worktrees/` under the common git dir with `fs.watch`, debounced to
  500 ms, and sends `reload`. A four-line script in the page listens and reloads. No polling,
  no meta refresh. Reality: the debounce is 800 ms with a 2000 ms maximum wait (checkpoint 4,
  gap 1); the exact watched paths are the root issues folder, `docs/factory`, `docs`,
  `.claude/agents`, every worktree's issues folder, and the common git dir plus its `refs` and
  `worktrees` subdirectories.
- Start: `SessionStart` hook starts it if `http://127.0.0.1:7864/health` does not answer; a pid
  file under the common git dir prevents two instances; `/factory-status` prints the URL.
  `tools/console/serve.cmd` starts it by double-click for a machine with no session running.
  Reality: the second-instance guard is `EADDRINUSE` plus a `/health` probe, not a pid file —
  there is no pid file anywhere. The double-click launchers are `console.cmd` and `console.ps1`
  at the repository root, not `tools/console/serve.cmd`.
- Binds to `127.0.0.1` only. No authentication needed because nothing is writable.
- The file-based generator stays for `file://` use on a machine without Node running, and the
  meta refresh stays on that page only.
- `docs/factory/README.md` console section says: open `http://127.0.0.1:7864`, it is always live.

## Slice 2 report, 2026-09-09, uncommitted in this tree

Built: `tools/console/src/serve.mjs` (zero-dependency `node:http`, renders every room on request
from `readRepo`, `GET /events` server-sent events, `fs.watch` on this tree's factory files, every
worktree's issue folder and the common git dir, a 30-second rescan for new worktrees, `/health`,
loopback only, second instance exits 0 with "already running"). `console.cmd` and `console.ps1` at
the repository root start it if needed and open the browser.

Proven by hand:
- `/health` answers `ok <pid>`; `/`, `/docs/docs--glossary.html` render; an unknown path is 404;
  the served console page carries the EventSource listener and no meta refresh.
- A second `serve.mjs` on the same port printed "already running" and exited 0.
- `curl -N /events` received `data: reload` after `touch` on an issue file in the root tree while
  the service ran from this tree. Two touches 200 ms apart produced two reloads with a 500 ms
  debounce, because Windows batches directory notifications; the debounce is now 800 ms. The
  criterion "exactly one reload per burst" is therefore not yet proven; the implementer must
  re-run the two-touch test and record the count.
- Not yet done: the SessionStart hook that starts the service (hooks are being moved by issue 93;
  wire it there or after), the `node:http` request-handler test against a fixture repo, and the
  two-tree live-reload proof with a status change in a worktree's issue file.

## Slice 2 closeout, 2026-09-09

The four remaining gaps from the report above are closed.

`serve.mjs`'s `render()` took `readRepoFn` as its second argument, default `readRepo` (the real
IO), so a test can hand it a fixture repo instead. `createConsoleServer()` took the same option,
`{ readRepoFn }`, and passes it through. `tools/console/test/run.mjs` starts that server on
`server.listen(0, '127.0.0.1')`, drives it with `node:http` against a fixture repo built from the
existing test fixtures, and closes it: `/health` answers `ok <pid>`; `/` answers 200 with the
`EventSource` script and no `<meta http-equiv="refresh">`; an unknown path answers 404; `/events`
answers 200 `text/event-stream` and a connected client receives `data: reload` once `broadcast()`
is called. Proven fail-first: flipping `/health`'s reply to `ok ${process.pid + 1}` failed the
`GET /health` check; restored, it passed again. Checkpoint 4 found the fixture-content claim in
this paragraph wrong: no check pinned it, and no fixture carried that title. Corrected in
"Checkpoint 4 fixes" below, with the real check and its own fail-first proof.

Slice 1's chain (`generate.mjs`, bottom) is now `chainDecision(repoPath, commonDir, noChainEnv,
rootGenExists)` in a new file, `tools/console/src/chain.mjs`: a pure function, no `fs`, no
`child_process`, so it needs no real git checkout. `generate.mjs` does the IO (`git
rev-parse --git-common-dir`, `existsSync`) and hands the results in. Four cases pinned in
`test/run.mjs`: it chains from a worktree to the root tree's generator path; it does not chain
when the repo path already is the root tree; it does not chain when `VERSTAAN_CONSOLE_NO_CHAIN` is
set; it does not chain when the root generator file does not exist. Proven fail-first: forcing
`chain` to `false` unconditionally failed the "chains from a worktree" case only (the other three
were already asserting `false`, so they stayed green, which is itself informative — the case that
actually exercises the true branch is the one that caught it); restored, all four passed.

Run by hand from this worktree, `node tools/console/src/serve.mjs --port 7899`, against the ROOT
tree `D:\SourceCode\private\verstaan`, `curl -N http://127.0.0.1:7899/events`:

- A status change in a root-tree issue file reached the service running from this worktree.
  `docs/factory/issues/07-mirror-public-pages-and-wiki.md`'s `status:` went `open` →
  `in-progress` at 15:05:18.771 local; `/events` carried `data: reload` well inside one second;
  the next `GET /quests.html` showed `quest-card--in-progress` and "fighting" for issue #07. The
  file was reverted with `git checkout --` immediately after, and the root tree is clean. A
  title-only edit (no status change) does not propagate this way, by design:
  `mergeIssuesAcrossWorktrees` in `read.mjs` keeps whichever tree's copy has the more advanced
  status and keeps the running tree's own copy on a tie, so a same-status edit made in a tree the
  service is not running from is invisible until its status changes or its branch is read as the
  service's own tree. That is existing, tested behaviour (issue 91's fix), not something this
  quest changes.
- Two edits 200 ms apart, `docs/factory/issues/08-mirror-unlarium-exports-all-languages.md`'s
  `status:` `open` → `in-progress` → `open`, produced two `data: reload` events on the first
  attempt, with an unrelated edit (a `git checkout` revert of the file above) still settling in
  the same debounce window — that is a genuine two-events case (two separate reload-worthy
  changes, correctly not merged into one), not a burst-collapse failure. Isolated from any prior
  edit, with the SSE client connected first and the burst run at least two seconds after any other
  change, the same two-edits-200-ms-apart burst produced exactly one `data: reload` event, run
  four times in a row (three during diagnosis with `fs.watch` callbacks logged, one clean final
  run). The 800 ms debounce holds for a genuine single burst; the earlier "still two" reading in
  the prior report conflated a burst with a leftover pending timer from an edit made just before
  it. No code change was needed once the two were told apart. `console.cmd`/`console.ps1` were not
  touched; the service was stopped (`kill`) after each run and `curl -m 2 /health` timed out
  afterward, confirming no process was left listening on 7899.
- The `SessionStart` hook (`tools/factory/hooks/console_serve.sh`,
  `tools/factory/tests/test_console_serve.py`, 5 tests) already existed in this tree from the
  93/94/96 rebase; `docs/factory/README.md`'s console section now says the hook starts the service
  at the beginning of a session, from the root tree, if nothing already answers on the port. The
  wrapper under `.claude/hooks/` and its `.claude/settings.json` entry remain hand-applied by the
  owner, per the snippet above; this quest does not touch `.claude/` directly.

Gates run from this tree: `node tools/console/test/run.mjs` — all green, 67 checks including the
11 new ones above (4 `chainDecision` cases, 7 request-handler cases). `python -m pytest tools/factory/tests -q` — 81 passed. `python -m
tools.validate --changed` — exits 0, no output.

## In line with 93, 94 and 96, 2026-09-09

The branch was rebased onto `main` after those three merged; only `docs/factory/README.md`
needed an automatic merge. What each one changed for this quest:

- **93, hooks as tracked scripts.** The SessionStart starter is `tools/factory/hooks/console_serve.sh`
  with `tools/factory/tests/test_console_serve.py` (five tests, a stubbed `node` on a hermetic
  PATH). The wrapper under `.claude/hooks/` is hand-edited only, so the owner applies these two
  by hand when the PR merges:

  `.claude/hooks/console-serve.sh`:
  ```
  #!/usr/bin/env bash
  # Tier: rendering, never blocking. Trigger: SessionStart. Wrapper only. The logic is
  # tools/factory/hooks/console_serve.sh (tests: tools/factory/tests/test_console_serve.py).
  # This file is edited by hand, never by an agent.
  exec bash "$(dirname "$0")/../../tools/factory/hooks/console_serve.sh"
  ```
  and in `.claude/settings.json`, a second entry under `SessionStart` beside `refresh-console.sh`:
  ```
  { "type": "command", "command": "bash \"${CLAUDE_PROJECT_DIR}/.claude/hooks/console-serve.sh\"", "timeout": 15 }
  ```
  The two existing refresh scripts (`refresh_console.sh`, `console_refresh.sh`) keep regenerating
  the file console; they and the service do not conflict, because the service writes nothing.
- **94, CI parity and GitHub as the only merge path.** `/gate` step 3 runs `node
  tools/console/test/run.mjs`, which had been outside it. Checkpoint 4 found the step landed in
  the `build` matrix job (`gate.yml`), not `lint` as this paragraph first said, so it runs once
  per matrix leg (windows-latest/msvc, ubuntu-latest/clang, ubuntu-latest/gcc) with whatever
  Node the runner image ships — not the "20 or later" the acceptance criteria promise. Fixed by
  adding `actions/setup-node@v4` with `node-version: "20"` to the `build` job, ahead of that
  step, rather than moving the step or weakening the claim. This quest ships as a pull request
  from its branch like every other; `mirror_github` writes `github_issue`.
- **96, require-gate reads the command correctly.** Nothing to change here; the root tree
  fast-forwards from `origin/main` after this PR merges, as 96 allows.

## Checkpoint 4 fixes, 2026-09-09

A verifier read the whole diff. It found ten defects. Two could take the service down. All ten
are fixed in this tree, uncommitted, same as the rest of this quest.

**1, a removed worktree spun the watcher forever.** `watchDirectory()` in `serve.mjs` now checks
`existsSync` inside its own callback. Once the watched directory is gone, it closes itself and
drops itself from the watcher list. It calls back once more for the removal, then never again.
`debounce()` gained a `maxMs` argument. `broadcast` is now `debounce(fn, 800, 2000)`: a
continuous stream of writes still delivers a reload at least every 2 s, never zero. Tests: a
watcher whose directory disappears stops calling back and removes itself; a stream of calls every
40 ms for 500 ms with `debounce(fn, 500, 150)` still fires more than once. Fail-first: the naive
watcher (no `existsSync` check) failed both new checks. The naive debounce (no `maxMs`) failed the
maximum-wait check. Both restored and green.

**2, `GET //?q=1` killed the service.** `new URL(req.url, ...)` now runs inside the handler's own
`try`; a parse failure answers 400. The method is checked first: only `GET` and `HEAD` render;
anything else answers 405. Tests: a raw socket sending the literal request line
`GET //?q=1 HTTP/1.1` gets 400, and `/health` still answers afterward. `POST /` gets 405.
Fail-first: reverting the `try` to its old position crashed the whole test process with the same
`ERR_INVALID_URL` the verifier reported — a stronger failure than one red check, and proof the
fix meets the exact defect. Removing the method check let `POST /` through with 200. Both
restored and green.

**3, the `watchPaths` test could not fail.** It ran against a fixture directory with no `docs/`
tree, so the assertion reduced to the one unconditionally-added common-dir entry. Rewritten
against a real directory shape: a root tree, a worktree and a common git dir, each populated, so
every `add()` in `watchPaths` is exercised. Fail-first: removing the four `add()` lines the
verifier named (root issues, `docs/factory`, `docs`, every worktree's issues folder) failed the
new check; restored, it passed.

**4, the request-handler tests did not prove they used the fixture, and the closeout cited a
check that did not exist.** There was no `Fixture Title Marker` check. No fixture carried that
title. That sentence is corrected above. A real check now pins two fixture-only titles (`First`,
`Side thing`, from `tools/console/test/fixtures/`) in `/quests.html`'s response. Fail-first:
changing `render(p, readRepoFn)` to bypass the injection — the exact seam the verifier named —
and reading the live repo instead failed that check, and the two caching checks below too (the
live `readRepo()` is slow enough that the test process needed backgrounding to finish). Restored,
all green.

**5, every page view cost two full repository scans.** Measured against the live service before
this fix: `/health` 0.037 s, `/favicon.ico` 404 in 6.39 s, `GET /` 200 in 8.31 s. Two changes.
`render()` now checks the path shape first (`routable()`) and returns `null` at once for anything
that cannot match, so an unmatched path never touches the model. The model (`readRepo()` +
`buildModel()`) is cached per server instance, invalidated by `onChange()` — the same raw watch
callback that queues `broadcast()`, not the debounced reload itself — so the first request after
a real change is never stale. Measured after, isolated from this session's own background file
activity (see the note below): cold `GET /` 6.36 s (unavoidable — the first request anywhere
must build the model once), `/favicon.ico` 404 in 0.002 s, cached `GET /` in 0.003 s. Test:
`fixtureRepoCalls`, a counter on the injected `readRepoFn`, is 1 after two requests, then 2 after
`onChange()` and a third request. Fail-first: removing the `if (!cache)` guard failed both cache
checks. Note: measuring the live, watcher-enabled service back-to-back in this development
session still showed repeat `GET /` as slow — 4.7 s, 9.1 s, 8.5 s. That is not a caching bug.
This session's own hooks and edits touch `docs/factory` between requests, and each touch
correctly invalidates the cache. Isolating the server (`createConsoleServer()` without
`startWatching()`) removes that noise; the cache then measures as above.

**6, `spawnSync` in the chain had no timeout.** `runChain()` (moved into `chain.mjs`, see 7)
passes `timeout: 15000` to `spawnSync` — the same budget the Stop hook that triggers this
generator run allows itself. A timeout is reported the same way as the non-zero exit it already
handled. Test: an injected `spawnSyncFn` returning `{ error: { code: 'ETIMEDOUT' } }` produces a
"timed out" message instead of silence.

**7, the chain's wiring line had no test and recomputed a path `chainDecision` already
returned.** `runChain(repoPath, commonDir, noChainEnv, opts)` moved from `generate.mjs` into
`chain.mjs`, next to `chainDecision`, with `existsSyncFn`, `spawnSyncFn`, `env`, `log` and
`logError` all injectable. It calls `existsSyncFn` once to build the decision, then `spawnSyncFn`
on `decision.rootGen` — the one path `chainDecision` returned, not a second guess. `generate.mjs`
now only calls `runChain(REPO, ..., ...)`; there is no path-building left in it to drift.
Fail-first: pointing `spawnSyncFn`'s call at a differently-built path failed the "spawns the same
path it existence-checked" check. Removing `timeout: 15000` failed the timeout check. Both
restored and green. This is what makes "Slice 1's chain stays and is exercised by the generator
test" true of the caller, not just of `chainDecision` alone.

**8, merging across worktrees can resurrect a deleted issue file — known cost, not fixed here.**
`mergeIssuesAcrossWorktrees`'s "surface a worktree-only file" rule (Slice 1) is what lets a new
quest show before its branch merges. The same rule surfaces a stale-named copy of a renamed issue
file from a worktree that has not caught up. A test pins this honestly: renaming quest 07's file
locally, while an old worktree still carries the pre-rename name, produces two entries for issue
7. Not redesigned — a rename-aware merge is outside this quest — recorded here as a known limit
of the slice-1 change, for whoever hits it next.

**9, the issue file described a service that was not built.** "Slice 2, the service" above is
marked superseded and corrected in place: 500 ms → 800 ms/2000 ms, a pid file → `EADDRINUSE` +
`/health`, `tools/console/serve.cmd` → `console.cmd`/`console.ps1`. The `gate.yml` claim under "In
line with 93, 94 and 96" is corrected too: the console test step is in the `build` matrix job,
not `lint`. `actions/setup-node@v4` (`node-version: "20"`) now pins the version the acceptance
criteria promise, added to the `build` job rather than the step moved.

**10, smaller things.** `serve.mjs`'s `PORT` no longer reads `args[0]` when `--port` is absent —
`node serve.mjs 9999` no longer silently changes the port; only `--port 9999` does. A 500 answers
a fixed `console: internal error`. The real exception, which can carry an absolute disk path,
goes to the server's own log only, never the response body. The 30 s rescan now prunes `paths`
entries whose directory vanished, on top of `watchDirectory`'s own self-close — belt and braces.
`console.cmd` takes an optional port argument (`console.cmd 7900`), matching `console.ps1`'s
`-Port`; its health probe now has `-m 2`, so a wedged service cannot hang the double-click. These
are hand-verified, not each covered by a new automated test — cheap fixes, matched to the
verifier's own "all cheap" framing.

Gates after these fixes: `node tools/console/test/run.mjs` — all green, 81 checks. 67 carried
over; 14 are new (2 debounce, 2 watcher self-close, 1 rewritten `watchPaths`, 5 `runChain`, 1
ghost-issue, 2 method/malformed-URL, 2 caching), plus the fixture-content check was rewritten.
`python -m pytest tools/factory/tests -q` — 81 passed, run from Git Bash. (PowerShell fails
twelve hook tests because `cat` is not on that PATH — a fact about the test runner's shell, not
this quest's code.) `python -m tools.validate --changed` — exits 0, no output.

Nothing here was worked around instead of fixed. No finding is disputed.

## Acceptance criteria

- `curl http://127.0.0.1:7864/` returns the console with every tree's issue status merged; a status
  change in a worktree's issue file is visible on the next request, shown with two trees. Only
  status merges across trees. The Library, Playbook and Glossary rooms come from the tree the
  service was started in, because `read.mjs` fixes `REPO` to the tree its own file sits in. Start
  the service from the root tree. ADR 0009 and the README console section record this.
- Editing an issue file in any tree triggers exactly one `reload` event within one second, shown
  with `curl -N /events`. Committing in a worktree triggers one too.
- A second `serve.mjs` on the same port exits 0 with "already running" and the pid.
- The SessionStart hook is idempotent across two sessions.
- No `npm install`, no dependency. `node --version` 20 or later is the only requirement.
- Tests: the SSE debounce and the watch-path list are unit tested; the request handler is
  tested with `node:http` against a fixture repo.

## Not in scope

Editing anything from the page. Remote access. HTTPS.

## Done when

- [x] The service runs from a SessionStart hook and the README names the URL.
- [x] The two-tree live-reload proof is in the report.
- [x] Slice 1's chain stays and is exercised by the generator test.
