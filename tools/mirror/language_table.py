# SPDX-License-Identifier: MPL-2.0
"""Parse the logged-in language table at `/user/index.php?unlweb=language` (SPEC.md §3.1).

One row per language: `iso1, iso3, name, users, base_forms, word_forms, paradigms, frames,
dict_level, grammar_level` — the columns issue 08 asks `data/archive/languages.json` to carry.
Pure: HTML in, rows out, no network (docs/standards/testing.md).
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass

_ROW_RE = re.compile(
    r"<tr>\s*"
    r"<td[^>]*><a[^>]*>([^<]*)</a></td>\s*"  # iso1
    r"<td[^>]*><a[^>]*>([^<]*)</a></td>\s*"  # iso3
    r"<td[^>]*><a[^>]*>([^<]*)</a></td>\s*"  # name
    r"<td[^>]*>([^<]*)</td>\s*"  # users
    r"<td[^>]*>([^<]*)</td>\s*"  # base_forms
    r"<td[^>]*>([^<]*)</td>\s*"  # word_forms
    r"<td[^>]*>([^<]*)</td>\s*"  # paradigms
    r"<td[^>]*>([^<]*)</td>\s*"  # frames
    r"<td[^>]*>([^<]*)</a></td>\s*"  # dict_level
    r"<td[^>]*>([^<]*)</a></td>\s*"  # grammar_level
    r"</tr>"
)


@dataclass(frozen=True)
class LanguageRow:
    iso1: str
    iso3: str
    name: str
    users: int
    base_forms: int
    word_forms: int
    paradigms: int
    frames: int
    dict_level: str
    grammar_level: str

    def needs_export(self) -> bool:
        """True if this row has anything to fetch: a non-zero dictionary or grammar count
        (SPEC.md §3.1, issue 08's "for each language with a non-zero dictionary or grammar
        count")."""
        return bool(self.base_forms or self.word_forms or self.paradigms or self.frames)

    def as_dict(self) -> dict:
        return dict(sorted(asdict(self).items()))


def _to_int(text: str) -> int:
    text = text.strip().replace(",", "")
    return int(text) if text else 0


def parse_language_table(html: str) -> list[LanguageRow]:
    """Every row of the table, in document order."""
    rows = []
    for match in _ROW_RE.finditer(html):
        iso1, iso3, name, users, base_forms, word_forms, paradigms, frames, dl, gl = match.groups()
        rows.append(
            LanguageRow(
                iso1=iso1.strip(),
                iso3=iso3.strip(),
                name=name.strip(),
                users=_to_int(users),
                base_forms=_to_int(base_forms),
                word_forms=_to_int(word_forms),
                paradigms=_to_int(paradigms),
                frames=_to_int(frames),
                dict_level=dl.strip(),
                grammar_level=gl.strip(),
            )
        )
    return rows
