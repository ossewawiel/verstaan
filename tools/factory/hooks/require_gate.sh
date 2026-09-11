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
# argument containing "git merge" and blocked its own smoke test. A heredoc body is a second way
# for gated text to appear without being a real command: it is input data to whatever reads it,
# never something bash executes. `strip_heredocs` removes heredoc bodies before segments are cut,
# so a gated command merely quoted inside one (issue 97) is never mistaken for a real segment.
#
# A third way: `echo 'run cd /repo && git merge --ff-only origin/main to catch up'` is one
# command, not two, but splitting on a literal "&&" without knowing it sits inside a quoted span
# turned the quoted advice into a second, real-looking segment (found in review of this issue).
# `$AWK_EXTRACT_SEGMENTS` (run once, below) decodes the JSON escaping the extraction regex above
# left untouched (a literal `"` still reads as the two characters `\"` there), drops heredoc
# bodies, and then splits on &&, ||, ;, | and newline only where those sit outside a quoted span.
# It leaves the quote characters themselves in the segment text rather than stripping the quoted
# span outright, so `cd "<path with spaces>"` still resolves correctly afterwards. If a quote is
# never closed, it cannot tell what the rest of the string is, so it falls back to a quote-blind
# split instead of guessing -- over-gating on a broken command is safe, treating an unterminated
# quote as cover for a real gated command is not.
#
# This used to be three bash functions, each walking the command one character at a time and
# growing a string with `out="${out}${ch}"`. Bash reallocates and copies the whole accumulator on
# every append, so that was quadratic in the command's length: doubling the payload roughly
# quadrupled the cost, measured at 13.5 s for a 16 KB `gh pr create --body-file -` body -- a real
# size, and this hook runs on every Bash tool call, not only git ones. One `awk` program below
# does the same three passes in one process: JSON-unescaping and the outer quote-aware split use
# `gsub`/`match`/`substr`, which scan and copy each byte at most a small, constant number of
# times regardless of how many quotes or operators the command has; the heredoc pass walks lines,
# not characters. All three are linear in the command's length, the property the old bash hook
# already had and this one has to keep. `tools/factory/tests/test_require_gate.py` pins this down
# with a 20 KB payload against a fixed time budget.
#
# The "git merge" case requires a word boundary (exact "git merge", or "git merge " followed by
# more) so plumbing commands that merely start with the same letters -- git merge-base,
# git merge-tree, git merge-file -- are never matched. A plain prefix match on "git merge" would
# catch those too and hard-refuse a read-only diagnostic command with advice about opening a PR,
# which makes no sense for something that never touches a ref.
#
# Issue 97: this hook is a PreToolUse hook, so it runs in the session's own working directory,
# which since issue 92 is always a worktree, never the root tree. A command can still act on a
# different tree -- `cd <root> && git merge --ff-only origin/main`, or `git -C <root> merge ...`
# -- and every decision below (which branch is checked out, what its upstream is, whether the
# stamp matches, whether the tree is clean) must be made against *that* tree, not the hook's own
# cwd. `cwd` below tracks the effect of any `cd` segment already seen in this same command string,
# resolved with a real subshell `cd` (cheap: no external process, just a fork); a `git -C <path>`
# on an individual segment overrides it for that segment only, the same way it would for a real
# shell. Every tree-aware git call already ran once per segment before issue 97 -- against the
# hook's own cwd instead of the resolved tree -- so directing the same calls at `-C "$tree"` costs
# nothing extra per PreToolUse; the added cost is the `cd`/`-C` resolution itself, one subshell
# per `cd` or `-C` segment, which is far cheaper than the `git` process this hook already spawns
# several times per invocation.
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

# $1: a tree path, or "" for the hook's own cwd. Runs `git -C "$1" "$@"` when a tree is given, a
# plain `git "$@"` otherwise, so every caller below works the same whether or not a `cd`/`-C` in
# the command redirected it away from the hook's own working directory.
git_at() {
  tree="$1"; shift
  if [ -n "$tree" ]; then
    git -C "$tree" "$@"
  else
    git "$@"
  fi
}

