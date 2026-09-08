#!/usr/bin/env bash
# Installs local git hooks that regenerate the console after a commit, a checkout or a merge,
# so the save-point tile is never one commit stale. Local only: .git/hooks is not versioned.
# Run once per clone: bash tools/console/install-git-hooks.sh
#
# Hooks live in the common git directory, shared by every `git worktree` tree off this repository
# (side quest 92): `--git-dir` resolves to a per-worktree admin directory that has no hooks/
# subdirectory of its own, so this must use `--git-common-dir`. Run from any tree; the effect is
# the same, because there is only one hooks directory.
set -eu
dir=$(git rev-parse --git-common-dir)
for h in post-commit post-checkout post-merge; do
  cat > "$dir/hooks/$h" <<'EOF'
#!/usr/bin/env bash
# Installed by tools/console/install-git-hooks.sh. Regenerates the console; never fails the git op.
# One hooks directory is shared by every `git worktree` tree, so this resolves the toplevel of
# whichever tree the git operation just ran in, at run time, rather than the tree that ran the
# installer: each tree gets its own docs/factory/console/ regenerated (side quest 92).
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
command -v node >/dev/null 2>&1 || exit 0
(cd "$root" && node tools/console/src/generate.mjs >/dev/null 2>&1) || true
exit 0
EOF
  chmod +x "$dir/hooks/$h"
done
echo "installed post-commit, post-checkout, post-merge hooks in $dir/hooks"
