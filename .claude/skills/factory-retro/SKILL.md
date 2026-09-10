---
name: factory-retro
description: Reads docs/factory/lessons.jsonl, proposes promoting repeated failures into real rules (a gate, a skill note, a standards line), and proposes pruning stale ones. Never applies a change without human approval. Use when /factory-retro is invoked, typically once mid-milestone and once before a merge.
---

Propose only. Wait for a yes per proposal. Apply each approved change in its own
`chore: retro` commit.

1. Read `docs/factory/lessons.jsonl`. Each line: `{"sig","stage","issue","ts","detail"}`.
2. Group by `sig`. Count.
3. For every `sig` with count ≥ 3: propose one rule. Prefer, in order: a gate step, a line in the
   relevant agent file, a line in a `docs/standards/*.md`, a line in a skill, `CLAUDE.md` last.
   Show the exact diff.
4. For every `sig` whose last `ts` is older than two milestones and whose rule already exists:
   propose deleting its lines from the ledger.
5. Present all proposals. Wait. Apply only the ones approved, each in its own `chore: retro` commit
   that also removes the promoted lines from the ledger.
6. Never rewrite an agent's or skill's rules without approval: an agent that silently rewrites its
   own instructions drifts, and the thing that would notice is the thing that drifted.
