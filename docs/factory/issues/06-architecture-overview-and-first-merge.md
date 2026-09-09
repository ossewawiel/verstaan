---
issue: 6
title: "Architecture overview, sub-tree CLAUDE.md files, and the first gated merge"
milestone: M0
status: done
depends_on: [2, 3, 4, 5]
agent: docs-writer
agents: [docs-writer, verifier]
model: sonnet
effort: low
checkpoint: 4
commit: c3d04d4
github_issue: 6
---
## What

Bring `docs/architecture/overview.md` and the three sub-tree `CLAUDE.md` files in line with what
M0 actually built, run `/factory-retro` once, run `/gate` for real, let the verifier read the
whole `m0-foundation` diff, and merge into `main`.

## Acceptance criteria

- `docs/architecture/overview.md` describes the targets, presets and packages that exist, with
  no forward references that are not marked "planned for M<n>".
- `engine/CLAUDE.md`, `tools/CLAUDE.md`, `data/CLAUDE.md` each under 40 lines and pointing to
  the standards file, not repeating it.
- `/gate` passes and writes the stamp. Its report lists every step with time.
- The verifier's report is attached to this issue file under `## Verifier`.
- `main` contains the merge commit; `STATE.md` shows M1 issue 07 as next.
- The merge runs from the `m0-foundation` worktree, and once it lands, that worktree is removed
  from the root tree: `git worktree remove .worktrees/m0-foundation && git branch -d m0-foundation`.

## Not in scope

Anything in M1.

## Done when

- [ ] Merge done with `--no-ff`, stamp verified by `require-gate.sh` allowing the merge.
- [x] `lessons.jsonl` reviewed by `/factory-retro` on 2026-09-08: one entry, one signature, no
      proposal reached the count-of-three threshold. Nothing to promote or prune.
- [ ] `.worktrees/m0-foundation` removed and the branch deleted after the merge.

## Verifier (checkpoint 4)

Read `git diff main...HEAD` whole: 35 commits, 185 files, issues 01-05 plus side quests 90, 91, 92.
Merge base is `8075e96`; `main` carries three commits the branch does not (`9f5728a`, `d674778`,
`0b87cf9`). The gate was run by hand on `ba2500c` by the owner and every step passed; I did not
re-run it. Verdict: **block on findings 1 and 2, then ship.** Both sit in the merge machinery this
issue exists to exercise, not adjacent to it.

### 1 - The merge this issue must make cannot run, and three ways around the guard can

`require-gate.sh` compares the gate stamp to `HEAD` of the tree the merge runs in
(`.claude/hooks/require-gate.sh:35-40`). The stamp is written only for the tree `/gate` ran in
(`.claude/commands/gate.md`, last step). `m0-foundation` is checked out at
`.worktrees/m0-foundation`, so its stamp sits in `.git/worktrees/m0-foundation/verstaan-gate-stamp`
and names `ba2500c`. `main` is checked out in the root tree at `0b87cf9`.

A `--no-ff` merge into `main` has to run where `main` is checked out. Git refuses to check `main`
out a second time, so the acceptance criterion "the merge runs from the `m0-foundation` worktree"
has no command behind it. Run it where it can run, and the guard fires with exit 2 and
"require-gate: no gate stamp for HEAD, or dirty tree. Run /gate first."

Gating first does not help. `/gate` writes the stamp only when `git status --porcelain` is empty,
and the root tree reports `?? .worktrees/` and `?? docs/factory/console/` -- both ignored by the
`.gitignore` on this branch and by nothing on `main`. The root tree cannot be stamped until the
merge lands, and the merge cannot land until the root tree is stamped. `require-gate.sh` in its
current shape blocks every merge, in every tree, forever. Issue 01 recorded the failing runs
(missing stamp, dirty tree). The passing run -- the stamp allowing a merge -- was never possible,
so issue 01's "recorded passing run" box covers a case that does not exist.

The same probe against three neighbours of that command, run from the root tree:

```
git merge --no-ff m0-foundation  -> exit=2
git -C . merge --no-ff m0-foundation  -> exit=0
gh pr merge 1 --merge  -> exit=0
git pull origin m0-foundation  -> exit=0
```

