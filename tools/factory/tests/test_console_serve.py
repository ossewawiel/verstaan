# SPDX-License-Identifier: MPL-2.0
"""Tests for tools/factory/hooks/console_serve.sh, the logic behind console-serve.sh.

Rendering tier, never blocking: SessionStart starts the console service from the root tree when
nothing answers on the port, and does nothing when something does. Every path exits 0: a console
that did not start is a stale page, not a broken gate
(docs/factory/issues/95-console-as-a-local-service.md).

`node` is replaced by a stub on a hermetic PATH. The stub answers the health probe (`node -e ...`)
with the exit code in FAKE_HEALTH and records any other invocation, which is how a test tells
"started" from "left alone" without opening a port.
"""

from __future__ import annotations

import os
import subprocess
import time
from pathlib import Path

import pytest

from tools.factory.tests.conftest import BASH, HOOKS_DIR, hermetic_tool_path, init_repo

HOOK = HOOKS_DIR / "console_serve.sh"
NEEDED = ["git", "dirname", "cat", "nohup"]


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    init_repo(root)
    return root


def fake_node(tmp_path: Path) -> tuple[Path, Path]:
    stub_dir = tmp_path / "stub-bin"
    stub_dir.mkdir()
    log = tmp_path / "node-calls.log"
    (stub_dir / "node").write_text(
        'case " $* " in *" -e "*) exit "${FAKE_HEALTH:-1}";; esac\n'
        'printf \'%s\\n\' "$*" >> "$FAKE_LOG"\nexit 0\n',
        encoding="utf-8",
    )
    (stub_dir / "node").chmod(0o755)
    return stub_dir, log


def run_hook(
    cwd: Path, path: str, env: dict[str, str] | None = None
) -> subprocess.CompletedProcess[str]:
    assert BASH, "bash is required to run the hook"
    full = {**os.environ, **(env or {}), "PATH": path}
    return subprocess.run(
        [BASH, str(HOOK)],
        cwd=cwd,
        input="{}",
        capture_output=True,
        text=True,
        check=False,
        env=full,
    )


def add_built_server(repo: Path) -> None:
    server = repo / "apps" / "console" / "dist-server" / "server" / "src" / "index.js"
    server.parent.mkdir(parents=True)
    server.write_text("// stub\n", encoding="utf-8")


def test_no_node_exits_zero_and_says_so(repo, tmp_path):
    path = hermetic_tool_path(tmp_path, NEEDED)
    result = run_hook(repo, path)
    assert result.returncode == 0
    assert "node not on PATH" in result.stderr


def test_missing_serve_script_exits_zero_without_starting(repo, tmp_path):
    stub_dir, log = fake_node(tmp_path)
    path = hermetic_tool_path(tmp_path, NEEDED, stub_dir)
    result = run_hook(repo, path, {"FAKE_LOG": str(log), "FAKE_HEALTH": "1"})
    assert result.returncode == 0
    assert not log.exists()


def test_running_service_is_left_alone(repo, tmp_path):
    add_built_server(repo)
    stub_dir, log = fake_node(tmp_path)
    path = hermetic_tool_path(tmp_path, NEEDED, stub_dir)
    result = run_hook(repo, path, {"FAKE_LOG": str(log), "FAKE_HEALTH": "0"})
    assert result.returncode == 0
    assert "already running" in result.stdout
    assert not log.exists()


def test_service_is_started_when_nothing_answers(repo, tmp_path):
    add_built_server(repo)
    stub_dir, log = fake_node(tmp_path)
    path = hermetic_tool_path(tmp_path, NEEDED, stub_dir)
    result = run_hook(repo, path, {"FAKE_LOG": str(log), "FAKE_HEALTH": "1"})
    assert result.returncode == 0
    assert "started http://127.0.0.1:7864" in result.stdout
    for _ in range(20):  # the start is backgrounded; give the stub a moment to write
        if log.exists():
            break
        time.sleep(0.1)
    assert log.exists()
    assert "dist-server" in log.read_text(encoding="utf-8")


def test_port_comes_from_the_environment(repo, tmp_path):
    add_built_server(repo)
    stub_dir, log = fake_node(tmp_path)
    path = hermetic_tool_path(tmp_path, NEEDED, stub_dir)
    result = run_hook(
        repo, path, {"FAKE_LOG": str(log), "FAKE_HEALTH": "1", "VERSTAAN_CONSOLE_PORT": "7900"}
    )
    assert "http://127.0.0.1:7900" in result.stdout
