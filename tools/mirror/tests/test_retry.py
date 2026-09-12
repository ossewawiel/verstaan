# SPDX-License-Identifier: MPL-2.0
"""`python -m tools.mirror retry`: re-fetch every `status: timeout` export (SPEC.md §3.1,
issue 117). A fake site and a fake clock, not a live one (docs/standards/testing.md)."""

from __future__ import annotations

from pathlib import Path

import pytest

from tools.mirror.config import load_config
from tools.mirror.http_client import HttpResponse, RateLimitedClient
from tools.mirror.manifest import append_entries, read_manifest
from tools.mirror.retry import RetryReport, poll_attempts, run_retry
from tools.mirror.stuck import find_stuck
from tools.mirror.unlarium import is_still_pending

_MIRROR_TOML = Path(__file__).resolve().parents[3] / "mirror.toml"
_LOGGED_IN_HTML = "<html><body><h2>Marsel Pretorius</h2></body></html>"
_ROOT = "https://unlarchive.org"
_LOGIN_URL = f"{_ROOT}/user/index.php?page=login"

_TIMEOUT_URL = f"{_ROOT}/dics/af_ana_a_c_ucl.zip"
_ERROR_URL = f"{_ROOT}/dics/af_ana_a_c_ucn.zip"
_OK_URL = f"{_ROOT}/dics/af_gen_a_c_ucl.zip"
_ZIP_BYTES = b"PK\x03\x04 a real zip"


class FakeSite:
    """A client-shaped fake: GET/POST/get_while, no real sleep (test_unlarium.py's shape)."""

    def __init__(self, get_responses):
        self.get_responses = get_responses
        self.get_urls = []
        self.post_calls = []

    def get(self, url, *, extra_headers=None):
        self.get_urls.append(url)
        if url not in self.get_responses:
            raise AssertionError(f"unexpected GET: {url}")
        value = self.get_responses[url]
        if isinstance(value, Exception):
            raise value
        if isinstance(value, list):
            return value.pop(0) if len(value) > 1 else value[0]
        return value

    def get_while(self, url, still_pending, *, extra_headers=None, retries=3):
        # Mirrors `RateLimitedClient.get_while`'s issue 117 fix: a 4xx status is a settled
        # answer, never "still pending", no matter what `still_pending` says about its body.
        response = self.get(url, extra_headers=extra_headers)
        for _ in range(retries - 1):
            if 400 <= response.status < 500 or not still_pending(response.body):
                return response
            response = self.get(url, extra_headers=extra_headers)
        return response

    def post(self, url, *, data, extra_headers=None):
        self.post_calls.append((url, data))
        return HttpResponse(200, {}, _LOGGED_IN_HTML.encode("utf-8"))


def _seed_manifest(manifest_path):
    append_entries(
        manifest_path,
        [
            {
                "path": "exports/afr/af_ana_a_c_ucl.zip",
                "url": _TIMEOUT_URL,
                "status": "timeout",
                "language": "afr",
                "licence": "CC BY-SA 2.5 CH",
                "licence_url": "http://creativecommons.org/licenses/by-sa/2.5/ch/",
                "sha256": "0" * 64,
            },
            {
                "path": "exports/afr/af_ana_a_c_ucn.zip",
                "url": _ERROR_URL,
                "status": "error",
                "language": "afr",
                "licence": "CC BY-SA 2.5 CH",
                "licence_url": "http://creativecommons.org/licenses/by-sa/2.5/ch/",
                "sha256": "1" * 64,
            },
            {
                "path": "exports/afr/af_gen_a_c_ucl.zip",
                "url": _OK_URL,
                "language": "afr",
                "licence": "CC BY-SA 2.5 CH",
                "licence_url": "http://creativecommons.org/licenses/by-sa/2.5/ch/",
                "sha256": "2" * 64,
            },
        ],
    )


def test_run_retry_requests_only_paths_whose_latest_line_is_timeout(tmp_path):
    config = load_config(_MIRROR_TOML)
    archive_root = tmp_path / "archive"
    manifest_path = archive_root / "manifest.jsonl"
    _seed_manifest(manifest_path)

    site = FakeSite({_TIMEOUT_URL: HttpResponse(200, {}, _ZIP_BYTES)})

    run_retry(config, site, archive_root, manifest_path, "wawiel", "hunter2")

    assert site.get_urls == [_TIMEOUT_URL]
    assert site.post_calls[0][0] == _LOGIN_URL


