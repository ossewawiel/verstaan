#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
# The logic behind `.claude/hooks/require-gate.sh`, which is a one-line wrapper that execs this
# file. Logic lives here so it is a normal tracked script with tests
# (`tools/factory/tests/test_require_gate.py`); the wrapper under `.claude/` almost never changes.
#
# Trigger: PreToolUse on Bash|PowerShell. Reads the hook JSON on stdin. Exit 2 blocks the command.
#
# Blocks `gh pr create` (non-draft), `gh pr ready`, `gh pr merge`, `git pull` and `git merge`
# unless the commit they act on carries a gate stamp and the current tree is clean.
#
# `git merge` while the current tree is on `main` is refused outright, stamped or not: the pull
# request is the only way into `main` (docs/factory/git-workflow.md "Worktrees"). The stamp still
# gates `git merge` on any other branch, and every other listed command everywhere.
#
# The one exception: `git merge --ff-only <main's own upstream>` and a bare `git pull --ff-only`
# on `main`. A fast-forward of `main` from its own upstream cannot carry unreviewed work, because
# every commit on it already passed the `gate` check on a pull request (issue 96). `--ff-only` on
# its own is not the licence -- `git merge --ff-only some-other-branch` stays refused -- only a
# fast-forward from the branch's own tracked upstream is. `git pull --ff-only` with an explicit
# repository/refspec is not covered: this hook does not parse `git pull` closely enough to know
# the explicit target is the tracked upstream and nothing more, so it falls back to the stamp
# check rather than guess.
#
# "Main's own upstream" is `main@{upstream}` when that is configured, else `origin/main` by name
# if that ref exists. A repo that was cloned gets `branch.main.remote`/`branch.main.merge` written
# for free; a repo that was `git init`-ed locally and only later got `git remote add origin` never
# does, `main@{upstream}` never resolves, and without the fallback the exemption above could never
# fire there. That is this repository's own root checkout, which is the tree issue 96 exists to
# unblock.
#
# The stamp is tree-independent: `/gate` writes an empty file named after the commit hash under
# `$(git rev-parse --git-common-dir)/verstaan-gate-stamps/`, only when every step passed in a
# clean tree. "Commit X passed the gate" is then a fact any tree can check, which is what lets the
# root tree (on `main`) merge a milestone branch that was gated inside its own worktree.
# `git merge <ref>` checks the stamp of <ref>; every other gated command checks HEAD.
#
# Matches only at the start of a command segment (after &&, ||, ;, | or a newline), so the words
# inside a string literal do not trigger it. On 2026-09-08 the first version matched a printf
# argument containing "git merge" and blocked its own smoke test.
#
# The "git merge" case requires a word boundary (exact "git merge", or "git merge " followed by
# more) so plumbing commands that merely start with the same letters -- git merge-base,
# git merge-tree, git merge-file -- are never matched. A plain prefix match on "git merge" would
# catch those too and hard-refuse a read-only diagnostic command with advice about opening a PR,
# which makes no sense for something that never touches a ref.
set -u
input=$(cat)
# Tolerate `"command": "…"` as well as `"command":"…"`: the old hook matched only the compact
# form and silently allowed everything when fed pretty-printed JSON.
#
# The captured group matches an escaped-character pair (`\\.`) or any character that is not a
# quote or a backslash (`[^"\\]`), repeated, so it stops at the command's own unescaped closing
# quote instead of running past it to the last quote in the payload -- the old pattern's `.*` was
# greedy and did exactly that whenever a field (Claude Code always sends `description`) followed
# `command`. This is one `sed -E` call, no more than the old pattern; a python or jq subprocess
# would cost more startup time on every single PreToolUse and buys nothing a correct regex
# doesn't already give here.
cmd=$(printf '%s' "$input" | sed -n -E 's/.*"command"[[:space:]]*:[[:space:]]*"((\\.|[^"\\])*)".*/\1/p')
[ -z "$cmd" ] && exit 0

stamp_dir() {
  printf '%s/verstaan-gate-stamps' "$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)"
}

