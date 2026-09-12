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
from tools.mirror.retry import poll_attempts, run_retry_for_language
from tools.mirror.run import run_mirror
from tools.mirror.stuck import find_next_stuck, find_stuck, format_stuck_report
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

    stuck_parser = subparsers.add_parser(
        "stuck",
        help=(
            "List every export whose latest manifest line is 'timeout' or 'error' (issue 117). "
            "Reads the manifest only: no credential, no request."
        ),
    )
    stuck_parser.add_argument(
        "--archive-root",
        default="data/archive",
        help="Where mirrored files land (default: %(default)s).",
    )
    stuck_parser.add_argument(
        "--manifest",
        default=None,
        help="Path to manifest.jsonl (default: <archive-root>/manifest.jsonl).",
    )
    stuck_parser.add_argument(
        "--config", default="mirror.toml", help="Path to mirror.toml (default: %(default)s)."
    )
    stuck_parser.add_argument(
        "--languages",
        default=None,
        help="Path to languages.json (default: <archive-root>/languages.json).",
    )
    stuck_parser.add_argument(
        "--next",
        action="store_true",
        help=(
            "Print only the next language to drain (issue 118): the first language in "
            "mirror.toml's [retry] priority that still has a timeout path, else the stuck "
            "language with the most base forms. Prints nothing and exits 1 if none is stuck."
        ),
    )

    retry_parser = subparsers.add_parser(
        "retry",
        help=(
            "Sign in with UNL_USER/UNL_PASS and re-fetch every export left 'status: timeout' by "
            "a prior 'login' run, polling longer than 'login' does (issue 117)."
        ),
    )
    retry_parser.add_argument(
        "--config", default="mirror.toml", help="Path to mirror.toml (default: %(default)s)."
    )
    retry_parser.add_argument(
        "--archive-root",
        default="data/archive",
        help="Where mirrored files land (default: %(default)s).",
    )
    retry_parser.add_argument(
        "--manifest",
        default=None,
        help="Path to manifest.jsonl (default: <archive-root>/manifest.jsonl).",
    )
    retry_parser.add_argument(
        "--poll-seconds",
        type=float,
        default=15.0,
        help="Seconds between polls of a still-pending export (default: %(default)s).",
    )
    retry_parser.add_argument(
        "--max-wait-seconds",
        type=float,
        default=300.0,
        help="Seconds to keep polling one export before giving up (default: %(default)s).",
    )
    retry_parser.add_argument(
        "--language",
        default=None,
        help="Restrict retries to this ISO3 language's timeout paths only (issue 118).",
    )
    retry_parser.add_argument(
        "--passes",
        type=int,
        default=3,
        help=(
            "How many passes to run: a pass that meets a 429 stops early, the run sleeps "
            "--pause-seconds, and the next pass retries only what is still timeout "
            "(default: %(default)s)."
        ),
    )
    retry_parser.add_argument(
        "--pause-seconds",
        type=float,
        default=600.0,
        help=(
            "Seconds to sleep between a 429-stopped pass and the next (default: %(default)s); "
            "unlarchive.org's CDN clears its refusal roughly ten minutes after polling stops."
        ),
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
    if command not in ("run", "login", "stuck", "retry"):
        # No subcommand: the M0 skeleton behaviour. `--help`/`--version` already exited above.
        return 0

    archive_root = Path(args.archive_root)
    manifest_path = Path(args.manifest) if args.manifest else archive_root / "manifest.jsonl"

    if command == "stuck":
        # Manifest only: no client, no request (issue 117). `--next` also reads mirror.toml's
        # [retry] priority and languages.json's base_forms counts (issue 118) — still no client.
        if args.next:
            languages_path = (
                Path(args.languages) if args.languages else archive_root / "languages.json"
            )
            priority = load_config(args.config).retry_priority
            next_language = find_next_stuck(manifest_path, languages_path, priority)
            if next_language is None:
                return 1
            print(next_language)
            return 0
        print(format_stuck_report(find_stuck(manifest_path)))
        return 0

    config = load_config(args.config)
    if command == "retry":
        client = RateLimitedClient(
            UrllibTransport(),
            host=config.host,
            user_agent=config.user_agent,
            rate_limit_seconds=args.poll_seconds,
            retries=poll_attempts(args.poll_seconds, args.max_wait_seconds),
            retry_backoff_seconds=0.0,
        )
    else:
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

    if command == "login":
        username, password = read_credentials()
        if not username or not password:
            print(
                "tools.mirror login: UNL_USER and UNL_PASS must both be set in the environment.",
                file=sys.stderr,
            )
            return 3
        try:
            report = run_login_mirror(
                config, client, archive_root, manifest_path, username, password
            )
        except LoginError as exc:
            print(f"tools.mirror login: {exc}", file=sys.stderr)
            return 1
        print(report.summary())
        for note in report.notes:
            print(f"note: {note}")
        return 0

    # command == "retry"
    username, password = read_credentials()
    if not username or not password:
        print(
            "tools.mirror retry: UNL_USER and UNL_PASS must both be set in the environment.",
            file=sys.stderr,
        )
        return 3
    try:
        report = run_retry_for_language(
            config,
            client,
            archive_root,
            manifest_path,
            username,
            password,
            language=args.language,
            passes=args.passes,
            pause_seconds=args.pause_seconds,
        )
    except LoginError as exc:
        print(f"tools.mirror retry: {exc}", file=sys.stderr)
        return 1
    for line in report.pass_summaries:
        print(line)
    print(report.final_summary())
    if report.still_stuck:
        return 4
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
