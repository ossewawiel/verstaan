# 0011 — The console's actions run only allow-listed scripts, never a shell string from the client

Date: 2026-09-11 · Status: Accepted

## Context

Quest 99 gave the console a real server and client that only read: it renders `docs/`, the issue
files and git state, and it never writes anything back. Quest 100 lets the same page act — run a
gate, run a test label, sync to GitHub, start or stop a local service, kill a running job — which
is what turns a scoreboard into "a game console" (the owner, 2026-09-09). Every one of those
actions is a real process the owner would otherwise type into a terminal by hand: `cmake --build`,
`ctest --preset ... -L fast`, `python -m tools.factory.mirror_github`, `.claude/hooks/gate-fast.sh`.
The moment a server accepts a command from an HTTP request, the design question is not "does this
feature work" but "what happens the first time a request carries something other than what the
page's own buttons send" — a mistyped argument, a stale browser tab left open on a lab machine, a
CSRF-shaped POST from a page that isn't this one. The server binds to `127.0.0.1` only (issue 99),
which rules out a remote attacker; it does not rule out a local one, and it does not rule out a
bug in this project's own client sending something the server should refuse.

Two shapes were available for the job runner: build a shell command string from the request body
(kind, tree and args interpolated into one string, handed to `exec`), or keep a fixed table of
argv templates, one per named kind, and only ever fill in a value that already passed that kind's
own validator. The first is shorter to write and is exactly the shape that makes a command
injection possible: any character the validator missed — a `;`, a backtick, a `$(...)` — reaches a
shell that interprets it. The second cannot be injected into by construction: `child_process.spawn`
is called with `shell: false` throughout, so an argv slot only ever holds one string, never a
fragment of syntax a shell parses further.

## Decision

- `apps/console/server/src/jobs/kinds.ts` is a typed table, one entry per allowed kind
  (`gate-fast`, `gate`, `ctest`, `pytest`, `console-tests`, `validate`, `mirror-check`, `mirror`,
  `service-start`, `service-stop`, `worktree-list`). Each entry owns its own `validateArgs`
  function and its own `build(tree, args) => { cmd, args, cwd }`. A kind not in this table is
  refused with 400 before anything else runs; `POST /api/jobs` never accepts a `cmd` or a shell
  string from the client, only a `kind` name and a small, kind-specific `args` object.
- `apps/console/server/src/jobs/runner.ts` spawns every job with `child_process.spawn(cmd, args, {
  shell: false })`. There is exactly one call site. No job kind's `build` function is allowed to
  return a single joined string in place of an `args` array — the type (`Spawn.args: string[]`)
  makes that a compile error, not a convention someone has to remember.
- The two kinds that read a client-controlled string into a value that reaches a real command
  (`ctest`'s `label`, `pytest`'s `path`) validate against a closed set (`ctest`: the four labels
  `docs/standards/testing.md` names) or a path shape with no `..` and no leading `/` (`pytest`).
  Neither validator is a blocklist of dangerous characters; both are allowlists of shapes the
  value must match, which is the only kind of check that cannot be bypassed by a character nobody
  thought to blocklist.
- `gate` and `mirror`/`mirror-check` still run the real scripts the terminal runs
  (`tools/factory/hooks/gate_full.sh`, `.claude/hooks/gate-fast.sh`,
  `python -m tools.factory.mirror_github`), not a reimplementation. The job runner's job is to
  choose which fixed command to run and to supply its `cwd` and (for `mirror`) its `GH_TOKEN`; it
  is never the thing that decides what the gate actually checks. That stays under
  `tools/factory/`, tracked and tested on its own, exactly as ADR-less prior issues already
  established for the hooks.
- `service-stop` (and `service-start`) refuse the console's own name before validation reaches the
  allow-list at all (`namesConsole` in `kinds.ts`, checked in the route handler): a page that could
  kill the server serving it would leave no way back from that page, and only `console.sh` in a
  terminal or the SessionStart hook may start the console (quest 102).

## Consequences

- A new job kind means a new table entry with its own `validateArgs`, not a new `if` branch that
  touches string concatenation. Reviewing "can this be abused" is reviewing one function per kind,
  not the whole request-handling path.
- Two arguments the owner might reasonably want later — an arbitrary `ctest` label, an arbitrary
  shell one-liner for a one-off diagnostic — are impossible by design, not merely discouraged. A
  new label needs a one-line change to the allowlist in `kinds.ts`; an arbitrary shell command
  needs a different decision, made explicitly, not a bypass of this one.
- SSE output is still just text: a job's stdout/stderr lines are carried as `JSON.stringify`d
  strings inside `data:` fields (`routes.ts`), so a line a test tool prints containing `<script>`
  never becomes markup on the way to the browser. This is the same allowlist reasoning applied to
  the response side: the client only ever renders a line as a text node, never through
  `dangerouslySetInnerHTML`.

## Alternatives rejected

- **A shell string built from `kind`, `tree` and `args`.** Shortest to write, and the shape every
  well-known command-injection CVE in a local dev tool has taken. Rejected outright.
- **A blocklist of dangerous characters on `args`.** Cheaper than a typed table per kind, and
  reliably incomplete: a blocklist has to anticipate every shell metacharacter across every
  platform this ever runs on (`;`, `&&`, `|`, `` ` ``, `$()`, newlines, and PowerShell's own set),
  and the cost of missing one is silent. An allowlist of shapes (ctest's four labels; pytest's
  `tools/...` prefix) is smaller to reason about and cannot be extended by accident.
- **One generic "run this script under `tools/` or `.claude/hooks/`" kind, path chosen by the
  client.** Looks like it keeps the allowlist principle (only scripts under those two directories
  ever run) while covering every future need without a code change. Rejected: it reintroduces the
  same problem at the path level — any script anyone ever adds under those directories becomes
  remotely triggerable the moment this quest ships, including scripts nobody vetted for being
  callable this way. The fixed table means adding a kind is a reviewed, one-line decision each
  time, not a standing grant.
