# SPDX-License-Identifier: MPL-2.0
"""End-to-end orchestration (SPEC.md §3.1): pages, their static links, the wiki, idempotently.

A fake site, not a live one: `FakeSite` answers exactly the URLs a real mirror run makes, so this
proves the wiring without a network call (docs/standards/testing.md). The idempotency proof this
issue's "Done when" asks for — two runs, the second downloads nothing new — is the last test.
"""

from __future__ import annotations

import json
from pathlib import Path

from tools.mirror.config import load_config
from tools.mirror.http_client import HttpResponse
from tools.mirror.manifest import read_manifest
from tools.mirror.run import run_mirror

_MIRROR_TOML = Path(__file__).resolve().parents[3] / "mirror.toml"

_HOME_HTML = """
<html><head><title>UNL Archive</title></head><body>
<a href="index.php?unlweb=home">Home</a>
<a href="index.php?unlweb=unlarium">UNLarium</a>
</body></html>
"""

_UNLARIUM_HTML = """
<html><head><title>UNLarium</title></head><body>
<a href="http://creativecommons.org/licenses/by-sa/2.5/ch/">CC BY-SA 2.5 CH</a>
<a href="https://www.unlarchive.org/grammars/eng_unl_tgrammar.txt">grammar</a>
<a href="https://unlarchive.org/unlarium/dictionary/export_dic.php?lang=en">export</a>
</body></html>
"""

_GRAMMAR_TXT = b";ENG-UNL TRANSFORMATION GRAMMAR\n"
_EXPORT_ERROR = b"<b>Fatal error</b>: Uncaught mysqli_sql_exception: table missing"


class FakeSite:
    """A `RateLimitedClient`-shaped fake: one canned response per exact URL."""

    def __init__(self, responses):
        self.responses = responses
        self.urls = []

    def get(self, url, *, extra_headers=None):
        self.urls.append(url)
        if url not in self.responses:
            raise AssertionError(f"unexpected fetch: {url}")
        return self.responses[url]


def _wiki_response(titles_page, revisions, parsed):
    return json.dumps({**titles_page, **revisions, **parsed}).encode("utf-8")


def _make_site():
    allpages_url = (
        "https://unlarchive.org/wiki/api.php?"
        "action=query&list=allpages&apnamespace=0&aplimit=500&format=json"
    )
    revisions_url = (
        "https://unlarchive.org/wiki/api.php?action=query&prop=revisions&titles=Grammar"
        "&rvslots=main&rvprop=content&format=json"
    )
    parse_url = (
        "https://unlarchive.org/wiki/api.php?action=parse&page=Grammar"
        "&prop=text%7Ccategories&format=json"
    )

    responses = {
        "https://unlarchive.org/index.php?unlweb=home": HttpResponse(
            200, {}, _HOME_HTML.encode("utf-8")
        ),
        "https://unlarchive.org/index.php?unlweb=unlarium": HttpResponse(
            200, {}, _UNLARIUM_HTML.encode("utf-8")
        ),
        "https://www.unlarchive.org/grammars/eng_unl_tgrammar.txt": HttpResponse(
            200, {"ETag": '"g1"'}, _GRAMMAR_TXT
        ),
        "https://unlarchive.org/unlarium/dictionary/export_dic.php?lang=en": HttpResponse(
            200, {}, _EXPORT_ERROR
        ),
        allpages_url: HttpResponse(
            200,
            {},
            json.dumps(
                {"query": {"allpages": [{"pageid": 1, "ns": 0, "title": "Grammar"}]}}
            ).encode("utf-8"),
        ),
        revisions_url: HttpResponse(
            200,
            {},
            json.dumps(
                {
                    "query": {
                        "pages": {"1": {"revisions": [{"slots": {"main": {"*": "'''Grammar'''"}}}]}}
                    }
                }
            ).encode("utf-8"),
        ),
        parse_url: HttpResponse(
            200,
            {},
            json.dumps(
                {
                    "parse": {
                        "text": {"*": "<b>Grammar</b>"},
                        "categories": [{"*": "Linguistics"}],
                    }
                }
            ).encode("utf-8"),
        ),
    }
    return FakeSite(responses)


