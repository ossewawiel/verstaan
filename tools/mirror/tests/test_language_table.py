# SPDX-License-Identifier: MPL-2.0
"""`parse_language_table`: the logged-in language list, trimmed to three real rows (fixture)."""

from __future__ import annotations

from pathlib import Path

from tools.mirror.language_table import parse_language_table

_FIXTURE = Path(__file__).parent / "fixtures" / "unlweb_language.html"


def test_parses_every_row():
    html = _FIXTURE.read_text(encoding="utf-8")
    rows = parse_language_table(html)
    assert len(rows) == 3
    by_iso3 = {row.iso3: row for row in rows}
    assert set(by_iso3) == {"abk", "afr", "eng"}


def test_thousands_separators_are_stripped_to_int():
    html = _FIXTURE.read_text(encoding="utf-8")
    rows = {row.iso3: row for row in parse_language_table(html)}
    afr = rows["afr"]
    assert afr.iso1 == "af"
    assert afr.name == "Afrikaans"
    assert afr.users == 41
    assert afr.base_forms == 8959
    assert afr.word_forms == 13768
    assert afr.paradigms == 17
    assert afr.frames == 7
    assert afr.dict_level == "A1"
    assert afr.grammar_level == "A2"


def test_needs_export_is_true_only_for_a_non_zero_dictionary_or_grammar_count():
    html = _FIXTURE.read_text(encoding="utf-8")
    rows = {row.iso3: row for row in parse_language_table(html)}
    assert rows["abk"].needs_export() is False  # every count is 0
    assert rows["afr"].needs_export() is True
    assert rows["eng"].needs_export() is True


def test_as_dict_has_the_ten_columns_issue_08_asks_for():
    html = _FIXTURE.read_text(encoding="utf-8")
    row = parse_language_table(html)[0]
    assert set(row.as_dict()) == {
        "iso1",
        "iso3",
        "name",
        "users",
        "base_forms",
        "word_forms",
        "paradigms",
        "frames",
        "dict_level",
        "grammar_level",
    }
