# SPDX-License-Identifier: MPL-2.0
"""Write one fetched file under `data/archive/<bucket>/...` and append its manifest line.

This is the idempotency boundary (SPEC.md §3.1). A file is unchanged, and gets no new manifest
line, when either the server says so (HTTP 304 against a stored `ETag`) or its content hash
matches the last recorded one. A file the server serves as a PHP fatal error still gets written
and manifested, with `status: "error"` — SPEC.md §3.1's broken public dictionary export.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from tools.mirror.http_client import RateLimitedClient
from tools.mirror.manifest import append_entries, latest_by_path
from tools.mirror.parsing import looks_like_server_error

_UNSAFE_RE = re.compile(r"[^A-Za-z0-9._-]")


def slugify(text: str) -> str:
    return _UNSAFE_RE.sub("_", text).strip("_") or "file"


def filename_for_url(url: str) -> str:
    """A stable, collision-resistant filename for a URL that may carry a query string."""
    split = urlsplit(url)
    name = split.path.rsplit("/", 1)[-1] or "index"
    if split.query:
        name = f"{name}__{slugify(split.query)}"
    return name


@dataclass
class StoreResult:
    action: str  # "fetched" | "unchanged" | "error"
    path: str
    sha256: str | None = None


@dataclass
class Mirror:
    """Fetches through `client`, writes under `archive_root/<bucket>/...`, manifests as it goes."""

    client: RateLimitedClient
    archive_root: Path
    manifest_path: Path
    now: Any = lambda: datetime.now(UTC)
    _existing: dict[str, dict] = field(init=False)
    _new_entries: list[dict] = field(init=False, default_factory=list)
    fetch_count: int = field(init=False, default=0)
    unchanged_count: int = field(init=False, default=0)

    def __post_init__(self) -> None:
        self._existing = latest_by_path(self.manifest_path)

    def fetch_and_store(
        self,
        *,
        bucket: str,
        filename: str,
        url: str,
        licence: str,
        licence_url: str,
        title: str | None,
        language: str | None = None,
        note: str | None = None,
        extra: dict | None = None,
    ) -> StoreResult:
        rel_path = f"{bucket}/{filename}"
        prior = self._existing.get(rel_path)

        headers = {}
        if prior and prior.get("etag"):
            headers["If-None-Match"] = prior["etag"]

        response = self.client.get(url, extra_headers=headers)

        if response.status == 304:
            self.unchanged_count += 1
            return StoreResult(action="unchanged", path=rel_path, sha256=prior.get("sha256"))

        etag = response.headers.get("ETag") or response.headers.get("Etag")
        return self._store_bytes(
            rel_path=rel_path,
            prior=prior,
            body=response.body,
            url=url,
            licence=licence,
            licence_url=licence_url,
            title=title,
            language=language,
            note=note,
            extra=extra,
            etag=etag,
        )

    def fetch_and_store_bytes(
        self,
        *,
        bucket: str,
        filename: str,
        url: str,
        content: bytes,
        licence: str,
        licence_url: str,
        title: str | None,
        language: str | None = None,
        note: str | None = None,
        extra: dict | None = None,
        etag: str | None = None,
    ) -> StoreResult:
        """Same as `fetch_and_store`, for content already fetched — by the wiki API's two calls
        per page (`tools.mirror.wiki`), or by a page the caller had to fetch anyway to parse for
        links and licence (`tools.mirror.run.mirror_pages`). This only hashes, writes and
        manifests; it never calls `client.get` itself, so a page is never fetched twice.
        """
        rel_path = f"{bucket}/{filename}"
        prior = self._existing.get(rel_path)
        return self._store_bytes(
            rel_path=rel_path,
            prior=prior,
            body=content,
            url=url,
            licence=licence,
            licence_url=licence_url,
            title=title,
            language=language,
            note=note,
            extra=extra,
            etag=etag,
        )

    def _store_bytes(
        self,
        *,
        rel_path: str,
        prior: dict | None,
        body: bytes,
        url: str,
        licence: str,
        licence_url: str,
        title: str | None,
        language: str | None,
        note: str | None,
        extra: dict | None,
        etag: str | None,
    ) -> StoreResult:
        sha256 = hashlib.sha256(body).hexdigest()
        status = "error" if looks_like_server_error(body) else "ok"
        full_path = self.archive_root / rel_path

        content_matches_prior = (
            prior and prior.get("sha256") == sha256 and prior.get("status", "ok") == status
        )
        if content_matches_prior:
            if not full_path.exists():
                # The manifest says this content is already known, but the file itself is
                # missing (an interrupted prior run, a manual deletion). Re-materialise it
                # without a new manifest line — the content, and its provenance, has not changed.
                full_path.parent.mkdir(parents=True, exist_ok=True)
                full_path.write_bytes(body)
            self.unchanged_count += 1
            return StoreResult(action="unchanged", path=rel_path, sha256=sha256)

        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_bytes(body)

        entry: dict[str, Any] = {
            "path": rel_path,
            "url": url,
            "retrieved": self.now().isoformat(),
            "sha256": sha256,
            "licence": licence,
            "licence_url": licence_url,
            "title": title,
            "language": language,
        }
        if status != "ok":
            entry["status"] = status
            entry["error"] = body.decode("utf-8", errors="replace")
        if etag:
            entry["etag"] = etag
        if note:
            entry["note"] = note
        if extra:
            entry["extra"] = extra

        self._new_entries.append(entry)
        self._existing[rel_path] = entry
        self.fetch_count += 1
        return StoreResult(
            action="error" if status != "ok" else "fetched", path=rel_path, sha256=sha256
        )

    def flush(self) -> None:
        append_entries(self.manifest_path, self._new_entries)
        self._new_entries = []
