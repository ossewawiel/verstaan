# SPDX-License-Identifier: MPL-2.0
"""Page parsing (SPEC.md §3.1): licence detection, static links, the `dev` page's GitHub note.

Uses recorded fixture HTML, not a live fetch (docs/standards/testing.md).
"""

from __future__ import annotations

from pathlib import Path

from tools.mirror.parsing import (
    extract_comment_notes,
    extract_licence,
    extract_links,
    extract_title,
    filter_static_links,
    looks_like_server_error,
)

_FIXTURES = Path(__file__).parent / "fixtures"


def _read(name: str) -> str:
    return (_FIXTURES / name).read_text(encoding="utf-8")


def test_dev_page_finds_the_commented_out_github_link():
    html = _read("unlweb_dev.html")
    notes = extract_comment_notes(html, keyword="github")
    assert len(notes) == 1
    assert "github" in notes[0].lower()
    assert "go to github" in notes[0].lower()


def test_page_without_a_github_comment_finds_none():
    html = _read("unlweb_home.html")
    assert extract_comment_notes(html, keyword="github") == []


def test_unlarium_page_licence_is_cc_by_sa_2_5_ch():
    html = _read("unlweb_unlarium.html")
    detected = extract_licence(html)
    assert detected is not None
    assert detected.licence == "CC BY-SA 2.5 CH"
    assert "2.5/ch" in detected.licence_url.lower()


def test_about_page_licence_is_cc_by_sa_4_0():
    html = _read("unlweb_about.html")
    detected = extract_licence(html)
    assert detected is not None
    assert detected.licence == "CC BY-SA 4.0"


def test_page_with_no_licence_link_returns_none():
    html = _read("unlweb_home.html")
    assert extract_licence(html) is None


def test_extract_title():
    html = _read("unlweb_home.html")
    assert extract_title(html) == "UNL Archive"


def test_filter_static_links_keeps_grammars_and_exports_only():
    html = _read("unlweb_unlarium.html")
    links = extract_links(html, "https://unlarchive.org/index.php?unlweb=unlarium")
    matches = filter_static_links(
        links,
        path_prefixes=("/grammars/", "/uploads/", "/unlarium/"),
        path_suffix_allow=(".txt", ".pdf"),
        path_pattern_allow=(r"export_.*\.php",),
    )
    assert any("eng_unl_tgrammar.txt" in m for m in matches)
    assert any("export_dic.php" in m for m in matches)
    assert any("export_corpus.php" in m for m in matches)
    assert not any("index.php?unlweb=" in m for m in matches)


def test_looks_like_server_error_detects_the_broken_dictionary_export():
    body = _read("export_dic_mysql_error.html").encode("utf-8")
    assert looks_like_server_error(body) is True


def test_looks_like_server_error_is_false_for_a_normal_page():
    body = _read("unlweb_home.html").encode("utf-8")
    assert looks_like_server_error(body) is False
