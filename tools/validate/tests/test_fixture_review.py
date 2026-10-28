# SPDX-License-Identifier: MPL-2.0
"""Issue 185: every row of the fixed sentence set carries the owner's `review` mark.

Two things are proven, each both ways (docs/standards/testing.md). The validator refuses a row
with no `review` key and a row with an unknown value, and accepts a tree where every row is
`pending` or `confirmed`. The `review` column of docs/factory/issues/24-test-cases.md and the
YAML twin agree row for row, and the comparison reports a disagreement when one value is changed.
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path

import yaml

from tools.validate.cli import REVIEW_VALUES, check_fixture_reviews, run

REPO_ROOT = Path(__file__).resolve().parents[3]
TABLE_PATH = REPO_ROOT / "docs" / "factory" / "issues" / "24-test-cases.md"
FIXTURE_REL = Path("tests/fixtures/languages/eng/tests/basic.yaml")
EXPECTED_ROWS = 15


def read_table_reviews(table_path: Path) -> dict[str, str]:
    """`id -> review` from the block A table: the header names the `review` column."""
    reviews: dict[str, str] = {}
    column = None
    for line in table_path.read_text(encoding="utf-8").splitlines():
        if not line.startswith("|"):
            column = None  # a table ends at the first line that is not a row
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if cells[0] == "id" and "review" in cells:
            column = cells.index("review")
        elif column is not None and re.fullmatch(r"A\d\d", cells[0]):
            reviews[cells[0]] = cells[column]
    return reviews


def read_yaml_reviews(path: Path) -> dict[str, str | None]:
    rows = yaml.safe_load(path.read_text(encoding="utf-8"))
    return {str(r["id"]): r.get("review") for r in rows}


def diff_table_and_yaml(table_path: Path, yaml_path: Path) -> list[str]:
    table = read_table_reviews(table_path)
    twin = read_yaml_reviews(yaml_path)
    errors = [
        f"{row_id}: table says {table.get(row_id)!r}, YAML says {twin.get(row_id)!r}"
        for row_id in sorted(set(table) | set(twin))
        if table.get(row_id) != twin.get(row_id)
    ]
    return errors


def _tree(tmp_path: Path) -> Path:
    target = tmp_path / FIXTURE_REL
    target.parent.mkdir(parents=True)
    shutil.copy(REPO_ROOT / FIXTURE_REL, target)
    return tmp_path


def _rewrite(root: Path, mutate) -> None:
    path = root / FIXTURE_REL
    rows = yaml.safe_load(path.read_text(encoding="utf-8"))
    mutate(rows)
    path.write_text(yaml.safe_dump(rows, sort_keys=False, allow_unicode=True), encoding="utf-8")


# ---- table and YAML agree ------------------------------------------------------------------


def test_table_and_yaml_hold_fifteen_rows():
    assert len(read_table_reviews(TABLE_PATH)) == EXPECTED_ROWS
    assert len(read_yaml_reviews(REPO_ROOT / FIXTURE_REL)) == EXPECTED_ROWS


def test_table_and_yaml_reviews_agree_row_for_row():
    assert diff_table_and_yaml(TABLE_PATH, REPO_ROOT / FIXTURE_REL) == []


def test_disagreement_is_reported(tmp_path):
    root = _tree(tmp_path)

    table_value = read_table_reviews(TABLE_PATH)["A04"]
    other = next(v for v in REVIEW_VALUES if v != table_value)

    def flip(rows):
        rows[3]["review"] = other

    _rewrite(root, flip)
    assert diff_table_and_yaml(TABLE_PATH, root / FIXTURE_REL) == [
        f"A04: table says {table_value!r}, YAML says {other!r}"
    ]


def test_row_missing_from_yaml_is_reported(tmp_path):
    root = _tree(tmp_path)
    _rewrite(root, lambda rows: rows.pop())
    table_value = read_table_reviews(TABLE_PATH)["A15"]
    assert diff_table_and_yaml(TABLE_PATH, root / FIXTURE_REL) == [
        f"A15: table says {table_value!r}, YAML says None"
    ]


# ---- the validator -------------------------------------------------------------------------


def test_validator_accepts_the_real_fixture():
    assert check_fixture_reviews(REPO_ROOT) == []


def test_validator_accepts_confirmed(tmp_path):
    root = _tree(tmp_path)
    _rewrite(root, lambda rows: rows[0].update(review="confirmed"))
    assert check_fixture_reviews(root) == []


def test_validator_refuses_a_missing_review_key(tmp_path):
    root = _tree(tmp_path)
    _rewrite(root, lambda rows: rows[2].pop("review"))
    assert check_fixture_reviews(root) == [f"{FIXTURE_REL.as_posix()}[2] (A03): missing review"]


def test_validator_refuses_an_unknown_value(tmp_path):
    root = _tree(tmp_path)
    _rewrite(root, lambda rows: rows[1].update(review="approved"))
    assert check_fixture_reviews(root) == [
        (
            f"{FIXTURE_REL.as_posix()}[1] (A02): review is 'approved', "
            f"expected one of {', '.join(REVIEW_VALUES)}"
        )
    ]


def test_all_mode_fails_on_a_missing_review_key(tmp_path, capsys):
    root = _tree(tmp_path)
    _rewrite(root, lambda rows: rows[0].pop("review"))
    assert run("all", root) == 1
    assert "A01): missing review" in capsys.readouterr().err


def test_invented_fixture_pair_is_exempt():
    # xxa and xxb rows carry no review key and must stay valid.
    assert check_fixture_reviews(REPO_ROOT) == []
    assert not any(
        "review" in r
        for r in yaml.safe_load(
            (REPO_ROOT / "tests/fixtures/languages/xxa/tests/basic.yaml").read_text("utf-8")
        )
    )
