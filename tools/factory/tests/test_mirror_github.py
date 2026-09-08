"""Unit tests for tools.factory.mirror_github. No network calls: `gh` is faked throughout.

docs/standards/testing.md: prove a gate fails before trusting it. `test_check_reports_state_drift`
and `test_check_reports_missing_issue` exist to prove `--check` actually fails when GitHub and the
files disagree, not just that it passes when they agree.
"""

from __future__ import annotations

import json
import textwrap
from dataclasses import dataclass
from pathlib import Path

import pytest

from tools.factory import mirror_github as mg

ISSUE_TEXT = textwrap.dedent(
    """\
    ---
    issue: 7
    title: "Mirror the public pages"
    milestone: M1
    status: open
    depends_on: [6]
    agent: implementer
    agents: [implementer]
    model: sonnet
    effort: medium
    checkpoint: null
    commit: null
    worktree: null
    ---
    ## What

    Mirror the public pages and the wiki.

    ## Acceptance criteria

    - Sources listed in `mirror.toml` are fetched.

    ## Not in scope

    Logged-in exports.

    ## Done when

    - [ ] Runs clean twice.
    """
)


def write_issue(tmp_path: Path, text: str = ISSUE_TEXT, name: str = "07-mirror.md") -> Path:
    path = tmp_path / name
    path.write_text(text, encoding="utf-8")
    return path


def test_split_body_stops_before_not_in_scope():
    body = mg._split_body(ISSUE_TEXT)
    assert body.startswith("## What")
    assert "Mirror the public pages and the wiki." in body
    assert "## Acceptance criteria" in body
    assert "## Not in scope" not in body
    assert "Logged-in exports" not in body


def test_parse_issue_file(tmp_path):
    path = write_issue(tmp_path)
    local = mg.parse_issue_file(path)
    assert local.number == 7
    assert local.title == "Mirror the public pages"
    assert local.milestone == "M1"
    assert local.status == "open"
    assert local.agent == "implementer"
    assert local.checkpoint is None
    assert local.github_issue is None
    assert local.github_title == "#07 Mirror the public pages"
    assert local.desired_state == "open"
    assert local.labels == {"milestone:M1", "agent:implementer", "status:open"}


def test_parse_issue_file_missing_field(tmp_path):
    text = ISSUE_TEXT.replace("agent: implementer\n", "")
    path = write_issue(tmp_path, text)
    with pytest.raises(mg.MirrorError, match="agent"):
        mg.parse_issue_file(path)


def test_write_github_issue_field_inserts_when_absent(tmp_path):
    path = write_issue(tmp_path)
    local = mg.parse_issue_file(path)
    mg.write_github_issue_field(local, 123)
    new_text = path.read_text(encoding="utf-8")
    assert "github_issue: 123" in new_text
    # Everything else about the frontmatter and body is untouched.
    assert "worktree: null" in new_text
    assert "Mirror the public pages and the wiki." in new_text


def test_write_github_issue_field_replaces_when_present(tmp_path):
    text = ISSUE_TEXT.replace("worktree: null\n", "worktree: null\ngithub_issue: 5\n")
    path = write_issue(tmp_path, text)
    local = mg.parse_issue_file(path)
    assert local.github_issue == 5
    mg.write_github_issue_field(local, 5)  # no-op, value already correct
    assert path.read_text(encoding="utf-8") == text
    mg.write_github_issue_field(local, 9)
    new_text = path.read_text(encoding="utf-8")
    assert "github_issue: 9" in new_text
    assert "github_issue: 5" not in new_text


def test_find_remote_issue_by_number(tmp_path):
    path = write_issue(
        tmp_path, ISSUE_TEXT.replace("worktree: null\n", "worktree: null\ngithub_issue: 41\n")
    )
    local = mg.parse_issue_file(path)
    remote_issues = [
        {"number": 41, "title": "some renamed title", "state": "open", "labels": []},
        {"number": 42, "title": "#07 Mirror the public pages", "state": "open", "labels": []},
    ]
    found = mg.find_remote_issue(local, remote_issues)
    assert found["number"] == 41  # explicit github_issue wins over title matching


