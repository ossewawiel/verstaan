# SPDX-License-Identifier: MPL-2.0
"""The xxa/xxb fixture pair against the store shape of SPEC.md §3.3.

Issue 04 says every fixture file "validates against the YAML shape by a pytest in
`tools/validate/tests/`" until the real validator of issue 13 lands. This module is that pytest.

docs/standards/testing.md: a gate is not proven by watching it pass. The fixtures are already
correct, so every check here runs twice. Once over the real tree, where it must report nothing.
Once over a `tmp_path` copy with one thing broken on purpose, where it must report that exact
failure. The checking logic is therefore a pure function of a directory path, never of the
working tree, and no test in this file writes inside the repository.

The expected values in the row tests come from block A of `docs/factory/issues/04-test-cases.md`
and from nowhere else. Nothing here runs the engine; the engine returns `Status::not_implemented`
and block A becomes GoogleTest cases at M3, not here.
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES = REPO_ROOT / "tests" / "fixtures" / "languages"
TABLE_PATH = REPO_ROOT / "docs" / "factory" / "issues" / "04-test-cases.md"

LANGUAGES = ("xxa", "xxb")

# SPEC.md §4: the licence header line that opens every store file. The fixture is original, so
# its `Source:` names the fixture rather than the archive manifest.
LICENCE_PREFIX = "# Licence: CC BY-SA 4.0. Source: "

# SPEC.md §3.3.
GRAMMAR_FILES = (
    "analysis.yaml",
    "disambiguation.yaml",
    "generation.yaml",
    "inflection.yaml",
    "subcategorisation.yaml",
)

# SPEC.md §3.2, the importer's dictionary entry.
DICTIONARY_KEYS = {
    "headword",
    "id",
    "uw",
    "features",
    "lang",
    "frequency",
    "priority",
    "source",
}

# SPEC.md §3.2, the importer's grammar rule.
RULE_KEYS = {"id", "kind", "lhs", "rhs", "conditions", "comment", "source"}
RULE_KINDS = {
    "analysis",
    "generation",
    "inflection",
    "subcategorisation",
    "disambiguation",
    "default",
}

CORPUS_KEYS = ("sentence", "unl", "source")
META_COUNT_KEYS = (
    "dictionary_entries",
    "analysis_rules",
    "generation_rules",
    "inflection_rules",
    "corpus_sentences",
    "test_rows",
)

# `[LEX:N, PAR:P1]:1` and `[LEX:D, ATT:$a]` inside a rule's lhs or rhs.
FEATURE_IN_PATTERN = re.compile(r"\b([A-Z]{2,5}):([^,\]\s]+)")


# --------------------------------------------------------------------------------------------
# Loading
# --------------------------------------------------------------------------------------------


def yaml_files(root: Path) -> list[Path]:
    return sorted(p for p in root.rglob("*.yaml") if p.is_file())


def _safe_load(path: Path):
    """Parsed YAML, or None when the file will not decode or will not parse.

    `check_files_parse` is the one check that reports those two failures. Every other check
    skips a file it cannot read so that one broken file produces one error and not eight.
    """
    try:
        return yaml.safe_load(path.read_bytes().decode("utf-8"))
    except (UnicodeDecodeError, yaml.YAMLError):
        return None


def _records(path: Path) -> list[dict]:
    data = _safe_load(path)
    return data if isinstance(data, list) else []


def _rel(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


# --------------------------------------------------------------------------------------------
# The checks. Each is a pure function of a directory path and returns a list of error strings.
# --------------------------------------------------------------------------------------------


def check_layout(root: Path) -> list[str]:
    """The store layout of SPEC.md §3.3 is present for each language."""
    errors: list[str] = []
    for lang in LANGUAGES:
        lang_dir = root / lang
        if not lang_dir.is_dir():
            errors.append(f"{lang}: missing language directory")
            continue
        for name in ("meta.yaml", "tagset.yaml", "corpus/basic.yaml", "tests/basic.yaml"):
            if not (lang_dir / name).is_file():
                errors.append(f"{lang}/{name}: missing")
        for name in GRAMMAR_FILES:
            if not (lang_dir / "grammar" / name).is_file():
                errors.append(f"{lang}/grammar/{name}: missing")
        shards = sorted((lang_dir / "dictionary").glob("*.yaml"))
        if not shards:
            errors.append(f"{lang}/dictionary: no dictionary shard")
        for shard in shards:
            if not re.fullmatch(r"[a-z]", shard.stem):
                errors.append(f"{_rel(root, shard)}: shard name is not a single letter a-z")
    return errors


def check_files_parse(root: Path) -> list[str]:
    """Every file is UTF-8, parses as YAML, and opens with the licence header of SPEC.md §4."""
    errors: list[str] = []
    for path in yaml_files(root):
        rel = _rel(root, path)
        try:
            text = path.read_bytes().decode("utf-8")
        except UnicodeDecodeError:
            errors.append(f"{rel}: not valid UTF-8")
            continue
        try:
            yaml.safe_load(text)
        except yaml.YAMLError:
            errors.append(f"{rel}: does not parse as YAML")
            continue
        first = text.splitlines()[0] if text.splitlines() else ""
        if not first.startswith(LICENCE_PREFIX):
            errors.append(f"{rel}: first line is not the licence header")
    return errors


def check_dictionary_entries(root: Path) -> list[str]:
    """Every entry carries the SPEC.md §3.2 keys, its own language, and a source."""
    errors: list[str] = []
    for lang in LANGUAGES:
        for shard in sorted((root / lang / "dictionary").glob("*.yaml")):
            rel = _rel(root, shard)
            entries = _records(shard)
            if not entries:
                errors.append(f"{rel}: no dictionary entries")
            for entry in entries:
                if not isinstance(entry, dict):
                    errors.append(f"{rel}: entry is not a mapping")
                    continue
                name = entry.get("headword", "?")
                missing = DICTIONARY_KEYS - set(entry)
                extra = set(entry) - DICTIONARY_KEYS
                if missing:
                    errors.append(f"{rel}: {name}: missing keys {sorted(missing)}")
                if extra:
                    errors.append(f"{rel}: {name}: unknown keys {sorted(extra)}")
                if not entry.get("source"):
                    errors.append(f"{rel}: {name}: no source")
                if entry.get("lang") != lang:
                    errors.append(f"{rel}: {name}: lang is not {lang}")
                if isinstance(name, str) and name and name[0].lower() != shard.stem:
                    errors.append(f"{rel}: {name}: wrong shard for its first letter")
    return errors


def check_grammar_rules(root: Path) -> list[str]:
    """Every rule has the SPEC.md §3.2 keys, a comment, and `source: original`."""
    errors: list[str] = []
    for lang in LANGUAGES:
        for name in GRAMMAR_FILES:
            path = root / lang / "grammar" / name
            rel = _rel(root, path) if path.is_file() else f"{lang}/grammar/{name}"
            if not path.is_file():
                continue
            for rule in _records(path):
                if not isinstance(rule, dict):
                    errors.append(f"{rel}: rule is not a mapping")
                    continue
                rule_id = rule.get("id", "?")
                missing = RULE_KEYS - set(rule)
                extra = set(rule) - RULE_KEYS
                if missing:
                    errors.append(f"{rel}: {rule_id}: missing keys {sorted(missing)}")
                if extra:
                    errors.append(f"{rel}: {rule_id}: unknown keys {sorted(extra)}")
                kind = rule.get("kind")
                if kind not in RULE_KINDS:
                    errors.append(f"{rel}: {rule_id}: kind {kind!r} is not a SPEC §3.2 kind")
                elif f"{kind}.yaml" != name:
                    errors.append(f"{rel}: {rule_id}: kind {kind!r} does not match the file")
                if not str(rule.get("comment") or "").strip():
                    errors.append(f"{rel}: {rule_id}: empty comment")
                if rule.get("source") != "original":
                    errors.append(f"{rel}: {rule_id}: source is not original")
                if not str(rule.get("id") or "").startswith(f"{lang}-"):
                    errors.append(f"{rel}: {rule_id}: id is not prefixed with {lang}-")
    return errors


def _tagset(root: Path, lang: str) -> dict[str, set[str]]:
    table: dict[str, set[str]] = {}
    for record in _records(root / lang / "tagset.yaml"):
        if isinstance(record, dict) and "feature" in record:
            table[str(record["feature"])] = {str(v) for v in record.get("values") or []}
    return table


def _feature_uses(root: Path, lang: str):
    """Yield `(where, feature, value)` for every feature this language names anywhere."""
    for shard in sorted((root / lang / "dictionary").glob("*.yaml")):
        where = _rel(root, shard)
        for entry in _records(shard):
            if isinstance(entry, dict) and isinstance(entry.get("features"), dict):
                for feature, value in entry["features"].items():
                    yield f"{where}: {entry.get('headword', '?')}", str(feature), str(value)
    for name in GRAMMAR_FILES:
        path = root / lang / "grammar" / name
        if not path.is_file():
            continue
        where_file = _rel(root, path)
        for rule in _records(path):
            if not isinstance(rule, dict):
                continue
            where = f"{where_file}: {rule.get('id', '?')}"
            for feature, value in (rule.get("conditions") or {}).items():
                yield where, str(feature), str(value)
            for side in ("lhs", "rhs"):
                for feature, value in FEATURE_IN_PATTERN.findall(str(rule.get(side) or "")):
                    yield where, feature, value


def check_features_resolve(root: Path) -> list[str]:
    """Every feature name and value used in a language resolves against its own tagset."""
    errors: list[str] = []
    for lang in LANGUAGES:
        tagset = _tagset(root, lang)
        if not tagset:
            errors.append(f"{lang}/tagset.yaml: no features")
            continue
        for where, feature, value in _feature_uses(root, lang):
            if feature not in tagset:
                errors.append(f"{where}: feature {feature} is not in {lang}/tagset.yaml")
            elif not value.startswith(("$", "*")) and value not in tagset[feature]:
                errors.append(f"{where}: {feature} value {value!r} is not in {lang}/tagset.yaml")
    return errors


def check_corpus(root: Path) -> list[str]:
    """`corpus/basic.yaml` holds the five sentences the acceptance criteria name."""
    errors: list[str] = []
    for lang in LANGUAGES:
        path = root / lang / "corpus" / "basic.yaml"
        if not path.is_file():
            continue
        rel = _rel(root, path)
        sentences = _records(path)
        if len(sentences) != 5:
            errors.append(f"{rel}: {len(sentences)} sentences, expected 5")
        for record in sentences:
            if not isinstance(record, dict):
                errors.append(f"{rel}: sentence is not a mapping")
                continue
            name = record.get("id", "?")
            for key in CORPUS_KEYS:
                if not record.get(key):
                    errors.append(f"{rel}: {name}: missing {key}")
    return errors


def _count_on_disk(root: Path, lang: str) -> dict[str, int]:
    return {
        "dictionary_entries": sum(
            len(_records(p)) for p in sorted((root / lang / "dictionary").glob("*.yaml"))
        ),
        "analysis_rules": len(_records(root / lang / "grammar" / "analysis.yaml")),
        "generation_rules": len(_records(root / lang / "grammar" / "generation.yaml")),
        "inflection_rules": len(_records(root / lang / "grammar" / "inflection.yaml")),
        "corpus_sentences": len(_records(root / lang / "corpus" / "basic.yaml")),
        "test_rows": len(_records(root / lang / "tests" / "basic.yaml")),
    }


def check_meta_counts(root: Path) -> list[str]:
    """`meta.yaml` agrees with what is on disk."""
    errors: list[str] = []
    for lang in LANGUAGES:
        meta = _safe_load(root / lang / "meta.yaml")
        if not isinstance(meta, dict):
            errors.append(f"{lang}/meta.yaml: not a mapping")
            continue
        if meta.get("iso3") != lang:
            errors.append(f"{lang}/meta.yaml: iso3 is not {lang}")
        counts = meta.get("counts")
        if not isinstance(counts, dict):
            errors.append(f"{lang}/meta.yaml: no counts")
            continue
        actual = _count_on_disk(root, lang)
        for key in META_COUNT_KEYS:
            if key not in counts:
                errors.append(f"{lang}/meta.yaml: counts is missing {key}")
            elif counts[key] != actual[key]:
                errors.append(
                    f"{lang}/meta.yaml: counts.{key} says {counts[key]}, disk holds {actual[key]}"
                )
    return errors


# --------------------------------------------------------------------------------------------
# Block A of docs/factory/issues/04-test-cases.md
# --------------------------------------------------------------------------------------------


def _unwrap(cell: str) -> str:
    """``kano`` and `*(empty string)*` as the engine would see them."""
    cell = cell.strip()
    if cell == "*(empty string)*":
        return ""
    if cell.startswith("`") and cell.endswith("`"):
        return cell[1:-1]
    return cell


def read_block_a(table_path: Path) -> dict[str, dict[str, str]]:
    """Block A of the test-cases file, keyed by row id. This is the source of truth."""
    rows: dict[str, dict[str, str]] = {}
    in_block = False
    for line in table_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            in_block = line.startswith("## Block A")
            continue
        if not in_block or not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 6 or not re.fullmatch(r"A\d\d", cells[0]):
            continue
        rows[cells[0]] = {
            "id": cells[0],
            "input": _unwrap(cells[1]),
            "expected": _unwrap(cells[2]),
            "status": cells[3],
            "direction": cells[4],
            "register": cells[5],
        }
    return rows


def read_test_rows(root: Path) -> dict[str, dict]:
    """Every row in `tests/fixtures/languages/*/tests/basic.yaml`, keyed by row id."""
    rows: dict[str, dict] = {}
    for lang in LANGUAGES:
        for record in _records(root / lang / "tests" / "basic.yaml"):
            if isinstance(record, dict):
                rows[str(record.get("id"))] = record
    return rows


def check_test_rows_match_table(root: Path, table_path: Path = TABLE_PATH) -> list[str]:
    """The YAML rows say what block A says. The table wins; the YAML is corrected to it."""
    errors: list[str] = []
    table = read_block_a(table_path)
    if not table:
        return ["04-test-cases.md: block A holds no rows"]
    yaml_rows = read_test_rows(root)
    for row_id, want in sorted(table.items()):
        got = yaml_rows.get(row_id)
        if got is None:
            errors.append(f"{row_id}: in block A, absent from tests/basic.yaml")
            continue
        for key in ("input", "expected", "status", "direction", "register"):
            if str(got.get(key, "")) != want[key]:
                errors.append(
                    f"{row_id}: {key} is {str(got.get(key, ''))!r}, block A says {want[key]!r}"
                )
        source_lang = want["direction"].split("->")[0]
        if str(got.get("id")) not in {
            str(r.get("id")) for r in _records(root / source_lang / "tests" / "basic.yaml")
        }:
            errors.append(f"{row_id}: filed under the wrong language for {want['direction']}")
    for row_id in sorted(set(yaml_rows) - set(table)):
        errors.append(f"{row_id}: in tests/basic.yaml, absent from block A")
    return errors


ALL_CHECKS = (
    check_layout,
    check_files_parse,
    check_dictionary_entries,
    check_grammar_rules,
    check_features_resolve,
    check_corpus,
    check_meta_counts,
    check_test_rows_match_table,
)


def check_store(root: Path) -> list[str]:
    """Every check, in order. The whole shape of SPEC.md §3.3 for the fixture pair."""
    errors: list[str] = []
    for check in ALL_CHECKS:
        errors.extend(check(root))
    return errors


# --------------------------------------------------------------------------------------------
# The real tree
# --------------------------------------------------------------------------------------------


@pytest.mark.parametrize("check", ALL_CHECKS, ids=lambda c: c.__name__)
def test_real_fixture_tree_passes_each_check(check):
    assert check(FIXTURES) == []


def test_real_fixture_tree_passes_every_check_together():
    assert check_store(FIXTURES) == []


def test_block_a_holds_seventeen_rows():
    # The acceptance criteria ask for at least eight; the rule-author wrote seventeen.
    assert len(read_block_a(TABLE_PATH)) == 17


# One test per row of block A. The row id is in the test name, and the expected text comes
# from the table, never from the engine.
BLOCK_A = read_block_a(TABLE_PATH)


def check_row(root: Path, row_id: str, table_path: Path = TABLE_PATH) -> list[str]:
    """One row of block A against the YAML that must carry it."""
    want = read_block_a(table_path)[row_id]
    source_lang = want["direction"].split("->")[0]
    rows = {str(r.get("id")): r for r in _records(root / source_lang / "tests" / "basic.yaml")}
    if row_id not in rows:
        return [f"{row_id}: not in {source_lang}/tests/basic.yaml"]
    got = rows[row_id]
    return [
        f"{row_id}: {key} is {str(got.get(key, ''))!r}, block A says {want[key]!r}"
        for key in ("input", "expected", "status", "direction", "register")
        if str(got.get(key, "")) != want[key]
    ]


@pytest.mark.parametrize("row_id", sorted(BLOCK_A), ids=sorted(BLOCK_A))
def test_row_matches_block_a(row_id):
    assert check_row(FIXTURES, row_id) == []


# --------------------------------------------------------------------------------------------
# Mutation. docs/standards/testing.md: break the thing the check checks, watch the check fail.
# Every mutation happens in a tmp_path copy. Nothing here writes inside the repository.
# --------------------------------------------------------------------------------------------


@pytest.fixture
def tree(tmp_path: Path) -> Path:
    """An untouched copy of the fixture pair, safe to break."""
    copy = tmp_path / "languages"
    shutil.copytree(FIXTURES, copy)
    return copy


def assert_reports(errors: list[str], needle: str) -> None:
    assert any(needle in e for e in errors), f"no error mentioning {needle!r} in {errors}"


def test_copy_is_clean_before_any_mutation(tree: Path):
    # Without this the mutation tests below prove only that the copy is broken, not that the
    # mutation broke it.
    assert check_store(tree) == []


def test_layout_fails_when_a_grammar_file_is_missing(tree: Path):
    (tree / "xxa" / "grammar" / "inflection.yaml").unlink()
    assert_reports(check_layout(tree), "xxa/grammar/inflection.yaml: missing")


def test_layout_fails_when_the_dictionary_is_empty(tree: Path):
    for shard in (tree / "xxb" / "dictionary").glob("*.yaml"):
        shard.unlink()
    assert_reports(check_layout(tree), "xxb/dictionary: no dictionary shard")


def test_files_parse_fails_on_bytes_that_are_not_utf8(tree: Path):
    (tree / "xxa" / "meta.yaml").write_bytes(b"# Licence: CC BY-SA 4.0. Source: x\nname: \xff\n")
    assert_reports(check_files_parse(tree), "xxa/meta.yaml: not valid UTF-8")


def test_files_parse_fails_on_broken_yaml(tree: Path):
    path = tree / "xxb" / "tagset.yaml"
    path.write_text(f"{LICENCE_PREFIX}x\n- feature: [LEX\n", encoding="utf-8")
    assert_reports(check_files_parse(tree), "xxb/tagset.yaml: does not parse as YAML")


def test_files_parse_fails_when_the_licence_header_is_gone(tree: Path):
    path = tree / "xxa" / "corpus" / "basic.yaml"
    lines = path.read_text(encoding="utf-8").splitlines()
    path.write_text("\n".join(lines[1:]) + "\n", encoding="utf-8")
    assert_reports(check_files_parse(tree), "xxa/corpus/basic.yaml: first line is not")


def test_dictionary_fails_when_an_entry_loses_its_source(tree: Path):
    path = tree / "xxa" / "dictionary" / "k.yaml"
    text = path.read_text(encoding="utf-8")
    path.write_text(
        text.replace("  source: {origin: invented, issue: 4}\n", "", 1), encoding="utf-8"
    )
    assert_reports(check_dictionary_entries(tree), "kano: missing keys ['source']")


def test_dictionary_fails_when_an_entry_gains_an_unknown_key(tree: Path):
    path = tree / "xxb" / "dictionary" / "h.yaml"
    path.write_text(path.read_text(encoding="utf-8") + "  gloss: dog\n", encoding="utf-8")
    assert_reports(check_dictionary_entries(tree), "hundo: unknown keys ['gloss']")


def test_dictionary_fails_when_an_entry_sits_in_the_wrong_shard(tree: Path):
    src = tree / "xxa" / "dictionary" / "z.yaml"
    (tree / "xxa" / "dictionary" / "q.yaml").write_text(
        src.read_text(encoding="utf-8"), encoding="utf-8"
    )
    src.unlink()
    assert_reports(check_dictionary_entries(tree), "zuma: wrong shard for its first letter")


def test_grammar_fails_when_a_rule_loses_its_comment(tree: Path):
    path = tree / "xxa" / "grammar" / "analysis.yaml"
    text = path.read_text(encoding="utf-8")
    path.write_text(
        text.replace(
            '  comment: "Takes the noun before the verb as the agent and the noun after it'
            ' as the object."\n',
            '  comment: ""\n',
            1,
        ),
        encoding="utf-8",
    )
    assert_reports(check_grammar_rules(tree), "xxa-ana-01: empty comment")


def test_grammar_fails_when_a_rule_loses_source_original(tree: Path):
    path = tree / "xxb" / "grammar" / "generation.yaml"
    text = path.read_text(encoding="utf-8")
    path.write_text(
        text.replace("  source: original\n", "  source: guessed\n", 1), encoding="utf-8"
    )
    assert_reports(check_grammar_rules(tree), "xxb-gen-01: source is not original")


def test_grammar_fails_on_a_kind_outside_spec_3_2(tree: Path):
    path = tree / "xxa" / "grammar" / "inflection.yaml"
    text = path.read_text(encoding="utf-8")
    path.write_text(
        text.replace("  kind: inflection\n", "  kind: morphology\n", 1), encoding="utf-8"
    )
    assert_reports(check_grammar_rules(tree), "kind 'morphology' is not a SPEC §3.2 kind")


def test_grammar_fails_when_a_kind_does_not_match_its_file(tree: Path):
    path = tree / "xxa" / "grammar" / "generation.yaml"
    text = path.read_text(encoding="utf-8")
    path.write_text(text.replace("  kind: generation\n", "  kind: analysis\n", 1), encoding="utf-8")
    assert_reports(check_grammar_rules(tree), "kind 'analysis' does not match the file")


def test_features_fail_on_a_value_outside_the_tagset(tree: Path):
    path = tree / "xxa" / "dictionary" / "m.yaml"
    text = path.read_text(encoding="utf-8")
    path.write_text(text.replace("NUM: SNG", "NUM: DUAL", 1), encoding="utf-8")
    assert_reports(check_features_resolve(tree), "NUM value 'DUAL' is not in xxa/tagset.yaml")


def test_features_fail_on_a_name_outside_the_tagset(tree: Path):
    path = tree / "xxb" / "dictionary" / "v.yaml"
    text = path.read_text(encoding="utf-8")
    path.write_text(text.replace("POS: VER", "GEN: MAS", 1), encoding="utf-8")
    assert_reports(check_features_resolve(tree), "feature GEN is not in xxb/tagset.yaml")


def test_features_fail_on_a_rule_condition_outside_the_tagset(tree: Path):
    path = tree / "xxa" / "grammar" / "inflection.yaml"
    text = path.read_text(encoding="utf-8")
    path.write_text(text.replace("NUM: PLR", "NUM: DUAL", 1), encoding="utf-8")
    assert_reports(check_features_resolve(tree), "xxa-inf-01: NUM value 'DUAL'")


def test_features_fail_on_a_rule_lhs_outside_the_tagset(tree: Path):
    path = tree / "xxb" / "grammar" / "analysis.yaml"
    text = path.read_text(encoding="utf-8")
    path.write_text(
        text.replace('lhs: "[LEX:N]:1 [LEX:N]:2 [LEX:V]:3"', 'lhs: "[LEX:Q]:1"', 1),
        encoding="utf-8",
    )
    assert_reports(check_features_resolve(tree), "xxb-ana-01: LEX value 'Q'")


def test_corpus_fails_when_a_sentence_is_dropped(tree: Path):
    path = tree / "xxa" / "corpus" / "basic.yaml"
    text = path.read_text(encoding="utf-8")
    path.write_text(text[: text.index("- id: xxa-c5")], encoding="utf-8")
    assert_reports(check_corpus(tree), "xxa/corpus/basic.yaml: 4 sentences, expected 5")


def test_corpus_fails_when_a_sentence_loses_its_unl(tree: Path):
    path = tree / "xxb" / "corpus" / "basic.yaml"
    text = path.read_text(encoding="utf-8")
    start = text.index("  unl: |")
    end = text.index("  note:", start)
    path.write_text(text[:start] + text[end:], encoding="utf-8")
    assert_reports(check_corpus(tree), "xxb-c1: missing unl")


def test_meta_counts_fail_when_disk_and_meta_disagree(tree: Path):
    path = tree / "xxa" / "meta.yaml"
    text = path.read_text(encoding="utf-8")
    path.write_text(
        text.replace("  dictionary_entries: 10", "  dictionary_entries: 11", 1), encoding="utf-8"
    )
    assert_reports(check_meta_counts(tree), "counts.dictionary_entries says 11, disk holds 10")


def test_meta_counts_fail_when_a_rule_is_added_without_touching_meta(tree: Path):
    path = tree / "xxb" / "grammar" / "generation.yaml"
    path.write_text(
        path.read_text(encoding="utf-8")
        + "- id: xxb-gen-04\n"
        + "  kind: generation\n"
        + '  lhs: "mod(1,2)"\n'
        + '  rhs: "[2] [1]"\n'
        + "  conditions: {}\n"
        + '  comment: "Writes a modifier in front of the noun it modifies."\n'
        + "  source: original\n",
        encoding="utf-8",
    )
    assert_reports(check_meta_counts(tree), "counts.generation_rules says 3, disk holds 4")


def test_table_check_fails_when_a_row_disagrees_with_block_a(tree: Path):
    path = tree / "xxa" / "tests" / "basic.yaml"
    text = path.read_text(encoding="utf-8")
    path.write_text(
        text.replace('expected: "hundo kinda vidra"', 'expected: "hundo vidra kinda"', 1),
        encoding="utf-8",
    )
    assert_reports(
        check_test_rows_match_table(tree), "A01: expected is 'hundo vidra kinda', block A says"
    )


def test_row_check_fails_when_that_one_row_is_changed(tree: Path):
    # The per-row test above passes on the real tree. This proves it is a check and not a
    # constant: change A05's expected text and the A05 check, and only that one, goes red.
    path = tree / "xxa" / "tests" / "basic.yaml"
    text = path.read_text(encoding="utf-8")
    path.write_text(
        text.replace('expected: "mo hundo kinda vidra"', 'expected: "hundo mo kinda vidra"', 1),
        encoding="utf-8",
    )
    assert_reports(check_row(tree, "A05"), "A05: expected is 'hundo mo kinda vidra'")
    assert check_row(tree, "A07") == []


def test_row_check_fails_when_a_status_is_changed(tree: Path):
    path = tree / "xxb" / "tests" / "basic.yaml"
    text = path.read_text(encoding="utf-8")
    head = text[: text.index("- id: A13")]
    tail = text[text.index("- id: A13") :]
    path.write_text(head + tail.replace("status: no_parse", "status: ok", 1), encoding="utf-8")
    assert_reports(check_row(tree, "A13"), "A13: status is 'ok', block A says 'no_parse'")


def test_table_check_fails_when_a_row_is_missing(tree: Path):
    path = tree / "xxb" / "tests" / "basic.yaml"
    text = path.read_text(encoding="utf-8")
    path.write_text(text[: text.index("- id: A17")], encoding="utf-8")
    assert_reports(check_test_rows_match_table(tree), "A17: in block A, absent from")


def test_table_check_fails_when_a_row_has_no_row_in_block_a(tree: Path):
    path = tree / "xxa" / "tests" / "basic.yaml"
    path.write_text(
        path.read_text(encoding="utf-8")
        + "- id: A99\n"
        + '  input: "kano zuma"\n'
        + '  expected: ""\n'
        + "  direction: xxa->xxb\n"
        + "  status: no_parse\n"
        + "  tier: basic\n"
        + "  register: neutral\n"
        + "  source: {origin: invented, issue: 4}\n",
        encoding="utf-8",
    )
    assert_reports(check_test_rows_match_table(tree), "A99: in tests/basic.yaml, absent from")


def test_table_check_fails_when_a_row_is_filed_under_the_wrong_language(tree: Path):
    xxa = tree / "xxa" / "tests" / "basic.yaml"
    xxb = tree / "xxb" / "tests" / "basic.yaml"
    text = xxa.read_text(encoding="utf-8")
    block = text[text.index("- id: A01") : text.index("- id: A03")]
    xxa.write_text(text.replace(block, "", 1), encoding="utf-8")
    xxb.write_text(xxb.read_text(encoding="utf-8") + block, encoding="utf-8")
    assert_reports(
        check_test_rows_match_table(tree), "A01: filed under the wrong language for xxa->xxb"
    )
