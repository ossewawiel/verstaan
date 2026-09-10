---
issue: 107
title: "Playwright as an MCP plugin: a Claude Code session in this repo can drive a real browser"
milestone: Side
status: open
depends_on: []
agent: implementer
agents: [implementer, docs-writer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: null
github_issue: null
---
## What

`apps/console` already has Playwright as an npm dev dependency: real specs under
`apps/console/e2e/`, run by `npm run test:e2e` and by the `gate.yml` CI job. That suite drives
the built console app in a browser Playwright launches and tears down itself; nothing in the
repo lets a Claude Code session reach into a browser directly, for anything outside that one
test run. The owner, 2026-09-10: "we still need to add playwright as a plugin here."

After this quest, a Claude Code session opened in this repo has a Playwright MCP server
available, project-scoped, so any session can open a page, click, screenshot and read console
output while working here, the way the `run` skill already drives the app itself but without a
visual layer. This is a separate thing from the `apps/console` e2e suite, which keeps testing
the console the way it does today; the MCP plugin is a tool for the session, not a test runner.

## Acceptance criteria

- A project-scoped MCP config (`.mcp.json` at the repo root, or wherever Claude Code's own docs
  say project-level servers live) declares a Playwright MCP server.
- A fresh Claude Code session started in this repo lists the Playwright MCP server's tools
  (`claude mcp list`, or the deferred-tools system reminder names it).
- The config does not require a secret or a personal credential; it starts an MCP server that
  launches its own browser.
- `CLAUDE.md`'s "Where things live" table, or `docs/factory/playbook.md`, says the plugin exists
  and what it is for, and says explicitly that it is not the `apps/console` e2e suite.

## Not in scope

- Any change to `apps/console/e2e/`, `apps/console/playwright.config.ts`, or the `test:e2e` step
  in `gate.yml`. That suite is untouched.
- Wiring the local `/gate` skill to run Playwright e2e tests itself; that is a separate quest if
  the owner wants it.
- Any other MCP server. This quest is Playwright only.

## Done when

- [ ] `.mcp.json` (or the equivalent project-level Claude Code config) declares the Playwright
      MCP server.
- [ ] A fresh session in this repo can list and use at least one Playwright MCP tool.
- [ ] `CLAUDE.md` or the playbook documents the plugin and distinguishes it from the e2e suite.
