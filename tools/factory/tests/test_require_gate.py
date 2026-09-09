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
BASH = shutil.which("bash")


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


def test_merge_refused_without_stamp(repo):
    result = run_hook(repo["root"], "git merge --no-ff feature")
    assert result.returncode == 2
    assert "no gate stamp for feature" in result.stderr


def test_merge_allowed_from_root_when_feature_tip_is_stamped(repo):
    # The stamp was made in the worktree; the merge runs in the root tree. That is the whole point.
    stamp(repo["wt"], "HEAD")
    assert run_hook(repo["root"], "git merge --no-ff feature").returncode == 0


def test_merge_refused_when_stamp_is_for_an_older_commit(repo):
    stamp(repo["wt"], "HEAD")
    (repo["wt"] / "c.txt").write_text("c\n", encoding="utf-8")
    git(repo["wt"], "add", "c.txt")
    git(repo["wt"], "commit", "-q", "-m", "one more")
    assert run_hook(repo["root"], "git merge --no-ff feature").returncode == 2


def test_merge_refused_when_current_tree_is_dirty(repo):
    stamp(repo["wt"], "HEAD")
    (repo["root"] / "a.txt").write_text("changed\n", encoding="utf-8")
    result = run_hook(repo["root"], "git merge --no-ff feature")
    assert result.returncode == 2
    assert "dirty" in result.stderr


def test_merge_without_ref_is_refused(repo):
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
