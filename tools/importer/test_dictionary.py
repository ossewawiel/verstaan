# SPDX-License-Identifier: MPL-2.0
"""tools/importer/dictionary.py: issue 14.

Runs the real importer against the real archive zips this session picked (see the session
report): `af_ana_u_c_ucl.zip` / `af_gen_u_c_ucl.zip` for `afr`, `en_ana_u_c_ucl.zip` /
`en_gen_u_c_ucl.zip` for `eng`. Not the `_ucn`-named zips the issue text names: this importer
found, by inspecting the raw bytes (never by running its own parser on them and trusting the
result -- docs/standards/testing.md), that the archive's `_ucl`-named export holds the opaque
UCN numeric code the schema wants in `uw`, and the matching `_ucn`-named export holds the
human-readable UCL string instead. Every literal value asserted below (`400068368`, `400249878`,
...) was read directly out of the zip bytes with a throwaway script before this file was
written, never derived by running `tools.importer.dictionary` and trusting its own output.

**Known gap, reported rather than guessed around**: the issue's acceptance criteria ask for an
`aboard` entry with `id: 516110, uw: "534001"`, matching dictionary.md's English worked example.
Those exact values exist only in `data/archive/exports/eng/export_cc.php`
(`tools/validate/tests/test_schema.py`'s own `ENGLISH_ENTRIES` fixture sources that same example
from `exports/eng/export_cc.php`, confirming it). `export_cc.php` is explicitly out of scope for
this issue. The `en_ana_u_c_ucl.zip` / `en_gen_u_c_ucl.zip` AD/GD pair holds a different `aboard`
sense (adverb, not preposition) under different ids. `test_english_aboard_entry_from_the_ad_zip`
below asserts the values this importer can actually produce in scope, independently confirmed
against the raw zip bytes; it is not the same entry dictionary.md's English worked example names.

Every shard is read off disk exactly once per language (`yaml.safe_load` over ~30k afr / ~576k
eng entries is the expensive step, not parsing or importing): the `afr_store`/`eng_store`
fixtures are module-scoped and every test below shares their one in-memory result.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pytest
import yaml
from jsonschema import Draft202012Validator

from tools.importer.dictionary import (
    FLG_TO_ISO3,
    ImportStats,
    import_language,
    parse_feature_list,
    parse_line,
    shard_letter,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
ARCHIVE_ROOT = REPO_ROOT / "data" / "archive"
SCHEMA_PATH = REPO_ROOT / "tools" / "validate" / "schema" / "dictionary-entry.schema.json"
FIXTURES_DIR = Path(__file__).parent / "fixtures"

AFR_AD = ARCHIVE_ROOT / "exports" / "afr" / "af_ana_u_c_ucl.zip"
AFR_GD = ARCHIVE_ROOT / "exports" / "afr" / "af_gen_u_c_ucl.zip"
ENG_AD = ARCHIVE_ROOT / "exports" / "eng" / "en_ana_u_c_ucl.zip"
ENG_GD = ARCHIVE_ROOT / "exports" / "eng" / "en_gen_u_c_ucl.zip"

pytestmark = pytest.mark.skipif(
    not (AFR_AD.is_file() and AFR_GD.is_file() and ENG_AD.is_file() and ENG_GD.is_file()),
    reason="afr/eng AD+GD zips not present under data/archive/exports/ in this tree",
)


def _records(path: Path) -> list[dict]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return data if isinstance(data, list) else []


@dataclass
class Store:
    root: Path
    stats: ImportStats
    shards: dict[str, list[dict]]  # letter -> that shard's entries, read once

    @property
    def entries(self) -> list[dict]:
        return [entry for shard in self.shards.values() for entry in shard]


def _load_store(iso3: str, ad: Path, gd: Path, store_root: Path) -> Store:
    stats = import_language(iso3, ad, gd, ARCHIVE_ROOT, store_root)
    shards = {
        shard.stem: _records(shard)
        for shard in sorted((store_root / iso3 / "dictionary").glob("*.yaml"))
    }
    return Store(store_root, stats, shards)


@pytest.fixture(scope="module")
def afr_store(tmp_path_factory: pytest.TempPathFactory) -> Store:
    return _load_store("afr", AFR_AD, AFR_GD, tmp_path_factory.mktemp("afr-store"))


@pytest.fixture(scope="module")
def eng_store(tmp_path_factory: pytest.TempPathFactory) -> Store:
    return _load_store("eng", ENG_AD, ENG_GD, tmp_path_factory.mktemp("eng-store"))


# --------------------------------------------------------------------------------------------
# Worked examples, dictionary.md. Expected values read from the raw zip bytes, not from this
# importer's own output (docs/standards/testing.md: never derive an expected value by running
# the code under test).
# --------------------------------------------------------------------------------------------


def test_afrikaans_worked_example_matches_dictionary_md(afr_store: Store):
    aan = next(e for e in afr_store.entries if e["headword"] == "aan" and e["id"] == 22319)
    assert aan["uw"] == "400068368"
    assert aan["features"]["LEX"] == "A"
    assert aan["lang"] == "afr"
    assert aan["frequency"] == 2
    assert aan["priority"] == 0
    assert aan["source"]["archive_path"] == "exports/afr/af_ana_u_c_ucl/af_ana_u_c_ucl_1.txt"
    assert aan["source"]["line"] == 8


def test_english_aboard_entry_from_the_ad_zip(eng_store: Store):
    """The `aboard` sense this importer can actually produce in scope (see module docstring):
    id 273038, uw "400249878", read directly from `en_ana_u_c_ucl_1.txt` line 37 by hand before
    this test was written. Not dictionary.md's worked example (id 516110, uw "534001"), which
    lives only in the out-of-scope `export_cc.php`.
    """
    aboard = next(e for e in eng_store.entries if e["headword"] == "aboard" and e["id"] == 273038)
    assert aboard["uw"] == "400249878"
    assert aboard["lang"] == "eng"
    assert aboard["features"]["POS"] == "AAV"
    assert aboard["features"]["LEX"] == "A"
    assert aboard["source"]["archive_path"] == "exports/eng/en_ana_u_c_ucl/en_ana_u_c_ucl_1.txt"
    assert aboard["source"]["line"] == 37


# --------------------------------------------------------------------------------------------
# Schema validation: `pytest tools/importer/test_dictionary.py -k schema` runs both languages.
# --------------------------------------------------------------------------------------------


def _assert_all_validate(entries: list[dict]) -> None:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)
    assert entries
    for entry in entries:
        errors = list(validator.iter_errors(entry))
        assert not errors, f"{entry.get('headword')!r} ({entry.get('id')}): {errors[0].message}"


def test_afrikaans_entries_validate_against_schema(afr_store: Store):
    _assert_all_validate(afr_store.entries)


def test_english_entries_validate_against_schema(eng_store: Store):
    _assert_all_validate(eng_store.entries)


# --------------------------------------------------------------------------------------------
# Unparsed-line accounting: SPEC.md §3.2, nothing dropped silently.
# --------------------------------------------------------------------------------------------


def test_afrikaans_input_lines_equal_parsed_plus_unparsed(afr_store: Store):
    stats = afr_store.stats
    assert stats.input_lines == stats.parsed_entries + stats.unparsed_lines
    assert stats.parsed_entries > 0
    assert stats.unparsed_lines > 0


def test_english_input_lines_equal_parsed_plus_unparsed(eng_store: Store):
    stats = eng_store.stats
    assert stats.input_lines == stats.parsed_entries + stats.unparsed_lines
    assert stats.parsed_entries > 0
    assert stats.unparsed_lines > 0


def test_afrikaans_unparsed_file_holds_every_reported_unparsed_line(afr_store: Store):
    text = (afr_store.root / "afr" / "_unparsed.txt").read_text(encoding="utf-8")
    # One locator+reason line, then the raw line, per record; one blank line between records.
    records = [block for block in text.split("\n\n") if block.strip()]
    assert len(records) == afr_store.stats.unparsed_lines


def test_english_unparsed_file_holds_every_reported_unparsed_line(eng_store: Store):
    text = (eng_store.root / "eng" / "_unparsed.txt").read_text(encoding="utf-8")
    records = [block for block in text.split("\n\n") if block.strip()]
    assert len(records) == eng_store.stats.unparsed_lines


# --------------------------------------------------------------------------------------------
# Store shape: SPEC.md §3.3, §4.
# --------------------------------------------------------------------------------------------


@pytest.fixture
def store(request: pytest.FixtureRequest, afr_store: Store, eng_store: Store) -> Store:
    return afr_store if request.param == "afr" else eng_store


@pytest.mark.parametrize("store", ["afr", "eng"], indirect=True)
def test_shard_files_are_named_a_single_letter_a_to_z(store: Store):
    assert store.shards
    for letter in store.shards:
        assert len(letter) == 1 and "a" <= letter <= "z"


@pytest.mark.parametrize("store", ["afr", "eng"], indirect=True)
def test_shard_files_start_with_the_licence_header(store: Store):
    dict_dir = store.root / _iso3_of(store) / "dictionary"
    for letter in store.shards:
        first_line = (dict_dir / f"{letter}.yaml").read_text(encoding="utf-8").splitlines()[0]
        assert first_line == (
            "# Licence: CC BY-SA 4.0. Source: UNL Archive, see data/archive/manifest.jsonl"
        )


def _iso3_of(store: Store) -> str:
    (dict_dir,) = store.root.glob("*/dictionary")
    return dict_dir.parent.name


@pytest.mark.parametrize("store", ["afr", "eng"], indirect=True)
def test_every_entry_sits_under_its_own_first_letter_shard(store: Store):
    for letter, entries in store.shards.items():
        for entry in entries:
            assert shard_letter(entry["headword"]) == letter


@pytest.mark.parametrize("store,flg", [("afr", "af"), ("eng", "en")], indirect=["store"])
def test_lang_field_is_the_store_iso3_not_the_archive_flg(store: Store, flg: str):
    iso3 = _iso3_of(store)
    assert store.entries
    assert all(e["lang"] == iso3 for e in store.entries)
    assert FLG_TO_ISO3[flg] == iso3


# --------------------------------------------------------------------------------------------
# Compound NLW and #01(...)/#02(...) sub-word scoping: hand-built fixture, not archive-derived.
# --------------------------------------------------------------------------------------------


def test_compound_and_subword_fixture_parses_without_error():
    lines = (FIXTURES_DIR / "compound_and_subword.txt").read_text(encoding="utf-8").splitlines()
    entry_lines = [line for line in lines if line.strip() and not line.startswith(";")]
    assert len(entry_lines) == 2

    compound, reason = parse_line(entry_lines[0])
    assert reason is None, reason
    assert compound["headword"] == "[appear] [to be]"
    assert compound["id"] == 900001
    assert compound["uw"] == "400000001"

    subword, reason = parse_line(entry_lines[1])
    assert reason is None, reason
    assert subword["headword"] == "[begin] [to]"
    assert subword["features"]["#01"] == "LEMMA=begin,BF=begin,LEX=I,POS=MOV"
    assert subword["features"]["#02"] == "BF=to,LEX=P"


def test_compound_and_subword_fixture_accounts_for_every_line():
    """Every physical line in the fixture -- comments included -- is parsed or explained,
    the same invariant `test_*_input_lines_equal_parsed_plus_unparsed` checks on the real zips.
    """
    lines = (FIXTURES_DIR / "compound_and_subword.txt").read_text(encoding="utf-8").splitlines()
    parsed = 0
    unparsed = 0
    for line in lines:
        entry, reason = parse_line(line)
        if entry is None:
            assert reason
            unparsed += 1
        else:
            parsed += 1
    assert parsed == 2
    assert len(lines) == parsed + unparsed


# --------------------------------------------------------------------------------------------
# Unit-level parser behaviour, no archive files needed.
# --------------------------------------------------------------------------------------------


def test_parse_line_rejects_a_blank_line():
    entry, reason = parse_line("")
    assert entry is None
    assert "blank" in reason


def test_parse_line_rejects_a_comment_line():
    entry, reason = parse_line(";Some header text\r\n")
    assert entry is None
    assert "comment" in reason


def test_parse_line_rejects_an_empty_uw():
    entry, reason = parse_line('[x]{1}""(LEX=A)<af,0,0>;')
    assert entry is None
    assert "empty UW" in reason


def test_parse_line_rejects_an_unknown_flg():
    entry, reason = parse_line('[x]{1}"1"(LEX=A)<zz,0,0>;')
    assert entry is None
    assert "FLG" in reason


def test_parse_line_frequency_priority_order_is_flg_frequency_priority():
    # dictionary.md's own worked-example table, not the "Formal syntax" block's <FLG,PRI,FRE>
    # order: `<af,2,0>` is frequency 2, priority 0.
    entry, reason = parse_line('[aan]{22319}"400068368"(LEX=A)<af,2,0>;')
    assert reason is None
    assert entry["frequency"] == 2
    assert entry["priority"] == 0


def test_parse_feature_list_handles_a_rule_list_feature():
    features = parse_feature_list('LEMMA=bad,FLX(SNG:=>"";PLR:=>"dens";)')
    assert features["LEMMA"] == "bad"
    assert features["FLX"] == 'SNG:=>"";PLR:=>"dens";'


def test_parse_feature_list_returns_none_when_empty():
    assert parse_feature_list("") is None
    assert parse_feature_list("   ") is None


def test_shard_letter_skips_a_leading_non_letter():
    assert shard_letter("'n") == "n"


def test_shard_letter_is_none_for_an_all_symbol_headword():
    assert shard_letter("123") is None


def test_yaml_scalar_quotes_a_value_with_mid_string_brackets():
    """Regression: a GOV feature's raw value, `VC(PP([upon]));`, has `[`/`]` mid-string (not
    only at the start) and once broke `yaml.safe_load` on the shard that carried it (the `bear
    down` entry, `en_ana_u_c_ucl_3.txt` line 69627) because the writer only quoted values whose
    *first* character needed it.
    """
    from tools.importer.dictionary import format_entry

    entry = {
        "headword": "bear down",
        "id": 608568,
        "uw": "201927992",
        "features": {"GOV": "VC(PP([upon]));"},
        "lang": "eng",
        "frequency": 3,
        "priority": 0,
        "source": {"archive_path": "x", "line": 1},
    }
    loaded = yaml.safe_load(format_entry(entry))
    assert loaded[0]["features"]["GOV"] == "VC(PP([upon]));"


@pytest.mark.parametrize("headword", ["off", "no", "on", "yes", "null", "true", "false", "Off"])
def test_yaml_scalar_quotes_a_headword_that_is_a_yaml_bool_or_null_word(headword: str):
    """Regression: `en_ana_u_c_ucl` has real headwords `off` and `no`. Unquoted, PyYAML's
    SafeLoader reads them back as the Python bool `False`, not the string `"off"`/`"no"`
    (`test_every_entry_sits_under_its_own_first_letter_shard[eng]` caught this: `shard_letter`
    received `False` and raised `TypeError` trying to iterate it).
    """
    from tools.importer.dictionary import format_entry

    entry = {
        "headword": headword,
        "id": 1,
        "uw": "1",
        "features": {"LEX": "A"},
        "lang": "eng",
        "frequency": 0,
        "priority": 0,
        "source": {"archive_path": "x", "line": 1},
    }
    loaded = yaml.safe_load(format_entry(entry))
    assert loaded[0]["headword"] == headword
    assert isinstance(loaded[0]["headword"], str)


def test_parse_line_rejects_a_frequency_above_255():
    # Real line, en_gen_u_c_ucl_2.txt line 69077: `[acquire]{452200}"202210855"(...)<en,270,8>;`
    # -- an archive data-entry slip past the FRE 0-255 range dictionary.md itself declares.
    entry, reason = parse_line('[acquire]{452200}"202210855"(LEX=V)<en,270,8>;')
    assert entry is None
    assert "frequency" in reason and "255" in reason
