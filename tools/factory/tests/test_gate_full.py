# SPDX-License-Identifier: MPL-2.0
"""Tests for tools/factory/hooks/gate_full.sh, the script behind the console's `gate` job kind
(issue 100).

The full ladder itself (cmake, ctest, clang-tidy, vcpkg) is exercised by hand against a real
worktree, not here -- a pytest run is not the place to spend minutes building C++. What is cheap
and deterministic to pin down here is the one behaviour the job runner's own precheck duplicates
before ever spawning this script (`apps/console/server/src/jobs/kinds.ts` gatePrecheck): a tree
with neither `CMakePresets.json` nor `CMakeUserPresets.json` fails immediately, names the missing
file, and never reaches a `cmake` call (docs/standards/testing.md: prove a gate fails before
trusting it).
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from tools.factory.tests.conftest import BASH, HOOKS_DIR, git, init_repo


def test_missing_presets_fails_before_any_cmake_call(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    init_repo(repo)
    result = subprocess.run(
        [BASH, str(HOOKS_DIR / "gate_full.sh")],
        cwd=repo,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 1
    assert "CMakePresets.json is missing" in result.stderr
    common_dir = git(repo, "rev-parse", "--path-format=absolute", "--git-common-dir").strip()
    stamp_dir = Path(common_dir) / "verstaan-gate-stamps"
    assert not stamp_dir.exists()
