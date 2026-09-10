# SPDX-License-Identifier: MPL-2.0
"""`python -m tools.validate --all` refuses a quest file without its loadout: issue 103.

Every issue file names the agent, model and effort that take it (SPEC.md §6). The console shows
them on the card, the routing table reads them, and a quest without them cannot be embarked on.
Proven both ways, as docs/standards/testing.md asks: a tree where every quest carries the three
reports nothing; the same tree with one field stripped reports that file and that field.
"""

from __future__ import annotations

from pathlib import Path

from tools.validate.cli import check_issue_loadouts, run

FULL = (
    '---\nissue: 7\ntitle: "Seven"\nmilestone: M1\nstatus: open\ndepends_on: []\n'
    "agent: implementer\nagents: [implementer]\nmodel: sonnet\neffort: medium\n"
    "checkpoint: null\ncommit: null\nworktree: null\ngithub_issue: null\n---\n## What\n\nSeven.\n"
)


def _tree(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    issues = root / "docs" / "factory" / "issues"
    issues.mkdir(parents=True)
    (issues / "07-seven.md").write_text(FULL, encoding="utf-8")
    # A test-cases companion carries no frontmatter and is not a quest (the console skips it too).
    (issues / "04-test-cases.md").write_text("# Issue 04 — test cases\n", encoding="utf-8")
    (root / "data" / "languages").mkdir(parents=True)
    return root


def test_a_full_loadout_reports_nothing(tmp_path: Path):
    assert check_issue_loadouts(_tree(tmp_path)) == []


def test_each_missing_field_is_named(tmp_path: Path):
    root = _tree(tmp_path)
    for field in ("agent", "model", "effort"):
        stripped = "".join(
            line for line in FULL.splitlines(keepends=True) if not line.startswith(f"{field}:")
        )
        (root / "docs" / "factory" / "issues" / "07-seven.md").write_text(
            stripped, encoding="utf-8"
        )
        errors = check_issue_loadouts(root)
        assert len(errors) == 1, errors
        assert "docs/factory/issues/07-seven.md" in errors[0]
        assert field in errors[0]


def test_an_empty_value_counts_as_missing(tmp_path: Path):
    root = _tree(tmp_path)
    (root / "docs" / "factory" / "issues" / "07-seven.md").write_text(
        FULL.replace("model: sonnet", "model:"), encoding="utf-8"
    )
    errors = check_issue_loadouts(root)
    assert len(errors) == 1 and "model" in errors[0]


def test_run_all_exits_nonzero_without_a_loadout(tmp_path: Path, capsys):
    root = _tree(tmp_path)
    (root / "docs" / "factory" / "issues" / "07-seven.md").write_text(
        FULL.replace("effort: medium\n", ""), encoding="utf-8"
    )
    assert run("all", root) == 1
    assert "effort" in capsys.readouterr().err


def test_run_all_exits_zero_with_every_loadout(tmp_path: Path):
    assert run("all", _tree(tmp_path)) == 0
