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
    # Three shapes of `node` call now cross this stub: the health probe (`-e`, answered by
    # FAKE_HEALTH), the synchronous build-if-stale check console.sh now runs before it ever
    # backgrounds anything (scripts/build-if-stale.mjs -- exits 0 immediately, faithfully: the
    # fixture repo below has no client/src or server/src, so the real script would find nothing
    # stale and return just as fast), and the actual server start, which is the one call this
    # test cares about timing and logging.
    (stub_dir / "node").write_text(
        'case " $* " in\n'
        '  *" -e "*) exit "${FAKE_HEALTH:-1}";;\n'
        '  *"build-if-stale.mjs"*) exit 0;;\n'
        "esac\n"
        'printf \'%s\\n\' "$*" >> "$FAKE_LOG"\nsleep 5\nexit 0\n',
        encoding="utf-8",
    )
    (stub_dir / "node").chmod(0o755)
    return stub_dir, log


def run_launcher(repo: Path, path: str, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return run_launcher_args(repo, path, env, "7911", "--no-browser")


def run_launcher_args(
    repo: Path, path: str, env: dict[str, str], *args: str
) -> subprocess.CompletedProcess[str]:
    assert BASH, "bash is required"
    return subprocess.run(
        [BASH, "console.sh", *args],
        cwd=repo,
        capture_output=True,
        text=True,
        check=False,
        env={**os.environ, **env, "PATH": path},
        timeout=4,
    )


def fake_chromium(tmp_path: Path, name: str = "chromium") -> tuple[Path, Path]:
    """A stand-in for a chromium-class browser: records its own argv, so a test can tell an
    app-window launch from the plain-tab fallback without ever opening a real window."""
    stub_dir = tmp_path / "chromium-stub-bin"
    stub_dir.mkdir()
    log = tmp_path / "chromium-calls.log"
    (stub_dir / name).write_text(
        'printf \'%s\\n\' "$*" >> "$CHROMIUM_LOG"\nexit 0\n', encoding="utf-8"
    )
    (stub_dir / name).chmod(0o755)
    return stub_dir, log


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


def test_app_window_opens_a_chromium_class_browser_not_a_tab(repo, tmp_path):
    """--app-window on an already-running service opens the chromium-class stub with --app=<url>,
    not a plain tab: proves the flag is additive and does not fall back to xdg-open just because a
    browser was requested (issue 170)."""
    node_stub, node_log = fake_node(tmp_path)
    chromium_stub, chromium_log = fake_chromium(tmp_path)
    path = hermetic_tool_path(tmp_path, NEEDED, node_stub, chromium_stub)
    result = run_launcher_args(
        repo,
        path,
        {"FAKE_LOG": str(node_log), "FAKE_HEALTH": "0", "CHROMIUM_LOG": str(chromium_log)},
        "7911",
        "--app-window",
    )
    assert result.returncode == 0, result.stderr
    assert "already running at http://127.0.0.1:7911" in result.stdout
    for _ in range(20):
        if chromium_log.exists():
            break
        time.sleep(0.1)
    assert chromium_log.exists(), "chromium stub was never invoked"
    assert "--app=http://127.0.0.1:7911/" in chromium_log.read_text(encoding="utf-8")


def test_app_window_falls_back_to_a_tab_with_no_chromium_class_browser_on_path(repo, tmp_path):
    """No chromium, chromium-browser, google-chrome, etc. on PATH: --app-window must still open
    something rather than silently do nothing, so it falls back to the plain-tab opener."""
    node_stub, node_log = fake_node(tmp_path)
    xdg_stub = tmp_path / "xdg-stub-bin"
    xdg_stub.mkdir()
    xdg_log = tmp_path / "xdg-open-calls.log"
    (xdg_stub / "xdg-open").write_text(
        'printf \'%s\\n\' "$*" >> "$XDG_LOG"\nexit 0\n', encoding="utf-8"
    )
    (xdg_stub / "xdg-open").chmod(0o755)
    path = hermetic_tool_path(tmp_path, NEEDED, node_stub, xdg_stub)
    result = run_launcher_args(
        repo,
        path,
        {"FAKE_LOG": str(node_log), "FAKE_HEALTH": "0", "XDG_LOG": str(xdg_log)},
        "7911",
        "--app-window",
    )
    assert result.returncode == 0, result.stderr
    assert "no chromium-class browser on PATH" in result.stderr
    for _ in range(20):
        if xdg_log.exists():
            break
        time.sleep(0.1)
    assert xdg_log.exists(), "xdg-open fallback was never invoked"
