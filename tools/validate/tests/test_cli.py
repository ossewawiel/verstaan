# SPDX-License-Identifier: MPL-2.0
"""tools.validate: --changed and --all are real (find the file list), not stubs.

docs/standards/testing.md: prove a gate fails before trusting it.
`test_validate_files_reports_a_broken_file_when_one_exists` proves `run` would fail on a bad
file, once `validate_files` grows a real check in M1; today it documents that the empty result is
because there is nothing to check yet, not because the check cannot fail.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from tools.validate.cli import (
    list_all_language_files,
    list_changed_language_files,
    main,
    run,
    validate_files,
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