def test_find_remote_issue_by_title_fallback(tmp_path):
    path = write_issue(tmp_path)
    local = mg.parse_issue_file(path)
    remote_issues = [
        {"number": 42, "title": "#07 Mirror the public pages", "state": "open", "labels": []}
    ]
    found = mg.find_remote_issue(local, remote_issues)
    assert found["number"] == 42


def test_find_remote_issue_none(tmp_path):
    path = write_issue(tmp_path)
    local = mg.parse_issue_file(path)
    assert mg.find_remote_issue(local, []) is None


def _remote(**overrides):
    base = {
        "number": 42,
        "title": "#07 Mirror the public pages",
        "body": mg._split_body(ISSUE_TEXT).strip(),
        "state": "open",
        "labels": [
            {"name": "milestone:M1"},
            {"name": "agent:implementer"},
            {"name": "status:open"},
        ],
        "milestone": {"number": 3, "title": "M1"},
    }
    base.update(overrides)
    return base


def test_diff_issue_matches_clean(tmp_path):
    path = write_issue(tmp_path)
    local = mg.parse_issue_file(path)
    diffs = mg.diff_issue(local, _remote(), {"M1": 3})
    assert diffs == []


def test_diff_issue_state_drift_is_reported_not_corrected(tmp_path):
    """The core rule: a GitHub issue closed by hand is drift, never a local-file edit."""
    path = write_issue(tmp_path)  # status: open
    local = mg.parse_issue_file(path)
    diffs = mg.diff_issue(local, _remote(state="closed"), {"M1": 3})
    kinds = [d.kind for d in diffs]
    assert "state-drift" in kinds
    assert local.status == "open"  # parsing never mutates; run() must not touch the file either


def test_diff_issue_missing_labels(tmp_path):
    path = write_issue(tmp_path)
    local = mg.parse_issue_file(path)
    diffs = mg.diff_issue(local, _remote(labels=[{"name": "agent:implementer"}]), {"M1": 3})
    assert any(d.kind == "labels" for d in diffs)


def test_diff_issue_missing_remote(tmp_path):
    path = write_issue(tmp_path)
    local = mg.parse_issue_file(path)
    diffs = mg.diff_issue(local, None, {"M1": 3})
    assert [d.kind for d in diffs] == ["missing"]


@dataclass
class Call:
    args: list[str]
    input_text: str | None


class FakeGhBackend:
    """Enough of `gh api` to drive tools.factory.mirror_github.run() without a network."""

    def __init__(self):
        self.calls: list[Call] = []
        self.milestones = [{"number": 3, "title": "M1"}]
        self.issues: list[dict] = []
        self._next_issue_number = 100

    def __call__(self, cmd, input=None, env=None, capture_output=True, text=True, **kwargs):
        assert cmd[0] == "gh"
        args = cmd[1:]
        self.calls.append(Call(args, input))
        return self._dispatch(args, input)

    def _dispatch(self, args, input_text):
        if args[:2] == ["label", "create"]:
            return _Result(0, "", "")
        assert args[0] == "api"
        path, method = args[1], args[3]
        resource = path.split("/")[3].split("?")[0]  # repos/{owner}/{repo}/{resource}...
        if resource == "milestones" and method == "GET":
            return _Result(0, json.dumps([self.milestones]), "")  # --slurp: one page, wrapped
        if resource == "milestones" and method == "POST":
            body = json.loads(input_text)
            new = {"number": len(self.milestones) + 10, "title": body["title"]}
            self.milestones.append(new)
            return _Result(0, json.dumps(new), "")
        if resource == "issues" and method == "GET":
            return _Result(0, json.dumps([self.issues]), "")  # --slurp: one page, wrapped
        if resource == "issues" and method == "POST":
            body = json.loads(input_text)
            new = {
                "number": self._next_issue_number,
                "title": body["title"],
                "body": body["body"],
                "labels": [{"name": name} for name in body["labels"]],
                "milestone": next(
                    (m for m in self.milestones if m["number"] == body.get("milestone")), None
                ),
                "state": "open",
            }
            self._next_issue_number += 1
            self.issues.append(new)
            return _Result(0, json.dumps(new), "")
        if path.startswith("repos/") and "/issues/" in path and method == "PATCH":
            number = int(path.rsplit("/", 1)[-1])
            body = json.loads(input_text)
            issue = next(i for i in self.issues if i["number"] == number)
            if "state" in body:
                issue["state"] = body["state"]
            if "title" in body:
                issue["title"] = body["title"]
            if "body" in body:
                issue["body"] = body["body"]
            if "labels" in body:
                issue["labels"] = [{"name": n} for n in body["labels"]]
            if "milestone" in body:
                issue["milestone"] = next(
                    (m for m in self.milestones if m["number"] == body["milestone"]), None
                )
            return _Result(0, json.dumps(issue), "")
        raise AssertionError(f"unhandled fake gh call: {args}")


