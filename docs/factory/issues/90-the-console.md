---
issue: 90
title: "The console: a local CIC page rendered from the issue files"
milestone: Side
status: open
depends_on: []
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
---
## What

A side quest pulled forward from Post-M6 on 2026-09-08. `tools/console` is a zero-dependency
Node script that reads `docs/factory/issues/*.md` frontmatter, `git` state, the gate stamp and
`lessons.jsonl`, and writes `docs/factory/console/index.html`, openable from `file://`. It wears
bob's Colonial CIC skin. It never invents state: every number on the page traces to a file or a
git command. Its top panel is one next move to type and one side task under ten minutes that
only the owner can do.

## Acceptance criteria

- `node tools/console/src/generate.mjs` writes `docs/factory/console/index.html` and copies
  `theme.css`. No `npm install`, no `fetch()`, no ES-module `import` in the page.
- The page shows, from files only: the main quest (current milestone branch and its issues with
  glyph and label), side quests (open issues whose milestone is `Side` or `Post-M6` with
  dependencies met), the party (each agent's model and effort from its frontmatter), the save
  point (HEAD, dirty file count, stamp status), and the ledger as an experience bar (lessons by
  signature, promoted count).
- The next-move rail names one command. Its logic matches `/factory-status`: lowest open issue
  whose dependencies are done.
- The side task is chosen from: an issue file with a `review: pending` row in its test-cases
  companion, a `lessons.jsonl` signature at count three or more, an open checkpoint. If none,
  the panel says so in one line.
- All repo content reaches the DOM through `textContent`. The data island unicode-escapes `<`,
  `>` and `&`. A test proves an issue title containing `<script>` renders as text.
- Status never rides on hue alone: glyph and label on every status.
- Voice: `docs/standards/voice.md`. No cheering, no exclamation marks.
- `node tools/console/test/run.mjs` runs the parsers against fixtures and exits non-zero on a
  mismatch. **Prove it fails** on a bad fixture.

## Not in scope

Editing anything from the page. Charts beyond the burn-up bar. A server.

## Done when

- [x] Generated page opens from `file://` and shows this issue as a side quest.
- [x] Parser test green, and its failing run is in the report.
- [x] `docs/factory/README.md` gains a two-line pointer to the console.

## Report, 2026-09-08

Built in the planting session, before the first commit exists, so `status` stays `open` and
`commit` stays `null` until the owner makes the repository's first commit. Then a
`chore(#90): close` commit flips it.

- Tests: `node tools/console/test/run.mjs` is green, fifteen checks. Failing run proven by
  flipping fixture `90-side.md` to `status: done`: two checks failed, exit 1. Fixture restored.
- One test was wrong on first run: it looked for a bare `<script>` string that the page never
  contains. The escaping itself was correct. The assertion was fixed, not the code.
- Look: viewed once over localhost at 1280 px. Five tiles wrapped with one orphan; tile minimum
  width reduced so five fit at the room width. Playwright blocks `file://`, so the `file://`
  criterion is proven by the page having no `fetch()` and no module import, as the code shows.

Extended the same day, at the owner's request, from one page to five rooms: Quests (every issue
file whole), Playbook (`docs/factory/playbook.md`), Library (every project document rendered
through a small Markdown renderer in `tools/console/src/markdown.mjs`, with backtick paths
linking across pages), and Glossary (`docs/glossary.md`, now the one source `SPEC.md` §2 points
to). The renderer escapes everything first and blocks non-http link schemes; both are tested.
Two renderer tests were wrong on first run, not the renderer: one expected a newline the output
does not emit, one used a URL with parentheses the link pattern does not claim to support.

Later the same day the owner found the console stale after a commit. Cause: it was committed
output showing live git state, so every commit made it one commit old. Fix: `docs/factory/console/`
is gitignored and untracked, and `.claude/hooks/refresh-console.sh` regenerates it on
SessionStart, on PostToolUse for doc, issue, agent, skill and command files, and from
`gate-fast.sh` on every Stop. `tools/console/install-git-hooks.sh` adds post-commit,
post-checkout and post-merge hooks per clone. The PostToolUse filter was checked: a `.cpp` edit
is skipped, an issue edit regenerates.
