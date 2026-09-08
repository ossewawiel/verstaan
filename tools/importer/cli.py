# SPDX-License-Identifier: MPL-2.0
"""Command line entry point for `python -m tools.importer`."""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence

from tools.importer import __version__


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m tools.importer",
        description="Turn data/archive/ into data/languages/<iso3>/ YAML (SPEC.md §3.2).",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    parser = build_parser()
    parser.parse_args(argv)

    # M0 skeleton: no parse. M1 (SPEC.md §3.2) fills this in.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
