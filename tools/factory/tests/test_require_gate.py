# SPDX-License-Identifier: MPL-2.0
"""Tests for tools/factory/hooks/require_gate.sh, the logic behind the require-gate hook.

docs/standards/testing.md: prove the gate fails before trusting it. Every "allowed" case below has
a sibling that shows the same command is refused when the stamp is missing or the tree is dirty.

Each test builds a real repository with a root tree on `main` and a worktree on `feature`, the
shape docs/factory/git-workflow.md prescribes, and runs the hook the way Claude Code does: hook
JSON on stdin, exit 2 to block.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

HOOK = Path(__file__).resolve().parents[1] / "hooks" / "require_gate.sh"


def _git_bash() -> str | None:
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


BASH = _git_bash()


def git(cwd: Path, *args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=cwd, check=True, capture_output=True, text=True
    ).stdout.strip()


@pytest.fixture
def repo(tmp_path: Path) -> dict[str, Path]:
    root = tmp_path / "repo"
    root.mkdir()
    git(root, "init", "-q", "-b", "main")
    git(root, "config", "user.email", "t@example.com")
    git(root, "config", "user.name", "t")
    (root / "a.txt").write_text("a\n", encoding="utf-8")
    git(root, "add", "a.txt")
    git(root, "commit", "-q", "-m", "root")
    wt = root / ".worktrees" / "feature"
    git(root, "worktree", "add", "-q", "-b", "feature", str(wt), "main")
    (wt / "b.txt").write_text("b\n", encoding="utf-8")
    git(wt, "add", "b.txt")
    git(wt, "commit", "-q", "-m", "feature work")
    (root / ".gitignore").write_text(".worktrees/\n", encoding="utf-8")
    git(root, "add", ".gitignore")
    git(root, "commit", "-q", "-m", "ignore worktrees")
    return {"root": root, "wt": wt}


def stamp(cwd: Path, ref: str) -> None:
    sha = git(cwd, "rev-parse", ref)
    common = Path(git(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"))
    (common / "verstaan-gate-stamps").mkdir(exist_ok=True)
    (common / "verstaan-gate-stamps" / sha).touch()


def run_hook(cwd: Path, command: str) -> subprocess.CompletedProcess[str]:
    assert BASH, "bash is required to run the hook"
    payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": command}})
    return subprocess.run(
        [BASH, str(HOOK)], cwd=cwd, input=payload, capture_output=True, text=True, check=False
    )


def test_ungated_command_passes(repo):
    assert run_hook(repo["root"], "git status").returncode == 0


# docs/factory/git-workflow.md "Worktrees": "git merge into main is refused outright, on any
# tree, stamped or not; the pull request ... is the only way in." The stamp check below this
# point in the file still applies to every other gated command, and to `git merge` on any branch
# that is not `main`. The fixture's root tree starts on `main` by design (it is the shape
# git-workflow.md prescribes), so the stamp-only scenarios below check out a non-main branch
# first to exercise the code path the main-block would otherwise shadow.


def test_merge_into_main_is_refused_even_when_stamped(repo):
    stamp(repo["wt"], "HEAD")
    result = run_hook(repo["root"], "git merge --no-ff feature")
    assert result.returncode == 2
    assert "gh pr merge" in result.stderr


def test_merge_into_main_is_refused_without_a_stamp_too(repo):
    result = run_hook(repo["root"], "git merge --no-ff feature")
    assert result.returncode == 2
    assert "gh pr merge" in result.stderr


# git merge-base/-tree/-file are read-only plumbing commands that happen to start with the same
# letters as "git merge". A plain prefix match would hard-refuse them on main with advice about
# opening a PR, which makes no sense for something that never touches a ref.
@pytest.mark.parametrize(
    "command",
    ["git merge-base main HEAD", "git merge-tree main feature", "git merge-file a.txt b.txt c.txt"],
)
def test_merge_plumbing_commands_are_not_blocked_on_main(repo, command):
    result = run_hook(repo["root"], command)
    assert result.returncode == 0


def test_merge_refused_without_stamp(repo):
    git(repo["root"], "checkout", "-q", "-b", "not-main")
    result = run_hook(repo["root"], "git merge --no-ff feature")
    assert result.returncode == 2
    assert "no gate stamp for feature" in result.stderr


def test_merge_allowed_on_a_non_main_branch_when_feature_tip_is_stamped(repo):
    # The stamp was made in the worktree; the merge runs in the root tree, on a branch that is
    # not `main`. That is the whole point: the stamp still gates merges elsewhere.
    git(repo["root"], "checkout", "-q", "-b", "not-main")
    stamp(repo["wt"], "HEAD")
    assert run_hook(repo["root"], "git merge --no-ff feature").returncode == 0


def test_merge_refused_when_stamp_is_for_an_older_commit(repo):
    git(repo["root"], "checkout", "-q", "-b", "not-main")
    stamp(repo["wt"], "HEAD")
    (repo["wt"] / "c.txt").write_text("c\n", encoding="utf-8")
    git(repo["wt"], "add", "c.txt")
    git(repo["wt"], "commit", "-q", "-m", "one more")
    assert run_hook(repo["root"], "git merge --no-ff feature").returncode == 2


def test_merge_refused_when_current_tree_is_dirty(repo):
    git(repo["root"], "checkout", "-q", "-b", "not-main")
    stamp(repo["wt"], "HEAD")
    (repo["root"] / "a.txt").write_text("changed\n", encoding="utf-8")
    result = run_hook(repo["root"], "git merge --no-ff feature")
    assert result.returncode == 2
    assert "dirty" in result.stderr


def test_merge_without_ref_is_refused(repo):
    git(repo["root"], "checkout", "-q", "-b", "not-main")
    result = run_hook(repo["root"], "git merge")
    assert result.returncode == 2
    assert "explicitly" in result.stderr


def test_merge_of_unknown_ref_is_refused(repo):
    assert run_hook(repo["root"], "git merge nope").returncode == 2


@pytest.mark.parametrize(
    "command", ["gh pr ready", "gh pr merge 1 --merge", "git pull", "gh pr create --base main"]
)
def test_head_gated_commands(repo, command):
    assert run_hook(repo["wt"], command).returncode == 2
    stamp(repo["wt"], "HEAD")
    assert run_hook(repo["wt"], command).returncode == 0


def test_draft_pr_is_not_gated(repo):
    assert run_hook(repo["wt"], "gh pr create --draft --base main").returncode == 0


def test_words_inside_a_string_do_not_trigger(repo):
    assert run_hook(repo["root"], 'printf "git merge feature"').returncode == 0


def test_gated_segment_after_and_is_still_gated(repo):
    assert run_hook(repo["root"], "git fetch && git merge --no-ff feature").returncode == 2