# $1: a commit-ish. Exit 2 with a message unless it resolves, is stamped, and the tree is clean.
require_stamp() {
  ref="$1"
  sha=$(git rev-parse --verify --quiet "${ref}^{commit}" 2>/dev/null) || {
    echo "require-gate: '$ref' is not a commit I can resolve." >&2
    exit 2
  }
  if [ ! -f "$(stamp_dir)/$sha" ]; then
    echo "require-gate: no gate stamp for $ref ($sha). Run /gate on that commit first." >&2
    exit 2
  fi
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    echo "require-gate: this tree is dirty. Commit or stash first." >&2
    exit 2
  fi
}

# `main`'s own upstream: the configured tracking branch (`main@{upstream}`) if set, else
# `origin/main` by name if that remote-tracking ref exists. See the comment above about why the
# fallback exists. Prints nothing if neither resolves.
main_upstream() {
  u=$(git rev-parse --abbrev-ref --symbolic-full-name main@{upstream} 2>/dev/null)
  if [ -z "$u" ] && git rev-parse --verify --quiet origin/main >/dev/null 2>&1; then
    u="origin/main"
  fi
  printf '%s' "$u"
}

# The last token in $1 that is not a flag and not one of the literal words in $2 (the subcommand,
# e.g. "git merge" or "git pull"). For `git merge [flags] <ref>`, that is the ref to merge; no ref
# means "merge the upstream", which this hook cannot resolve, so it asks for an explicit one. For
# `git pull [flags] [<repository> [<refspec>]]`, a non-empty result means an explicit
# repository/refspec was given rather than relying on the tracked upstream.
last_positional() {
  words="$1"
  skip=" $2 "
  ref=""
  for tok in $words; do
    case "$skip" in
      *" $tok "*) continue ;;
    esac
    case "$tok" in
      -*) ;;
      *) ref="$tok" ;;
    esac
  done
  printf '%s' "$ref"
}

# Unescape \n and split into segments.
segments=$(printf '%s' "$cmd" | sed 's/\\n/\n/g' | sed 's/&&/\n/g; s/||/\n/g; s/;/\n/g; s/|/\n/g')
while IFS= read -r seg; do
  seg="${seg#"${seg%%[![:space:]]*}"}"   # trim leading whitespace
  case "$seg" in
    "gh pr create"*"--draft"*) ;;
    "gh pr create"*|"gh pr ready"*|"gh pr merge"*) require_stamp HEAD ;;
    "git pull"|"git pull "*)
      branch=$(git branch --show-current 2>/dev/null)
      if [ "$branch" = "main" ]; then
        case "$seg" in
          *" --ff-only"|*" --ff-only "*)
            extra=$(last_positional "$seg" "git pull")
            # A bare `git pull --ff-only` (no explicit repository/refspec) targets main's own
            # upstream by definition, the same ref `git merge --ff-only <upstream>` names
            # explicitly above, so the same exemption applies by the same reasoning. If main has
            # no resolvable upstream (see `main_upstream`), git itself has nothing to pull from
            # and errors out before `--ff-only` even matters; the exemption then never fires and
            # this falls through to the stamp check, which is the safe default.
            if [ -z "$extra" ]; then
              upstream=$(main_upstream)
              [ -n "$upstream" ] && continue
            fi
            ;;
        esac
      fi
      require_stamp HEAD
      ;;
    "git merge"|"git merge "*)
      branch=$(git branch --show-current 2>/dev/null)
      ref=$(last_positional "$seg" "git merge")
      if [ "$branch" = "main" ]; then
        case "$seg" in
          *" --ff-only"|*" --ff-only "*)
            upstream=$(main_upstream)
            [ -n "$upstream" ] && [ "$ref" = "$upstream" ] && continue
            ;;
        esac
        echo "require-gate: git merge into main is refused. Open a pull request and use gh pr merge instead." >&2
        exit 2
      fi
      if [ -z "$ref" ]; then
        echo "require-gate: name the branch to merge explicitly, e.g. git merge --no-ff m0-foundation." >&2
        exit 2
      fi
      require_stamp "$ref"
      ;;
  esac
done <<EOF
$segments
EOF
exit 0
