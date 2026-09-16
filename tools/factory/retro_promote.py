# SPDX-License-Identifier: MPL-2.0
"""Apply one approved `/factory-retro` promotion (issue 176, decision 2 in the issue file).

`.claude/skills/factory-retro/SKILL.md` proposes promoting a repeated failure signature into a
real rule -- a line in a standard, an ADR, an agent file or a skill -- and waits for a human "yes"
per proposal. This module is the write step that runs only after that yes: given a signature
already present in `docs/factory/lessons.jsonl`, a target file and a rule line, it appends the
rule to the target and removes the promoted signature's lines from the ledger. It never proposes,
groups or ranks anything itself -- that stays the skill's prose procedure -- and it never runs
except when invoked directly with all three arguments.

Usage:
    python -m tools.factory.retro_promote --sig <sig> --target <path> --rule "<text>"
        [--lessons PATH] [--repo-root PATH]

Exit code: 0 on a successful promotion. 2 when the signature is not in the ledger, or the target
path is not one of the allowed shapes -- in either case nothing is written.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
LESSONS_REL = Path("docs") / "factory" / "lessons.jsonl"

# The same "prefer, in order" list the skill names (a gate step, an agent file, a standards line,
# a skill line, CLAUDE.md last) -- every shape ends up under one of these, so the allow-list is a
# glob per shape, not a list of files (a new standard or a new agent is not a code change here).
_ALLOWED_TARGET_GLOBS = (
    "docs/standards/*.md",
    "docs/adr/*.md",
    ".claude/agents/*.md",
    ".claude/skills/*/SKILL.md",
)
_ALLOWED_TARGET_EXACT = ("CLAUDE.md",)


class PromoteError(RuntimeError):
    """Raised for anything the caller must see as one clear line, never a write."""


def target_is_allowed(target_rel: str) -> bool:
    """True when `target_rel` (repo-relative, forward slashes) names a file this promotion may
    ever write to. An allowlist of shapes, not a blocklist: a path this function has not
    positively recognised is refused, whatever it is."""
    if ".." in Path(target_rel).parts:
        return False
    if target_rel in _ALLOWED_TARGET_EXACT:
        return True
    for pattern in _ALLOWED_TARGET_GLOBS:
        if Path(target_rel).match(pattern):
            return True
    return False


def read_lessons(lessons_path: Path) -> list[dict]:
    if not lessons_path.exists():
        return []
    rows = []
    for line in lessons_path.read_text(encoding="utf8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def sig_present(lessons_path: Path, sig: str) -> bool:
    return any(row.get("sig") == sig for row in read_lessons(lessons_path))


def apply_promotion(
    *, repo_root: Path, lessons_path: Path, sig: str, target_rel: str, rule: str
) -> None:
    """Refuses (raises `PromoteError`, writes nothing) unless `sig` is in the ledger and
    `target_rel` is an allowed shape. Otherwise appends `rule` to the target file and removes
    every ledger line whose `sig` matches the promoted one -- both writes, or neither."""
    if not sig_present(lessons_path, sig):
        raise PromoteError(
            f"retro-promote: signature '{sig}' is not in {lessons_path}; nothing to promote."
        )
    if not target_is_allowed(target_rel):
        raise PromoteError(
            f"retro-promote: target '{target_rel}' is not an allowed rule file "
            "(docs/standards/*.md, docs/adr/*.md, .claude/agents/*.md, .claude/skills/*/SKILL.md, CLAUDE.md)."
        )

    target_path = repo_root / target_rel
    if not target_path.is_file():
        raise PromoteError(f"retro-promote: target '{target_rel}' does not exist.")

    existing = target_path.read_text(encoding="utf8")
    separator = "" if existing.endswith("\n") else "\n"
    target_path.write_text(f"{existing}{separator}{rule.rstrip()}\n", encoding="utf8")

    remaining = [row for row in read_lessons(lessons_path) if row.get("sig") != sig]
    lessons_path.write_text("".join(json.dumps(row) + "\n" for row in remaining), encoding="utf8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sig", required=True, help="The lessons.jsonl signature to promote.")
    parser.add_argument(
        "--target", required=True, help="Repo-relative path of the rule file to append to."
    )
    parser.add_argument("--rule", required=True, help="The rule line (or short block) to append.")
    parser.add_argument(
        "--repo-root", default=str(REPO_ROOT), help="Defaults to this checkout's own root."
    )
    parser.add_argument(
        "--lessons", default=None, help="Defaults to <repo-root>/docs/factory/lessons.jsonl."
    )
    args = parser.parse_args(argv)

    repo_root = Path(args.repo_root).resolve()
    lessons_path = Path(args.lessons).resolve() if args.lessons else repo_root / LESSONS_REL

    try:
        apply_promotion(
            repo_root=repo_root,
            lessons_path=lessons_path,
            sig=args.sig,
            target_rel=args.target,
            rule=args.rule,
        )
    except PromoteError as e:
        print(str(e), file=sys.stderr)
        return 2

    print(f"retro-promote: promoted '{args.sig}' into {args.target}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
