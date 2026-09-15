# SPDX-License-Identifier: MPL-2.0
"""Store checks: schema, feature values, UW references, rule coverage (issue 17, SPEC.md §3.3).

Four independent functions, one per check, so a failing one names itself in the report:
`check_schema`, `check_feature_values`, `check_uw_references`, `check_rule_coverage`. Each takes
a language store root (`data/languages/<iso3>/`) and returns a list of strings: an error for the
first three, a warning for the fourth (SPEC.md: the coverage check is a warning at M2, an error
from M3). `validate_store` runs all four and returns a `StoreReport`.

Two judgment calls this module makes, both documented in `docs/factory/store-schema.md`:

- Which dictionary/grammar attributes the feature-value check skips (`REFERENCE_VALUED_ATTRIBUTES`
  below; see "Feature values the validator does not check").
- What field name and directory-absence rule the rule-coverage check uses (`RULE_COVERAGE_FIELD`
  below; see "Rule coverage: the `rules` field and an empty tests/ directory").
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator

# libyaml's C loader, not pyyaml's pure-Python one: on the real afr/eng stores (30k+ dictionary
# entries) the Python loader takes over half a minute per language; CSafeLoader takes seconds.
# Every check function reads the same files, so _load_yaml also caches on (path, mtime, size),
# not just on path, so a test that mutates a file in place and reloads the same path never sees
# stale content.
_YAML_LOADER = yaml.CSafeLoader if yaml.__with_libyaml__ else yaml.SafeLoader


@lru_cache(maxsize=512)
def _cached_yaml(path_str: str, _mtime_ns: int, _size: int) -> Any:
    return yaml.load(Path(path_str).read_text(encoding="utf-8"), Loader=_YAML_LOADER)


def _load_yaml(path: Path) -> Any:
    stat = path.stat()
    return _cached_yaml(str(path), stat.st_mtime_ns, stat.st_size)


SCHEMA_DIR = Path(__file__).parent / "schema"


def _load_schema(name: str) -> dict:
    return json.loads((SCHEMA_DIR / name).read_text(encoding="utf-8"))


DICTIONARY_SCHEMA = _load_schema("dictionary-entry.schema.json")
GRAMMAR_SCHEMA = _load_schema("grammar-rule.schema.json")
TAGSET_SCHEMA = _load_schema("tagset-entry.schema.json")
STORE_LAYOUT_SCHEMA = _load_schema("store-layout.schema.json")

_DICTIONARY_VALIDATOR = Draft202012Validator(DICTIONARY_SCHEMA)
_GRAMMAR_VALIDATOR = Draft202012Validator(GRAMMAR_SCHEMA)
_TAGSET_VALIDATOR = Draft202012Validator(TAGSET_SCHEMA)

# corpus/<name>.yaml and tests/<name>.yaml have no per-record *.schema.json file
# (docs/factory/store-schema.md: "the three-key shape needs no further per-field constraint").
# Their required keys still live in one place, store-layout.schema.json, so read them from there
# rather than repeat the list a second time in this file.
CORPUS_REQUIRED_KEYS = tuple(
    STORE_LAYOUT_SCHEMA["$defs"]["corpusFile"]["properties"]["required_keys"]["const"]
)
TESTS_REQUIRED_KEYS = tuple(
    STORE_LAYOUT_SCHEMA["$defs"]["testsFile"]["properties"]["required_keys"]["const"]
)

# SPEC.md §3.3: the five grammar/<kind>.yaml files.
GRAMMAR_KINDS = ("analysis", "generation", "inflection", "subcategorisation", "disambiguation")

# Feature attribute=value pairs, e.g. POS=NOU, SEM=RLT, XB=VB. Both sides upper-case mnemonics
# only: a lower-case attribute like rel= or att= is a UNL relation label written into a rule's
# lhs/rhs (docs/unl-reference/formats/transformation-grammar.md), not a tagset.yaml feature, and a
# right-hand side holding a rule variable (%x) or a bracketed literal ([is]) is not a tag either.
FEATURE_PATTERN = re.compile(r"\b([A-Z][A-Z0-9]*)=([A-Z][A-Z0-9]*)\b")

# Attributes whose value is a literal string or a grammar-defined catalogue number, not a member
# of the closed, flat 509-tag list tagset.yaml enumerates. Confirmed against every real afr/eng
# dictionary entry (2026-09-15): checking these against tagset.yaml would flag every lemma, base
# form and paradigm/frame/subframe reference as an unresolved value. tagset.yaml's own entries for
# PAR, FRA and SFR say as much ("...to be defined in the grammar"); BF and FLX hold a literal word
# form or an inflection-rule reference; DIGIT holds a digit string. LEMMA is not even a tagset
# key, the plainest signal it is not a categorical feature. Documented in
# docs/factory/store-schema.md, "Feature values the validator does not check".
REFERENCE_VALUED_ATTRIBUTES = frozenset({"LEMMA", "BF", "PAR", "FRA", "SFR", "FLX", "DIGIT"})

# dictionary.md's own formal grammar: `<UW> ::= <text> | <REGULAR EXPRESSION>` — a UW is not
# digits-only. Real afr/eng entries confirm this at scale (2026-09-15, issue 18): pronoun entries
# hold placeholder regex forms (`00.@2.@dual.@female`), and some entries hold a UCL string
# (`zero(equ>no)`) rather than the UCN the "Disagreement" section's narrow sample found. This
# check can therefore only catch a UW that is not text at all (wrong type, or a raw control
# character/newline a hand-edited store file should never carry) — not a shape it does not
# recognise. Resolving a UW to a UW-to-UCL gloss stays out of scope (issue 17, "Not in scope").
UW_PATTERN = re.compile(r"^[\x20-\x7E]*$")

# Decided (2026-09-15, this issue): a tests/<name>.yaml entry names the grammar rule ids it
# exercises in a `rules` field, e.g. `rules: [xxa-ana-01, M2]`. SPEC.md §3.3 and
# tools/validate/schema/store-layout.schema.json fix only {input, expected, direction, tier,
# register} for this file; neither names a coverage field, because no test-writer pass has run
# yet (docs/factory/store-schema.md: "authored by a rule-author or test-writer, never mirrored
# from the archive"). `rules` is additive, not a change to those five required keys, so it needs
# no schema migration once a test-writer starts filling it in. Documented in
# docs/factory/store-schema.md, "Rule coverage".
RULE_COVERAGE_FIELD = "rules"


def _load_yaml_list(path: Path) -> list[Any]:
    data = _load_yaml(path)
    return data if isinstance(data, list) else []


def _load_yaml_dict(path: Path) -> dict[str, Any]:
    data = _load_yaml(path)
    return data if isinstance(data, dict) else {}


def _rel(store_root: Path, path: Path) -> str:
    return f"{store_root.name}/{path.relative_to(store_root).as_posix()}"


def _tagset_keys(store_root: Path) -> set[str]:
    tagset_path = store_root / "tagset.yaml"
    if not tagset_path.is_file():
        return set()
    return set(_load_yaml_dict(tagset_path))


# --------------------------------------------------------------------------------------------
# 1. Schema: every record against its tools/validate/schema/*.schema.json file.
# --------------------------------------------------------------------------------------------


def check_schema(store_root: Path) -> list[str]:
    """Every dictionary entry, grammar rule and tagset entry against its JSON Schema file; every
    corpus record against the three keys store-layout.schema.json's corpusFile names (no
    per-field schema file exists for corpus, docs/factory/store-schema.md)."""
    errors: list[str] = []

    dict_dir = store_root / "dictionary"
    if dict_dir.is_dir():
        for path in sorted(dict_dir.glob("*.yaml")):
            for index, entry in enumerate(_load_yaml_list(path)):
                for err in _DICTIONARY_VALIDATOR.iter_errors(entry):
                    errors.append(f"{_rel(store_root, path)}[{index}]: {err.message}")

    grammar_dir = store_root / "grammar"
    for kind in GRAMMAR_KINDS:
        path = grammar_dir / f"{kind}.yaml"
        if not path.is_file():
            continue
        for index, rule in enumerate(_load_yaml_list(path)):
            for err in _GRAMMAR_VALIDATOR.iter_errors(rule):
                errors.append(f"{_rel(store_root, path)}[{index}]: {err.message}")

    tagset_path = store_root / "tagset.yaml"
    if tagset_path.is_file():
        for tag, entry in _load_yaml_dict(tagset_path).items():
            for err in _TAGSET_VALIDATOR.iter_errors(entry):
                errors.append(f"{_rel(store_root, tagset_path)}[{tag}]: {err.message}")

    corpus_dir = store_root / "corpus"
    if corpus_dir.is_dir():
        for path in sorted(corpus_dir.glob("*.yaml")):
            for index, entry in enumerate(_load_yaml_list(path)):
                if not isinstance(entry, dict):
                    errors.append(f"{_rel(store_root, path)}[{index}]: not an object")
                    continue
                missing = [key for key in CORPUS_REQUIRED_KEYS if key not in entry]
                if missing:
                    errors.append(
                        f"{_rel(store_root, path)}[{index}]: missing {', '.join(missing)}"
                    )

    tests_dir = store_root / "tests"
    if tests_dir.is_dir():
        for path in sorted(tests_dir.glob("*.yaml")):
            for index, entry in enumerate(_load_yaml_list(path)):
                if not isinstance(entry, dict):
                    errors.append(f"{_rel(store_root, path)}[{index}]: not an object")
                    continue
                missing = [key for key in TESTS_REQUIRED_KEYS if key not in entry]
                if missing:
                    errors.append(
                        f"{_rel(store_root, path)}[{index}]: missing {', '.join(missing)}"
                    )

    return errors


# --------------------------------------------------------------------------------------------
# 2. Feature values: every attribute=value pair against tagset.yaml.
# --------------------------------------------------------------------------------------------


def check_feature_values(store_root: Path) -> list[str]:
    """Every dictionary `features` pair and every grammar `lhs`/`rhs` attribute=value pair
    resolves to a row in `tagset.yaml`, except the reference-valued attributes in
    REFERENCE_VALUED_ATTRIBUTES. Catches SEM=REL (the wiki's spelling; the real tagset only has
    SEM=RLT, docs/unl-reference/formats/tagset.md)."""
    tagset_keys = _tagset_keys(store_root)
    errors: list[str] = []

    dict_dir = store_root / "dictionary"
    if dict_dir.is_dir():
        for path in sorted(dict_dir.glob("*.yaml")):
            for index, entry in enumerate(_load_yaml_list(path)):
                if not isinstance(entry, dict):
                    continue
                features = entry.get("features")
                if not isinstance(features, dict):
                    continue
                headword = entry.get("headword", f"entry {index}")
                for attr, value in features.items():
                    if attr in REFERENCE_VALUED_ATTRIBUTES:
                        continue
                    if attr not in tagset_keys:
                        errors.append(
                            f"{_rel(store_root, path)}[{index}] {headword!r}: "
                            f"feature attribute {attr!r} is not in tagset.yaml"
                        )
                    if value not in tagset_keys:
                        errors.append(
                            f"{_rel(store_root, path)}[{index}] {headword!r}: "
                            f"feature value {attr}={value!r} is not in tagset.yaml"
                        )

    grammar_dir = store_root / "grammar"
    for kind in GRAMMAR_KINDS:
        path = grammar_dir / f"{kind}.yaml"
        if not path.is_file():
            continue
        for index, rule in enumerate(_load_yaml_list(path)):
            if not isinstance(rule, dict):
                continue
            rule_id = rule.get("id", f"rule {index}")
            for side in ("lhs", "rhs"):
                text = rule.get(side)
                if not isinstance(text, str):
                    continue
                for attr, value in FEATURE_PATTERN.findall(text):
                    if attr in REFERENCE_VALUED_ATTRIBUTES:
                        continue
                    if attr not in tagset_keys:
                        errors.append(
                            f"{_rel(store_root, path)}[{index}] rule {rule_id}: "
                            f"feature attribute {attr!r} in {side} is not in tagset.yaml"
                        )
                    if value not in tagset_keys:
                        errors.append(
                            f"{_rel(store_root, path)}[{index}] rule {rule_id}: "
                            f"feature value {attr}={value!r} in {side} is not in tagset.yaml"
                        )

    return errors


# --------------------------------------------------------------------------------------------
# 3. UW references: printable text (a UCN, a UCL string, or a placeholder regex), never a
#    control character or a wrong type.
# --------------------------------------------------------------------------------------------


def check_uw_references(store_root: Path) -> list[str]:
    """Every dictionary entry's `uw` is well-formed text (issue 18, 2026-09-15: `dictionary.md`'s
    own grammar is `<UW> ::= <text> | <REGULAR EXPRESSION>`, not digits-only; this check can only
    catch a wrong type or a stray control character/newline, not a shape it does not recognise).
    Resolving `uw` to a UCL gloss stays out of scope (issue 17, "Not in scope")."""
    errors: list[str] = []
    dict_dir = store_root / "dictionary"
    if not dict_dir.is_dir():
        return errors
    for path in sorted(dict_dir.glob("*.yaml")):
        for index, entry in enumerate(_load_yaml_list(path)):
            if not isinstance(entry, dict):
                continue
            uw = entry.get("uw")
            headword = entry.get("headword", f"entry {index}")
            if not isinstance(uw, str) or not UW_PATTERN.fullmatch(uw):
                errors.append(
                    f"{_rel(store_root, path)}[{index}] {headword!r}: uw {uw!r} is not "
                    "printable text without control characters"
                )
    return errors


# --------------------------------------------------------------------------------------------
# 4. Rule coverage: every rule id in at least one tests/<name>.yaml entry's `rules` list.
#    Warning at M2, not counted in exit status (SPEC.md §3.3: "error from M3").
# --------------------------------------------------------------------------------------------


def check_rule_coverage(store_root: Path) -> list[str]:
    """Every grammar rule id appears in some tests/<name>.yaml entry's `rules` list. A missing or
    empty tests/ directory (the real case for afr and eng at M2: no test-writer pass has run) is
    not a bug in this check -- it means every rule counts as uncovered, which is exactly the
    starting number M3's stricter gate needs (docs/factory/store-schema.md, "Rule coverage")."""
    grammar_dir = store_root / "grammar"
    rule_ids: list[tuple[str, str]] = []
    for kind in GRAMMAR_KINDS:
        path = grammar_dir / f"{kind}.yaml"
        if not path.is_file():
            continue
        for rule in _load_yaml_list(path):
            if isinstance(rule, dict) and "id" in rule:
                rule_ids.append((kind, rule["id"]))

    covered: set[Any] = set()
    tests_dir = store_root / "tests"
    if tests_dir.is_dir():
        for path in sorted(tests_dir.glob("*.yaml")):
            for entry in _load_yaml_list(path):
                if not isinstance(entry, dict):
                    continue
                for rule_id in entry.get(RULE_COVERAGE_FIELD) or []:
                    covered.add(rule_id)

    return [
        f"grammar/{kind}.yaml: rule {rule_id!r} has no covering test in tests/ "
        "(warning at M2, error from M3)"
        for kind, rule_id in rule_ids
        if rule_id not in covered
    ]


