#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
# The logic behind `.claude/hooks/_env.sh`, which is a one-line wrapper that sources this file.
# Logic lives here so it is a normal tracked script (docs/factory/issues/93-hooks-as-tracked-scripts.md);
# the wrapper under `.claude/` almost never changes.
#
# Sourced by the other hooks, never run. Pins tool locations without hard-failing inside a hook.
# If a path is wrong the hook prints one line and carries on; the full gate is where it must be right.

VCPKG_ROOT="${VCPKG_ROOT:-/d/SourceCode/vcpkg}"
PYTHON="${PYTHON:-python}"
export VCPKG_ROOT PYTHON

repo_root() { git rev-parse --show-toplevel 2>/dev/null || pwd; }
