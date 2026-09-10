# SPDX-License-Identifier: MPL-2.0
"""MediaWiki API client (SPEC.md §3.1): title listing, wikitext, rendered HTML, categories."""

from __future__ import annotations

import json

from tools.mirror.http_client import HttpResponse
from tools.mirror.wiki import fetch_page, list_all_titles, slugify_title


class FakeClient:
    """Answers by matching a query parameter, like a tiny MediaWiki API."""

    def __init__(self, by_action):
        self.by_action = by_action
        self.urls = []

    def get(self, url, *, extra_headers=None):
        self.urls.append(url)
        for action, response in self.by_action.items():
            if f"action={action}" in url:
                body = response.pop(0) if isinstance(response, list) else response
                return HttpResponse(200, {}, json.dumps(body).encode("utf-8"))
        raise AssertionError(f"no fixture response for {url}")


def test_slugify_title_makes_a_filesystem_safe_name():
    assert slugify_title("My_wiki:About") == "My_wiki_About"
    assert slugify_title("File:Dev.png") == "File_Dev.png"


def test_list_all_titles_follows_apcontinue():
    client = FakeClient(
        {
            "query": [
                {
                    "continue": {"apcontinue": "B"},
                    "query": {"allpages": [{"pageid": 1, "ns": 0, "title": "Adjective"}]},
                },
                {"query": {"allpages": [{"pageid": 2, "ns": 0, "title": "Bagpipe"}]}},
            ]
        }
    )
    titles = list_all_titles(client, "https://unlarchive.org/wiki/api.php")
    assert titles == ["Adjective", "Bagpipe"]
    assert len(client.urls) == 2
    assert "apcontinue=B" in client.urls[1]


def test_fetch_page_gets_wikitext_html_and_categories():
    client = FakeClient(
        {
            "query": {
                "query": {
                    "pages": {
                        "42": {
                            "revisions": [{"slots": {"main": {"*": "'''Grammar''' is a set..."}}}]
                        }
                    }
                }
            },
            "parse": {
                "parse": {
                    "text": {"*": "<p><b>Grammar</b> is a set...</p>"},
                    "categories": [{"*": "Linguistics"}, {"*": "UNL"}],
                }
            },
        }
    )
    page = fetch_page(client, "https://unlarchive.org/wiki/api.php", "Grammar")
    assert page.title == "Grammar"
    assert page.pageid == 42
    assert "Grammar" in page.wikitext
    assert "<b>Grammar</b>" in page.html
    assert page.categories == ["Linguistics", "UNL"]