# --------------------------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------------------------


@dataclass
class StoreReport:
    iso3: str
    schema_errors: list[str] = field(default_factory=list)
    feature_errors: list[str] = field(default_factory=list)
    uw_errors: list[str] = field(default_factory=list)
    coverage_warnings: list[str] = field(default_factory=list)

    @property
    def errors(self) -> list[str]:
        """Schema, feature-value and UW failures: real errors at M2. Coverage is a warning
        (SPEC.md §3.3) and is never in this list."""
        return [*self.schema_errors, *self.feature_errors, *self.uw_errors]


def validate_store(store_root: Path) -> StoreReport:
    """Run all four checks against one language store root (`data/languages/<iso3>/`)."""
    return StoreReport(
        iso3=store_root.name,
        schema_errors=check_schema(store_root),
        feature_errors=check_feature_values(store_root),
        uw_errors=check_uw_references(store_root),
        coverage_warnings=check_rule_coverage(store_root),
    )


def format_report(report: StoreReport) -> str:
    """One count per check, per SPEC.md §3.3's validate bullet and this issue's acceptance
    criteria."""
    return "\n".join(
        [
            f"[{report.iso3}] schema errors: {len(report.schema_errors)}",
            f"[{report.iso3}] feature-value errors: {len(report.feature_errors)}",
            f"[{report.iso3}] UW errors: {len(report.uw_errors)}",
            f"[{report.iso3}] uncovered rules: {len(report.coverage_warnings)} "
            + "(warning, not a failure at M2)",
        ]
    )
