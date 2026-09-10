# SPDX-License-Identifier: MPL-2.0
"""`python -m tools.validate --all` refuses a quest whose `depends_on` names a quest that does
not exist: issue 104. The console draws "blocked by" and "blocks" from `depends_on`, across main
and side quests both, and a dangling number would draw a block that nothing can ever lift. Proven
both ways (docs/standards/testing.md): a tree whose every dependency resolves reports nothing; the
same tree with one number pointing nowhere reports that file and that number.
"""

from __future__ import annotations

from pathlib import Path

from tools.validate.cli import check_issue_dependencies, run

HEAD = (
    'title: "T"\nmilestone: {ms}\nstatus: open\ndepends_on: {deps}\n'
    "agent: implementer\nagents: [implementer]\nmodel: sonnet\neffort: low\n"
    "checkpoint: null\ncommit: null\nworktree: null\ngithub_issue: null\n---\n## What\n\nT.\n"
)


def _issue(n: int, ms: str, deps: str) -> str:
    return f"---\nissue: {n}\n" + HEAD.format(ms=ms, deps=deps)


def _tree(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    issues = root / "docs" / "factory" / "issues"
    issues.mkdir(parents=True)
    (issues / "07-seven.md").write_text(_issue(7, "M1", "[6]"), encoding="utf-8")
    (issues / "06-six.md").write_text(_issue(6, "M0", "[]"), encoding="utf-8")
    # A side quest may block a main quest and the other way round; both directions resolve here.
    (issues / "98-side.md").write_text(_issue(98, "Side", "[7]"), encoding="utf-8")
    (issues / "08-eight.md").write_text(_issue(8, "M1", "[7, 98]"), encoding="utf-8")
    (root / "data" / "languages").mkdir(parents=True)
    return root


def test_resolving_dependencies_report_nothing(tmp_path: Path):
    assert check_issue_dependencies(_tree(tmp_path)) == []


def test_a_dangling_dependency_names_the_file_and_the_number(tmp_path: Path):
    root = _tree(tmp_path)
    (root / "docs" / "factory" / "issues" / "08-eight.md").write_text(
        _issue(8, "M1", "[7, 999]"), encoding="utf-8"
    )
    errors = check_issue_dependencies(root)
    assert len(errors) == 1, errors
    assert "docs/factory/issues/08-eight.md" in errors[0]
    assert "999" in errors[0]


def test_a_quest_depending_on_itself_is_refused(tmp_path: Path):
    root = _tree(tmp_path)
    (root / "docs" / "factory" / "issues" / "06-six.md").write_text(
        _issue(6, "M0", "[6]"), encoding="utf-8"
    )
    errors = check_issue_dependencies(root)
    assert len(errors) == 1 and "itself" in errors[0]


def test_run_all_exits_nonzero_on_a_dangling_dependency(tmp_path: Path, capsys):
    root = _tree(tmp_path)
    (root / "docs" / "factory" / "issues" / "98-side.md").write_text(
        _issue(98, "Side", "[7, 500]"), encoding="utf-8"
    )
    assert run("all", root) == 1
    assert "500" in capsys.readouterr().err


def test_run_all_exits_zero_when_every_dependency_resolves(tmp_path: Path):
    assert run("all", _tree(tmp_path)) == 0