@dataclass
class _Result:
    returncode: int
    stdout: str
    stderr: str


def test_run_apply_creates_issue_and_writes_back(tmp_path):
    path = write_issue(tmp_path)
    backend = FakeGhBackend()
    exit_code = mg.run("ossewawiel/verstaan", tmp_path, check=False, token="x", runner=backend)
    assert exit_code == 0
    assert len(backend.issues) == 1
    created = backend.issues[0]
    assert created["title"] == "#07 Mirror the public pages"
    new_text = path.read_text(encoding="utf-8")
    assert f"github_issue: {created['number']}" in new_text


def test_run_apply_is_idempotent(tmp_path):
    write_issue(tmp_path)
    backend = FakeGhBackend()
    mg.run("ossewawiel/verstaan", tmp_path, check=False, token="x", runner=backend)
    calls_after_first = len(backend.calls)
    mg.run("ossewawiel/verstaan", tmp_path, check=False, token="x", runner=backend)
    assert len(backend.issues) == 1  # never created twice
    assert len(backend.calls) > calls_after_first  # still re-checks, but changes nothing
    assert backend.issues[0]["state"] == "open"


def test_check_reports_missing_issue(tmp_path):
    write_issue(tmp_path)
    backend = FakeGhBackend()
    exit_code = mg.run("ossewawiel/verstaan", tmp_path, check=True, token="x", runner=backend)
    assert exit_code == 1
    assert backend.issues == []  # --check never creates anything


def test_check_passes_when_synced(tmp_path):
    write_issue(tmp_path)
    backend = FakeGhBackend()
    mg.run("ossewawiel/verstaan", tmp_path, check=False, token="x", runner=backend)
    exit_code = mg.run("ossewawiel/verstaan", tmp_path, check=True, token="x", runner=backend)
    assert exit_code == 0


def test_check_reports_state_drift_after_manual_close(tmp_path):
    """Prove the drift check fails: close the (fake) GitHub issue by hand, expect exit 1."""
    path = write_issue(tmp_path)
    backend = FakeGhBackend()
    mg.run("ossewawiel/verstaan", tmp_path, check=False, token="x", runner=backend)
    backend.issues[0]["state"] = "closed"  # the hand-closing this test proves drift for

    exit_code = mg.run("ossewawiel/verstaan", tmp_path, check=True, token="x", runner=backend)
    assert exit_code == 1

    # And the local file must still say status: open -- the drift is reported, not applied.
    assert "status: open" in path.read_text(encoding="utf-8")

    # Reopening on the GitHub side clears the drift.
    backend.issues[0]["state"] = "open"
    exit_code = mg.run("ossewawiel/verstaan", tmp_path, check=True, token="x", runner=backend)
    assert exit_code == 0


def test_main_requires_gh_token(monkeypatch, tmp_path):
    monkeypatch.delenv("GH_TOKEN", raising=False)
    write_issue(tmp_path)
    exit_code = mg.main(["--issues-dir", str(tmp_path), "--repo", "ossewawiel/verstaan"])
    assert exit_code == 1
