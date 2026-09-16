# SPDX-License-Identifier: MPL-2.0
"""Dictionary importer: AD/GD zip exports into `data/languages/<iso3>/dictionary/<a-z>.yaml`.

SPEC.md §3.2 (importer contract), §3.3 (store layout), §4 (data rules). Line grammar:
`docs/unl-reference/formats/dictionary.md`, parsed against the real archive files, not the
wiki's formal syntax where the two disagree -- including a disagreement dictionary.md does not
itself name: the archive's `*_ucl.zip` export for a language actually holds the opaque UCN
numeric code in its `UW` field, and the matching `*_ucn.zip` export holds the human-readable UCL
string. This module always reads the `_ucl`-named zip for the UCN content the schema wants; see
`tools/importer/test_dictionary.py::test_afrikaans_worked_example_matches_dictionary_md` for the
`aan`/400068368 entry that proves it (uw stays the opaque UCN string, never resolved to UCL).

Every physical line the archive ships is accounted for: it becomes one parsed entry, or one
record in `data/languages/<iso3>/_unparsed.txt` with the raw line and a one-sentence reason.
Nothing is silently dropped (SPEC.md §3.2).
"""

from __future__ import annotations

import argparse
import re
import sys
import zipfile
from collections.abc import Iterator, Sequence
from dataclasses import dataclass, field
from pathlib import Path

import yaml

LICENCE_HEADER = "# Licence: CC BY-SA 4.0. Source: UNL Archive, see data/archive/manifest.jsonl\n"

# docs/unl-reference/formats/dictionary.md, "Where the exports disagree with the wiki": the
# archive's FLG is two letters. The store's folder names are ISO 639-3 (SPEC.md §3.2).
FLG_TO_ISO3 = {"af": "afr", "en": "eng"}

# `[NLW]{ID}"UW"(FEATURES)<FLG,FRE,PRI>;COMMENT`. Order of the last triple is language, frequency,
# priority (dictionary.md's own prose and worked-example table), not the priority-then-frequency
# order its "Formal syntax" block states -- a second disagreement the page does not call out by
# name, proven by the `aan` worked example: `<af,2,0>` is frequency 2, priority 0.
_ENTRY_RE = re.compile(
    r"^\[(?P<nlw>.*)\]\s*\{\s*(?P<id>\d+)\s*\}\s*"
    r'"(?P<uw>[^"]*)"\s*'
    r"\((?P<features>.*)\)\s*"
    r"<\s*(?P<flg>[A-Za-z]{2,3})\s*,\s*(?P<fre>\d+)\s*,\s*(?P<pri>\d+)\s*>\s*;"
    r"(?P<comment>.*)$"
)

# `#01(...)`, `#02(...)`: a feature list scoped to one sub-word of a compound NLW.
_SUBWORD_RE = re.compile(r"^#(?P<subid>\d+)\((?P<inner>.*)\)$", re.DOTALL)
# A rule-list feature, e.g. `FLX(PLR:=0>"s";)`: a bare name immediately followed by `(...)`.
_RULE_LIST_RE = re.compile(r"^(?P<name>[A-Za-z][A-Za-z0-9]*)\((?P<inner>.*)\)$", re.DOTALL)
# `ATTRIBUTE=VALUE`.
_ATTR_VALUE_RE = re.compile(r"^(?P<attr>[A-Za-z][A-Za-z0-9]*)=(?P<value>.*)$", re.DOTALL)

_ASCII_LOWER = "abcdefghijklmnopqrstuvwxyz"


@dataclass
class UnparsedLine:
    """One line `data/languages/<iso3>/_unparsed.txt` records: never dropped silently."""

    archive_path: str
    line: int
    raw: str
    reason: str


@dataclass
class ImportStats:
    """Counts an importer run reports, per language. `input_lines == parsed + unparsed`."""

    input_lines: int = 0
    parsed_entries: int = 0
    unparsed_lines: int = 0
    shards_written: list[str] = field(default_factory=list)


def _split_top_level(text: str) -> list[str]:
    """Split `text` on commas that sit outside any `(...)` nesting.

    A `FEATURE LIST` is comma-separated, but a `RULE LIST` feature (`FLX(...)`) and a sub-word
    scope (`#01(...)`) both hold their own commas inside a parenthesis. Splitting blindly on every
    comma would shred those. This tracks paren depth instead.
    """
    parts: list[str] = []
    depth = 0
    current: list[str] = []
    for ch in text:
        if ch == "(":
            depth += 1
            current.append(ch)
        elif ch == ")":
            depth -= 1
            current.append(ch)
        elif ch == "," and depth == 0:
            parts.append("".join(current))
            current = []
        else:
            current.append(ch)
    parts.append("".join(current))
    return parts


