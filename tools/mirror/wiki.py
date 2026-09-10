# SPDX-License-Identifier: MPL-2.0
"""The MediaWiki API side of the mirror (SPEC.md §3.1): every wiki page, wikitext and rendered
HTML, plus its categories.

`action=query&list=allpages` enumerates titles; `action=query&prop=revisions` gets the wikitext;
`action=parse` gets the rendered HTML and the categories in one call.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from urllib.parse import quote, urlencode

from tools.mirror.http_client import RateLimitedClient

_UNSAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]")


def slugify_title(title: str) -> str:
    """A wiki title made safe for a filename. The original title stays in the manifest `title`."""
    slug = _UNSAFE_FILENAME_RE.sub("_", title)
    return slug.strip("_") or "page"


@dataclass(frozen=True)
class WikiPage:
    title: str
    pageid: int
    wikitext: str
    html: str
    categories: list[str]


def list_all_titles(client: RateLimitedClient, api_url: str, *, namespace: int = 0) -> list[str]:
    """Every page title in `namespace` (0: articles, the default the site's `allpages` list uses)."""
    titles: list[str] = []
    apcontinue: str | None = None
    while True:
        params = {
            "action": "query",
            "list": "allpages",
            "apnamespace": namespace,
            "aplimit": 500,
            "format": "json",
        }
        if apcontinue:
            params["apcontinue"] = apcontinue
        response = client.get(f"{api_url}?{urlencode(params)}")
        data = json.loads(response.body)
        titles.extend(page["title"] for page in data.get("query", {}).get("allpages", []))
        cont = data.get("continue")
        if not cont:
            break
        apcontinue = cont["apcontinue"]
    return titles


def fetch_page(client: RateLimitedClient, api_url: str, title: str) -> WikiPage:
    """Wikitext, rendered HTML and categories for one page. Two API calls, one page."""
    rev_params = {
        "action": "query",
        "prop": "revisions",
        "titles": title,
        "rvslots": "main",
        "rvprop": "content",
        "format": "json",
    }
    rev_response = client.get(f"{api_url}?{urlencode(rev_params, quote_via=quote)}")
    rev_data = json.loads(rev_response.body)
    pages = rev_data.get("query", {}).get("pages", {})
    pageid = -1
    wikitext = ""
    for pid, page in pages.items():
        pageid = int(pid)
        revisions = page.get("revisions", [])
        if revisions:
            slots = revisions[0].get("slots", {})
            wikitext = slots.get("main", {}).get("*", "") or revisions[0].get("*", "")

    parse_params = {
        "action": "parse",
        "page": title,
        "prop": "text|categories",
        "format": "json",
    }
    parse_response = client.get(f"{api_url}?{urlencode(parse_params, quote_via=quote)}")
    parse_data = json.loads(parse_response.body)
    parse_result = parse_data.get("parse", {})
    html = parse_result.get("text", {}).get("*", "")
    categories = [c.get("*", "") for c in parse_result.get("categories", [])]

    return WikiPage(title=title, pageid=pageid, wikitext=wikitext, html=html, categories=categories)
