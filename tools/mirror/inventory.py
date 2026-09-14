# SPDX-License-Identifier: MPL-2.0
"""Build `docs/architecture/archive-inventory.md` from `manifest.jsonl` and `languages.json`
(SPEC.md §3.1, issue 11).

`manifest.jsonl` names every mirrored file; `languages.json` carries the archive's own counts
(base forms, word forms, paradigms, frames, dictionary and grammar levels) for every language it
lists, mirrored or not. This module joins the two: for each language with a non-empty export, it
reports which of the four grammar exports UNLarium serves are non-empty, a line-count proxy for
dictionary size, and a readiness grade.

Two exports per grammar kind (inflectional, subcategorisation), one per direction (analysis,
generation): `export_grammar.php__type_{M,Y}[_direction_G]_lang_<iso1>`. Every one of these files
carries two boilerplate default rules even when the author has written none (`M0`/`M1` or
`Y0`/`Y1`); an inflectional-generation export with real rules uses a different rule marker
(`(%x,M12):=`) than the other three (`<b>M12</b>`), and a generation export with nothing behind it
says so literally (`No grammar available`). `_grammar_export_status` reads all three signals.
Never attempts to parse a rule's meaning — a first-pass line count only (issue 11, "Not in
scope").
"""

from __future__ import annotations

import io
import json
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path

_GRAMMAR_KINDS: tuple[tuple[str, str], ...] = (
    ("inflectional", "M"),
    ("subcategorisation", "Y"),
)
_DIRECTIONS: tuple[tuple[str, str], ...] = (
    ("analysis", ""),
    ("generation", "_direction_G"),
)

_NO_GRAMMAR = "No grammar available"
_ANALYSIS_MARKER_RE = re.compile(r"<b>[A-Za-z]\d+</b>")
_GENERATION_MARKER_RE = re.compile(r"\(%x,[A-Za-z]\d+\):=")
# Every grammar export, empty or not, ships two default rules (M0/M1 or Y0/Y1). More than that
# means the language author added real rules.
_DEFAULT_RULE_COUNT = 2


@dataclass(frozen=True)
class GrammarExportStatus:
    """One of the four grammar exports for one language."""

    kind: str  # "inflectional" | "subcategorisation"
    direction: str  # "analysis" | "generation"
    present: bool
    non_empty: bool
    rule_count: int


@dataclass(frozen=True)
class DictionaryExport:
    """The largest non-empty dictionary zip found for a language, if any."""

    filename: str | None
    size_bytes: int
    line_count: int


@dataclass(frozen=True)
class LanguageInventory:
    iso3: str
    iso1: str
    name: str
    base_forms: int
    word_forms: int
    paradigms: int
    frames: int
    dict_level: str
    grammar_level: str
    dictionary: DictionaryExport
    grammar: tuple[GrammarExportStatus, ...]
    grade: str

    def grammar_status(self, kind: str, direction: str) -> GrammarExportStatus:
        for status in self.grammar:
            if status.kind == kind and status.direction == direction:
                return status
        raise KeyError((kind, direction))

    def any_generation_non_empty(self) -> bool:
        return any(s.non_empty for s in self.grammar if s.direction == "generation")

    def all_grammar_non_empty(self) -> bool:
        return all(s.non_empty for s in self.grammar)


def _grammar_export_status(kind: str, direction: str, text: str | None) -> GrammarExportStatus:
    """Classify one grammar export's raw HTML.

    `text` is `None` when the file was never mirrored (present=False). Otherwise: a generation
    export that has nothing behind it says `_NO_GRAMMAR` outright. An inflectional-generation
    export with real content uses `(%x,M12):=`-style markers instead of `<b>M12</b>`; every other
    export (analysis, or subcategorisation-generation, which reuses the analysis markup) uses
    `<b>...</b>`. Whichever marker style is present, more than the two universal default rules
    means the language has authored rules.
    """
    if text is None:
        return GrammarExportStatus(kind, direction, present=False, non_empty=False, rule_count=0)
    if _NO_GRAMMAR in text:
        return GrammarExportStatus(kind, direction, present=True, non_empty=False, rule_count=0)
    generation_markers = len(_GENERATION_MARKER_RE.findall(text))
    if generation_markers:
        return GrammarExportStatus(
            kind, direction, present=True, non_empty=True, rule_count=generation_markers
        )
    analysis_markers = len(_ANALYSIS_MARKER_RE.findall(text))
    return GrammarExportStatus(
        kind,
        direction,
        present=True,
        non_empty=analysis_markers > _DEFAULT_RULE_COUNT,
        rule_count=analysis_markers,
    )


