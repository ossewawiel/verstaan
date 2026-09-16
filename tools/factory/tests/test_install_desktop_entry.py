# SPDX-License-Identifier: MPL-2.0
"""Tests for tools/console/install-desktop-entry.sh (issue 170).

Runs the real script against a throwaway checkout under tmp_path, with HOME and XDG_DATA_HOME
pointed at another tmp_path directory so nothing here ever touches the developer's own
~/.local/share/applications. `desktop-file-validate` is a real system tool, not something this
script controls the correctness of; where it is missing (CI images vary) the validation checks
are skipped rather than faked.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

from tools.factory.tests.conftest import BASH

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT = REPO_ROOT / "tools" / "console" / "install-desktop-entry.sh"
ICON = REPO_ROOT / "tools" / "console" / "verstaan-console.svg"

DESKTOP_FILE_VALIDATE = shutil.which("desktop-file-validate")


@pytest.fixture
def checkout(tmp_path: Path) -> Path:
    """A throwaway copy of the two files the installer needs, at the same relative layout, so the
    script's own path resolution (script dir -> repo root -> console.sh, icon) is exercised for
    real rather than mocked."""
    root = tmp_path / "checkout"
    (root / "tools" / "console").mkdir(parents=True)
    (root / "console.sh").write_text("#!/usr/bin/env bash\necho stub\n", encoding="utf-8")
    (root / "console.sh").chmod(0o755)
    shutil.copy(SCRIPT, root / "tools" / "console" / "install-desktop-entry.sh")
    (root / "tools" / "console" / "install-desktop-entry.sh").chmod(0o755)
    shutil.copy(ICON, root / "tools" / "console" / "verstaan-console.svg")
    return root


@pytest.fixture
def home(tmp_path: Path) -> Path:
    fake_home = tmp_path / "home"
    fake_home.mkdir()
    return fake_home


def run_installer(checkout: Path, home: Path) -> subprocess.CompletedProcess[str]:
    assert BASH, "bash is required"
    env = {
        **os.environ,
        "HOME": str(home),
        "XDG_DATA_HOME": str(home / ".local" / "share"),
    }
    return subprocess.run(
        [BASH, str(checkout / "tools" / "console" / "install-desktop-entry.sh")],
        cwd=checkout,
        capture_output=True,
        text=True,
        check=False,
        env=env,
        timeout=10,
    )


def entry_path(home: Path) -> Path:
    return home / ".local" / "share" / "applications" / "verstaan-console.desktop"


def test_writes_the_entry_and_exits_zero(checkout, home):
    result = run_installer(checkout, home)
    assert result.returncode == 0, result.stderr
    target = entry_path(home)
    assert target.is_file()
    text = target.read_text(encoding="utf-8")
    assert "Name=Verstaan Console" in text
    assert "StartupWMClass=chrome-127.0.0.1__7864-Default" in text
    # Resolves this checkout's own path -- not a path baked into the installer script.
    assert str(checkout / "console.sh") in text
    assert str(checkout / "tools" / "console" / "verstaan-console.svg") in text


def test_second_run_leaves_the_file_unchanged(checkout, home):
    first = run_installer(checkout, home)
    assert first.returncode == 0, first.stderr
    before = entry_path(home).read_text(encoding="utf-8")

    second = run_installer(checkout, home)
    assert second.returncode == 0, second.stderr
    after = entry_path(home).read_text(encoding="utf-8")

    assert before == after


def test_two_checkouts_name_two_different_console_sh_paths(tmp_path, home):
    """Proves the installer resolves its own checkout's path rather than one hard-coded at write
    time: a second, differently located checkout must produce an entry naming its own console.sh,
    not the first checkout's."""
    first_root = tmp_path / "first"
    second_root = tmp_path / "second"
    for root in (first_root, second_root):
        (root / "tools" / "console").mkdir(parents=True)
        (root / "console.sh").write_text("#!/usr/bin/env bash\necho stub\n", encoding="utf-8")
        (root / "console.sh").chmod(0o755)
        shutil.copy(SCRIPT, root / "tools" / "console" / "install-desktop-entry.sh")
        (root / "tools" / "console" / "install-desktop-entry.sh").chmod(0o755)
        shutil.copy(ICON, root / "tools" / "console" / "verstaan-console.svg")

    run_installer(first_root, home)
    first_text = entry_path(home).read_text(encoding="utf-8")
    assert str(first_root / "console.sh") in first_text

    run_installer(second_root, home)
    second_text = entry_path(home).read_text(encoding="utf-8")
    assert str(second_root / "console.sh") in second_text
    assert str(first_root / "console.sh") not in second_text


@pytest.mark.skipif(
    DESKTOP_FILE_VALIDATE is None,
    reason="desktop-file-validate is not installed on this machine",
)
def test_entry_is_a_valid_desktop_file(checkout, home):
    assert DESKTOP_FILE_VALIDATE
    result = run_installer(checkout, home)
    assert result.returncode == 0, result.stderr

    validated = subprocess.run(
        [DESKTOP_FILE_VALIDATE, str(entry_path(home))],
        capture_output=True,
        text=True,
        check=False,
    )
    assert validated.returncode == 0, validated.stdout + validated.stderr
    assert validated.stdout.strip() == ""
