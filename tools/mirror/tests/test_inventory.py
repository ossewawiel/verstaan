# SPDX-License-Identifier: MPL-2.0
"""`tools.mirror.inventory` (issue 11): manifest + languages.json in, `LanguageInventory` rows
out. Fixtures here are a handful of tiny files, not the real multi-megabyte archive (issue 11
"Not in scope": no real parsing, and no reason for slow tests either).
"""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

import pytest

from tools.mirror.inventory import (
    build_inventory,
    grade_for,
    read_manifest_languages,
    render_markdown,
    write_report,
)

_NO_GRAMMAR_TEMPLATE = (
    "<html><body><h1>{title}</h1><br /><br />"
    '<h2 class="err">No grammar available</h2></body></html>'
)

_DEFAULT_ONLY_ANALYSIS = (
    "<html><body><h1>{title}</h1><br /><br />"
    "<b>{code}0</b><br />Default<br /><br />"
    "<b>{code}1</b><br />Default<br /><br /></body></html>"
)


def _analysis_grammar(code: str, title: str, rule_ids: list[int]) -> str:
    body = _DEFAULT_ONLY_ANALYSIS.format(title=title, code=code).replace("</body>", "")
    for rid in rule_ids:
        body += f"<b>{code}{rid}</b><br />Some rule<br /><br />"
    return body + "</body></html>"


def _generation_inflection_grammar(title: str, rule_ids: list[int]) -> str:
    body = f"<html><body><h1>{title}</h1><br /><br />"
    for rid in rule_ids:
        body += f'(%x,M{rid}):=(%x,-M{rid},+FLX(SNG:=0>"";));<br /><br />'
    return body + "</body></html>"


def _write_language_exports(
    archive_root: Path,
    iso3: str,
    iso1: str,
    *,
    inflection_analysis_rules: list[int] | None = None,
    inflection_generation_rules: list[int] | None = None,
    inflection_generation_empty: bool = False,
    subcategorisation_analysis_rules: list[int] | None = None,
    subcategorisation_generation_rules: list[int] | None = None,
    dict_zip_lines: list[str] | None = None,
) -> None:
    export_dir = archive_root / "exports" / iso3
    export_dir.mkdir(parents=True, exist_ok=True)

    (export_dir / f"export_grammar.php__type_M_lang_{iso1}").write_text(
        _analysis_grammar("M", "Inflectional Grammar", inflection_analysis_rules or [])
    )
    if inflection_generation_empty:
        text = _NO_GRAMMAR_TEMPLATE.format(title="Inflectional Grammar for Generation")
    else:
        text = _generation_inflection_grammar(
            "Inflectional Grammar for Generation", inflection_generation_rules or []
        )
    (export_dir / f"export_grammar.php__type_M_direction_G_lang_{iso1}").write_text(text)

    (export_dir / f"export_grammar.php__type_Y_lang_{iso1}").write_text(
        _analysis_grammar("Y", "Subcategorization Grammar", subcategorisation_analysis_rules or [])
    )
    # UNLarium serves the identical subcategorisation rule set for both directions.
    (export_dir / f"export_grammar.php__type_Y_direction_G_lang_{iso1}").write_text(
        _analysis_grammar(
            "Y",
            "Subcategorization Grammar for Generation",
            subcategorisation_generation_rules
            if subcategorisation_generation_rules is not None
            else (subcategorisation_analysis_rules or []),
        )
    )

    if dict_zip_lines is not None:
        zip_path = export_dir / f"{iso1}_ana_a_c_ucl.zip"
        with zipfile.ZipFile(zip_path, "w") as archive:
            archive.writestr(f"{iso1}_ana_a_c_ucl_1.txt", "\n".join(dict_zip_lines) + "\n")


