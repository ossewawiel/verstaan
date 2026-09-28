# SPDX-License-Identifier: MPL-2.0
"""tools/importer/dictionary.py: issue 14.

Runs the real importer against fixture-sized AD/GD zips under `tests/fixtures/archive/` (issue
166): a few hundred lines carved verbatim from the real `af_ana_u_c_ucl.zip` / `af_gen_u_c_ucl.zip`
(`afr`) and `en_ana_u_c_ucl.zip` / `en_gen_u_c_ucl.zip` (`eng`) exports, never the full 6 MB `eng`
zips (issue 166: those took 780s to import and blew the gate's 15-minute build cap). Not the
`_ucn`-named zips the issue text names: this importer found, by inspecting the raw bytes (never by
running its own parser on them and trusting the result -- docs/standards/testing.md), that the
archive's `_ucl`-named export holds the opaque UCN numeric code the schema wants in `uw`, and the
matching `_ucn`-named export holds the human-readable UCL string instead. Every literal value
asserted below (`400068368`, `400249878`, ...) was read directly out of the real zip bytes with a
throwaway script before the fixtures were carved, never derived by running
`tools.importer.dictionary` and trusting its own output. `tests/fixtures/archive/manifest.jsonl`
names the exact source zip, member, line and licence for every fixture line.

**Known gap, reported rather than guessed around**: the issue's acceptance criteria ask for an
`aboard` entry with `id: 516110, uw: "534001"`, matching dictionary.md's English worked example.
Those exact values exist only in `data/archive/exports/eng/export_cc.php`
(`tools/validate/tests/test_schema.py`'s own `ENGLISH_ENTRIES` fixture sources that same example
from `exports/eng/export_cc.php`, confirming it). `export_cc.php` is explicitly out of scope for
this issue. The `en_ana_u_c_ucl.zip` / `en_gen_u_c_ucl.zip` AD/GD pair holds a different `aboard`
sense (adverb, not preposition) under different ids. `test_english_aboard_entry_from_the_ad_zip`
below asserts the values this importer can actually produce in scope, independently confirmed
against the raw zip bytes; it is not the same entry dictionary.md's English worked example names.

**Second known gap, issue 166**: the acceptance criteria's YAML-ambiguous-headword list includes
`Off` (title case). No archived English AD/GD export (`_u_c_ucl`, `_a_c_ucl` or the `_e_`-suffixed
variants) carries a headword `Off` -- checked across every zip under `data/archive/exports/eng/`
before the fixture was carved. `test_yaml_scalar_quotes_a_headword_that_is_a_yaml_bool_or_null_word`
below still covers `Off` with a hand-built `format_entry` input (unit-level, no archive file), the
same way it already covered every headword in that list before this fixture existed; the fixture's
own AD/GD content carries the seven headwords the real archive does have (`off`, `no`, `on`, `yes`,
`null`, `true`, `false`), not `Off`.

Every shard is read off the fixture-sized store exactly once per language: the `afr_store`/
`eng_store` fixtures are module-scoped and every test below shares their one in-memory result.
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
    import_cc_export,
    import_language,
    parse_feature_list,
    parse_line,
    shard_letter,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
ARCHIVE_ROOT = REPO_ROOT / "tests" / "fixtures" / "archive"
SCHEMA_PATH = REPO_ROOT / "tools" / "validate" / "schema" / "dictionary-entry.schema.json"
FIXTURES_DIR = Path(__file__).parent / "fixtures"

AFR_AD = ARCHIVE_ROOT / "exports" / "afr" / "af_ana_u_c_ucl.zip"
AFR_GD = ARCHIVE_ROOT / "exports" / "afr" / "af_gen_u_c_ucl.zip"
ENG_AD = ARCHIVE_ROOT / "exports" / "eng" / "en_ana_u_c_ucl.zip"
ENG_GD = ARCHIVE_ROOT / "exports" / "eng" / "en_gen_u_c_ucl.zip"
AFR_CC = ARCHIVE_ROOT / "exports" / "afr" / "export_cc.php"
ENG_CC = ARCHIVE_ROOT / "exports" / "eng" / "export_cc.php"


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


def _load_store(iso3: str, ad: Path, gd: Path, store_root: Path, cc: Path | None = None) -> Store:
    stats = import_language(iso3, ad, gd, ARCHIVE_ROOT, store_root, cc_export=cc)
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


@pytest.fixture(scope="module")
def afr_store_with_cc(tmp_path_factory: pytest.TempPathFactory) -> Store:
    """Issue 184: `afr_store` plus the fixture-sized `export_cc.php` second source."""
    return _load_store("afr", AFR_AD, AFR_GD, tmp_path_factory.mktemp("afr-store-cc"), cc=AFR_CC)


@pytest.fixture(scope="module")
def eng_store_with_cc(tmp_path_factory: pytest.TempPathFactory) -> Store:
    """Issue 184: `eng_store` plus the fixture-sized `export_cc.php` second source."""
    return _load_store("eng", ENG_AD, ENG_GD, tmp_path_factory.mktemp("eng-store-cc"), cc=ENG_CC)


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
    # issue 169: #01(...)/#02(...) sub-word scopes are parsed and merged, not kept as a bogus
    # `#01`/`#02` attribute holding the inner list as one raw string.
    assert "#01" not in subword["features"]
    assert "#02" not in subword["features"]
    assert subword["features"]["LEMMA"] == "begin"
    assert subword["features"]["LEX"] == "P"  # #02's LEX=P, the later sub-word, wins
    assert subword["features"]["POS"] == "MOV"
    # #02(BF=to,LEX=P) overwrites #01(...)'s BF=begin: the compound's own top-level features
    # carry no BF at all in this fixture, so the last sub-word to set it wins (issue 169).
    assert subword["features"]["BF"] == "to"


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


def test_parse_line_rewrites_a_vintage_sem_code():
    # Issue 167: the 2016 dictionary export's SEM=ATT no longer exists in the live tagset export;
    # the importer rewrites it to the current code, SEM=ATR.
    entry, reason = parse_line('[aandag]{1}"1"(LEX=N,POS=NOU,SEM=ATT)<af,0,0>;')
    assert reason is None
    assert entry["features"]["SEM"] == "ATR"


def test_parse_line_leaves_sem_jjj_and_sem_aaa_unrewritten():
    # Issue 171: unlike ATT/SOV/REL (issue 167) or 3PE/2PE, SEM=JJJ and SEM=AAA are not a vintage
    # rename. The live export drops both catch-all codes entirely and defines no replacement
    # (docs/unl-reference/formats/tagset.md, "A second pass..."); the fix is a hand-added
    # tagset.yaml row for each (already done), not an importer rewrite. The importer must leave
    # both values exactly as the archive writes them.
    entry, reason = parse_line('[loud]{1}"1"(LEX=A,POS=ADJ,SEM=JJJ)<en,0,0>;')
    assert reason is None
    assert entry["features"]["SEM"] == "JJJ"
    entry, reason = parse_line('[just]{2}"2"(LEX=A,POS=ADV,SEM=AAA)<en,0,0>;')
    assert reason is None
    assert entry["features"]["SEM"] == "AAA"


def test_parse_line_rewrites_vintage_per_codes():
    # Issue 171: the live tagset's number-neutral person tags are four characters (2PER, 3PER);
    # the 2016 export truncates them to three. Only PER's value changes, not the attribute name.
    entry, reason = parse_line('[you]{1}"1"(LEX=R,POS=SPR,PER=2PE)<en,0,0>;')
    assert reason is None
    assert entry["features"]["PER"] == "2PER"
    entry, reason = parse_line('[their]{2}"2"(LEX=R,POS=SPR,PER=3PE)<en,0,0>;')
    assert reason is None
    assert entry["features"]["PER"] == "3PER"


def test_parse_line_rewrites_vintage_dis_code():
    # Issue 184, docs/unl-reference/formats/tagset.md "A third rename, found by issue 184": the
    # real export_cc.php `ante-`/`anti-` entries carry DIS=IBE, the 2016-vintage truncation of the
    # live tagset's DIS=IBEF ("immediately before"). Only DIS's value changes.
    entry, reason = parse_line('[ante-]{515731}"118288"(LEX=F,POS=PFX,DIS=IBE)<en,0,0>;')
    assert reason is None
    assert entry["features"]["DIS"] == "IBEF"


def test_parse_feature_list_drops_the_bare_00_serialiser_echo():
    # Issue 171, docs/unl-reference/formats/tagset.md, "`00` is not a tag": a bare `00` token at
    # the end of a feature list is the entry's own uw field, echoed a second time by the export's
    # serialiser (a 7/7 correlation in the real en_ana_u_c_ucl.zip data). The real archive line
    # for `one`, id 531286: `(LEMMA=one,BF=one,LEX=R,POS=NPR,LST=WRD,NUM=SNGT,PER=3PS,PAR=M0,
    # FRA=Y0,00)`. Dropped, not kept as a bogus `{"00": "00"}` feature.
    features = parse_feature_list(
        "LEMMA=one,BF=one,LEX=R,POS=NPR,LST=WRD,NUM=SNGT,PER=3PS,PAR=M0,FRA=Y0,00"
    )
    assert "00" not in features
    assert features["LEMMA"] == "one"
    assert features["FRA"] == "Y0"


def test_parse_line_leaves_unrelated_sem_and_lowercase_att_alone():
    # Only the SEM attribute's exact-match vintage codes are rewritten. A lowercase `att` tag
    # (a distinct attribute) and a SEM value outside the three vintage codes must not change.
    entry, reason = parse_line('[x]{1}"1"(LEX=N,POS=NOU,SEM=OBJ,att=1)<af,0,0>;')
    assert reason is None
    assert entry["features"]["SEM"] == "OBJ"
    assert entry["features"]["att"] == "1"


def test_parse_feature_list_handles_a_rule_list_feature():
    features = parse_feature_list('LEMMA=bad,FLX(SNG:=>"";PLR:=>"dens";)')
    assert features["LEMMA"] == "bad"
    assert features["FLX"] == 'SNG:=>"";PLR:=>"dens";'


def test_parse_feature_list_returns_none_when_empty():
    assert parse_feature_list("") is None
    assert parse_feature_list("   ") is None


def test_parse_feature_list_flattens_a_subword_scope_instead_of_a_placeholder_attribute():
    """Issue 169: a `#02(...)` sub-word scope used to become a bogus attribute named `#02`,
    holding its whole inner feature list as one raw string value, e.g. `#02` -> `"BF=up"` (the
    real `en_gen_u_c_ucl` `earth up` entry, `[[earth] [up]]`, id 443140). Correctly parsed, that
    inner list is itself an attribute-value pair: attribute `BF`, value `up`.
    """
    features = parse_feature_list(
        "LEMMA=earth up,BF=earth,LEX=V,POS=VER,LST=MTW,TRA=TST,"
        "#01(LEMMA=earth up,BF=earth,LEX=V,POS=VER,PAR=M16,FRA=Y38),#02(BF=up),SEM=CTC"
    )
    assert "#01" not in features
    assert "#02" not in features
    assert features["LEMMA"] == "earth up"
    assert features["LST"] == "MTW"
    assert features["TRA"] == "TST"
    assert features["SEM"] == "CTC"
    assert features["PAR"] == "M16"  # only #01 sets this; nothing at top level to collide with
    assert features["FRA"] == "Y38"
    # #02(BF=up) is parsed after #01(...): its BF=up overwrites #01's (and the top-level's)
    # BF=earth, the one place this flat feature map can still put a later sub-word's own value.
    assert features["BF"] == "up"


def test_parse_feature_list_glues_a_comma_split_headword_back_onto_its_value():
    """Issue 169: some headwords hold a literal comma, e.g. `[Bouillon, België]`
    (`af_ana_u_c_ucl`, id 13637). The archive's own feature list then reads
    `LEMMA=Bouillon, België,BF=Bouillon, België,LEX=N,...` -- the same comma the archive uses to
    separate features. Split naively, `België` (after `LEMMA=Bouillon`) matches no feature shape
    and used to become a bogus attribute `België` -> `België`. Correctly parsed, it is the second
    half of `LEMMA`'s own value, reconstructed exactly.
    """
    features = parse_feature_list(
        "LEMMA=Bouillon, België,BF=Bouillon, België,LEX=N,POS=NOU,LST=MTW,ABN=CCT,ANI=NANM,SEM=FOO"
    )
    assert features["LEMMA"] == "Bouillon, België"
    assert features["BF"] == "Bouillon, België"
    assert "België" not in features
    assert features["LEX"] == "N"
    assert features["POS"] == "NOU"


def test_parse_feature_list_glues_a_headword_split_across_two_commas():
    """The same shape as above, but the comma-holding value splits into three parts
    (`af_ana_u_c_ucl`, `[Bok, bok, staan styf]`, id 13649): every shapeless part after the
    `ATTRIBUTE=VALUE` token glues back on, not only the first.
    """
    features = parse_feature_list(
        "LEMMA=Bok, bok, staan styf,BF=Bok, bok, staan styf,LEX=N,POS=NOU,"
        "LST=MTW,ABN=ABT,ANI=NANM,SEM=ACT"
    )
    assert features["LEMMA"] == "Bok, bok, staan styf"
    assert features["BF"] == "Bok, bok, staan styf"
    assert "bok" not in features
    assert "staan styf" not in features


def test_parse_feature_list_keeps_bare_tags_after_a_tagset_attribute_separate():
    """`SEM=QTT,DIGIT, TEMP` (`af_gen_u_c_ucl`, 'sesde', id 23601) is three features: `SEM=QTT`
    plus the bare tags `DIGIT` and `TEMP`. Only `LEMMA`/`BF` hold free text a literal comma can
    split; `SEM` is a tagset mnemonic, so a bare token after it is its own feature, not a
    continuation of `SEM`'s value.
    """
    features = parse_feature_list("LEX=N,POS=NOU,SEM=QTT,DIGIT, TEMP")
    assert features["SEM"] == "QTT"
    assert features["DIGIT"] == "DIGIT"
    assert features["TEMP"] == "TEMP"


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


# --------------------------------------------------------------------------------------------
# Issue 184: an entry with an empty UW is a closed-class record, not an unparsed line, when
# features.LEX marks it closed-class (C, D, P). Both sources this issue adds: the AD/GD zips'
# own empty-UW lines, and the second source, export_cc.php.
# --------------------------------------------------------------------------------------------


@pytest.mark.parametrize("lex", ["C", "D", "P"])
def test_parse_line_accepts_an_empty_uw_on_a_closed_class_lex(lex: str):
    entry, reason = parse_line(f'[x]{{1}}""(LEX={lex})<af,0,0>;')
    assert reason is None, reason
    assert entry["uw"] == ""
    assert entry["features"]["LEX"] == lex


def test_parse_line_still_rejects_an_empty_uw_on_an_open_class_lex():
    # LEX=N (noun): a real but unfinished dictionary stub, e.g. af_ana_u_c_ucl_1.txt line 3139,
    # `[aandeelprys]{12804}""(LEMMA=aandeelprys,BF=aandeelprys,LEX=N,POS=NOU)<af,0,0>;` -- not a
    # closed-class function word, so it must still route to _unparsed.txt.
    entry, reason = parse_line(
        '[aandeelprys]{12804}""(LEMMA=aandeelprys,BF=aandeelprys,LEX=N,POS=NOU)<af,0,0>;'
    )
    assert entry is None
    assert "empty UW" in reason
    assert "non-closed-class" in reason


def test_parse_line_rejects_empty_uw_when_only_a_subword_lex_is_closed_class():
    """A multi-word idiom whose *sub-word* carries a closed-class `LEX`, but whose own top-level
    `LEX` is open-class, must still route to `_unparsed.txt` -- the closed-class gate judges the
    entry, not its last sub-word.

    Real shape, `en_gen_u_c_ucl_1.txt` line 5900, id 275437 (`begin to`):
    `[[begin] [to]]{275437}""(LEMMA=begin to,BF=begin,LEX=I,POS=MOV,LST=MTW,#01(...,LEX=I,...),
    #02(PAR=M0,BF=to,LEX=P),SEM=XXX,SFR=K0,att=@inceptive)<en,255,2>;`. Top-level `LEX=I`
    (idiom/auxiliary chain, open-class); only `#02`'s trailing "to" carries `LEX=P`.
    `parse_feature_list`'s "last sub-word wins" flattening (issue 169) leaves the merged
    `features["LEX"]` as `P`, which would wrongly pass the closed-class gate if it read that
    flattened value. The regression: before the fix, this returned an entry with `LEX: P` and a
    blank `uw`, a fabricated closed-class preposition.
    """
    entry, reason = parse_line(
        '[[begin] [to]]{275437}""(LEMMA=begin to,BF=begin,LEX=I,POS=MOV,LST=MTW,'
        "#01(LEMMA=begin to,BF=begin,LEX=I,POS=MOV,PAR=M1,FRA=Y0,"
        'FLX(INF:="begin";PAS:="began";PTP:="begun";GER:="beginning";3PS&PRS:="begins";)),'
        "#02(PAR=M0,BF=to,LEX=P),SEM=XXX,SFR=K0,att=@inceptive)<en,255,2>;"
    )
    assert entry is None
    assert "empty UW" in reason
    assert "non-closed-class" in reason


def test_english_albeit_a_real_closed_class_empty_uw_line_now_imports(eng_store: Store):
    """`en_ana_u_c_ucl_1.txt` line 5603, id 275673: `LEX=C` (conjunction), empty UW. Before issue
    184 this line went to `_unparsed.txt` ("empty UW field..."); it is fixtured into the eng AD
    zip already (`tests/fixtures/archive/manifest.jsonl`, the `en_ana_u_c_ucl.zip` entry, "line 62
    the real empty-UW line id 275673 ('albeit')"), so no new fixture was needed for this case.
    """
    albeit = next(e for e in eng_store.entries if e["headword"] == "albeit" and e["id"] == 275673)
    assert albeit["uw"] == ""
    assert albeit["features"]["LEX"] == "C"
    assert albeit["lang"] == "eng"
    assert albeit["source"]["archive_path"] == "exports/eng/en_ana_u_c_ucl/en_ana_u_c_ucl_1.txt"
    # 62, not the real archive's 5603: the fixture zip carves out this one line, verbatim, at
    # its own position (tests/fixtures/archive/manifest.jsonl's en_ana_u_c_ucl.zip entry).
    assert albeit["source"]["line"] == 62


# --------------------------------------------------------------------------------------------
# import_cc_export: the second source, export_cc.php, issue 184.
# --------------------------------------------------------------------------------------------


def test_import_cc_export_unescapes_html_entities_and_counts_ordinals():
    """Unit-level, no fixture file: a two-entry HTML fragment shaped like the real export
    (`&quot;`, `&lt;`/`&gt;`, `<br /><script>...</script>` markup between entries), proving the
    HTML-unescape and 1-based ordinal `source.line` logic without depending on file content.
    """
    html_text = (
        "<body>[the] {1} &quot;10&quot; (LEMMA=the,BF=the,LEX=D,POS=ART) &lt;en, 0, 0&gt;;"
        '<br /><script>document.getElementById("x").innerHTML="1 registers processed";</script>'
        "[cat] {2} &quot;&quot; (LEMMA=cat,BF=cat,LEX=N,POS=NOU) &lt;en, 0, 0&gt;;</body>"
    )
    path = FIXTURES_DIR / "_scratch_cc.php"
    path.write_text(html_text, encoding="utf-8")
    try:
        imported, unparsed = import_cc_export(path, FIXTURES_DIR, "eng")
    finally:
        path.unlink()
    assert len(imported) == 1
    assert imported[0].record["headword"] == "the"
    assert imported[0].record["uw"] == "10"
    assert imported[0].record["source"] == {"archive_path": "_scratch_cc.php", "line": 1}
    assert len(unparsed) == 1
    assert unparsed[0].line == 2
    assert "non-closed-class" in unparsed[0].reason
    assert unparsed[0].raw.startswith("[cat]")  # unescaped, not the raw &quot;/&lt; form


def test_afrikaans_export_cc_php_empty_uw_closed_class_words(afr_store_with_cc: Store):
    for headword, entry_id, lex in [("'n", 5658, "D"), ("die", 5647, "D"), ("en", 5651, "C")]:
        entry = next(
            e
            for e in afr_store_with_cc.entries
            if e["headword"] == headword and e["id"] == entry_id
        )
        assert entry["uw"] == ""
        assert entry["features"]["LEX"] == lex
        assert entry["lang"] == "afr"
        assert entry["source"]["archive_path"] == "exports/afr/export_cc.php"


def test_afrikaans_export_cc_php_non_closed_class_empty_uw_stays_unparsed(afr_store_with_cc: Store):
    # `twee` (id 5749, LEX=U, a numeral): closed in the everyday sense, but not one of the three
    # LEX values this importer treats as closed-class, so it still routes to _unparsed.txt.
    text = (afr_store_with_cc.root / "afr" / "_unparsed.txt").read_text(encoding="utf-8")
    assert "twee" in text
    assert "non-closed-class" in text
    assert not any(e["headword"] == "twee" for e in afr_store_with_cc.entries)


def test_english_export_cc_php_worked_example_words(eng_store_with_cc: Store):
    """`dictionary.md`'s own worked example (aboard/about/above) plus the issue's acceptance
    words, all sourced from the fixture-sized `export_cc.php` (`tests/fixtures/archive/
    manifest.jsonl`'s `exports/eng/export_cc.php` entry)."""
    words = {
        "aboard": (516110, "534001", "P"),
        "about": (515821, "119402", "P"),
        "above": (515753, "118441", "P"),
        "the": (516101, "533993", "D"),
        "a": (516052, "130092", "D"),
        "of": (515832, "534003", "P"),
        "on": (515754, "118441", "P"),
        "and": (515796, "119040", "C"),
    }
    for headword, (entry_id, uw, lex) in words.items():
        entry = next(
            e
            for e in eng_store_with_cc.entries
            if e["headword"] == headword and e["id"] == entry_id
        )
        assert entry["uw"] == uw
        assert entry["features"]["LEX"] == lex
        assert entry["lang"] == "eng"
        assert entry["source"]["archive_path"] == "exports/eng/export_cc.php"


def test_english_export_cc_php_without_both_senses(eng_store_with_cc: Store):
    # `without` carries two real senses in export_cc.php: id 517447 (LEX=P) and id 515831 (LEX=C).
    senses = {
        e["id"]: e["features"]["LEX"]
        for e in eng_store_with_cc.entries
        if e["headword"] == "without"
    }
    assert senses == {517447: "P", 515831: "C"}
