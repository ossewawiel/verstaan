#!/usr/bin/env bash
# Tier: full gate enforcement. Trigger: PreToolUse on Bash|PowerShell. Runtime: ms.
# Blocks `gh pr create` (non-draft), `gh pr ready`, and `git merge` unless the gate stamp equals
# HEAD and the tree is clean. The stamp is written only by /gate.
#
# Matches only at the start of a command segment (after &&, ||, ;, | or a newline), so the words
# inside a string literal do not trigger it. On 2026-09-08 the first version matched a printf
# argument containing "git merge" and blocked its own smoke test.
set -u
input=$(cat)
cmd=$(printf '%s' "$input" | sed -n 's/.*"command":"\(.*\)".*/\1/p' | head -1)
[ -z "$cmd" ] && exit 0

# Unescape \n and split into segments.
segments=$(printf '%s' "$cmd" | sed 's/\\n/\n/g' | sed 's/&&/\n/g; s/||/\n/g; s/;/\n/g; s/|/\n/g')
needs_gate=0
while IFS= read -r seg; do
  seg="${seg#"${seg%%[![:space:]]*}"}"   # trim leading whitespace
  case "$seg" in
    "gh pr create"*"--draft"*) ;;
    "gh pr create"*|"gh pr ready"*|"git merge"*) needs_gate=1;;
  esac
done <<EOF
$segments
EOF
[ "$needs_gate" -eq 1 ] || exit 0

stamp="$(git rev-parse --git-dir 2>/dev/null)/verstaan-gate-stamp"
head=$(git rev-parse HEAD 2>/dev/null || echo none)
if [ ! -f "$stamp" ] || [ "$(cat "$stamp")" != "$head" ] || [ -n "$(git status --porcelain)" ]; then
  echo "require-gate: no gate stamp for HEAD, or dirty tree. Run /gate first." >&2
  exit 2
fi
exit 0