# $1: a tree path (or ""). The stamp directory for that tree's git-common-dir.
stamp_dir() {
  printf '%s/verstaan-gate-stamps' "$(git_at "$1" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)"
}

# $1: a commit-ish. $2: the tree to check it against ("" for the hook's own cwd). Exit 2 with a
# message unless it resolves, is stamped, and that tree is clean.
require_stamp() {
  ref="$1"
  tree="$2"
  sha=$(git_at "$tree" rev-parse --verify --quiet "${ref}^{commit}" 2>/dev/null) || {
    echo "require-gate: '$ref' is not a commit I can resolve." >&2
    exit 2
  }
  if [ ! -f "$(stamp_dir "$tree")/$sha" ]; then
    echo "require-gate: no gate stamp for $ref ($sha). Run /gate on that commit first." >&2
    exit 2
  fi
  if [ -n "$(git_at "$tree" status --porcelain 2>/dev/null)" ]; then
    echo "require-gate: this tree is dirty. Commit or stash first." >&2
    exit 2
  fi
}

# `main`'s own upstream on the given tree ($1, "" for the hook's own cwd): the configured tracking
# branch (`main@{upstream}`) if set, else `origin/main` by name if that remote-tracking ref
# exists. See the comment above about why the fallback exists. Prints nothing if neither resolves.
main_upstream() {
  tree="$1"
  u=$(git_at "$tree" rev-parse --abbrev-ref --symbolic-full-name main@{upstream} 2>/dev/null)
  if [ -z "$u" ] && git_at "$tree" rev-parse --verify --quiet origin/main >/dev/null 2>&1; then
    u="origin/main"
  fi
  printf '%s' "$u"
}

# The last token in $1 that is not a flag, not a shell redirection, and not one of the literal
# words in $2 (the subcommand, e.g. "git merge" or "git pull"). For `git merge [flags] <ref>`,
# that is the ref to merge; no ref means "merge the upstream", which this hook cannot resolve, so
# it asks for an explicit one. For `git pull [flags] [<repository> [<refspec>]]`, a non-empty
# result means an explicit repository/refspec was given rather than relying on the tracked
# upstream. A redirection such as `2>&1` is not a flag by the `-*` test, so without the `<`/`>`
# check below it would win this slot and be read as the ref (issue 97).
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
      *'<'*|*'>'*) ;;
      *) ref="$tok" ;;
    esac
  done
  printf '%s' "$ref"
}

