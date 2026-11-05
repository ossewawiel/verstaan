# SPDX-License-Identifier: MPL-2.0
"""Tests for the next-up and last-completed rules in tools/factory/status.py (issue 216).

The fixture snapshots the frontmatter shape that issues 27 to 29, 201, 207, 210, 211 and 213 had
when issue 216 was written. It never reads the live issue files, so a later merge cannot break it.
Expected numbers were derived by hand from the dependency lists below.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

from tools.factory.status import last_completed, load_issues, next_issue
from tools.factory.tests.conftest import git, init_repo
from tools.factory.tests.test_status import issue_file

# n: (milestone, depends_on)
SNAPSHOT = {
    27: ("M4", []),
    28: ("M4", []),
    29: ("M4", [27, 28, 207, 211]),
    201: ("Side", [207]),
    207: ("Side", []),
    210: ("Side", [27, 28, 213]),
    211: ("Side", []),
    213: ("Side", []),
}


def write(tmp: Path, statuses: dict[int, str], overrides: dict[int, str] | None = None) -> list:
    issues_dir = tmp / "issues"
    issues_dir.mkdir(exist_ok=True)
    for old in issues_dir.glob("*.md"):
        old.unlink()
    for n, (ms, deps) in SNAPSHOT.items():
        status = statuses.get(n, "open")
        (issues_dir / f"{n:03d}-x.md").write_text(
            issue_file(
                n,
                status,
                milestone=ms,
                depends=str(deps),
                commit="abc1234" if status == "done" else "null",
            ),
            encoding="utf-8",
        )
    issues, faults = load_issues(issues_dir)
    assert faults == []
    return issues


def test_ready_main_quest_names_itself(tmp_path):
    assert next_issue(write(tmp_path, {})).n == 27


def test_main_quest_blocked_by_side_quests_names_lowest_ready_blocker(tmp_path):
    # 27 and 28 done: 29 waits on 207 and 211, both ready. Lowest is 207.
    assert next_issue(write(tmp_path, {27: "done", 28: "done"})).n == 207


def test_walk_goes_through_blockers_of_blockers(tmp_path):
    snap = dict(SNAPSHOT)
    try:
        SNAPSHOT[29] = ("M4", [201])  # 29 -> 201 -> 207
        assert next_issue(write(tmp_path, {})).n == 27  # 27 is still ready and lowest
        assert next_issue(write(tmp_path, {27: "done", 28: "done", 211: "done"})).n == 207
    finally:
        SNAPSHOT.clear()
        SNAPSHOT.update(snap)


def test_blocker_in_progress_is_not_named(tmp_path):
    got = next_issue(write(tmp_path, {27: "done", 28: "done", 207: "in-progress"}))
    assert got.n == 211


def test_no_ready_blocker_gives_none(tmp_path):
    got = next_issue(
        write(tmp_path, {27: "done", 28: "done", 207: "in-progress", 211: "in-progress"})
    )
    assert got is None


def commit_at(root: Path, name: str, date: str) -> str:
    (root / name).write_text(name, encoding="utf-8")
    git(root, "add", name)
    env = {**os.environ, "GIT_COMMITTER_DATE": date, "GIT_AUTHOR_DATE": date}
    subprocess.run(["git", "commit", "-q", "-m", name], cwd=root, check=True, env=env)
    return git(root, "rev-parse", "HEAD")


def done_issues(tmp: Path, commits: dict[int, str]) -> list:
    d = tmp / "li"
    d.mkdir()
    for n, c in commits.items():
        (d / f"{n:03d}-x.md").write_text(issue_file(n, "done", commit=c), encoding="utf-8")
    return load_issues(d)[0]


def test_last_completed_takes_latest_commit_date_not_highest_number(tmp_path):
    root = tmp_path / "repo"
    init_repo(root)
    newer = commit_at(root, "a", "2030-01-02T00:00:00Z")  # belongs to issue 5
    older = commit_at(root, "b", "2030-01-01T00:00:00Z")  # belongs to issue 9
    issues = done_issues(tmp_path, {5: newer, 9: older})
    assert last_completed(issues, root).n == 5


def test_last_completed_falls_back_to_highest_number_without_readable_commits(tmp_path):
    root = tmp_path / "repo"
    init_repo(root)
    issues = done_issues(tmp_path, {5: "deadbeef", 9: "null"})
    assert last_completed(issues, root).n == 9


def test_last_completed_skips_an_unreadable_commit_when_others_read(tmp_path):
    root = tmp_path / "repo"
    init_repo(root)
    good = commit_at(root, "a", "2030-01-01T00:00:00Z")
    issues = done_issues(tmp_path, {5: good, 9: "deadbeef"})
    assert last_completed(issues, root).n == 5