def parse_feature_list(text: str) -> dict[str, str] | None:
    """The `FEATURE LIST` field as an attribute-value map, or `None` if it is empty.

    `#01(...)` and `#02(...)` (sub-word scope, `dictionary.md`'s `"#" <SUBNLWID> <FEATURE LIST>`)
    hold a nested feature list of their own, recursively parsed by this same function and merged
    straight into the result -- never kept as a bogus `#01`/`#02` attribute (issue 169: that
    placeholder key is not in any tagset and the archive never means it as one). A later sub-word
    can legitimately overwrite an earlier one's attribute (`#02(BF=up)` overwrites the compound's
    own top-level `BF` with the second word's base form); `features` is a flat map
    (`tools/validate/schema/dictionary-entry.schema.json`), so this is the only lossless place
    left to put it once the placeholder key is gone. A rule-list feature (`FLX(...)`) becomes
    `{"FLX": "<inner>"}`. A bare `ATTRIBUTE=VALUE` feature becomes `{ATTRIBUTE: VALUE}`.

    A `VALUE` can itself contain a literal comma the archive never escapes -- some headwords do,
    e.g. `[Bouillon, België]`'s `LEMMA=Bouillon, België`. `_split_top_level` cannot tell that
    comma from a separator between features (it is outside every paren, same as a real
    separator), so it splits the value in two; the second half, `België`, then matches no
    feature shape at all. Issue 169: rather than drop it or treat it as a bare feature -- the old
    behaviour, which put the headword text `België`/`bok`/`Iowa`/`Louisiana` in the *attribute*
    slot -- a shapeless token straight after an `ATTRIBUTE=VALUE` token is glued back onto that
    value with `", "`, reconstructing the original comma exactly.

    A feature with neither `=` nor a trailing `(...)` (the formal syntax's bare `<VALUE>`
    alternative, not seen in any real AD/GD line this importer was built against, and not
    reachable right after an `ATTRIBUTE=VALUE` token now that case is claimed above) becomes
    `{VALUE: VALUE}`, so it is never lost.
    """
    features: dict[str, str] = {}
    pending_attr: str | None = None
    pending_parts: list[str] = []

    def flush_pending() -> None:
        nonlocal pending_attr, pending_parts
        if pending_attr is not None:
            features[pending_attr] = ", ".join(pending_parts)
            pending_attr = None
            pending_parts = []

    for token in _split_top_level(text):
        token = token.strip()
        if not token:
            continue
        match = _SUBWORD_RE.match(token)
        if match:
            flush_pending()
            features.update(parse_feature_list(match.group("inner")) or {})
            continue
        match = _RULE_LIST_RE.match(token)
        if match:
            flush_pending()
            features[match.group("name")] = match.group("inner").strip()
            continue
        match = _ATTR_VALUE_RE.match(token)
        if match:
            flush_pending()
            pending_attr = match.group("attr")
            pending_parts = [match.group("value").strip()]
            continue
        if pending_attr is not None:
            pending_parts.append(token)
            continue
        features[token] = token
    flush_pending()
    return features or None


def parse_line(raw: str) -> tuple[dict | None, str | None]:
    """One archive dictionary line, into a partial entry (`nlw, id, uw, features, flg, fre, pri`)
    or `(None, reason)`. Does not know its own `source` or the store's `lang`; the caller adds
    those, since only the caller knows which archive file and language this line came from.
    """
    text = raw.strip()
    if not text:
        return None, "blank line"
    if text.startswith(";"):
        return None, "archive header/comment line (starts with ';'), not a dictionary entry"
    match = _ENTRY_RE.match(text)
    if not match:
        return None, "line does not match the archive entry grammar (dictionary.md)"
    uw = match.group("uw")
    if not uw:
        return None, "empty UW field; schema requires uw minLength 1 (e.g. punctuation entries)"
    features = parse_feature_list(match.group("features"))
    if features is None:
        return None, "no features found; schema requires at least one feature"
    flg = match.group("flg").lower()
    if flg not in FLG_TO_ISO3:
        return None, f"FLG '{flg}' has no iso3 mapping in this importer (FLG_TO_ISO3)"
    frequency = int(match.group("fre"))
    priority = int(match.group("pri"))
    # dictionary.md: "FRE ::= 0-255", "PRI ::= 0-255"; the schema encodes the same bound. A real
    # line can still exceed it (`[acquire]{452200}...<en,270,8>;`, en_gen_u_c_ucl_2.txt line
    # 69077: FRE 270) -- an archive data-entry slip, not a grammar disagreement -- so this is
    # caught here rather than left for the schema validator to reject downstream.
    if not (0 <= frequency <= 255):
        return None, f"frequency {frequency} is outside the archive's declared 0-255 range"
    if not (0 <= priority <= 255):
        return None, f"priority {priority} is outside the archive's declared 0-255 range"
    entry = {
        "headword": match.group("nlw"),
        "id": int(match.group("id")),
        "uw": uw,
        "features": features,
        "flg": flg,
        "frequency": frequency,
        "priority": priority,
    }
    return entry, None


