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
cmd=$(printf '%s' "$input" | sed -n 's/.*"command":[[:space:]]*"\(.*\)".*/\1/p' | head -1)
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

# `git merge [flags] <ref>`: the last token that is not a flag. No ref means "merge the upstream",
# which this hook cannot resolve, so it asks for an explicit one.
merge_ref() {
  ref=""
  for tok in $1; do
    case "$tok" in
      git|merge|-*) ;;
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
    "gh pr create"*|"gh pr ready"*|"gh pr merge"*|"git pull"*) require_stamp HEAD ;;
    "git merge"|"git merge "*)
      branch=$(git branch --show-current 2>/dev/null)
      if [ "$branch" = "main" ]; then
        echo "require-gate: git merge into main is refused. Open a pull request and use gh pr merge instead." >&2
        exit 2
      fi
      ref=$(merge_ref "$seg")
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
