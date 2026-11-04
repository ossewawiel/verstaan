# SPDX-License-Identifier: MPL-2.0
"""tiers.toml holds what ADR 0028 and SPEC.md §7 say it holds."""

from __future__ import annotations

import re
import tomllib
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture(scope="module")
def config() -> dict:
    return tomllib.loads((ROOT / "tiers.toml").read_text(encoding="utf-8"))


def spec_section_7_budgets() -> dict[str, int | str]:
    """Each tier's RAM budget, read from the table in SPEC.md §7."""
    text = (ROOT / "docs/factory/SPEC.md").read_text(encoding="utf-8")
    section = text.split("## 7. Tiers", 1)[1]
    budgets: dict[str, int | str] = {}
    for line in section.splitlines():
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if cells[0] not in {"basic", "phone", "connected"}:
            continue
        budget = re.search(r"(\d+) MB", cells[-1])
        budgets[cells[0]] = int(budget.group(1)) if budget else cells[-1]
    return budgets


def test_names_exactly_the_three_tiers(config):
    assert set(config["tiers"]) == {"basic", "phone", "connected"}


def test_the_fixture_build_is_not_a_tier(config):
    assert "fixture" not in config["tiers"]
    assert config["fixture"]["languages"] == ["xxa", "xxb"]
    assert config["fixture"]["store_root"] == "tests/fixtures/languages"
    assert config["fixture"]["dictionary"] == "full"


def test_basic_holds_two_languages_and_a_positive_n(config):
    basic = config["tiers"]["basic"]
    assert basic["languages"] == ["eng", "afr"]
    assert basic["dictionary"] == "top_n"
    assert isinstance(basic["n"], int) and not isinstance(basic["n"], bool)
    assert basic["n"] > 0


def test_phone_and_connected_hold_the_full_dictionary_and_no_n(config):
    for name in ("phone", "connected"):
        assert config["tiers"][name]["dictionary"] == "full"
        assert "n" not in config["tiers"][name]
    assert config["tiers"]["phone"]["languages"] == ["eng", "afr"]


def test_connected_holds_every_store_and_no_corpus_table(config):
    connected = config["tiers"]["connected"]
    assert connected["languages"] == "all"
    # Owner, 2026-11-04: corpora arrive when something reads them.
    assert "corpora" not in connected


def test_budgets_are_the_ones_spec_section_7_gives(config):
    budgets = {name: tier["ram_budget_mb"] for name, tier in config["tiers"].items()}
    assert budgets == {"basic": 64, "phone": 256, "connected": "unbounded"}
    assert budgets == spec_section_7_budgets()


def test_git_holds_the_fixture_and_basic_and_no_other_tier(config):
    committed = {name: tier["committed"] for name, tier in config["tiers"].items()}
    assert committed == {"basic": True, "phone": False, "connected": False}
    assert config["fixture"]["committed"] is True


def test_real_stores_compile_on_a_data_or_compiler_change(config):
    paths = config["real_stores"]["compile_when_changed"]
    assert {"data/languages/", "tools/compiler/", "tiers.toml"} <= set(paths)
    # A hand edit of a committed tier must reach gate step 6.
    assert "engine/generated/basic/" in paths
    assert "tests/golden/basic/" in paths
    # The 248-sentence diff runs on phone, so a branch that changes that diff builds phone.
    assert "tests/equivalence/" in paths


def test_real_stores_compile_when_a_store_reader_changes(config):
    paths = config["real_stores"]["compile_when_changed"]
    # Owner, 2026-11-04: both readers. Quest 210 moves read_grammar_file out of
    # rule_interpreter.cpp and corrects this list. Quest 30 adds the table reader.
    assert "engine/src/dictionary_lookup.cpp" in paths
    assert "engine/src/rule_interpreter.cpp" in paths
