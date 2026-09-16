# SPDX-License-Identifier: MPL-2.0
"""tools/importer/grammar.py: issue 15.

Runs the real importer against `tests/fixtures/archive/` (issue 166), a whole-file copy of every
grammar export `import_language` reads for afr and eng: each is already small on the real archive
(18-269 lines), so the fixture carries every line, not a carved subset. SPEC.md §3.1 wrote the
real files this mirrors; nothing here re-derives an expected value from this importer's own output
(docs/standards/testing.md). Every literal value asserted below (rule text, paradigm affixation
strings, frame bodies) was read directly out of the archive files, or copied verbatim from
`docs/unl-reference/formats/transformation-grammar.md`, `inflection.md` and
`subcategorisation.md`'s own worked examples, before this file was written.
`tests/fixtures/archive/manifest.jsonl` names the source path and licence for every fixture file.

**Known gap, flagged rather than guessed around**: the disambiguation (`D`-rule) line grammar is
undocumented anywhere under `docs/unl-reference/formats/` (see `tools/importer/grammar.py`'s
module docstring). `test_afrikaans_disambiguation_holds_both_dgrammar_files` below checks the
importer's own reasonable-effort reading produces records sourced from both files and validating
against the schema, not that the reading is the one true parse of an undocumented format.

Every shard is read off disk exactly once per language (`import_language` writes the five
`grammar/*.yaml` files and `_unparsed.txt`, `yaml.safe_load` reads them back once): the
`afr_store`/`eng_store` fixtures are module-scoped and every test below shares their one
in-memory result.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pytest
import yaml
from jsonschema import Draft202012Validator

from tools.importer.grammar import (
    CatalogueEntry,
    ImportStats,
    build_inflection_records,
    build_subcategorisation_records,
    import_language,
    parse_d_rule_line,
    parse_html_catalogue,
    parse_t_rule_line,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
ARCHIVE_ROOT = REPO_ROOT / "tests" / "fixtures" / "archive"
SCHEMA_PATH = REPO_ROOT / "tools" / "validate" / "schema" / "grammar-rule.schema.json"

GRAMMAR_KINDS = ("analysis", "generation", "inflection", "subcategorisation", "disambiguation")

# Every file `import_language` reads for afr/eng, copied whole into tests/fixtures/archive/ (issue
# 166): each is already small (18-269 lines) on the real archive, so nothing needed carving.
REQUIRED_FILES = [
    ARCHIVE_ROOT / "grammars" / "eng_unl_tgrammar.txt",
    ARCHIVE_ROOT / "exports" / "afr" / "47.tgrammar.txt",
    ARCHIVE_ROOT / "exports" / "afr" / "44.tgrammar.txt",
    ARCHIVE_ROOT / "exports" / "afr" / "nl_unl_tgrammar.txt",
    ARCHIVE_ROOT / "exports" / "afr" / "unl_nl_tgrammar.txt",
    ARCHIVE_ROOT / "exports" / "eng" / "nl_unl_tgrammar.txt",
    ARCHIVE_ROOT / "exports" / "eng" / "unl_nl_tgrammar.txt",
    ARCHIVE_ROOT / "exports" / "afr" / "export_grammar.php__type_M_lang_af",
    ARCHIVE_ROOT / "exports" / "eng" / "export_grammar.php__type_M_lang_en",
    ARCHIVE_ROOT / "exports" / "afr" / "export_grammar.php__type_Y_lang_af",
    ARCHIVE_ROOT / "exports" / "eng" / "export_grammar.php__type_Y_lang_en",
    ARCHIVE_ROOT / "exports" / "afr" / "44.dgrammar.txt",
    ARCHIVE_ROOT / "exports" / "afr" / "47.dgrammar.txt",
]


@dataclass
class Store:
    root: Path
    stats: ImportStats
    files: dict[str, list[dict]]  # "analysis" -> that file's records, read once


def _records(path: Path) -> list[dict]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return data if isinstance(data, list) else []


def _load_store(iso3: str, store_root: Path) -> Store:
    stats = import_language(iso3, ARCHIVE_ROOT, store_root)
    grammar_dir = store_root / iso3 / "grammar"
    files = {kind: _records(grammar_dir / f"{kind}.yaml") for kind in GRAMMAR_KINDS}
    return Store(store_root, stats, files)


@pytest.fixture(scope="module")
def afr_store(tmp_path_factory: pytest.TempPathFactory) -> Store:
    return _load_store("afr", tmp_path_factory.mktemp("afr-grammar-store"))


@pytest.fixture(scope="module")
def eng_store(tmp_path_factory: pytest.TempPathFactory) -> Store:
    return _load_store("eng", tmp_path_factory.mktemp("eng-grammar-store"))


# --------------------------------------------------------------------------------------------
# Worked rules, transformation-grammar.md: Rule 1 (section 1.1, nouns), Rules 2 and 3
# (section 1.2, verbs), from grammars/eng_unl_tgrammar.txt.
# --------------------------------------------------------------------------------------------


def test_worked_rule_1_mark_plural_nouns_matches_transformation_grammar_md(eng_store: Store):
    rule = next(r for r in eng_store.files["analysis"] if r["comment"] == "books > book.@pl")
    assert rule["kind"] == "analysis"
    assert rule["lhs"] == "(N,PLR,^@pl,^@multal,^@paucal,^@all)"
    assert rule["rhs"] == "(+att=@pl)"
    assert rule["conditions"] == []
    assert rule["source"] == {"archive_path": "grammars/eng_unl_tgrammar.txt", "line": 17}


def test_worked_rule_2_fold_auxiliary_tense_matches_transformation_grammar_md(eng_store: Store):
    rule = next(
        r
        for r in eng_store.files["analysis"]
        if r["comment"] == "is.@present killing > killing.@progressive.@present"
    )
    assert rule["kind"] == "analysis"
    assert rule["lhs"] == "(AUX,%x)(GER,%y)"
    assert rule["rhs"] == "(%y,+att=@progressive,+att=%x)"
    assert rule["source"] == {"archive_path": "grammars/eng_unl_tgrammar.txt", "line": 24}


def test_worked_rule_3_attach_negation_matches_transformation_grammar_md(eng_store: Store):
    rule = next(r for r in eng_store.files["analysis"] if r["comment"] == "not kill > kill.@not")
    assert rule["kind"] == "analysis"
    assert rule["lhs"] == "({[not]|[n't]})({V,^AUX|J|N|A|D},%x)"
    assert rule["rhs"] == "(+att=@not,%x)"
    assert rule["source"] == {"archive_path": "grammars/eng_unl_tgrammar.txt", "line": 32}


def test_analysis_yaml_also_holds_the_shared_default_grammar(eng_store: Store):
    # SPEC.md §3.3 names five grammar files, not six: the shared default grammar
    # (exports/eng/nl_unl_tgrammar.txt) merges into analysis.yaml, tagged kind: default.
    defaults = [r for r in eng_store.files["analysis"] if r["kind"] == "default"]
    customs = [r for r in eng_store.files["analysis"] if r["kind"] == "analysis"]
    assert defaults and customs
    assert all(r["source"]["archive_path"] == "exports/eng/nl_unl_tgrammar.txt" for r in defaults)
    assert all(r["source"]["archive_path"] == "grammars/eng_unl_tgrammar.txt" for r in customs)


def test_afrikaans_generation_yaml_holds_the_custom_and_default_grammar(afr_store: Store):
    generation = afr_store.files["generation"]
    customs = [r for r in generation if r["kind"] == "generation"]
    defaults = [r for r in generation if r["kind"] == "default"]
    assert customs and defaults
    assert all(r["source"]["archive_path"] == "exports/afr/47.tgrammar.txt" for r in customs)
    assert all(r["source"]["archive_path"] == "exports/afr/unl_nl_tgrammar.txt" for r in defaults)


def test_afrikaans_analysis_yaml_holds_only_the_default_grammar(afr_store: Store):
    # afr has no custom analysis-direction transformation grammar (issue 15): only 47.tgrammar.txt
    # (generation direction) is real; 44.tgrammar.txt has no parseable rules at all.
    analysis = afr_store.files["analysis"]
    assert analysis
    assert all(r["kind"] == "default" for r in analysis)


def test_44_tgrammar_lines_all_go_to_unparsed_with_no_rule_syntax_found_reason(afr_store: Store):
    text = (afr_store.root / "afr" / "_unparsed.txt").read_text(encoding="utf-8")
    lines_44 = [
        line for line in text.splitlines() if line.startswith("exports/afr/44.tgrammar.txt:")
    ]
    total_lines_in_file = len(
        (ARCHIVE_ROOT / "exports" / "afr" / "44.tgrammar.txt")
        .read_text(encoding="utf-8")
        .splitlines()
    )
    assert len(lines_44) == total_lines_in_file
    assert all(line.endswith("no rule syntax found") for line in lines_44)


# --------------------------------------------------------------------------------------------
# Inflection: M2, M7, M16, inflection.md's three worked paradigms.
# --------------------------------------------------------------------------------------------


def test_m2_add_s_paradigm_matches_inflection_md(eng_store: Store):
    m2 = next(r for r in eng_store.files["inflection"] if r["id"] == "M2")
    assert m2["kind"] == "inflection"
    assert '0>"s"' in m2["rhs"]
    assert m2["rhs"] == 'SNG:=0>"";PLR:=0>"s";'


def test_m7_replace_man_men_paradigm_matches_inflection_md(eng_store: Store):
    m7 = next(r for r in eng_store.files["inflection"] if r["id"] == "M7")
    assert m7["kind"] == "inflection"
    assert '"man":"men"' in m7["rhs"]


def test_m16_regular_verbs_paradigm_matches_inflection_md(eng_store: Store):
    m16 = next(r for r in eng_store.files["inflection"] if r["id"] == "M16")
    assert m16["kind"] == "inflection"
    assert '0>"ed"' in m16["rhs"]
    assert m16["rhs"] == 'INF:=0>"";PAS:=0>"ed";PTP:=0>"ed";3PS&PRS:=0>"s";GER:=0>"ing";'


def test_afrikaans_inflection_yaml_holds_paradigms_parsed_from_the_afr_export(afr_store: Store):
    ids = {r["id"] for r in afr_store.files["inflection"]}
    assert {"M2", "M7", "M16"} <= ids
    assert all(r["kind"] == "inflection" for r in afr_store.files["inflection"])
    assert all(
        r["source"]["archive_path"] == "exports/afr/export_grammar.php__type_M_lang_af"
        for r in afr_store.files["inflection"]
    )


def test_afrikaans_m16_is_a_different_paradigm_than_englishs_m16(
    afr_store: Store, eng_store: Store
):
    # inflection.md: paradigm numbers are per-language, not shared archive-wide. afr M16 is a
    # noun-plural rule ("'s"), not English M16's regular-verb paradigm.
    afr_m16 = next(r for r in afr_store.files["inflection"] if r["id"] == "M16")
    eng_m16 = next(r for r in eng_store.files["inflection"] if r["id"] == "M16")
    assert afr_m16["rhs"] != eng_m16["rhs"]
    assert '"\'s"' in afr_m16["rhs"]


def test_inflection_generation_direction_export_is_not_re_imported(eng_store: Store):
    # export_grammar.php__type_M_direction_G_lang_en re-wraps the same paradigms for generation;
    # not a separate source any inflection.yaml record points at.
    assert all(
        r["source"]["archive_path"] != "exports/eng/export_grammar.php__type_M_direction_G_lang_en"
        for r in eng_store.files["inflection"]
    )


# --------------------------------------------------------------------------------------------
# Subcategorisation: Y38, Y42, Y259, subcategorisation.md's three worked frames.
# --------------------------------------------------------------------------------------------


def test_y38_direct_transitive_verb_matches_subcategorisation_md(eng_store: Store):
    y38 = next(r for r in eng_store.files["subcategorisation"] if r["id"] == "Y38")
    assert y38["kind"] == "subcategorisation"
    assert y38["lhs"] == "VS(NP)VC(NP)"
    assert y38["rhs"] == ""


def test_y42_indirect_transitive_to_matches_subcategorisation_md(eng_store: Store):
    y42 = next(r for r in eng_store.files["subcategorisation"] if r["id"] == "Y42")
    assert y42["kind"] == "subcategorisation"
    assert y42["lhs"] == "VS(NP)VC(PH([to]))"


def test_y259_pp_complement_is_np_matches_subcategorisation_md(eng_store: Store):
    y259 = next(r for r in eng_store.files["subcategorisation"] if r["id"] == "Y259")
    assert y259["kind"] == "subcategorisation"
    assert y259["lhs"] == "PC(NP)"


def test_subcategorisation_generation_direction_export_is_not_re_imported(eng_store: Store):
    assert all(
        r["source"]["archive_path"] != "exports/eng/export_grammar.php__type_Y_direction_G_lang_en"
        for r in eng_store.files["subcategorisation"]
    )


# --------------------------------------------------------------------------------------------
# Schema validation: `pytest tools/importer/test_grammar.py -k schema` checks both languages.
# --------------------------------------------------------------------------------------------


def _assert_all_validate(records: list[dict]) -> None:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)
    assert records
    for record in records:
        errors = list(validator.iter_errors(record))
        assert not errors, f"{record.get('id')!r} ({record.get('kind')}): {errors[0].message}"


@pytest.mark.parametrize("kind", GRAMMAR_KINDS)
def test_afrikaans_grammar_records_validate_against_schema(afr_store: Store, kind: str):
    if kind == "disambiguation":
        _assert_all_validate(afr_store.files[kind])
        return
    _assert_all_validate(afr_store.files[kind])


@pytest.mark.parametrize("kind", GRAMMAR_KINDS)
def test_english_grammar_records_validate_against_schema(eng_store: Store, kind: str):
    if kind == "disambiguation":
        # eng has no *.dgrammar.txt export: empty file is the correct, valid output.
        assert eng_store.files[kind] == []
        return
    _assert_all_validate(eng_store.files[kind])


# --------------------------------------------------------------------------------------------
# Disambiguation: afr from 44.dgrammar.txt/47.dgrammar.txt; eng empty, archive: none for eng.
# --------------------------------------------------------------------------------------------


def test_afrikaans_disambiguation_holds_both_dgrammar_files(afr_store: Store):
    records = afr_store.files["disambiguation"]
    assert records
    assert all(r["kind"] == "disambiguation" for r in records)
    sources = {r["source"]["archive_path"] for r in records}
    assert sources == {"exports/afr/44.dgrammar.txt", "exports/afr/47.dgrammar.txt"}


def test_english_disambiguation_is_empty_with_archive_none_comment(eng_store: Store):
    # data/archive/manifest.jsonl carries no *.dgrammar.txt entry with language "eng" (checked at
    # issue-15 authoring time: grep '"path": ".*dgrammar' with language "eng" -- zero matches
    # against 42 total dgrammar.txt manifest lines, none of them eng).
    manifest_lines = (ARCHIVE_ROOT / "manifest.jsonl").read_text(encoding="utf-8").splitlines()
    eng_dgrammar = [
        line
        for line in manifest_lines
        if '"dgrammar.txt"'.strip('"') in line
        and '"language": "eng"' in line
        and "dgrammar" in line
    ]
    assert eng_dgrammar == []
    assert eng_store.files["disambiguation"] == []
    text = (eng_store.root / "eng" / "grammar" / "disambiguation.yaml").read_text(encoding="utf-8")
    assert "archive: none for eng" in text


# --------------------------------------------------------------------------------------------
# Unparsed-line accounting: SPEC.md §3.2, nothing dropped silently.
# --------------------------------------------------------------------------------------------


def test_afrikaans_input_units_equal_parsed_plus_unparsed(afr_store: Store):
    stats = afr_store.stats
    assert stats.input_units == stats.parsed_records + stats.unparsed_lines
    assert stats.parsed_records > 0
    assert stats.unparsed_lines > 0


def test_english_input_units_equal_parsed_plus_unparsed(eng_store: Store):
    stats = eng_store.stats
    assert stats.input_units == stats.parsed_records + stats.unparsed_lines
    assert stats.parsed_records > 0
    assert stats.unparsed_lines > 0


def test_afrikaans_unparsed_file_holds_the_grammar_marker_block(afr_store: Store):
    text = (afr_store.root / "afr" / "_unparsed.txt").read_text(encoding="utf-8")
    assert "grammar.py: grammar _unparsed.txt lines below" in text


def test_grammar_importer_does_not_clobber_an_existing_unparsed_txt(tmp_path: Path):
    # A prior importer (dictionary.py, issue 14) may already have written _unparsed.txt for this
    # language; this importer must preserve those lines, not overwrite the file outright.
    lang_dir = tmp_path / "eng"
    lang_dir.mkdir()
    (lang_dir / "_unparsed.txt").write_text(
        "exports/eng/en_ana_u_c_ucl/x.txt:1: some dictionary reason\n    raw dictionary line\n",
        encoding="utf-8",
    )
    import_language("eng", ARCHIVE_ROOT, tmp_path)
    text = (lang_dir / "_unparsed.txt").read_text(encoding="utf-8")
    assert "some dictionary reason" in text
    assert "grammar.py: grammar _unparsed.txt lines below" in text


def test_grammar_importer_is_idempotent_on_its_own_unparsed_block(tmp_path: Path):
    import_language("eng", ARCHIVE_ROOT, tmp_path)
    first = (tmp_path / "eng" / "_unparsed.txt").read_text(encoding="utf-8")
    import_language("eng", ARCHIVE_ROOT, tmp_path)
    second = (tmp_path / "eng" / "_unparsed.txt").read_text(encoding="utf-8")
    assert first == second


# --------------------------------------------------------------------------------------------
# Store shape: SPEC.md §3.3, §4.
# --------------------------------------------------------------------------------------------


@pytest.fixture
def store(request: pytest.FixtureRequest, afr_store: Store, eng_store: Store) -> Store:
    return afr_store if request.param == "afr" else eng_store


@pytest.mark.parametrize("store,iso3", [("afr", "afr"), ("eng", "eng")], indirect=["store"])
def test_all_five_grammar_files_exist(store: Store, iso3: str):
    grammar_dir = store.root / iso3 / "grammar"
    for kind in GRAMMAR_KINDS:
        assert (grammar_dir / f"{kind}.yaml").is_file()


@pytest.mark.parametrize("store,iso3", [("afr", "afr"), ("eng", "eng")], indirect=["store"])
def test_grammar_files_start_with_the_licence_header(store: Store, iso3: str):
    grammar_dir = store.root / iso3 / "grammar"
    for kind in GRAMMAR_KINDS:
        first_line = (grammar_dir / f"{kind}.yaml").read_text(encoding="utf-8").splitlines()[0]
        assert first_line == (
            "# Licence: CC BY-SA 4.0. Source: UNL Archive, see data/archive/manifest.jsonl"
        )


@pytest.mark.parametrize("store,iso3", [("afr", "afr"), ("eng", "eng")], indirect=["store"])
def test_every_record_keeps_source(store: Store, iso3: str):
    for kind in GRAMMAR_KINDS:
        for record in store.files[kind]:
            assert record["source"]["archive_path"]
            assert record["source"]["line"] not in (None, "")


@pytest.mark.parametrize("store,iso3", [("afr", "afr"), ("eng", "eng")], indirect=["store"])
def test_conditions_is_empty_at_m2(store: Store, iso3: str):
    # SPEC.md §3.2: conditions is [] at M2, the archive embeds every condition inside lhs.
    for kind in GRAMMAR_KINDS:
        for record in store.files[kind]:
            assert record["conditions"] == []


# --------------------------------------------------------------------------------------------
# Unit-level parser behaviour, no archive files needed.
# --------------------------------------------------------------------------------------------


def test_parse_t_rule_line_rejects_a_blank_line():
    entry, reason = parse_t_rule_line("")
    assert entry is None
    assert "blank" in reason


def test_parse_t_rule_line_rejects_a_comment_line():
    entry, reason = parse_t_rule_line("; some header text")
    assert entry is None
    assert "comment" in reason


def test_parse_t_rule_line_splits_on_top_level_assign_only():
    # "XP=%x" inside the parens is a feature binding, not the rule's own ":=" split.
    entry, reason = parse_t_rule_line(
        "(XP,%x)(COMMA,%c)(XP=%x,rel=and,%y):=(%x)([and],+W,%new)(%y); John, Mary and Peter"
    )
    assert reason is None
    assert entry["lhs"] == "(XP,%x)(COMMA,%c)(XP=%x,rel=and,%y)"
    assert entry["rhs"] == "(%x)([and],+W,%new)(%y)"
    assert entry["comment"] == "John, Mary and Peter"


def test_parse_t_rule_line_rejects_a_line_with_no_assign_operator():
    entry, reason = parse_t_rule_line("asfsdfdfdsf asfsdfdfdsf")
    assert entry is None
    assert "T-rule" in reason


def test_parse_t_rule_line_rewrites_ccj_to_coo_attributed_and_bare():
    # Issue 171, docs/unl-reference/formats/tagset.md, "A second pass...": the live tagset has
    # no CCJ conjunction class; COO is the current spelling. Rewritten wherever CCJ stands as a
    # whole token, attributed (POS=CCJ, the real afr 47.tgrammar.txt rule 33) or bare (the real
    # afr/eng nl_unl_tgrammar.txt rule, `(C,CCJ,^XP,^proj)`).
    entry, reason = parse_t_rule_line(
        "and(%x;%y):=((%y,+>BLK)([en],LEX=C,POS=CCJ,+>BLK)(%x,+>BLK),+LEX=%x);"
    )
    assert reason is None
    assert "POS=COO" in entry["rhs"]
    assert "CCJ" not in entry["rhs"]

    entry, reason = parse_t_rule_line("(C,CCJ,^XP,^proj):=(+XP=CP,+proj);")
    assert reason is None
    assert entry["lhs"] == "(C,COO,^XP,^proj)"


def test_parse_t_rule_line_does_not_rewrite_ccj_as_part_of_a_longer_token():
    # Word-boundary safety: CCJ must be rewritten only as a whole token, never as a substring of
    # a longer one.
    entry, reason = parse_t_rule_line("(C,XCCJY,^XP,^proj):=(+XP=CP,+proj);")
    assert reason is None
    assert entry["lhs"] == "(C,XCCJY,^XP,^proj)"


def test_parse_d_rule_line_splits_on_top_level_equals_only():
    entry, reason = parse_d_rule_line("(P,rel=plc)(BLK)(N,TIM)=0;")
    assert reason is None
    assert entry["lhs"] == "(P,rel=plc)(BLK)(N,TIM)"
    assert entry["rhs"] == "0"
    assert entry["comment"] == ""


def test_parse_d_rule_line_rejects_a_comment_line():
    entry, reason = parse_d_rule_line("; RuleSet:(MX)AfrDRules")
    assert entry is None
    assert "comment" in reason


def test_parse_html_catalogue_skips_entries_with_no_rule_body():
    text = '<b>M0</b><br />Invariant<br /><br /><b>M2</b><br />desc (<i>ex</i>)<br />PLR:=0>"s";<br /><br /></body>'
    entries, skipped = parse_html_catalogue(text, "M")
    assert [e.id for e in entries] == ["M2"]
    assert skipped == [("M0", skipped[0][1])]


def test_parse_html_catalogue_drops_a_stray_bare_semicolon_statement():
    # M21/M22 in export_grammar.php__type_M_lang_af carry an extra bare ';' on its own line.
    text = (
        '<b>M21</b><br />desc (<i>ex</i>)<br />PLR:=2>"e";<br />\n'
        ";<br /><br /><b>M22</b><br /></body>"
    )
    entries, _ = parse_html_catalogue(text, "M")
    assert entries[0].statements == ['PLR:=2>"e";']


def test_build_inflection_records_joins_branches_verbatim_with_no_injected_space():
    entry = CatalogueEntry("M2", "Add s", "table>tables", ['SNG:=0>"";', 'PLR:=0>"s";'])
    records = build_inflection_records([entry], "exports/eng/export_grammar.php__type_M_lang_en")
    assert records[0]["rhs"] == 'SNG:=0>"";PLR:=0>"s";'
    assert records[0]["lhs"] == ""
    assert records[0]["id"] == "M2"


def test_build_subcategorisation_records_strips_trailing_semicolon_from_lhs():
    entry = CatalogueEntry("Y38", "Direct transitive verb", "accept", ["VS(NP)VC(NP);"])
    records = build_subcategorisation_records(
        [entry], "exports/eng/export_grammar.php__type_Y_lang_en"
    )
    assert records[0]["lhs"] == "VS(NP)VC(NP)"
    assert records[0]["rhs"] == ""


def test_build_subcategorisation_records_joins_two_frame_variants():
    entry = CatalogueEntry(
        "Y35",
        "Direct transitive verb with a complement",
        "make (me happy)",
        ["VS(NP)VC(NP)VC(NP);", "VS(NP)VC(NP)VC(JP);"],
    )
    records = build_subcategorisation_records(
        [entry], "exports/eng/export_grammar.php__type_Y_lang_en"
    )
    assert records[0]["lhs"] == "VS(NP)VC(NP)VC(NP); VS(NP)VC(NP)VC(JP)"
