# SPDX-License-Identifier: MPL-2.0
"""Shared helpers for the `tools/factory/hooks/` pytest modules.

Every hook test builds a throwaway git repository under `tmp_path` and runs the hook the way
Claude Code does: JSON on stdin, exit code observed (docs/factory/issues/93-hooks-as-tracked-scripts.md).
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

HOOKS_DIR = Path(__file__).resolve().parents[1] / "hooks"


def git_bash() -> str | None:
    """The bash that ships with git, which is the one Claude Code's hooks run under.

    On Windows `shutil.which("bash")` from PowerShell finds WSL's `System32\\bash.exe`, which cannot
    open a Windows path and exits 127. Look next to `git.exe` first (`<Git>/bin/bash.exe`), then
    fall back to PATH for Linux and macOS.
    """
    git_exe = shutil.which("git")
    if git_exe:
        for candidate in Path(git_exe).resolve().parents:
            for rel in ("bin/bash.exe", "usr/bin/bash.exe", "bin/bash"):
                if (candidate / rel).is_file():
                    return str(candidate / rel)
    return shutil.which("bash")


BASH = git_bash()


def minimal_unix_path(*lead_dirs: Path) -> str:
    """A PATH of `lead_dirs` (checked first) plus the directories holding the POSIX utilities
    the hook scripts shell out to directly: `cat`, `sed`, `head`, `dirname`, `git`.

    Inheriting the caller's whole PATH is unreliable for a test that means to prove a hook's
    fallback when some tool -- clang-format, ruff, node -- is absent: this machine may have a real
    copy of that tool reachable from a directory that has nothing to do with the ones tests stub,
    and an inherited PATH exposes it anyway, defeating the isolation the test needs. Build PATH
    from the resolved locations of the few tools the hooks actually need instead.
    """
    dirs = [str(d) for d in lead_dirs]
    seen = set(dirs)
    for name in ("cat", "sed", "head", "dirname", "git"):
        found = shutil.which(name)
        if not found:
            continue
        found_dir = str(Path(found).resolve().parent)
        if found_dir not in seen:
            seen.add(found_dir)
            dirs.append(found_dir)
    return os.pathsep.join(dirs)


def git(cwd: Path, *args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=cwd, check=True, capture_output=True, text=True
    ).stdout.strip()


def init_repo(root: Path) -> None:
    """A minimal git repo: one commit, a user identity, nothing else."""
    root.mkdir(parents=True, exist_ok=True)
    git(root, "init", "-q", "-b", "main")
    git(root, "config", "user.email", "t@example.com")
    git(root, "config", "user.name", "t")
    (root / "seed.txt").write_text("seed\n", encoding="utf-8")
    git(root, "add", "seed.txt")
    git(root, "commit", "-q", "-m", "seed")
