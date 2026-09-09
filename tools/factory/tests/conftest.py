# SPDX-License-Identifier: MPL-2.0
"""Shared helpers for the `tools/factory/hooks/` pytest modules.

Every hook test builds a throwaway git repository under `tmp_path` and runs the hook the way
Claude Code does: JSON on stdin, exit code observed (docs/factory/issues/93-hooks-as-tracked-scripts.md).
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from collections.abc import Iterable
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


def hermetic_tool_path(base_dir: Path, tools: Iterable[str], *lead_dirs: Path) -> str:
    """A PATH built entirely from directories this call controls: `lead_dirs` first (typically a
    fixture's own stub directory, e.g. one holding a fake `clang-format`), then one throwaway
    directory under `base_dir` holding a pass-through wrapper for each name in `tools`.

    A directory that happens to hold a POSIX utility a hook needs (`cat`, `sed`, `head`,
    `dirname`, ...) can just as easily hold the real `clang-format`, `ruff` or `node` a test means
    to hide: on Windows that directory is `<Git>/usr/bin`, which sits next to nothing in
    particular; on Linux it is `/usr/bin`, which also holds the system's real `clang-format`
    (docs/factory/issues/93-hooks-as-tracked-scripts.md). "Which directory is tool X in" is not a
    question with a stable answer, so it cannot be the basis for isolation. A directory built for
    nothing but this call, containing nothing but wrappers for names this call named, is.

    Each wrapper is a plain-text `exec "<absolute real path>" "$@"` with no `#!` line at all:
    bash's fallback for a non-executable-format file (`ENOEXEC`) is to interpret it as a shell
    script itself, so no interpreter lookup -- no `env`, no `bash` on this constructed PATH -- is
    needed to run it. Wrappers are not copies (a copied binary can be missing shared-library
    dependencies the original relied on beside it) and not symlinks (creating one needs elevated
    privilege on Windows).
    """
    tool_dir = Path(tempfile.mkdtemp(prefix="hermetic-bin-", dir=base_dir))
    for name in tools:
        real = shutil.which(name)
        if not real:
            raise RuntimeError(
                f"{name!r} is not installed on this machine; cannot build a hermetic PATH "
                "without it. Add it to the machine or drop it from the `tools` this test asks for."
            )
        wrapper = tool_dir / name
        wrapper.write_text(f'exec "{Path(real).resolve()}" "$@"\n', encoding="utf-8")
        wrapper.chmod(0o755)
    return os.pathsep.join([str(d) for d in lead_dirs] + [str(tool_dir)])


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
