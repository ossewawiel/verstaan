# Console-as-CIC — handoff to `/create-map`

Agent-facing. Read this, then `interrogation.html` in this folder (commit 8a6b9bc). The brief is
the record; this file is what a cold session needs to start stage 2 without re-interrogating.

## Status

- Interrogation: complete, six turns, 2026-09-16. Fifteen answers, one recommendation.
- `/create-map` stage 1 (interrogate) is done. Start at stage 2 (decide). Do not run
  `/interrogation-time` again on this seed.
- Not yet in `PLAN.md §7`. Not yet an ADR. No issue files exist.

## The decision, in one paragraph

Keep the amber-on-hull chassis (quests 99, 116, 164, `apps/console/DESIGN.md`). Above it, four
rooms: a bridge that lands, a hand-drawn atlas with fog of war, a codex that renders issue files as
briefings, and a ship-systems room that shows the factory's own agents, skills, hooks and encounter
path. Under it, the console server becomes the harness that runs a quest as an Agent SDK session and
renders each checkpoint as a card. Option names from the brief: **E** (shape), **M1** (atlas),
**L4** (harness) reached through **L1** and **L2**.

## Six quests, in this order

| # | Quest | Size | Done when |
|---|---|---|---|
| 1 | Bridge | S | Cold visitor names the next quest and last event without scrolling; boot sequence runs once per load, honours `prefers-reduced-motion`. |
| 2 | Flight deck, staged | M | L1: Launch copies `claude --model <m> "/factory-run NN"` from front matter. L2: `quest-start` in `kinds.ts`, one argv template per platform, `shell: false`, refused during restart. Test proves an unknown kind is 400. |
| 3 | Ship systems | M | Read-only room from `.claude/agents/`, `.claude/skills/`, `.claude/commands/`, `.claude/hooks/`, `settings.json` hook events, `playbook.md` encounter path as a lane. Adding an agent file appears on next load with no console change. |
| 4 | Codex and debrief | M | Issue as briefing: objective, intel (linked ADRs, glossary), loadout, orders, after-action. Debrief groups `lessons.jsonl` by `sig`; Promote is a job kind that runs `/factory-retro` and writes nothing until approved. |
| 5 | Atlas | L | `docs/factory/map.yaml`: seven milestone regions, one tile per issue prefix, x/y/size. Validator under `tools/factory/` in the gate. SVG under d3-zoom. Lit = `status: done` and commit on main. Cleared-for-jump = open PR with gate.yml green (GitHub). Contact = open, no PR. GitHub down: tiles still paint, bridge shows comms-lost. |
| 6 | Harness | L | `quest-run` kind calls `query()` from `@anthropic-ai/claude-agent-sdk`; `canUseTool` intercepts AskUserQuestion into a Jobs card; session id on the job record; restart gate exempts and resumes it. First run prints its cost line to the job log. |

## ADRs to write (stage 2)

1. The console needs the network; GitHub and the model are live dependencies. Revises the offline
   premise in ADR 0009 and 0010. Token from `gh auth token` at start, never a file in the repo.
2. The atlas is a hand-authored file with a validator in the gate.
3. The console runs a quest as an Agent SDK session; every checkpoint passes through `canUseTool`.
   Every action stays a row in `kinds.ts` behind the Host check (ADR 0011).

## §7 row to propose (stage 3)

One new milestone row for this line. Branch pattern per issue as §7 already says. Suggested name:
`Console CIC`; the six quests above are its issues, `/quest` assigns numbers.

`PLAN.md §6.6` still says the console "never writes to the repository; that is quest 100". Quest 100
is done; update that paragraph in the same commit as the ADRs.

## Glossary terms to add

bridge, atlas, tile, fog, contact, cleared for jump, boarding pass, orders awaiting, debrief, crew,
station, flight plan. One term, one meaning.

## Defaults carried, not decided

- Milestones are the atlas regions (Q4).
- Low density on the bridge, high in the codex (Q6).
- Open Space Opera vocabulary; Colonial terms (DRADIS, CIC, FTL) as chrome only (Q8).

## Unverified

- SDK runs from the console bill to the same plan as the terminal — the owner's statement.
  Quest 6's first run prints the cost line so it is seen once.
- A claude.ai artifact inside a console iframe — unknown, and no longer needed: the console
  links out (Q15).

## Sources a cold session may need again

- Agent SDK: `https://code.claude.com/docs/en/agent-sdk/user-input` (`canUseTool`),
  `/agent-sdk/sessions` (`resume`), `/agent-sdk/streaming-vs-single-mode`.
- Artifacts: `https://code.claude.com/docs/en/artifacts` — comments wake interactive or SDK
  main-loop sessions only.
- MCP timeouts: `https://code.claude.com/docs/en/mcp-servers` — main-loop tool calls background
  after 2 min; checkpoints belong in `canUseTool`, not a blocking MCP tool.
- GitHub check runs: `https://docs.github.com/en/rest/checks/runs`.
