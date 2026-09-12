# SPDX-License-Identifier: MPL-2.0
"""`python -m tools.mirror retry`: retry every export issue 08's `login` run left `status:
timeout` (SPEC.md §3.1, issue 117).

Signs in exactly as `login` does, then re-fetches only the paths `tools.mirror.stuck.
timeout_paths` names, through the same `RateLimitedClient.get_while` `login` uses. `cli.py`
builds `client` with the poll budget (`--poll-seconds`, `--max-wait-seconds`) baked into its
`rate_limit_seconds` and `retries`, so this module carries no clock or budget of its own — a zip
still 0 bytes after the last poll is the same "not ready yet" answer `login` already knows how to
record. `error` paths are never requested: a settled `mysqli_sql_exception` cannot change.

unlarchive.org's CDN answers a zip request with an empty, 0-byte HTTP 429 once a run has pulled
about thirty zips in a short time. That is a settled refusal, not a still-building export — since
`RateLimitedClient.get_while`'s issue 117 fix, it comes back on the first attempt, no polling. A
429 here stops the whole run: every remaining timeout path is left unrequested rather than spend
its own five-minute budget being refused (SPEC.md §3.1's rate limit still applies; hammering a
CDN that just said no is not "obeying" it). The manifest is flushed after every stored path, not
only at the end, so a run stopped by a 429 — or killed outright — never loses what had already
landed.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

from tools.mirror.config import MirrorConfig
from tools.mirror.http_client import RateLimitedClient
from tools.mirror.login import sign_in
from tools.mirror.store import Mirror
from tools.mirror.stuck import timeout_paths
from tools.mirror.unlarium import LoginReport, _store_export, is_still_pending

_RATE_LIMIT_STATUS = 429


def poll_attempts(poll_seconds: float, max_wait_seconds: float) -> int:
    """How many `get_while` attempts, spaced `poll_seconds` apart (via `rate_limit_seconds`),
    fit inside `max_wait_seconds` — the last attempt lands at or before the budget runs out."""
    if poll_seconds <= 0:
        return 1
    return max(1, int(max_wait_seconds // poll_seconds) + 1)


@dataclass
class RetryReport:
    attempted: int = 0
    landed: int = 0
    still_stuck: int = 0
    total_bytes: int = 0
    rate_limited: bool = False

    def summary(self) -> str:
        base = (
            f"attempted: {self.attempted}, landed: {self.landed}, "
            f"still stuck: {self.still_stuck}, bytes: {self.total_bytes}"
        )
        if self.rate_limited:
            return f"{base}, rate limited: stopped early"
        return base


def run_retry(
    config: MirrorConfig,
    client: RateLimitedClient,
    archive_root: str | Path,
    manifest_path: str | Path,
    username: str,
    password: str,
) -> RetryReport:
    """Sign in, then re-fetch every `status: timeout` export named by the manifest. `client`
    already carries the poll cadence for `get_while`; this function never sleeps or times
    anything itself.

    Stops at the first 429: nothing is stored for that path, every path after it is never
    requested, and the returned report's `rate_limited` is set so `cli.py` can exit with a
    distinct code. The manifest is flushed after every path that *is* stored, so a stop here — or
    an unhandled exception — never costs a zip that already landed.
    """
    root = f"https://{config.host}"
    sign_in(client, root, username, password)

    manifest_path = Path(manifest_path)
    store = Mirror(client=client, archive_root=Path(archive_root), manifest_path=manifest_path)
    login_report = LoginReport()

    stuck = timeout_paths(manifest_path)
    paths = sorted(stuck)
    attempted = 0
    rate_limited = False

    for path in paths:
        entry = stuck[path]
        bucket, _sep, _filename = path.rpartition("/")
        url = entry["url"]
        response = client.get_while(url, is_still_pending)
        attempted += 1

        if response.status == _RATE_LIMIT_STATUS:
            remaining = len(paths) - attempted
            print(
                f"tools.mirror retry: {response.status} from {path}; "
                f"{remaining} timeout path(s) not requested",
                file=sys.stderr,
            )
            rate_limited = True
            break

        _store_export(
            store,
            login_report,
            bucket=bucket,
            url=url,
            content=response.body,
            licence=entry.get("licence") or "",
            licence_url=entry.get("licence_url") or "",
            language=entry.get("language"),
            still_pending=is_still_pending(response.body),
        )
        store.flush()

    return RetryReport(
        attempted=attempted,
        landed=login_report.exports_fetched,
        still_stuck=login_report.exports_timeout,
        total_bytes=login_report.total_bytes,
        rate_limited=rate_limited,
    )
