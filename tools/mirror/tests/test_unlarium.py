# SPDX-License-Identifier: MPL-2.0
"""`run_login_mirror`: sign in, save the language table, mirror every export it points to
(SPEC.md §3.1, issue 08). A fake site, not a live one (docs/standards/testing.md).
"""

from __future__ import annotations

from pathlib import Path

from tools.mirror.config import load_config
from tools.mirror.http_client import HttpResponse
from tools.mirror.manifest import read_manifest
from tools.mirror.store import Mirror
from tools.mirror.unlarium import (
    LoginReport,
    _store_export,
    looks_like_generating_placeholder,
    run_login_mirror,
)

_MIRROR_TOML = Path(__file__).resolve().parents[3] / "mirror.toml"

_LOGGED_IN_HTML = "<html><body><h2>Marsel Pretorius</h2></body></html>"

# Two languages: "ab" has every count at zero (skipped); "af" has entries (fetched).
_LANGUAGE_HTML = """
<table>
<tr>
 <td><a href="?lang=ab">ab</a></td><td><a href="?lang=ab">abk</a></td>
 <td><a href="?lang=ab">Abkhazian</a></td><td>75</td>
 <td>0</td><td>0</td><td>0</td><td>0</td>
 <td>A0</a></td><td>A0</a></td>
</tr>
<tr>
 <td><a href="?lang=af">af</a></td><td><a href="?lang=af">afr</a></td>
 <td><a href="?lang=af">Afrikaans</a></td><td>41</td>
 <td>8,959</td><td>13,768</td><td>17</td><td>7</td>
 <td>A1</a></td><td>A2</a></td>
</tr>
</table>
"""

_DICT_EXPORT_AF_HTML = """
<html><body>
<a href="../dics/af_gen_a_c_ucn.zip" target="_blank" title="Export">04/11/2025</a>
</body></html>
"""

_GRAMMAR_EXPORT_AF_HTML = """
<html><body>
<a href="grammar/export_grammar.php?type=M&direction=G&lang=af" target="_blank">Inflectional</a>
<a href="grammar/export_grammar.php?type=Y&direction=G&lang=af" target="_blank">Subcategorization</a>
<a href="dictionary/export_tagset.php" target="_blank">Tagset</a>
</body></html>
"""

_TAGSET_TXT = b"UNDL Foundation Tagset\nPOS=NOU\n"
_ZIP_BYTES = b"PK\x03\x04 pretend zip bytes"
_INFLECTIONAL_GRAMMAR = b'(%x,M2):=(%x,-M2,+FLX(SNG:=0>"";));'
_NO_GRAMMAR_HTML = b'<h1>Grammar</h1><h2 class="err">No grammar available</h2>'

_CORPUS_LIST_HTML = """
<html><body>
<a href="index.php?corpus=explore&proj=ul001" title="View project info">ul001</a>
</body></html>
"""

_CORPUS_EXPORT_HTML = """
<html><body>
<a href="corpus/export_corpus.php?project=ul001&lang=fr&unl=0" target="_blank">export</a>
</body></html>
"""

_CORPUS_SENTENCES = b"1\tCeci est une phrase.\n"

_FILES_HTML = """
<html><body>
<a href="../../uploads/656.txt" target="_blank">656</a>
</body></html>
"""

_UPLOAD_TXT = b'[oupa] {656} "12345" (POS=NOU) <af,0,0>;\n'


def _urls():
    root = "https://unlarchive.org"
    return {
        "login": f"{root}/user/index.php?page=login",
        "language": f"{root}/user/index.php?unlweb=language",
        "tagset": f"{root}/unlarium/dictionary/export_tagset.php",
        "dict_export_af": f"{root}/unlarium/index.php?unlarium=dictionary&lang=af&action=export",
        "dict_zip_af": f"{root}/dics/af_gen_a_c_ucn.zip",
        "grammar_export_af": f"{root}/unlarium/index.php?unlarium=grammar&lang=af&grammar=export",
        "grammar_m_af": f"{root}/unlarium/grammar/export_grammar.php?type=M&direction=G&lang=af",
        "grammar_y_af": f"{root}/unlarium/grammar/export_grammar.php?type=Y&direction=G&lang=af",
        "corpus_list": f"{root}/unlarium/index.php?unlarium=corpus",
        "corpus_export_ul001": f"{root}/unlarium/index.php?corpus=export&proj=ul001",
        "corpus_sentences": f"{root}/unlarium/corpus/export_corpus.php?project=ul001&lang=fr&unl=0",
        "files": f"{root}/user/index.php?unlweb=files",
        "upload_656": f"{root}/uploads/656.txt",
    }


