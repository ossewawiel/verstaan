# SPDX-License-Identifier: MPL-2.0
"""Tests for tools/factory/hooks/refresh_console.sh, the logic behind refresh-console.sh.

Rendering tier, never blocking: SessionStart (no `file_path`), PostToolUse on Edit|Write when the
touched file is a doc/agent/skill/command/root doc, and a plain `{}` payload from gate-fast.sh on
every Stop. Every path exits 0, including a missing `node` or a `generate.mjs` that errors, since
a stale console is not a broken gate (docs/factory/issues/93-hooks-as-tracked-scripts.md).
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from tools.factory.tests.conftest import BASH, HOOKS_DIR, init_repo

HOOK = HOOKS_DIR / "refresh_console.sh"


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    init_repo(root)
    return root


def run_hook(cwd: Path, payload: str) -> subprocess.CompletedProcess[str]:
    assert BASH, "bash is required to run the hook"
    return subprocess.run(
        [BASH, str(HOOK)], cwd=cwd, input=payload, capture_output=True, text=True, check=False
    )


def compact(payload: dict) -> str:
    return json.dumps(payload, separators=(",", ":"))


def test_session_start_empty_payload_exits_zero(repo):
    # SessionStart sends no file_path; the hook still tries to render, and never blocks either way.
    assert run_hook(repo, "{}").returncode == 0


def test_stop_hook_plain_payload_exits_zero(repo):
    assert run_hook(repo, compact({})).returncode == 0


def test_doc_file_edit_attempts_regeneration(repo):
    # generate.mjs does not exist in this throwaway repo, so node fails and the hook reports it --
    # that is how we tell "attempted" from "skipped" (both exit 0 either way). Claude Code's
    # `file_path` uses forward slashes, which is what the hook's `case` patterns match against.
    file_path = (repo / "docs" / "factory" / "SPEC.md").as_posix()
    payload = compact({"tool_input": {"file_path": file_path}})
    result = run_hook(repo, payload)
    assert result.returncode == 0
    assert "generate failed" in result.stderr


def test_unrelated_file_edit_is_skipped_and_exits_zero(repo):
    file_path = (repo / "engine" / "src" / "thing.cpp").as_posix()
    payload = compact({"tool_input": {"file_path": file_path}})
    result = run_hook(repo, payload)
    assert result.returncode == 0
    assert result.stderr == ""


def test_missing_generate_script_does_not_block(repo):
    # tools/console/src/generate.mjs does not exist in this throwaway repo; node fails to run it,
    # the hook reports it on stderr and still exits 0.
    result = run_hook(repo, "{}")
    assert result.returncode == 0
