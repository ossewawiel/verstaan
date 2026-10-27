---
description: Regenerate docs/factory/STATE.md from the issue files and report exactly what is done and what is next. Safe to run from a cold session with no prior context.
---

1. Run `python -m tools.factory.status` in the tree this command runs in. One call replaces the old
   steps 1 to 4: the script reads that tree's `docs/factory/issues/*.md` frontmatter and its git
   state, and prints the four STATE.md fields: `Last completed:` (highest-numbered `status: done`
   issue, with its `commit`), `Next up:` (lowest-numbered open main-line issue whose `depends_on`
   are all done), `Branch / PR:` and `Resume with: /factory-run NN`. It writes nothing. Do not read
   issue frontmatter by hand and do not pick the quest by hand; the script is the calculation
   (`tools/factory/status.py`, same rules as `tools/console/src/parse.mjs`).
2. Never rewrite `docs/factory/STATE.md` here, root tree or not. Read the file as it stands and
   print it as is. Only the merge path writes it, in its own commit
   `chore: refresh STATE.md after merging #NN into main`, made in the root tree right after
   `git pull --ff-only` (`.claude/skills/factory-run/SKILL.md` step 10,
   `docs/factory/git-workflow.md` "Pull requests"). That path runs
   `python -m tools.factory.status --write` there, which writes `docs/factory/STATE.md` and no
   other file.
3. Print STATE.md, then one line: `Resume with: /factory-run NN`, taken from the script's output.
3a. Run `node tools/console/src/generate.mjs` so `docs/factory/console/index.html` matches. If node
    is missing, say so in one line and carry on; the console is a rendering, not the state.
4. If the script printed any `FAULT:` line (a `status: done` issue with `commit: null`, an open
   issue whose `depends_on` names a missing issue, or a frontmatter block that does not parse), say
   so before anything else. The script prints them first. Do not fix them; the human decides.
