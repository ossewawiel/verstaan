# SPDX-License-Identifier: MPL-2.0
"""`data/archive/manifest.jsonl`: one JSON object per fetched file (SPEC.md §3.1).

Fields: `path`, `url`, `retrieved`, `sha256`, `licence`, `licence_url`, `title`, `language`.
Two extensions this issue's acceptance criteria ask for, both optional: `status` (`"error"` for
the broken public dictionary export, otherwise omitted), `note` (a fact the page parser found
worth recording, e.g. a commented-out link), and `extra` (a free dict, e.g. wiki categories).
An `etag` field, also optional, backs the idempotent re-run: a conditional GET needs it.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def read_manifest(path: str | Path) -> list[dict[str, Any]]:
    """Return every line of an existing manifest, oldest first. Missing file means empty."""
    p = Path(path)
    if not p.exists():
        return []
    lines = []
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            lines.append(json.loads(line))
    return lines


def latest_by_path(path: str | Path) -> dict[str, dict[str, Any]]:
    """The most recent manifest entry for each archive-relative `path`.

    A manifest is append-only: re-running the mirror on a changed file appends a new line rather
    than rewriting the old one, so the file's current, on-disk state is always its *last* entry.
    """
    latest: dict[str, dict[str, Any]] = {}
    for entry in read_manifest(path):
        latest[entry["path"]] = entry
    return latest


def append_entries(path: str | Path, entries: list[dict[str, Any]]) -> None:
    """Append `entries` to the manifest, one compact JSON object per line. No-op if empty."""
    if not entries:
        return
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("a", encoding="utf-8") as f:
        for entry in entries:
            f.write(json.dumps(entry, sort_keys=True, ensure_ascii=False))
            f.write("\n")
