# SPDX-License-Identifier: MPL-2.0
"""`python -m tools.mirror stuck`: list every export whose latest manifest line is `timeout` or
`error` (SPEC.md §3.1, issue 117). Reads `data/archive/manifest.jsonl` only — no client, no
credential, no request.

Issue 08's `login` run left two kinds of unfinished export behind. A `timeout` is a dictionary
zip UNLarium never finished building inside the run's few-second poll window — transient, and
`retry`'s worklist. An `error` is the archive's own settled `mysqli_sql_exception` for a
dictionary/project/format/release combination that has no table — a retry cannot change it, so
it is listed here for visibility only, never retried.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from tools.mirror.manifest import latest_by_path

_UNKNOWN_LANGUAGE = "unknown"

_STUCK_STATUSES = ("timeout", "error")


@dataclass(frozen=True)
class StuckEntry:
    path: str
    status: str  # "timeout" | "error"
    language: str


def find_stuck(manifest_path: str | Path) -> list[StuckEntry]:
    """Every path whose latest manifest line is `timeout` or `error`, sorted by language then
    path. Takes the latest line per path (`manifest.latest_by_path`) so a path an earlier
    `timeout` line but a newer `ok` line is not listed."""
    entries = []
    for path, entry in latest_by_path(manifest_path).items():
        status = entry.get("status")
        if status in _STUCK_STATUSES:
            entries.append(
                StuckEntry(
                    path=path,
                    status=status,
                    language=entry.get("language") or _UNKNOWN_LANGUAGE,
                )
            )
    return sorted(entries, key=lambda e: (e.language, e.path))


def timeout_paths(manifest_path: str | Path) -> dict[str, dict[str, Any]]:
    """The full manifest entry (url, licence, language, ...) for every path whose latest line is
    `status: timeout` — `retry`'s worklist. `error` paths are never included: a settled
    `mysqli_sql_exception` cannot change."""
    return {
        path: entry
        for path, entry in latest_by_path(manifest_path).items()
        if entry.get("status") == "timeout"
    }


def format_stuck_report(entries: list[StuckEntry]) -> str:
    """One block per language, each path marked with its status, a count of each per language,
    and a final total line."""
    by_language: dict[str, list[StuckEntry]] = {}
    for entry in entries:
        by_language.setdefault(entry.language, []).append(entry)

    lines: list[str] = []
    total_timeout = 0
    total_error = 0
    for language in sorted(by_language):
        lines.append(f"{language}:")
        timeout_count = 0
        error_count = 0
        for entry in by_language[language]:
            lines.append(f"  {entry.status} {entry.path}")
            if entry.status == "timeout":
                timeout_count += 1
            else:
                error_count += 1
        lines.append(f"  {timeout_count} timeout, {error_count} error")
        total_timeout += timeout_count
        total_error += error_count

    lines.append(f"total: {total_timeout} timeout, {total_error} error")
    return "\n".join(lines)
