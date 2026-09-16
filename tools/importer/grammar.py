# SPDX-License-Identifier: MPL-2.0
"""Grammar importer: transformation-grammar, inflection, subcategorisation and disambiguation
exports into `data/languages/<iso3>/grammar/{analysis,generation,inflection,subcategorisation,
disambiguation}.yaml` (issue 15). SPEC.md §3.2 (importer contract), §3.3 (store layout), §4 (data
rules). Line grammar: `docs/unl-reference/formats/transformation-grammar.md` (T-rules, the
`alpha:=beta;` shape shared by `LL/LT/TT/TN/NN/NT/TL` rule types), `inflection.md` (M paradigms),
`subcategorisation.md` (Y frames). The `D`-rule (disambiguation) shape is undocumented anywhere
under `docs/unl-reference/formats/`; this module's `parse_d_rule_line` is a reasonable-effort
reading of `44.dgrammar.txt`/`47.dgrammar.txt` (`(NODE)(NODE)...=VALUE;comment`, the same
`alpha=value;` shape T-rules use for `alpha:=beta;`), not a documented grammar. **Flagged gap**: a
future docs pass should add `docs/unl-reference/formats/disambiguation.md` before this importer's
D-rule reading is trusted in earnest.

Every physical line a plain-text export ships is accounted for: parsed into a record, or one
`data/languages/<iso3>/_unparsed.txt` entry with the raw line and a reason (SPEC.md §3.2). The
`export_grammar.php__type_{M,Y}_lang_*` exports are HTML, not plain text (the archive renders them
for a browser): those files have no reliable per-physical-line grain (a browser-rendered "line" of
running prose holds several catalogue entries, and the archive's own stray mid-entry newlines do
not line up with entry boundaries -- see `M21`/`M22` in `export_grammar.php__type_M_lang_af`,
which each carry one extra bare `;` on its own physical line). This module instead accounts for
those two files per catalogue entry (one `<b>Mxx</b>` or `<b>Yxx</b>` block = one accounted-for
unit), documented here rather than silently switching the counting unit.

**Interpretive calls made without guessing wildly, each with a stated reason**:
- `grammar/analysis.yaml` and `grammar/generation.yaml` hold both a language's own custom
  transformation grammar (`kind: analysis`/`generation`) and the shared default grammar
  (`kind: default`) merged into the one file the store layout names (SPEC.md §3.3 lists five
  grammar files total, not six): the `kind` field is what tells them apart, exactly as the schema
  documents kind as "not itself an archive field; the importer derives it from which export the
  rule came from".
- The M-direction-G and Y-direction-G exports re-wrap the same paradigm/frame data for the
  generation direction (verified: same `Mxx`/`Yxx` numbers, same affixation/frame body, only a
  different wrapper syntax for M, and byte-identical apart from the `<h1>` title for Y). Neither is
  re-imported, to avoid holding the same paradigm or frame twice under two different shapes; this
  mirrors the explicit instruction for subcategorisation in issue 15's own text and extends the
  same reasoning to inflection, which the issue names but does not spell out as explicitly.
- `id` for a T-rule or D-rule record is importer-assigned, sequential per output *file* (not per
  input file: `analysis.yaml` numbers custom-grammar records first, then default-grammar records,
  continuing the same sequence), because the archive's own rule text carries no stable id there
  (SPEC.md §3.2). `id` for an inflectional paradigm or subcategorisation frame is the archive's own
  catalogue number (`M2`, `Y38`), because the archive does give those a stable id.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path

from tools.importer.dictionary import _format_flow_mapping, _yaml_scalar

LICENCE_HEADER = "# Licence: CC BY-SA 4.0. Source: UNL Archive, see data/archive/manifest.jsonl\n"

# --------------------------------------------------------------------------------------------
# Shared record/accounting shapes.
# --------------------------------------------------------------------------------------------


@dataclass
class UnparsedLine:
    archive_path: str
    line: int | str
    raw: str
    reason: str


@dataclass
class ImportStats:
    """Counts one language's grammar import. `input_units == parsed_records + unparsed_lines`,
    where a "unit" is a physical line for the plain-text exports and one catalogue entry
    (`<b>Mxx</b>`/`<b>Yxx</b>`) for the two HTML exports (see module docstring)."""

    input_units: int = 0
    parsed_records: int = 0
    unparsed_lines: int = 0
    files_written: list[str] = field(default_factory=list)


def _rel(path: Path, archive_root: Path) -> str:
    return path.resolve().relative_to(archive_root.resolve()).as_posix()


def _read(path: Path) -> str:
    # utf-8-sig: `47.tgrammar.txt` (and others) carry a leading BOM the archive's own export
    # wrote; utf-8-sig strips it transparently instead of it breaking the leading `;` comment
    # check on the file's first line.
    return path.read_text(encoding="utf-8-sig")


# --------------------------------------------------------------------------------------------
# T-rule (`alpha:=beta;`, transformation-grammar.md) and D-rule (`alpha=value;`, undocumented)
# line grammar: one shared depth-tracking splitter, since both shapes are "condition, assignment
# operator, action, terminating ';', trailing free-text comment" and both need the assignment
# operator and the terminator found only at bracket depth 0 -- a T-rule's `%x=%y` binding or a
# D-rule's `rel=plc` feature sits at depth >=1 and must not be mistaken for the rule's own split.
# --------------------------------------------------------------------------------------------

_OPEN = frozenset("([{")
_CLOSE = frozenset(")]}")

# The 2016 grammar exports write `POS=CCJ` (rules 33/34, generation.yaml) and bare `CCJ`
# (analysis.yaml, e.g. `(C,CCJ,^XP,^proj)`) for the coordinating conjunction. The live tagset
# defines six conjunction classes and `CCJ` is not one of them; `COO` ("conjunction
# (coordinating)") is. Issue 171, full reasoning in docs/unl-reference/formats/tagset.md, "A
# second pass...". Rewritten wherever `CCJ` stands as a whole token, attributed or bare, in
# either `lhs` or `rhs`: one tag deserves one spelling inside one store.
_CCJ_TOKEN_RE = re.compile(r"(?<![A-Za-z0-9_])CCJ(?![A-Za-z0-9_])")


def _rewrite_ccj(text: str) -> str:
    return _CCJ_TOKEN_RE.sub("COO", text)


def _find_top_level(text: str, target: str, start: int = 0) -> int:
    """The index of `target`'s first occurrence in `text` at bracket depth 0, or -1."""
    depth = 0
    i = start
    n = len(text)
    tlen = len(target)
    while i < n:
        ch = text[i]
        if ch in _OPEN:
            depth += 1
        elif ch in _CLOSE:
            depth -= 1
        elif depth == 0 and text[i : i + tlen] == target:
            return i
        i += 1
    return -1


