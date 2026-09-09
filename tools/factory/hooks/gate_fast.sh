#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
# The logic behind `.claude/hooks/gate-fast.sh`, which is a one-line wrapper that execs this
# file. Logic lives here so it is a normal tracked script with tests
# (`tools/factory/tests/test_gate_fast.py`); the wrapper under `.claude/` almost never changes.
#
# Tier: fast, blocking. Trigger: Stop. Runtime target: under 60 s.
# Builds the core, runs the fast-labelled tests, validates changed data, runs pytest for changed
# tools. Exit 2 blocks the stop and shows the message. Logs each failure to lessons.jsonl.
#
# stop_hook_active MUST be checked first. Without this guard a failure here blocks Stop, which
# re-triggers Stop, which runs this hook again, which fails again, forever.
set -u
input=$(cat)
case "$input" in *'"stop_hook_active":true'*) exit 0;; esac

# shellcheck source=_env.sh
. "$(dirname "$0")/_env.sh"
root=$(repo_root); cd "$root" || exit 0
cap="$root/tools/factory/hooks/capture_failure.sh"

# The console is a rendering; keep it current on every stop, pass or fail. Never blocks.
printf "{}" | bash "$root/tools/factory/hooks/refresh_console.sh"

# Nothing to gate until the build system exists (M0 issue 02 creates it).
[ -f CMakePresets.json ] || exit 0

changed=$(git status --porcelain | awk '{print $2}')
fail() { bash "$cap" "$1" "$2" "$3"; printf '%s\n' "$3" >&2; exit 2; }

if printf '%s\n' "$changed" | grep -qE '^(engine|apps|tests)/'; then
  cmake --preset msvc-debug >/dev/null 2>&1 || cmake --preset msvc-debug
  out=$(cmake --build --preset msvc-debug --target verstaan_core 2>&1) || fail build compile-failed "gate-fast: build failed. Fix before stopping.
$(printf '%s' "$out" | tail -n 30)"
  # The library alone is not enough: ctest only runs binaries that are already built, it does not
  # build them. Build everything (the library plus the fast test executables) before ctest runs.
  out=$(cmake --build --preset msvc-debug 2>&1) || fail build compile-failed "gate-fast: build failed. Fix before stopping.
$(printf '%s' "$out" | tail -n 30)"
  out=$(ctest --preset msvc-debug -L fast --output-on-failure 2>&1) || fail test fast-tests-red "gate-fast: fast tests failed.
$(printf '%s' "$out" | tail -n 40)"
fi

if printf '%s\n' "$changed" | grep -qE '^data/languages/'; then
  out=$("$PYTHON" -m tools.validate --changed 2>&1) || fail data validation-failed "gate-fast: data validation failed.
$(printf '%s' "$out" | tail -n 30)"
fi

for tool in $(printf '%s\n' "$changed" | sed -n 's#^tools/\([a-z_]*\)/.*#\1#p' | sort -u); do
  [ -d "tools/$tool/tests" ] || continue
  out=$("$PYTHON" -m pytest "tools/$tool/tests" -q 2>&1) || fail test pytest-red "gate-fast: pytest failed in tools/$tool.
$(printf '%s' "$out" | tail -n 30)"
done
exit 0
