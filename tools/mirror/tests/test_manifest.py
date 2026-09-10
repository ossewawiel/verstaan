# SPDX-License-Identifier: MPL-2.0
"""`data/archive/manifest.jsonl`: append-only, one JSON object per line (SPEC.md §3.1)."""

from __future__ import annotations

import json

from tools.mirror.manifest import append_entries, latest_by_path, read_manifest


def test_read_manifest_missing_file_is_empty(tmp_path):
    assert read_manifest(tmp_path / "manifest.jsonl") == []


def test_append_then_read_round_trips(tmp_path):
    path = tmp_path / "manifest.jsonl"
    entry = {"path": "pages/home.html", "url": "https://unlarchive.org/index.php?unlweb=home"}
    append_entries(path, [entry])
    assert read_manifest(path) == [entry]


def test_append_writes_one_json_object_per_line(tmp_path):
    path = tmp_path / "manifest.jsonl"
    append_entries(path, [{"path": "a"}, {"path": "b"}])
    lines = path.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 2
    assert json.loads(lines[0])["path"] == "a"
    assert json.loads(lines[1])["path"] == "b"


def test_append_is_additive_across_calls(tmp_path):
    path = tmp_path / "manifest.jsonl"
    append_entries(path, [{"path": "a", "sha256": "1"}])
    append_entries(path, [{"path": "a", "sha256": "2"}])
    entries = read_manifest(path)
    assert len(entries) == 2
    assert [e["sha256"] for e in entries] == ["1", "2"]


def test_latest_by_path_keeps_the_most_recent_line_per_path(tmp_path):
    path = tmp_path / "manifest.jsonl"
    append_entries(
        path,
        [
            {"path": "a", "sha256": "1"},
            {"path": "b", "sha256": "x"},
            {"path": "a", "sha256": "2"},
        ],
    )
    latest = latest_by_path(path)
    assert latest["a"]["sha256"] == "2"
    assert latest["b"]["sha256"] == "x"


def test_append_with_no_entries_does_not_create_a_file(tmp_path):
    path = tmp_path / "manifest.jsonl"
    append_entries(path, [])
    assert not path.exists()