def _split_rule(text: str, assign: str) -> tuple[str, str, str] | None:
    """`text` split on the first depth-0 `assign` (`":="` or `"="`), then the action split from
    its trailing free-text comment on the first depth-0 `';'` after that. `None` if either is
    missing (malformed or not this rule shape at all)."""
    idx = _find_top_level(text, assign)
    if idx == -1:
        return None
    lhs = text[:idx].strip()
    rest = text[idx + len(assign) :]
    end_idx = _find_top_level(rest, ";")
    if end_idx == -1:
        return None
    return lhs, rest[:end_idx].strip(), rest[end_idx + 1 :].strip()


def parse_t_rule_line(raw: str) -> tuple[dict | None, str | None]:
    """One line of a plain-text T-grammar export into `{lhs, rhs, comment}`, or `(None, reason)`.
    Comment is the archive's own free trailing text after the rule's terminating `;`
    (transformation-grammar.md's three worked rules all carry one, e.g. `books > book.@pl`)."""
    text = raw.strip()
    if not text:
        return None, "blank line"
    if text.startswith(";"):
        return None, "archive header/comment line (starts with ';'), not a grammar rule"
    result = _split_rule(text, ":=")
    if result is None:
        return (
            None,
            "line does not match the T-rule alpha:=beta; grammar (transformation-grammar.md)",
        )
    lhs, rhs, comment = result
    if not lhs:
        return None, "empty left-hand side before ':='"
    return {"lhs": _rewrite_ccj(lhs), "rhs": _rewrite_ccj(rhs), "comment": comment}, None


