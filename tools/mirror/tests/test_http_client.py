# SPDX-License-Identifier: MPL-2.0
"""Rate limiting, host restriction, retries (SPEC.md §3.1). A fake `Transport`; no network."""

from __future__ import annotations

import pytest

from tools.mirror.http_client import (
    HttpResponse,
    OffHostError,
    RateLimitedClient,
    RequestFailedError,
)


class FakeTransport:
    def __init__(self, responses=None, fail_times=0):
        self.responses = responses or {}
        self.calls = []
        self.fail_times = fail_times
        self._fail_count = 0

    def request(self, url, headers):
        self.calls.append((url, dict(headers)))
        if self._fail_count < self.fail_times:
            self._fail_count += 1
            raise ConnectionError("simulated transport failure")
        return self.responses.get(url, HttpResponse(200, {}, b"ok"))


class FakeClock:
    def __init__(self):
        self.now = 0.0
        self.sleeps = []

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds

    def monotonic(self):
        return self.now


def _client(transport, **kwargs):
    clock = FakeClock()
    client = RateLimitedClient(
        transport,
        host="unlarchive.org",
        user_agent="verstaan-mirror (+https://github.com/ossewawiel/verstaan)",
        sleep=clock.sleep,
        monotonic=clock.monotonic,
        **kwargs,
    )
    return client, clock


def test_sets_the_user_agent_header():
    transport = FakeTransport()
    client, _ = _client(transport)
    client.get("https://unlarchive.org/index.php?unlweb=home")
    _url, headers = transport.calls[0]
    assert headers["User-Agent"] == "verstaan-mirror (+https://github.com/ossewawiel/verstaan)"


def test_refuses_a_url_off_the_host():
    transport = FakeTransport()
    client, _ = _client(transport)
    with pytest.raises(OffHostError):
        client.get("https://evil.example.com/index.php")
    assert transport.calls == []


def test_allows_a_subdomain_of_the_host():
    transport = FakeTransport()
    client, _ = _client(transport)
    client.get("https://www.unlarchive.org/grammars/eng_unl_tgrammar.txt")
    assert len(transport.calls) == 1


def test_rate_limits_to_one_request_per_second():
    transport = FakeTransport()
    client, clock = _client(transport, rate_limit_seconds=1.0)
    client.get("https://unlarchive.org/a")
    client.get("https://unlarchive.org/b")
    client.get("https://unlarchive.org/c")
    # Two waits of the full interval: the first request never waits.
    assert clock.sleeps == [1.0, 1.0]


def test_no_wait_when_enough_time_already_elapsed():
    transport = FakeTransport()
    client, clock = _client(transport, rate_limit_seconds=1.0)
    client.get("https://unlarchive.org/a")
    clock.now += 5.0  # plenty of time passed between requests
    client.get("https://unlarchive.org/b")
    assert clock.sleeps == []


def test_retries_on_transport_failure_then_succeeds():
    transport = FakeTransport(fail_times=2)
    client, _clock = _client(transport, retries=3, retry_backoff_seconds=1.0)
    response = client.get("https://unlarchive.org/flaky")
    assert response.status == 200
    assert len(transport.calls) == 3


def test_gives_up_after_the_configured_retry_count():
    transport = FakeTransport(fail_times=10)
    client, _ = _client(transport, retries=3, retry_backoff_seconds=1.0)
    with pytest.raises(RequestFailedError):
        client.get("https://unlarchive.org/always-fails")
    assert len(transport.calls) == 3


def test_5xx_response_is_retried():
    transport = FakeTransport(
        responses={"https://unlarchive.org/broken": HttpResponse(500, {}, b"boom")}
    )
    client, _ = _client(transport, retries=3, retry_backoff_seconds=1.0)
    with pytest.raises(RequestFailedError):
        client.get("https://unlarchive.org/broken")
    assert len(transport.calls) == 3


def test_get_while_retries_a_still_pending_body_then_returns_the_real_one():
    # UNLarium's "please wait…" placeholder, then the real export on the next try.
    transport = FakeTransport()
    responses = iter([HttpResponse(200, {}, b"please wait"), HttpResponse(200, {}, b"real body")])
    transport.request = lambda url, headers: (
        transport.calls.append((url, dict(headers))),
        next(responses),
    )[1]
    client, clock = _client(transport, retries=3, retry_backoff_seconds=1.0)

    response = client.get_while(
        "https://unlarchive.org/dics/x.zip", lambda body: body == b"please wait"
    )

    assert response.body == b"real body"
    assert len(transport.calls) == 2
    # The same backoff formula as a transport-failure retry: `retry_backoff_seconds * attempt`.
    assert clock.sleeps == [1.0]


def test_get_while_gives_up_after_the_configured_retry_count():
    transport = FakeTransport(
        responses={"https://unlarchive.org/stuck": HttpResponse(200, {}, b"please wait")}
    )
    client, clock = _client(transport, retries=3, retry_backoff_seconds=1.0)

    response = client.get_while("https://unlarchive.org/stuck", lambda body: body == b"please wait")

    # Still pending after every attempt: the caller gets the last response back, not an
    # exception — it decides how to record a body that never settled (issue 08).
    assert response.body == b"please wait"
    assert len(transport.calls) == 3
    assert clock.sleeps == [1.0, 2.0]


def test_get_while_does_not_retry_a_body_that_is_not_pending():
    transport = FakeTransport(
        responses={"https://unlarchive.org/ok": HttpResponse(200, {}, b"real body")}
    )
    client, _clock = _client(transport, retries=3, retry_backoff_seconds=1.0)

    response = client.get_while("https://unlarchive.org/ok", lambda body: body == b"please wait")

    assert response.body == b"real body"
    assert len(transport.calls) == 1


def test_get_while_stops_on_a_4xx_status_without_retrying_or_sleeping():
    # unlarchive.org's CDN answers a rate-limited zip request with an empty 429 body (issue 117);
    # `still_pending` would read that as "still building" forever, so a 4xx must win regardless.
    transport = FakeTransport(
        responses={"https://unlarchive.org/dics/x.zip": HttpResponse(429, {}, b"")}
    )
    client, clock = _client(transport, retries=3, retry_backoff_seconds=1.0)

    response = client.get_while("https://unlarchive.org/dics/x.zip", lambda body: not body)

    assert response.status == 429
    assert len(transport.calls) == 1
    assert clock.sleeps == []


def test_a_4xx_or_php_error_response_is_returned_not_raised():
    # The broken export_dic.php answers 200 with a PHP fatal error in the body — the mirror must
    # get that body back to record it, not retry it to death or raise.
    transport = FakeTransport(
        responses={"https://unlarchive.org/broken.php": HttpResponse(200, {}, b"fatal error")}
    )
    client, _ = _client(transport)
    response = client.get("https://unlarchive.org/broken.php")
    assert response.status == 200
    assert response.body == b"fatal error"