class FakeSite:
    """A GET may map to one fixed response, or to a list — each call pops the next one off the
    front, holding on the last once the list is down to one (issue 08: a placeholder response
    followed, on retry, by the real one)."""

    def __init__(self, get_responses):
        self.get_responses = get_responses
        self.get_urls = []
        self.post_calls = []

    def get(self, url, *, extra_headers=None):
        self.get_urls.append(url)
        if url not in self.get_responses:
            raise AssertionError(f"unexpected GET: {url}")
        value = self.get_responses[url]
        if isinstance(value, list):
            return value.pop(0) if len(value) > 1 else value[0]
        return value

    def get_while(self, url, still_pending, *, extra_headers=None, retries=3):
        """Mirrors `RateLimitedClient.get_while`'s attempt bound (issue 08), without the real
        sleeps — a fake site is instant, retry timing is `test_http_client.py`'s job."""
        response = self.get(url, extra_headers=extra_headers)
        for _ in range(retries - 1):
            if not still_pending(response.body):
                return response
            response = self.get(url, extra_headers=extra_headers)
        return response

    def post(self, url, *, data, extra_headers=None):
        self.post_calls.append((url, data))
        return HttpResponse(200, {}, _LOGGED_IN_HTML.encode("utf-8"))


def _make_site():
    u = _urls()
    responses = {
        u["language"]: HttpResponse(200, {}, _LANGUAGE_HTML.encode("utf-8")),
        u["tagset"]: HttpResponse(200, {}, _TAGSET_TXT),
        u["dict_export_af"]: HttpResponse(200, {}, _DICT_EXPORT_AF_HTML.encode("utf-8")),
        u["dict_zip_af"]: HttpResponse(200, {}, _ZIP_BYTES),
        u["grammar_export_af"]: HttpResponse(200, {}, _GRAMMAR_EXPORT_AF_HTML.encode("utf-8")),
        u["grammar_m_af"]: HttpResponse(200, {}, _INFLECTIONAL_GRAMMAR),
        u["grammar_y_af"]: HttpResponse(200, {}, _NO_GRAMMAR_HTML),
        u["corpus_list"]: HttpResponse(200, {}, _CORPUS_LIST_HTML.encode("utf-8")),
        u["corpus_export_ul001"]: HttpResponse(200, {}, _CORPUS_EXPORT_HTML.encode("utf-8")),
        u["corpus_sentences"]: HttpResponse(200, {}, _CORPUS_SENTENCES),
        u["files"]: HttpResponse(200, {}, _FILES_HTML.encode("utf-8")),
        u["upload_656"]: HttpResponse(200, {}, _UPLOAD_TXT),
    }
    return FakeSite(responses)


def test_run_login_mirror_signs_in_and_mirrors_every_export(tmp_path):
    config = load_config(_MIRROR_TOML)
    site = _make_site()
    archive_root = tmp_path / "archive"
    manifest_path = archive_root / "manifest.jsonl"

    report = run_login_mirror(config, site, archive_root, manifest_path, "wawiel", "hunter2")

    # Signed in before anything else was fetched.
    assert site.post_calls[0][0] == _urls()["login"]

    # The language table: every row seen, only "af" (non-zero counts) gets exports fetched.
    assert report.languages_seen == 2
    assert (archive_root / "languages.json").exists()
    import json

    saved = json.loads((archive_root / "languages.json").read_text(encoding="utf-8"))
    assert {row["iso3"] for row in saved} == {"abk", "afr"}
    afr = next(row for row in saved if row["iso3"] == "afr")
    assert afr["base_forms"] == 8959  # comma stripped

    # "ab" (every count zero) never had its dictionary or grammar page fetched.
    assert _urls()["dict_export_af"] in site.get_urls
    assert all("lang=ab" not in url for url in site.get_urls if "unlarium=dictionary" in url)

    # The dictionary zip landed under exports/<iso3>/.
    assert (archive_root / "exports" / "afr" / "af_gen_a_c_ucn.zip").read_bytes() == _ZIP_BYTES

    # The inflectional grammar (real content) and the subcategorization grammar ("No grammar
    # available") both landed, the second one marked empty, not dropped.
    entries = read_manifest(manifest_path)
    by_path = {e["path"]: e for e in entries}
    m_path = "exports/afr/export_grammar.php__type_M_direction_G_lang_af"
    y_path = "exports/afr/export_grammar.php__type_Y_direction_G_lang_af"
    assert m_path in by_path
    assert y_path in by_path
    assert by_path[y_path]["status"] == "empty"
    assert "status" not in by_path[m_path]

    # The tagset was fetched exactly once, not once per language.
    assert site.get_urls.count(_urls()["tagset"]) == 1
    assert (archive_root / "exports" / "export_tagset.php").read_bytes() == _TAGSET_TXT

    # Corpus and Files page uploads.
    assert (
        archive_root
        / "exports"
        / "corpus"
        / "ul001"
        / "export_corpus.php__project_ul001_lang_fr_unl_0"
    ).read_bytes() == _CORPUS_SENTENCES
    assert (archive_root / "uploads" / "656.txt").read_bytes() == _UPLOAD_TXT

    assert report.exports_empty == 1
    assert report.exports_fetched >= 5


