"""Command line entry point for `python -m tools.mirror`.

Credentials come from `UNL_USER` and `UNL_PASS` in the environment only (SPEC.md §3.1,
tools/CLAUDE.md). Passing them as arguments is refused before argparse ever sees them: a
credential typed on the command line lands in shell history and process listings, which the
environment does not.
"""

from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Sequence

from tools.mirror import __version__

# Argument spellings that would smuggle a credential onto the command line, and the literal
# environment variable names themselves (`--flag=UNL_PASS` or a bare `UNL_USER=x` positional).
_FORBIDDEN_FLAG_NAMES = {
    "user",
    "unl-user",
    "unl_user",
    "pass",
    "password",
    "unl-pass",
    "unl_pass",
}
_FORBIDDEN_SUBSTRINGS = ("UNL_USER", "UNL_PASS")


def reject_credential_args(argv: Sequence[str]) -> str | None:
    """Return an error message if `argv` carries a credential, else `None`.

    Catches both a named flag (`--unl-user bob`, `--pass=x`) and the environment variable name
    written straight onto the command line (`UNL_USER=bob`).
    """
    for arg in argv:
        key = arg.split("=", 1)[0].lstrip("-").lower()
        if key in _FORBIDDEN_FLAG_NAMES:
            return (
                f"tools.mirror: refusing argument {arg!r}. "
                "Credentials come from UNL_USER and UNL_PASS in the environment only."
            )
        if any(needle in arg for needle in _FORBIDDEN_SUBSTRINGS):
            return (
                f"tools.mirror: refusing argument {arg!r}. "
                "Credentials come from UNL_USER and UNL_PASS in the environment only."
            )
    return None


def read_credentials() -> tuple[str | None, str | None]:
    """Read (UNL_USER, UNL_PASS) from the environment. The only place they may come from."""
    return os.environ.get("UNL_USER"), os.environ.get("UNL_PASS")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m tools.mirror",
        description=(
            "Mirror the UNL Archive onto data/archive/. Reads UNL_USER and UNL_PASS from the "
            "environment; never accepts them as arguments."
        ),
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)

    error = reject_credential_args(argv)
    if error is not None:
        print(error, file=sys.stderr)
        return 2

    parser = build_parser()
    parser.parse_args(argv)

    # M0 skeleton: no network call, no fetch. M1 (SPEC.md §3.1) fills this in.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
