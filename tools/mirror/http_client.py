# SPDX-License-Identifier: MPL-2.0
"""A rate-limited, host-restricted, retrying HTTP GET (SPEC.md §3.1).

`Transport` is the seam: tests inject a fake one so no test in this package touches the network
(docs/standards/testing.md — domain tests never touch the network; the same discipline applies
here even though this is a tool, not the engine). `UrllibTransport` is the real one, stdlib only.
"""

from __future__ import annotations

import http.cookiejar
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
    def request(
        self, url: str, headers: dict[str, str], *, data: bytes | None = None
    ) -> HttpResponse: ...


class UrllibTransport:
    """The real transport. HTTP error responses (4xx/5xx) come back as a normal `HttpResponse`,
    not an exception — the mirror records error bodies (SPEC.md §3.1's broken export), it does
    not discard them. Only a transport-level failure (DNS, connection refused, timeout) raises.

    Cookies (issue 08's logged-in session) live in an in-memory `http.cookiejar.CookieJar`, never
    a `FileCookieJar` — the session cookie must never touch disk. One instance's cookies are
    shared by every request it makes, GET or POST, for the lifetime of the process only.
    """

    def __init__(self) -> None:
        self._cookie_jar = http.cookiejar.CookieJar()
        self._opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self._cookie_jar)
        )

    def request(
        self, url: str, headers: dict[str, str], *, data: bytes | None = None
    ) -> HttpResponse:
        req = urllib.request.Request(url, headers=headers, data=data)
        try:
            with self._opener.open(req, timeout=30) as resp:
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
        return self._request(url, data=None, extra_headers=extra_headers)

    def get_while(
        self,
        url: str,
        still_pending,
        *,
        extra_headers: dict[str, str] | None = None,
    ) -> HttpResponse:
        """Like `get`, but retries — same bounded `retries` and `retry_backoff_seconds * attempt`
        backoff as a transport failure or a 5xx status — while `still_pending(response.body)` says
        the body is not a real answer yet (issue 08: UNLarium's "please wait, generating…"
        placeholder page, or a zip export not yet materialised). Gives up after the same number
        of attempts as any other retry and returns the last response, pending or not — the caller
        decides how to record a still-pending body, this method never raises for one.
        """
        response = self.get(url, extra_headers=extra_headers)
        for attempt in range(1, self._retries):
            if not still_pending(response.body):
                return response
            self._sleep(self._retry_backoff_seconds * attempt)
            response = self.get(url, extra_headers=extra_headers)
        return response

    def post(
        self, url: str, *, data: bytes, extra_headers: dict[str, str] | None = None
    ) -> HttpResponse:
        """A rate-limited, retried POST — issue 08's sign-in form. Same host and retry rules as
        `get`; the only difference is a request body."""
        return self._request(url, data=data, extra_headers=extra_headers)

    def _request(
        self, url: str, *, data: bytes | None, extra_headers: dict[str, str] | None
    ) -> HttpResponse:
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
                # `data=None` is omitted, not passed, so a `Transport` fake written before issue
                # 08 (POST support) — `def request(self, url, headers):` — still works unchanged.
                response = (
                    self._transport.request(url, headers, data=data)
                    if data is not None
                    else self._transport.request(url, headers)
                )
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