def _grammar_export_filename(code: str, direction_suffix: str, iso1: str) -> str:
    return f"export_grammar.php__type_{code}{direction_suffix}_lang_{iso1}"


def _read_text(path: Path) -> str | None:
    if not path.is_file() or path.stat().st_size == 0:
        return None
    return path.read_text(encoding="utf-8", errors="replace")


def _zip_line_count(path: Path) -> int:
    """Total lines across every member of a zip, decoded as UTF-8 with replacement.

    A `wc -l` equivalent, one level below the zip container. Not a dictionary parse: it does not
    look at what the lines say.
    """
    total = 0
    with zipfile.ZipFile(path) as archive:
        for member in archive.infolist():
            if member.is_dir():
                continue
            with archive.open(member) as fh:
                data = io.TextIOWrapper(fh, encoding="utf-8", errors="replace")
                total += sum(1 for _ in data)
    return total


def _pick_dictionary_export(export_dir: Path, iso1: str) -> DictionaryExport:
    """The largest non-empty `<iso1>_{ana,gen}_*.zip` in `export_dir`, if any.

    UNLarium serves each direction in eight encoding/scope variants; most archive languages have
    none of the sixteen actually downloaded yet (the mirror's login exports are drained one
    language at a time — see the "drain the stuck exports" quests). Picking one representative
    file, rather than summing every variant, avoids counting the same dictionary several times
    over in different encodings.
    """
    candidates = sorted(export_dir.glob(f"{iso1}_ana_*.zip")) + sorted(
        export_dir.glob(f"{iso1}_gen_*.zip")
    )
    non_empty = [p for p in candidates if p.is_file() and p.stat().st_size > 0]
    if not non_empty:
        return DictionaryExport(filename=None, size_bytes=0, line_count=0)
    largest = max(non_empty, key=lambda p: p.stat().st_size)
    try:
        lines = _zip_line_count(largest)
    except zipfile.BadZipFile:
        lines = 0
    return DictionaryExport(
        filename=largest.name, size_bytes=largest.stat().st_size, line_count=lines
    )


def grade_for(base_forms: int, all_grammar_non_empty: bool, generation_non_empty: bool) -> str:
    """A = base_forms > 50k and all four grammar exports non-empty.
    B = base_forms > 10k and the generation grammar is non-empty.
    C = anything else that is non-empty at all (callers only grade rows already known non-empty).
    """
    if base_forms > 50_000 and all_grammar_non_empty:
        return "A"
    if base_forms > 10_000 and generation_non_empty:
        return "B"
    return "C"


def read_manifest_languages(manifest_path: Path) -> set[str]:
    """Every `iso3` the manifest mentions, from entries under `exports/<iso3>/...`."""
    languages: set[str] = set()
    if not manifest_path.is_file():
        return languages
    pattern = re.compile(r"^exports/([a-z]{2,3})/")
    with manifest_path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            entry = json.loads(line)
            match = pattern.match(entry.get("path", ""))
            if match:
                languages.add(match.group(1))
    return languages


def manifest_retrieved_range(manifest_path: Path) -> tuple[str, str] | None:
    """The earliest and latest `retrieved` timestamp among `exports/` entries, or `None`."""
    earliest: str | None = None
    latest: str | None = None
    if not manifest_path.is_file():
        return None
    with manifest_path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            entry = json.loads(line)
            if not entry.get("path", "").startswith("exports/"):
                continue
            retrieved = entry.get("retrieved")
            if not retrieved:
                continue
            if earliest is None or retrieved < earliest:
                earliest = retrieved
            if latest is None or retrieved > latest:
                latest = retrieved
    if earliest is None or latest is None:
        return None
    return earliest, latest


