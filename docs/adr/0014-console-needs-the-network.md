# 0014 — The console needs the network; GitHub and the model are live dependencies

Date: 2026-09-16 · Status: Accepted

## Context

ADR 0009 and ADR 0010 both drew the console inside one boundary: loopback only, read from disk,
every asset shipped with it, nothing reached over the network. That premise held while the console
was a scoreboard. The console-as-CIC interrogation (`docs/decisions/2026-09-16-console-as-cic/`,
Q16) asked whether it still holds once the console paints a map and launches quests. The owner:
"no it then needs the network."

Two things the console must now show live nowhere on disk. GitHub alone knows pull-request state
and the `gate.yml` check run on each PR, and GitHub alone sees both of the owner's machines at
once; the Windows tree and the Linux tree each see only their own worktrees. The model is the
second dependency: a quest run from the console (ADR 0016) holds an Agent SDK session, and a
session is a network call for as long as it runs.

The mirror already solved the credential half. `tools/factory/mirror_github.py` reads `GH_TOKEN`
from the environment and nothing else; the console's job runner resolves that token with
`gh auth token` once per job that needs it (`apps/console/server/src/jobs/runner.ts`).

## Decision

- The console is a networked app. GitHub and the model are live dependencies, named as such. The
  offline premise in ADR 0009 ("every render is computed fresh from disk") and ADR 0010 (loopback,
  read-only, the owner's own machine) is revised to: loopback for listening, network for reading
  GitHub and running the model.
- Fonts, scripts and stylesheets still ship with the console. The network dependency is data and
  the model, never chrome. A page paints without a connection.
- The GitHub token comes from `gh auth token` when the server needs it, the way `runner.ts`
  already does for `mirror`. It is never written to a file in the repository and never held past
  the request that used it. The model credential is whatever the Agent SDK finds in the process
  environment, the same login the terminal uses.
- Loss of the network degrades one tier, never the page. Every tile on the atlas still paints from
  the issue files (ADR 0015); the "cleared for jump" tier, which only GitHub can supply, goes
  unpainted. The bridge shows one comms-lost chip and nothing else changes.
- GitHub is read for what the files cannot say: pull requests and check runs. It is never read for
  issue state, milestones or labels; the mirror writes those one way, and the files win.

## Consequences

- The bridge carries one more status: GitHub reachable or not. That check runs against the
  authenticated REST limit of 5 000 requests an hour; an unauthenticated console would hit 60 and
  go dark within minutes, so a missing `gh` login shows as comms-lost, not as an error page.
- The console's threat surface grows by one outbound direction. ADR 0011's rule stands unchanged
  on the inbound side: every action is still a row in `kinds.ts` behind the Host check. Outbound,
  the token never leaves the server process and never reaches the client.
- A machine with `gh` logged out runs the whole console except the cleared-for-jump tier and the
  mirror kind. That is the same degradation the mirror already has.
- Any Playwright test of the atlas or the bridge must run with GitHub stubbed; the gate never
  depends on GitHub answering.

## Alternatives rejected

- **Stay offline and cache GitHub through the mirror.** The mirror writes local to remote. Adding
  a reverse path writes PR state into files the console reads, which puts a second copy of GitHub's
  truth on disk with no owner. Rejected: the files stay the truth for issues, GitHub stays the
  truth for PRs, and neither copies the other.
- **A token file under `apps/console/`.** One line to write and exactly the thing CLAUDE.md
  forbids. `gh auth token` costs one subprocess and leaves nothing on disk.
