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

# `KEY=VALUE` inside a rule's lhs or rhs, in the engine's rule syntax: `+NUM=PLR`, `LEX=Q`,
# `+att=%d`. A bare tag such as `N` or `PLR` is not a pair, and `PLR:=0>"ki";` is not either.
FEATURE_IN_PATTERN = re.compile(r"\b([A-Za-z]{2,5})=([^,;)\s]+)")

# SPEC.md §3.3: the kind of a rule, as it appears in a qualified id, `<iso3>-<kind>-<id>`.
KIND_ABBREVIATION = {
    "analysis.yaml": "ana",
    "disambiguation.yaml": "dis",
    "generation.yaml": "gen",
    "inflection.yaml": "inf",
    "subcategorisation.yaml": "sub",
}


# An id in the qualified form `<iso3>-<kind>-<id>`.
QUALIFIED_ID = re.compile(r"^[a-z]{3}-[a-z]{3}-")


def qualified_id(lang: str, file_name: str, rule_id: object) -> str:
    """The id SPEC.md §3.3 names a rule by. An id that already carries `<iso3>-` is returned as is."""
    text = str(rule_id)
    if text.startswith(f"{lang}-"):
        return text
    return f"{lang}-{KIND_ABBREVIATION.get(file_name, '?')}-{text}"


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
                rule_id = qualified_id(lang, name, rule.get("id", "?"))
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
                # The engine writes an analysis id to the trace as it stands, and adds
                # `<iso3>-gen-`, `<iso3>-inf-` and `<iso3>-dis-` to the others itself, so an
                # analysis id is qualified with its own language and any other id is bare. The
                # split is stated in docs/factory/issues/28-test-cases.md (drafted store) and ADR 0029.
                raw_id = str(rule.get("id") or "")
                if name == "analysis.yaml" and not raw_id.startswith(f"{lang}-ana-"):
                    errors.append(f"{rel}: {rule_id}: id is not prefixed with {lang}-ana-")
                if name != "analysis.yaml" and QUALIFIED_ID.match(raw_id):
                    errors.append(
                        f"{rel}: {rule_id}: id is already qualified, the engine adds the prefix"
                    )
                if rule.get("conditions"):
                    errors.append(f"{rel}: {rule_id}: conditions is not empty; the engine skips it")
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
            where = f"{where_file}: {qualified_id(lang, name, rule.get('id', '?'))}"
            for side in ("lhs", "rhs"):
                for feature, value in FEATURE_IN_PATTERN.findall(str(rule.get(side) or "")):
                    yield where, feature, value


# Names the engine reads that no tagset declares: the sentinel of a clause end, the mark that a
# word has run its paradigm, and the instruction that runs it.
ENGINE_TAGS = frozenset({"STAIL", "inflected", "FLX"})

# One term of a rule's lhs or rhs: an optional operator, then a name. `agt(` and `NS(` are relation
# and node labels, `[ta]` is a literal word, `%x` is a variable.
_TERM = re.compile(r"([\^+\-!?]*)(@?[A-Za-z][A-Za-z0-9]*)(\()?")
_INFLECTION_TAGS = re.compile(r"(?:^|;)([^:;=]+):=")


def _bare_tags(kind: str, text: str) -> list[str]:
    """The tags a rule side writes bare: `N`, `PLR`, `^@pl`, `-NUM`, `FLX`. Pairs are checked apart."""
    if kind == "inflection":
        return [t for group in _INFLECTION_TAGS.findall(text) for t in group.split("&")]
    text = re.sub(r"\[[^\]]*\]", "", text)  # literal words
    text = re.sub(r"%[A-Za-z]+", "%", text)  # variables
    text = FEATURE_IN_PATTERN.sub("", text)  # KEY=VALUE pairs
    return [m.group(2) for m in _TERM.finditer(text) if not m.group(3)]


