# SPDX-License-Identifier: MPL-2.0
"""`Mirror.fetch_and_store`: writes verbatim, manifests once, skips the unchanged (SPEC.md §3.1)."""

from __future__ import annotations

from datetime import UTC, datetime

from tools.mirror.http_client import HttpResponse
from tools.mirror.manifest import read_manifest
from tools.mirror.store import Mirror, filename_for_url


class FakeClient:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    def get(self, url, *, extra_headers=None):
        self.calls.append((url, dict(extra_headers or {})))
        return self.responses[url]


def _mirror(tmp_path, client):
    return Mirror(
        client=client,
        archive_root=tmp_path / "archive",
        manifest_path=tmp_path / "archive" / "manifest.jsonl",
        now=lambda: datetime(2026, 9, 10, tzinfo=UTC),
    )


def test_filename_for_url_keeps_query_distinct():
    a = filename_for_url("https://unlarchive.org/unlarium/dictionary/export_dic.php?lang=en")
    b = filename_for_url("https://unlarchive.org/unlarium/dictionary/export_dic.php?lang=fr")
    assert a != b
    assert a.startswith("export_dic.php")


def test_fetch_and_store_writes_the_file_and_a_manifest_line(tmp_path):
    url = "https://unlarchive.org/index.php?unlweb=home"
    client = FakeClient({url: HttpResponse(200, {}, b"<html>hi</html>")})
    mirror = _mirror(tmp_path, client)

    result = mirror.fetch_and_store(
        bucket="pages",
        filename="home.html",
        url=url,
        licence="CC BY-SA 4.0",
        licence_url="https://creativecommons.org/licenses/by-sa/4.0/",
        title="UNL Archive",
    )
    mirror.flush()

    assert result.action == "fetched"
    written = (tmp_path / "archive" / "pages" / "home.html").read_bytes()
    assert written == b"<html>hi</html>"

    entries = read_manifest(tmp_path / "archive" / "manifest.jsonl")
    assert len(entries) == 1
    assert entries[0]["sha256"] == result.sha256
    assert entries[0]["licence"] == "CC BY-SA 4.0"
    assert entries[0]["path"] == "pages/home.html"


def test_a_php_fatal_error_body_is_stored_with_status_error(tmp_path):
    url = "https://unlarchive.org/unlarium/dictionary/export_dic.php"
    error_body = b"<b>Fatal error</b>: Uncaught mysqli_sql_exception: table missing"
    client = FakeClient({url: HttpResponse(200, {}, error_body)})
    mirror = _mirror(tmp_path, client)

    result = mirror.fetch_and_store(
        bucket="exports",
        filename="export_dic.php",
        url=url,
        licence="CC BY-SA 2.5 CH",
        licence_url="http://creativecommons.org/licenses/by-sa/2.5/ch/",
        title=None,
    )
    mirror.flush()

    assert result.action == "error"
    entries = read_manifest(tmp_path / "archive" / "manifest.jsonl")
    assert entries[0]["status"] == "error"
    assert "mysqli" in entries[0]["error"]
    # Not skipped: the file is still on disk, verbatim.
    assert (tmp_path / "archive" / "exports" / "export_dic.php").read_bytes() == error_body


def test_a_second_run_with_unchanged_content_writes_no_new_manifest_line(tmp_path):
    url = "https://unlarchive.org/index.php?unlweb=home"
    client = FakeClient({url: HttpResponse(200, {}, b"<html>hi</html>")})

    first = _mirror(tmp_path, client)
    first.fetch_and_store(
        bucket="pages",
        filename="home.html",
        url=url,
        licence="CC BY-SA 4.0",
        licence_url="https://creativecommons.org/licenses/by-sa/4.0/",
        title="UNL Archive",
    )
    first.flush()

    second = _mirror(tmp_path, client)
    result = second.fetch_and_store(
        bucket="pages",
        filename="home.html",
        url=url,
        licence="CC BY-SA 4.0",
        licence_url="https://creativecommons.org/licenses/by-sa/4.0/",
        title="UNL Archive",
    )
    second.flush()

    assert result.action == "unchanged"
    entries = read_manifest(tmp_path / "archive" / "manifest.jsonl")
    assert len(entries) == 1  # still just the one line, not appended again


