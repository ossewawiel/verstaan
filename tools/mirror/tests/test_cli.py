# SPDX-License-Identifier: MPL-2.0
"""tools.mirror CLI: usage, version, and the credential refusal.

docs/standards/testing.md: prove a gate fails before trusting it. `test_help_and_version_still_ok`
proves the refusal does not also reject legitimate arguments; the `test_refuses_*` cases prove the
refusal actually fires, not just that a clean run passes.
"""

from __future__ import annotations

import os

import pytest

from tools.mirror.cli import main, read_credentials, reject_credential_args


def test_help_exits_zero(capsys):
    with pytest.raises(SystemExit) as exc:
        main(["--help"])
    assert exc.value.code == 0
    out = capsys.readouterr().out
    assert "usage" in out.lower()


def test_version_exits_zero(capsys):
    with pytest.raises(SystemExit) as exc:
        main(["--version"])
    assert exc.value.code == 0


def test_no_args_exits_zero():
    assert main([]) == 0


@pytest.mark.parametrize(
    "argv",
    [
        ["--unl-user", "bob"],
        ["--unl-pass", "hunter2"],
        ["--user=bob"],
        ["--pass=hunter2"],
        ["UNL_USER=bob"],
        ["UNL_PASS=hunter2"],
    ],
)
def test_refuses_credential_arguments(argv, capsys):
    assert main(argv) == 2
    err = capsys.readouterr().err
    assert "UNL_USER" in err or "UNL_PASS" in err or "environment" in err


def test_reject_credential_args_returns_none_for_clean_argv():
    assert reject_credential_args(["--version"]) is None
    assert reject_credential_args([]) is None


def test_credentials_come_from_environment_only(monkeypatch):
    monkeypatch.setenv("UNL_USER", "alice")
    monkeypatch.setenv("UNL_PASS", "secret")
    assert read_credentials() == ("alice", "secret")


def test_credentials_missing_from_environment(monkeypatch):
    monkeypatch.delenv("UNL_USER", raising=False)
    monkeypatch.delenv("UNL_PASS", raising=False)
    assert read_credentials() == (None, None)


def test_environment_is_untouched_by_a_clean_run(monkeypatch):
    monkeypatch.delenv("UNL_USER", raising=False)
    monkeypatch.delenv("UNL_PASS", raising=False)
    assert main([]) == 0
    assert "UNL_USER" not in os.environ
    assert "UNL_PASS" not in os.environ
