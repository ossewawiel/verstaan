# SPDX-License-Identifier: MPL-2.0
"""The logged-in UNLarium exports, for every language (SPEC.md §3.1, issue 08).

`run_login_mirror` is the one entry point `cli.py` calls for `python -m tools.mirror login`. It
signs in, saves the language table, then for each language with a non-zero dictionary or grammar
count walks two UNLarium pages — the dictionary export page and the grammar export page — and
fetches every export link each one holds: the dictionary zip files, the four grammar exports
(inflectional/subcategorization × analysis/generation), and, once, the shared tagset. It also
walks every corpus project's export page and the owner's Files page.

An export page that answers "No grammar available" for a language still gets stored and
manifested, with `status: "empty"` — never silently dropped (SPEC.md §3.1, issue 08).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from tools.mirror.config import MirrorConfig
from tools.mirror.http_client import RateLimitedClient
from tools.mirror.language_table import LanguageRow, parse_language_table
from tools.mirror.login import sign_in
from tools.mirror.parsing import extract_links, filter_static_links, looks_like_server_error
from tools.mirror.store import Mirror, filename_for_url

# Every export link this module discovers on a UNLarium page lives under one of these paths and
# either ends in one of these suffixes or matches one of these filename patterns — the same shape
# as `mirror.toml`'s `linked_static` source (issue 07), specialised to the logged-in pages.
_EXPORT_PATH_PREFIXES = (
    "/dics/",
    "/unlarium/dictionary/",
    "/unlarium/grammar/",
    "/unlarium/corpus/",
    "/grammars/",
    "/uploads/",
)
_EXPORT_SUFFIXES = (".zip", ".txt")
_EXPORT_PATTERNS = (
    r"export_dic\.php",
    r"export_cc\.php",
    r"export_tagset\.php",
    r"export_grammar\.php",
    r"export_corpus\.php",
)

_CORPUS_PROJECT_RE = re.compile(r"corpus=explore&(?:amp;)?proj=([a-zA-Z0-9]+)")
_NO_EXPORT_RE = re.compile(rb"No grammar available", re.IGNORECASE)
_PLEASE_WAIT_RE = re.compile(rb"Please wait\.\.\.", re.IGNORECASE)
_CLOSING_HTML_RE = re.compile(rb"</html>", re.IGNORECASE)


def _root(config: MirrorConfig) -> str:
    return f"https://{config.host}"


def looks_like_empty_export(body: bytes) -> bool:
    """True for UNLarium's "No grammar available" answer (issue 08's `status: empty`)."""
    return bool(_NO_EXPORT_RE.search(body))


def looks_like_generating_placeholder(body: bytes) -> bool:
    """True for UNLarium's "please wait…" progress-bar page while an export is still being
    built: the `progressbar1_message` marker is there, but the page never reached a closing
    `</html>` — the response is a snapshot of a render still in progress, not a real answer
    (issue 08's Georgian dictionary export, captured mid-generation).

    A page that finished generating keeps the same "Please wait..." text as static banner
    copy at the top, but always reaches `</html>` — real content and this placeholder are told
    apart by completeness, not by the presence of the banner alone.

    A PHP fatal error also cuts the page short without `</html>` — but it is a settled (if
    broken) answer, not one still generating, so `looks_like_server_error` takes it first.
    """
    if looks_like_server_error(body):
        return False
    return bool(_PLEASE_WAIT_RE.search(body)) and not _CLOSING_HTML_RE.search(body)


def _is_still_pending(body: bytes) -> bool:
    """True for a response `get_while` should retry: no body at all (a zip export UNLarium has
    not materialised yet — the same "still generating" state, just wordless), or the "please
    wait…" placeholder page (issue 08)."""
    return not body or looks_like_generating_placeholder(body)


@dataclass
class LoginReport:
    languages_seen: int = 0
    exports_fetched: int = 0
    exports_unchanged: int = 0
    exports_empty: int = 0
    exports_errored: int = 0
    exports_timeout: int = 0
    total_bytes: int = 0
    notes: list[str] = field(default_factory=list)

    def summary(self) -> str:
        return (
            f"languages seen: {self.languages_seen}, exports fetched: {self.exports_fetched}, "
            f"unchanged: {self.exports_unchanged}, empty: {self.exports_empty}, "
            f"errored: {self.exports_errored}, timed out: {self.exports_timeout}, "
            f"bytes: {self.total_bytes}"
        )


def _store_export(
    store: Mirror,
    report: LoginReport,
    *,
    bucket: str,
    url: str,
    content: bytes,
    licence: str,
    licence_url: str,
    language: str | None,
    still_pending: bool = False,
) -> None:
    report.total_bytes += len(content)
    if still_pending:
        # `get_while` retried this request (SPEC.md §3.1, issue 08) and the site never finished
        # generating it — a zero-byte body, or the "please wait…" placeholder page, both times.
        # Recorded `status: "timeout"`, never `"ok"` or `"empty"`: those would claim a settled
        # answer this response never gave, and would stop a later run from trying again.
        status_override = "timeout"
    elif looks_like_empty_export(content) or not content:
        # UNLarium's own settled "No grammar available" answer, the same "nothing here" signal
        # as a still-empty body after every retry gave up — recorded `status: "empty"`, never
        # mistaken for real content.
        status_override = "empty"
    else:
        status_override = None
    result = store.fetch_and_store_bytes(
        bucket=bucket,
        filename=filename_for_url(url),
        url=url,
        content=content,
        licence=licence,
        licence_url=licence_url,
        title=None,
        language=language,
        status_override=status_override,
    )
    if result.action == "fetched":
        report.exports_fetched += 1
    elif result.action == "unchanged":
        report.exports_unchanged += 1
    elif result.action == "empty":
        report.exports_empty += 1
    elif result.action == "error":
        report.exports_errored += 1
    elif result.action == "timeout":
        report.exports_timeout += 1


def _discover_and_fetch(
    client: RateLimitedClient,
    store: Mirror,
    report: LoginReport,
    *,
    page_url: str,
    bucket: str,
    licence: str,
    licence_url: str,
    language: str | None,
    skip_urls: frozenset[str] = frozenset(),
) -> None:
    """Fetch `page_url`, then every export link it holds (never the page itself)."""
    page = client.get(page_url)
    html = page.body.decode("utf-8", errors="replace")
    links = filter_static_links(
        extract_links(html, page_url),
        path_prefixes=_EXPORT_PATH_PREFIXES,
        path_suffix_allow=_EXPORT_SUFFIXES,
        path_pattern_allow=_EXPORT_PATTERNS,
    )
    for url in sorted(set(links) - skip_urls):
        response = client.get_while(url, _is_still_pending)
        _store_export(
            store,
            report,
            bucket=bucket,
            url=url,
            content=response.body,
            licence=licence,
            licence_url=licence_url,
            language=language,
            still_pending=_is_still_pending(response.body),
        )


def _mirror_language_exports(
    config: MirrorConfig,
    client: RateLimitedClient,
    store: Mirror,
    report: LoginReport,
    row: LanguageRow,
    tagset_url: str,
) -> None:
    root = _root(config)
    static = config.linked_static
    bucket = f"exports/{row.iso3}"

    _discover_and_fetch(
        client,
        store,
        report,
        page_url=f"{root}/unlarium/index.php?unlarium=dictionary&lang={row.iso1}&action=export",
        bucket=bucket,
        licence=static.licence,
        licence_url=static.licence_url,
        language=row.iso3,
    )
    _discover_and_fetch(
        client,
        store,
        report,
        page_url=f"{root}/unlarium/index.php?unlarium=grammar&lang={row.iso1}&grammar=export",
        bucket=bucket,
        licence=static.licence,
        licence_url=static.licence_url,
        language=row.iso3,
        skip_urls=frozenset({tagset_url}),  # fetched once, language-independent — see below
    )


def _mirror_tagset(
    config: MirrorConfig, client: RateLimitedClient, store: Mirror, report: LoginReport
) -> str:
    """The UNDL Foundation tagset: one file, the same for every language, fetched once."""
    static = config.linked_static
    url = f"{_root(config)}/unlarium/dictionary/export_tagset.php"
    response = client.get_while(url, _is_still_pending)
    _store_export(
        store,
        report,
        bucket="exports",
        url=url,
        content=response.body,
        licence=static.licence,
        licence_url=static.licence_url,
        language=None,
        still_pending=_is_still_pending(response.body),
    )
    return url


def _mirror_corpus(
    config: MirrorConfig, client: RateLimitedClient, store: Mirror, report: LoginReport
) -> None:
    root = _root(config)
    static = config.linked_static
    corpus_page_url = f"{root}/unlarium/index.php?unlarium=corpus"
    corpus_page = client.get(corpus_page_url)
    html = corpus_page.body.decode("utf-8", errors="replace")
    projects = sorted(set(_CORPUS_PROJECT_RE.findall(html)))

    for proj in projects:
        _discover_and_fetch(
            client,
            store,
            report,
            page_url=f"{root}/unlarium/index.php?corpus=export&proj={proj}",
            bucket=f"exports/corpus/{proj}",
            licence=static.licence,
            licence_url=static.licence_url,
            language=None,
        )


def _mirror_files(
    config: MirrorConfig, client: RateLimitedClient, store: Mirror, report: LoginReport
) -> None:
    """The owner's Files page uploads (issue 08; same authenticated session)."""
    static = config.linked_static
    files_url = f"{_root(config)}/user/index.php?unlweb=files"
    page = client.get(files_url)
    html = page.body.decode("utf-8", errors="replace")
    links = filter_static_links(
        extract_links(html, files_url),
        path_prefixes=("/uploads/",),
        path_suffix_allow=(".txt",),
        path_pattern_allow=(),
    )
    for url in sorted(set(links)):
        response = client.get_while(url, _is_still_pending)
        _store_export(
            store,
            report,
            bucket="uploads",
            url=url,
            content=response.body,
            licence=static.licence,
            licence_url=static.licence_url,
            language=None,
            still_pending=_is_still_pending(response.body),
        )


def run_login_mirror(
    config: MirrorConfig,
    client: RateLimitedClient,
    archive_root: str | Path,
    manifest_path: str | Path,
    username: str,
    password: str,
) -> LoginReport:
    """Sign in, save the language table, mirror every export it points to."""
    root = _root(config)
    sign_in(client, root, username, password)

    store = Mirror(
        client=client, archive_root=Path(archive_root), manifest_path=Path(manifest_path)
    )
    report = LoginReport()

    language_page_url = f"{root}/user/index.php?unlweb=language"
    language_page = client.get(language_page_url)
    html = language_page.body.decode("utf-8", errors="replace")
    rows = parse_language_table(html)
    report.languages_seen = len(rows)

    languages_json = (
        json.dumps([row.as_dict() for row in rows], indent=2, ensure_ascii=False) + "\n"
    )
    store.fetch_and_store_bytes(
        bucket="",
        filename="languages.json",
        url=language_page_url,
        content=languages_json.encode("utf-8"),
        licence=config.pages.licence,
        licence_url=config.pages.licence_url,
        title="UNL Archive language table",
    )
    store.flush()

    tagset_url = _mirror_tagset(config, client, store, report)
    store.flush()

    for row in rows:
        if not row.needs_export():
            continue
        _mirror_language_exports(config, client, store, report, row, tagset_url)
        store.flush()

    _mirror_corpus(config, client, store, report)
    store.flush()

    _mirror_files(config, client, store, report)
    store.flush()

    return report