def _write_manifest(manifest_path: Path, iso3_list: list[str]) -> None:
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with manifest_path.open("w", encoding="utf-8") as fh:
        for iso3 in iso3_list:
            fh.write(
                json.dumps(
                    {
                        "path": f"exports/{iso3}/default_dic.txt",
                        "url": f"https://unlarchive.org/unlarium/dictionary/export?lang={iso3}",
                        "retrieved": "2026-09-11T12:00:00+00:00",
                        "sha256": "0" * 64,
                        "licence": "CC BY-SA 4.0",
                        "licence_url": "https://creativecommons.org/licenses/by-sa/4.0/",
                        "title": "UNLarium",
                        "language": iso3,
                    }
                )
                + "\n"
            )


@pytest.fixture
def archive(tmp_path: Path) -> Path:
    """A tiny archive: `wel`, a grade-A language; `mid`, grade B; `thin`, grade C with a
    non-empty dictionary zip but no grammar; `empty`, a language the manifest mentions but that
    has nothing mirrored — it must never appear in a row.
    """
    root = tmp_path / "archive"

    languages = [
        {
            "iso1": "we",
            "iso3": "wel",
            "name": "Wellish",
            "users": 10,
            "base_forms": 60000,
            "word_forms": 120000,
            "paradigms": 5,
            "frames": 3,
            "dict_level": "C1",
            "grammar_level": "B1",
        },
        {
            "iso1": "mi",
            "iso3": "mid",
            "name": "Midish",
            "users": 5,
            "base_forms": 15000,
            "word_forms": 20000,
            "paradigms": 4,
            "frames": 2,
            "dict_level": "B1",
            "grammar_level": "A2",
        },
        {
            "iso1": "th",
            "iso3": "thi",
            "name": "Thinnish",
            "users": 2,
            "base_forms": 0,
            "word_forms": 0,
            "paradigms": 0,
            "frames": 0,
            "dict_level": "A0",
            "grammar_level": "A0",
        },
        {
            "iso1": "em",
            "iso3": "emp",
            "name": "Emptish",
            "users": 1,
            "base_forms": 0,
            "word_forms": 0,
            "paradigms": 0,
            "frames": 0,
            "dict_level": "A0",
            "grammar_level": "A0",
        },
    ]
    languages_path = root / "languages.json"
    languages_path.parent.mkdir(parents=True, exist_ok=True)
    languages_path.write_text(json.dumps(languages), encoding="utf-8")

    manifest_path = root / "manifest.jsonl"
    _write_manifest(manifest_path, ["wel", "mid", "thi", "emp"])

    # wel: grade A, all four grammar exports non-empty, base_forms > 50000.
    _write_language_exports(
        root,
        "wel",
        "we",
        inflection_analysis_rules=[2, 3],
        inflection_generation_rules=[2, 3],
        subcategorisation_analysis_rules=[5],
        dict_zip_lines=["one", "two", "three"],
    )
    # mid: grade B, base_forms > 10000 and a non-empty generation export, but not all four.
    _write_language_exports(
        root,
        "mid",
        "mi",
        inflection_analysis_rules=[2],
        inflection_generation_rules=[2],
        subcategorisation_analysis_rules=[],
    )
    # thi: base_forms is 0 and no grammar rules, but a non-empty dictionary zip: still a row,
    # grade C.
    _write_language_exports(
        root,
        "thi",
        "th",
        dict_zip_lines=["only", "entry"],
    )
    # emp: nothing at all. Must be skipped.
    _write_language_exports(root, "emp", "em")

    return root


def test_build_inventory_skips_languages_with_no_export(archive: Path) -> None:
    rows = build_inventory(archive, archive / "manifest.jsonl", archive / "languages.json")
    isos = [row.iso3 for row in rows]
    assert "emp" not in isos
    assert set(isos) == {"wel", "mid", "thi"}


def test_build_inventory_sorts_by_base_forms_descending(archive: Path) -> None:
    rows = build_inventory(archive, archive / "manifest.jsonl", archive / "languages.json")
    assert [row.iso3 for row in rows] == ["wel", "mid", "thi"]


