# SPDX-License-Identifier: MPL-2.0
"""Corpus importer: a project's parallel-corpus exports into `data/languages/<iso3>/
corpus/<project>.yaml` (issue 16). SPEC.md §3.2 (importer contract), §3.3 (store layout:
`corpus/<name>.yaml` holds `{sentence, unl, source}`). For `afr` and `eng`, `ugoa1` is the one
project both languages share (issue 16's own text; `aa1` has `eng` but not `afr`, out of scope).

The UCL-encoded export this module reads
(`exports/corpus/<project>/export_corpus.php__project_<p>_lang_<iso1>_unl_ucl`) is HTML, not
plain text: `[S:389649]<br />{org:en}<br />book<br />{/org}<br />{af}<br />boek<br />{/af}<br />
{unl}<br />[W]<br />102870092<br />[/W]<br />{/unl}<br />[/S]`, one such block per source sentence
ID, `<br /><br />`-separated, wrapped in one `[D dn="<project>" did="<date>"]...[/D]` block. The
`_unl_0` and `_unl_ucn` siblings are not read: `_unl_0` numbers every UW opaquely and `_unl_ucn`
keeps the UCN form, neither human-readable without a UW lookup, unlike this file's UCL text
(SPEC.md §3.2's importer overview; `docs/factory/SPEC.md` §3.3 names the corpus store's own
`unl` field as the thing a rule-author reads directly).

**Interpretive calls made without guessing wildly, each with a stated reason**:

- **One store entry per source sentence ID, not per candidate translation.** A single `[S:ID]`
  block can carry more than one natural-language rendering of the same UNL graph: the real `af`
  export tags every rendering `{af}...{/af}` (one sentence ID holds two `{af}` blocks 24 times in
  the real `ugoa1`/`af` file), and the real `en` export does the same with `{en}...{/en}`. Writing
  one store record per candidate would make `len(afr_corpus)` and `len(eng_corpus)` diverge purely
  from how many alternate phrasings each language's translators happened to type in, breaking the
  parallel-corpus invariant the issue's own acceptance criteria checks
  (`len(afr_corpus) == len(eng_corpus)`). This importer keeps the first candidate only, so every
  `[S:ID]` block becomes exactly one store record in both language files -- 248 for `ugoa1`,
  confirmed against the real files before this module was written.
- **The English file's fallback, spelled out.** Every real `ugoa1`/`en` `[S:ID]` block carries an
  `{org:en}` block (248 of 248); only some also carry a `{en}` block (108 of 248) -- the export's
  own way of saying "here is an alternate phrasing of the original". This importer prefers `{en}`
  when present (the language's own "designated" tag, matching how `af`'s `{af}` tag is read) and
  falls back to `{org:en}` when it is not, per issue 16's own text ("the English file sometimes has
  no {en} block, falling back to {org:en}"). `af` never needs the fallback: every `[S:ID]` block in
  the real file carries at least one `{af}` block.
- **`source.line` is a 1-based sequential count of `[S:ID]` blocks in file order, not the archive's
  own sentence ID.** The export gives no physical per-sentence line (the whole corpus, after nine
  header lines, sits on one physical line): a real per-line count would read `1` for almost every
  sentence, which is not what issue 16's acceptance criteria ("the 1-based line number it came
  from") is asking to check. Counting `[S:ID]` blocks in the order the file lists them gives a
  real, checkable 1-based number instead, the same kind of importer-assigned unit
  `docs/factory/store-schema.md`'s HTML grammar catalogues already use when an export has no
  per-line grain of its own.
- **A permissive brace-balance check, not a UNL parser.** Issue 16 asks for exactly this ("checked
  with a permissive brace-balance check only, not a full UNL parser -- that is M3's job"): this
  module counts `(` and `)` in the assembled `unl` text and requires the running count never to go
  negative and to end at zero. No real `ugoa1` `af`/`en` sentence fails this (checked against both
  files before this module was written); the check exists for a corpus this importer has not seen
  yet, and is exercised here by a hand-built fixture, not a real failure.
"""

from __future__ import annotations

import argparse
import html
import re
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from tools.importer.dictionary import _format_flow_mapping, _yaml_scalar

LICENCE_HEADER = "# Licence: CC BY-SA 4.0. Source: UNL Archive, see data/archive/manifest.jsonl\n"

_SENTENCE_BLOCK_RE = re.compile(r"\[S:\d+\](?P<body>.*?)\[/S\]", re.DOTALL)
_UNL_BLOCK_RE = re.compile(r"\{unl\}(?P<body>.*?)\{/unl\}", re.DOTALL)