# JSON-unescapes the command, drops heredoc bodies, then splits into segments -- see the block
# comment above for what each pass does and why this is one `awk` program rather than the three
# bash character loops it replaces. Read into a variable via a quoted heredoc (not a bash
# single-quoted string) so the program text can contain literal `'` and `"` freely; a quoted
# heredoc also means the reads below happen with no expansion, so `$0`, backslashes and quotes in
# the awk source reach awk exactly as written.
read -r -d '' AWK_EXTRACT_SEGMENTS <<'AWK_EOF'
{
  text = $0

  # ---- decode JSON string escapes ----------------------------------------------------------
  # `\\` is protected first, behind a placeholder no real command text contains, so a later pass
  # (say, the one for `\n`) cannot mistake one half of a `\\` pair plus the character after it for
  # an escape that was never there. `\uXXXX` is skipped rather than decoded: a shell command
  # escaping a code point that way is not a case this hook needs to parse correctly, and a
  # best-effort skip is safer than mis-decoding it.
  soh = sprintf("%c", 1)
  gsub(/\\\\/, soh, text)
  gsub(/\\"/, "\"", text)
  gsub(/\\\//, "/", text)
  gsub(/\\n/, "\n", text)
  gsub(/\\t/, "\t", text)
  gsub(/\\r/, "\r", text)
  gsub(/\\b/, "\b", text)
  gsub(/\\f/, "\f", text)
  gsub(/\\u[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]/, "", text)
  gsub(soh, "\\", text)

  # ---- drop heredoc bodies ------------------------------------------------------------------
  # A heredoc body is input data to whatever reads it, never a command bash runs, so a gated
  # command merely quoted inside one (`gh pr create --body-file - <<EOF ... git merge ... EOF`)
  # must never reach the segment split below. Recognises `<<WORD`, `<<-WORD`, `<<'WORD'`,
  # `<<"WORD"`; `<<-` also strips leading tabs from the terminator line, matching the shell rule.
  n = split(text, lines, "\n")
  out = ""
  in_hd = 0
  dashed = 0
  delim = ""
  for (i = 1; i <= n; i++) {
    line = lines[i]
    if (in_hd) {
      check = line
      if (dashed) sub(/^\t+/, "", check)
      if (check == delim) in_hd = 0
      continue
    }
    out = out line "\n"
    if (match(line, /<<-?[ \t]*["']?[A-Za-z_][A-Za-z0-9_]*/)) {
      op = substr(line, RSTART, RLENGTH)
      dashed = (substr(op, 1, 3) == "<<-") ? 1 : 0
      delim = op
      sub(/^<<-?[ \t]*/, "", delim)
      sub(/^["']/, "", delim)
      in_hd = 1
    }
  }
  text = out

  # ---- quote-aware split on &&, ||, ;, | and newline ----------------------------------------
  # `remaining` shrinks by one token (an escape pair, a quote, an operator, or the run of plain
  # text before the next of those) each time round the loop, so this is one pass over the command
  # driven by `match`/`substr`, not a loop over every character. A separator inside a quoted span
  # does not end a segment; quote characters are kept in the segment text (not stripped), so
  # `cd "<path with spaces>"` still resolves after this runs. `||` is listed before the bare `|`
  # alternative so an awk that resolves alternation by first match, not longest match, still
  # prefers it.
  remaining = text
  buf = ""
  segs = ""
  in_sq = 0
  in_dq = 0
  unbalanced = 0
  while (length(remaining) > 0) {
    if (in_sq) {
      pos = index(remaining, "'")
      if (pos == 0) { buf = buf remaining; remaining = ""; unbalanced = 1; break }
      buf = buf substr(remaining, 1, pos)
      remaining = substr(remaining, pos + 1)
      in_sq = 0
      continue
    }
    if (in_dq) {
      if (match(remaining, /\\.|"/)) {
        buf = buf substr(remaining, 1, RSTART + RLENGTH - 1)
        tok = substr(remaining, RSTART, RLENGTH)
        remaining = substr(remaining, RSTART + RLENGTH)
        if (tok == "\"") in_dq = 0
        continue
      }
      buf = buf remaining
      remaining = ""
      unbalanced = 1
      break
    }
    if (match(remaining, /\\.|&&|\|\||;|\||\n|['"]/)) {
      buf = buf substr(remaining, 1, RSTART - 1)
      tok = substr(remaining, RSTART, RLENGTH)
      remaining = substr(remaining, RSTART + RLENGTH)
      if (tok == "&&" || tok == "||" || tok == ";" || tok == "|" || tok == "\n") {
        segs = segs buf "\n"
        buf = ""
      } else if (tok == "'") {
        in_sq = 1
        buf = buf tok
      } else if (tok == "\"") {
        in_dq = 1
        buf = buf tok
      } else {
        buf = buf tok
      }
      continue
    }
    buf = buf remaining
    remaining = ""
  }
  segs = segs buf

  if (unbalanced) {
    # A quote that never closes means the rest of the command cannot be told apart from a quoted
    # span, so this does not guess: it falls back to splitting on every separator regardless of
    # quoting, the old, blunter behaviour. That can misread quoted text as a real command and gate
    # something that did not need it; it cannot do the opposite, so it never lets an unexamined
    # gated command through.
    fallback = text
    gsub(/&&/, "\n", fallback)
    gsub(/\|\|/, "\n", fallback)
    gsub(/;/, "\n", fallback)
    gsub(/\|/, "\n", fallback)
    printf "%s", fallback
  } else {
    printf "%s", segs
  }
}
AWK_EOF

segments=$(printf '%s' "$cmd" | awk "$AWK_EXTRACT_SEGMENTS")

# Tracks the tree a `cd` segment already seen in this command string points at. "" means the
# hook's own cwd, i.e. no `cd` has redirected it yet. Resolved with a real subshell `cd` so `..`,
# `~` and relative paths work the way they would in the shell that actually runs this command.
cwd=""
while IFS= read -r seg; do
  seg="${seg#"${seg%%[![:space:]]*}"}"   # trim leading whitespace
  seg="${seg%"${seg##*[![:space:]]}"}"   # trim trailing whitespace, so a `cd <path> ` left by
                                          # splitting on `&&` doesn't feed `cd` a path with a
                                          # trailing space

  case "$seg" in
    "cd "*)
      target="${seg#cd }"
      case "$target" in
        \"*\") target="${target#\"}"; target="${target%\"}" ;;
        \'*\') target="${target#\'}"; target="${target%\'}" ;;
      esac
      newcwd=$(cd "${cwd:-.}" 2>/dev/null && cd -- "$target" 2>/dev/null && pwd)
      [ -n "$newcwd" ] && cwd="$newcwd"
      continue
      ;;
  esac

  # `git -C <path> ...` names its tree explicitly, overriding `cwd` for this segment only -- the
  # same as it would override the shell's own working directory for a real `git` invocation.
  tree="$cwd"
  match_seg="$seg"
  case "$seg" in
    "git -C "*)
      rest="${seg#git -C }"
      path_tok="${rest%% *}"
      case "$path_tok" in
        \"*\") path_tok="${path_tok#\"}"; path_tok="${path_tok%\"}" ;;
        \'*\') path_tok="${path_tok#\'}"; path_tok="${path_tok%\'}" ;;
      esac
      resolved=$(cd "${cwd:-.}" 2>/dev/null && cd -- "$path_tok" 2>/dev/null && pwd)
      [ -n "$resolved" ] && tree="$resolved"
      match_seg="git ${rest#* }"
      ;;
  esac

  case "$match_seg" in
    "gh pr create"*"--draft"*) ;;
    "gh pr create"*|"gh pr ready"*|"gh pr merge"*) require_stamp HEAD "$tree" ;;
    "git pull"|"git pull "*)
      branch=$(git_at "$tree" branch --show-current 2>/dev/null)
      if [ "$branch" = "main" ]; then
        case "$match_seg" in
          *" --ff-only"|*" --ff-only "*)
            extra=$(last_positional "$match_seg" "git pull")
            # A bare `git pull --ff-only` (no explicit repository/refspec) targets main's own
            # upstream by definition, the same ref `git merge --ff-only <upstream>` names
            # explicitly above, so the same exemption applies by the same reasoning. If main has
            # no resolvable upstream (see `main_upstream`), git itself has nothing to pull from
            # and errors out before `--ff-only` even matters; the exemption then never fires and
            # this falls through to the stamp check, which is the safe default.
            if [ -z "$extra" ]; then
              upstream=$(main_upstream "$tree")
              [ -n "$upstream" ] && continue
            fi
            ;;
        esac
      fi
      require_stamp HEAD "$tree"
      ;;
    "git merge"|"git merge "*)
      branch=$(git_at "$tree" branch --show-current 2>/dev/null)
      ref=$(last_positional "$match_seg" "git merge")
      if [ "$branch" = "main" ]; then
        case "$match_seg" in
          *" --ff-only"|*" --ff-only "*)
            upstream=$(main_upstream "$tree")
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
      require_stamp "$ref" "$tree"
      ;;
  esac
done <<EOF
$segments
EOF
exit 0
