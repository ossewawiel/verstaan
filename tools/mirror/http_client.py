# SPDX-License-Identifier: MPL-2.0
"""A rate-limited, host-restricted, retrying HTTP GET (SPEC.md §3.1).

`Transport` is the seam: tests inject a fake one so no test in this package touches the network
(docs/standards/testing.md — domain tests never touch the network; the same discipline applies
here even though this is a tool, not the engine). `UrllibTransport` is the real one, stdlib only.
"""

from __future__ import annotations

import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Protocol
from urllib.parse import urlsplit


@dataclass(frozen=True)
class HttpResponse:
    status: int
    headers: dict[str, str] = field(default_factory=dict)
    body: bytes = b""


class Transport(Protocol):
    def request(self, url: str, headers: dict[str, str]) -> HttpResponse: ...


class UrllibTransport:
    """The real transport. HTTP error responses (4xx/5xx) come back as a normal `HttpResponse`,
    not an exception — the mirror records error bodies (SPEC.md §3.1's broken export), it does
    not discard them. Only a transport-level failure (DNS, connection refused, timeout) raises.
    """

    def request(self, url: str, headers: dict[str, str]) -> HttpResponse:
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return HttpResponse(resp.status, dict(resp.headers), resp.read())
        except urllib.error.HTTPError as exc:
            return HttpResponse(exc.code, dict(exc.headers or {}), exc.read())


class OffHostError(Exception):
    """Raised when a URL would leave `unlarchive.org` (SPEC.md §3.1: never follow such a link)."""


class RequestFailedError(Exception):
    """Raised when every retry attempt failed."""


def _same_host(url: str, host: str) -> bool:
    netloc = (urlsplit(url).hostname or "").lower()
    host = host.lower()
    return netloc == host or netloc.endswith("." + host)


class RateLimitedClient:
    """One GET at a time, at most one per `rate_limit_seconds`, never off `host`, retried."""

    def __init__(
        self,
        transport: Transport,
        *,
        host: str,
        user_agent: str,
        rate_limit_seconds: float = 1.0,
        retries: int = 3,
        retry_backoff_seconds: float = 1.0,
        sleep=time.sleep,
        monotonic=time.monotonic,
    ) -> None:
        self._transport = transport
        self._host = host
        self._user_agent = user_agent
        self._rate_limit_seconds = rate_limit_seconds
        self._retries = max(1, retries)
        self._retry_backoff_seconds = retry_backoff_seconds
        self._sleep = sleep
        self._monotonic = monotonic
        self._last_request_at: float | None = None
        self.request_count = 0

    def get(self, url: str, *, extra_headers: dict[str, str] | None = None) -> HttpResponse:
        if not _same_host(url, self._host):
            raise OffHostError(f"refusing to fetch off-host url: {url!r} (host is {self._host!r})")

        headers = {"User-Agent": self._user_agent}
        if extra_headers:
            headers.update(extra_headers)

        last_exc: Exception | None = None
        for attempt in range(1, self._retries + 1):
            self._wait_for_rate_limit()
            self.request_count += 1
            try:
                response = self._transport.request(url, headers)
            except Exception as exc:  # noqa: BLE001 - a transport failure is retried, not typed
                last_exc = exc
            else:
                if response.status >= 500:
                    last_exc = RequestFailedError(f"{response.status} from {url}")
                else:
                    return response
            if attempt < self._retries:
                self._sleep(self._retry_backoff_seconds * attempt)

        raise RequestFailedError(f"giving up on {url} after {self._retries} attempts") from last_exc

    def _wait_for_rate_limit(self) -> None:
        now = self._monotonic()
        if self._last_request_at is not None:
            elapsed = now - self._last_request_at
            remaining = self._rate_limit_seconds - elapsed
            if remaining > 0:
                self._sleep(remaining)
        self._last_request_at = self._monotonic()
