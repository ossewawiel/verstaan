# SPDX-License-Identifier: MPL-2.0
"""tools/importer/tagset.py: issue 16.

Runs the real importer against `tests/fixtures/archive/exports/export_tagset.php` (issue 166), a
whole-file copy of the real global tagset export this session found under
`data/archive/exports/export_tagset.php`: the real file is already small (58 KB), so the fixture
carries every tag, not a carved subset (SPEC.md §3.1 wrote the real file; nothing here re-derives
an expected value from this importer's own output -- docs/standards/testing.md). Every literal
value asserted below (`RLT`, `FOR`, `NEO`, `LOA`, `TXTA`, `NOUA`, `X`, `XXX` and their meanings)
was read directly off the raw export bytes with a throwaway script before this file was written,
and cross-checked against `docs/unl-reference/formats/tagset.md`'s "Where the export adds tags the
wiki tree does not define" table, not derived by running `tools.importer.tagset` and trusting its
output. `tests/fixtures/archive/manifest.jsonl` names the source path and licence.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pytest
import yaml
from jsonschema import Draft202012Validator

from tools.importer.tagset import (
    TAGSET_EXPORT,
    entry_as_record,
    import_tagset,
    parse_tagset,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
ARCHIVE_ROOT = REPO_ROOT / "tests" / "fixtures" / "archive"
SCHEMA_PATH = REPO_ROOT / "tools" / "validate" / "schema" / "tagset-entry.schema.json"

TAGSET_PATH = ARCHIVE_ROOT / TAGSET_EXPORT


@dataclass
class Store:
    root: Path
    records: dict[str, dict]  # tag -> record, read once


def _load_store(iso3: str, store_root: Path) -> Store:
    import_tagset(iso3, ARCHIVE_ROOT, store_root)
    data = yaml.safe_load((store_root / iso3 / "tagset.yaml").read_text(encoding="utf-8"))
    return Store(store_root, data)


@pytest.fixture(scope="module")
def afr_store(tmp_path_factory: pytest.TempPathFactory) -> Store:
    return _load_store("afr", tmp_path_factory.mktemp("afr-tagset-store"))


@pytest.fixture(scope="module")
def eng_store(tmp_path_factory: pytest.TempPathFactory) -> Store:
    return _load_store("eng", tmp_path_factory.mktemp("eng-tagset-store"))


# --------------------------------------------------------------------------------------------
# The eight tags tagset.md documents as export/wiki disagreements. Meanings read off the raw
# export bytes and cross-checked against tagset.md's own table before this file was written.
# --------------------------------------------------------------------------------------------

DOCUMENTED_TAGS = {
    "RLT": "relation",
    "FOR": "formal",
    "NEO": "neologism",
    "LOA": "loanword",
    "TXTA": "text structure",
    "NOUA": "nominal attributes",
    "X": "X",
    "XXX": "others",
}


@pytest.mark.parametrize("tag,meaning", sorted(DOCUMENTED_TAGS.items()))
def test_documented_tag_present_in_afrikaans_tagset(afr_store: Store, tag: str, meaning: str):
    assert tag in afr_store.records
    assert afr_store.records[tag]["meaning"] == meaning


@pytest.mark.parametrize("tag,meaning", sorted(DOCUMENTED_TAGS.items()))
def test_documented_tag_present_in_english_tagset(eng_store: Store, tag: str, meaning: str):
    assert tag in eng_store.records
    assert eng_store.records[tag]["meaning"] == meaning


def test_rlt_not_rel_for_the_nominal_class_relation(afr_store: Store):
    # tagset.md: "RLT, not REL, for the nominal class 'relation'." REL does not appear at all.
    assert "REL" not in afr_store.records
    assert "relations between people or things or ideas" in afr_store.records["RLT"]["description"]


def test_for_formal_register_description_matches_tagset_md(afr_store: Store):
    assert afr_store.records["FOR"]["description"] == "A form that is used only in formal register."
    assert "commence" in afr_store.records["FOR"]["examples"][0]


def test_neo_and_loa_are_register_like_word_tags(afr_store: Store):
    assert "newly coined" in afr_store.records["NEO"]["description"]
    assert afr_store.records["NEO"]["examples"] == ["to google"]
    assert "donor language" in afr_store.records["LOA"]["description"]
    assert afr_store.records["LOA"]["examples"] == ["café (en)", "meeting (fr)"]


def test_txta_and_noua_examples_match_tagset_md(afr_store: Store):
    assert afr_store.records["TXTA"]["examples"] == ["@entry", "@title", "@topic"]
    assert afr_store.records["NOUA"]["examples"] == ["@about", "@of"]


def test_x_is_any_head_and_xxx_is_other_semantic_classes(afr_store: Store):
    assert afr_store.records["X"]["description"] == "Any head"
    assert afr_store.records["XXX"]["description"] == "Other semantic classes."


# --------------------------------------------------------------------------------------------
# afr/eng tagset.yaml identity: SPEC.md §3.3 lays out a per-language tagset.yaml, but the archive
# serves one global export (issue 16's own text); this is the record of that fact.
# --------------------------------------------------------------------------------------------


def test_afrikaans_and_english_tagset_files_are_byte_identical(afr_store: Store, eng_store: Store):
    afr_text = (afr_store.root / "afr" / "tagset.yaml").read_text(encoding="utf-8")
    eng_text = (eng_store.root / "eng" / "tagset.yaml").read_text(encoding="utf-8")
    assert afr_text == eng_text


def test_afrikaans_and_english_tagset_records_are_equal(afr_store: Store, eng_store: Store):
    assert afr_store.records == eng_store.records


# --------------------------------------------------------------------------------------------
# The category/parent gap: docs/factory/store-schema.md, "Tagset entry".
# --------------------------------------------------------------------------------------------


def test_every_entry_has_a_null_category_and_parent(afr_store: Store):
    assert afr_store.records
    for record in afr_store.records.values():
        assert record["category"] is None
        assert record["parent"] is None


# --------------------------------------------------------------------------------------------
# Schema validation.
# --------------------------------------------------------------------------------------------


def _assert_all_validate(records: dict[str, dict]) -> None:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)
    assert records
    for tag, record in records.items():
        errors = list(validator.iter_errors(record))
        assert not errors, f"{tag!r}: {errors[0].message}"


def test_afrikaans_tagset_validates_against_schema(afr_store: Store):
    _assert_all_validate(afr_store.records)


def test_english_tagset_validates_against_schema(eng_store: Store):
    _assert_all_validate(eng_store.records)


# --------------------------------------------------------------------------------------------
# Store shape: SPEC.md §3.3, §4.
# --------------------------------------------------------------------------------------------


def test_tagset_file_starts_with_the_licence_header(afr_store: Store):
    text = (afr_store.root / "afr" / "tagset.yaml").read_text(encoding="utf-8")
    first_line = text.splitlines()[0]
    assert first_line == (
        "# Licence: CC BY-SA 4.0. Source: UNL Archive, see data/archive/manifest.jsonl"
    )


def test_every_record_keeps_source(afr_store: Store):
    for tag, record in afr_store.records.items():
        assert record["source"]["archive_path"] == "exports/export_tagset.php"
        assert record["source"]["line"] == tag


# --------------------------------------------------------------------------------------------
# Unit-level parser behaviour, no archive files needed.
# --------------------------------------------------------------------------------------------

_SAMPLE_EXPORT = (
    "<h1>UNDL Foundation Tagset</h1>Version of today<br />"
    "Documentation available at <a>x</a><br /><br />"
    "A = adverb (Modifiers of verbs.): <i>beautifully</i><br />"
    "DFN = defineteness<br />"
    "FOR = formal (A form that is used only in formal register.): "
    "<i>commence (= begin), ascertain (= find out)</i><br />"
    "123PP = first person plural (including the listener) "
    "(Deictic reference, first.): <i>memu (Telugu)</i><br />"
    "</body>\n</html>"
)


def test_parse_tagset_finds_every_sample_tag():
    entries = parse_tagset(_SAMPLE_EXPORT)
    assert [e.tag for e in entries] == ["A", "DFN", "FOR", "123PP"]


def test_parse_tagset_reads_meaning_description_and_examples():
    entries = {e.tag: e for e in parse_tagset(_SAMPLE_EXPORT)}
    a = entries["A"]
    assert a.meaning == "adverb"
    assert a.description == "Modifiers of verbs."
    assert a.examples == ["beautifully"]


def test_parse_tagset_handles_a_tag_with_no_description_or_examples():
    entries = {e.tag: e for e in parse_tagset(_SAMPLE_EXPORT)}
    dfn = entries["DFN"]
    assert dfn.meaning == "defineteness"
    assert dfn.description == ""
    assert dfn.examples == []


def test_parse_tagset_splits_examples_on_top_level_commas():
    entries = {e.tag: e for e in parse_tagset(_SAMPLE_EXPORT)}
    assert entries["FOR"].examples == ["commence (= begin)", "ascertain (= find out)"]


def test_parse_tagset_joins_more_than_one_top_level_parenthetical_group():
    # 123PP: "first person plural (including the listener) (Deictic reference, first.)" -- two
    # top-level groups, joined with a space, per tagset.py's own documented interpretive call.
    entries = {e.tag: e for e in parse_tagset(_SAMPLE_EXPORT)}
    pp = entries["123PP"]
    assert pp.meaning == "first person plural"
    assert pp.description == "including the listener Deictic reference, first."


def test_entry_as_record_matches_the_schema_shape():
    entries = {e.tag: e for e in parse_tagset(_SAMPLE_EXPORT)}
    record = entry_as_record(entries["A"])
    assert record == {
        "tag": "A",
        "meaning": "adverb",
        "description": "Modifiers of verbs.",
        "examples": ["beautifully"],
        "category": None,
        "parent": None,
        "source": {"archive_path": "exports/export_tagset.php", "line": "A"},
    }


def test_format_tagset_record_round_trips_a_question_mark_example():
    # Regression: a bare '?' inside a flow-sequence plain scalar breaks yaml.safe_load unless
    # quoted (tools/importer/tagset.py's `_flow_scalar`).
    from tools.importer.tagset import TagsetEntry, format_tagset_record

    entry = TagsetEntry("DEP", "dependent", "A dependent clause.", ["who (are you?)"])
    loaded = yaml.safe_load(format_tagset_record(entry))
    assert loaded["DEP"]["examples"] == ["who (are you?)"]
