# SPDX-License-Identifier: MPL-2.0
"""Issue 187: `meta.yaml`, the counts computed from a store, and the importers that call it.

Expected counts are written by hand from the small stores each test builds, never read back from
the code under test (docs/standards/testing.md).
"""

from __future__ import annotations

from pathlib import Path

import yaml

from tools.importer import corpus, grammar, tagset
from tools.importer.meta import compute_counts, main, refresh_meta

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE_ARCHIVE = REPO_ROOT / "tests" / "fixtures" / "archive"
REQUIRED = ("iso1", "iso3", "name", "licence", "counts", "last_import")


def _build_store(root: Path) -> Path:
    store = root / "eng"
    (store / "dictionary").mkdir(parents=True)
    (store / "dictionary" / "a.yaml").write_text(
        "- headword: a\n- headword: ab\n", encoding="utf-8"
    )
    (store / "dictionary" / "b.yaml").write_text("- headword: b\n", encoding="utf-8")
    (store / "grammar").mkdir()
    (store / "grammar" / "analysis.yaml").write_text("- id: '1'\n- id: '2'\n", encoding="utf-8")
    (store / "grammar" / "inflection.yaml").write_text("- id: M2\n", encoding="utf-8")
    (store / "corpus").mkdir()
    (store / "corpus" / "ugoa1.yaml").write_text("- sentence: x\n", encoding="utf-8")
    (store / "tests").mkdir()
    (store / "tests" / "basic.yaml").write_text("- id: A01\n- id: A02\n", encoding="utf-8")
    (store / "tagset.yaml").write_text("N: {tag: N}\nV: {tag: V}\nPOS: {tag: POS}\n")
    (store / "_unparsed.txt").write_text("f:1: bad\n    ;raw\n\nf:2: bad\n    ;raw\n")
    return store


def test_compute_counts_reads_the_store_as_it_stands(tmp_path):
    store = _build_store(tmp_path)
    assert compute_counts(store) == {
        "corpus_sentences": 1,
        "dictionary_entries": 3,
        "rules_analysis": 2,
        "rules_disambiguation": 0,
        "rules_generation": 0,
        "rules_inflection": 1,
        "rules_subcategorisation": 0,
        "tagset_entries": 3,
        "test_rows": 2,
        "unparsed_lines": 2,
    }


def test_counts_follow_the_store_when_a_file_changes(tmp_path):
    store = _build_store(tmp_path)
    (store / "dictionary" / "b.yaml").write_text(
        "- headword: b\n- headword: bc\n", encoding="utf-8"
    )
    assert compute_counts(store)["dictionary_entries"] == 4


def test_refresh_meta_writes_every_required_key(tmp_path):
    _build_store(tmp_path)
    meta = refresh_meta("eng", tmp_path / "no-archive", tmp_path)
    on_disk = yaml.safe_load((tmp_path / "eng" / "meta.yaml").read_text(encoding="utf-8"))
    assert all(key in on_disk for key in REQUIRED)
    assert on_disk["iso1"] == "en"
    assert on_disk["iso3"] == "eng"
    assert on_disk["name"] == "English"
    assert on_disk["licence"] == "CC BY-SA 4.0"
    assert on_disk["counts"]["dictionary_entries"] == 3
    assert meta is not None and meta["counts"] == on_disk["counts"]


def test_refresh_meta_reads_the_name_from_languages_json(tmp_path):
    _build_store(tmp_path)
    archive = tmp_path / "archive"
    archive.mkdir()
    (archive / "languages.json").write_text(
        '[{"iso1": "en", "iso3": "eng", "name": "Inglese"}]', encoding="utf-8"
    )
    meta = refresh_meta("eng", archive, tmp_path)
    assert meta is not None and meta["name"] == "Inglese"


def test_refresh_meta_skips_an_unknown_language(tmp_path):
    (tmp_path / "xyz").mkdir()
    assert refresh_meta("xyz", tmp_path / "no-archive", tmp_path) is None
    assert not (tmp_path / "xyz" / "meta.yaml").exists()


def test_standalone_step_recomputes_counts_without_a_reimport_and_keeps_last_import(tmp_path):
    store = _build_store(tmp_path)
    (store / "meta.yaml").write_text(
        "iso1: en\niso3: eng\nname: English\nlicence: CC BY-SA 4.0\ncounts: {}\n"
        "last_import: 2020-01-02\n",
        encoding="utf-8",
    )
    before = (store / "dictionary" / "a.yaml").read_text(encoding="utf-8")
    code = main(
        ["--iso3", "eng", "--archive-root", str(tmp_path / "x"), "--store-root", str(tmp_path)]
    )
    assert code == 0
    meta = yaml.safe_load((store / "meta.yaml").read_text(encoding="utf-8"))
    assert meta["counts"]["dictionary_entries"] == 3
    assert str(meta["last_import"]) == "2020-01-02"
    assert (store / "dictionary" / "a.yaml").read_text(encoding="utf-8") == before


def test_corpus_importer_writes_meta_at_the_end_of_a_run(tmp_path):
    stats = corpus.import_language("afr", FIXTURE_ARCHIVE, tmp_path)
    meta = yaml.safe_load((tmp_path / "afr" / "meta.yaml").read_text(encoding="utf-8"))
    assert meta["iso3"] == "afr"
    assert meta["counts"]["corpus_sentences"] == stats.parsed_records
    assert meta["counts"]["corpus_sentences"] > 0


def test_grammar_importer_writes_meta_at_the_end_of_a_run(tmp_path):
    stats = grammar.import_language("eng", FIXTURE_ARCHIVE, tmp_path)
    meta = yaml.safe_load((tmp_path / "eng" / "meta.yaml").read_text(encoding="utf-8"))
    rules = sum(v for k, v in meta["counts"].items() if k.startswith("rules_"))
    assert rules == stats.parsed_records
    assert rules > 0


def test_tagset_importer_writes_meta_at_the_end_of_a_run(tmp_path):
    entries = tagset.import_tagset("eng", FIXTURE_ARCHIVE, tmp_path)
    meta = yaml.safe_load((tmp_path / "eng" / "meta.yaml").read_text(encoding="utf-8"))
    assert meta["counts"]["tagset_entries"] == len(entries)
