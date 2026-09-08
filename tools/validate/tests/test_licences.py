# SPDX-License-Identifier: MPL-2.0
"""`python -m tools.validate --licences`: issue 5.

docs/standards/testing.md: a gate is not proven by watching it pass. Every check here is proven
by two runs: once over a small tree with every header in place, where it reports nothing, and
once over the same tree with one header stripped, where it reports that exact file. Nothing here
writes inside the repository; every tree is a `tmp_path` this test builds itself.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from tools.validate.cli import (
    check_cli_notice,
    check_cpp_licence_headers,
    check_generated_licence_headers,
    check_licences,
    check_python_licence_headers,
    main,
    run,
)

SPDX_CPP = "// SPDX-License-Identifier: MPL-2.0\n"
SPDX_PY = "# SPDX-License-Identifier: MPL-2.0\n"
GENERATED_LINE = "// Licence: CC BY-SA 4.0 (data). See data/LICENSE.\n"

NOTICE_TEXT = (
    "verstaan CLI\n\n"
    "Engine: Mozilla Public License, Version 2.0 (MPL-2.0).\n"
    "Data: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0),\n"
    "derived from the UNL Archive.\n"
)


def _tree(tmp_path: Path) -> Path:
    """A minimal repo shape with every header already correct."""
    root = tmp_path / "repo"
    (root / "engine" / "include" / "verstaan").mkdir(parents=True)
    (root / "engine" / "src").mkdir(parents=True)
    (root / "engine" / "generated" / "fixture").mkdir(parents=True)
    (root / "apps" / "cli" / "src").mkdir(parents=True)
    (root / "tools" / "validate").mkdir(parents=True)

    (root / "engine" / "include" / "verstaan" / "engine.hpp").write_text(
        SPDX_CPP + "#pragma once\n", encoding="utf-8"
    )
    (root / "engine" / "src" / "engine.cpp").write_text(
        SPDX_CPP + '#include "verstaan/engine.hpp"\n', encoding="utf-8"
    )
    (root / "apps" / "cli" / "src" / "main.cpp").write_text(
        SPDX_CPP + "int main() { return 0; }\n", encoding="utf-8"
    )
    (root / "engine" / "generated" / "fixture" / "tables.hpp").write_text(
        GENERATED_LINE + "#pragma once\n", encoding="utf-8"
    )
    (root / "engine" / "generated" / "fixture" / "tables.cpp").write_text(
        GENERATED_LINE + '#include "tables.hpp"\n', encoding="utf-8"
    )
    (root / "tools" / "validate" / "cli.py").write_text(
        SPDX_PY + '"""Stand-in."""\n', encoding="utf-8"
    )
    (root / "apps" / "cli" / "NOTICE").write_text(NOTICE_TEXT, encoding="utf-8")
    return root


def test_clean_tree_has_no_errors(tmp_path: Path):
    root = _tree(tmp_path)
    assert check_licences(root) == []


def test_cpp_header_missing_is_reported(tmp_path: Path):
    root = _tree(tmp_path)
    path = root / "engine" / "src" / "engine.cpp"
    path.write_text('#include "verstaan/engine.hpp"\n', encoding="utf-8")
    errors = check_cpp_licence_headers(root)
    assert any("engine/src/engine.cpp: missing" in e for e in errors)


def test_cpp_header_is_not_required_under_generated(tmp_path: Path):
    root = _tree(tmp_path)
    # A file with no SPDX header at all under engine/generated/ is not an MPL-2.0 miss: it is
    # checked by check_generated_licence_headers instead, never by check_cpp_licence_headers.
    assert check_cpp_licence_headers(root) == []


def test_python_header_missing_is_reported(tmp_path: Path):
    root = _tree(tmp_path)
    path = root / "tools" / "validate" / "cli.py"
    path.write_text('"""Stand-in."""\n', encoding="utf-8")
    errors = check_python_licence_headers(root)
    assert any("tools/validate/cli.py: missing" in e for e in errors)


def test_generated_licence_missing_is_reported(tmp_path: Path):
    root = _tree(tmp_path)
    path = root / "engine" / "generated" / "fixture" / "tables.hpp"
    path.write_text("#pragma once\n", encoding="utf-8")
    errors = check_generated_licence_headers(root)
    assert any("engine/generated/fixture/tables.hpp: missing" in e for e in errors)


def test_notice_missing_is_reported(tmp_path: Path):
    root = _tree(tmp_path)
    (root / "apps" / "cli" / "NOTICE").unlink()
    assert check_cli_notice(root) == ["apps/cli/NOTICE: missing"]


def test_notice_missing_a_licence_name_is_reported(tmp_path: Path):
    root = _tree(tmp_path)
    (root / "apps" / "cli" / "NOTICE").write_text(
        "verstaan CLI\n\nEngine: Mozilla Public License, Version 2.0 (MPL-2.0).\n",
        encoding="utf-8",
    )
    errors = check_cli_notice(root)
    assert any("CC BY-SA 4.0" in e for e in errors)
    assert any("UNL Archive" in e for e in errors)


def test_run_licences_exits_nonzero_on_a_broken_tree(tmp_path: Path, capsys):
    root = _tree(tmp_path)
    (root / "engine" / "src" / "engine.cpp").write_text(
        '#include "verstaan/engine.hpp"\n', encoding="utf-8"
    )
    assert run("licences", root) == 1
    err = capsys.readouterr().err
    assert "engine/src/engine.cpp: missing" in err


def test_run_licences_exits_zero_on_a_clean_tree(tmp_path: Path):
    root = _tree(tmp_path)
    assert run("licences", root) == 0


def test_licences_flag_is_wired_into_main(tmp_path: Path, monkeypatch, capsys):
    root = _tree(tmp_path)
    (root / "engine" / "src" / "engine.cpp").write_text(
        '#include "verstaan/engine.hpp"\n', encoding="utf-8"
    )
    monkeypatch.setattr("tools.validate.cli.find_repo_root", lambda: root)
    assert main(["--licences"]) == 1
    err = capsys.readouterr().err
    assert "engine/src/engine.cpp: missing" in err


def test_licences_is_mutually_exclusive_with_changed():
    with pytest.raises(SystemExit) as exc:
        main(["--changed", "--licences"])
    assert exc.value.code != 0