@dataclass
class CorpusFiles:
    """One language's corpus export for one project: which HTML tag holds its own sentence text,
    and which tag to fall back to when that one is missing for a given `[S:ID]` block."""

    archive_path: str
    designated_tag: str
    fallback_tag: str | None = None


@dataclass
class UnparsedLine:
    archive_path: str
    line: int
    raw: str
    reason: str


@dataclass
class ImportStats:
    """`input_units == parsed_records + unparsed_lines`, where a unit is one `[S:ID]` block."""

    input_units: int = 0
    parsed_records: int = 0
    unparsed_lines: int = 0


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def _tag_content(body: str, tag: str) -> str | None:
    """The first `{tag}...{/tag}` block's content in `body`, cleaned, or `None` if absent."""
    match = re.search(
        rf"\{{{re.escape(tag)}\}}(?P<inner>.*?)\{{/{re.escape(tag.split(':')[0])}\}}",
        body,
        re.DOTALL,
    )
    if match is None:
        return None
    return _clean_text(match.group("inner"))


def _clean_text(raw: str) -> str:
    """Archive `<br />`-joined text, as one line: HTML entities unescaped, `<br />` and runs of
    whitespace collapsed to a single space, leading/trailing space trimmed."""
    text = raw.replace("<br />", " ")
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _parse_unl(body: str) -> str | None:
    """The `{unl}...{/unl}` block's content as the human-readable text a rule-author reads: a
    single Universal Word for a `[W]...[/W]`-wrapped block (a bare concept, no relation), or every
    relation line, space-joined in archive order, otherwise. `None` if the block is missing.

    The archive joins every logical line inside `{unl}...{/unl}` with a literal `<br />`, not
    whitespace, including the `[W]`/`[/W]` wrapper's own open and close lines -- split on it
    first, rather than matching `[W]` against a `\\s*`-only boundary, which the wrapper's own
    `<br />` would fail. Multiple relation lines are joined with a single space, not `\\n`: a
    literal newline embedded in this writer's double-quoted YAML scalar folds to a space on
    `yaml.safe_load` anyway (YAML's own line-folding rule for flow scalars), so writing `\\n` here
    would silently not survive a round trip; joining with a space up front keeps the written file
    and the value every reader gets consistent.
    """
    match = _UNL_BLOCK_RE.search(body)
    if match is None:
        return None
    tokens = [token.strip() for token in match.group("body").split("<br />")]
    tokens = [token for token in tokens if token]
    if not tokens:
        return ""
    if tokens[0] == "[W]" and tokens[-1] == "[/W]":
        return _clean_text(" ".join(tokens[1:-1]))
    return " ".join(_clean_text(token) for token in tokens)


def _parens_balance(text: str) -> bool:
    """Issue 16's "permissive brace-balance check only": every `(` has a matching `)`, and no `)`
    ever precedes its opening `(`. Not a UNL parser; that is M3's job."""
    depth = 0
    for ch in text:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth < 0:
                return False
    return depth == 0


def parse_sentence_block(body: str, files: CorpusFiles) -> tuple[dict | None, str | None]:
    """One `[S:ID]` block's body into `{sentence, unl}`, or `(None, reason)`. Does not know its
    own `source`; the caller adds `archive_path` and the block's 1-based sequential locator."""
    sentence = _tag_content(body, files.designated_tag)
    if sentence is None and files.fallback_tag is not None:
        sentence = _tag_content(body, files.fallback_tag)
    if sentence is None:
        return None, (
            f"no {{{files.designated_tag}}}"
            + (f" or {{{files.fallback_tag}}}" if files.fallback_tag else "")
            + " text found for this sentence"
        )
    if not sentence:
        return None, "sentence text is empty after cleaning"
    unl = _parse_unl(body)
    if unl is None:
        return None, "no {unl} block found for this sentence"
    if not unl:
        return None, "unl text is empty after cleaning"
    if not _parens_balance(unl):
        return None, "unl field's parentheses do not balance (permissive check, not a UNL parser)"
    return {"sentence": sentence, "unl": unl}, None


def import_corpus_file(
    files: CorpusFiles, path: Path, archive_root: Path
) -> tuple[list[dict], list[UnparsedLine]]:
    """Every `[S:ID]` block in `path`, as store-shaped `{sentence, unl, source}` records or
    `UnparsedLine`s. `source.line` is the block's 1-based position in file order (module
    docstring: "1-based sequential count of [S:ID] blocks")."""
    archive_path = files.archive_path
    text = _read(path)
    records: list[dict] = []
    unparsed: list[UnparsedLine] = []
    for line_no, match in enumerate(_SENTENCE_BLOCK_RE.finditer(text), start=1):
        body = match.group("body")
        parsed, reason = parse_sentence_block(body, files)
        if parsed is None:
            raw = match.group(0)
            unparsed.append(UnparsedLine(archive_path, line_no, raw, reason or "unparseable"))
            continue
        records.append(
            {
                "sentence": parsed["sentence"],
                "unl": parsed["unl"],
                "source": {"archive_path": archive_path, "line": line_no},
            }
        )
    return records, unparsed


