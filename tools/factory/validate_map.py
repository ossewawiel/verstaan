# SPDX-License-Identifier: MPL-2.0
"""Validate `docs/factory/map.yaml` against `docs/factory/issues/` (ADR 0015, issue 177).

The atlas is hand-authored: the owner places every region and every tile, and this validator
holds the rules a hand-authored file can still rot on. It refuses an issue file whose number
prefix has no tile in `map.yaml`, and refuses a tile whose prefix matches no issue file, so a
merged quest never falls off the map and a tile never paints a quest that does not exist. It also
refuses: a tile that names a region `map.yaml` does not define; a region or tile missing `x`,
`y`, `size` or (tile only) `title`; a region or tile `id` that did not load as a plain YAML
string (an unquoted `id: 08` reads as the integer `8` under PyYAML's YAML 1.1 resolver, silently
dropping the leading zero SPEC.md Section 3.7 requires -- and reads as a *different* value again
under the `yaml` npm package's YAML 1.2 resolver, so the two parsers this file feeds would
disagree on what tile `#08` even is); a duplicate tile or region id.

Usage:
    python -m tools.factory.validate_map [--repo-root PATH]

Exit code: 0 when every check above passes. 1 otherwise, with one line per problem on stderr.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import Counter
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
MAP_REL = Path("docs") / "factory" / "map.yaml"
ISSUES_REL = Path("docs") / "factory" / "issues"

ISSUE_PREFIX_RE = re.compile(r"^(\d+)-.*\.md$")
REGION_REQUIRED_FIELDS = ("x", "y", "size")
TILE_REQUIRED_FIELDS = ("x", "y", "size", "title")


def issue_prefixes(issues_dir: Path) -> set[str]:
    """Every distinct issue-number prefix under `issues_dir`. Two files can share one prefix
    (`04-fixture-language-pair.md` and `04-test-cases.md`); the map carries one tile for it, not
    one per file."""
    if not issues_dir.is_dir():
        return set()
    prefixes: set[str] = set()
    for path in issues_dir.glob("*.md"):
        match = ISSUE_PREFIX_RE.match(path.name)
        if match:
            prefixes.add(match.group(1))
    return prefixes


def load_map(map_path: Path) -> dict:
    """The atlas, or an empty one when the file does not exist yet -- every prefix then reads as
    missing its tile, which is the correct refusal, not a crash."""
    if not map_path.is_file():
        return {"regions": [], "tiles": []}
    with map_path.open(encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    data.setdefault("regions", [])
    data.setdefault("tiles", [])
    return data


def _check_ids_are_strings(
    map_rel: Path, kind: str, items: list[dict], errors: list[str]
) -> set[str]:
    """Every `id` that loaded as a plain `str`, as a set -- anything else (an unquoted numeric
    scalar, a missing id) is reported here and left out, so it can never silently participate in
    a prefix match, a region reference or a duplicate check below (SPEC.md Section 3.7)."""
    ids: set[str] = set()
    for item in items:
        item_id = item.get("id")
        if isinstance(item_id, str):
            ids.add(item_id)
        else:
            errors.append(
                f"{map_rel.as_posix()}: {kind} id {item_id!r} did not load as a string "
                "(an unquoted numeric id, e.g. `id: 08`, must be quoted: `id: '08'`)"
            )
    return ids


def check_map(repo_root: Path, map_rel: Path = MAP_REL, issues_rel: Path = ISSUES_REL) -> list[str]:
    """Every mismatch between `map.yaml` and `docs/factory/issues/`, per ADR 0015."""
    map_path = repo_root / map_rel
    atlas = load_map(map_path)
    prefixes = issue_prefixes(repo_root / issues_rel)

    errors: list[str] = []

    for kind, items in (("region", atlas["regions"]), ("tile", atlas["tiles"])):
        counts = Counter(item.get("id") for item in items if isinstance(item.get("id"), str))
        for dup_id, count in counts.items():
            if count > 1:
                errors.append(f"{map_rel.as_posix()}: {kind} id '{dup_id}' is used {count} times")

    tile_ids = _check_ids_are_strings(map_rel, "tile", atlas["tiles"], errors)
    region_ids = _check_ids_are_strings(map_rel, "region", atlas["regions"], errors)

    for prefix in sorted(prefixes - tile_ids, key=int):
        errors.append(f"{map_rel.as_posix()}: issue prefix {prefix} has no tile")
    for tile_id in sorted(tile_ids - prefixes):
        errors.append(f"{map_rel.as_posix()}: tile {tile_id} matches no issue file")

    for tile in atlas["tiles"]:
        tile_id = tile.get("id")
        if not isinstance(tile_id, str):
            continue  # already reported above
        region = tile.get("region")
        if region not in region_ids:
            errors.append(f"{map_rel.as_posix()}: tile {tile_id} names unknown region {region!r}")

    for item in atlas["regions"]:
        missing = [field for field in REGION_REQUIRED_FIELDS if item.get(field) is None]
        if missing:
            errors.append(
                f"{map_rel.as_posix()}: region {item.get('id')!r} is missing {', '.join(missing)}"
            )
    for item in atlas["tiles"]:
        missing = [field for field in TILE_REQUIRED_FIELDS if item.get(field) is None]
        if missing:
            errors.append(
                f"{map_rel.as_posix()}: tile {item.get('id')!r} is missing {', '.join(missing)}"
            )

    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m tools.factory.validate_map",
        description="Check docs/factory/map.yaml against docs/factory/issues/ (ADR 0015).",
    )
    parser.add_argument("--repo-root", type=Path, default=REPO_ROOT)
    args = parser.parse_args(argv)

    errors = check_map(args.repo_root)
    for error in errors:
        print(error, file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