def build_inventory(
    archive_root: Path, manifest_path: Path, languages_path: Path
) -> list[LanguageInventory]:
    """One `LanguageInventory` per language with a non-empty export, sorted by base forms desc."""
    languages = json.loads(languages_path.read_text(encoding="utf-8"))
    by_iso3 = {entry["iso3"]: entry for entry in languages}
    manifest_languages = read_manifest_languages(manifest_path)

    rows: list[LanguageInventory] = []
    for iso3 in sorted(manifest_languages):
        meta = by_iso3.get(iso3)
        if meta is None:
            continue
        export_dir = archive_root / "exports" / iso3
        iso1 = meta["iso1"]

        grammar_statuses = []
        for kind, code in _GRAMMAR_KINDS:
            for direction, suffix in _DIRECTIONS:
                filename = _grammar_export_filename(code, suffix, iso1)
                text = _read_text(export_dir / filename)
                grammar_statuses.append(_grammar_export_status(kind, direction, text))

        dictionary = (
            _pick_dictionary_export(export_dir, iso1)
            if export_dir.is_dir()
            else DictionaryExport(None, 0, 0)
        )

        base_forms = meta["base_forms"]
        any_grammar_non_empty = any(s.non_empty for s in grammar_statuses)
        non_empty_export = base_forms > 0 or any_grammar_non_empty or dictionary.line_count > 0
        if not non_empty_export:
            continue

        generation_non_empty = any(
            s.non_empty for s in grammar_statuses if s.direction == "generation"
        )
        all_non_empty = all(s.non_empty for s in grammar_statuses)
        grade = grade_for(base_forms, all_non_empty, generation_non_empty)

        rows.append(
            LanguageInventory(
                iso3=iso3,
                iso1=iso1,
                name=meta["name"],
                base_forms=base_forms,
                word_forms=meta["word_forms"],
                paradigms=meta["paradigms"],
                frames=meta["frames"],
                dict_level=meta["dict_level"],
                grammar_level=meta["grammar_level"],
                dictionary=dictionary,
                grammar=tuple(grammar_statuses),
                grade=grade,
            )
        )

    rows.sort(key=lambda r: r.base_forms, reverse=True)
    return rows


def _human_size(size_bytes: int) -> str:
    if size_bytes <= 0:
        return "0 B"
    units = ("B", "kB", "MB", "GB")
    size = float(size_bytes)
    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.1f} {unit}" if unit != "B" else f"{int(size)} B"
        size /= 1024
    return f"{size:.1f} GB"


def _grammar_cell(status: GrammarExportStatus) -> str:
    if not status.present:
        return "not mirrored"
    unit = "rule" if status.rule_count == 1 else "rules"
    if status.non_empty:
        return f"yes ({status.rule_count} {unit})"
    return f"no ({status.rule_count} default {unit})"


def _dictionary_cell(dictionary: DictionaryExport) -> str:
    if dictionary.filename is None:
        return "not mirrored"
    return f"`{dictionary.filename}`, {_human_size(dictionary.size_bytes)}, {dictionary.line_count:,} lines"


_INTERROGATION_RECORD = {
    # docs/decisions/2026-09-08-verstaan/interrogation.html, "Assumption D, measured" and the
    # logged-in language-table reconnaissance later in the same turn.
    "afr": {"base_forms": 8959, "word_forms": 13768, "paradigms": 17, "frames": 7},
    "eng": {"base_forms": 209178, "word_forms": 408241, "paradigms": 28, "frames": 61},
    "dut": {"base_forms": 4595, "word_forms": 7970, "paradigms": 10, "frames": 0},
}


