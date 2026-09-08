"""Command line entry point for `python -m tools.compiler`."""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence

from tools.compiler import __version__


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m tools.compiler",
        description=(
            "Compile the store and tiers.toml into engine/generated/ and tests/golden/ "
            "(SPEC.md §3.5)."
        ),
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    parser = build_parser()
    parser.parse_args(argv)

    # M0 skeleton: no tables, no rules. M1 (SPEC.md §3.5) fills this in.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
