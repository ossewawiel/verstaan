# SPDX-License-Identifier: MPL-2.0
"""Command line entry point for `python -m tools.validate`.

`--changed` and `--all` find the language files each mode covers under `data/languages/`, then
run the store checks (issue 17, SPEC.md §3.3) grouped by which language store each file falls
under. `--lang <iso3>` runs the same checks against one store directly and prints its report.

`--licences` is also real: it checks the SPDX and CC BY-SA headers issue 5 requires, plus
`apps/cli/NOTICE`. It is a fourth, independent mode -- it has nothing to do with `data/languages/`.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from collections.abc import Callable, Sequence
from pathlib import Path

from tools.validate import __version__
from tools.validate.store import StoreReport, format_report, validate_store

LANGUAGES_DIR_NAME = "data/languages"

# docs/factory/issues/05-notice-files-and-licence-headers.md; SPEC.md §3.5 for the generated line.
SPDX_CPP_LINE = "// SPDX-License-Identifier: MPL-2.0"
SPDX_PY_LINE = "# SPDX-License-Identifier: MPL-2.0"
GENERATED_LICENCE_TEXT = "Licence: CC BY-SA 4.0"
CPP_SUFFIXES = (".cpp", ".hpp")
HEADER_SCAN_LINES = 10


def find_repo_root(start: Path | None = None) -> Path:
    """Return the repository root, via git, falling back to the current directory."""
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        cwd=start,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode == 0 and result.stdout.strip():
        return Path(result.stdout.strip())
    return (start or Path.cwd()).resolve()


def languages_dir(repo_root: Path) -> Path:
    return repo_root / "data" / "languages"


def list_all_language_files(root: Path) -> list[Path]:
    """Every YAML file under `data/languages/`, or an empty list when there is none yet."""
    if not root.exists():
        return []
    return sorted(p for p in root.rglob("*.yaml") if p.is_file())


def git_changed_paths(repo_root: Path) -> list[str]:
    """Paths (repo-relative, forward slashes) that `git status --porcelain` reports as touched."""
    result = subprocess.run(
        ["git", "status", "--porcelain", "--no-renames"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return []
    paths = []
    for line in result.stdout.splitlines():
        # Porcelain format: two status columns, one space, then the path.
        path = line[3:].strip()
        if path:
            paths.append(path.replace("\\", "/"))
    return paths


def list_changed_language_files(
    repo_root: Path, changed_paths: Callable[[Path], list[str]] = git_changed_paths
) -> list[Path]:
    """Changed files that fall under `data/languages/`, from a working tree that may not exist."""
    changed = changed_paths(repo_root)
    matches = []
    for rel in changed:
        if rel.startswith(f"{LANGUAGES_DIR_NAME}/") and rel.endswith(".yaml"):
            matches.append(repo_root / rel)
    return sorted(matches)


def _store_roots(paths: Sequence[Path]) -> list[Path]:
    """The distinct `data/languages/<iso3>/` directories a file list touches, derived from each
    path itself (the ancestor directory right after a `languages` segment) so this needs no
    `repo_root` argument."""
    roots: set[Path] = set()
    for path in paths:
        parts = path.parts
        for index, part in enumerate(parts):
            if part == "languages" and index + 1 < len(parts):
                roots.add(Path(*parts[: index + 2]))
                break
    return sorted(roots)


def validate_files(paths: Sequence[Path]) -> list[str]:
    """Schema, feature-value and UW errors (SPEC.md §3.3) for every language store a path in
    `paths` falls under. Rule coverage is a warning, not an error at M2 (SPEC.md §3.3), so it is
    never in this list -- `run`'s `--lang`/`--all` modes print its count separately via
    `tools.validate.store.format_report`."""
    errors: list[str] = []
    for store_root in _store_roots(paths):
        errors += validate_store(store_root).errors
    return errors


# --------------------------------------------------------------------------------------------
# --licences: issue 5. Pure functions of a directory path, so a mutated tmp_path copy proves the
# check can fail (docs/standards/testing.md) without ever touching the working tree.
# --------------------------------------------------------------------------------------------


def _rel(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


def _first_lines(path: Path, count: int) -> list[str]:
    try:
        text = path.read_bytes().decode("utf-8")
    except UnicodeDecodeError:
        return []
    return text.splitlines()[:count]


def cpp_files_needing_spdx(root: Path) -> list[Path]:
    """`.cpp`/`.hpp` under `engine/` and `apps/`, excluding compiler output (`engine/generated/`)."""
    found: list[Path] = []
    for base_name in ("engine", "apps"):
        base = root / base_name
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file() or path.suffix not in CPP_SUFFIXES:
                continue
            if "generated" in path.relative_to(root).parts:
                continue
            found.append(path)
    return sorted(found)


def generated_cpp_files(root: Path) -> list[Path]:
    """`.cpp`/`.hpp` under `engine/generated/`: compiler output, or its fixture stand-in."""
    generated = root / "engine" / "generated"
    if not generated.exists():
        return []
    return sorted(p for p in generated.rglob("*") if p.is_file() and p.suffix in CPP_SUFFIXES)


def python_files_needing_spdx(root: Path) -> list[Path]:
    """`.py` under `tools/`, skipping bytecode caches."""
    tools_dir = root / "tools"
    if not tools_dir.exists():
        return []
    return sorted(
        p for p in tools_dir.rglob("*.py") if p.is_file() and "__pycache__" not in p.parts
    )


def check_cpp_licence_headers(root: Path) -> list[str]:
    """`SPDX-License-Identifier: MPL-2.0` on every non-generated `.cpp`/`.hpp` (issue 5)."""
    errors = []
    for path in cpp_files_needing_spdx(root):
        if not any(line.strip() == SPDX_CPP_LINE for line in _first_lines(path, 3)):
            errors.append(f"{_rel(root, path)}: missing '{SPDX_CPP_LINE}'")
    return errors


def check_python_licence_headers(root: Path) -> list[str]:
    """`SPDX-License-Identifier: MPL-2.0` on every `.py` under `tools/` (issue 5)."""
    errors = []
    for path in python_files_needing_spdx(root):
        if not any(line.strip() == SPDX_PY_LINE for line in _first_lines(path, 3)):
            errors.append(f"{_rel(root, path)}: missing '{SPDX_PY_LINE}'")
    return errors


def check_generated_licence_headers(root: Path) -> list[str]:
    """The CC BY-SA line of SPEC.md §3.5 on every file under `engine/generated/` (issue 5)."""
    errors = []
    for path in generated_cpp_files(root):
        if not any(
            GENERATED_LICENCE_TEXT in line for line in _first_lines(path, HEADER_SCAN_LINES)
        ):
            errors.append(f"{_rel(root, path)}: missing the '{GENERATED_LICENCE_TEXT}' line")
    return errors


def check_cli_notice(root: Path) -> list[str]:
    """`apps/cli/NOTICE` names MPL-2.0, CC BY-SA 4.0, and the UNL Archive (issue 5)."""
    path = root / "apps" / "cli" / "NOTICE"
    if not path.is_file():
        return ["apps/cli/NOTICE: missing"]
    text = path.read_text(encoding="utf-8")
    errors = []
    for needle in ("MPL-2.0", "CC BY-SA 4.0", "UNL Archive"):
        if needle not in text:
            errors.append(f"apps/cli/NOTICE: does not name {needle}")
    return errors


LOADOUT_FIELDS = ("agent", "model", "effort")
_FRONTMATTER_RE = re.compile(r"\A---\r?\n(.*?)\r?\n---", re.DOTALL)


def issue_files(root: Path) -> list[Path]:
    """`docs/factory/issues/NN-*.md`, the quest files, minus the test-cases companions
    (`04-test-cases.md` is a table of rows, not a quest; the console skips it the same way)."""
    issues = root / "docs" / "factory" / "issues"
    if not issues.is_dir():
        return []
    return sorted(
        p
        for p in issues.glob("*.md")
        if re.match(r"\d+-.*\.md$", p.name) and not p.name.endswith("-test-cases.md")
    )


def check_issue_loadouts(root: Path) -> list[str]:
    """Issue 103. Every quest file names its loadout, the `agent`, `model` and `effort` it is
    embarked with (SPEC.md §6; playbook "Resource rules"). The console shows the three on the
    card, and a quest without them cannot be routed. A file with no frontmatter block at all is
    not a quest and is left alone."""
    errors: list[str] = []
    for path in issue_files(root):
        match = _FRONTMATTER_RE.match(path.read_text(encoding="utf-8"))
        if not match:
            continue
        present: dict[str, str] = {}
        for line in match.group(1).splitlines():
            key, sep, value = line.partition(":")
            if sep:
                present[key.strip()] = value.strip()
        missing = [f for f in LOADOUT_FIELDS if not present.get(f) or present[f] == "null"]
        if missing:
            errors.append(f"{_rel(root, path)}: no loadout: {', '.join(missing)} missing")
    return errors


def _frontmatter_fields(path: Path) -> dict[str, str] | None:
    match = _FRONTMATTER_RE.match(path.read_text(encoding="utf-8"))
    if not match:
        return None
    fields: dict[str, str] = {}
    for line in match.group(1).splitlines():
        key, sep, value = line.partition(":")
        if sep:
            fields[key.strip()] = value.strip()
    return fields


def check_issue_dependencies(root: Path) -> list[str]:
    """Issue 104. Every number in a quest's `depends_on` names a quest file that exists, and
    never the quest itself. The console draws "blocked by" and "blocks" from `depends_on` across
    main and side quests both; a dangling number would draw a block that nothing can lift."""
    files = issue_files(root)
    known = {int(re.match(r"(\d+)", p.name).group(1)) for p in files}
    errors: list[str] = []
    for path in files:
        fields = _frontmatter_fields(path)
        if fields is None:
            continue
        own = int(re.match(r"(\d+)", path.name).group(1))
        deps = [int(n) for n in re.findall(r"\d+", fields.get("depends_on", ""))]
        for dep in deps:
            if dep == own:
                errors.append(f"{_rel(root, path)}: depends_on names the quest itself (#{own})")
            elif dep not in known:
                errors.append(
                    f"{_rel(root, path)}: depends_on names #{dep}, and no such quest exists"
                )
    return errors


def check_licences(root: Path) -> list[str]:
    """Every check `--licences` runs, in order."""
    errors: list[str] = []
    errors += check_cpp_licence_headers(root)
    errors += check_python_licence_headers(root)
    errors += check_generated_licence_headers(root)
    errors += check_cli_notice(root)
    return errors


def run(
    mode: str,
    repo_root: Path,
    changed_paths: Callable[[Path], list[str]] = git_changed_paths,
    lang: str | None = None,
) -> int:
    if mode == "licences":
        errors = check_licences(repo_root)
        for error in errors:
            print(error, file=sys.stderr)
        return 1 if errors else 0

    if mode == "lang":
        assert lang is not None  # build_parser only sets mode="lang" when --lang has a value
        store_root = languages_dir(repo_root) / lang
        if not store_root.is_dir():
            print(f"no store: data/languages/{lang}", file=sys.stderr)
            return 1
        report = validate_store(store_root)
        print(format_report(report))
        for error in report.errors:
            print(error, file=sys.stderr)
        return 1 if report.errors else 0

    if mode == "all":
        root = languages_dir(repo_root)
        store_roots = sorted(p for p in root.glob("*") if p.is_dir()) if root.is_dir() else []
        reports: list[StoreReport] = []
        errors: list[str] = []
        for store_root in store_roots:
            report = validate_store(store_root)
            reports.append(report)
            errors += report.errors
        for report in reports:
            print(format_report(report))
        errors += check_issue_loadouts(repo_root)
        errors += check_issue_dependencies(repo_root)
        for error in errors:
            print(error, file=sys.stderr)
        return 1 if errors else 0

    files = list_changed_language_files(repo_root, changed_paths)
    errors = validate_files(files)
    for error in errors:
        print(error, file=sys.stderr)
    return 1 if errors else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m tools.validate",
        description="Validate data/languages/ against the store schema (SPEC.md §3.3).",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--changed",
        action="store_const",
        dest="mode",
        const="changed",
        help="validate files git reports as touched",
    )
    mode.add_argument(
        "--all",
        action="store_const",
        dest="mode",
        const="all",
        help="validate every file under data/languages/",
    )
    mode.add_argument(
        "--licences",
        action="store_const",
        dest="mode",
        const="licences",
        help="check SPDX and CC BY-SA headers, and apps/cli/NOTICE (issue 5)",
    )
    mode.add_argument(
        "--lang",
        dest="lang",
        metavar="ISO3",
        help="validate one language store, e.g. --lang afr (issue 17)",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    parser = build_parser()
    args = parser.parse_args(argv)
    mode = "lang" if args.lang else args.mode
    return run(mode, find_repo_root(), lang=args.lang)


if __name__ == "__main__":
    raise SystemExit(main())