def test_grade_a_needs_base_forms_and_all_four_grammar_exports(archive: Path) -> None:
    rows = build_inventory(archive, archive / "manifest.jsonl", archive / "languages.json")
    wel = next(row for row in rows if row.iso3 == "wel")
    assert wel.base_forms == 60000
    assert wel.all_grammar_non_empty()
    assert wel.grade == "A"


def test_grade_b_needs_base_forms_and_generation_grammar(archive: Path) -> None:
    rows = build_inventory(archive, archive / "manifest.jsonl", archive / "languages.json")
    mid = next(row for row in rows if row.iso3 == "mid")
    assert mid.base_forms == 15000
    assert not mid.all_grammar_non_empty()
    assert mid.any_generation_non_empty()
    assert mid.grade == "B"


def test_grade_c_is_the_fallback_for_anything_else_non_empty(archive: Path) -> None:
    rows = build_inventory(archive, archive / "manifest.jsonl", archive / "languages.json")
    thin = next(row for row in rows if row.iso3 == "thi")
    assert thin.base_forms == 0
    assert not thin.any_generation_non_empty()
    assert thin.dictionary.line_count == 2
    assert thin.grade == "C"


@pytest.mark.parametrize(
    ("base_forms", "all_grammar", "generation", "expected"),
    [
        (50_001, True, True, "A"),
        (50_000, True, True, "B"),  # not strictly greater than 50k: falls to B's own test
        (10_001, False, True, "B"),
        (10_000, False, True, "C"),  # not strictly greater than 10k
        (1, False, False, "C"),
    ],
)
def test_grade_for_boundaries(base_forms, all_grammar, generation, expected) -> None:
    assert grade_for(base_forms, all_grammar, generation) == expected


def test_read_manifest_languages_reads_export_paths(archive: Path) -> None:
    languages = read_manifest_languages(archive / "manifest.jsonl")
    assert languages == {"wel", "mid", "thi", "emp"}


def test_dictionary_line_count_reads_the_largest_non_empty_zip(archive: Path) -> None:
    rows = build_inventory(archive, archive / "manifest.jsonl", archive / "languages.json")
    wel = next(row for row in rows if row.iso3 == "wel")
    assert wel.dictionary.filename == "we_ana_a_c_ucl.zip"
    assert wel.dictionary.line_count == 3


def test_subcategorisation_generation_reuses_analysis_when_not_given(archive: Path) -> None:
    rows = build_inventory(archive, archive / "manifest.jsonl", archive / "languages.json")
    wel = next(row for row in rows if row.iso3 == "wel")
    subc_analysis = wel.grammar_status("subcategorisation", "analysis")
    subc_generation = wel.grammar_status("subcategorisation", "generation")
    assert subc_analysis.non_empty
    assert subc_generation.non_empty


def test_render_markdown_states_the_grade_rule_verbatim(archive: Path) -> None:
    rows = build_inventory(archive, archive / "manifest.jsonl", archive / "languages.json")
    markdown = render_markdown(rows, None)
    assert "A = dictionary base forms > 50,000 and all four grammar exports non-empty." in markdown
    assert "B = dictionary base forms > 10,000 and the generation grammar is non-empty." in markdown
    assert "C = anything else with a non-empty export." in markdown


def test_render_markdown_has_one_row_per_non_empty_language(archive: Path) -> None:
    rows = build_inventory(archive, archive / "manifest.jsonl", archive / "languages.json")
    markdown = render_markdown(rows, None)
    assert "Wellish" in markdown
    assert "Midish" in markdown
    assert "Thinnish" in markdown
    assert "Emptish" not in markdown


def test_write_report_writes_the_file_and_returns_row_count(archive: Path, tmp_path: Path) -> None:
    out_path = tmp_path / "archive-inventory.md"
    count = write_report(archive, archive / "manifest.jsonl", archive / "languages.json", out_path)
    assert count == 3
    assert out_path.is_file()
    assert out_path.read_text(encoding="utf-8").startswith("# Archive inventory")
