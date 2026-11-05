# SPDX-License-Identifier: MPL-2.0
"""The engine's Lu table must agree with Python's unicodedata (ADR 0030).

The table is fixed at Unicode 16.0.0. The test reads the Unicode version of the running Python and
checks the table against it:

- Every code point this version calls `Lu` is in the table, with the same simple lower-case mapping.
- Every other row of the table is a code point this version calls unassigned (`Cn`): the table is
  newer than this Python and holds code points Unicode added later.

On Unicode 16.0.0 the two rules together say the table equals unicodedata. On an older Python
the extra rows are the code points added since. On a newer Python a new `Lu` code point is
missing from the table, and the test fails until the table is regenerated.
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

TABLE = Path(__file__).resolve().parents[3] / "engine" / "src" / "unicode_lu.cpp"
TABLE_UNICODE_VERSION = "16.0.0"
# U+0130 lower-cases to two characters in full mapping; its simple mapping is U+0069.
SIMPLE_LOWER_OVERRIDES = {0x130: 0x69}


def _array(text: str, name: str) -> list[int]:
    body = re.search(rf"{name}\{{\{{(.*?)\}},\s*\}};", text, re.DOTALL)
    assert body is not None, f"{name} not found in {TABLE}"
    return [int(item, 16) for item in re.findall(r"0x[0-9A-Fa-f]+", body.group(1))]


def _engine_rows() -> dict[int, int]:
    text = TABLE.read_text(encoding="utf-8")
    codes = _array(text, "kLuCodes")
    lowers = _array(text, "kLuLower")
    assert len(codes) == len(lowers)
    assert codes == sorted(set(codes)), "kLuCodes must be sorted and unique"
    return dict(zip(codes, lowers, strict=True))


def _python_rows() -> dict[int, int]:
    rows = {}
    for code in range(0x110000):
        ch = chr(code)
        if unicodedata.category(ch) != "Lu":
            continue
        lower = ch.lower()
        if code in SIMPLE_LOWER_OVERRIDES:
            rows[code] = SIMPLE_LOWER_OVERRIDES[code]
        elif len(lower) != 1 or lower == ch:
            rows[code] = 0
        else:
            rows[code] = ord(lower)
    return rows


def _problems(engine: dict[int, int], python: dict[int, int]) -> list[str]:
    problems = []
    for code, lower in python.items():
        if code not in engine:
            problems.append(f"U+{code:04X} is Lu in this Python and missing from the table")
        elif engine[code] != lower:
            problems.append(f"U+{code:04X} maps to U+{engine[code]:04X}, Python says U+{lower:04X}")
    for code in engine:
        if code not in python and unicodedata.category(chr(code)) != "Cn":
            problems.append(f"U+{code:04X} is in the table but is not Lu and not unassigned")
    return problems


def test_table_agrees_with_unicodedata() -> None:
    assert _problems(_engine_rows(), _python_rows()) == []


def test_table_equals_unicodedata_on_the_version_it_was_built_from() -> None:
    if unicodedata.unidata_version != TABLE_UNICODE_VERSION:
        # Older or newer Python: test_table_agrees_with_unicodedata holds the check.
        assert _problems(_engine_rows(), _python_rows()) == []
        return
    assert _engine_rows() == _python_rows()


def test_the_check_fails_on_a_missing_row() -> None:
    engine = _engine_rows()
    del engine[0x41]
    assert _problems(engine, _python_rows())


def test_the_check_fails_on_a_wrong_mapping() -> None:
    engine = _engine_rows()
    engine[0x41] = 0x62
    assert _problems(engine, _python_rows())


def test_the_check_fails_on_an_extra_assigned_row() -> None:
    engine = _engine_rows()
    engine[0x61] = 0  # U+0061 is Ll: assigned, so never an allowed extra
    assert _problems(engine, _python_rows())
