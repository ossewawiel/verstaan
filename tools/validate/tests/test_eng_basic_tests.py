# SPDX-License-Identifier: MPL-2.0
"""Issue 187: `data/languages/eng/tests/basic.yaml` and its fixture twin.

The data file holds the fifteen fixed-set rows with `rules`. The fixture under
`tests/fixtures/languages/eng/tests/basic.yaml` holds the same rows without it. The two must agree
row for row on every other key, and the `rules` lists must agree with the "rule ids" column of
docs/factory/issues/24-test-cases.md and resolve in the real stores. Each comparison is a pure
function, so a test can feed it a changed copy and watch it report (docs/standards/testing.md).
"""

from __future__ import annotations

import copy
import re
from pathlib import Path

import yaml

from tools.validate.store import check_rule_references

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_PATH = REPO_ROOT / "data" / "languages" / "eng" / "tests" / "basic.yaml"
FIXTURE_PATH = REPO_ROOT / "tests" / "fixtures" / "languages" / "eng" / "tests" / "basic.yaml"
TABLE_PATH = REPO_ROOT / "docs" / "factory" / "issues" / "24-test-cases.md"
ROW_COUNT = 15


def _rows(path: Path) -> list[dict]:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def drift(data_rows: list[dict], fixture_rows: list[dict]) -> list[str]:
    """Row-for-row differences between the data file (minus `rules`) and the fixture."""
    problems: list[str] = []
    if len(data_rows) != len(fixture_rows):
        problems.append(f"row count: data {len(data_rows)}, fixture {len(fixture_rows)}")
    for index, (data, fixture) in enumerate(zip(data_rows, fixture_rows, strict=False)):
        stripped = {k: v for k, v in data.items() if k != "rules"}
        if stripped != fixture:
            problems.append(f"row {index} ({fixture.get('id')}): data and fixture differ")
    return problems


def table_rules(table_path: Path) -> dict[str, list[str]]:
    """`id -> rule ids` from the first block A table; `—` is an empty list."""
    found: dict[str, list[str]] = {}
    for line in table_path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"\| (A\d\d) \|", line)
        columns = [c.strip() for c in line.split("|")]
        if not match or len(columns) < 10 or match.group(1) in found:
            continue
        raw = re.sub(r" \(diverges\)", "", columns[8].replace("`", ""))
        found[match.group(1)] = [] if raw == "—" else [r.strip() for r in raw.split(",")]
    return found


def test_data_file_holds_the_fifteen_rows_with_rules_and_review():
    rows = _rows(DATA_PATH)
    assert len(rows) == ROW_COUNT
    for row in rows:
        assert isinstance(row["rules"], list), row["id"]
        assert row["review"] in ("pending", "confirmed"), row["id"]


def test_data_file_and_fixture_agree_row_for_row():
    assert drift(_rows(DATA_PATH), _rows(FIXTURE_PATH)) == []


def test_drift_is_reported_when_a_value_changes():
    data = _rows(DATA_PATH)
    changed = copy.deepcopy(data)
    changed[3]["expected"] = "boekies"
    problems = drift(changed, _rows(FIXTURE_PATH))
    assert problems == ["row 3 (A04): data and fixture differ"]


def test_drift_is_reported_when_a_row_is_missing():
    data = _rows(DATA_PATH)[:-1]
    assert drift(data, _rows(FIXTURE_PATH)) == ["row count: data 14, fixture 15"]


def test_drift_ignores_the_rules_key():
    data = _rows(DATA_PATH)
    data[1]["rules"] = ["eng-ana-1"]
    assert drift(data, _rows(FIXTURE_PATH)) == []


def test_rules_match_the_rule_ids_column_of_the_test_case_table():
    expected = table_rules(TABLE_PATH)
    actual = {row["id"]: row["rules"] for row in _rows(DATA_PATH)}
    assert actual == expected


def test_every_rule_of_the_data_file_resolves_in_the_real_stores():
    assert check_rule_references(REPO_ROOT / "data" / "languages" / "eng") == []
