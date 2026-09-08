"""Command line entry point for `python -m tools.validate`.

`--changed` and `--all` are real: they find the language files each mode covers under
`data/languages/`. There is no schema to check against yet (SPEC.md §3.3 arrives with the
importer, M1), so both modes exit 0 once they have found their file list -- including the empty
list an empty `data/languages/` produces.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from collections.abc import Callable, Sequence
from pathlib import Path

from tools.validate import __version__

LANGUAGES_DIR_NAME = "data/languages"


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


def run(
    mode: str,
    repo_root: Path,
    changed_paths: Callable[[Path], list[str]] = git_changed_paths,
) -> int:
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
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    parser = build_parser()
    args = parser.parse_args(argv)
    return run(args.mode, find_repo_root())


if __name__ == "__main__":
    raise SystemExit(main())
