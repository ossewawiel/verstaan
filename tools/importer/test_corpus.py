# SPDX-License-Identifier: MPL-2.0
"""tools/importer/corpus.py: issue 16.

Runs the real importer against `tests/fixtures/archive/` (issue 166), a whole-file copy of the
real `ugoa1` corpus exports this session found under `data/archive/exports/corpus/ugoa1/`: each
file is already small (60 KB, 14 physical lines carrying 248 `[S:ID]` blocks), so the fixture
carries every sentence, not a carved subset (SPEC.md §3.1 wrote the real files; nothing here
re-derives an expected value from this importer's own output -- docs/standards/testing.md). Every
literal value asserted below (sentence counts, sentence text, UNL text, source line numbers) was
read directly off the raw export bytes with a throwaway script before this file was written, never
derived by running `tools.importer.corpus` and trusting its own output.
`tests/fixtures/archive/manifest.jsonl` names the source path and licence for every fixture file.

**Known gap, flagged rather than guessed around**: the corpus importer picks the first candidate
translation per source sentence ID (module docstring, `tools/importer/corpus.py`), so a corpus
entry never records the alternate phrasings the archive itself carries for some sentences (24 of
248 `af` sentences, more for `en`). Those alternates are simply not in the store; recovering them
would need a different `corpus/<name>.yaml` shape than SPEC.md §3.3's `{sentence, unl, source}`,
which is out of scope here.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pytest
import yaml

from tools.importer.corpus import (
    CorpusFiles,
    ImportStats,
    import_language,
    parse_sentence_block,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
ARCHIVE_ROOT = REPO_ROOT / "tests" / "fixtures" / "archive"


@dataclass
class Store:
    root: Path
    stats: ImportStats
    entries: list[dict]  # ugoa1.yaml's own records, read once


def _records(path: Path) -> list[dict]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return data if isinstance(data, list) else []


def _load_store(iso3: str, store_root: Path) -> Store:
    stats = import_language(iso3, ARCHIVE_ROOT, store_root)
    entries = _records(store_root / iso3 / "corpus" / "ugoa1.yaml")
    return Store(store_root, stats, entries)


@pytest.fixture(scope="module")
def afr_store(tmp_path_factory: pytest.TempPathFactory) -> Store:
    return _load_store("afr", tmp_path_factory.mktemp("afr-corpus-store"))


@pytest.fixture(scope="module")
def eng_store(tmp_path_factory: pytest.TempPathFactory) -> Store:
    return _load_store("eng", tmp_path_factory.mktemp("eng-corpus-store"))


# --------------------------------------------------------------------------------------------
# Worked entries, read off the raw bytes by hand before this file was written: the very first
# [S:389649] block ("book" / "boek", a bare [W]-wrapped UW) and [S:389689] (org:en "first book",
# alternate en "1st book" -- confirms {en} wins over {org:en} when both are present).
# --------------------------------------------------------------------------------------------


def test_afrikaans_first_sentence_is_a_bare_w_wrapped_uw(afr_store: Store):
    entry = afr_store.entries[0]
    assert entry["sentence"] == "boek"
    assert entry["unl"] == "102870092"
    assert entry["source"] == {
        "archive_path": ("exports/corpus/ugoa1/export_corpus.php__project_ugoa1_lang_af_unl_ucl"),
        "line": 1,
    }


def test_english_first_sentence_is_a_bare_w_wrapped_uw(eng_store: Store):
    entry = eng_store.entries[0]
    assert entry["sentence"] == "book"
    assert entry["unl"] == "102870092"
    assert entry["source"] == {
        "archive_path": ("exports/corpus/ugoa1/export_corpus.php__project_ugoa1_lang_en_unl_ucl"),
        "line": 1,
    }


def test_english_prefers_the_en_alternate_over_the_org_en_fallback(eng_store: Store):
    # [S:389689]: {org:en} "first book", {en} "1st book". This importer's own documented call:
    # prefer {en} (this language's designated tag) when present.
    entry = next(e for e in eng_store.entries if e["unl"] == 'mod(102870092, "1".@ordinal)')
    assert entry["sentence"] == "1st book"


def test_english_falls_back_to_org_en_when_no_en_block_exists(eng_store: Store):
    # [S:389649]: no {en} block at all, only {org:en} "book".
    entry = eng_store.entries[0]
    assert entry["sentence"] == "book"


def test_afrikaans_takes_the_first_af_candidate_when_more_than_one_exists(afr_store: Store):
    # [S:389655]: two {af} candidates, "ander boek" and "'n ander boek" -- the first wins.
    entry = next(e for e in afr_store.entries if e["unl"] == "102870092.@other")
    assert entry["sentence"] == "ander boek"


def test_a_multi_relation_sentence_joins_every_relation_with_a_space(afr_store: Store):
    # The last sentence in the file, a six-relation UNL graph (read off the raw bytes by hand).
    entry = afr_store.entries[-1]
    assert entry["unl"] == (
        "plc(102870092.@def, 104379243.@def.@top.@contact) "
        "mod(102870092.@def, 300217728) "
        "cnt(102870092.@def, 108524735.@def) "
        "nam(108524735.@def, 500003943) "
        "mod(102870092.@def, :01.@without) "
        "and:01(106999436.@generic, 103925226.@generic)"
    )


def test_html_entities_are_unescaped_in_the_sentence_text(afr_store: Store):
    # [S:389651]: {af} "&#039;n boek" -> "'n boek".
    entry = next(e for e in afr_store.entries if e["unl"] == "102870092.@indef")
    assert entry["sentence"] == "'n boek"


# --------------------------------------------------------------------------------------------
# Parallel-corpus check: SPEC.md §3.3, issue 16's own acceptance criteria.
# --------------------------------------------------------------------------------------------


def test_afrikaans_and_english_ugoa1_have_the_same_sentence_count(
    afr_store: Store, eng_store: Store
):
    assert len(afr_store.entries) == len(eng_store.entries)
    assert len(afr_store.entries) == 248


def test_every_entrys_source_names_the_project_and_a_1_based_line(afr_store: Store):
    assert afr_store.entries
    for i, entry in enumerate(afr_store.entries, start=1):
        assert "ugoa1" in entry["source"]["archive_path"]
        assert entry["source"]["line"] == i


# --------------------------------------------------------------------------------------------
# Unparsed-line accounting: SPEC.md §3.2, nothing dropped silently.
# --------------------------------------------------------------------------------------------


def test_afrikaans_input_units_equal_parsed_plus_unparsed(afr_store: Store):
    stats = afr_store.stats
    assert stats.input_units == stats.parsed_records + stats.unparsed_lines
    assert stats.parsed_records == 248


def test_english_input_units_equal_parsed_plus_unparsed(eng_store: Store):
    stats = eng_store.stats
    assert stats.input_units == stats.parsed_records + stats.unparsed_lines
    assert stats.parsed_records == 248


# --------------------------------------------------------------------------------------------
# Store shape: SPEC.md §3.3, §4.
# --------------------------------------------------------------------------------------------


def test_corpus_file_starts_with_the_licence_header(afr_store: Store):
    text = (afr_store.root / "afr" / "corpus" / "ugoa1.yaml").read_text(encoding="utf-8")
    first_line = text.splitlines()[0]
    assert first_line == (
        "# Licence: CC BY-SA 4.0. Source: UNL Archive, see data/archive/manifest.jsonl"
    )


def test_every_entry_has_exactly_sentence_unl_and_source(afr_store: Store):
    for entry in afr_store.entries:
        assert set(entry) == {"sentence", "unl", "source"}


def test_corpus_importer_does_not_clobber_an_existing_unparsed_txt(tmp_path: Path):
    lang_dir = tmp_path / "afr"
    lang_dir.mkdir()
    (lang_dir / "_unparsed.txt").write_text(
        "exports/afr/af_ana_u_c_ucl/x.txt:1: some dictionary reason\n    raw dictionary line\n",
        encoding="utf-8",
    )
    import_language("afr", ARCHIVE_ROOT, tmp_path)
    text = (lang_dir / "_unparsed.txt").read_text(encoding="utf-8")
    assert "some dictionary reason" in text


def test_corpus_importer_is_idempotent_on_its_own_unparsed_block(tmp_path: Path):
    # The real ugoa1 af file has zero unparsed lines, so this asserts the more general property
    # (no file, or the same file, on every run) rather than assuming one always gets written --
    # dictionary.py's own write_unparsed deletes an empty _unparsed.txt rather than leave a
    # zero-length file behind.
    lang_dir = tmp_path / "afr"
    unparsed_path = lang_dir / "_unparsed.txt"
    import_language("afr", ARCHIVE_ROOT, tmp_path)
    first = unparsed_path.read_text(encoding="utf-8") if unparsed_path.exists() else None
    import_language("afr", ARCHIVE_ROOT, tmp_path)
    second = unparsed_path.read_text(encoding="utf-8") if unparsed_path.exists() else None
    assert first == second


# --------------------------------------------------------------------------------------------
# Unit-level parser behaviour: unparsed handling for bad UNL braces, no archive files needed.
# The real ugoa1 af/en files have zero brace-balance failures (checked by hand before this file
# was written), so this is exercised with a hand-built fixture, per the module's own gap note.
# --------------------------------------------------------------------------------------------

AFR_FILES = CorpusFiles(archive_path="x/y", designated_tag="af")
ENG_FILES = CorpusFiles(archive_path="x/y", designated_tag="en", fallback_tag="org:en")


def test_parse_sentence_block_reads_a_bare_w_wrapped_sentence():
    body = "{org:en}<br />book<br />{/org}<br />{af}<br />boek<br />{/af}<br />{unl}<br />[W]<br />1<br />[/W]<br />{/unl}<br />"
    record, reason = parse_sentence_block(body, AFR_FILES)
    assert reason is None
    assert record == {"sentence": "boek", "unl": "1"}


def test_parse_sentence_block_rejects_unbalanced_parens_in_unl():
    body = "{af}<br />boek<br />{/af}<br />{unl}<br />mod(1,2<br />{/unl}<br />"
    record, reason = parse_sentence_block(body, AFR_FILES)
    assert record is None
    assert "do not balance" in reason


def test_parse_sentence_block_rejects_a_close_paren_before_its_open():
    body = "{af}<br />boek<br />{/af}<br />{unl}<br />mod(1,2))<br />{/unl}<br />"
    record, reason = parse_sentence_block(body, AFR_FILES)
    assert record is None
    assert "do not balance" in reason


def test_parse_sentence_block_rejects_a_missing_designated_tag_with_no_fallback():
    body = "{org:en}<br />book<br />{/org}<br />{unl}<br />[W]<br />1<br />[/W]<br />{/unl}<br />"
    record, reason = parse_sentence_block(body, AFR_FILES)
    assert record is None
    assert "{af}" in reason


def test_parse_sentence_block_english_falls_back_to_org_en():
    body = "{org:en}<br />book<br />{/org}<br />{unl}<br />[W]<br />1<br />[/W]<br />{/unl}<br />"
    record, reason = parse_sentence_block(body, ENG_FILES)
    assert reason is None
    assert record["sentence"] == "book"


def test_parse_sentence_block_english_prefers_en_over_org_en():
    body = (
        "{org:en}<br />book<br />{/org}<br />{en}<br />a book<br />{/en}<br />"
        "{unl}<br />[W]<br />1<br />[/W]<br />{/unl}<br />"
    )
    record, reason = parse_sentence_block(body, ENG_FILES)
    assert reason is None
    assert record["sentence"] == "a book"


def test_parse_sentence_block_rejects_a_missing_unl_block():
    body = "{af}<br />boek<br />{/af}<br />"
    record, reason = parse_sentence_block(body, AFR_FILES)
    assert record is None
    assert "unl" in reason
