# 0009 — The console runs as a Node service, not only a generated file

Date: 2026-09-09 · Status: Accepted

## Context

The console is the owner's lifeline, the one page that says where the project is. Quest 92 moved
work into worktrees, and the file-based console broke: a hook firing inside a worktree regenerated
that worktree's copy of the page, not the root tree's copy the owner keeps open, so the tab the
owner was watching went stale. Slice 1 of quest 95 chained the generator back to the root tree and
added a two-minute meta refresh, a patch. Slice 2 replaces the file with a small service,
`node tools/console/src/serve.mjs`, the way munserv serves its dashboard rather than writing files:
one URL, rendered on every request, with live reload pushed to the browser over server-sent events.

## Decision

- `node tools/console/test/run.mjs` joins the gate ladder: step 3 of `/gate`
  (`.claude/commands/gate.md:39`) and the `build` job of `gate.yml` (`.github/workflows/gate.yml:252`,
  not the `lint` job). Node becomes a gate dependency alongside Python and CMake. The workflow does
  not run `setup-node`, so CI uses whatever Node version the runner image ships, not a pinned one.
- A `SessionStart` hook, `tools/factory/hooks/console_serve.sh`, starts `serve.mjs` from the root
  tree if nothing already answers `http://127.0.0.1:7864/health`. The factory now runs a background
  process on the developer's machine, outside the request-response shape every other hook has.
- The service binds to `127.0.0.1` only. Every render is computed fresh from disk on each request;
  nothing is written and nothing on the page is editable, so there is no login to build or lose.
- The file-based generator, `tools/console/src/generate.mjs`, stays for a machine with no Node
  session running: it still writes `docs/factory/console/index.html` with a two-minute meta refresh.
  It is never committed and it is now the fallback, not the primary path.

## Consequences

- A machine without Node on `PATH` cannot run the full gate: `console_serve.sh` degrades quietly
  (it echoes a warning and exits 0, so the console stays file-based) but `node tools/console/test/run.mjs`
  in `/gate` and in CI has no such fallback and fails outright. Node 20 or later is now as required
  for a green gate as Python 3.13 and CMake, a change ADR 0008 did not anticipate and does not record.
- The background process outlives the session that started it. Closing a terminal, ending a Claude
  Code session, or the owner walking away does not stop `serve.mjs`; it keeps listening on 7864
  until the machine restarts or someone kills the process by hand. A stale build of the service can
  keep answering after the code that built it has changed, until the pid is killed and the hook
  restarts it on the next `SessionStart`.
- The port is loopback-only and nothing on it accepts a write, so skipping authentication is safe
  on a single-user machine but would not be on a shared one; the decision does not generalise past
  "the owner's own laptop, port 7864, nobody else on it".
- `serve.mjs` fixes the tree it renders from at module load (`REPO` in `tools/console/src/read.mjs:9`),
  the tree the file itself sits in, not the tree the process was started from in any other sense.
  Started from a worktree, it serves that worktree's Library, Playbook and Glossary rooms, not the
  root's, even though issue status is merged across trees. `console.cmd` is tracked at the
  repository root, so a copy of it sits in every worktree; double-clicking the worktree's copy binds
  the running service to that worktree's docs until it is killed and restarted from the root.

## Alternatives rejected

- **Keep the file-based generator alone, chained to the root tree.** Slice 1 of this quest already
  did this and it works, but every reader still waits up to two minutes for a stale page to refresh,
  and every hook firing still writes a file nobody asked to see change. It stayed as the fallback,
  not the answer, because "wait two minutes" is not "live".
- **Poll with a shorter meta refresh instead of pushing an event.** A one-second refresh would feel
  live but forces a full render on a timer regardless of whether anything changed, and still cannot
  merge a worktree's issue file into the root's copy without file-based chaining. Rejected in favour
  of `fs.watch` plus server-sent events, which renders only on an actual request and pushes a reload
  only when a watched path actually changes.
- **A real web framework with its own dependencies.** Express or similar would make routing and
  static files shorter to write, but the criterion in the issue is explicit: "no `npm install`, no
  dependency. `node --version` 20 or later is the only requirement." `serve.mjs` uses `node:http`
  and `node:fs` only, so the console never needs a lockfile or a supply-chain review of its own.