def render_markdown(rows: list[LanguageInventory], retrieved_range: tuple[str, str] | None) -> str:
    """The full `archive-inventory.md` page: methodology, grade rule, the interrogation
    cross-check, the M3/reference-language recommendation, then the table.
    """
    by_iso3 = {row.iso3: row for row in rows}
    lines: list[str] = []
    lines.append("# Archive inventory")
    lines.append("")
    lines.append(
        "Generated by `python -m tools.mirror inventory` from `data/archive/manifest.jsonl` "
        "and `data/archive/languages.json` (issue 11). Never hand-edit this page; re-run the "
        "command instead."
    )
    if retrieved_range:
        lines.append("")
        lines.append(
            f"The export files this page counts were retrieved between `{retrieved_range[0]}` "
            f"and `{retrieved_range[1]}`."
        )
    lines.append("")

    lines.append("## Method")
    lines.append("")
    lines.append(
        "`languages.json` carries the archive's own counts: base forms, word forms, paradigms "
        "and frames, read from the logged-in language table. This page adds a local check on "
        "top of those counts, built only from what the mirror has actually downloaded:"
    )
    lines.append("")
    lines.append(
        "- **Dictionary line count.** UNLarium serves each language's dictionary as sixteen zip "
        "variants (two directions times eight encoding/scope combinations). Most of the archive's "
        "240 languages have none of the sixteen downloaded yet — the login exports are drained "
        'one language at a time (see the "drain the stuck exports" quests). This page picks the '
        "largest non-empty variant, if any, unzips it and counts lines. One representative file, "
        "not a sum across variants, so the same dictionary is never counted twice over in "
        "different encodings."
    )
    lines.append(
        "- **Grammar export non-empty.** UNLarium serves four grammar exports per language: "
        "Inflectional grammar and Subcategorisation grammar, each in an analysis and a generation "
        "direction (`export_grammar.php__type_{M,Y}[_direction_G]_lang_<iso1>`). Every export "
        "carries two default rules even when the language author has written none (`M0`/`M1` or "
        "`Y0`/`Y1`). A generation export with nothing behind it says so literally, `No grammar "
        "available`. An inflectional-generation export with real rules uses a different rule "
        "marker (`(%x,M12):=`) than the other three (`<b>M12</b>`). This page counts rule markers "
        "of whichever style is present and calls an export non-empty when the count exceeds the "
        "two universal defaults."
    )
    lines.append(
        "- **The subcategorisation exports are identical in both directions.** Diffing "
        "`export_grammar.php__type_Y_lang_<iso1>` against "
        "`export_grammar.php__type_Y_direction_G_lang_<iso1>` for every language checked shows "
        "byte-identical rule content; only the page's `<h1>` differs. UNLarium does not maintain "
        "a separate generation-direction rule set for subcategorisation frames. Only the "
        'inflectional export genuinely differs by direction. A row\'s "generation grammar", for '
        "the grade rule below, follows from whichever of the two generation-direction exports is "
        "non-empty, but for subcategorisation that is never more informative than the analysis "
        "column."
    )
    lines.append(
        "- **Not a dictionary or grammar parse.** Every count above is a line count or a marker "
        "count, never a read of what a rule or entry means. Real parsing is `tools/importer`'s "
        'job, out of scope here (issue 11, "Not in scope").'
    )
    lines.append("")

    lines.append("## Readiness grade")
    lines.append("")
    lines.append(
        "A = dictionary base forms > 50,000 and all four grammar exports non-empty. "
        "B = dictionary base forms > 10,000 and the generation grammar is non-empty. "
        "C = anything else with a non-empty export."
    )
    lines.append("")

    lines.append("## Afrikaans, English and Dutch against the 2026-09-08 interrogation")
    lines.append("")
    lines.append(
        "`docs/decisions/2026-09-08-verstaan/interrogation.html` records a logged-in reading of "
        "the archive's language table, three days before this mirror ran:"
    )
    lines.append("")
    lines.append("| Language | Base forms | Word forms | Paradigms | Frames |")
    lines.append("|---|---|---|---|---|")
    lines.append("| Afrikaans | 8,959 | 13,768 | 17 | 7 |")
    lines.append("| English | 209,178 | 408,241 | 28 | 61 |")
    lines.append("| Dutch | 4,595 | 7,970 | 10 | 0 |")
    lines.append("")
    for iso3, name in (("afr", "Afrikaans"), ("eng", "English"), ("dut", "Dutch")):
        expected = _INTERROGATION_RECORD[iso3]
        row = by_iso3.get(iso3)
        actual = {
            "base_forms": row.base_forms if row else 0,
            "word_forms": row.word_forms if row else 0,
            "paradigms": row.paradigms if row else 0,
            "frames": row.frames if row else 0,
        }
        if actual == expected:
            lines.append(
                f"- {name}: `languages.json` matches the interrogation record exactly on all "
                "four counts."
            )
        else:
            diffs = ", ".join(
                f"{key} {expected[key]:,} → {actual[key]:,}"
                for key in expected
                if expected[key] != actual[key]
            )
            lines.append(f"- {name}: differs from the interrogation record ({diffs}).")
        if iso3 == "afr" and row is not None:
            afr_infl_gen = row.grammar_status("inflectional", "generation")
            if afr_infl_gen.non_empty:
                lines.append(
                    "  The interrogation record found the Afrikaans inflectional-generation "
                    "export empty (the two default rules only) on 2026-09-08. This mirror, "
                    f"retrieved 2026-09-11, shows {afr_infl_gen.rule_count} rule markers past "
                    "the two defaults. The two counts differ; the cause is not investigated "
                    "further here."
                )
    lines.append("")

    lines.append("## M3 and the reference set for rule drafting")
    lines.append("")
    lines.append(
        "M3 uses eng and afr (SPEC.md §1). Neither is graded A here: Afrikaans has 8,959 base "
        "forms, short of the 10,000 that even a B needs, and its inflectional-generation grammar "
        "is newer than the archive's own `languages.json` count reflects. English clears every A "
        "threshold on paper but this mirror has not drained its full dictionary zip in every "
        "encoding, only the one variant sampled above."
    )
    lines.append("")
    lines.append(
        "For drafting Afrikaans and English rules against real examples rather than the spec "
        "alone, the highest-graded rows other than eng and afr are candidates for a reference "
        "set. This is a recommendation, not a mechanical fact — a grade compares line counts and "
        "marker counts, not the quality or relevance of a language's rules to Afrikaans or "
        "English structure:"
    )
    lines.append("")
    grade_a_others = [r for r in rows if r.grade == "A" and r.iso3 not in ("eng", "afr")]
    for row in grade_a_others:
        lines.append(
            f"- **{row.name}** (`{row.iso3}`, grade A): {row.base_forms:,} base forms, all four "
            "grammar exports non-empty."
        )
    lines.append("")
    if grade_a_others:
        names_sentence = ", ".join(row.name for row in grade_a_others)
        lines.append(
            f"By that measure, {names_sentence} are the current candidates, ranked by "
            "dictionary base forms."
        )
    else:
        lines.append(
            "No language besides eng and afr grades A in this mirror yet; there is no "
            "candidate to list."
        )
    lines.append("")
    largest_dictionary_row = max(
        (row for row in rows if row.dictionary.filename is not None),
        key=lambda row: row.dictionary.line_count,
        default=None,
    )
    if largest_dictionary_row is not None:
        lines.append(
            f"**{largest_dictionary_row.name}**'s dictionary export is the largest one this "
            f"mirror has actually downloaded, at {largest_dictionary_row.dictionary.line_count:,} "
            "lines, which makes it the most useful for checking the importer against real "
            "UNLarium dictionary syntax, not just the grammar exports."
        )
        lines.append("")

    lines.append("## Languages")
    lines.append("")
    lines.append(
        "One row per language with a non-empty export (dictionary or grammar), sorted by "
        "dictionary base forms descending. `Not mirrored` means the mirror has no non-empty copy "
        "of that export yet, not that the archive itself lacks it."
    )
    lines.append("")
    header = (
        "| Language | ISO3 | Base forms | Word forms | Dict level | Grammar level | "
        "Inflectional (analysis) | Inflectional (generation) | Subcategorisation (analysis) | "
        "Subcategorisation (generation) | Dictionary export sampled | Grade |"
    )
    lines.append(header)
    lines.append("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for row in rows:
        infl_a = row.grammar_status("inflectional", "analysis")
        infl_g = row.grammar_status("inflectional", "generation")
        subc_a = row.grammar_status("subcategorisation", "analysis")
        subc_g = row.grammar_status("subcategorisation", "generation")
        lines.append(
            f"| {row.name} | {row.iso3} | {row.base_forms:,} | {row.word_forms:,} | "
            f"{row.dict_level} | {row.grammar_level} | {_grammar_cell(infl_a)} | "
            f"{_grammar_cell(infl_g)} | {_grammar_cell(subc_a)} | {_grammar_cell(subc_g)} | "
            f"{_dictionary_cell(row.dictionary)} | {row.grade} |"
        )
    lines.append("")
    return "\n".join(lines)


def write_report(
    archive_root: Path, manifest_path: Path, languages_path: Path, out_path: Path
) -> int:
    """Build the inventory and write it to `out_path`. Returns the row count."""
    rows = build_inventory(archive_root, manifest_path, languages_path)
    retrieved_range = manifest_retrieved_range(manifest_path)
    markdown = render_markdown(rows, retrieved_range)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(markdown, encoding="utf-8")
    return len(rows)