# --------------------------------------------------------------------------------------------
# YAML output. Same hand-formatted flow-mapping style dictionary.py and grammar.py use
# (docs/standards/data.md: "No flow-style mappings longer than one line").
# --------------------------------------------------------------------------------------------


def format_corpus_record(record: dict) -> str:
    source = record["source"]
    src = _format_flow_mapping([("archive_path", source["archive_path"]), ("line", source["line"])])
    lines = [
        f"- sentence: {_yaml_scalar(record['sentence'])}",
        f"  unl: {_yaml_scalar(record['unl'])}",
        f"  source: {src}",
    ]
    return "\n".join(lines) + "\n"


def write_corpus_file(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    body = "".join(format_corpus_record(r) for r in records) if records else "[]\n"
    path.write_text(LICENCE_HEADER + body, encoding="utf-8", newline="\n")


# `data/languages/<iso3>/_unparsed.txt` is shared with `tools.importer.dictionary` and
# `tools.importer.grammar`: this importer's own block sits after its own marker and is replaced
# whole on each run, exactly like `tools/importer/grammar.py`'s `_UNPARSED_MARKER` scheme, so
# re-running any one importer alone never clobbers another's lines.
_UNPARSED_MARKER = "; --- tools/importer/corpus.py: corpus _unparsed.txt lines below ---\n"


def format_unparsed(record: UnparsedLine) -> str:
    return f"{record.archive_path}:{record.line}: {record.reason}\n    {record.raw}\n"


def write_unparsed(path: Path, records: list[UnparsedLine]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = path.read_text(encoding="utf-8") if path.exists() else ""
    preamble = existing.split(_UNPARSED_MARKER, 1)[0]
    if not records:
        new_text = preamble
    else:
        body = "\n".join(format_unparsed(r) for r in records)
        sep = "\n" if preamble and not preamble.endswith("\n\n") else ""
        new_text = f"{preamble}{sep}{_UNPARSED_MARKER}{body}"
    if new_text:
        path.write_text(new_text, encoding="utf-8", newline="\n")
    elif path.exists():
        path.unlink()


# --------------------------------------------------------------------------------------------
# Per-language project map: SPEC.md §3.2's "For afr and eng, the ugoa1 project is the one corpus
# both languages share".
# --------------------------------------------------------------------------------------------

CORPUS_PROJECTS: dict[str, dict[str, CorpusFiles]] = {
    "afr": {
        "ugoa1": CorpusFiles(
            archive_path="exports/corpus/ugoa1/export_corpus.php__project_ugoa1_lang_af_unl_ucl",
            designated_tag="af",
        ),
    },
    "eng": {
        "ugoa1": CorpusFiles(
            archive_path="exports/corpus/ugoa1/export_corpus.php__project_ugoa1_lang_en_unl_ucl",
            designated_tag="en",
            fallback_tag="org:en",
        ),
    },
}


def import_language(iso3: str, archive_root: Path, store_root: Path) -> ImportStats:
    projects = CORPUS_PROJECTS[iso3]
    stats = ImportStats()
    all_unparsed: list[UnparsedLine] = []
    corpus_dir = store_root / iso3 / "corpus"
    for project, files in projects.items():
        records, unparsed = import_corpus_file(
            files, archive_root / files.archive_path, archive_root
        )
        write_corpus_file(corpus_dir / f"{project}.yaml", records)
        stats.parsed_records += len(records)
        all_unparsed.extend(unparsed)
        stats.input_units += len(records) + len(unparsed)
    write_unparsed(store_root / iso3 / "_unparsed.txt", all_unparsed)
    stats.unparsed_lines = len(all_unparsed)
    return stats


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m tools.importer.corpus",
        description="Turn afr/eng ugoa1 corpus exports into data/languages/<iso3>/corpus/*.yaml.",
    )
    parser.add_argument("--iso3", required=True, choices=sorted(CORPUS_PROJECTS), help="afr or eng")
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
    stats = import_language(args.iso3, args.archive_root, args.store_root)
    print(
        f"{args.iso3}: {stats.parsed_records} corpus sentences, "
        f"{stats.unparsed_lines} unparsed, {stats.input_units} input units"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
