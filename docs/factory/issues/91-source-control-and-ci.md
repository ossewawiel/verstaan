---
issue: 91
title: "Source control and CI: a GitHub remote that mirrors the issue files"
milestone: Side
status: done
depends_on: [1]
agent: implementer
agents: [implementer, docs-writer]
model: sonnet
effort: medium
checkpoint: 4
commit: 84eba27
worktree: null
github_issue: 14
---
## What

The local half of source control exists and is proven: milestone branches, one commit per issue,
the gate stamp, hooks that refuse a merge without it. This quest adds the remote half so the
project can take contributors: a GitHub repository, milestones and labels that mirror the issue
files, pull requests as the merge path, and GitHub Actions that run the same gate the hooks run.
The issue files stay the only truth. GitHub is a rendering of them, checked for drift, never the
other way round. That is the one deliberate difference from munserv, where labels drove state.

## Acceptance criteria

- **Remote.** `gh repo create` (owner's account, private until the owner says otherwise), `main`
  protected: no direct pushes, one approving review or the owner's own merge, required check
  `gate`. `origin` set; `/factory-status` shows it in the save point.
- **Mirror script.** `tools/factory/mirror_github.py` reads `docs/factory/issues/*.md` and makes
  GitHub match: one milestone per `milestone:` value, one issue per file titled `#NN title` with
  the body from `## What` and `## Acceptance criteria`, labels `milestone:M1`, `agent:implementer`,
  `status:open|done`, `checkpoint:n`. Idempotent. Writes the GitHub issue number back into the
  file as `github_issue:`; that is the only field it may write. A closed local issue closes the
  GitHub one; a closed GitHub issue never changes a local file, it is reported as drift.
- **Drift check.** `mirror_github.py --check` exits non-zero when GitHub and the files disagree,
  listing each difference. **Prove it fails** by closing a GitHub issue by hand.
- **Pull requests.** `git-workflow.md` updated: a milestone branch opens a draft PR at its first
  push with the template `.github/PULL_REQUEST_TEMPLATE.md` (Summary · Issues closed ·
  Gate report · Verifier report · Checklist). `gh pr ready` stays behind the gate stamp via the
  existing hook.
- **Actions.** `.github/workflows/gate.yml` runs on every PR and on `main`: a matrix of
  windows-latest (MSVC), ubuntu-latest (clang, gcc), each running the `/gate` steps that exist
  at the time (format, build, ctest, pytest, validate; tidy and equivalence when their issues
  land). The job is named `gate` so branch protection can require it. Under fifteen minutes.
- **Labels file.** `.github/labels.yml` importable with `gh label` and applied by the mirror.
- **Issue templates.** `.github/ISSUE_TEMPLATE/` with one template that says: open a
  `docs/factory/issues/NN-*.md` in a PR instead, and links the playbook. Outside contributors
  propose issues as files, the same as everyone.
- **CLA check.** A workflow step that fails a PR whose author's name is absent from
  `CONTRIBUTORS.md`, with a message pointing at `CLA.md`. Skipped for the owner.
- **Changelog.** `git-cliff` config at `.github/cliff.toml`, conventional commits already in use,
  `CHANGELOG.md` regenerated on a `v*` tag by a workflow. Not hand-maintained.
- **Secrets.** No token in any file. `GH_TOKEN` from the environment for the mirror; the Actions
  use the built-in token. A grep for `ghp_` and `github_pat_` in the repo is part of `/gate` step 1.

## Not in scope

Deploying anything. Releases beyond the changelog. Bitbucket or GitLab. Sonar.

## Done when

- [x] The mirror runs from a clean state and GitHub shows the same issues and milestones the files do (15 issues, 3 milestones: this file, 91, did not exist when "14" was written).
- [x] The drift check's failing run and passing run are in the report.
- [x] `gate.yml` is green on all three matrix legs for the current `main`, proven with a throwaway smoke-test PR (#16, closed unmerged) carrying only `gate.yml`; `main` has no `CMakePresets.json` yet (M0 issues 02+ have not merged), so the build/test steps report and skip cleanly rather than fail on missing scaffolding — see the report for the run and the limitation.
- [x] `SPEC.md` §6 lists `github_issue` in the issue schema, and `PLAN.md` §5 and §9 no longer say "once a remote exists".