def parse_d_rule_line(raw: str) -> tuple[dict | None, str | None]:
    """One line of a disambiguation export into `{lhs, rhs, comment}`, or `(None, reason)`. The
    `alpha=value;` shape read off `44.dgrammar.txt`/`47.dgrammar.txt`; undocumented, see module
    docstring."""
    text = raw.strip()
    if not text:
        return None, "blank line"
    if text.startswith(";"):
        return None, "archive header/comment line (starts with ';'), not a disambiguation rule"
    result = _split_rule(text, "=")
    if result is None:
        return (
            None,
            "line does not match the D-rule alpha=value; grammar (undocumented, see module docstring)",
        )
    lhs, rhs, comment = result
    if not lhs:
        return None, "empty left-hand side before '='"
    return {"lhs": lhs, "rhs": rhs, "comment": comment}, None


def import_t_rule_file(path: Path, archive_root: Path) -> tuple[list[dict], list[UnparsedLine]]:
    """Every line of a plain-text T/D-grammar-shaped export, as partial records (`lhs, rhs,
    comment, source`; caller adds `id` and `kind`) or `UnparsedLine`s."""
    archive_path = _rel(path, archive_root)
    lines = _read(path).splitlines()
    records: list[dict] = []
    unparsed: list[UnparsedLine] = []
    for line_no, raw in enumerate(lines, start=1):
        parsed, reason = parse_t_rule_line(raw)
        if parsed is None:
            unparsed.append(UnparsedLine(archive_path, line_no, raw, reason or "unparseable"))
            continue
        records.append(
            {
                "lhs": parsed["lhs"],
                "rhs": parsed["rhs"],
                "comment": parsed["comment"],
                "source": {"archive_path": archive_path, "line": line_no},
            }
        )
    return records, unparsed


def import_d_rule_file(path: Path, archive_root: Path) -> tuple[list[dict], list[UnparsedLine]]:
    archive_path = _rel(path, archive_root)
    lines = _read(path).splitlines()
    records: list[dict] = []
    unparsed: list[UnparsedLine] = []
    for line_no, raw in enumerate(lines, start=1):
        parsed, reason = parse_d_rule_line(raw)
        if parsed is None:
            unparsed.append(UnparsedLine(archive_path, line_no, raw, reason or "unparseable"))
            continue
        records.append(
            {
                "lhs": parsed["lhs"],
                "rhs": parsed["rhs"],
                "comment": parsed["comment"],
                "source": {"archive_path": archive_path, "line": line_no},
            }
        )
    return records, unparsed


def import_unparseable_file(path: Path, archive_root: Path, reason: str) -> list[UnparsedLine]:
    """`44.tgrammar.txt`: keyboard-mash scratch content, no `:=` rule syntax anywhere (issue 15).
    Every line goes to `_unparsed.txt` with `reason`, never guessed at a `kind`."""
    archive_path = _rel(path, archive_root)
    lines = _read(path).splitlines()
    return [UnparsedLine(archive_path, i, raw, reason) for i, raw in enumerate(lines, start=1)]


def _assign_sequential_ids(records: list[dict], kind: str) -> list[dict]:
    """T-rule/D-rule records get an importer-assigned sequential `id`, per output file, since the
    archive's own rule text carries no stable id for these (SPEC.md §3.2)."""
    out = []
    for i, record in enumerate(records, start=1):
        out.append({"id": str(i), "kind": kind, "conditions": [], **record})
    return out


