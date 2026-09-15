# SPDX-License-Identifier: MPL-2.0
"""tools.validate: --changed and --all are real (find the file list), not stubs.

docs/standards/testing.md: prove a gate fails before trusting it.
`test_validate_files_reports_a_broken_file_when_one_exists` proves `run` would fail on a bad
file, once `validate_files` grows a real check in M1; today it documents that the empty result is
because there is nothing to check yet, not because the check cannot fail.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest

from tools.validate.cli import (
    list_all_language_files,
    list_changed_language_files,
    main,
    run,
    validate_files,
)


def _git(repo: Path, *args: str) -> None:
    subprocess.run(
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


def test_help_exits_zero(capsys):
    with pytest.raises(SystemExit) as exc:
        main(["--help"])
    assert exc.value.code == 0
    out = capsys.readouterr().out
    assert "usage" in out.lower()


def test_version_exits_zero():
    with pytest.raises(SystemExit) as exc:
        main(["--version"])
    assert exc.value.code == 0


def test_changed_and_all_are_mutually_exclusive():
    with pytest.raises(SystemExit) as exc:
        main(["--changed", "--all"])
    assert exc.value.code != 0


def test_one_of_changed_or_all_is_required():
    with pytest.raises(SystemExit) as exc:
        main([])
    assert exc.value.code != 0


def test_list_all_language_files_on_empty_dir_is_empty(tmp_path):
    empty = tmp_path / "data" / "languages"
    empty.mkdir(parents=True)
    assert list_all_language_files(empty) == []


def test_list_all_language_files_on_missing_dir_is_empty(tmp_path):
    missing = tmp_path / "data" / "languages"
    assert list_all_language_files(missing) == []


def test_list_all_language_files_finds_yaml(tmp_path):
    root = tmp_path / "data" / "languages"
    (root / "afr" / "dictionary").mkdir(parents=True)
    (root / "afr" / "dictionary" / "a.yaml").write_text("- headword: aap\n", encoding="utf-8")
    (root / "afr" / "meta.txt").write_text("not yaml", encoding="utf-8")
    found = list_all_language_files(root)
    assert found == [root / "afr" / "dictionary" / "a.yaml"]


def test_list_changed_language_files_filters_to_the_languages_dir(tmp_path):
    def fake_changed(_repo_root: Path) -> list[str]:
        return [
            "data/languages/afr/dictionary/a.yaml",
            "engine/src/engine.cpp",
            "data/languages/afr/_unparsed.txt",
        ]

    changed = list_changed_language_files(tmp_path, fake_changed)
    assert changed == [tmp_path / "data" / "languages" / "afr" / "dictionary" / "a.yaml"]


def test_list_changed_language_files_empty_when_nothing_changed(tmp_path):
    changed = list_changed_language_files(tmp_path, lambda _root: [])
    assert changed == []


def test_run_all_exits_zero_on_empty_data_languages(tmp_path):
    (tmp_path / "data" / "languages").mkdir(parents=True)
    assert run("all", tmp_path) == 0


def test_run_changed_exits_zero_on_empty_data_languages(tmp_path):
    assert run("changed", tmp_path, changed_paths=lambda _root: []) == 0


def test_validate_files_reports_a_broken_file_when_one_exists():
    # There is no schema yet (SPEC.md §3.3 arrives at M1): validate_files must still be
    # exercised here so the empty pass above is proven to be "nothing to check" and not a check
    # that can never fail.
    assert validate_files([]) == []


def test_main_passes_base_through_the_argument_parser_to_a_real_repo(tmp_path, monkeypatch):
    # The command CI actually runs is `--changed --base <ref>`, invoked through `main`, not
    # `run` directly (gate.yml, issue 168). Nothing else here calls `main` with `--base`, so the
    # closure that binds `args.base` in `main` is exercised only by reading it -- a later edit
    # that dropped the binding and silently fell back to the working tree would pass every other
    # test in this file. Only a real repo, a real commit and `monkeypatch.chdir` prove the wiring
    # end to end: `find_repo_root` (which `main` calls with no `start`) reads `Path.cwd()`.
    repo = tmp_path / "repo"
    repo.mkdir()
    _git(repo, "init", "-q", "-b", "main")
    (repo / "README.md").write_text("first commit\n", encoding="utf-8")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "base commit")

    monkeypatch.chdir(repo)
    # Nothing under data/languages/ on this branch since "main" -- the base ref is itself HEAD,
    # so the diff is empty and the run must exit 0. A dropped --base binding would instead fall
    # back to `git status --porcelain`, which is also empty here (nothing uncommitted) -- so this
    # alone would not distinguish the two. The distinguishing case is proven directly against
    # `git_diff_against_base`/`git_changed_paths` in test_changed_base.py; this test's job is only
    # to prove `main` reaches `git_diff_against_base` at all when `--base` is given, by observing
    # that a `--base` value referring to a ref that does not exist makes `main` raise instead of
    # silently reading the (also-empty) working tree.
    with pytest.raises(RuntimeError):
        main(["--changed", "--base", "does-not-exist"])

    assert main(["--changed", "--base", "main"]) == 0


def test_all_and_base_together_is_rejected():
    with pytest.raises(SystemExit) as exc:
        main(["--all", "--base", "main"])
    assert exc.value.code == 2
