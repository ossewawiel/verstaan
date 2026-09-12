# SPDX-License-Identifier: MPL-2.0
"""tools.mirror CLI: usage, version, and the credential refusal.

docs/standards/testing.md: prove a gate fails before trusting it. `test_help_and_version_still_ok`
proves the refusal does not also reject legitimate arguments; the `test_refuses_*` cases prove the
refusal actually fires, not just that a clean run passes.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from tools.mirror.cli import main, read_credentials, reject_credential_args
from tools.mirror.manifest import append_entries
from tools.mirror.retry import LanguageRetryReport


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


def test_retry_exits_4_when_the_language_still_has_a_timeout_path_left(monkeypatch):
    """The chosen language is not fully drained after the run (issue 118); `cli.py` must surface
    that as its own exit code, distinct from a clean drain."""
    monkeypatch.setenv("UNL_USER", "wawiel")
    monkeypatch.setenv("UNL_PASS", "hunter2")

    def fake_run_retry_for_language(*args, **kwargs):
        return LanguageRetryReport(
            language="eng", passes_used=3, landed=5, still_stuck=2, pass_summaries=["pass 1: ..."]
        )

    monkeypatch.setattr("tools.mirror.cli.run_retry_for_language", fake_run_retry_for_language)

    assert main(["retry", "--language", "eng"]) == 4


def test_retry_exits_0_when_the_language_has_no_timeout_path_left(monkeypatch):
    monkeypatch.setenv("UNL_USER", "wawiel")
    monkeypatch.setenv("UNL_PASS", "hunter2")

    def fake_run_retry_for_language(*args, **kwargs):
        return LanguageRetryReport(
            language="eng", passes_used=1, landed=2, still_stuck=0, pass_summaries=["pass 1: ..."]
        )

    monkeypatch.setattr("tools.mirror.cli.run_retry_for_language", fake_run_retry_for_language)

    assert main(["retry", "--language", "eng"]) == 0


def test_retry_prints_one_summary_line_per_pass_and_a_final_summary_line(monkeypatch, capsys):
    monkeypatch.setenv("UNL_USER", "wawiel")
    monkeypatch.setenv("UNL_PASS", "hunter2")

    def fake_run_retry_for_language(*args, **kwargs):
        return LanguageRetryReport(
            language="eng",
            passes_used=2,
            landed=3,
            still_stuck=0,
            pass_summaries=["pass 1: attempted: 1", "pass 2: attempted: 1"],
        )

    monkeypatch.setattr("tools.mirror.cli.run_retry_for_language", fake_run_retry_for_language)

    assert main(["retry", "--language", "eng"]) == 0
    out = capsys.readouterr().out.splitlines()
    assert out[0] == "pass 1: attempted: 1"
    assert out[1] == "pass 2: attempted: 1"
    assert out[-1] == "language: eng, passes: 2, landed: 3, still stuck: 0"


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


_REPO_ROOT = Path(__file__).resolve().parents[3]


def test_stuck_next_prints_a_priority_language_against_the_real_manifest(capsys, monkeypatch):
    """`stuck --next` against the current repository manifest names a `mirror.toml`
    `[retry] priority` language (issue 118), or falls back to the stuck language with the most
    base forms once the priority list is drained. Issues 118-122's live runs have drained one
    language after another — the exact answer keeps moving as later quests run, so this test
    only proves the wiring reads the real files and prints something, not which language. The
    fixture tests in `test_stuck.py` prove the ordering and fallback rules themselves against a
    manifest that does not move."""
    monkeypatch.chdir(_REPO_ROOT)

    exit_code = main(["stuck", "--next"])

    assert exit_code == 0
    assert capsys.readouterr().out.strip()


def _write_fixture_mirror_toml(path, priority):
    quoted = ", ".join(f'"{lang}"' for lang in priority)
    path.write_text(
        '[[source]]\nname = "pages"\nbase_url = "https://x"\nlicence = "CC"\n'
        'licence_url = "https://x"\n'
        '[[source]]\nname = "wiki"\napi_url = "https://x"\nlicence = "CC"\n'
        'licence_url = "https://x"\n'
        '[[source]]\nname = "unlarium"\nlicence = "CC"\nlicence_url = "https://x"\n'
        f"[retry]\npriority = [{quoted}]\n",
        encoding="utf-8",
    )


def test_stuck_next_exits_1_and_prints_nothing_when_no_language_is_stuck(tmp_path, capsys):
    config_path = tmp_path / "mirror.toml"
    _write_fixture_mirror_toml(config_path, ["eng", "dut"])
    manifest_path = tmp_path / "manifest.jsonl"
    append_entries(manifest_path, [{"path": "exports/eng/a.zip", "language": "eng"}])  # landed

    exit_code = main(
        ["stuck", "--next", "--config", str(config_path), "--manifest", str(manifest_path)]
    )

    assert exit_code == 1
    assert capsys.readouterr().out == ""
