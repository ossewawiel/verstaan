---
issue: 7
title: "Mirror the public pages, the wiki and the static grammar files"
milestone: M1
status: in-progress
depends_on: [6]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
github_issue: 7
worktree: .worktrees/m1-mirror
---
## What

`tools.mirror` fetches, without a login, every `index.php?unlweb=*` page, every wiki page through
the MediaWiki API (wikitext and rendered HTML, plus page metadata), and every file the pages link
under `/grammars/`, `/uploads/` and `/unlarium/*/export_*.php` that answers without a login. Files
land verbatim under `data/archive/{pages,wiki,grammars,exports}/` with a manifest line each.

## Acceptance criteria

- `mirror.toml` lists the sources with their licence URL as the page links it. The UNLarium page
  links CC BY-SA 2.5 CH; the terms page says 4.0; each manifest line records what its page links.
- One request per second, `User-Agent: verstaan-mirror (+repo URL)`, retries three times with
  backoff, never follows a link off `unlarchive.org`.
- Idempotent: a second run downloads only files whose `ETag` or content hash changed and appends
  manifest lines only for those.
- The MediaWiki export uses `action=query&prop=revisions` for wikitext and `action=parse` for HTML.
  Every wiki page also lists its `categories` in the manifest `title` field's sibling `extra`.
- The broken public dictionary export (`export_dic.php` returns a MySQL error as of 2026-09-08) is
  recorded as a manifest line with `status: error` and the error body, not skipped silently.
- A pytest with a recorded HTTP fixture proves the parser of `index.php?unlweb=dev` finds the
  commented-out GitHub link and records it as `note`.

## Not in scope

Logged-in exports (issue 08). Any interpretation of content.

## Done when

- [x] `data/archive/manifest.jsonl` has a line for every file present, and `sha256` matches.
- [x] Wiki page count and static file count are in the report.
- [x] Two consecutive runs; the second downloads nothing new. Shown.