def test_a_zip_that_lands_overwrites_the_file_and_appends_an_ok_line(tmp_path):
    config = load_config(_MIRROR_TOML)
    archive_root = tmp_path / "archive"
    manifest_path = archive_root / "manifest.jsonl"
    _seed_manifest(manifest_path)
    stale = archive_root / "exports" / "afr" / "af_ana_a_c_ucl.zip"
    stale.parent.mkdir(parents=True)
    stale.write_bytes(b"")

    site = FakeSite({_TIMEOUT_URL: HttpResponse(200, {}, _ZIP_BYTES)})
    report = run_retry(config, site, archive_root, manifest_path, "wawiel", "hunter2")

    assert stale.read_bytes() == _ZIP_BYTES
    entries = read_manifest(manifest_path)
    landed = [e for e in entries if e["path"] == "exports/afr/af_ana_a_c_ucl.zip"][-1]
    assert "status" not in landed
    assert report.landed == 1
    assert report.still_stuck == 0
    assert report.attempted == 1
    assert report.total_bytes == len(_ZIP_BYTES)


def test_a_zip_that_is_still_pending_appends_a_fresh_timeout_line(tmp_path):
    config = load_config(_MIRROR_TOML)
    archive_root = tmp_path / "archive"
    manifest_path = archive_root / "manifest.jsonl"
    _seed_manifest(manifest_path)

    # A different "still generating" body than before: the placeholder page, not an empty one —
    # different content, so the dedup in `Mirror._store_bytes` does not swallow the new line.
    placeholder = b'<div id="progressbar1_message">Please wait...</div>'
    site = FakeSite({_TIMEOUT_URL: HttpResponse(200, {}, placeholder)})

    report = run_retry(config, site, archive_root, manifest_path, "wawiel", "hunter2")

    entries = read_manifest(manifest_path)
    still = [e for e in entries if e["path"] == "exports/afr/af_ana_a_c_ucl.zip"][-1]
    assert still["status"] == "timeout"
    assert report.landed == 0
    assert report.still_stuck == 1

    # `stuck` still lists it after the retry: this one did not land.
    assert any(e.path == "exports/afr/af_ana_a_c_ucl.zip" for e in find_stuck(manifest_path))


def _seed_three_timeouts(manifest_path, urls):
    append_entries(
        manifest_path,
        [
            {
                "path": f"exports/afr/{name}.zip",
                "url": url,
                "status": "timeout",
                "language": "afr",
                "licence": "CC BY-SA 2.5 CH",
                "licence_url": "http://creativecommons.org/licenses/by-sa/2.5/ch/",
                "sha256": f"{i}" * 64,
            }
            for i, (name, url) in enumerate(urls.items())
        ],
    )


def test_run_retry_stops_at_a_429_and_reports_rate_limited(tmp_path, capsys):
    """unlarchive.org's CDN 429s after about thirty zips (issue 117): the run must stop right
    there, keep everything already landed, and never request what comes after."""
    config = load_config(_MIRROR_TOML)
    archive_root = tmp_path / "archive"
    manifest_path = archive_root / "manifest.jsonl"
    url_a = f"{_ROOT}/dics/a.zip"
    url_b = f"{_ROOT}/dics/b.zip"
    url_c = f"{_ROOT}/dics/c.zip"
    _seed_three_timeouts(manifest_path, {"a": url_a, "b": url_b, "c": url_c})

    site = FakeSite(
        {
            url_a: HttpResponse(200, {}, _ZIP_BYTES),
            url_b: HttpResponse(429, {}, b""),
            url_c: HttpResponse(200, {}, _ZIP_BYTES),
        }
    )

    report = run_retry(config, site, archive_root, manifest_path, "wawiel", "hunter2")

    assert site.get_urls == [url_a, url_b]  # url_c never requested
    assert report.rate_limited is True
    assert "rate limited" in report.summary()
    assert report.attempted == 2
    assert report.landed == 1
    assert report.still_stuck == 0

    err = capsys.readouterr().err
    assert "429" in err
    assert "exports/afr/b.zip" in err
    assert "1" in err  # one path (c) left unrequested

    entries = read_manifest(manifest_path)
    assert any(e["path"] == "exports/afr/a.zip" and "status" not in e for e in entries)
    # Nothing at all was stored for b or c beyond the original seeded timeout lines.
    a_lines = [e for e in entries if e["path"] == "exports/afr/a.zip"]
    b_lines = [e for e in entries if e["path"] == "exports/afr/b.zip"]
    c_lines = [e for e in entries if e["path"] == "exports/afr/c.zip"]
    assert len(a_lines) == 2  # original timeout line + the new ok line
    assert len(b_lines) == 1  # only the original timeout line: nothing new appended
    assert len(c_lines) == 1  # only the original timeout line: never requested


