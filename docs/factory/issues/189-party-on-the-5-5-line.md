---
issue: 189
title: "The party, the validator and the console speak the 5.5 model line"
milestone: Side
status: done
depends_on: [103, 178]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: 4
commit: c7f90a8
worktree: null
github_issue: 292
---
## What

The factory still runs 4.x-era loadouts on the Opus, Sonnet and Haiku 5.5 line. Commit `12063b7`
taught `/quest` to propose `haiku`, `low` for a repeat quest. `QUEST_MODELS` in
`apps/console/server/src/jobs/kinds.ts:79` still lists only `sonnet` and `opus`, so the console
refuses to board that quest. `QUEST_EFFORTS` (`kinds.ts:102`) lacks `xhigh` and `max`, which the
SDK's `EffortLevel` already carries. `check_issue_loadouts` (`tools/validate/cli.py:268`) checks
that the three keys exist and never checks their values, so `effort: small` (issue 171) passed the
gate. `factory-run` says "Model and effort come from the issue frontmatter" and never says which
pass of a three-pass sequence gets them. `factory-run` step 1 and `.claude/agents/implementer.md`
name `msvc-debug`, while `gate_fast.sh` already switches presets on `uname`. The owner answered the
flight plan on 2026-10-27 (artifact `ABpFjeQsaoBXPoiwSiXoaV`, findings 01, 02, 04, 05) and chose
D4: "Pre-authorise tooling".

After this quest, one file, `docs/factory/loadouts.json`, lists the three models and five efforts.
The validator and the console both enforce it. The quest's loadout sets its first pass, and every
later pass takes its own agent file. A read-only `scout` at Haiku digests reference rules and
failing gate logs for the passes that cost more. `/gate` runs at Sonnet. A tooling quest with no
checkpoint and a green gate ships without the shipping question. The checkpoint is 4, because the
D4 rule changes the merge path.

## Acceptance criteria

- `docs/factory/loadouts.json` holds `models: [haiku, sonnet, opus]` and
  `efforts: [low, medium, high, xhigh, max]`.
- `python -m tools.validate --changed` exits 1 on a quest file with `effort: small` or
  `model: gpt`, and names the file and the value. A pytest under `tools/validate/tests/` proves
  each case, and one more proves `haiku` with `xhigh` passes.
- `QUEST_MODELS` includes `haiku`, and `QUEST_EFFORTS` includes `xhigh` and `max`. A server test
  fails when either list differs from `loadouts.json`. A `quest-start` request at `haiku` returns
  202 or 200 in `jobs.test.ts`, whichever the existing tests use for an accepted job.
- `factory-run` "Routing" says: the quest's `model` and `effort` set the first pass, the one named
  in `agent:`; every later pass takes its own agent file's `model` and `effort`. Every Agent call
  passes `model` and `effort` explicitly.
- `factory-run` step 6 copies `CMakeUserPresets.json` into the new worktree when the root tree has
  one. Its fast-gate line and `implementer.md`'s command list name the preset by platform, with the
  same `uname` switch as `tools/factory/hooks/gate_fast.sh`.
- `.claude/agents/scout.md` exists: `model: haiku`, `effort: low`, tools `Read, Grep, Glob, Bash`,
  no `Write` or `Edit`. Its two jobs are a reference digest before a rule-author pass and a digest
  of a failing gate log before a retry. Each digest stays under 100K input tokens, where the Haiku
  price stays at its lower rate. `factory-run` runs the scout before every rule-author pass, saves
  its digest to `.scout/NN.md` in the worktree, and names that path in the rule-author's brief.
  `.gitignore` holds `.scout/`.
- `.claude/commands/gate.md` frontmatter carries `model: sonnet`.
- `factory-run` step 10: a quest with `checkpoint: null`, `agents: [implementer]` only, and a
  green `/gate` runs "Gate, PR, merge" without `AskUserQuestion`. The hand-off note is still
  written. Any other quest asks, as today.
- PLAN.md §6.1 and §6.2 and the playbook's "Resource rules" name the Haiku tier, the scout, the
  per-pass rule and the D4 lane. The quest skill's loadout row proposes `xhigh` for engine core
  design and points at `loadouts.json`. SPEC.md §6's schema comment names `loadouts.json`.
- `python -m tools.validate --changed`, `python -m pytest tools/validate/tests -q` and the console
  server tests exit 0.

## Not in scope

The orchestrator's own model, issue 191. STATE.md from a script, issue 190. A Haiku trial for the
docs-writer, which the owner declined (D3). A prompt audit of the agent files for wording written
for older models. Moving any open quest to Haiku, which each quest's own run decides.

## Done when

- [x] `loadouts.json` exists, and the validator refuses a value outside it.
- [x] The console boards `haiku` and accepts `xhigh` and `max`, and a test pins the console lists
      to `loadouts.json`.
- [x] `factory-run` states the per-pass loadout rule.
- [x] `factory-run` and the implementer pick the preset by platform, and a new worktree gets the
      user presets.
- [x] `scout.md` exists, and `factory-run` routes it before every rule-author pass.
- [x] `/gate` is pinned to Sonnet.
- [x] `factory-run` step 10 carries the D4 lane.
- [x] PLAN.md §6, the playbook, the quest skill and SPEC.md §6 agree with the above.