def test_run_mirror_fetches_pages_static_links_and_wiki(tmp_path):
    config = load_config(_MIRROR_TOML)
    site = _make_site()
    archive_root = tmp_path / "archive"
    manifest_path = archive_root / "manifest.jsonl"

    report = run_mirror(config, site, archive_root, manifest_path)

    assert report.pages_fetched == 2
    assert report.static_files_fetched == 2  # the grammar file and the broken export
    assert report.wiki_pages_fetched == 1
    assert report.files_errored == 1

    assert (archive_root / "pages" / "home.html").exists()
    assert (archive_root / "grammars" / "eng_unl_tgrammar.txt").read_bytes() == _GRAMMAR_TXT
    assert (archive_root / "exports" / "export_dic.php__lang_en").read_bytes() == _EXPORT_ERROR
    assert (archive_root / "wiki" / "Grammar.wikitext").exists()
    assert (archive_root / "wiki" / "Grammar.html").exists()

    entries = read_manifest(manifest_path)
    by_path = {e["path"]: e for e in entries}
    assert by_path["grammars/eng_unl_tgrammar.txt"]["licence"] == "CC BY-SA 2.5 CH"
    assert by_path["exports/export_dic.php__lang_en"]["status"] == "error"
    assert "mysqli" in by_path["exports/export_dic.php__lang_en"]["error"]
    assert by_path["wiki/Grammar.wikitext"]["extra"]["categories"] == ["Linguistics"]


def test_a_crash_mid_run_still_leaves_a_manifest_line_for_what_was_already_fetched(tmp_path):
    """The mirror flushes after every page, not once at the end. A page fetched just before a
    crash must not be an orphan: present on disk, absent from the manifest (SPEC.md §3.1)."""
    config = load_config(_MIRROR_TOML)
    archive_root = tmp_path / "archive"
    manifest_path = archive_root / "manifest.jsonl"
    site = _make_site()

    real_get = site.get
    calls = {"n": 0}

    def flaky_get(url, *, extra_headers=None):
        calls["n"] += 1
        # Call 1 discovers the page list from the home page (and doubles as that page's own
        # content — no second fetch of it). Call 2 fetches the next page, "unlarium", and
        # succeeds. Call 3, a static file that page links, is where the crash lands.
        if calls["n"] == 3:
            raise ConnectionError("simulated crash")
        return real_get(url, extra_headers=extra_headers)

    site.get = flaky_get

    try:
        run_mirror(config, site, archive_root, manifest_path)
    except ConnectionError:
        pass
    else:
        raise AssertionError("expected the simulated crash to propagate")

    entries = read_manifest(manifest_path)
    assert len(entries) == 2  # both pages fetched before the crash, neither one an orphan
    for entry in entries:
        fetched_path = archive_root / entry["path"]
        assert fetched_path.exists()


def test_a_second_run_downloads_nothing_new(tmp_path):
    config = load_config(_MIRROR_TOML)
    archive_root = tmp_path / "archive"
    manifest_path = archive_root / "manifest.jsonl"

    first_site = _make_site()
    run_mirror(config, first_site, archive_root, manifest_path)
    first_manifest_lines = manifest_path.read_text(encoding="utf-8").splitlines()

    second_site = _make_site()  # same content, same URLs, nothing changed on the "server"
    second_report = run_mirror(config, second_site, archive_root, manifest_path)
    second_manifest_lines = manifest_path.read_text(encoding="utf-8").splitlines()

    # No new manifest lines landed, and the orchestrator's own counters agree.
    assert second_manifest_lines == first_manifest_lines
    assert second_report.files_written == 0
    assert second_report.files_unchanged == len(first_manifest_lines)
