"""Mirror `docs/factory/issues/*.md` onto GitHub (SPEC.md §6, issue 91).

GitHub is a rendering of the issue files, never the other way round. This script creates and
updates one GitHub milestone per `milestone:` value and one GitHub issue per file, and writes
back only the `github_issue:` field. It never reopens a GitHub issue and never edits a local file
because GitHub changed; that direction is reported as drift instead.

Credentials: `GH_TOKEN` from the environment only, passed through to `gh`. There is no other way
to authenticate this script.

Usage:
    python -m tools.factory.mirror_github [--repo OWNER/NAME] [--check] [--issues-dir DIR]

Exit code: 0 if nothing needed doing (or, in `--check`, if nothing has drifted), 1 in `--check`
mode when GitHub and the files disagree.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
ISSUES_DIR = REPO_ROOT / "docs" / "factory" / "issues"
LABELS_FILE = REPO_ROOT / ".github" / "labels.yml"

FRONTMATTER_RE = re.compile(r"\A---\n(.*?)\n---\n", re.DOTALL)
GITHUB_ISSUE_LINE_RE = re.compile(r"^github_issue:.*$", re.MULTILINE)


class MirrorError(RuntimeError):
    """Raised for problems the caller must see as one clear line, not a traceback."""


@dataclass
class LocalIssue:
    """The state one issue file describes."""

    path: Path
    number: int
    title: str
    milestone: str
    status: str
    agent: str
    checkpoint: int | None
    github_issue: int | None
    body: str
    raw: str

    @property
    def github_title(self) -> str:
        return f"#{self.number:02d} {self.title}"

    @property
    def desired_state(self) -> str:
        return "closed" if self.status == "done" else "open"

    @property
    def labels(self) -> set[str]:
        labels = {
            f"milestone:{self.milestone}",
            f"agent:{self.agent}",
            f"status:{'done' if self.status == 'done' else 'open'}",
        }
        if self.checkpoint is not None:
            labels.add(f"checkpoint:{self.checkpoint}")
        return labels


@dataclass
class Diff:
    """One disagreement between a local issue file and GitHub."""

    number: int
    kind: str
    detail: str

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"#{self.number:02d} {self.kind}: {self.detail}"


def _split_body(text: str) -> str:
    """Return `## What` through the end of `## Acceptance criteria`, nothing past it."""
    after_frontmatter = FRONTMATTER_RE.sub("", text, count=1)
    match = re.search(r"^## What\b", after_frontmatter, re.MULTILINE)
    if not match:
        raise MirrorError("no '## What' section")
    start = match.start()
    stop_match = re.search(r"^## Not in scope\b", after_frontmatter, re.MULTILINE)
    end = stop_match.start() if stop_match else len(after_frontmatter)
    return after_frontmatter[start:end].strip() + "\n"


def parse_issue_file(path: Path) -> LocalIssue:
    raw = path.read_text(encoding="utf-8")
    match = FRONTMATTER_RE.match(raw)
    if not match:
        raise MirrorError(f"{path}: no frontmatter block")
    data = yaml.safe_load(match.group(1)) or {}
    for key in ("issue", "title", "milestone", "status", "agent"):
        if key not in data:
            raise MirrorError(f"{path}: frontmatter is missing '{key}'")
    return LocalIssue(
        path=path,
        number=int(data["issue"]),
        title=str(data["title"]),
        milestone=str(data["milestone"]),
        status=str(data["status"]),
        agent=str(data["agent"]),
        checkpoint=data.get("checkpoint"),
        github_issue=data.get("github_issue"),
        body=_split_body(raw),
        raw=raw,
    )


def load_local_issues(issues_dir: Path) -> list[LocalIssue]:
    issues = [parse_issue_file(p) for p in sorted(issues_dir.glob("*.md"))]
    if not issues:
        raise MirrorError(f"no issue files under {issues_dir}")
    return issues


def write_github_issue_field(issue: LocalIssue, number: int) -> None:
    """Write `github_issue: NN` into the frontmatter. The only field this script may write."""
    match = FRONTMATTER_RE.match(issue.raw)
    assert match
    frontmatter = match.group(1)
    line = f"github_issue: {number}"
    if GITHUB_ISSUE_LINE_RE.search(frontmatter):
        new_frontmatter = GITHUB_ISSUE_LINE_RE.sub(line, frontmatter, count=1)
    else:
        new_frontmatter = frontmatter + "\n" + line
    new_raw = f"---\n{new_frontmatter}\n---\n" + issue.raw[match.end() :]
    if new_raw != issue.raw:
        issue.path.write_text(new_raw, encoding="utf-8", newline="\n")


class GitHub:
    """A thin wrapper over the `gh` CLI. Every call goes through here so tests can fake it."""

    def __init__(self, repo: str, token: str, runner=subprocess.run) -> None:
        self.repo = repo
        self._env = dict(os.environ)
        self._env["GH_TOKEN"] = token
        self._runner = runner

    def _gh(self, args: list[str], input_text: str | None = None) -> str:
        result = self._runner(
            ["gh", *args],
            input=input_text,
            env=self._env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if result.returncode != 0:
            raise MirrorError(
                f"gh {' '.join(args)} failed: {result.stderr.strip() or result.stdout.strip()}"
            )
        return result.stdout

    def api(self, method: str, path: str, paginate: bool = False) -> object:
        args = ["api", path, "-X", method]
        if paginate:
            args += ["--paginate", "--slurp"]
        out = self._gh(args)
        if not out.strip():
            return None
        result = json.loads(out)
        if paginate:
            # --slurp wraps each page in an outer array; flatten the pages of arrays into one list.
            flattened: list = []
            for page in result:
                flattened.extend(page)
            return flattened
        return result

    def _api_with_body(self, method: str, path: str, body: dict) -> object:
        args = ["api", path, "-X", method, "--input", "-"]
        out = self._gh(args, input_text=json.dumps(body))
        return json.loads(out) if out.strip() else None

    def list_milestones(self) -> list[dict]:
        return (
            self.api("GET", f"repos/{self.repo}/milestones?state=all&per_page=100", paginate=True)
            or []
        )

    def create_milestone(self, title: str) -> dict:
        return self._api_with_body("POST", f"repos/{self.repo}/milestones", {"title": title})

    def list_issues(self) -> list[dict]:
        raw = (
            self.api("GET", f"repos/{self.repo}/issues?state=all&per_page=100", paginate=True) or []
        )
        return [i for i in raw if "pull_request" not in i]

    def create_issue(self, body: dict) -> dict:
        return self._api_with_body("POST", f"repos/{self.repo}/issues", body)

    def update_issue(self, number: int, body: dict) -> dict:
        return self._api_with_body("PATCH", f"repos/{self.repo}/issues/{number}", body)

    def ensure_labels(self, labels_file: Path) -> None:
        if not labels_file.exists():
            return
        defs = yaml.safe_load(labels_file.read_text(encoding="utf-8")) or []
        for entry in defs:
            args = ["label", "create", entry["name"], "--force", "-R", self.repo]
            if "color" in entry:
                args += ["--color", str(entry["color"])]
            if "description" in entry:
                args += ["--description", str(entry["description"])]
            self._gh(args)


def infer_repo() -> str:
    result = subprocess.run(
        ["git", "remote", "get-url", "origin"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise MirrorError("no 'origin' remote; pass --repo OWNER/NAME")
    url = result.stdout.strip()
    match = re.search(r"[:/]([^/:]+)/([^/]+?)(\.git)?$", url)
    if not match:
        raise MirrorError(f"cannot parse owner/repo from remote url {url!r}")
    return f"{match.group(1)}/{match.group(2)}"


def find_remote_issue(local: LocalIssue, remote_issues: list[dict]) -> dict | None:
    if local.github_issue is not None:
        for remote in remote_issues:
            if remote["number"] == local.github_issue:
                return remote
    prefix = f"#{local.number:02d} "
    for remote in remote_issues:
        if remote["title"].startswith(prefix):
            return remote
    return None


def diff_issue(
    local: LocalIssue, remote: dict | None, milestone_numbers: dict[str, int]
) -> list[Diff]:
    diffs: list[Diff] = []
    if remote is None:
        diffs.append(Diff(local.number, "missing", "no matching GitHub issue"))
        return diffs
    if remote["title"] != local.github_title:
        diffs.append(
            Diff(
                local.number, "title", f"local {local.github_title!r} != github {remote['title']!r}"
            )
        )
    if (remote.get("body") or "").strip() != local.body.strip():
        diffs.append(Diff(local.number, "body", "local body differs from github body"))
    remote_labels = {label_name(label_obj) for label_obj in remote.get("labels", [])}
    if remote_labels != local.labels:
        diffs.append(
            Diff(
                local.number,
                "labels",
                f"local {sorted(local.labels)} != github {sorted(remote_labels)}",
            )
        )
    remote_milestone = remote.get("milestone")
    wanted_number = milestone_numbers.get(local.milestone)
    if (remote_milestone or {}).get("number") != wanted_number:
        diffs.append(
            Diff(
                local.number,
                "milestone",
                f"local {local.milestone!r} != github {(remote_milestone or {}).get('title')!r}",
            )
        )
    if remote["state"] != local.desired_state:
        if remote["state"] == "closed" and local.desired_state == "open":
            diffs.append(
                Diff(
                    local.number,
                    "state-drift",
                    "GitHub issue was closed by hand; local file still says "
                    f"status: {local.status}. Not reopening the GitHub issue "
                    "and not touching the local file: fix one of the two by hand.",
                )
            )
        else:
            diffs.append(
                Diff(
                    local.number,
                    "state",
                    f"local {local.desired_state} != github {remote['state']}",
                )
            )
    return diffs


def label_name(label_obj) -> str:
    if isinstance(label_obj, str):
        return label_obj
    return label_obj["name"]


def ensure_milestones(
    gh: GitHub, wanted_titles: list[str], apply: bool
) -> tuple[dict[str, int], list[Diff]]:
    existing = {m["title"]: m["number"] for m in gh.list_milestones()}
    diffs: list[Diff] = []
    numbers = dict(existing)
    for title in wanted_titles:
        if title in existing:
            continue
        if apply:
            created = gh.create_milestone(title)
            numbers[title] = created["number"]
        else:
            diffs.append(Diff(0, "missing-milestone", f"no GitHub milestone {title!r}"))
    return numbers, diffs


def run(repo: str, issues_dir: Path, check: bool, token: str, runner=subprocess.run) -> int:
    gh = GitHub(repo, token, runner=runner)
    local_issues = load_local_issues(issues_dir)

    if not check:
        gh.ensure_labels(LABELS_FILE)

    milestone_titles = sorted({issue.milestone for issue in local_issues})
    milestone_numbers, milestone_diffs = ensure_milestones(gh, milestone_titles, apply=not check)

    remote_issues = gh.list_issues()

    all_diffs: list[Diff] = list(milestone_diffs)
    for local in local_issues:
        remote = find_remote_issue(local, remote_issues)
        diffs = diff_issue(local, remote, milestone_numbers)
        all_diffs.extend(diffs)

        if check:
            continue

        state_drift = any(d.kind == "state-drift" for d in diffs)
        wanted_body = {
            "title": local.github_title,
            "body": local.body,
            "labels": sorted(local.labels),
            "milestone": milestone_numbers.get(local.milestone),
        }
        if remote is None:
            created = gh.create_issue(wanted_body)
            if local.desired_state == "closed":
                gh.update_issue(created["number"], {"state": "closed"})
            write_github_issue_field(local, created["number"])
        else:
            needs_update = any(d.kind in ("title", "body", "labels", "milestone") for d in diffs)
            if needs_update:
                gh.update_issue(remote["number"], wanted_body)
            if not state_drift and remote["state"] != local.desired_state:
                gh.update_issue(remote["number"], {"state": local.desired_state})
            write_github_issue_field(local, remote["number"])

    for diff in all_diffs:
        stream = sys.stdout if not check else sys.stderr
        print(str(diff), file=stream)

    if check:
        return 1 if all_diffs else 0

    drifts = [d for d in all_diffs if d.kind == "state-drift"]
    for d in drifts:
        print(f"drift (reported, not corrected): {d}", file=sys.stderr)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=None, help="OWNER/NAME; inferred from 'origin' if absent")
    parser.add_argument("--issues-dir", type=Path, default=ISSUES_DIR)
    parser.add_argument(
        "--check", action="store_true", help="report drift, change nothing, exit 1 if any"
    )
    args = parser.parse_args(argv)

    token = os.environ.get("GH_TOKEN")
    if not token:
        print("mirror_github: GH_TOKEN is not set in the environment.", file=sys.stderr)
        return 1

    try:
        repo = args.repo or infer_repo()
        return run(repo, args.issues_dir, args.check, token)
    except MirrorError as exc:
        print(f"mirror_github: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
