# SPDX-License-Identifier: MPL-2.0
"""Tests for tools/factory/hooks/console_refresh.sh, the logic behind console-refresh.sh.

Fast, non-blocking tier: Stop hook, hook JSON on stdin. Never exits 2 -- a stale console is a
stale page, not a broken gate (docs/factory/issues/93-hooks-as-tracked-scripts.md) -- so there is
no exit-2 path to prove fail-first here. What must be proven fail-first instead is the
`stop_hook_active` guard: without it, the hook would try to regenerate the console again on every
re-invocation of Stop, which is wasted work but, worse, is the same unguarded shape that turns a
blocking hook into an infinite loop. The guard is shared with gate_fast.sh and refresh_console.sh.
"""

from __future__ import annotations

import json
import os
import shutil
import stat
import subprocess
from pathlib import Path

import pytest

from tools.factory.tests.conftest import BASH, HOOKS_DIR, init_repo

HOOK = HOOKS_DIR / "console_refresh.sh"


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    init_repo(root)
    return root


def run_hook(
    cwd: Path, payload: str, env: dict[str, str] | None = None
) -> subprocess.CompletedProcess[str]:
    assert BASH, "bash is required to run the hook"
    full_env = dict(os.environ)
    if env:
        full_env.update(env)
    return subprocess.run(
        [BASH, str(HOOK)],
        cwd=cwd,
        input=payload,
        capture_output=True,
        text=True,
        check=False,
        env=full_env,
    )


def compact(payload: dict) -> str:
    return json.dumps(payload, separators=(",", ":"))


def test_missing_generate_script_does_not_block(repo):
    # tools/console/src/generate.mjs does not exist in this throwaway repo; the hook must exit 0
    # rather than fail because there is nothing to render yet.
    result = run_hook(repo, "{}")
    assert result.returncode == 0


def test_node_not_on_path_does_not_block(repo, monkeypatch):
    (repo / "tools" / "console" / "src").mkdir(parents=True)
    (repo / "tools" / "console" / "src" / "generate.mjs").write_text("", encoding="utf-8")
    # An empty PATH means `command -v node` fails, whatever is installed on the real machine.
    result = run_hook(repo, "{}", env={"PATH": ""})
    assert result.returncode == 0


def marker_node(repo: Path) -> tuple[Path, Path]:
    """A fake `node` on PATH that records that it ran, standing in for a real generate.mjs run."""
    (repo / "tools" / "console" / "src").mkdir(parents=True)
    (repo / "tools" / "console" / "src" / "generate.mjs").write_text("", encoding="utf-8")
    bin_dir = repo / "fakebin"
    bin_dir.mkdir()
    marker = repo / "node-ran.marker"
    node = bin_dir / "node"
    node.write_text(f'#!/usr/bin/env bash\ntouch "{marker.as_posix()}"\n', encoding="utf-8")
    node.chmod(node.stat().st_mode | stat.S_IEXEC)
    return bin_dir, marker


def test_stop_payload_regenerates_the_console(repo):
    bin_dir, marker = marker_node(repo)
    real_bash_dir = str(Path(shutil.which("bash") or "/usr/bin/bash").parent)
    path = os.pathsep.join([str(bin_dir), real_bash_dir, os.environ.get("PATH", "")])
    result = run_hook(repo, compact({}), env={"PATH": path})
    assert result.returncode == 0
    assert marker.is_file(), "the hook should have run node against generate.mjs"


def test_stop_hook_active_skips_regeneration_without_failing(repo):
    """The guard that stops a Stop-hook re-invocation from doing the work again.

    Same repo and fake `node` as the successful-run case above: if the `stop_hook_active` guard
    were missing, this call would still run node and touch the marker. It must not.
    """
    bin_dir, marker = marker_node(repo)
    real_bash_dir = str(Path(shutil.which("bash") or "/usr/bin/bash").parent)
    path = os.pathsep.join([str(bin_dir), real_bash_dir, os.environ.get("PATH", "")])
    result = run_hook(repo, compact({"stop_hook_active": True}), env={"PATH": path})
    assert result.returncode == 0
    assert not marker.is_file(), "stop_hook_active must short-circuit before node ever runs"
