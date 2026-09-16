# SPDX-License-Identifier: MPL-2.0
"""Tagset importer: `exports/export_tagset.php` into `data/languages/<iso3>/tagset.yaml`
(issue 16). SPEC.md §3.2 (importer contract), §3.3 (store layout: `tagset.yaml` is one shared
export, not per-language). Line grammar read straight off the export, not the wiki:
`docs/unl-reference/formats/tagset.md`.

**The export is one global file, read and written once per language store**, not once for the
whole archive: `SPEC.md` §3.3 gives every language its own self-contained `tagset.yaml`, so this
importer writes the same parsed table to both `data/languages/afr/tagset.yaml` and
`data/languages/eng/tagset.yaml`. A test in `test_tagset.py` diffs the two files and asserts they
are byte-identical, as the record that the tagset is archive-wide, not per-language.

**The export is a flat alphabetical list, not a hierarchy -- a gap, not a guess.** `tagset.md`
("Categories and the values...") describes the tagset as a tree: an attribute like `ASP` sits
above its own values (`PGS`, ...), and the wiki's hand-drawn `Tagset.wikitext` page draws exactly
that tree. The live export this module reads (`exports/export_tagset.php`) draws no such tree at
all: it is 509 `TAG = meaning (description): <i>examples</i>` entries in one alphabetical run,
with no field anywhere linking a value tag to the attribute it belongs under. Nothing in the
export tells this importer that `A` (adverb) is a `LEX` value while `LEX` itself is an attribute,
or that `PGS` sits under `ASP` -- that link exists only in the wiki tree, which this issue's own
`tagset.md` reference explicitly treats as non-authoritative next to the live export (see that
page's "Where the export adds tags the wiki tree does not define"). This importer therefore writes
every entry with `category: null` and `parent: null`: a documented gap
(`docs/factory/store-schema.md`, "Tagset entry"), not a guess built from the wiki tree the archive
itself has moved past.

Every tag in the export is accounted for: parsed into a record, keyed by its own mnemonic. Since
the export gives no per-tag physical line (the file is nine header lines, one alphabetical run,
then a closing tag -- `docs/unl-reference/formats/tagset.md`'s own reading), each record's
`source.line` is the tag's own mnemonic, the same kind of importer-assigned locator
`docs/factory/store-schema.md`'s dictionary/grammar `source` field already allows "when the
archive export has no per-line grain" (there: a paradigm or frame catalogue number; here: the
tag itself, since every tag is already a stable, unique name).
"""

from __future__ import annotations

import argparse
import html
import re
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from tools.importer.dictionary import _format_flow_mapping, _split_top_level, _yaml_scalar

LICENCE_HEADER = "# Licence: CC BY-SA 4.0. Source: UNL Archive, see data/archive/manifest.jsonl\n"

TAGSET_EXPORT = "exports/export_tagset.php"

_TAG_BOUNDARY_RE = re.compile(r"(?:^|<br />)([0-9A-Z][0-9A-Z]{0,9}) = ")
_EXAMPLES_RE = re.compile(r":\s*<i>(?P<examples>.*)</i>\s*\Z", re.DOTALL)


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def _body(text: str) -> str:
    """The tag-entry run, with the `<h1>`/version/documentation-link preamble and the closing
    `</body></html>` stripped. The preamble ends at the first `<br /><br />` in the file (the
    blank line after the "Documentation available at" link); the run ends at the last
    `<br /></body>`."""
    _, _, rest = text.partition("<br /><br />")
    body, _, _ = rest.rpartition("<br /></body>")
    return body


@dataclass
class TagsetEntry:
    tag: str
    meaning: str
    description: str
    examples: list[str]
    source_archive_path: str = TAGSET_EXPORT
    source_line: str | int | None = None  # None means "use the tag itself" (see format below)


# The live export dropped two catch-all tags the wiki tree still defines and a real dictionary
# entry still uses: `JJJ` ("other adjectives") and `AAA` ("other adverbs"). Issue 171, full
# reasoning in docs/unl-reference/formats/tagset.md, "A second pass...": no rename works for
# either (the entries under them share no semantic class), so both are kept verbatim as a
# wiki-only addendum, merged in after the live export is parsed, so a re-import reproduces the
# same two rows rather than silently dropping them again. Minimal and hardcoded on purpose: this
# is not a general extensibility mechanism, just the two rows issue 171 hand-added. Line numbers
# are `data/archive/wiki/Tagset.wikitext`'s own "Adjective concepts"/"Adverbial concepts" lines,
# matching the hand-added `data/languages/{afr,eng}/tagset.yaml` rows exactly.
_WIKI_ONLY_ADDENDUM: list[TagsetEntry] = [
    TagsetEntry("JJJ", "other adjectives", "", [], "wiki/Tagset.wikitext", 485),
    TagsetEntry("AAA", "other adverbs", "", [], "wiki/Tagset.wikitext", 491),
]


