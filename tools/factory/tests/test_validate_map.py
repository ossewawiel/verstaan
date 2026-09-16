# SPDX-License-Identifier: MPL-2.0
"""`python -m tools.factory.validate_map` refuses a tile-prefix mismatch (ADR 0015, issue 177).

Proven both ways (docs/standards/testing.md): a fixture with a missing tile fails first, red;
adding the tile turns it green. The same pair for the other direction, a tile with no issue file.
"""

from __future__ import annotations

from pathlib import Path

import yaml

from tools.factory.validate_map import check_map, issue_prefixes, main


def _issue(tmp_path: Path, number: str, slug: str = "quest") -> None:
    issues = tmp_path / "docs" / "factory" / "issues"
    issues.mkdir(parents=True, exist_ok=True)
    (issues / f"{number}-{slug}.md").write_text(
        f'---\nissue: {int(number)}\ntitle: "T"\nmilestone: M0\nstatus: open\n---\n## What\n',
        encoding="utf-8",
    )


def _tile(
    tile_id: str, region: str = "m0", x: int = 0, y: int = 0, size: int = 10, title: str = "T"
) -> dict:
    return {"id": tile_id, "region": region, "title": title, "x": x, "y": y, "size": size}


def _write_map(tmp_path: Path, tiles: list[dict], regions: list[dict] | None = None) -> None:
    regions = regions or [{"id": "m0", "name": "M0", "goal": "g", "x": 0, "y": 0, "size": 100}]
    doc = {"regions": regions, "tiles": tiles}
    (tmp_path / "docs" / "factory").mkdir(parents=True, exist_ok=True)
    (tmp_path / "docs" / "factory" / "map.yaml").write_text(
        yaml.dump(doc, sort_keys=False), encoding="utf-8"
    )


def test_issue_prefixes_collapses_two_files_sharing_one_prefix(tmp_path: Path):
    _issue(tmp_path, "04", "fixture-language-pair")
    _issue(tmp_path, "04", "test-cases")
    assert issue_prefixes(tmp_path / "docs" / "factory" / "issues") == {"04"}


def test_a_missing_tile_is_refused_first_then_passes_once_added(tmp_path: Path):
    _issue(tmp_path, "01")
    _issue(tmp_path, "02")
    # Red: only 01 has a tile, 02 does not.
    _write_map(tmp_path, tiles=[_tile("01")])
    errors = check_map(tmp_path)
    assert len(errors) == 1, errors
    assert "issue prefix 02 has no tile" in errors[0]

    # Green: the tile for 02 is added, nothing else changed.
    _write_map(tmp_path, tiles=[_tile("01"), _tile("02", x=20)])
    assert check_map(tmp_path) == []


def test_a_tile_with_no_matching_issue_file_is_refused(tmp_path: Path):
    _issue(tmp_path, "01")
    _write_map(tmp_path, tiles=[_tile("01"), _tile("99", x=20)])
    errors = check_map(tmp_path)
    assert len(errors) == 1, errors
    assert "tile 99 matches no issue file" in errors[0]


def test_a_tile_naming_an_unknown_region_is_refused(tmp_path: Path):
    _issue(tmp_path, "01")
    _write_map(tmp_path, tiles=[_tile("01", region="nowhere")])
    errors = check_map(tmp_path)
    assert any("unknown region" in e for e in errors), errors


def test_a_tile_missing_a_position_field_is_refused(tmp_path: Path):
    _issue(tmp_path, "01")
    tile = _tile("01")
    del tile["size"]
    _write_map(tmp_path, tiles=[tile])
    errors = check_map(tmp_path)
    assert any("missing size" in e for e in errors), errors


def test_a_tile_missing_its_title_is_refused(tmp_path: Path):
    _issue(tmp_path, "01")
    tile = _tile("01")
    del tile["title"]
    _write_map(tmp_path, tiles=[tile])
    errors = check_map(tmp_path)
    assert any("missing title" in e for e in errors), errors


def test_an_unquoted_numeric_tile_id_is_refused_not_silently_coerced(tmp_path: Path):
    # yaml.dump would just re-quote a Python str back to '08'; this fixture writes the raw YAML
    # by hand so the tile id genuinely loads as the integer 8, the way an unquoted `id: 08` in a
    # hand-edited map.yaml would (checkpoint-4 finding: PyYAML vs the yaml npm package disagree
    # on this exact shape).
    _issue(tmp_path, "08")
    (tmp_path / "docs" / "factory").mkdir(parents=True, exist_ok=True)
    (tmp_path / "docs" / "factory" / "map.yaml").write_text(
        "regions:\n"
        "  - {id: m0, name: M0, goal: g, x: 0, y: 0, size: 100}\n"
        "tiles:\n"
        "  - {id: 8, region: m0, title: T, x: 0, y: 0, size: 10}\n",
        encoding="utf-8",
    )
    errors = check_map(tmp_path)
    assert any("did not load as a string" in e for e in errors), errors
    # And the (still-unmet) issue prefix is reported too -- the bad id never silently matched it.
    assert any("issue prefix 08 has no tile" in e for e in errors), errors


def test_a_duplicate_tile_id_is_refused(tmp_path: Path):
    _issue(tmp_path, "01")
    _write_map(tmp_path, tiles=[_tile("01"), _tile("01", x=20)])
    errors = check_map(tmp_path)
    assert any("tile id '01' is used 2 times" in e for e in errors), errors


def test_a_duplicate_region_id_is_refused(tmp_path: Path):
    _issue(tmp_path, "01")
    regions = [
        {"id": "m0", "name": "M0", "goal": "g", "x": 0, "y": 0, "size": 100},
        {"id": "m0", "name": "M0 again", "goal": "g", "x": 200, "y": 0, "size": 100},
    ]
    _write_map(tmp_path, tiles=[_tile("01")], regions=regions)
    errors = check_map(tmp_path)
    assert any("region id 'm0' is used 2 times" in e for e in errors), errors


def test_main_exits_nonzero_on_a_mismatch(tmp_path: Path, capsys):
    _issue(tmp_path, "01")
    _issue(tmp_path, "02")
    _write_map(tmp_path, tiles=[_tile("01")])
    assert main(["--repo-root", str(tmp_path)]) == 1
    assert "02" in capsys.readouterr().err


def test_main_exits_zero_when_every_prefix_and_tile_match(tmp_path: Path):
    _issue(tmp_path, "01")
    _write_map(tmp_path, tiles=[_tile("01")])
    assert main(["--repo-root", str(tmp_path)]) == 0


def test_missing_map_file_refuses_every_issue_prefix(tmp_path: Path):
    _issue(tmp_path, "01")
    errors = check_map(tmp_path)
    assert len(errors) == 1
    assert "issue prefix 01 has no tile" in errors[0]
