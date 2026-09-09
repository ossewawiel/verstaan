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


def run_hook_raw(cwd: Path, payload: str) -> subprocess.CompletedProcess[str]:
    """Feed the hook a hand-written JSON payload, for tests about the extraction itself."""
    assert BASH, "bash is required to run the hook"
    return subprocess.run(
        [BASH, str(HOOK)], cwd=cwd, input=payload, capture_output=True, text=True, check=False
    )


@pytest.fixture
def repo_with_upstream(repo: dict[str, Path], tmp_path: Path) -> dict[str, Path]:
    """`repo`, plus a bare `origin` with `main` tracking `origin/main`, the shape a real clone has
    after `git push -u origin main` (docs/factory/git-workflow.md "Pull requests")."""
    origin = tmp_path / "origin.git"
    git(repo["root"], "init", "-q", "--bare", str(origin))
    git(repo["root"], "remote", "add", "origin", str(origin))
    git(repo["root"], "push", "-q", "-u", "origin", "main")
    return repo


@pytest.fixture
def repo_with_untracked_origin(repo: dict[str, Path], tmp_path: Path) -> dict[str, Path]:
    """`repo`, plus a bare `origin` carrying `main`, with an `origin/main` remote-tracking ref but
    NO `branch.main.remote`/`branch.main.merge` set -- `git remote add` + `git fetch`, deliberately
    not `git push -u` or `git clone`, either of which would write that config.

    This is the shape of this repository's own root checkout: it was `git init`-ed locally, and
    `git remote add origin` plus a fetch never retroactively writes tracking config the way a
    clone does. `main@{upstream}` does not resolve here; `origin/main` does.
    """
    origin = tmp_path / "origin.git"
    git(repo["root"], "init", "-q", "--bare", str(origin))
    git(repo["root"], "push", "-q", str(origin), "main")
    git(repo["root"], "remote", "add", "origin", str(origin))
    git(repo["root"], "fetch", "-q", "origin")
    unset = subprocess.run(
        ["git", "config", "--get", "branch.main.remote"],
        cwd=repo["root"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert unset.returncode != 0, (
        "branch.main.remote must stay unset for this fixture to mean anything"
    )
    return repo


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


# Issue 96: a fast-forward of `main` from its own upstream cannot carry unreviewed work, because
# every commit on it already passed the `gate` check on a pull request. That is the one exception
# to "git merge into main is refused outright"; `--ff-only` on its own is not enough, only a
# fast-forward from main's own tracked upstream is.


def test_merge_ff_only_of_mains_own_upstream_is_allowed(repo_with_upstream):
    result = run_hook(repo_with_upstream["root"], "git merge --ff-only origin/main")
    assert result.returncode == 0


def test_merge_ff_only_of_a_different_branch_on_main_is_still_refused(repo):
    result = run_hook(repo["root"], "git merge --ff-only feature")
    assert result.returncode == 2
    assert "gh pr merge" in result.stderr


def test_merge_ff_only_with_no_upstream_configured_is_still_refused(repo):
    # `repo` (unlike `repo_with_upstream`) has no remote, so `main` has no upstream to compare
    # against. The exception cannot apply when there is nothing to resolve it against.
    result = run_hook(repo["root"], "git merge --ff-only origin/main")
    assert result.returncode == 2
    assert "gh pr merge" in result.stderr


# `git pull --ff-only` on `main`, with no explicit repository/refspec, resolves to the same
# fast-forward from main's own tracked upstream as the `git merge --ff-only origin/main` case
# above, by the same reasoning: it can only succeed as a fast-forward, and a fast-forward from the
# tracked upstream cannot carry unreviewed work. An explicit repository/refspec is not covered:
# this hook does not parse enough of `git pull` to know it names the tracked upstream and nothing
# more, so it falls back to the stamp check instead of trying to be clever about it.


def test_pull_ff_only_on_main_is_allowed_without_a_stamp(repo_with_upstream):
    result = run_hook(repo_with_upstream["root"], "git pull --ff-only")
    assert result.returncode == 0


def test_pull_ff_only_with_explicit_remote_on_main_still_requires_stamp(repo_with_upstream):
    result = run_hook(repo_with_upstream["root"], "git pull --ff-only origin main")
    assert result.returncode == 2


# Issue 96, second pass: the real root checkout was `git init`-ed locally, so `main` never got
# `branch.main.remote`/`branch.main.merge` written, even after `git remote add origin` and a
# fetch. `main@{upstream}` never resolves there. `main_upstream()` falls back to `origin/main` by
# name when that ref exists, so the exemption still fires; `repo_with_upstream`'s tests above stay
# the first choice (a configured upstream is trusted before the name-based fallback runs).


def test_merge_ff_only_of_origin_main_is_allowed_without_tracking_config(
    repo_with_untracked_origin,
):
    result = run_hook(repo_with_untracked_origin["root"], "git merge --ff-only origin/main")
    assert result.returncode == 0


def test_merge_ff_only_is_still_refused_with_no_upstream_and_no_origin_main(repo):
    # `repo` has no remote at all, so neither `main@{upstream}` nor `origin/main` resolves. There
    # is nothing to fall back to, so the exemption cannot apply.
    result = run_hook(repo["root"], "git merge --ff-only origin/main")
    assert result.returncode == 2
    assert "gh pr merge" in result.stderr


def test_pull_ff_only_is_allowed_without_tracking_config_when_origin_main_exists(
    repo_with_untracked_origin,
):
    result = run_hook(repo_with_untracked_origin["root"], "git pull --ff-only")
    assert result.returncode == 0


# Issue 96: the old extraction, `sed -n 's/.*"command":[[:space:]]*"\(.*\)".*/\1/p'`, used a
# greedy capture that ran past the command's own closing quote to the last quote in the payload.
# Claude Code always sends a `description` field after `command`, so this was the normal path, not
# an edge case: `git merge --no-ff somebranch` was read with a ref of `branch`, not `somebranch`.


def test_command_extracted_correctly_when_json_has_trailing_fields(repo):
    git(repo["root"], "checkout", "-q", "-b", "not-main")
    git(repo["root"], "branch", "somebranch", "feature")  # a real ref named as the issue's example
    payload = (
        '{"tool_input":{"command":"git merge --no-ff somebranch"},"description":"merge the branch"}'
    )
    result = run_hook_raw(repo["root"], payload)
    assert result.returncode == 2
    assert "no gate stamp for somebranch" in result.stderr


def test_command_with_escaped_quote_and_trailing_field_is_still_gated(repo):
    # A realistic Claude Code payload: a `description` field after `command`, and the command
    # itself contains an escaped double quote. Truncating early here would let a gated command
    # through unnoticed, which is worse than reading the wrong ref.
    git(repo["root"], "checkout", "-q", "-b", "not-main")
    git(repo["root"], "branch", "somebranch", "feature")
    payload = (
        '{"tool_input":{"command":"echo \\"note\\" && git merge --no-ff somebranch"},'
        '"description":"merge the branch"}'
    )
    result = run_hook_raw(repo["root"], payload)
    assert result.returncode == 2
    assert "no gate stamp for somebranch" in result.stderr