def test_a_zero_byte_response_is_stored_as_status_empty_not_ok(tmp_path):
    """The live site under load answers a dictionary zip request with an empty 200 body — the
    same "nothing here" signal as "No grammar available", just wordless. Never mistaken for a
    real, empty-but-successful export (issue 08)."""
    store = Mirror(
        # `fetch_and_store_bytes` never calls `client.get` (SPEC.md §3.1: content already
        # fetched), but `Mirror.client` is typed `RateLimitedClient`, not optional — a real
        # double, not `None`, keeps the type checker honest about what this path can touch.
        client=FakeSite({}),
        archive_root=tmp_path / "archive",
        manifest_path=tmp_path / "archive" / "m.jsonl",
    )
    report = LoginReport()

    _store_export(
        store,
        report,
        bucket="exports/eng",
        url="https://unlarchive.org/dics/en_ana_a_c_ucl.zip",
        content=b"",
        licence="CC BY-SA 2.5 CH",
        licence_url="http://creativecommons.org/licenses/by-sa/2.5/ch/",
        language="eng",
    )
    store.flush()

    assert report.exports_empty == 1
    assert report.exports_fetched == 0
    entries = read_manifest(tmp_path / "archive" / "m.jsonl")
    assert entries[0]["status"] == "empty"


_GENERATING_PLACEHOLDER_HTML = b"""<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>UNLarium</title></head>
<body>
<h1>Georgian Dictionary</h1>Version of September 11, 2026<br />
<div id="progressbar1" class="progressbar">
  <div id="progressbar1_message">Please wait...</div>
  <div id="progressbar1_fill"></div>
</div>"""  # cut short mid-render: no entries, no closing </html> (issue 08)


def test_looks_like_generating_placeholder_detects_a_page_cut_short_mid_render():
    assert looks_like_generating_placeholder(_GENERATING_PLACEHOLDER_HTML)


def test_looks_like_generating_placeholder_is_false_for_a_finished_page():
    # The same "Please wait..." banner is static copy at the top of every finished page too —
    # only a missing closing </html> says the render never completed.
    finished = _GENERATING_PLACEHOLDER_HTML + b"[word] {1} <af,0,0>;</body>\n</html>"
    assert not looks_like_generating_placeholder(finished)


def test_looks_like_generating_placeholder_is_false_for_a_php_fatal_error_page():
    # A settled (if broken) answer, not a still-generating one — `looks_like_server_error`'s job.
    fatal = _GENERATING_PLACEHOLDER_HTML + b"<b>Fatal error</b>: Uncaught mysqli_sql_exception"
    assert not looks_like_generating_placeholder(fatal)


def test_a_generating_placeholder_is_retried_then_the_real_export_is_stored(tmp_path):
    """UNLarium answers the dictionary zip request with the "please wait…" placeholder once,
    then the real file on retry — the mirror must not file the placeholder as the export
    (issue 08)."""
    config = load_config(_MIRROR_TOML)
    site = _make_site()
    u = _urls()
    site.get_responses[u["dict_zip_af"]] = [
        HttpResponse(200, {}, _GENERATING_PLACEHOLDER_HTML),
        HttpResponse(200, {}, _ZIP_BYTES),
    ]
    archive_root = tmp_path / "archive"
    manifest_path = archive_root / "manifest.jsonl"

    report = run_login_mirror(config, site, archive_root, manifest_path, "wawiel", "hunter2")

    assert (archive_root / "exports" / "afr" / "af_gen_a_c_ucn.zip").read_bytes() == _ZIP_BYTES
    entries = read_manifest(manifest_path)
    by_path = {e["path"]: e for e in entries}
    assert "status" not in by_path["exports/afr/af_gen_a_c_ucn.zip"]
    assert report.exports_timeout == 0


def test_a_generating_placeholder_that_never_resolves_is_stored_as_status_timeout(tmp_path):
    """Every retry still answers "please wait…" — recorded honestly as `status: "timeout"`,
    never `"ok"` (the bug that let run 2 redo already-"complete" work, issue 08)."""
    store = Mirror(
        client=FakeSite({}),
        archive_root=tmp_path / "archive",
        manifest_path=tmp_path / "archive" / "m.jsonl",
    )
    report = LoginReport()

    _store_export(
        store,
        report,
        bucket="exports/geo",
        url="https://unlarchive.org/unlarium/dictionary/export_dic.php?lang=ka",
        content=_GENERATING_PLACEHOLDER_HTML,
        licence="CC BY-SA 2.5 CH",
        licence_url="http://creativecommons.org/licenses/by-sa/2.5/ch/",
        language="geo",
        still_pending=True,
    )
    store.flush()

    assert report.exports_timeout == 1
    assert report.exports_fetched == 0
    assert report.exports_empty == 0
    entries = read_manifest(tmp_path / "archive" / "m.jsonl")
    assert entries[0]["status"] == "timeout"


def test_a_second_run_downloads_nothing_new(tmp_path):
    config = load_config(_MIRROR_TOML)
    archive_root = tmp_path / "archive"
    manifest_path = archive_root / "manifest.jsonl"

    run_login_mirror(config, _make_site(), archive_root, manifest_path, "wawiel", "hunter2")
    first_lines = manifest_path.read_text(encoding="utf-8").splitlines()

    second_report = run_login_mirror(
        config, _make_site(), archive_root, manifest_path, "wawiel", "hunter2"
    )
    second_lines = manifest_path.read_text(encoding="utf-8").splitlines()

    assert second_lines == first_lines
    assert second_report.exports_fetched == 0