# --------------------------------------------------------------------------------------------
# HTML catalogue exports (`export_grammar.php?type={M,Y}&lang=...`): inflectional paradigms and
# subcategorisation frames, each `<b>Mxx</b>`/`<b>Yxx</b>` followed by a description, a
# `(<i>examples</i>)` block, and one or more `;`-terminated rule-body statements.
# --------------------------------------------------------------------------------------------

_CATALOGUE_ENTRY_RE = re.compile(
    r"<b>(?P<letter>[A-Z])(?P<num>\d+)</b>(?P<body>.*?)(?=<b>[A-Z]\d+</b>|</body>)", re.DOTALL
)
_DESC_EXAMPLES_RE = re.compile(
    r"^(?:<br\s*/?>)*(?P<desc>.*?)\(<i>(?P<examples>.*?)</i>\)", re.DOTALL
)


def _clean_ws(text: str) -> str:
    """Collapse the archive's stray literal newlines and `<br />` tags to single spaces. Known
    limitation: this would also collapse a significant internal space inside a quoted multi-word
    a-rule literal (e.g. a hypothetical `:="to the lions"`); none of the paradigms or frames this
    importer reads carry one (checked against every real `M`/`Y` catalogue entry in the afr/eng
    exports), so this is not hit today, but a future export with one would need a smarter cleaner."""
    return re.sub(
        r"\s+", " ", text.replace("<br />", " ").replace("<br/>", " ").replace("<br>", " ")
    ).strip()


@dataclass
class CatalogueEntry:
    id: str
    description: str
    examples: str
    statements: list[str]


def parse_html_catalogue(
    text: str, prefix: str
) -> tuple[list[CatalogueEntry], list[tuple[str, str]]]:
    """Every `<b>{prefix}nn</b>` block in an M/Y HTML export, as a `CatalogueEntry` or a
    `(catalogue_id, reason)` pair for a block with no rule body (`M0`/`M1`/`Y0`/`Y1`: an
    invariant or "rules defined inside the entry", not a shared paradigm/frame)."""
    entries: list[CatalogueEntry] = []
    skipped: list[tuple[str, str]] = []
    for match in _CATALOGUE_ENTRY_RE.finditer(text):
        if match.group("letter") != prefix:
            continue
        cat_id = f"{match.group('letter')}{match.group('num')}"
        body = match.group("body")
        desc_match = _DESC_EXAMPLES_RE.match(body)
        if not desc_match:
            reason = (
                "catalogue entry has no (<i>examples</i>) rule body "
                "(e.g. an invariant paradigm or a dictionary-inline placeholder)"
            )
            skipped.append((cat_id, reason))
            continue
        description = _clean_ws(desc_match.group("desc"))
        examples = _clean_ws(desc_match.group("examples"))
        rest = body[desc_match.end() :]
        statements = []
        for chunk in re.findall(r"[^;]+;", rest):
            cleaned = _clean_ws(chunk)
            if cleaned in ("", ";"):
                continue
            statements.append(cleaned)
        if not statements:
            skipped.append(
                (
                    cat_id,
                    "catalogue entry has an example block but no semicolon-terminated rule body",
                )
            )
            continue
        entries.append(CatalogueEntry(cat_id, description, examples, statements))
    return entries, skipped


def _catalogue_comment(entry: CatalogueEntry) -> str:
    if entry.examples:
        return f"{entry.description} ({entry.examples})"
    return entry.description


def build_inflection_records(entries: list[CatalogueEntry], archive_path: str) -> list[dict]:
    """One record per paradigm (issue 15): `rhs` is every branch's affixation rule, concatenated
    verbatim in archive order (`SNG:=0>"";PLR:=0>"s";` for `M2`), matching each branch's own
    trailing `;`. `lhs` is empty: this export gives a paradigm no separate condition column of its
    own -- unlike an inline dictionary `INFR`/`FLX` rule, a catalogued `Mxx` paradigm is invoked
    only by number (`PAR=Mxx`, dictionary.md), and that invocation lives in the dictionary store,
    not here."""
    records = []
    for entry in entries:
        records.append(
            {
                "id": entry.id,
                "kind": "inflection",
                "lhs": "",
                "rhs": "".join(entry.statements),
                "conditions": [],
                "comment": _catalogue_comment(entry),
                "source": {"archive_path": archive_path, "line": entry.id},
            }
        )
    return records