def shard_letter(headword: str) -> str | None:
    """The a-z shard a headword's dictionary entry files under, or `None` if it holds no ASCII
    letter at all (SPEC.md §3.3 shards `dictionary/<a-z>.yaml`, singular letters only)."""
    for ch in headword:
        lower = ch.lower()
        if lower in _ASCII_LOWER:
            return lower
    return None


def _zip_member_lines(zip_path: Path) -> Iterator[tuple[str, int, str]]:
    """Yield `(member_name, 1-based line number, raw line text)` for every line in every member
    of `zip_path`, in `namelist()` order (the archive's own file-1, file-2, ... split)."""
    with zipfile.ZipFile(zip_path) as archive:
        for member in archive.namelist():
            with archive.open(member) as handle:
                for line_no, raw in enumerate(handle, start=1):
                    yield member, line_no, raw.decode("utf-8").rstrip("\r\n")


def _archive_path(zip_rel: Path, member: str) -> str:
    """`exports/<lang>/<zip-stem>/<member>`, relative to `data/archive/` -- the exact zip member,
    named as `tools/validate/tests/test_schema.py`'s hand-built worked examples name it."""
    return f"{zip_rel.with_suffix('').as_posix()}/{member}"


@dataclass
class ImportedEntry:
    record: dict
    shard: str | None


def import_zip(
    zip_path: Path, archive_root: Path, iso3: str
) -> tuple[list[ImportedEntry], list[UnparsedLine]]:
    """Every line of `zip_path` (an AD or GD export), parsed into store-shaped entries."""
    imported: list[ImportedEntry] = []
    unparsed: list[UnparsedLine] = []
    zip_rel = zip_path.resolve().relative_to(archive_root.resolve())
    for member, line_no, raw in _zip_member_lines(zip_path):
        archive_path = _archive_path(zip_rel, member)
        parsed, reason = parse_line(raw)
        if parsed is None:
            unparsed.append(UnparsedLine(archive_path, line_no, raw, reason or "unparseable"))
            continue
        letter = shard_letter(parsed["headword"])
        if letter is None:
            unparsed.append(
                UnparsedLine(
                    archive_path,
                    line_no,
                    raw,
                    "headword has no ASCII a-z character to shard by (SPEC.md §3.3)",
                )
            )
            continue
        record = {
            "headword": parsed["headword"],
            "id": parsed["id"],
            "uw": parsed["uw"],
            "features": parsed["features"],
            "lang": iso3,
            "frequency": parsed["frequency"],
            "priority": parsed["priority"],
            "source": {"archive_path": archive_path, "line": line_no},
        }
        imported.append(ImportedEntry(record, letter))
    return imported, unparsed


# --------------------------------------------------------------------------------------------
# YAML output. Hand-formatted, not `yaml.dump`: SPEC.md §3.2's own worked example, and the
# tests/fixtures/languages store, write `features` and `source` as one-line flow mappings
# (data/standards/data.md: "No flow-style mappings longer than one line"). PyYAML's default
# block style would not reproduce that; this writer matches it exactly.
# --------------------------------------------------------------------------------------------

_NEEDS_QUOTE_START = set("!&*-?|>%@`\"'#,[]{}: \t")

_STR_TAG = "tag:yaml.org,2002:str"
# One resolver instance, reused: `Resolver.resolve` asks PyYAML's own implicit-type rules
# (YAML 1.1: bool, int, float, null, timestamp, merge, value...) what tag a bare scalar would
# get, so this writer never has to hand-port those patterns and chase real archive strings that
# happen to match one (`off`, `no` -> bool; `.22` -> float, the UW of `.22's`, id 366236,
# en_ana_u_c_ucl -- PyYAML's float pattern allows a leading-dot decimal with no integer part,
# which a hand-rolled `\d+\.\d+` regex missed and once let a float leak into a `uw` string field).
_RESOLVER = yaml.resolver.Resolver()


