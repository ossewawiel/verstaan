#!/usr/bin/env bash
# Sourced by the other hooks, never run. Pins tool locations without hard-failing inside a hook.
# If a path is wrong the hook prints one line and carries on; the full gate is where it must be right.

VCPKG_ROOT="${VCPKG_ROOT:-/d/SourceCode/vcpkg}"
PYTHON="${PYTHON:-python}"
export VCPKG_ROOT PYTHON

repo_root() { git rev-parse --show-toplevel 2>/dev/null || pwd; }
