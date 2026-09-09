# SPDX-License-Identifier: MPL-2.0
"""Tests for tools/factory/hooks/gate_fast.sh, the logic behind gate-fast.sh.

Fast, blocking tier: Stop hook, hook JSON on stdin, exit 2 blocks the stop.
docs/factory/issues/93-hooks-as-tracked-scripts.md requires the `stop_hook_active` guard to be
covered by a test showing it actually prevents a loop: without it, a hook that fails on Stop
re-triggers Stop, which runs the hook again, which fails again, forever. Every test below builds
a throwaway repo with `CMakePresets.json` present (so the hook does not exit before reaching the
part under test) but no `engine/`, `apps/` or `tests/` changes, so no real `cmake`/`ctest` call is
ever made -- only the `tools/<tool>/tests` pytest branch is exercised, which is real and fast.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

from tools.factory.tests.conftest import BASH, HOOKS_DIR, git, init_repo


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    init_repo(root)
    (root / "CMakePresets.json").write_text("{}\n", encoding="utf-8")
    (root / "docs" / "factory").mkdir(parents=True)
    (root / "docs" / "factory" / "STATE.md").write_text("Next up: #93 x\n", encoding="utf-8")
    # gate_fast.sh shells out to its sibling scripts by a path built from the repo root (the real
    # layout, where they all live under one tree). Mirror that layout here so the hook under test
    # runs unmodified against an isolated repo, instead of reaching out into the real one.
    fixture_hooks = root / "tools" / "factory" / "hooks"
    fixture_hooks.mkdir(parents=True)
    for name in ("gate_fast.sh", "capture_failure.sh", "refresh_console.sh", "_env.sh"):
        shutil.copy2(HOOKS_DIR / name, fixture_hooks / name)
    return root


def add_tool_with_test(repo: Path, tool: str, test_body: str) -> None:
    tests_dir = repo / "tools" / tool / "tests"
    tests_dir.mkdir(parents=True)
    (tests_dir / "__init__.py").write_text("", encoding="utf-8")
    (tests_dir / "test_it.py").write_text(textwrap.dedent(test_body), encoding="utf-8")
    # A change under tools/<tool>/ is what makes gate-fast.sh notice the tool at all.
    src = repo / "tools" / tool / "__init__.py"
    src.parent.mkdir(parents=True, exist_ok=True)
    src.write_text("", encoding="utf-8")
    # `git status --porcelain` collapses a brand-new directory to one line ("?? tools/<tool>/"),
    # which the hook's `sed` pattern for "tools/<name>/..." cannot parse a tool name out of.
    # Staging (as a real edit inside a tracked tools/ would already be) reports each file, matching
    # what the hook actually sees once tools/<tool>/ is an established part of the tree.
    git(repo, "add", f"tools/{tool}")


def run_hook(cwd: Path, payload: str) -> subprocess.CompletedProcess[str]:
    """Run the copy of gate_fast.sh mirrored into the fixture repo (see the `repo` fixture)."""
    assert BASH, "bash is required to run the hook"
    hook = cwd / "tools" / "factory" / "hooks" / "gate_fast.sh"
    env = dict(os.environ)
    env["PYTHON"] = sys.executable
    return subprocess.run(
        [BASH, str(hook)],
        cwd=cwd,
        input=payload,
        capture_output=True,
        text=True,
        check=False,
        env=env,
    )


def lessons(root: Path) -> list[dict]:
    path = root / "docs" / "factory" / "lessons.jsonl"
    if not path.is_file():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def test_no_relevant_changes_exits_zero(repo):
    result = run_hook(repo, "{}")
    assert result.returncode == 0
    assert lessons(repo) == []


def test_passing_tool_tests_exit_zero(repo):
    add_tool_with_test(repo, "good", "def test_ok():\n    assert True\n")
    result = run_hook(repo, "{}")
    assert result.returncode == 0
    assert lessons(repo) == []


def test_failing_tool_tests_block_with_exit_2_and_are_logged(repo):
    add_tool_with_test(repo, "bad", "def test_fails():\n    assert False\n")
    result = run_hook(repo, "{}")
    assert result.returncode == 2
    assert "gate-fast: pytest failed in tools/bad" in result.stderr
    entries = lessons(repo)
    assert len(entries) == 1
    assert entries[0]["stage"] == "test"
    assert entries[0]["sig"] == "pytest-red"
    assert entries[0]["issue"] == "93"


def test_stop_hook_active_suppresses_a_failure_that_would_otherwise_block(repo):
    """The guard that stops the Stop-hook loop.

    Same repo as the failing-tests case above: without the `stop_hook_active` guard, this second
    call (the one Claude Code makes when it re-invokes Stop hooks after a blocked stop) would
    fail again with exit 2, re-blocking Stop forever. The guard must short-circuit before any of
    that work happens.
    """
    add_tool_with_test(repo, "bad", "def test_fails():\n    assert False\n")

    first = run_hook(repo, "{}")
    assert first.returncode == 2, "the failure must be real, or the guard proves nothing"

    second = run_hook(repo, json.dumps({"stop_hook_active": True}, separators=(",", ":")))
    assert second.returncode == 0
    # No second lesson was appended: the guard exited before the pytest branch ever ran again.
    assert len(lessons(repo)) == 1


def test_unrelated_tool_without_a_tests_directory_is_skipped(repo):
    (repo / "tools" / "notests").mkdir(parents=True)
    (repo / "tools" / "notests" / "__init__.py").write_text("", encoding="utf-8")
    result = run_hook(repo, "{}")
    assert result.returncode == 0
    assert lessons(repo) == []
