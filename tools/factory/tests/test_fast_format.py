# SPDX-License-Identifier: MPL-2.0
"""Tests for tools/factory/hooks/fast_format.sh, the logic behind fast-format.sh.

Auto-fix tier: PostToolUse on Edit|Write, hook JSON with `file_path` on stdin. Never blocks --
there is no exit-2 path here, only exit 0, with formatter failures reported on stderr instead of
swallowed. Formatters are stubbed on PATH so the test does not depend on clang-format or ruff
being installed, and can tell a call happened from one that did not.
"""

from __future__ import annotations

import json
import os
import subprocess
import textwrap
from pathlib import Path

import pytest

from tools.factory.tests.conftest import BASH, HOOKS_DIR, minimal_unix_path

HOOK = HOOKS_DIR / "fast_format.sh"


def _stub(bin_dir: Path, name: str, marker: Path, exit_code: int = 0) -> None:
    """A fake `name` on PATH that records it ran by touching `marker`."""
    script = bin_dir / name
    script.write_text(
        textwrap.dedent(f"""\
            #!/usr/bin/env bash
            printf 'ran\\n' >> "{marker.as_posix()}"
            exit {exit_code}
            """),
        encoding="utf-8",
    )
    script.chmod(0o755)


def run_hook(cwd: Path, file_path: str, bin_dir: Path) -> subprocess.CompletedProcess[str]:
    assert BASH, "bash is required to run the hook"
    # Compact form: the hook's `sed` pattern for `file_path` requires no space after the colon
    # (unlike require_gate.sh's `command` pattern, which tolerates both -- see its own comment).
    payload = json.dumps(
        {"tool_name": "Write", "tool_input": {"file_path": file_path}}, separators=(",", ":")
    )
    env = dict(os.environ)
    # A PATH assembled from just the stub directory plus the resolved locations of the POSIX
    # utilities the hook needs (see minimal_unix_path): the inherited PATH is not trustworthy
    # isolation, since a real clang-format or ruff reachable from elsewhere on this machine would
    # still be found and defeat the "tool is absent" tests below.
    env["PATH"] = minimal_unix_path(bin_dir)
    return subprocess.run(
        [BASH, str(HOOK)],
        cwd=cwd,
        input=payload,
        capture_output=True,
        text=True,
        check=False,
        env=env,
    )


@pytest.fixture
def bin_dir(tmp_path: Path) -> Path:
    d = tmp_path / "bin"
    d.mkdir()
    return d


def test_missing_file_path_is_a_noop(tmp_path, bin_dir):
    result = subprocess.run(
        [BASH, str(HOOK)],
        cwd=tmp_path,
        input="{}",
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0


def test_nonexistent_file_is_a_noop(tmp_path, bin_dir):
    result = run_hook(tmp_path, str(tmp_path / "nope.cpp"), bin_dir)
    assert result.returncode == 0


def test_cpp_file_runs_clang_format_when_present(tmp_path, bin_dir):
    marker = tmp_path / "clang-format.ran"
    _stub(bin_dir, "clang-format", marker)
    target = tmp_path / "thing.cpp"
    target.write_text("int x;\n", encoding="utf-8")
    result = run_hook(tmp_path, str(target), bin_dir)
    assert result.returncode == 0
    assert marker.is_file()


def test_cpp_file_without_clang_format_on_path_reports_and_continues(tmp_path, bin_dir):
    target = tmp_path / "thing.hpp"
    target.write_text("int x;\n", encoding="utf-8")
    result = run_hook(tmp_path, str(target), bin_dir)
    assert result.returncode == 0
    assert "clang-format not on PATH" in result.stderr


def test_clang_format_failure_is_reported_but_does_not_block(tmp_path, bin_dir):
    marker = tmp_path / "clang-format.ran"
    _stub(bin_dir, "clang-format", marker, exit_code=1)
    target = tmp_path / "thing.cc"
    target.write_text("int x;\n", encoding="utf-8")
    result = run_hook(tmp_path, str(target), bin_dir)
    assert result.returncode == 0
    assert "clang-format failed" in result.stderr


def test_python_file_runs_ruff_format_when_present(tmp_path, bin_dir):
    marker = tmp_path / "ruff.ran"
    _stub(bin_dir, "ruff", marker)
    target = tmp_path / "thing.py"
    target.write_text("x = 1\n", encoding="utf-8")
    result = run_hook(tmp_path, str(target), bin_dir)
    assert result.returncode == 0
    assert marker.is_file()


def test_python_file_without_ruff_on_path_reports_and_continues(tmp_path, bin_dir):
    target = tmp_path / "thing.py"
    target.write_text("x = 1\n", encoding="utf-8")
    result = run_hook(tmp_path, str(target), bin_dir)
    assert result.returncode == 0
    assert "ruff not on PATH" in result.stderr


def test_other_extensions_are_left_alone(tmp_path, bin_dir):
    marker_c = tmp_path / "clang-format.ran"
    marker_r = tmp_path / "ruff.ran"
    _stub(bin_dir, "clang-format", marker_c)
    _stub(bin_dir, "ruff", marker_r)
    target = tmp_path / "notes.md"
    target.write_text("hello\n", encoding="utf-8")
    result = run_hook(tmp_path, str(target), bin_dir)
    assert result.returncode == 0
    assert not marker_c.is_file()
    assert not marker_r.is_file()
