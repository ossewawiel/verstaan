# SPDX-License-Identifier: MPL-2.0
"""Tests for tools.factory.retro_promote (issue 176, decision 2).

docs/standards/testing.md: prove a gate fails before trusting it. The two refusal tests below
exist to prove the write path stays closed -- neither the target file nor the ledger changes --
until a signature that is really in the ledger, and a target that is really allowed, are both
given.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tools.factory import retro_promote as rp


def _write_lessons(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf8")


def test_target_is_allowed_matches_the_named_shapes() -> None:
    assert rp.target_is_allowed("docs/standards/testing.md")
    assert rp.target_is_allowed("docs/adr/0011-console-actions-run-only-allow-listed-scripts.md")
    assert rp.target_is_allowed(".claude/agents/implementer.md")
    assert rp.target_is_allowed(".claude/skills/factory-retro/SKILL.md")
    assert rp.target_is_allowed("CLAUDE.md")


def test_target_is_allowed_refuses_anything_else() -> None:
    assert not rp.target_is_allowed("docs/glossary.md")
    assert not rp.target_is_allowed("engine/include/verstaan/core.hpp")
    assert not rp.target_is_allowed("docs/standards/../../../etc/passwd")
    assert not rp.target_is_allowed("../CLAUDE.md")


def test_refuses_a_signature_not_in_the_ledger_and_writes_nothing(tmp_path: Path) -> None:
    repo = tmp_path
    lessons = repo / "docs" / "factory" / "lessons.jsonl"
    _write_lessons(lessons, [{"sig": "other-sig", "ts": "2026-01-01"}])
    target = repo / "docs" / "standards" / "testing.md"
    target.parent.mkdir(parents=True)
    target.write_text("# Testing\n", encoding="utf8")
    before_target = target.read_text(encoding="utf8")
    before_lessons = lessons.read_text(encoding="utf8")

    with pytest.raises(rp.PromoteError):
        rp.apply_promotion(
            repo_root=repo,
            lessons_path=lessons,
            sig="missing-sig",
            target_rel="docs/standards/testing.md",
            rule="- A new rule.",
        )

    assert target.read_text(encoding="utf8") == before_target
    assert lessons.read_text(encoding="utf8") == before_lessons


def test_refuses_a_target_outside_the_allowed_shapes_and_writes_nothing(tmp_path: Path) -> None:
    repo = tmp_path
    lessons = repo / "docs" / "factory" / "lessons.jsonl"
    _write_lessons(lessons, [{"sig": "fast-tests-red", "ts": "2026-01-01"}])
    before_lessons = lessons.read_text(encoding="utf8")

    with pytest.raises(rp.PromoteError):
        rp.apply_promotion(
            repo_root=repo,
            lessons_path=lessons,
            sig="fast-tests-red",
            target_rel="docs/glossary.md",
            rule="- A new rule.",
        )

    assert lessons.read_text(encoding="utf8") == before_lessons
    assert not (repo / "docs" / "glossary.md").exists()


def test_a_listing_or_grouping_call_never_writes(tmp_path: Path) -> None:
    """read_lessons/sig_present (the calls a Debrief listing would make) touch the ledger read-only,
    never as a side effect of being called (issue 176 "Not in scope": no new lesson-writing path
    beyond an explicit, approved promotion)."""
    repo = tmp_path
    lessons = repo / "docs" / "factory" / "lessons.jsonl"
    _write_lessons(
        lessons,
        [
            {"sig": "fast-tests-red", "ts": "2026-01-01"},
            {"sig": "fast-tests-red", "ts": "2026-01-02"},
        ],
    )
    before = lessons.read_text(encoding="utf8")

    assert rp.sig_present(lessons, "fast-tests-red") is True
    assert len(rp.read_lessons(lessons)) == 2

    assert lessons.read_text(encoding="utf8") == before


def test_approved_promotion_appends_the_rule_and_removes_the_signature(tmp_path: Path) -> None:
    repo = tmp_path
    lessons = repo / "docs" / "factory" / "lessons.jsonl"
    _write_lessons(
        lessons,
        [
            {"sig": "fast-tests-red", "ts": "2026-01-01", "detail": "first"},
            {"sig": "fast-tests-red", "ts": "2026-01-02", "detail": "second"},
            {"sig": "other-sig", "ts": "2026-01-03", "detail": "unrelated"},
        ],
    )
    target = repo / "docs" / "standards" / "testing.md"
    target.parent.mkdir(parents=True)
    target.write_text("# Testing\n\nExisting content.\n", encoding="utf8")

    rp.apply_promotion(
        repo_root=repo,
        lessons_path=lessons,
        sig="fast-tests-red",
        target_rel="docs/standards/testing.md",
        rule="- Run the fast gate twice before trusting a green run.",
    )

    text = target.read_text(encoding="utf8")
    assert text.startswith("# Testing\n\nExisting content.\n")
    assert "Run the fast gate twice before trusting a green run." in text

    remaining = rp.read_lessons(lessons)
    assert [r["sig"] for r in remaining] == ["other-sig"]


def test_main_exits_2_on_refusal_and_prints_to_stderr(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    repo = tmp_path
    lessons = repo / "docs" / "factory" / "lessons.jsonl"
    _write_lessons(lessons, [])
    code = rp.main(
        [
            "--sig",
            "nope",
            "--target",
            "docs/standards/testing.md",
            "--rule",
            "x",
            "--repo-root",
            str(repo),
            "--lessons",
            str(lessons),
        ]
    )
    assert code == 2
    captured = capsys.readouterr()
    assert "nope" in captured.err
