# SPDX-License-Identifier: MPL-2.0
"""Issue 17: the four store checks, plus the checked-in "prove the gate fails first" fixtures.

docs/standards/testing.md: a gate is not proven by watching it pass. Every check below runs both
ways -- once on a store where it must report nothing, once on a store (or a tmp_path copy with
one thing broken on purpose) where it must report the exact failure.

Two fixtures are checked in, not built at test time, because the issue names them directly:
`tools/validate/tests/fixtures/broken_pos_store/` (POS=NOUN, not POS=NOU) and
`tools/validate/tests/fixtures/broken_sem_store/` (SEM=REL, not SEM=RLT, the wiki/export
disagreement docs/unl-reference/formats/tagset.md documents).
"""

from __future__ import annotations

import shutil
from pathlib import Path

import yaml

from tools.validate.cli import run
from tools.validate.store import (
    check_feature_values,
    check_rule_coverage,
    check_schema,
    check_uw_references,
    validate_store,
)

FIXTURES = Path(__file__).parent / "tests" / "fixtures"
VALID_STORE = FIXTURES / "valid_store"
BROKEN_POS_STORE = FIXTURES / "broken_pos_store"
BROKEN_SEM_STORE = FIXTURES / "broken_sem_store"


def _write_yaml(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")


VALID_DICTIONARY_ENTRY = {
    "headword": "aunt",
    "id": 1,
    "uw": "123456",
    "features": {"LEX": "N", "POS": "NOU", "SEM": "RLT"},
    "lang": "eng",
    "frequency": 0,
    "priority": 0,
    "source": {"archive_path": "exports/eng/export_cc.php", "line": 1},
}

VALID_TAGSET = {
    "LEX": {
        "tag": "LEX",
        "meaning": "lexical category",
        "description": "Grammatical class of words.",
        "examples": [],
        "category": None,
        "parent": None,
        "source": {"archive_path": "exports/export_tagset.php", "line": "LEX"},
    },
    "N": {
        "tag": "N",
        "meaning": "noun",
        "description": "Nominal lexical category.",
        "examples": [],
        "category": None,
        "parent": None,
        "source": {"archive_path": "exports/export_tagset.php", "line": "N"},
    },
    "POS": {
        "tag": "POS",
        "meaning": "part of speech",
        "description": "Grammatical class of words.",
        "examples": [],
        "category": None,
        "parent": None,
        "source": {"archive_path": "exports/export_tagset.php", "line": "POS"},
    },
    "NOU": {
        "tag": "NOU",
        "meaning": "noun",
        "description": "Part of speech, common noun.",
        "examples": [],
        "category": None,
        "parent": None,
        "source": {"archive_path": "exports/export_tagset.php", "line": "NOU"},
    },
    "SEM": {
        "tag": "SEM",
        "meaning": "semantic class",
        "description": "Semantic typology of UWs.",
        "examples": [],
        "category": None,
        "parent": None,
        "source": {"archive_path": "exports/export_tagset.php", "line": "SEM"},
    },
    "RLT": {
        "tag": "RLT",
        "meaning": "relation",
        "description": "Nouns denoting relations between people or things or ideas.",
        "examples": [],
        "category": None,
        "parent": None,
        "source": {"archive_path": "exports/export_tagset.php", "line": "RLT"},
    },
}

VALID_RULE = {
    "id": "xxa-ana-01",
    "kind": "analysis",
    "lhs": "(N,POS=NOU)",
    "rhs": "(+SEM=RLT)",
    "conditions": [],
    "comment": "invented for tools/validate/test_validate.py",
    "source": {"archive_path": "invented", "line": 1},
}


def _build_store(
    root: Path, *, dictionary_entry: dict | None = None, tagset: dict | None = None
) -> Path:
    _write_yaml(root / "dictionary" / "a.yaml", [dictionary_entry or VALID_DICTIONARY_ENTRY])
    _write_yaml(root / "tagset.yaml", tagset if tagset is not None else VALID_TAGSET)
    return root


# --- 1. Schema -----------------------------------------------------------------------------


def test_check_schema_passes_on_a_well_formed_store():
    assert check_schema(VALID_STORE) == []


def test_check_schema_fails_on_a_dictionary_entry_missing_a_required_key(tmp_path):
    broken_entry = dict(VALID_DICTIONARY_ENTRY)
    del broken_entry["uw"]
    store = _build_store(tmp_path / "store", dictionary_entry=broken_entry)
    errors = check_schema(store)
    assert errors, "dropping 'uw' from a valid dictionary entry did not fail the schema check"
    assert any("uw" in error for error in errors)


def test_check_schema_fails_on_a_grammar_rule_missing_a_required_key(tmp_path):
    store = tmp_path / "store"
    _write_yaml(store / "dictionary" / "a.yaml", [VALID_DICTIONARY_ENTRY])
    _write_yaml(store / "tagset.yaml", VALID_TAGSET)
    broken_rule = dict(VALID_RULE)
    del broken_rule["comment"]
    _write_yaml(store / "grammar" / "analysis.yaml", [broken_rule])
    errors = check_schema(store)
    assert any("comment" in error for error in errors)


# --- 2. Feature values -----------------------------------------------------------------------


def test_check_feature_values_passes_on_a_well_formed_store():
    assert check_feature_values(VALID_STORE) == []


def test_check_feature_values_fails_on_pos_noun_fixture():
    # Deliberately broken: docs/standards/testing.md's "prove the gate fails first" fixture.
    # POS=NOUN, not the real tagset's POS=NOU.
    errors = check_feature_values(BROKEN_POS_STORE)
    assert errors
    assert any("POS" in error and "NOUN" in error for error in errors)


def test_check_feature_values_fails_on_sem_rel_fixture():
    # The SEM=REL vs SEM=RLT fixture from docs/unl-reference/formats/tagset.md, "Where the
    # export adds tags the wiki tree does not define".
    errors = check_feature_values(BROKEN_SEM_STORE)
    assert errors
    assert any("SEM" in error and "REL" in error for error in errors)


def test_check_feature_values_skips_reference_valued_attributes(tmp_path):
    # LEMMA holds the headword text itself, not a tagset mnemonic (docs/factory/store-schema.md,
    # "Feature values the validator does not check"); it must never be flagged.
    entry = dict(VALID_DICTIONARY_ENTRY)
    entry["features"] = {"LEX": "N", "POS": "NOU", "LEMMA": "aunt", "PAR": "M17"}
    store = _build_store(tmp_path / "store", dictionary_entry=entry)
    assert check_feature_values(store) == []


def test_check_feature_values_catches_an_unresolved_grammar_rule_attribute(tmp_path):
    store = _build_store(tmp_path / "store")
    broken_rule = dict(VALID_RULE)
    broken_rule["rhs"] = "(+POS=CCJ)"  # CCJ: not in this fixture's tagset (nor the real one).
    _write_yaml(store / "grammar" / "analysis.yaml", [broken_rule])
    errors = check_feature_values(store)
    assert any("CCJ" in error for error in errors)


# --- 3. UW references ------------------------------------------------------------------------


def test_check_uw_references_passes_on_a_well_formed_store():
    assert check_uw_references(VALID_STORE) == []


def test_check_uw_references_passes_on_an_empty_uw(tmp_path):
    entry = dict(VALID_DICTIONARY_ENTRY)
    entry["uw"] = ""
    store = _build_store(tmp_path / "store", dictionary_entry=entry)
    assert check_uw_references(store) == []


def test_check_uw_references_fails_on_a_non_digit_uw(tmp_path):
    entry = dict(VALID_DICTIONARY_ENTRY)
    entry["uw"] = "book(icl>publication)"  # a UCL string, not the UCN this check expects.
    store = _build_store(tmp_path / "store", dictionary_entry=entry)
    errors = check_uw_references(store)
    assert errors
    assert any("uw" in error for error in errors)


# --- 4. Rule coverage -------------------------------------------------------------------------


def test_check_rule_coverage_warns_when_a_rule_has_no_covering_test(tmp_path):
    store = _build_store(tmp_path / "store")
    _write_yaml(store / "grammar" / "analysis.yaml", [VALID_RULE])
    warnings = check_rule_coverage(store)
    assert any(VALID_RULE["id"] in warning for warning in warnings)


def test_check_rule_coverage_is_silent_when_a_rule_is_covered(tmp_path):
    store = _build_store(tmp_path / "store")
    _write_yaml(store / "grammar" / "analysis.yaml", [VALID_RULE])
    _write_yaml(
        store / "tests" / "basic.yaml",
        [
            {
                "input": "x",
                "expected": "y",
                "direction": "a->b",
                "tier": "basic",
                "register": "neutral",
                "rules": [VALID_RULE["id"]],
            }
        ],
    )
    assert check_rule_coverage(store) == []


def test_check_rule_coverage_treats_a_missing_tests_directory_as_fully_uncovered(tmp_path):
    # Decided (issue 17, docs/factory/store-schema.md "Rule coverage"): no tests/ directory at
    # all -- the real afr/eng case at M2 -- means every rule is uncovered, not that the check is
    # skipped.
    store = _build_store(tmp_path / "store")
    _write_yaml(
        store / "grammar" / "analysis.yaml", [VALID_RULE, dict(VALID_RULE, id="xxa-ana-02")]
    )
    assert (store / "tests").exists() is False
    warnings = check_rule_coverage(store)
    assert len(warnings) == 2


def test_check_rule_coverage_never_fails_the_exit_code_at_m2(tmp_path):
    # SPEC.md §3.3: a warning at M2, an error only from M3. validate_store must keep it out of
    # .errors even when every rule is uncovered.
    store = _build_store(tmp_path / "store")
    _write_yaml(store / "grammar" / "analysis.yaml", [VALID_RULE])
    report = validate_store(store)
    assert report.coverage_warnings
    assert report.errors == []


# --- validate_store / CLI wiring --------------------------------------------------------------


def test_validate_store_names_each_check_in_its_own_field():
    report = validate_store(BROKEN_POS_STORE)
    assert report.feature_errors and not report.schema_errors and not report.uw_errors


def _repo_root_with_store(tmp_path: Path, fixture: Path, iso3: str) -> Path:
    # `run("lang", ...)` looks for the store under `<repo_root>/data/languages/<iso3>/`
    # (SPEC.md §3.3); the checked-in fixtures live under tools/validate/tests/fixtures/ instead,
    # so copy one into that shape for a `run`-level test.
    root = tmp_path / "data" / "languages" / iso3
    shutil.copytree(fixture, root)
    return tmp_path


def test_run_lang_mode_fails_on_the_broken_pos_fixture(tmp_path, capsys):
    repo_root = _repo_root_with_store(tmp_path, BROKEN_POS_STORE, "broken_pos")
    exit_code = run("lang", repo_root, lang="broken_pos")
    out = capsys.readouterr()
    assert exit_code == 1
    assert any("POS" in line and "NOUN" in line for line in out.err.splitlines())


def test_run_lang_mode_fails_on_the_broken_sem_fixture(tmp_path, capsys):
    repo_root = _repo_root_with_store(tmp_path, BROKEN_SEM_STORE, "broken_sem")
    exit_code = run("lang", repo_root, lang="broken_sem")
    out = capsys.readouterr()
    assert exit_code == 1
    assert any("SEM" in line and "REL" in line for line in out.err.splitlines())


def test_run_lang_mode_passes_on_the_valid_fixture(tmp_path, capsys):
    repo_root = _repo_root_with_store(tmp_path, VALID_STORE, "valid")
    exit_code = run("lang", repo_root, lang="valid")
    out = capsys.readouterr()
    assert exit_code == 0
    assert "schema errors: 0" in out.out
    assert "feature-value errors: 0" in out.out
    assert "UW errors: 0" in out.out


def test_run_lang_mode_reports_no_store(tmp_path, capsys):
    exit_code = run("lang", tmp_path, lang="zzz")
    assert exit_code == 1
    assert "no store" in capsys.readouterr().err


def test_run_all_mode_exits_zero_with_uncovered_rules_only(tmp_path, capsys):
    root = tmp_path / "data" / "languages"
    _build_store(root / "onetest")
    _write_yaml(root / "onetest" / "grammar" / "analysis.yaml", [VALID_RULE])
    exit_code = run("all", tmp_path)
    out = capsys.readouterr()
    assert exit_code == 0
    assert "uncovered rules: 1" in out.out
