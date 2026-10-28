# SPDX-License-Identifier: MPL-2.0
"""Write `data/languages/<iso3>/meta.yaml` (SPEC.md §3.3, issue 187).

`iso1` and `name` come from `languages.json` in the archive root. `iso3` is the store folder.
`counts` is read from the store as it stands, never from the archive's own language table
(`docs/factory/store-schema.md`, "`meta.yaml` fields"). `last_import` is the date the importer
last ran.

Every importer calls `refresh_meta` at the end of a run. `python -m tools.importer.meta --iso3 X`
calls it on its own, so the counts catch up with a store without a re-import. That standalone run
keeps `last_import` as it is; only an importer run stamps today's date.
"""

from __future__ import annotations

import argparse
import datetime
import json
import sys
from collections.abc import Sequence
from pathlib import Path

import yaml

GRAMMAR_KINDS = ("analysis", "generation", "inflection", "subcategorisation", "disambiguation")
LICENCE = "CC BY-SA 4.0"
HEADER = "# Licence: CC BY-SA 4.0. Source: UNL Archive, see data/archive/manifest.jsonl\n"

# Used only when the archive root holds no `languages.json` (the fixture archives of the importer
# tests). The real file wins when it exists.
FALLBACK_LANGUAGES = {
    "afr": {"iso1": "af", "name": "Afrikaans"},
    "eng": {"iso1": "en", "name": "English"},
}

_LOADER = yaml.CSafeLoader if yaml.__with_libyaml__ else yaml.SafeLoader


def _load_list(path: Path) -> list:
    if not path.is_file():
        return []
    data = yaml.load(path.read_text(encoding="utf-8"), Loader=_LOADER)
    return data if isinstance(data, list) else []


def _load_dict(path: Path) -> dict:
    if not path.is_file():
        return {}
    data = yaml.load(path.read_text(encoding="utf-8"), Loader=_LOADER)
    return data if isinstance(data, dict) else {}


def _count_files(directory: Path) -> int:
    return sum(len(_load_list(p)) for p in sorted(directory.glob("*.yaml")))


def _count_unparsed(path: Path) -> int:
    """Records in `_unparsed.txt`: the lines that start in column 0 and are not comments."""
    if not path.is_file():
        return 0
    lines = path.read_text(encoding="utf-8").splitlines()
    return sum(1 for line in lines if line and not line[0].isspace() and not line.startswith("#"))


def compute_counts(store_dir: Path) -> dict[str, int]:
    """Counts of what `store_dir` holds right now. Keys are sorted for a stable file."""
    counts: dict[str, int] = {
        "corpus_sentences": _count_files(store_dir / "corpus"),
        "dictionary_entries": _count_files(store_dir / "dictionary"),
    }
    for kind in GRAMMAR_KINDS:
        counts[f"rules_{kind}"] = len(_load_list(store_dir / "grammar" / f"{kind}.yaml"))
    counts["tagset_entries"] = len(_load_dict(store_dir / "tagset.yaml"))
    counts["test_rows"] = _count_files(store_dir / "tests")
    counts["unparsed_lines"] = _count_unparsed(store_dir / "_unparsed.txt")
    return dict(sorted(counts.items()))


def language_identity(iso3: str, archive_root: Path) -> dict[str, str] | None:
    """`{iso1, name}` for `iso3`, from `languages.json`, else the fallback table, else None."""
    path = archive_root / "languages.json"
    if path.is_file():
        for row in json.loads(path.read_text(encoding="utf-8")):
            if row.get("iso3") == iso3:
                return {"iso1": row["iso1"], "name": row["name"]}
    return FALLBACK_LANGUAGES.get(iso3)


def format_meta(meta: dict) -> str:
    lines = [
        HEADER.rstrip("\n"),
        f"iso1: {meta['iso1']}",
        f"iso3: {meta['iso3']}",
        f"name: {meta['name']}",
        f"licence: {meta['licence']}",
        "counts:",
    ]
    lines += [f"  {key}: {value}" for key, value in meta["counts"].items()]
    lines.append(f"last_import: {meta['last_import']}")
    return "\n".join(lines) + "\n"


def refresh_meta(
    iso3: str, archive_root: Path, store_root: Path, stamp: bool = True
) -> dict | None:
    """Recompute `counts` and write `store_root/<iso3>/meta.yaml`. `stamp` sets `last_import` to
    today; without it the existing value stays (today's date if there is none yet). Returns the
    meta written, or None when `iso3` is a language the archive and the fallback table do not
    know -- an importer run for a scratch language writes no meta."""
    identity = language_identity(iso3, archive_root)
    if identity is None:
        return None
    store_dir = store_root / iso3
    path = store_dir / "meta.yaml"
    today = datetime.datetime.now(datetime.UTC).date().isoformat()
    previous = _load_dict(path).get("last_import")
    last_import = today if stamp or not previous else str(previous)
    meta = {
        "iso1": identity["iso1"],
        "iso3": iso3,
        "name": identity["name"],
        "licence": LICENCE,
        "counts": compute_counts(store_dir),
        "last_import": last_import,
    }
    store_dir.mkdir(parents=True, exist_ok=True)
    path.write_text(format_meta(meta), encoding="utf-8", newline="\n")
    return meta


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m tools.importer.meta",
        description="Recompute data/languages/<iso3>/meta.yaml counts from the store, no re-import.",
    )
    parser.add_argument("--iso3", required=True, action="append", help="store folder; repeatable")
    parser.add_argument("--archive-root", type=Path, default=Path("data/archive"))
    parser.add_argument("--store-root", type=Path, default=Path("data/languages"))
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(list(sys.argv[1:] if argv is None else argv))
    for iso3 in args.iso3:
        meta = refresh_meta(iso3, args.archive_root, args.store_root, stamp=False)
        if meta is None:
            print(f"{iso3}: unknown language, no meta written", file=sys.stderr)
            return 1
        print(f"{iso3}: meta.yaml counts {meta['counts']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