def test_changed_content_appends_a_new_manifest_line(tmp_path):
    url = "https://unlarchive.org/index.php?unlweb=home"

    first_client = FakeClient({url: HttpResponse(200, {}, b"<html>v1</html>")})
    first = _mirror(tmp_path, first_client)
    first.fetch_and_store(
        bucket="pages",
        filename="home.html",
        url=url,
        licence="CC BY-SA 4.0",
        licence_url="https://creativecommons.org/licenses/by-sa/4.0/",
        title="UNL Archive",
    )
    first.flush()

    second_client = FakeClient({url: HttpResponse(200, {}, b"<html>v2</html>")})
    second = _mirror(tmp_path, second_client)
    result = second.fetch_and_store(
        bucket="pages",
        filename="home.html",
        url=url,
        licence="CC BY-SA 4.0",
        licence_url="https://creativecommons.org/licenses/by-sa/4.0/",
        title="UNL Archive",
    )
    second.flush()

    assert result.action == "fetched"
    entries = read_manifest(tmp_path / "archive" / "manifest.jsonl")
    assert len(entries) == 2
    assert (tmp_path / "archive" / "pages" / "home.html").read_bytes() == b"<html>v2</html>"


def test_unchanged_content_still_restores_a_missing_file(tmp_path):
    """A crash, or a manual deletion, can leave a manifest line with no file behind it. The next
    run must not treat the manifest's word for it as enough — it re-materialises the file."""
    url = "https://unlarchive.org/index.php?unlweb=home"
    client = FakeClient({url: HttpResponse(200, {}, b"<html>hi</html>")})

    first = _mirror(tmp_path, client)
    first.fetch_and_store(
        bucket="pages",
        filename="home.html",
        url=url,
        licence="CC BY-SA 4.0",
        licence_url="https://creativecommons.org/licenses/by-sa/4.0/",
        title="UNL Archive",
    )
    first.flush()

    written_file = tmp_path / "archive" / "pages" / "home.html"
    written_file.unlink()  # simulate the file going missing between runs
    assert not written_file.exists()

    second = _mirror(tmp_path, client)
    result = second.fetch_and_store(
        bucket="pages",
        filename="home.html",
        url=url,
        licence="CC BY-SA 4.0",
        licence_url="https://creativecommons.org/licenses/by-sa/4.0/",
        title="UNL Archive",
    )
    second.flush()

    assert result.action == "unchanged"
    assert written_file.read_bytes() == b"<html>hi</html>"
    entries = read_manifest(tmp_path / "archive" / "manifest.jsonl")
    assert len(entries) == 1  # restoring the file did not duplicate its manifest line


def test_a_304_response_is_treated_as_unchanged_without_hashing_a_body(tmp_path):
    url = "https://unlarchive.org/grammars/eng_unl_tgrammar.txt"
    first_client = FakeClient({url: HttpResponse(200, {"ETag": '"abc"'}, b"grammar text")})
    first = _mirror(tmp_path, first_client)
    first.fetch_and_store(
        bucket="grammars",
        filename="eng_unl_tgrammar.txt",
        url=url,
        licence="CC BY-SA 2.5 CH",
        licence_url="http://creativecommons.org/licenses/by-sa/2.5/ch/",
        title=None,
    )
    first.flush()

    second_client = FakeClient({url: HttpResponse(304, {}, b"")})
    second = _mirror(tmp_path, second_client)
    result = second.fetch_and_store(
        bucket="grammars",
        filename="eng_unl_tgrammar.txt",
        url=url,
        licence="CC BY-SA 2.5 CH",
        licence_url="http://creativecommons.org/licenses/by-sa/2.5/ch/",
        title=None,
    )
    second.flush()

    assert result.action == "unchanged"
    # The conditional GET sent the stored ETag back.
    assert second_client.calls[0][1] == {"If-None-Match": '"abc"'}
    entries = read_manifest(tmp_path / "archive" / "manifest.jsonl")
    assert len(entries) == 1