def _tag_uses(root: Path, lang: str):
    """Yield `(where, tag)` for every bare tag this language's rules write."""
    for name in GRAMMAR_FILES:
        path = root / lang / "grammar" / name
        if not path.is_file():
            continue
        where_file = _rel(root, path)
        for rule in _records(path):
            if not isinstance(rule, dict):
                continue
            where = f"{where_file}: {qualified_id(lang, name, rule.get('id', '?'))}"
            kind = name.removesuffix(".yaml")
            for side in ("lhs", "rhs"):
                if kind == "inflection" and side == "lhs":
                    continue
                for tag in _bare_tags(kind, str(rule.get(side) or "")):
                    yield where, tag


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
            elif not value.startswith(("$", "*", "%")) and value not in tagset[feature]:
                errors.append(f"{where}: {feature} value {value!r} is not in {lang}/tagset.yaml")
        known = set(tagset) | {v for values in tagset.values() for v in values} | ENGINE_TAGS
        for where, tag in _tag_uses(root, lang):
            if tag not in known:
                errors.append(f"{where}: tag {tag!r} is not in {lang}/tagset.yaml")
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
    assert_reports(check_dictionary_entries(tree), "hundon: unknown keys ['gloss']")


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
            '  comment: "Takes the noun before the verb as agent and the word after it'
            ' as object."\n',
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
    assert_reports(check_grammar_rules(tree), "xxb-gen-04: source is not original")


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


def test_grammar_fails_when_an_analysis_id_is_not_qualified(tree: Path):
    # The engine writes an analysis id to the trace as it stands.
    path = tree / "xxa" / "grammar" / "analysis.yaml"
    text = path.read_text(encoding="utf-8")
    mutated = text.replace('- id: "xxa-ana-04"', '- id: "04"', 1)
    assert mutated != text
    path.write_text(mutated, encoding="utf-8")
    assert_reports(check_grammar_rules(tree), "xxa-ana-04: id is not prefixed with xxa-ana-")


def test_grammar_fails_when_a_generation_id_is_already_qualified(tree: Path):
    # The engine adds `xxb-gen-` itself, so a qualified id would trace as `xxb-gen-xxb-gen-04`.
    path = tree / "xxb" / "grammar" / "generation.yaml"
    text = path.read_text(encoding="utf-8")
    mutated = text.replace('- id: "04"', '- id: "xxb-gen-04"', 1)
    assert mutated != text
    path.write_text(mutated, encoding="utf-8")
    assert_reports(check_grammar_rules(tree), "xxb-gen-04: id is already qualified")


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


def test_grammar_fails_when_a_rule_has_conditions(tree: Path):
    # The engine skips `conditions`, so a value there checks nothing. Every fixture rule holds [].
    path = tree / "xxa" / "grammar" / "inflection.yaml"
    text = path.read_text(encoding="utf-8")
    mutated = text.replace("conditions: []", "conditions: {NUM: PLR}", 1)
    assert mutated != text
    path.write_text(mutated, encoding="utf-8")
    assert_reports(check_grammar_rules(tree), "xxa-inf-M1: conditions is not empty")


def test_features_fail_on_a_rule_rhs_outside_the_tagset(tree: Path):
    path = tree / "xxa" / "grammar" / "generation.yaml"
    text = path.read_text(encoding="utf-8")
    mutated = text.replace("+NUM=PLR", "+NUM=DUAL", 1)
    assert mutated != text
    path.write_text(mutated, encoding="utf-8")
    assert_reports(check_features_resolve(tree), "xxa-gen-04: NUM value 'DUAL'")


def test_features_fail_on_a_rule_lhs_outside_the_tagset(tree: Path):
    path = tree / "xxb" / "grammar" / "analysis.yaml"
    text = path.read_text(encoding="utf-8")
    mutated = text.replace('lhs: "(D,att,%d)({N|V},%n)"', 'lhs: "(D,att,%d)({N|Q},%n)"', 1)
    assert mutated != text
    path.write_text(mutated, encoding="utf-8")
    assert_reports(check_features_resolve(tree), "xxb-ana-02: tag 'Q' is not in xxb/tagset.yaml")


def _mutate(tree: Path, lang: str, name: str, old: str, new: str) -> None:
    path = tree / lang / "grammar" / name
    text = path.read_text(encoding="utf-8")
    mutated = text.replace(old, new, 1)
    assert mutated != text, f"{old!r} is not in {lang}/grammar/{name}"
    path.write_text(mutated, encoding="utf-8")


