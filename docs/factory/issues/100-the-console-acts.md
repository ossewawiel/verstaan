---
issue: 100
title: "The console acts: run gates and tests, start and stop services, sync GitHub, open anything"
milestone: Side
status: open
depends_on: [99]
agent: implementer
agents: [implementer, docs-writer, verifier]
model: sonnet
effort: high
checkpoint: 4
commit: null
worktree: null
github_issue: 32
---
## What

Quest 99 gives the console a real server and client that only read. This quest lets it act,
which is what makes it a game console rather than a scoreboard. The owner, 2026-09-09: "direct
links to testing, stop and start of services, syncing info with github etc. full game console."

Every action is a job: a named command the server already knows how to run, in a named tree,
with its output streamed to the page and its exit code shown. The page never invents a command
and never bypasses a gate; it runs the same scripts the terminal runs, so the rules in `SPEC.md`
§5 and the hooks still hold. Nothing here writes an issue file or any other repo content; that
is item 1 of the road list in `99-console-web-client.md`, and it has no quest of its own yet.

## Shape

- **Job runner** (`apps/console/server/jobs/`): `POST /api/jobs` with `{kind, tree, args}`
  from an allow-list, returns `{id}`; `GET /api/jobs/:id/stream` is SSE with stdout and stderr
  lines and a final `exit` event; `GET /api/jobs` lists recent jobs with status and duration;
  `DELETE /api/jobs/:id` sends SIGTERM. One job per tree at a time for gates; a second request
  queues with a reason shown.
- **Kinds, the allow-list**: `gate-fast` (the Stop hook's script), `gate` (the full ladder, as
  `/gate` runs it, writing the stamp only on success), `ctest --label <l>`, `pytest <path>`,
  `console-tests`, `validate --all`, `mirror --check`, `mirror` (sync to GitHub), `service start`
  and `service stop` for a local service other than the console itself, `worktree list`.
  Each kind maps to a fixed command template; `args` are validated against a schema per kind.
- **Two kinds carry an environment the terminal supplies by hand.** `mirror` and `mirror --check`
  run `python -m tools.factory.mirror_github` with `GH_TOKEN` set from `gh auth token`; the
  server reads the token at job start and never logs it. `gate` needs the gitignored
  `CMakeUserPresets.json` in the tree it runs in, so the job checks for the file first and
  fails with that as the reason instead of letting CMake fail on a missing preset.
- **Openers**: `GET /api/open` with `{what}` from `doc`, `artifact`, `tree`, `pr`, `issue`,
  `run` returns a URL the client opens: an in-app route for documents, a GitHub URL for pull
  requests, issues and CI runs, `vscode://file/<path>` for a tree or a file, the interrogation
  brief and other artifacts as in-app routes that serve the file read-only.
- **The client**: an Actions rail on the Console room with one button per kind for the
  current tree; a Jobs room with the live stream, colour by stream, exit code, duration, and a
  rerun button; every quest card gains "run its tests", "open its tree", "open its PR"; every
  tile that names a state gains the action that changes it (Gate stamp: run the gate; Remote:
  sync; Ledger: open the retro proposal).
- **Safety**: loopback only; a job runs as the same user; the allow-list is the only way to
  run anything; `gate` cannot be marked passed without the real stamp. The console cannot stop
  itself: a page that kills the server serving it leaves no way back from the page, and only
  `console.sh` in a terminal or the SessionStart hook starts it again (quest 102). `service stop`
  named on the console is refused, not confirmed.

## Acceptance criteria

- The allow-list is a typed table; a `POST /api/jobs` with any other kind is 400 with the
  allowed kinds named. Tested.
- `gate-fast` from the page in a worktree with a failing fast test streams the failure, exits
  2, writes the ledger line the hook would, and writes no stamp. **Proven by breaking a test.**
- `gate` from the page on a clean tree writes the same stamp `/gate` writes; `require_gate.sh`
  then allows `gh pr ready` for that commit. Proven.
- `mirror` from the page creates a missing GitHub issue and writes `github_issue` back; the
  page shows the drift check going from red to green. Proven with a throwaway issue file.
- `service stop` naming the console is 400 with the reason, whatever the body carries. Tested.
- `gate` in a tree with no `CMakeUserPresets.json` exits non-zero naming the missing file, and
  writes no stamp. **Proven by moving the file aside.**
- Openers: a document opens in-app; a tree opens VS Code; a PR opens GitHub. Each tested for
  the URL shape; the VS Code and GitHub ones exercised by hand and recorded.
- Two jobs requested for one tree run in order, the second shows "queued behind #id".
- Job output is escaped text; a test posts a line containing `<script>` and reads it back as text.
- Keyboard: every action reachable and confirmable by keyboard; destructive ones need Enter
  twice or a typed confirmation.
- ADR: actions run only allow-listed scripts, never shell strings from the client.
- `/gate` and CI green; verifier at checkpoint 4.

## Not in scope

Writing issue files or any repo content: item 1 of the road list in `99-console-web-client.md`,
still unquested. Stopping or restarting the console from its own page; its lifecycle stays with
`console.sh` and the SessionStart hook. Remote access. Running agents from the page, a later
quest once the job runner is proven.

## Done when

- [ ] The four proofs, gate-fast failure, gate stamp, missing preset, mirror sync, are in the report.
- [ ] The Actions rail and the Jobs room exist and are keyboard-complete.
- [ ] PR merged through the gate check.
