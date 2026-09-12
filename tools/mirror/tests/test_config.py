# SPDX-License-Identifier: MPL-2.0
"""`mirror.toml` parsing (SPEC.md §3.1)."""

from __future__ import annotations

from pathlib import Path

from tools.mirror.config import load_config

_MIRROR_TOML = Path(__file__).resolve().parents[3] / "mirror.toml"


def test_loads_the_real_mirror_toml():
    config = load_config(_MIRROR_TOML)
    assert config.host == "unlarchive.org"
    assert "verstaan-mirror" in config.user_agent
    assert "github.com/ossewawiel/verstaan" in config.user_agent
    assert config.rate_limit_seconds == 1.0
    assert config.retries == 3


def test_unlarium_source_links_cc_by_sa_2_5_ch():
    config = load_config(_MIRROR_TOML)
    assert "2.5" in config.linked_static.licence
    assert "ch" in config.linked_static.licence_url.lower()


def test_pages_source_links_cc_by_sa_4_0():
    config = load_config(_MIRROR_TOML)
    assert "4.0" in config.pages.licence
    assert "4.0" in config.pages.licence_url


def test_retry_priority_lists_the_developer_named_languages_english_first():
    config = load_config(_MIRROR_TOML)
    assert config.retry_priority == ("eng", "dut", "ger", "fre")


def test_missing_required_source_raises(tmp_path):
    bad = tmp_path / "mirror.toml"
    bad.write_text('[mirror]\nhost = "unlarchive.org"\n', encoding="utf-8")
    try:
        load_config(bad)
    except ValueError as exc:
        assert "pages" in str(exc)
    else:
        raise AssertionError("expected ValueError for a mirror.toml missing [[source]] pages")
