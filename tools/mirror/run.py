# SPDX-License-Identifier: MPL-2.0
"""The mirror run itself (SPEC.md §3.1): pages, wiki, and every static file the pages link.

`run_mirror` is the one entry point `cli.py` calls. It never touches credentials — this issue is
public, no-login pages only (issue 08 covers the logged-in UNLarium exports).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from tools.mirror.config import MirrorConfig
from tools.mirror.http_client import RateLimitedClient
from tools.mirror.parsing import (
    extract_comment_notes,
    extract_licence,
    extract_links,
    extract_title,
    filter_static_links,
)
from tools.mirror.store import Mirror, filename_for_url
from tools.mirror.wiki import fetch_page, list_all_titles, slugify_title

_UNLWEB_LINK_RE = re.compile(r"unlweb=([a-zA-Z0-9_-]+)")

# The known public menu, used only if a home-page fetch somehow links none of it (SPEC.md §3.1
# still wants those pages mirrored even if the page that used to link them changes).
_FALLBACK_UNLWEB_PAGES = (
    "home",
    "about",
    "contact",
    "dev",
    "documentation",
    "education",
    "terms",
    "undl",
    "unl",
    "unlarium",
)


@dataclass
class MirrorReport:
    pages_fetched: int = 0
    wiki_pages_fetched: int = 0
    static_files_fetched: int = 0
    files_written: int = 0
    files_unchanged: int = 0
    files_errored: int = 0
    notes: list[str] = field(default_factory=list)

    def summary(self) -> str:
        return (
            f"pages: {self.pages_fetched}, wiki pages: {self.wiki_pages_fetched}, "
            f"static files: {self.static_files_fetched}, written: {self.files_written}, "
            f"unchanged: {self.files_unchanged}, errored: {self.files_errored}"
        )


def _bucket_for_static_url(url: str) -> str:
    filename = url.split("?", 1)[0].rsplit("/", 1)[-1]
    if filename.startswith("export_") or "/unlarium/" in url:
        return "exports"
    return "grammars"


def mirror_pages(config: MirrorConfig, client: RateLimitedClient, store: Mirror) -> MirrorReport:
    """`index.php?unlweb=*` pages, plus every grammar/export file they link.

    Returns a fresh `MirrorReport` covering only the pages and static-file part of the run;
    `mirror_wiki` fills in the wiki counters on the same report the caller passes through.
    """
    report = MirrorReport()
    static = config.linked_static

    entry_url = f"{config.pages.base_url}?unlweb={config.pages.entry_page}"
    entry_response = client.get(entry_url)
    entry_html = entry_response.body.decode("utf-8", errors="replace")
    page_names = sorted(set(_UNLWEB_LINK_RE.findall(entry_html)) | {config.pages.entry_page})
    if not page_names:
        page_names = list(_FALLBACK_UNLWEB_PAGES)

    static_urls: dict[str, tuple[str, str]] = {}  # url -> (licence, licence_url)

    for name in page_names:
        url = f"{config.pages.base_url}?unlweb={name}"
        # The entry page was already fetched once, above, to discover this very list of names.
        # Every page needs its full body parsed for links and licence regardless of whether its
        # content changed, so there is no conditional GET here — only no *second* fetch of it.
        if name == config.pages.entry_page:
            response = entry_response
        else:
            response = client.get(url)
        html = response.body.decode("utf-8", errors="replace")

        detected = extract_licence(html)
        licence = detected.licence if detected else config.pages.licence
        licence_url = detected.licence_url if detected else config.pages.licence_url

        notes = extract_comment_notes(html, keyword="github")
        note = "; ".join(notes) if notes else None
        if note:
            report.notes.append(f"{name}: {note}")

        result = store.fetch_and_store_bytes(
            bucket="pages",
            filename=f"{name}.html",
            url=url,
            content=response.body,
            licence=licence,
            licence_url=licence_url,
            title=extract_title(html) or name,
            note=note,
            etag=response.headers.get("ETag") or response.headers.get("Etag"),
        )
        report.pages_fetched += 1
        _tally(report, result.action)
        store.flush()

        for link in extract_links(html, url):
            matches = filter_static_links(
                [link],
                path_prefixes=static.path_prefixes,
                path_suffix_allow=static.path_suffix_allow,
                path_pattern_allow=static.path_pattern_allow,
            )
            for matched in matches:
                if matched not in static_urls:
                    static_urls[matched] = (licence, licence_url)

    for url, (licence, licence_url) in sorted(static_urls.items()):
        bucket = _bucket_for_static_url(url)
        result = store.fetch_and_store(
            bucket=bucket,
            filename=filename_for_url(url),
            url=url,
            licence=licence,
            licence_url=licence_url,
            title=None,
        )
        report.static_files_fetched += 1
        _tally(report, result.action)
        store.flush()

    return report


def mirror_wiki(config: MirrorConfig, client: RateLimitedClient, store: Mirror) -> MirrorReport:
    """Every wiki page: wikitext, rendered HTML, and its categories, via the MediaWiki API."""
    report = MirrorReport()
    titles = list_all_titles(client, config.wiki.api_url)

    for title in titles:
        page = fetch_page(client, config.wiki.api_url, title)
        slug = slugify_title(title)
        extra = {"categories": page.categories, "pageid": page.pageid}

        wikitext_result = store.fetch_and_store_bytes(
            bucket="wiki",
            filename=f"{slug}.wikitext",
            url=f"{config.wiki.api_url}?action=query&prop=revisions&titles={title}",
            content=page.wikitext.encode("utf-8"),
            licence=config.wiki.licence,
            licence_url=config.wiki.licence_url,
            title=title,
            extra=extra,
        )
        _tally(report, wikitext_result.action)

        html_result = store.fetch_and_store_bytes(
            bucket="wiki",
            filename=f"{slug}.html",
            url=f"{config.wiki.api_url}?action=parse&page={title}",
            content=page.html.encode("utf-8"),
            licence=config.wiki.licence,
            licence_url=config.wiki.licence_url,
            title=title,
            extra=extra,
        )
        _tally(report, html_result.action)

        report.wiki_pages_fetched += 1
        store.flush()  # one page's worth at a time: a crash mid-run orphans nothing (SPEC.md §3.1)

    return report


def _tally(report: MirrorReport, action: str) -> None:
    if action == "fetched":
        report.files_written += 1
    elif action == "unchanged":
        report.files_unchanged += 1
    elif action == "error":
        report.files_errored += 1
        report.files_written += 1  # the error body is still written, per SPEC.md §3.1


def merge_reports(a: MirrorReport, b: MirrorReport) -> MirrorReport:
    return MirrorReport(
        pages_fetched=a.pages_fetched + b.pages_fetched,
        wiki_pages_fetched=a.wiki_pages_fetched + b.wiki_pages_fetched,
        static_files_fetched=a.static_files_fetched + b.static_files_fetched,
        files_written=a.files_written + b.files_written,
        files_unchanged=a.files_unchanged + b.files_unchanged,
        files_errored=a.files_errored + b.files_errored,
        notes=a.notes + b.notes,
    )


def run_mirror(
    config: MirrorConfig,
    client: RateLimitedClient,
    archive_root: str | Path,
    manifest_path: str | Path,
) -> MirrorReport:
    """Mirror everything this issue covers: pages, their static links, and the wiki."""
    store = Mirror(
        client=client, archive_root=Path(archive_root), manifest_path=Path(manifest_path)
    )
    pages_report = mirror_pages(config, client, store)
    wiki_report = mirror_wiki(config, client, store)
    store.flush()
    return merge_reports(pages_report, wiki_report)
