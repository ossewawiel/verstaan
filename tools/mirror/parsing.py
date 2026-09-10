# SPDX-License-Identifier: MPL-2.0
"""Pull facts out of a fetched HTML page: no interpretation, just extraction (SPEC.md §3.1).

Every function here is pure: bytes or text in, a fact out. No network, no filesystem — the
`tests/` for this module feed it recorded fixture HTML, per docs/standards/testing.md.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urljoin

_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
_COMMENT_RE = re.compile(r"<!--(.*?)-->", re.DOTALL)
_HREF_RE = re.compile(r'href\s*=\s*"([^"]+)"', re.IGNORECASE)
_CC_LICENCE_RE = re.compile(
    r"creativecommons\.org/licenses/by-sa/([0-9.]+)(?:/([a-z]{2}))?/?", re.IGNORECASE
)
_GITHUB_MENTION_RE = re.compile(r"github", re.IGNORECASE)


def extract_title(html: str) -> str | None:
    match = _TITLE_RE.search(html)
    if not match:
        return None
    return re.sub(r"\s+", " ", match.group(1)).strip() or None


@dataclass(frozen=True)
class DetectedLicence:
    licence: str
    licence_url: str


def extract_licence(html: str) -> DetectedLicence | None:
    """The CC BY-SA licence this page itself links, e.g. "CC BY-SA 2.5 CH" for the UNLarium page.

    Returns `None` if the page links no `creativecommons.org/licenses/by-sa/*` URL; the caller
    then falls back to the source's default licence from `mirror.toml`.
    """
    for href in _HREF_RE.findall(html):
        match = _CC_LICENCE_RE.search(href)
        if match:
            version, jurisdiction = match.group(1), match.group(2)
            label = f"CC BY-SA {version}"
            if jurisdiction:
                label += f" {jurisdiction.upper()}"
            return DetectedLicence(licence=label, licence_url=href)
    return None


def extract_comment_notes(html: str, *, keyword: str = "github") -> list[str]:
    """Text of every HTML comment mentioning `keyword` (case-insensitive), whitespace collapsed.

    Built for `index.php?unlweb=dev`'s commented-out GitHub button (acceptance criteria), but
    general: any page, any keyword.
    """
    keyword_re = (
        re.compile(re.escape(keyword), re.IGNORECASE)
        if keyword != "github"
        else (_GITHUB_MENTION_RE)
    )
    notes = []
    for comment in _COMMENT_RE.findall(html):
        if keyword_re.search(comment):
            notes.append(re.sub(r"\s+", " ", comment).strip())
    return notes


def extract_links(html: str, base_url: str) -> list[str]:
    """Every `href` on the page, resolved to an absolute URL against `base_url`."""
    return [urljoin(base_url, href) for href in _HREF_RE.findall(html)]


_STATIC_PATH_RE_CACHE: dict[tuple, re.Pattern] = {}


def filter_static_links(
    urls: list[str],
    *,
    path_prefixes: tuple[str, ...],
    path_suffix_allow: tuple[str, ...],
    path_pattern_allow: tuple[str, ...],
) -> list[str]:
    """URLs whose path starts with one of `path_prefixes` and either ends in an allowed suffix or
    matches an allowed filename pattern (e.g. `export_.*\\.php`). This is how `mirror.toml`'s
    `linked_static` source turns "every link on the page" into "the grammar and export files".
    """
    key = path_pattern_allow
    if key not in _STATIC_PATH_RE_CACHE:
        _STATIC_PATH_RE_CACHE[key] = re.compile(
            "|".join(f"(?:{p})" for p in path_pattern_allow) if path_pattern_allow else r"(?!)"
        )
    pattern = _STATIC_PATH_RE_CACHE[key]

    matches = []
    for url in urls:
        path = url.split("?", 1)[0].split("#", 1)[0]
        if not any(prefix in path for prefix in path_prefixes):
            continue
        filename = path.rsplit("/", 1)[-1]
        if any(filename.endswith(suffix) for suffix in path_suffix_allow) or pattern.search(
            filename
        ):
            matches.append(url)
    return matches


_PHP_FATAL_ERROR_RE = re.compile(rb"<b>Fatal error</b>|Uncaught mysqli|SQLSTATE", re.IGNORECASE)


def looks_like_server_error(body: bytes) -> bool:
    """True for a PHP fatal error rendered into an HTTP 200 body — the broken public dictionary
    export answers this way (SPEC.md §3.1's `export_dic.php`, MySQL error, as of 2026-09-08).
    A manifest line still records the file; it is marked `status: error`, never skipped.
    """
    return bool(_PHP_FATAL_ERROR_RE.search(body))
