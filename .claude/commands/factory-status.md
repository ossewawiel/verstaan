---
description: Regenerate docs/factory/STATE.md from the issue files and report exactly what is done and what is next. Safe to run from a cold session with no prior context.
---

1. Read every `docs/factory/issues/*.md` frontmatter. Do not read bodies.
2. Last completed = the highest-numbered issue with `status: done`, with its `commit`.
3. Next up = the lowest-numbered `status: open` issue whose `depends_on` are all done.
4. Branch / PR = `git branch --show-current`, `git status --porcelain | wc -l` dirty files,
   `git remote -v` (say "no remote" if empty), and whether `$(git rev-parse --git-dir)/verstaan-gate-stamp`
   equals HEAD.
5. Rewrite `docs/factory/STATE.md` in the four-field shape it has now, keeping the first-line comment.
6. Print STATE.md, then one line: `Resume with: /factory-run NN`.
6a. Run `node tools/console/src/generate.mjs` so `docs/factory/console/index.html` matches. If node
    is missing, say so in one line and carry on; the console is a rendering, not the state.
7. If a `status: done` issue has `commit: null`, or an open issue's `depends_on` names a missing
   issue, say so before anything else. Do not fix it; the human decides.
