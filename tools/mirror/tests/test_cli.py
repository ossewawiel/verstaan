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
from tools.mirror.manifest import append_entries
from tools.mirror.retry import RetryReport


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
        ["login", "--unl-user", "bob"],
        ["login", "--pass=hunter2"],
        ["retry", "--unl-user", "bob"],
        ["retry", "--pass=hunter2"],
    ],
)
def test_refuses_credential_arguments(argv, capsys):
    assert main(argv) == 2
    err = capsys.readouterr().err
    assert "UNL_USER" in err or "UNL_PASS" in err or "environment" in err


def test_login_exits_3_with_one_line_when_credentials_are_missing(monkeypatch, capsys):
    monkeypatch.delenv("UNL_USER", raising=False)
    monkeypatch.delenv("UNL_PASS", raising=False)
    assert main(["login"]) == 3
    err = capsys.readouterr().err.strip().splitlines()
    assert len(err) == 1
    assert "UNL_USER" in err[0] and "UNL_PASS" in err[0]


def test_login_exits_3_when_only_one_credential_is_set(monkeypatch, capsys):
    monkeypatch.setenv("UNL_USER", "wawiel")
    monkeypatch.delenv("UNL_PASS", raising=False)
    assert main(["login"]) == 3


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


def test_retry_exits_3_with_one_line_when_credentials_are_missing(monkeypatch, capsys):
    monkeypatch.delenv("UNL_USER", raising=False)
    monkeypatch.delenv("UNL_PASS", raising=False)
    assert main(["retry"]) == 3
    err = capsys.readouterr().err.strip().splitlines()
    assert len(err) == 1
    assert "UNL_USER" in err[0] and "UNL_PASS" in err[0]


def test_retry_exits_3_when_only_one_credential_is_set(monkeypatch, capsys):
    monkeypatch.setenv("UNL_USER", "wawiel")
    monkeypatch.delenv("UNL_PASS", raising=False)
    assert main(["retry"]) == 3


def test_retry_exits_4_when_the_report_says_rate_limited(monkeypatch):
    """unlarchive.org's CDN 429 stops the run (issue 117); `cli.py` must surface that as its own
    exit code, distinct from every other outcome."""
    monkeypatch.setenv("UNL_USER", "wawiel")
    monkeypatch.setenv("UNL_PASS", "hunter2")

    def fake_run_retry(*args, **kwargs):
        return RetryReport(attempted=2, landed=1, still_stuck=0, total_bytes=10, rate_limited=True)

    monkeypatch.setattr("tools.mirror.cli.run_retry", fake_run_retry)

    assert main(["retry"]) == 4


def test_retry_exits_0_when_the_report_is_not_rate_limited(monkeypatch):
    monkeypatch.setenv("UNL_USER", "wawiel")
    monkeypatch.setenv("UNL_PASS", "hunter2")

    def fake_run_retry(*args, **kwargs):
        return RetryReport(attempted=2, landed=2, still_stuck=0, total_bytes=10)

    monkeypatch.setattr("tools.mirror.cli.run_retry", fake_run_retry)

    assert main(["retry"]) == 0


def test_stuck_exits_0_with_no_credentials_set_and_makes_no_http_request(
    monkeypatch, tmp_path, capsys
):
    """`stuck` needs no credential and sends no request — proven by patching the CLI's own
    `RateLimitedClient` to fail on any call, so a `stuck` run that ever touched it would fail
    the test loudly rather than silently succeed offline."""
    monkeypatch.delenv("UNL_USER", raising=False)
    monkeypatch.delenv("UNL_PASS", raising=False)

    class ExplodingClient:
        def __init__(self, *args, **kwargs):
            raise AssertionError("stuck must never construct a client")

    monkeypatch.setattr("tools.mirror.cli.RateLimitedClient", ExplodingClient)

    manifest_path = tmp_path / "manifest.jsonl"
    append_entries(
        manifest_path, [{"path": "exports/afr/a.zip", "status": "timeout", "language": "afr"}]
    )

    exit_code = main(["stuck", "--manifest", str(manifest_path)])

    assert exit_code == 0
    out = capsys.readouterr().out
    assert "exports/afr/a.zip" in out
    assert "total: 1 timeout, 0 error" in out


def test_stuck_defaults_to_the_archive_root_manifest(tmp_path, capsys, monkeypatch):
    archive_root = tmp_path / "archive"
    manifest_path = archive_root / "manifest.jsonl"
    append_entries(manifest_path, [])  # no-op: file may not exist, `stuck` must still exit 0
    monkeypatch.chdir(tmp_path)

    exit_code = main(["stuck", "--archive-root", "archive"])

    assert exit_code == 0
    assert capsys.readouterr().out.strip() == "total: 0 timeout, 0 error"