def _parse_segment(tag: str, segment: str) -> TagsetEntry:
    """One tag's text, between its own ` = ` and the next tag boundary (or end of file), into
    `{meaning, description, examples}`.

    Shape: `MEANING (DESCRIPTION)` optionally followed by `: <i>EXAMPLES</i>` (`FOR`, `LOA`, ...),
    or just `MEANING` with neither (`DFN`, "defineteness" -- an archive typo, kept verbatim, not
    corrected: never reinterpreted, `docs/standards/data.md`). A `MEANING` can itself be followed
    by more than one top-level `(...)` group (`123PP`: `first person plural (including the
    listener) (Deictic reference ...)`); every such group is part of the description, joined with
    a space, since the export gives no rule for telling a second qualifying parenthetical from the
    "real" description.
    """
    text = segment.strip()
    examples: list[str] = []
    match = _EXAMPLES_RE.search(text)
    if match:
        examples = [
            html.unescape(item.strip())
            for item in _split_top_level(match.group("examples"))
            if item.strip()
        ]
        text = text[: match.start()].rstrip()
    if "(" not in text:
        return TagsetEntry(tag, html.unescape(text), "", examples)
    paren_start = text.index("(")
    meaning = html.unescape(text[:paren_start].strip())
    depth = 0
    groups: list[str] = []
    current: list[str] = []
    for ch in text[paren_start:]:
        if ch == "(":
            if depth == 0:
                current = []
            depth += 1
            if depth > 1:
                current.append(ch)
        elif ch == ")":
            depth -= 1
            if depth == 0:
                groups.append("".join(current))
            else:
                current.append(ch)
        elif depth > 0:
            current.append(ch)
    description = html.unescape(" ".join(groups))
    return TagsetEntry(tag, meaning, description, examples)


def parse_tagset(text: str) -> list[TagsetEntry]:
    """Every `TAG = ...` entry in the export's flat alphabetical run, in file order. Every one of
    the export's 509 tags is accounted for: none is skipped, since every match the tag-boundary
    regex finds carries at least a meaning (the `DFN` case has no description or examples, never
    an empty meaning)."""
    body = _body(text)
    matches = list(_TAG_BOUNDARY_RE.finditer(body))
    entries: list[TagsetEntry] = []
    for i, match in enumerate(matches):
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        entries.append(_parse_segment(match.group(1), body[start:end]))
    return entries


# --------------------------------------------------------------------------------------------
# YAML output. `tagset.yaml`'s top-level shape is an object keyed by tag mnemonic
# (`tools/validate/schema/store-layout.schema.json`'s `tagsetFile` def), not the array shape
# `dictionary/<a-z>.yaml` and `grammar/<kind>.yaml` use. Each value is one
# `tools/validate/schema/tagset-entry.schema.json` record. Same hand-formatted flow-mapping
# writer `dictionary.py` and `grammar.py` use (`docs/standards/data.md`: "No flow-style mappings
# longer than one line").
# --------------------------------------------------------------------------------------------


# `_yaml_scalar` (dictionary.py) is tuned for block-style scalars; a flow-sequence item has one
# more unsafe character it does not check for, because dictionary/grammar values never carry one:
# a bare `?` inside a plain flow scalar (e.g. the `DEP` example "who (are you?)") is a YAML
# mapping-key indicator in flow context and breaks `yaml.safe_load` unless quoted.
def _flow_scalar(value: str) -> str:
    if isinstance(value, str) and "?" in value:
        escaped = value.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{escaped}"'
    return _yaml_scalar(value)


def _format_examples(examples: list[str]) -> str:
    body = ", ".join(_flow_scalar(item) for item in examples)
    return f"[{body}]"


def format_tagset_record(entry: TagsetEntry) -> str:
    line = entry.source_line if entry.source_line is not None else entry.tag
    source = _format_flow_mapping([("archive_path", entry.source_archive_path), ("line", line)])
    lines = [
        f"{_yaml_scalar(entry.tag)}:",
        f"  tag: {_yaml_scalar(entry.tag)}",
        f"  meaning: {_yaml_scalar(entry.meaning)}",
        f"  description: {_yaml_scalar(entry.description)}",
        f"  examples: {_format_examples(entry.examples)}",
        "  category: null",
        "  parent: null",
        f"  source: {source}",
    ]
    return "\n".join(lines) + "\n"


def write_tagset_file(path: Path, entries: list[TagsetEntry]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    ordered = sorted(entries, key=lambda e: e.tag)
    body = "".join(format_tagset_record(e) for e in ordered)
    path.write_text(LICENCE_HEADER + body, encoding="utf-8", newline="\n")


def entry_as_record(entry: TagsetEntry) -> dict:
    """`TagsetEntry` as the plain dict `tools/validate/schema/tagset-entry.schema.json` checks
    (used by tests and by `tools.validate`, not by the YAML writer above, which formats fields
    itself to keep the flow-mapping style)."""
    line = entry.source_line if entry.source_line is not None else entry.tag
    return {
        "tag": entry.tag,
        "meaning": entry.meaning,
        "description": entry.description,
        "examples": entry.examples,
        "category": None,
        "parent": None,
        "source": {"archive_path": entry.source_archive_path, "line": line},
    }


def import_tagset(iso3: str, archive_root: Path, store_root: Path) -> list[TagsetEntry]:
    """Read the one global tagset export and write it, verbatim, to `store_root/<iso3>/
    tagset.yaml`: SPEC.md §3.3 gives every language its own file, but the export is shared, so
    `afr` and `eng` (and any other language store this runs for) receive the identical table."""
    text = _read(archive_root / TAGSET_EXPORT)
    entries = parse_tagset(text) + _WIKI_ONLY_ADDENDUM
    write_tagset_file(store_root / iso3 / "tagset.yaml", entries)
    return entries


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m tools.importer.tagset",
        description="Turn exports/export_tagset.php into data/languages/<iso3>/tagset.yaml.",
    )
    parser.add_argument(
        "--iso3", required=True, action="append", help="store language folder; repeatable"
    )
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
    for iso3 in args.iso3:
        entries = import_tagset(iso3, args.archive_root, args.store_root)
        print(f"{iso3}: {len(entries)} tagset entries")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