def test_tags_fail_on_a_misspelt_value_in_an_analysis_lhs(tree: Path):
    _mutate(tree, "xxa", "analysis.yaml", '"(N,PLR,^@pl)"', '"(N,PLZ,^@pl)"')
    assert_reports(check_features_resolve(tree), "xxa-ana-04: tag 'PLZ' is not in xxa/tagset.yaml")


def test_tags_fail_on_a_value_no_feature_holds(tree: Path):
    _mutate(
        tree, "xxb", "analysis.yaml", '"(N,%s)({N|^LEX},%o)(V,%v)"', '"(Q,%s)({N|^LEX},%o)(V,%v)"'
    )
    assert_reports(check_features_resolve(tree), "xxb-ana-01: tag 'Q' is not in xxb/tagset.yaml")


def test_tags_fail_on_a_misspelt_feature_name(tree: Path):
    _mutate(tree, "xxa", "analysis.yaml", '"(D,att,%d)(N,%n)"', '"(D,attt,%d)(N,%n)"')
    assert_reports(check_features_resolve(tree), "xxa-ana-02: tag 'attt' is not in xxa/tagset.yaml")


def test_tags_fail_on_a_misspelt_value_in_an_inflection_rhs(tree: Path):
    _mutate(tree, "xxa", "inflection.yaml", 'rhs: "PLR:=0>', 'rhs: "PLZ:=0>')
    assert_reports(check_features_resolve(tree), "xxa-inf-M1: tag 'PLZ' is not in xxa/tagset.yaml")


def test_tags_fail_on_a_misspelt_removal_in_a_generation_rhs(tree: Path):
    _mutate(tree, "xxa", "generation.yaml", "-NUM,+NUM=PLR", "-NUMX,+NUM=PLR")
    assert_reports(check_features_resolve(tree), "xxa-gen-04: tag 'NUMX' is not in xxa/tagset.yaml")


@pytest.mark.parametrize("name", GRAMMAR_FILES)
def test_grammar_fails_on_another_languages_prefix_in_every_grammar_file(tree: Path, name: str):
    # One record with an id carrying xxb's prefix, in an xxa file. The record is otherwise sound.
    kind = name.removesuffix(".yaml")
    abbreviation = KIND_ABBREVIATION[name]
    path = tree / "xxa" / "grammar" / name
    path.write_text(
        LICENCE_PREFIX
        + "x\n"
        + f'- id: "xxb-{abbreviation}-04"\n'
        + f"  kind: {kind}\n"
        + '  lhs: ""\n'
        + '  rhs: ""\n'
        + "  conditions: []\n"
        + '  comment: "A rule."\n'
        + "  source: original\n",
        encoding="utf-8",
    )
    assert_reports(check_grammar_rules(tree), f"xxb-{abbreviation}-04: id")


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
        text.replace("  dictionary_entries: 15", "  dictionary_entries: 16", 1), encoding="utf-8"
    )
    assert_reports(check_meta_counts(tree), "counts.dictionary_entries says 16, disk holds 15")


def test_meta_counts_fail_when_a_rule_is_added_without_touching_meta(tree: Path):
    path = tree / "xxb" / "grammar" / "generation.yaml"
    path.write_text(
        path.read_text(encoding="utf-8")
        + '- id: "13"\n'
        + "  kind: generation\n"
        + '  lhs: "cnt(%x;%y)"\n'
        + '  rhs: "(%y)(%x)"\n'
        + "  conditions: []\n"
        + '  comment: "Writes a modifier in front of the noun it modifies."\n'
        + "  source: original\n",
        encoding="utf-8",
    )
    assert_reports(check_meta_counts(tree), "counts.generation_rules says 12, disk holds 13")


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
    # A09 is `partial` since the owner's ruling of 2026-11-04. Swap it for `ok`: the swap must
    # change the file, or the check below proves nothing.
    path = tree / "xxa" / "tests" / "basic.yaml"
    text = path.read_text(encoding="utf-8")
    head = text[: text.index("- id: A09")]
    tail = text[text.index("- id: A09") :]
    swapped = head + tail.replace("status: partial", "status: ok", 1)
    assert swapped != text
    path.write_text(swapped, encoding="utf-8")
    assert_reports(check_row(tree, "A09"), "A09: status is 'ok', block A says 'partial'")


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
