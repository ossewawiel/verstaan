#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
# The logic behind the console's "gate" job kind (issue 100). Runs the same ladder
# `.claude/commands/gate.md` describes, for real, and writes the stamp
# `tools/factory/hooks/require_gate.sh` reads -- only when every step passed and the tree is
# clean. This is not a second gate: it is the first one, made runnable from a job rather than
# typed by hand step by step. A failed step prints its own output and stops; no later step runs,
# and no stamp is written.
#
# Preset choice is platform-driven, not hardcoded to one OS: the real presets
# (CMakePresets.json) are MSVC-only, built for the project's Windows dev machines; a Linux
# worktree adds `linux-gcc`/`linux-clang` in the gitignored CMakeUserPresets.json (see
# docs/factory/issues/100-the-console-acts.md and the "Linux gate presets" note). `uname` decides
# which set this run builds, matching what a human typing the same commands on the same machine
# would reach for.
set -u
root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$root" || { echo "gate: cannot resolve the worktree root" >&2; exit 1; }

PYTHON="${PYTHON:-python}"
fail() { echo "gate: $1" >&2; exit 1; }

case "$(uname -s 2>/dev/null)" in
  Linux) PRESETS="linux-gcc linux-clang"; TIDY_PRESET=linux-clang ;;
  Darwin) PRESETS="linux-gcc linux-clang"; TIDY_PRESET=linux-clang ;;
  *) PRESETS="msvc-debug msvc-release clang-release gcc-release"; TIDY_PRESET=clang-release ;;
esac

[ -f CMakePresets.json ] || fail "CMakePresets.json is missing"
# The presets this run actually needs (linux-gcc/linux-clang) live only in the gitignored
# CMakeUserPresets.json ("Linux gate presets" -- docs/factory/issues/100-the-console-acts.md); the
# tracked CMakePresets.json alone is MSVC-only and never satisfies this on Linux/Darwin. Checking
# "either file exists" made this guard a no-op, since CMakePresets.json is always present.
case "$(uname -s 2>/dev/null)" in
  Linux|Darwin) [ -f CMakeUserPresets.json ] || fail "CMakeUserPresets.json is missing (it carries the linux-gcc/linux-clang presets)" ;;
esac

echo "gate: step 0, stubs"
if grep -rn 'not_implemented\|NotImplementedError' engine/src engine/include tools/ --include=*.cpp --include=*.hpp --include=*.py 2>/dev/null \
    | grep -v '/tests/' | grep -v 'engine/include/verstaan/engine.hpp' | grep -q .; then
  fail "step 0: a stub (not_implemented/NotImplementedError) remains outside tests/"
fi

echo "gate: step 1, format, licences and secrets"
cpp_files=$(git ls-files 'engine/**/*.cpp' 'engine/**/*.hpp' 'apps/**/*.cpp' 'apps/**/*.hpp')
if [ -n "$cpp_files" ]; then
  clang-format --dry-run --Werror $cpp_files || fail "step 1: clang-format would change a file"
fi
ruff format --check tools/ || fail "step 1: ruff format --check failed"
ruff check tools/ || fail "step 1: ruff check failed"
"$PYTHON" -m tools.validate --licences || fail "step 1: a file is missing its licence header"
if git grep -nIE '\bghp_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b' -- . | grep -q .; then
  fail "step 1: a live-shaped GitHub token is committed"
fi
if git grep -nIE '^[[:space:]]*(export[[:space:]]+)?UNL_PASS[[:space:]]*[:=][[:space:]]*["'"'"']?[^[:space:]$"'"'"'][^[:space:]]{3,}' -- . ':(exclude)**/tests/**' | grep -q .; then
  fail "step 1: a UNL_PASS value is committed"
fi

echo "gate: step 2, configure and build every preset ($PRESETS)"
for p in $PRESETS; do
  cmake --preset "$p" || fail "step 2: configure failed for $p"
  cmake --build --preset "$p" || fail "step 2: build failed for $p"
done

echo "gate: step 3, tests"
for p in $PRESETS; do
  ctest --preset "$p" --output-on-failure || fail "step 3: ctest failed for $p"
done
"$PYTHON" -m pytest tools/ || fail "step 3: pytest failed"
if [ -f tools/console/test/run.mjs ]; then
  node tools/console/test/run.mjs || fail "step 3: the file console's own test/run.mjs failed"
fi
(
  cd apps/console || exit 1
  npm ci || exit 1
  npm run build || exit 1
  npm test || exit 1
  npm audit --omit=dev --audit-level=high || exit 1
) || fail "step 3: apps/console failed"
"$PYTHON" -m tools.validate --all || fail "step 3: tools.validate --all failed"

echo "gate: step 4, tidy"
# clang-tidy is a hard requirement on every platform this runs on, not silently skippable: an
# absent binary used to fall through this whole step with no message and exit 0, so the stamp got
# written as if tidy had passed clean. A machine with cmake and ninja but no clang-tidy package
# must fail loudly here, the same way a missing CMakeUserPresets.json fails loudly above, rather
# than ship a warning that would have blocked the PR anywhere else.
command -v clang-tidy >/dev/null 2>&1 || fail "step 4: clang-tidy is not installed"
[ -d "build/$TIDY_PRESET" ] || fail "step 4: build/$TIDY_PRESET is missing; step 2 should have created it"
cpp_only=$(git ls-files 'engine/**/*.cpp')
if [ -n "$cpp_only" ]; then
  clang-tidy -p "build/$TIDY_PRESET" $cpp_only || fail "step 4: clang-tidy reported a warning"
fi

echo "gate: step 5, equivalence and tiers"
if ctest --preset "$TIDY_PRESET" -N -L equivalence >/dev/null 2>&1; then
  ctest --preset "$TIDY_PRESET" -L equivalence || fail "step 5: equivalence tests failed"
fi
if ctest --preset "$TIDY_PRESET" -N -L tier >/dev/null 2>&1; then
  ctest --preset "$TIDY_PRESET" -L tier || fail "step 5: tier tests failed"
fi

echo "gate: step 6, regenerate"
if [ -d engine/generated ]; then
  # M0's tools.compiler is still a skeleton (SPEC.md §3.5, filled in at M1) and does not accept
  # --all-tiers yet; running it bare still exercises "did regenerating change anything" for as
  # long as that is true, and this stops being a special case the moment the real flag lands.
  if "$PYTHON" -m tools.compiler --help 2>&1 | grep -q -- '--all-tiers'; then
    "$PYTHON" -m tools.compiler --all-tiers || fail "step 6: the compiler failed"
  else
    "$PYTHON" -m tools.compiler || fail "step 6: the compiler failed"
  fi
  git diff --exit-code engine/generated/ || fail "step 6: engine/generated/ differs after regeneration"
fi

if [ -n "$(git status --porcelain)" ]; then
  fail "the tree is dirty; the stamp is only written for a clean tree"
fi

d="$(git rev-parse --path-format=absolute --git-common-dir)/verstaan-gate-stamps"
mkdir -p "$d"
touch "$d/$(git rev-parse HEAD)"
echo "gate: stamped $(git rev-parse HEAD)"
exit 0