The matcher keys on a segment that starts with the literal `git merge`
(`require-gate.sh:20-22`). `git -C` moves the word. `git pull` merges without the word. And
`gh pr merge` -- the merge path side quest 91 just made the normal one -- was never in the list.
An agent that hits the exit-2 message and reaches for `gh pr merge` instead is not fighting the
gate; it is walking around a door left open.

Fix before merging: match `merge` as a git subcommand rather than a prefix, add `gh pr merge` and
`git pull`, and give the stamp a merge case -- accept a stamp naming the tip of the branch being
merged, not only the current `HEAD`. Then record the passing run issue 01 could not.

### 2 - The GitHub mirror crashes on the first file it reads, and CI's drift check goes red with it

`tools/factory/mirror_github.py:127` globs `docs/factory/issues/*.md` and hands every hit to
`parse_issue_file`, which raises on a file with no frontmatter (`:106-108`).
`docs/factory/issues/04-test-cases.md` landed in `f859512` and has no frontmatter -- it is issue
04's test table, not an issue. Loading the directory raises
`MirrorError: docs\factory\issues\04-test-cases.md: no frontmatter block`.

`main()` catches it and returns 1 without touching GitHub (`:441-444`). Two things follow.
`.claude/skills/factory-run/SKILL.md` step 6 runs the mirror right after every close commit, so
issue 06's own close will print a failure and sync nothing. And `.github/workflows/gate.yml:209`
runs `--check` on every push and pull request; from this merge on it exits 1 every time, so the one
mechanism that notices GitHub drifting from the issue files is permanently red and tells you
nothing. The `mirror-check` job sits outside the required `gate` check by design, so nothing stops
the PR -- the drift just becomes invisible.

The console's reader already knows about this file: `tools/console/src/parse.mjs:34` skips
`/-test-cases\.md$/`, and `read.mjs:54` skips it again. Two readers of one directory, one of which
was never told. Give `load_local_issues` the same skip, or move the table under
`docs/factory/issues/04-test-cases/` where the glob cannot reach it.

### 3 - /gate step 0 cannot see the stubs it exists to catch

`gate.md` step 0 greps `engine/src` and `tools/` for `not_implemented`, and says "a hit means an
issue was closed on a stub". Every `Engine` method on this branch is a stub. Step 0 reports nothing
outside `tests/`.

The token lives in `engine/include/verstaan/engine.hpp:31,72` -- the enum value and the default
member initialiser on `Result::status`. `engine/src/engine.cpp` returns a bare `{}`. Step 0 does not
read `engine/include`. The whole M0 engine passes a check written to fail on exactly this, and
whether it fires depends on which file an implementer types the token into. An implementer who
writes `return {.status = Status::not_implemented};` in `engine.cpp` -- the more honest spelling --
turns the milestone red. Add `engine/include` to the scan path and add `--include=*.hpp`.

### 4 - The overview and the preset both say this machine has no g++; it built with g++ an hour ago

`docs/architecture/overview.md:38-39`: "`gcc-release` (present for machines with a MinGW g++; the
reference machine has none installed)". `CMakePresets.json:48` says the same at more length: "No
MinGW/gcc is installed on the reference machine, so this preset fails configure with one clear line
naming g++ as the missing compiler."

Commit `c30e01e`, three commits earlier on this branch, is titled "gcc-release and clang-release
presets never actually built until now". It reports MinGW g++ 16.1.0 on this machine, a modules
scanner disabled for its sake, and a triplet override needed to link gtest against it. The gate run
on `ba2500c` configured and built all four presets. Issue 06 is the issue that brings the overview
in line with what M0 built, and it copied forward a claim the branch it documents had already
disproved. A contributor reading this page concludes `gcc-release` is decorative and never tries it.

The same preset description also states its own reason backwards: "Uses vcpkg's `x64-mingw-dynamic`
triplet, not base's `x64-windows`: that triplet builds dependencies (gtest) with MSVC's ABI". The
triplet that builds with MSVC's ABI is `x64-windows`, the one being avoided. `overview.md:40` sends
the reader to that sentence for the explanation.

### 5 - CI's gate check runs less than /gate does, including a licence check that already works

