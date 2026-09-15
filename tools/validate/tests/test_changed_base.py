# SPDX-License-Identifier: MPL-2.0
"""`--changed --base <ref>`: the gate validates only the data a branch touched, against its
committed history, not the uncommitted working tree (issue 168).

The trap issue 168 names by name: `git_changed_paths` reads `git status --porcelain`, the
uncommitted working tree. On a branch whose work is already committed -- every branch on a CI
runner, and any local branch after `git commit` -- that list is empty, so naively swapping
`--all` for `--changed` in the gate would validate nothing and report success. `test_the_trap_*`
below reproduces that empty list on a real, fully-committed branch, so the trap is proven, not
just described. `git_diff_against_base` is the fix: it reads `git diff <ref>...HEAD`, committed
history against the merge base, and still finds the file.

Real git repositories, not mocked subprocess calls: `git diff <ref>...HEAD` needs the three-dot
merge-base form to work, and only a real repo with a real fork point proves that. The fixture
store (`tests/fixtures/languages/xxa`, issue 4) is already known-valid (`test_fixture_languages.py`
proves it), so it stands in for a real language store without touching `data/languages/`.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from functools import partial
from pathlib import Path

from tools.validate.cli import (
    git_changed_paths,
    git_diff_against_base,
    list_changed_language_files,
    run,
    validate_files,
)

FIXTURE = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "languages" / "xxa"


def _git(repo: Path, *args: str) -> subprocess.CompletedProcess:
    result = subprocess.run(
        ["git", *args],
        cwd=repo,
        capture_output=True,
        text=True,
        check=True,
        env={
            "GIT_AUTHOR_NAME": "t",
            "GIT_AUTHOR_EMAIL": "t@example.com",
            "GIT_COMMITTER_NAME": "t",
            "GIT_COMMITTER_EMAIL": "t@example.com",
            "PATH": os.environ.get("PATH", ""),
        },
    )
    return result


def _init_repo_with_fixture_store(tmp_path: Path) -> Path:
    """A real git repo, `main` at its only commit, holding a copy of the xxa fixture store under
    `data/languages/xxa/` -- known-valid, per `test_fixture_languages.py`."""
    repo = tmp_path / "repo"
    (repo / "data" / "languages").mkdir(parents=True)
    shutil.copytree(FIXTURE, repo / "data" / "languages" / "xxa")
    _git(repo, "init", "-q", "-b", "main")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "base: known-valid xxa store")
    return repo


def test_the_trap_working_tree_status_is_empty_once_the_branch_is_committed(tmp_path: Path):
    """Issue 168's named trap, reproduced: after `git commit`, `git status --porcelain` (what
    `--changed` alone reads) has nothing left to say, on a branch that plainly changed a file."""
    repo = _init_repo_with_fixture_store(tmp_path)
    _git(repo, "checkout", "-q", "-b", "feature")
    (repo / "data" / "languages" / "xxa" / "dictionary" / "b.yaml").write_text(
        "broken: yes\n", encoding="utf-8"
    )
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "feature: break b.yaml")

    assert git_changed_paths(repo) == []
    assert list_changed_language_files(repo, git_changed_paths) == []
    # The trap in full: --changed alone reports success on a branch that broke a file.
    assert run("changed", repo, changed_paths=git_changed_paths) == 0


def test_diff_against_base_finds_a_file_committed_on_the_branch(tmp_path: Path):
    repo = _init_repo_with_fixture_store(tmp_path)
    _git(repo, "checkout", "-q", "-b", "feature")
    (repo / "data" / "languages" / "xxa" / "dictionary" / "b.yaml").write_text(
        "broken: yes\n", encoding="utf-8"
    )
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "feature: break b.yaml")

    changed = git_diff_against_base(repo, "main")
    assert changed == ["data/languages/xxa/dictionary/b.yaml"]


def test_a_docs_only_branch_validates_zero_files_and_exits_zero(tmp_path: Path):
    repo = _init_repo_with_fixture_store(tmp_path)
    _git(repo, "checkout", "-q", "-b", "docs-only")
    (repo / "README.md").write_text("docs only, changed\n", encoding="utf-8")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "docs: touch nothing under data/languages")

    files = list_changed_language_files(repo, partial(git_diff_against_base, base_ref="main"))
    assert files == []
    assert validate_files(files) == []
    assert run("changed", repo, changed_paths=partial(git_diff_against_base, base_ref="main")) == 0


def test_a_broken_value_in_a_touched_file_fails_the_gate_via_base_ref(tmp_path: Path):
    """The fix: the same branch as the trap test above, but read through `git_diff_against_base`
    instead of `git_changed_paths`. The file is found, the schema check on it fails, and `run`
    exits 1 -- the gate now catches on a committed branch what the working-tree read above could
    not."""
    repo = _init_repo_with_fixture_store(tmp_path)
    _git(repo, "checkout", "-q", "-b", "feature")
    broken = repo / "data" / "languages" / "xxa" / "dictionary" / "b.yaml"
    broken.write_text("broken: yes\n", encoding="utf-8")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "feature: break b.yaml")

    changed_paths = partial(git_diff_against_base, base_ref="main")
    files = list_changed_language_files(repo, changed_paths)
    assert files == [broken]
    errors = validate_files(files)
    assert errors, "a schema-broken dictionary file must report at least one error"

    assert run("changed", repo, changed_paths=changed_paths) == 1


def test_an_untouched_broken_file_in_the_same_store_is_the_only_thing_not_listed(tmp_path: Path):
    """`b.yaml` breaks on `main` itself, so the store it sits in is not clean. The branch never
    touches `b.yaml` again -- it only touches `meta.yaml`, a different file in the same store.
    `list_changed_language_files` (the file list `run("changed", ...)` builds from) names only
    `meta.yaml`: a file the branch never touched stays out of that list even though it sits in
    the same, already-broken store as a file the branch did touch.

    The list is not the whole story. `validate_files` maps each listed path to its store root
    (`_store_roots`) and validates that store whole, so `b.yaml`'s error is reported anyway, and
    `run` still exits 1 -- naming only `meta.yaml` in the diff does not un-break `b.yaml`. That
    store-wide cost is the documented, correct behaviour (issue 168 acceptance criteria); this
    test records it rather than implying the untouched break goes unseen."""
    repo = _init_repo_with_fixture_store(tmp_path)
    broken = repo / "data" / "languages" / "xxa" / "dictionary" / "b.yaml"
    broken.write_text("broken: yes\n", encoding="utf-8")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "base: break b.yaml on main too")

    _git(repo, "checkout", "-q", "-b", "feature")
    meta = repo / "data" / "languages" / "xxa" / "meta.yaml"
    meta.write_text(meta.read_text(encoding="utf-8") + "\n# a harmless comment\n", encoding="utf-8")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "feature: touch only meta.yaml")

    changed_paths = partial(git_diff_against_base, base_ref="main")
    files = list_changed_language_files(repo, changed_paths)
    assert files == [meta]
    # The store-wide truth: b.yaml's break is still in the same store as meta.yaml, so it is
    # still reported, and the gate still fails, even though b.yaml never appears in `files`.
    assert run("changed", repo, changed_paths=changed_paths) == 1
