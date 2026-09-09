# SPDX-License-Identifier: MPL-2.0
"""Command line entry point for `python -m tools.validate`.

`--changed` and `--all` are real: they find the language files each mode covers under
`data/languages/`. There is no schema to check against yet (SPEC.md §3.3 arrives with the
importer, M1), so both modes exit 0 once they have found their file list -- including the empty
list an empty `data/languages/` produces.

`--licences` is also real: it checks the SPDX and CC BY-SA headers issue 5 requires, plus
`apps/cli/NOTICE`. It is a third, independent mode -- it has nothing to do with `data/languages/`.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from collections.abc import Callable, Sequence
from pathlib import Path

from tools.validate import __version__

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


def validate_files(paths: Sequence[Path]) -> list[str]:
    """Schema and tagset checks (SPEC.md §3.3). Always empty until the importer exists (M1)."""
    return []


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
) -> int:
    if mode == "licences":
        errors = check_licences(repo_root)
        for error in errors:
            print(error, file=sys.stderr)
        return 1 if errors else 0

    if mode == "all":
        files = list_all_language_files(languages_dir(repo_root))
    else:
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
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    parser = build_parser()
    args = parser.parse_args(argv)
    return run(args.mode, find_repo_root())


if __name__ == "__main__":
    raise SystemExit(main())
