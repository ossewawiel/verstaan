#!/usr/bin/env bash
# Installs local git hooks that regenerate the console after a commit, a checkout or a merge,
# so the save-point tile is never one commit stale. Local only: .git/hooks is not versioned.
# Run once per clone: bash tools/console/install-git-hooks.sh
set -eu
root=$(git rev-parse --show-toplevel)
dir=$(git rev-parse --git-dir)
for h in post-commit post-checkout post-merge; do
  cat > "$dir/hooks/$h" <<EOF
#!/usr/bin/env bash
# Installed by tools/console/install-git-hooks.sh. Regenerates the console; never fails the git op.
command -v node >/dev/null 2>&1 || exit 0
(cd "$root" && node tools/console/src/generate.mjs >/dev/null 2>&1) || true
exit 0
EOF
  chmod +x "$dir/hooks/$h"
done
echo "installed post-commit, post-checkout, post-merge hooks in $dir/hooks"
