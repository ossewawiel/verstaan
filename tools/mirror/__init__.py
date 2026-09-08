# SPDX-License-Identifier: MPL-2.0
"""Mirror the UNL Archive onto `data/archive/` (SPEC.md §3.1).

This module is the M0 skeleton: `python -m tools.mirror` prints usage and refuses credentials
passed on the command line. The real fetch (mirror.toml, rate limiting, manifest.jsonl) arrives
with milestone M1.
"""

__version__ = "0.0.0"


def placeholder_answer() -> int:
    """Kept for issue 01's gate-ladder proof; the real mirror has no use for this."""
    return 42
