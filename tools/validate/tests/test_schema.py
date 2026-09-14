# SPDX-License-Identifier: MPL-2.0
"""Validates tools/validate/schema/*.schema.json against hand-converted worked examples.

Every example below is copied by hand from an archive line quoted in
docs/unl-reference/formats/dictionary.md, transformation-grammar.md, inflection.md or
subcategorisation.md, reshaped into the YAML/JSON the schema describes, per SPEC.md §3.2 and
§3.3. None of these values comes from running tools/importer (issue 13 is schema-only; the
importer is issues 14-16, not in scope here).

Proven both ways (docs/standards/testing.md): a well-formed example validates cleanly; the same
example missing a required key fails, and the failure names the missing key.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError, validate

SCHEMA_DIR = Path(__file__).parent.parent / "schema"


def _load_schema(name: str) -> dict:
    return json.loads((SCHEMA_DIR / name).read_text(encoding="utf-8"))


DICTIONARY_SCHEMA = _load_schema("dictionary-entry.schema.json")
GRAMMAR_SCHEMA = _load_schema("grammar-rule.schema.json")
STORE_LAYOUT_SCHEMA = _load_schema("store-layout.schema.json")

# The required-key sets below are copied from SPEC.md §3.2, not read back from the schema files.
# Parametrizing on a hardcoded set, rather than on schema["required"], means a schema that loses
# its own "required" list (accidentally or otherwise) fails these tests instead of silently
# shrinking the parametrize list to nothing and reporting a pass-by-vacuity.
SPEC_DICTIONARY_REQUIRED = {
    "headword",
    "id",
    "uw",
    "features",
    "lang",
    "frequency",
    "priority",
    "source",
}
SPEC_GRAMMAR_REQUIRED = {"id", "kind", "lhs", "rhs", "conditions", "comment", "source"}


# --- Worked dictionary entries -------------------------------------------------------------
# Afrikaans: three real lines, Afrikaans-UNL Unabridged Analysis Dictionary of Common Words,
# UCL export, file 1 (docs/unl-reference/formats/dictionary.md, "Worked example: three real
# Afrikaans lines"). FRE and PRI taken from that page's own field-by-field table, not from the
# <FLG,PRI,FRE> formal grammar order, because the table is what the page hand-labels each value.

AFRIKAANS_ENTRIES = [
    {
        "headword": "aan",
        "id": 22319,
        "uw": "400068368",
        "features": {
            "LEMMA": "aan",
            "BF": "aan",
            "LEX": "A",
            "POS": "AAV",
            "LST": "WRD",
            "PAR": "M0",
            "FRA": "Y0",
            "SEM": "MAN",
        },
        "lang": "af",
        "frequency": 2,
        "priority": 0,
        "source": {"archive_path": "exports/afr/af_ana_u_c_ucl/af_ana_u_c_ucl_1.txt", "line": 1},
    },
    {
        "headword": "aanhou",
        "id": 25928,
        "uw": "400143068",
        "features": {
            "LEMMA": "aanhou",
            "BF": "aanhou",
            "LEX": "A",
            "POS": "AAV",
            "LST": "WRD",
            "PAR": "M0",
            "FRA": "Y0",
            "SEM": "MAN",
        },
        "lang": "af",
        "frequency": 2,
        "priority": 0,
        "source": {"archive_path": "exports/afr/af_ana_u_c_ucl/af_ana_u_c_ucl_1.txt", "line": 2},
    },
    {
        "headword": "alleen",
        "id": 28823,
        "uw": "400004722",
        "features": {
            "LEMMA": "alleen",
            "BF": "alleen",
            "LEX": "A",
            "POS": "SAV",
            "LST": "WRD",
            "PAR": "M0",
            "FRA": "Y0",
            "SEM": "MAN",
            "SFR": "K0",
        },
        "lang": "af",
        "frequency": 10,
        "priority": 0,
        "source": {"archive_path": "exports/afr/af_ana_u_c_ucl/af_ana_u_c_ucl_1.txt", "line": 3},
    },
]

# English: three real lines, export_cc.php, English Analysis Dictionary, UCL export, alphabetic
# run of prepositions (docs/unl-reference/formats/dictionary.md, "Worked example: three real
# English lines").

ENGLISH_ENTRIES = [
    {
        "headword": "aboard",
        "id": 516110,
        "uw": "534001",
        "features": {
            "LEMMA": "aboard",
            "BF": "aboard",
            "LEX": "P",
            "POS": "PRE",
            "LST": "WRD",
            "PAR": "M0",
            "FRA": "Y259",
        },
        "lang": "en",
        "frequency": 0,
        "priority": 0,
        "source": {"archive_path": "exports/eng/export_cc.php", "line": 1},
    },
    {
        "headword": "about",
        "id": 515821,
        "uw": "119402",
        "features": {
            "LEMMA": "about",
            "BF": "about",
            "LEX": "P",
            "POS": "PRE",
            "LST": "WRD",
            "PAR": "M0",
            "FRA": "Y259",
        },
        "lang": "en",
        "frequency": 0,
        "priority": 0,
        "source": {"archive_path": "exports/eng/export_cc.php", "line": 2},
    },
    {
        "headword": "above",
        "id": 515753,
        "uw": "118441",
        "features": {
            "LEMMA": "above",
            "BF": "above",
            "LEX": "P",
            "POS": "PRE",
            "LST": "WRD",
            "PAR": "M0",
            "FRA": "Y259",
        },
        "lang": "en",
        "frequency": 0,
        "priority": 0,
        "source": {"archive_path": "exports/eng/export_cc.php", "line": 3},
    },
]


# --- Worked grammar rules -------------------------------------------------------------------
# analysis: Rule 1, "mark plural nouns", English analysis T-grammar, corpus UC-A1, section 1.1
# (docs/unl-reference/formats/transformation-grammar.md).
ANALYSIS_RULE = {
    "id": "eng-tgrammar-1.1-rule1",
    "kind": "analysis",
    "lhs": "(N,PLR,^@pl,^@multal,^@paucal,^@all)",
    "rhs": "(+att=@pl)",
    "conditions": [],
    "comment": "adds the attribute @pl to a plural noun not already carrying a quantity attribute: books > book.@pl.",
    "source": {"archive_path": "grammars/eng_unl_tgrammar.txt", "line": "section 1.1, rule 1"},
}

# inflection: paradigm M2, English inflectional-paradigm export
# (docs/unl-reference/formats/inflection.md, "M2 -- add \"s\" to form the plural").
INFLECTION_RULE = {
    "id": "M2",
    "kind": "inflection",
    "lhs": "NUM",
    "rhs": 'SNG:=0>"";PLR:=0>"s";',
    "conditions": [],
    "comment": 'adds "s" to form the plural: table > tables, boy > boys, computer > computers.',
    "source": {
        "archive_path": "exports/eng/export_grammar.php__type_M_lang_en",
        "line": "M2",
    },
}

# subcategorisation: frame Y38, English subcategorisation-frame export
# (docs/unl-reference/formats/subcategorisation.md, "Y38 -- direct transitive verb").
SUBCATEGORISATION_RULE = {
    "id": "Y38",
    "kind": "subcategorisation",
    "lhs": "VS(NP)VC(NP)",
    "rhs": "",
    "conditions": [],
    "comment": "direct transitive verb: one subject noun phrase, one object noun phrase (accept, accomplish, acknowledge).",
    "source": {
        "archive_path": "exports/eng/export_grammar.php__type_Y_lang_en",
        "line": "Y38",
    },
}


# --- Schemas are themselves valid Draft 2020-12 -----------------------------------------------


@pytest.mark.parametrize(
    "schema",
    [DICTIONARY_SCHEMA, GRAMMAR_SCHEMA, STORE_LAYOUT_SCHEMA],
    ids=["dictionary", "grammar", "store-layout"],
)
def test_schema_is_well_formed(schema: dict) -> None:
    Draft202012Validator.check_schema(schema)


# --- Dictionary entries -----------------------------------------------------------------------


@pytest.mark.parametrize(
    "entry",
    AFRIKAANS_ENTRIES + ENGLISH_ENTRIES,
    ids=[e["headword"] for e in AFRIKAANS_ENTRIES + ENGLISH_ENTRIES],
)
def test_worked_dictionary_entry_validates(entry: dict) -> None:
    validate(instance=entry, schema=DICTIONARY_SCHEMA)


def test_dictionary_entry_required_keys_match_spec() -> None:
    # SPEC.md §3.2 dictionary entry shape, verbatim field list.
    assert set(DICTIONARY_SCHEMA["required"]) == SPEC_DICTIONARY_REQUIRED


@pytest.mark.parametrize("missing_key", sorted(SPEC_DICTIONARY_REQUIRED))
def test_dictionary_entry_missing_required_key_fails_loudly(missing_key: str) -> None:
    broken = dict(AFRIKAANS_ENTRIES[0])
    del broken[missing_key]
    with pytest.raises(ValidationError) as excinfo:
        validate(instance=broken, schema=DICTIONARY_SCHEMA)
    assert missing_key in str(excinfo.value), (
        f"dropping {missing_key!r} from a valid dictionary entry did not fail on that key; "
        f"got: {excinfo.value}"
    )


# --- Grammar rules -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    "rule",
    [ANALYSIS_RULE, INFLECTION_RULE, SUBCATEGORISATION_RULE],
    ids=["analysis-M2-plural", "inflection-M2", "subcategorisation-Y38"],
)
def test_worked_grammar_rule_validates(rule: dict) -> None:
    validate(instance=rule, schema=GRAMMAR_SCHEMA)


def test_grammar_rule_required_keys_match_spec() -> None:
    # SPEC.md §3.2: "Grammar rule becomes {id, kind, lhs, rhs, conditions, comment, source}".
    assert set(GRAMMAR_SCHEMA["required"]) == SPEC_GRAMMAR_REQUIRED


@pytest.mark.parametrize("missing_key", sorted(SPEC_GRAMMAR_REQUIRED))
def test_grammar_rule_missing_required_key_fails_loudly(missing_key: str) -> None:
    broken = dict(ANALYSIS_RULE)
    del broken[missing_key]
    with pytest.raises(ValidationError) as excinfo:
        validate(instance=broken, schema=GRAMMAR_SCHEMA)
    assert missing_key in str(excinfo.value), (
        f"dropping {missing_key!r} from a valid grammar rule did not fail on that key; "
        f"got: {excinfo.value}"
    )


def test_grammar_rule_kind_enum_matches_spec() -> None:
    # SPEC.md §3.2: kind ∈ analysis | generation | inflection | subcategorisation |
    # disambiguation | default.
    assert set(GRAMMAR_SCHEMA["properties"]["kind"]["enum"]) == {
        "analysis",
        "generation",
        "inflection",
        "subcategorisation",
        "disambiguation",
        "default",
    }


# --- Store layout ------------------------------------------------------------------------------


def test_store_layout_lists_every_spec_file() -> None:
    # SPEC.md §3.3 tree, verbatim.
    expected_files = {
        "dictionary/<a-z>.yaml",
        "grammar/analysis.yaml",
        "grammar/generation.yaml",
        "grammar/inflection.yaml",
        "grammar/subcategorisation.yaml",
        "grammar/disambiguation.yaml",
        "tagset.yaml",
        "corpus/<name>.yaml",
        "tests/<name>.yaml",
        "meta.yaml",
    }
    assert set(STORE_LAYOUT_SCHEMA["required"]) == expected_files
    assert set(STORE_LAYOUT_SCHEMA["properties"]) == expected_files


VALID_STORE_MANIFEST = {
    "dictionary/<a-z>.yaml": {
        "shape": "array",
        "required_keys": [
            "headword",
            "id",
            "uw",
            "features",
            "lang",
            "frequency",
            "priority",
            "source",
        ],
    },
    "grammar/analysis.yaml": {
        "shape": "array",
        "required_keys": ["id", "kind", "lhs", "rhs", "conditions", "comment", "source"],
    },
    "grammar/generation.yaml": {
        "shape": "array",
        "required_keys": ["id", "kind", "lhs", "rhs", "conditions", "comment", "source"],
    },
    "grammar/inflection.yaml": {
        "shape": "array",
        "required_keys": ["id", "kind", "lhs", "rhs", "conditions", "comment", "source"],
    },
    "grammar/subcategorisation.yaml": {
        "shape": "array",
        "required_keys": ["id", "kind", "lhs", "rhs", "conditions", "comment", "source"],
    },
    "grammar/disambiguation.yaml": {
        "shape": "array",
        "required_keys": ["id", "kind", "lhs", "rhs", "conditions", "comment", "source"],
    },
    "tagset.yaml": {"shape": "object"},
    "corpus/<name>.yaml": {
        "shape": "array",
        "required_keys": ["sentence", "unl", "source"],
    },
    "tests/<name>.yaml": {
        "shape": "array",
        "required_keys": ["input", "expected", "direction", "tier", "register"],
    },
    "meta.yaml": {
        "shape": "object",
        "required_keys": ["iso1", "iso3", "name", "licence", "counts", "last_import"],
    },
}


def test_store_layout_manifest_for_a_worked_store_validates() -> None:
    validate(instance=VALID_STORE_MANIFEST, schema=STORE_LAYOUT_SCHEMA)


SPEC_STORE_FILES = {
    "dictionary/<a-z>.yaml",
    "grammar/analysis.yaml",
    "grammar/generation.yaml",
    "grammar/inflection.yaml",
    "grammar/subcategorisation.yaml",
    "grammar/disambiguation.yaml",
    "tagset.yaml",
    "corpus/<name>.yaml",
    "tests/<name>.yaml",
    "meta.yaml",
}


@pytest.mark.parametrize("missing_file", sorted(SPEC_STORE_FILES))
def test_store_layout_missing_file_fails_loudly(missing_file: str) -> None:
    broken = dict(VALID_STORE_MANIFEST)
    del broken[missing_file]
    with pytest.raises(ValidationError) as excinfo:
        validate(instance=broken, schema=STORE_LAYOUT_SCHEMA)
    assert missing_file in str(excinfo.value), (
        f"dropping {missing_file!r} from a valid store manifest did not fail on that file; "
        f"got: {excinfo.value}"
    )
