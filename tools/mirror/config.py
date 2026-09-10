# SPDX-License-Identifier: MPL-2.0
"""Read `mirror.toml` (SPEC.md §3.1): the sources, the host, the rate limit."""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class PagesSource:
    name: str
    base_url: str
    entry_page: str
    licence: str
    licence_url: str


@dataclass(frozen=True)
class WikiSource:
    name: str
    api_url: str
    licence: str
    licence_url: str


@dataclass(frozen=True)
class LinkedStaticSource:
    name: str
    licence: str
    licence_url: str
    path_prefixes: tuple[str, ...]
    path_suffix_allow: tuple[str, ...]
    path_pattern_allow: tuple[str, ...]


@dataclass(frozen=True)
class MirrorConfig:
    host: str
    user_agent: str
    rate_limit_seconds: float
    retries: int
    retry_backoff_seconds: float
    pages: PagesSource
    wiki: WikiSource
    linked_static: LinkedStaticSource
    raw_sources: tuple[dict, ...] = field(default_factory=tuple)


def load_config(path: str | Path) -> MirrorConfig:
    """Parse `mirror.toml`. Raises `ValueError` if a required source is missing."""
    data = tomllib.loads(Path(path).read_text(encoding="utf-8"))
    mirror = data.get("mirror", {})
    sources = {s["name"]: s for s in data.get("source", [])}

    for required in ("pages", "wiki", "unlarium"):
        if required not in sources:
            raise ValueError(f"mirror.toml: missing required [[source]] named {required!r}")

    pages_raw = sources["pages"]
    wiki_raw = sources["wiki"]
    static_raw = sources["unlarium"]

    return MirrorConfig(
        host=mirror.get("host", "unlarchive.org"),
        user_agent=mirror.get(
            "user_agent", "verstaan-mirror (+https://github.com/ossewawiel/verstaan)"
        ),
        rate_limit_seconds=float(mirror.get("rate_limit_seconds", 1.0)),
        retries=int(mirror.get("retries", 3)),
        retry_backoff_seconds=float(mirror.get("retry_backoff_seconds", 1.0)),
        pages=PagesSource(
            name=pages_raw["name"],
            base_url=pages_raw["base_url"],
            entry_page=pages_raw.get("entry_page", "home"),
            licence=pages_raw["licence"],
            licence_url=pages_raw["licence_url"],
        ),
        wiki=WikiSource(
            name=wiki_raw["name"],
            api_url=wiki_raw["api_url"],
            licence=wiki_raw["licence"],
            licence_url=wiki_raw["licence_url"],
        ),
        linked_static=LinkedStaticSource(
            name=static_raw["name"],
            licence=static_raw["licence"],
            licence_url=static_raw["licence_url"],
            path_prefixes=tuple(static_raw.get("path_prefixes", [])),
            path_suffix_allow=tuple(static_raw.get("path_suffix_allow", [])),
            path_pattern_allow=tuple(static_raw.get("path_pattern_allow", [])),
        ),
        raw_sources=tuple(data.get("source", [])),
    )