def build_subcategorisation_records(entries: list[CatalogueEntry], archive_path: str) -> list[dict]:
    """One record per frame (issue 15): `lhs` is the frame's argument structure verbatim (each
    statement's own trailing `;` dropped, multiple frame variants joined with `; ` -- `Y35` carries
    two: `VS(NP)VC(NP)VC(NP); VS(NP)VC(NP)VC(JP)`). `rhs` is empty: a subcategorisation frame
    declares an argument structure, not a rewrite (schema: `tools/validate/schema/
    grammar-rule.schema.json`)."""
    records = []
    for entry in entries:
        lhs = "; ".join(statement.rstrip(";").strip() for statement in entry.statements)
        records.append(
            {
                "id": entry.id,
                "kind": "subcategorisation",
                "lhs": lhs,
                "rhs": "",
                "conditions": [],
                "comment": _catalogue_comment(entry),
                "source": {"archive_path": archive_path, "line": entry.id},
            }
        )
    return records


# --------------------------------------------------------------------------------------------
# YAML output. Same hand-formatted flow-mapping style dictionary.py uses (data/standards/data.md:
# "No flow-style mappings longer than one line"), reusing its scalar/flow-mapping formatter.
# --------------------------------------------------------------------------------------------


def format_grammar_record(record: dict) -> str:
    source = record["source"]
    src = _format_flow_mapping([("archive_path", source["archive_path"]), ("line", source["line"])])
    lines = [
        f"- id: {_yaml_scalar(record['id'])}",
        f"  kind: {_yaml_scalar(record['kind'])}",
        f"  lhs: {_yaml_scalar(record['lhs'])}",
        f"  rhs: {_yaml_scalar(record['rhs'])}",
        "  conditions: []",
        f"  comment: {_yaml_scalar(record['comment'])}",
        f"  source: {src}",
    ]
    return "\n".join(lines) + "\n"


