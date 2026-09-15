---
description: Regenerate docs/factory/STATE.md from the issue files and report exactly what is done and what is next. Safe to run from a cold session with no prior context.
---

1. Read every `docs/factory/issues/*.md` frontmatter. Do not read bodies.
2. Last completed = the highest-numbered issue with `status: done`, with its `commit`.
3. Next up = the lowest-numbered `status: open` issue whose `depends_on` are all done.
4. Branch / PR = `git branch --show-current`, `git status --porcelain | wc -l` dirty files,
   `git remote -v` (say "no remote" if empty), and whether
   `$(git rev-parse --path-format=absolute --git-common-dir)/verstaan-gate-stamps/$(git rev-parse HEAD)` exists.
5. Never rewrite `docs/factory/STATE.md` here, root tree or not. Read the file as it stands and
   print it as is. Only the merge path writes it, in its own commit
   `chore: refresh STATE.md after merging #NN into main`, made in the root tree right after
   `git pull --ff-only` (`.claude/skills/factory-run/SKILL.md` step 10,
   `docs/factory/git-workflow.md` "Pull requests").
6. Print STATE.md, then one line: `Resume with: /factory-run NN`.
6a. Run `node tools/console/src/generate.mjs` so `docs/factory/console/index.html` matches. If node
    is missing, say so in one line and carry on; the console is a rendering, not the state.
7. If a `status: done` issue has `commit: null`, or an open issue's `depends_on` names a missing
   issue, say so before anything else. Do not fix it; the human decides.
