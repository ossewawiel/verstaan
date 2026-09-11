# SPDX-License-Identifier: MPL-2.0
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
from pathlib import Path

from tools.mirror import __version__
from tools.mirror.config import load_config
from tools.mirror.http_client import RateLimitedClient, UrllibTransport
from tools.mirror.login import LoginError
from tools.mirror.run import run_mirror
from tools.mirror.unlarium import run_login_mirror

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

    subparsers = parser.add_subparsers(dest="command")
    run_parser = subparsers.add_parser(
        "run",
        help=(
            "Fetch every public page, wiki page and linked static file from unlarchive.org "
            "(SPEC.md §3.1). Public, no-login sources only."
        ),
    )
    run_parser.add_argument(
        "--config", default="mirror.toml", help="Path to mirror.toml (default: %(default)s)."
    )
    run_parser.add_argument(
        "--archive-root",
        default="data/archive",
        help="Where mirrored files land (default: %(default)s).",
    )
    run_parser.add_argument(
        "--manifest",
        default=None,
        help="Path to manifest.jsonl (default: <archive-root>/manifest.jsonl).",
    )

    login_parser = subparsers.add_parser(
        "login",
        help=(
            "Sign in with UNL_USER/UNL_PASS and mirror the logged-in UNLarium exports for every "
            "language: dictionaries, grammars, tagset, corpora, the owner's Files uploads "
            "(SPEC.md §3.1, issue 08)."
        ),
    )
    login_parser.add_argument(
        "--config", default="mirror.toml", help="Path to mirror.toml (default: %(default)s)."
    )
    login_parser.add_argument(
        "--archive-root",
        default="data/archive",
        help="Where mirrored files land (default: %(default)s).",
    )
    login_parser.add_argument(
        "--manifest",
        default=None,
        help="Path to manifest.jsonl (default: <archive-root>/manifest.jsonl).",
    )

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)

    error = reject_credential_args(argv)
    if error is not None:
        print(error, file=sys.stderr)
        return 2

    parser = build_parser()
    args = parser.parse_args(argv)

    command = getattr(args, "command", None)
    if command not in ("run", "login"):
        # No subcommand: the M0 skeleton behaviour. `--help`/`--version` already exited above.
        return 0

    archive_root = Path(args.archive_root)
    manifest_path = Path(args.manifest) if args.manifest else archive_root / "manifest.jsonl"
    config = load_config(args.config)
    client = RateLimitedClient(
        UrllibTransport(),
        host=config.host,
        user_agent=config.user_agent,
        rate_limit_seconds=config.rate_limit_seconds,
        retries=config.retries,
        retry_backoff_seconds=config.retry_backoff_seconds,
    )

    if command == "run":
        report = run_mirror(config, client, archive_root, manifest_path)
        print(report.summary())
        for note in report.notes:
            print(f"note: {note}")
        return 0

    # command == "login"
    username, password = read_credentials()
    if not username or not password:
        print(
            "tools.mirror login: UNL_USER and UNL_PASS must both be set in the environment.",
            file=sys.stderr,
        )
        return 3
    try:
        report = run_login_mirror(config, client, archive_root, manifest_path, username, password)
    except LoginError as exc:
        print(f"tools.mirror login: {exc}", file=sys.stderr)
        return 1
    print(report.summary())
    for note in report.notes:
        print(f"note: {note}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
