# SPDX-License-Identifier: MPL-2.0
"""`tools.mirror.stuck`: the manifest-only worklist of unfinished exports (SPEC.md §3.1,
issue 117). No client, no request — every test here works from a fixture manifest file."""

from __future__ import annotations

from tools.mirror.manifest import append_entries
from tools.mirror.stuck import StuckEntry, find_stuck, format_stuck_report, timeout_paths


def _write(path, entries):
    append_entries(path, entries)


def test_find_stuck_lists_timeout_and_error_but_not_ok_or_empty(tmp_path):
    path = tmp_path / "manifest.jsonl"
    _write(
        path,
        [
            {"path": "exports/afr/a.zip", "status": "timeout", "language": "afr"},
            {"path": "exports/afr/b.zip", "status": "error", "language": "afr"},
            {"path": "exports/afr/c.zip", "language": "afr"},  # ok: no status field
            {"path": "exports/afr/d.zip", "status": "empty", "language": "afr"},
        ],
    )
    stuck = find_stuck(path)
    assert {e.path for e in stuck} == {"exports/afr/a.zip", "exports/afr/b.zip"}


def test_find_stuck_takes_the_latest_line_per_path(tmp_path):
    """A path with an old `timeout` line and a newer `ok` line is not listed."""
    path = tmp_path / "manifest.jsonl"
    _write(
        path,
        [
            {"path": "exports/afr/a.zip", "status": "timeout", "language": "afr"},
            {"path": "exports/afr/a.zip", "language": "afr"},  # landed on retry
        ],
    )
    assert find_stuck(path) == []


def test_find_stuck_falls_back_to_unknown_language(tmp_path):
    path = tmp_path / "manifest.jsonl"
    _write(path, [{"path": "exports/export_dic.php__x", "status": "error", "language": None}])
    stuck = find_stuck(path)
    assert stuck == [
        StuckEntry(path="exports/export_dic.php__x", status="error", language="unknown")
    ]


def test_timeout_paths_holds_only_timeout_entries_with_their_full_record(tmp_path):
    path = tmp_path / "manifest.jsonl"
    _write(
        path,
        [
            {
                "path": "exports/afr/a.zip",
                "status": "timeout",
                "language": "afr",
                "url": "https://unlarchive.org/dics/af_ana_a_c_ucl.zip",
            },
            {"path": "exports/afr/b.zip", "status": "error", "language": "afr"},
        ],
    )
    result = timeout_paths(path)
    assert set(result) == {"exports/afr/a.zip"}
    assert result["exports/afr/a.zip"]["url"] == "https://unlarchive.org/dics/af_ana_a_c_ucl.zip"


def test_format_stuck_report_groups_by_language_with_counts_and_a_total():
    entries = [
        StuckEntry(path="exports/afr/a.zip", status="timeout", language="afr"),
        StuckEntry(path="exports/afr/b.zip", status="error", language="afr"),
        StuckEntry(path="exports/fre/a.zip", status="timeout", language="fre"),
    ]
    report = format_stuck_report(entries)
    lines = report.splitlines()
    assert lines[0] == "afr:"
    assert "  timeout exports/afr/a.zip" in lines
    assert "  error exports/afr/b.zip" in lines
    assert "  1 timeout, 1 error" in lines
    assert "fre:" in lines
    assert "  1 timeout, 0 error" in lines
    assert lines[-1] == "total: 2 timeout, 1 error"


def test_format_stuck_report_of_no_entries_is_just_the_total_line():
    assert format_stuck_report([]) == "total: 0 timeout, 0 error"
