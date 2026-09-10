# SPDX-License-Identifier: MPL-2.0
"""Tests for console.sh, the Linux and macOS twin of console.cmd (issue 102).

`node` is a stub on a hermetic PATH: the health probe (`node -e ...`) answers with FAKE_HEALTH,
any other invocation is the server, which records its arguments and then sleeps so the test can
tell whether the launcher waited for it. A fake build output is written so npm is never needed.
"""

from __future__ import annotations

import os
import subprocess
import time
from pathlib import Path

import pytest

from tools.factory.tests.conftest import BASH, hermetic_tool_path, init_repo

SCRIPT = Path(__file__).resolve().parents[3] / "console.sh"
NEEDED = ["git", "dirname", "cat", "nohup", "sleep", "find", "mkdir"]


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    init_repo(root)
    app = root / "apps" / "console"
    (app / "node_modules").mkdir(parents=True)
    (app / "dist").mkdir()
    (app / "dist" / "index.html").write_text("<!doctype html>\n", encoding="utf-8")
    server = app / "dist-server" / "server" / "src" / "index.js"
    server.parent.mkdir(parents=True)
    server.write_text("// stub\n", encoding="utf-8")
    (root / "console.sh").write_bytes(SCRIPT.read_bytes())
    (root / "console.sh").chmod(0o755)
    return root


def fake_node(tmp_path: Path) -> tuple[Path, Path]:
    stub_dir = tmp_path / "stub-bin"
    stub_dir.mkdir()
    log = tmp_path / "node-calls.log"
    (stub_dir / "node").write_text(
        'case " $* " in *" -e "*) exit "${FAKE_HEALTH:-1}";; esac\n'
        'printf \'%s\\n\' "$*" >> "$FAKE_LOG"\nsleep 5\nexit 0\n',
        encoding="utf-8",
    )
    (stub_dir / "node").chmod(0o755)
    return stub_dir, log


def run_launcher(repo: Path, path: str, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    assert BASH, "bash is required"
    return subprocess.run(
        [BASH, "console.sh", "7911", "--no-browser"],
        cwd=repo,
        capture_output=True,
        text=True,
        check=False,
        env={**os.environ, **env, "PATH": path},
        timeout=4,
    )


def test_running_service_is_left_alone(repo, tmp_path):
    stub_dir, log = fake_node(tmp_path)
    path = hermetic_tool_path(tmp_path, NEEDED, stub_dir)
    result = run_launcher(repo, path, {"FAKE_LOG": str(log), "FAKE_HEALTH": "0"})
    assert result.returncode == 0
    assert "already running at http://127.0.0.1:7911" in result.stdout
    assert not log.exists()


def test_starts_the_built_server_and_returns_while_it_runs(repo, tmp_path):
    stub_dir, log = fake_node(tmp_path)
    path = hermetic_tool_path(tmp_path, NEEDED, stub_dir)
    started = time.monotonic()
    result = run_launcher(repo, path, {"FAKE_LOG": str(log), "FAKE_HEALTH": "1"})
    assert result.returncode == 0, result.stderr
    assert "started at http://127.0.0.1:7911" in result.stdout
    assert time.monotonic() - started < 4
    for _ in range(20):
        if log.exists():
            break
        time.sleep(0.1)
    assert "--port 7911" in log.read_text(encoding="utf-8")