def write_grammar_file(path: Path, records: list[dict], note: str | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    parts = [LICENCE_HEADER]
    if note:
        parts.append(f"# {note}\n")
    if records:
        parts.append("".join(format_grammar_record(r) for r in records))
    else:
        parts.append("[]\n")
    path.write_text("".join(parts), encoding="utf-8", newline="\n")


# `data/languages/<iso3>/_unparsed.txt` is shared with `tools.importer.dictionary` (issue 14):
# this importer must not clobber that importer's lines. Its own block sits after a marker and is
# replaced whole on each run, so re-running this importer alone stays idempotent without touching
# whatever ran before it.
_UNPARSED_MARKER = "; --- tools/importer/grammar.py: grammar _unparsed.txt lines below ---\n"


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
# Per-language file map (issue 15's own "Per-language files, named exactly" list) and the
# orchestration that turns it into the five `grammar/*.yaml` files plus `_unparsed.txt`.
# --------------------------------------------------------------------------------------------


@dataclass
class LanguageGrammarFiles:
    custom_analysis: str | None  # kind: analysis
    custom_generation: str | None  # kind: generation
    unparseable_custom: list[tuple[str, str]]  # (archive_path, reason), e.g. 44.tgrammar.txt
    default_analysis: str  # kind: default, merged into analysis.yaml
    default_generation: str  # kind: default, merged into generation.yaml
    inflection_source: str  # export_grammar.php?type=M, analysis direction
    inflection_skipped: str  # the _direction_G duplicate, not re-imported (see module docstring)
    subcategorisation_source: str  # export_grammar.php?type=Y, analysis direction
    subcategorisation_skipped: str  # the _direction_G duplicate, not re-imported
    disambiguation_sources: list[str]  # *.dgrammar.txt, empty for eng (no export in manifest)


GRAMMAR_FILES: dict[str, LanguageGrammarFiles] = {
    "afr": LanguageGrammarFiles(
        custom_analysis=None,
        custom_generation="exports/afr/47.tgrammar.txt",
        unparseable_custom=[("exports/afr/44.tgrammar.txt", "no rule syntax found")],
        default_analysis="exports/afr/nl_unl_tgrammar.txt",
        default_generation="exports/afr/unl_nl_tgrammar.txt",
        inflection_source="exports/afr/export_grammar.php__type_M_lang_af",
        inflection_skipped="exports/afr/export_grammar.php__type_M_direction_G_lang_af",
        subcategorisation_source="exports/afr/export_grammar.php__type_Y_lang_af",
        subcategorisation_skipped="exports/afr/export_grammar.php__type_Y_direction_G_lang_af",
        disambiguation_sources=["exports/afr/44.dgrammar.txt", "exports/afr/47.dgrammar.txt"],
    ),
    "eng": LanguageGrammarFiles(
        custom_analysis="grammars/eng_unl_tgrammar.txt",
        custom_generation=None,
        unparseable_custom=[],
        default_analysis="exports/eng/nl_unl_tgrammar.txt",
        default_generation="exports/eng/unl_nl_tgrammar.txt",
        inflection_source="exports/eng/export_grammar.php__type_M_lang_en",
        inflection_skipped="exports/eng/export_grammar.php__type_M_direction_G_lang_en",
        subcategorisation_source="exports/eng/export_grammar.php__type_Y_lang_en",
        subcategorisation_skipped="exports/eng/export_grammar.php__type_Y_direction_G_lang_en",
        disambiguation_sources=[],  # no *.dgrammar.txt export for eng in manifest.jsonl
    ),
}


def import_language(iso3: str, archive_root: Path, store_root: Path) -> ImportStats:
    files = GRAMMAR_FILES[iso3]
    stats = ImportStats()
    all_unparsed: list[UnparsedLine] = []
    grammar_dir = store_root / iso3 / "grammar"

    # analysis.yaml: custom analysis grammar (if any) first, then the shared default grammar.
    analysis_records: list[dict] = []
    if files.custom_analysis:
        recs, unp = import_t_rule_file(archive_root / files.custom_analysis, archive_root)
        analysis_records.extend(_assign_sequential_ids(recs, "analysis"))
        all_unparsed.extend(unp)
        stats.input_units += len(recs) + len(unp)
    default_analysis_recs, unp = import_t_rule_file(
        archive_root / files.default_analysis, archive_root
    )
    start = len(analysis_records) + 1
    analysis_records.extend(
        {"id": str(start + i), "kind": "default", "conditions": [], **r}
        for i, r in enumerate(default_analysis_recs)
    )
    all_unparsed.extend(unp)
    stats.input_units += len(default_analysis_recs) + len(unp)
    write_grammar_file(grammar_dir / "analysis.yaml", analysis_records)
    stats.parsed_records += len(analysis_records)
    stats.files_written.append("analysis.yaml")

    # generation.yaml: custom generation grammar (if any) first, then the shared default grammar.
    generation_records: list[dict] = []
    if files.custom_generation:
        recs, unp = import_t_rule_file(archive_root / files.custom_generation, archive_root)
        generation_records.extend(_assign_sequential_ids(recs, "generation"))
        all_unparsed.extend(unp)
        stats.input_units += len(recs) + len(unp)
    default_generation_recs, unp = import_t_rule_file(
        archive_root / files.default_generation, archive_root
    )
    start = len(generation_records) + 1
    generation_records.extend(
        {"id": str(start + i), "kind": "default", "conditions": [], **r}
        for i, r in enumerate(default_generation_recs)
    )
    all_unparsed.extend(unp)
    stats.input_units += len(default_generation_recs) + len(unp)
    write_grammar_file(grammar_dir / "generation.yaml", generation_records)
    stats.parsed_records += len(generation_records)
    stats.files_written.append("generation.yaml")

    # A file with no `:=` rule syntax anywhere (44.tgrammar.txt): every line to `_unparsed.txt`.
    for rel_path, reason in files.unparseable_custom:
        unp = import_unparseable_file(archive_root / rel_path, archive_root, reason)
        all_unparsed.extend(unp)
        stats.input_units += len(unp)

    # inflection.yaml: analysis-direction M export only (see module docstring for why the
    # _direction_G duplicate is not re-imported).
    inflection_text = _read(archive_root / files.inflection_source)
    inflection_entries, inflection_skipped = parse_html_catalogue(inflection_text, "M")
    inflection_archive_path = _rel(archive_root / files.inflection_source, archive_root)
    inflection_records = build_inflection_records(inflection_entries, inflection_archive_path)
    for cat_id, reason in inflection_skipped:
        all_unparsed.append(UnparsedLine(inflection_archive_path, cat_id, cat_id, reason))
    stats.input_units += len(inflection_entries) + len(inflection_skipped)
    write_grammar_file(grammar_dir / "inflection.yaml", inflection_records)
    stats.parsed_records += len(inflection_records)
    stats.files_written.append("inflection.yaml")

    # subcategorisation.yaml: analysis-direction Y export only (byte-identical to the
    # _direction_G export apart from its <h1> title -- subcategorisation.md).
    subcat_text = _read(archive_root / files.subcategorisation_source)
    subcat_entries, subcat_skipped = parse_html_catalogue(subcat_text, "Y")
    subcat_archive_path = _rel(archive_root / files.subcategorisation_source, archive_root)
    subcat_records = build_subcategorisation_records(subcat_entries, subcat_archive_path)
    for cat_id, reason in subcat_skipped:
        all_unparsed.append(UnparsedLine(subcat_archive_path, cat_id, cat_id, reason))
    stats.input_units += len(subcat_entries) + len(subcat_skipped)
    write_grammar_file(grammar_dir / "subcategorisation.yaml", subcat_records)
    stats.parsed_records += len(subcat_records)
    stats.files_written.append("subcategorisation.yaml")

    # disambiguation.yaml: every *.dgrammar.txt export for this language, or empty with a note
    # when none exists (checked against data/archive/manifest.jsonl at issue-15 authoring time,
    # not re-checked at import time here since the file list is fixed per language above).
    disambiguation_records: list[dict] = []
    for rel_path in files.disambiguation_sources:
        recs, unp = import_d_rule_file(archive_root / rel_path, archive_root)
        start = len(disambiguation_records) + 1
        disambiguation_records.extend(
            {"id": str(start + i), "kind": "disambiguation", "conditions": [], **r}
            for i, r in enumerate(recs)
        )
        all_unparsed.extend(unp)
        stats.input_units += len(recs) + len(unp)
    note = None if files.disambiguation_sources else "archive: none for eng"
    write_grammar_file(grammar_dir / "disambiguation.yaml", disambiguation_records, note=note)
    stats.parsed_records += len(disambiguation_records)
    stats.files_written.append("disambiguation.yaml")

    write_unparsed(store_root / iso3 / "_unparsed.txt", all_unparsed)
    stats.unparsed_lines = len(all_unparsed)
    return stats


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m tools.importer.grammar",
        description=(
            "Turn afr/eng transformation-grammar, inflection, subcategorisation and "
            "disambiguation exports into data/languages/<iso3>/grammar/*.yaml."
        ),
    )
    parser.add_argument("--iso3", required=True, choices=sorted(GRAMMAR_FILES), help="afr or eng")
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
        f"{args.iso3}: {stats.parsed_records} grammar records across "
        f"{len(stats.files_written)} files, {stats.unparsed_lines} unparsed lines, "
        f"{stats.input_units} input units"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