def test_a_run_that_raises_mid_way_keeps_the_manifest_line_already_stored(tmp_path):
    """`Mirror.flush()` after every stored path, not only at the end (issue 117): an interrupted
    run must not lose an export that had already landed."""
    config = load_config(_MIRROR_TOML)
    archive_root = tmp_path / "archive"
    manifest_path = archive_root / "manifest.jsonl"
    url_a = f"{_ROOT}/dics/a.zip"
    url_b = f"{_ROOT}/dics/b.zip"
    _seed_three_timeouts(manifest_path, {"a": url_a, "b": url_b})

    site = FakeSite(
        {
            url_a: HttpResponse(200, {}, _ZIP_BYTES),
            url_b: RuntimeError("connection dropped"),
        }
    )

    with pytest.raises(RuntimeError):
        run_retry(config, site, archive_root, manifest_path, "wawiel", "hunter2")

    entries = read_manifest(manifest_path)
    landed = [e for e in entries if e["path"] == "exports/afr/a.zip"][-1]
    assert "status" not in landed


def test_summary_line_reports_attempted_landed_stuck_and_bytes():
    assert RetryReport().summary() == "attempted: 0, landed: 0, still stuck: 0, bytes: 0"


def test_poll_attempts_spans_the_max_wait_budget():
    assert poll_attempts(15.0, 300.0) == 21
    assert poll_attempts(15.0, 45.0) == 4
    assert poll_attempts(1.0, 0.5) == 1


class FakeTransport:
    """GET only, real `RateLimitedClient`, real backoff/rate-limit math, fake clock."""

    def __init__(self, body: bytes):
        self.body = body
        self.calls = []

    def request(self, url, headers, *, data=None):
        self.calls.append(url)
        return HttpResponse(200, {}, self.body)


class FakeClock:
    def __init__(self):
        self.now = 0.0
        self.sleeps = []

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds

    def monotonic(self):
        return self.now


def test_get_while_polls_every_poll_seconds_until_the_budget_runs_out():
    """The mechanism `retry` relies on: a `RateLimitedClient` built with `rate_limit_seconds`
    set to `--poll-seconds` and `retries` set to `poll_attempts(...)` polls at a constant
    interval through `get_while`, proven with a fake clock (issue 117)."""
    transport = FakeTransport(b"")  # never lands
    clock = FakeClock()
    client = RateLimitedClient(
        transport,
        host="unlarchive.org",
        user_agent="verstaan-mirror (+https://github.com/ossewawiel/verstaan)",
        rate_limit_seconds=15.0,
        retries=poll_attempts(15.0, 45.0),
        retry_backoff_seconds=0.0,
        sleep=clock.sleep,
        monotonic=clock.monotonic,
    )

    response = client.get_while("https://unlarchive.org/dics/x.zip", is_still_pending)

    assert response.body == b""
    assert len(transport.calls) == 4  # poll_attempts(15, 45) == 4
    # `get_while` also sleeps its own zero backoff (`retry_backoff_seconds * attempt == 0`)
    # between attempts; the real gap between polls is the rate limiter's wait, always 15s here.
    assert [s for s in clock.sleeps if s > 0] == [15.0, 15.0, 15.0]