def _resolves_as_string(text: str) -> bool:
    return _RESOLVER.resolve(yaml.ScalarNode, text, (True, False)) == _STR_TAG


def _yaml_scalar(value: object) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    text = str(value)
    needs_quote = (
        text == ""
        or text != text.strip()
        or text[0] in _NEEDS_QUOTE_START
        or ":" in text
        or "#" in text
        or "\n" in text
        # Flow-mapping indicator characters: unsafe anywhere in a flow-style plain scalar, not
        # only at the start (a GOV feature value of "VC(PP([upon]));" once broke `yaml.safe_load`
        # because "[" and "]" sit mid-string, not at the start).
        or any(c in text for c in "[]{},")
        or not _resolves_as_string(text)
    )
    if not needs_quote:
        return text
    escaped = text.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def _format_flow_mapping(pairs: Sequence[tuple[str, object]]) -> str:
    body = ", ".join(f"{_yaml_scalar(k)}: {_yaml_scalar(v)}" for k, v in pairs)
    return f"{{{body}}}"


def format_entry(entry: dict) -> str:
    features = _format_flow_mapping(list(entry["features"].items()))
    source = entry["source"]
    src = _format_flow_mapping([("archive_path", source["archive_path"]), ("line", source["line"])])
    lines = [
        f"- headword: {_yaml_scalar(entry['headword'])}",
        f"  id: {entry['id']}",
        f"  uw: {_yaml_scalar(entry['uw'])}",
        f"  features: {features}",
        f"  lang: {entry['lang']}",
        f"  frequency: {entry['frequency']}",
        f"  priority: {entry['priority']}",
        f"  source: {src}",
    ]
    return "\n".join(lines) + "\n"


def write_shard(path: Path, entries: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    ordered = sorted(entries, key=lambda e: (e["headword"], e["id"]))
    body = "".join(format_entry(e) for e in ordered)
    path.write_text(LICENCE_HEADER + body, encoding="utf-8", newline="\n")


def format_unparsed(record: UnparsedLine) -> str:
    return f"{record.archive_path}:{record.line}: {record.reason}\n    {record.raw}\n"


def write_unparsed(path: Path, records: list[UnparsedLine]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not records:
        if path.exists():
            path.unlink()
        return
    body = "\n".join(format_unparsed(r) for r in records)
    path.write_text(body, encoding="utf-8", newline="\n")


def import_language(
    iso3: str,
    ad_zip: Path,
    gd_zip: Path,
    archive_root: Path,
    store_root: Path,
) -> ImportStats:
    """Read `ad_zip` (Analysis Dictionary) and `gd_zip` (Generation Dictionary) for one language
    and write `store_root/<iso3>/dictionary/<a-z>.yaml` plus `_unparsed.txt` (SPEC.md §3.2)."""
    stats = ImportStats()
    shards: dict[str, list[dict]] = {}
    unparsed: list[UnparsedLine] = []
    for zip_path in (ad_zip, gd_zip):
        imported, bad = import_zip(zip_path, archive_root, iso3)
        for item in imported:
            assert item.shard is not None  # import_zip routes shardless headwords to `bad`
            shards.setdefault(item.shard, []).append(item.record)
        unparsed.extend(bad)
        stats.input_lines += len(imported) + len(bad)

    lang_dir = store_root / iso3
    dict_dir = lang_dir / "dictionary"
    for letter, entries in sorted(shards.items()):
        write_shard(dict_dir / f"{letter}.yaml", entries)
        stats.shards_written.append(letter)
        stats.parsed_entries += len(entries)

    write_unparsed(lang_dir / "_unparsed.txt", unparsed)
    stats.unparsed_lines = len(unparsed)
    return stats


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m tools.importer.dictionary",
        description="Turn one language's AD/GD zip exports into data/languages/<iso3>/dictionary/.",
    )
    parser.add_argument("--iso3", required=True, help="store language folder, e.g. afr")
    parser.add_argument("--ad", required=True, type=Path, help="Analysis Dictionary zip")
    parser.add_argument("--gd", required=True, type=Path, help="Generation Dictionary zip")
    parser.add_argument(
        "--archive-root", type=Path, default=Path("data/archive"), help="default data/archive"
    )
    parser.add_argument(
        "--store-root", type=Path, default=Path("data/languages"), help="default data/languages"
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    args = build_parser().parse_args(argv)
    stats = import_language(args.iso3, args.ad, args.gd, args.archive_root, args.store_root)
    print(
        f"{args.iso3}: {stats.parsed_entries} entries across {len(stats.shards_written)} shards, "
        f"{stats.unparsed_lines} unparsed lines, {stats.input_lines} input lines"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
