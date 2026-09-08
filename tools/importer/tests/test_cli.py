"""tools.importer CLI: usage and version, the M0 skeleton (SPEC.md §3.2)."""

from __future__ import annotations

import pytest

from tools.importer.cli import main


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


def test_no_args_exits_zero():
    assert main([]) == 0