`.github/workflows/gate.yml` covers step 0, the secret grep, `clang-format`, `ruff`, build,
`ctest -L fast`, pytest and `tools.validate --all`. It does not run
`python -m tools.validate --licences`, which `gate.md` step 1 requires and which issue 05 built and
proved. Concretely: a contributor's pull request adds `apps/service/src/main.cpp` with no
`// SPDX-License-Identifier: MPL-2.0` line. The `gate` check goes green, branch protection is
satisfied, and the only thing that would have caught it is the maintainer running `/gate` on his own
machine. One line in the `lint` job closes it.

Also absent from CI: `ctest` for the `golden`, `equivalence` and `tier` labels (only `-L fast`
runs), step 4 `clang-tidy`, and step 6 regenerate-and-diff. Issue 91's criterion says the workflow
runs "the `/gate` steps that exist at the time". Issue 05's licence check exists now, and this issue
is the milestone close-out where that reconciliation belongs.

### 6 - The changelog workflow opens a pull request that can never be merged

`.github/workflows/changelog.yml:37` opens the regenerated-changelog PR with
`secrets.GITHUB_TOKEN`. GitHub does not trigger workflows for events raised by that token, so the
`gate` workflow never runs on the `changelog/v*` branch. Branch protection requires the `gate`
check (issue 91's first criterion). Push `v0.1.0`, and the PR sits with "Required status check
`gate` is expected" until an administrator overrides it. Issue 91's report proves the PR opens
(#17) and records that it was closed unmerged, which is the half of the loop that works. Use a PAT
or a GitHub App token for `create-pull-request`, or exempt `changelog/*` from the required check.

### 7 - The merge resurrects the Stop hook main deleted

`.claude/settings.json` on this branch registers two hooks on `Stop`: `gate-fast.sh` and
`console-refresh.sh`. `gate-fast.sh:19` already calls `refresh-console.sh` itself, so the console is
generated twice on every stop. `main` removed `console-refresh.sh` and its `Stop` entry in `0b87cf9`
("drop the console-refresh hook in favor of the fuller version from #90/#92"). Because `main` added
and removed the file inside its own three commits, the merge base has neither, so git takes the
branch's copy without a conflict and the deleted hook comes back. `docs/factory/README.md`'s gate
table and console section describe `refresh-console.sh` only; `console-refresh.sh` is documented
nowhere. Delete it and its `Stop` entry before merging.

### Smaller findings

- `engine/CLAUDE.md:8-9` tells the reader to reach generated tables "through
  `include/verstaan/tables.hpp`". That file does not exist and is not marked planned. ADR 0003 names
  the same header. `engine/generated/CMakeLists.txt` builds `verstaan_data_fixture` and no target
  links it, so the licence boundary ADR 0003 describes is asserted in three documents and enforced
  nowhere. Note also that `engine/CLAUDE.md` and `data/CLAUDE.md` are untouched by this diff; only
  `tools/CLAUDE.md` changed, by two lines. All three are under 40 lines (12, 12, 11) and point at
  the standards rather than repeating them, so the criterion holds -- but "bring in line with what
  M0 built" was met by leaving two of them alone.
- The only secret scan in the ladder (`gate.md` step 1, `gate.yml:56`) matches `ghp_` and
  `github_pat_`. The credential the non-negotiable in `CLAUDE.md` actually names is the archive
  password, `UNL_PASS`. Nothing greps for it. `tools/mirror/cli.py` refuses it on the command line;
  once M1 writes `mirror.toml`, nothing stops it landing in a file.
- `tests/golden/`, `tests/equivalence/` and `tests/tier/` each hold one
  `placeholder_test.cpp` whose body is `int main() { return 0; }`. `/gate` step 5 runs
  `ctest -L equivalence` and reports a pass. Nothing retires them when the real suites arrive, and a
  green `equivalence` label in the gate report reads the same either way. Give each a guard that
  fails once its own directory has real content.
- Issue 90's `commit:` names `24ece52`, whose subject is "chore: refresh STATE.md after closing
  #02". Issues 91 and 92 name their second, fix commit (`5f37278`, `4c6ec5d`) and each carries two
  `chore(#NN): close` commits. `git-workflow.md` says one work commit and one close commit per
  issue, and calls the history a deliverable.
- `SPEC.md` §6 lists `worktree:` in the schema. Only issues 03, 04 and 91 carry the field; 01, 02,
  05, 06, 90, 92 and every M1 file do not. `mirror_github.py` does not require it, so nothing
  notices.
- `SPEC.md` §3.4 still says `Status` is `ok | partial | no_parse`. `engine.hpp:31` has four values.
  §3.6 assigns exit codes to three of them, so `apps/cli` has no exit code for the fourth.
  `docs/standards/cpp.md:39` promises sanitizers on the `clang-release` preset in `/gate`; the
  preset sets no `-fsanitize` flag and `gate.md` never adds one. `cpp.md:28` states flatly that
  `engine/generated/` is never edited by hand; `engine/generated/fixture/` is, by design and with an
  ADR 0003 sentence behind it, but `cpp.md` was not given the exception.
- The fixture store spells `source:` two ways: a mapping in `dictionary/*.yaml` and `meta.yaml`
  (`{origin: invented, issue: 4}`), a bare string in `grammar/*.yaml` (`original`). One field, two
  types, in the tree the importer and the validator will be written against.
- Issue 92 is `status: done` with two unticked "Done when" boxes. `SKILL.md` "After the agent hands
  off" step 2 says unchecked goes back to the agent. The boxes carry an honest reason (the root tree
  was on `m0-foundation`), and the first one names this issue as where to finish the job: run
  `/factory-run` end to end through a worktree once the root tree is free.
- `CMakePresets.json` hardcodes `C:/Program Files/LLVM/bin/clang++.exe`, `C:/Program Files
  (x86)/GnuWin32/bin/make.exe` and a Visual Studio Ninja path. `gate.yml`'s header comment says CI
  works around this by configuring CMake directly. `.github/ISSUE_TEMPLATE/` now invites outside
  contributors, and three of the four presets will not configure on their machines.
- `tools/mirror/cli.py:54` defines `read_credentials()`; nothing calls it. `docs/factory/STATE.md:5`
  says "gate not yet stamped (no stamp for this worktree)" while the stamp exists and matches
  `ba2500c`; it is a rendering, so regenerate it on close.

### Checked and clean

- No hand edit under `data/archive/` (empty but for `.gitkeep`). `engine/generated/fixture/` holds
  the only hand-written files under `engine/generated/`, labelled as such in the file itself, in
  `engine/generated/CMakeLists.txt` and in `engine/CLAUDE.md`, and covered by ADR 0003's "tiny
  fixture data library" consequence. No new decision in the diff needs an ADR that does not have
  one.
- No e-mail address or personal name outside `CONTRIBUTORS.md`, `CLA.md`, `TRADEMARK.md`,
  `verstaan.md` and the pre-existing `docs/decisions/` brief. No credential in any tracked file. No
  generated file included by engine source.
- `tools/validate/tests/test_fixture_languages.py` is the strongest work in the diff: thirty
  mutation tests that each break one invariant in a `tmp_path` copy and assert the check reports it.
  I recounted the fixture from the YAML rather than trusting `meta.yaml`: xxa 10/3/3/2/5/9, xxb
  10/3/3/1/5/8, block A 17 rows. All three agree, and the "at least eight rows" criterion holds.
- `mergeIssuesAcrossWorktrees` is one-directional as documented: a status can only advance, so an
  issue reopened on a branch will not show as reopened in the root console. `git-workflow.md` says
  so.
- `docs/architecture/overview.md` marks its pipeline forward references "Planned for M3" and its
  component rows "planned for M1 / M2+". The two "Related pages" entries name their issues rather
  than a milestone; the console omits them because `readLibrary` filters on `existsSync`.
- `reject_credential_args` in `tools/mirror/cli.py` catches `--pass=x`, `--UNL_USER`, `--unl-user`
  and a bare `UNL_PASS=x` positional. Everything else argparse rejects as unknown.
- Licence plumbing: SPDX on every non-generated `.cpp`/`.hpp` and every `tools/*.py`, the CC BY-SA
  line on the fixture tables, `apps/cli/NOTICE` naming both licences and the archive.
- `.gitignore` covers `.worktrees/` and `docs/factory/console/`; the console is untracked on both
  sides of the merge; the stale `.gitkeep` files left in now-populated directories were removed.
