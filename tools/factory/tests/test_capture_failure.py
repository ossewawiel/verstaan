# SPDX-License-Identifier: MPL-2.0
"""Tests for tools/factory/hooks/capture_failure.sh, the logic behind capture-failure.sh.

Called by gate-fast.sh with positional arguments (not hook JSON on stdin): `capture_failure.sh
<stage> <signature> <detail...>`. It appends one JSON line to docs/factory/lessons.jsonl and never
fails the caller -- gate-fast.sh relies on it only for the side effect.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from tools.factory.tests.conftest import BASH, HOOKS_DIR, init_repo

HOOK = HOOKS_DIR / "capture_failure.sh"


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    init_repo(root)
    (root / "docs" / "factory").mkdir(parents=True)
    return root


def run_hook(cwd: Path, *args: str) -> subprocess.CompletedProcess[str]:
    assert BASH, "bash is required to run the hook"
    return subprocess.run(
        [BASH, str(HOOK), *args], cwd=cwd, capture_output=True, text=True, check=False
    )


def lessons(root: Path) -> list[dict]:
    path = root / "docs" / "factory" / "lessons.jsonl"
    if not path.is_file():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def test_appends_one_line_with_the_given_fields(repo):
    (repo / "docs" / "factory" / "STATE.md").write_text(
        "Next up: #42 do the thing\n", encoding="utf-8"
    )
    result = run_hook(repo, "build", "compile-failed", "boom")
    assert result.returncode == 0
    entries = lessons(repo)
    assert len(entries) == 1
    assert entries[0]["stage"] == "build"
    assert entries[0]["sig"] == "compile-failed"
    assert entries[0]["detail"] == "boom"
    assert entries[0]["issue"] == "42"
    assert entries[0]["ts"].endswith("Z")


def test_missing_state_md_records_issue_none(repo):
    run_hook(repo, "test", "pytest-red", "detail")
    assert lessons(repo)[0]["issue"] == "none"


def test_detail_with_quotes_and_newlines_is_escaped_to_valid_json(repo):
    (repo / "docs" / "factory" / "STATE.md").write_text("Next up: #7 x\n", encoding="utf-8")
    detail = 'line one "quoted"\nline two \\ backslash'
    run_hook(repo, "test", "fast-tests-red", detail)
    entries = lessons(repo)
    assert len(entries) == 1
    assert "quoted" in entries[0]["detail"]
    assert "\\" in entries[0]["detail"]


def test_appends_rather_than_overwrites(repo):
    (repo / "docs" / "factory" / "STATE.md").write_text("Next up: #1 a\n", encoding="utf-8")
    run_hook(repo, "build", "compile-failed", "first")
    run_hook(repo, "test", "pytest-red", "second")
    entries = lessons(repo)
    assert len(entries) == 2
    assert entries[0]["detail"] == "first"
    assert entries[1]["detail"] == "second"
