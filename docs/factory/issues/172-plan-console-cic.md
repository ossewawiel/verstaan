---
issue: 172
title: "Write the M7 Console CIC issue files from the interrogation brief and ADR 0014–0016"
milestone: M7
status: open
depends_on: [164, 165]
agent: docs-writer
agents: [docs-writer]
model: sonnet
effort: low
checkpoint: null
commit: null
worktree: null
github_issue: null
---
## What

`PLAN.md` §7 has an M7 Console CIC row with issue range 172–178 and no issue files under it. The
line was decided on 2026-09-16 through `/interrogation-time` and `/create-map`: the brief and its
handoff sit under `docs/decisions/2026-09-16-console-as-cic/`, and the three settled choices are
ADR 0014 (the console needs the network), ADR 0015 (the atlas is a hand-authored file with a
validator in the gate) and ADR 0016 (the console runs a quest as an Agent SDK session). The owner's
ask, 2026-09-16: "the console as a CIC, the repo as a fleet"; a bridge that lands, a hand-drawn
atlas with fog of war, a codex that renders issue files as briefings, a ship-systems room that
shows the factory's own agents, skills and hooks, and under it a harness that runs a quest and
shows each checkpoint as a card.

After this quest, six issue files exist, 173 to 178, one per quest in the handoff's table and in
its order: bridge (S), flight deck staged L1 then L2 (M), ship systems (M), codex and debrief (M),
atlas with the `map.yaml` validator (L), harness with the `quest-run` kind (L). Each file is
written through `/quest`, one call per file, so it carries the loadout `/quest` works out and a
`depends_on` that chains the six in order and names the console quests they build on (99, 100,
162, 164, 170). This quest is the shape issue 12 had for M2: it writes the files and starts no
work.

## Acceptance criteria

- Six files `docs/factory/issues/173-*.md` to `178-*.md`, `milestone: M7`, `status: open`, every
  frontmatter key from `SPEC.md` §6 present.
- Each file's `## Done when` is the handoff table's "Done when" cell for that quest, expanded to
  checkboxes a closing commit can tick one by one.
- Each file's `## What` cites the ADR it implements: 173 and 174 cite 0014 and 0016; 175 and 176
  cite none beyond the brief; 177 cites 0014 and 0015; 178 cites 0016.
- 174 names the `quest-start` kind as a row in `kinds.ts` with `shell: false` and a 400 test for an
  unknown kind. 178 names `quest-run`, `canUseTool`, the session id on the job record, the restart
  gate exemption, and the cost line in the job log.
- 177 names `docs/factory/map.yaml`, its `SPEC.md` schema line, the validator under
  `tools/factory/`, and the gate step that runs it, and lists the three tile states from ADR 0015.
- `depends_on` chains 174 on 173, 175 on 173, 176 on 175, 177 on 176, 178 on 174 and 177, and
  every file also lists the done console quests its room extends.
- `python -m tools.validate --changed` exits 0 with all six files in the diff.
- `STATE.md` shows #173 as the next main quest under M7.

## Not in scope

- Starting any of 173 to 178. That is `/factory-run`.
- Writing `docs/factory/map.yaml` or its validator. That is 177.
- Any change to `apps/console/`, `kinds.ts`, `restart.ts`, an ADR, or `PLAN.md` §7.
- Adding a party member. ADR 0016 says the harness runs the same agents the terminal runs.

## Done when

- [ ] Six new issue files, 173 to 178, each written through one `/quest` call.
- [ ] `python -m tools.validate --changed` exits 0.
- [ ] `STATE.md` shows #173 as next.
- [ ] `python -m tools.factory.mirror_github` has filled `github_issue:` on all seven files.
