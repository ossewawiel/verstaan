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

import json
from collections.abc import Sequence
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


def timeout_paths(
    manifest_path: str | Path, language: str | None = None
) -> dict[str, dict[str, Any]]:
    """The full manifest entry (url, licence, language, ...) for every path whose latest line is
    `status: timeout` — `retry`'s worklist. `error` paths are never included: a settled
    `mysqli_sql_exception` cannot change. `language`, when given, restricts the worklist to that
    language only (issue 118's `retry --language`)."""
    return {
        path: entry
        for path, entry in latest_by_path(manifest_path).items()
        if entry.get("status") == "timeout"
        and (language is None or entry.get("language") == language)
    }


def _base_forms_by_language(languages_path: str | Path) -> dict[str, int]:
    """`iso3 -> base_forms` from `data/archive/languages.json` (issue 118's tie-break: once the
    developer's named priority is drained, the stuck language with the most base forms is
    next). Missing file reads as no counts known — every stuck language then ties at zero and
    the choice falls to the sort's own tie-break, the ISO3 code."""
    path = Path(languages_path)
    if not path.exists():
        return {}
    rows = json.loads(path.read_text(encoding="utf-8"))
    return {row["iso3"]: row.get("base_forms", 0) for row in rows}


def find_next_stuck(
    manifest_path: str | Path, languages_path: str | Path, priority: Sequence[str]
) -> str | None:
    """The next language `retry --language` should spend a run on (issue 118).

    The first language in `priority` that still has a `status: timeout` path, else, once every
    priority language is drained (or `priority` is empty), the stuck language with the most base
    forms in `languages.json` — ties broken by ISO3 code, for a deterministic order. `None` when
    no language has a `timeout` path left at all.
    """
    stuck_languages = {
        entry.get("language")
        for entry in timeout_paths(manifest_path).values()
        if entry.get("language")
    }
    if not stuck_languages:
        return None

    for language in priority:
        if language in stuck_languages:
            return language

    base_forms = _base_forms_by_language(languages_path)
    ranked = sorted(stuck_languages, key=lambda language: (-base_forms.get(language, 0), language))
    return ranked[0]


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
