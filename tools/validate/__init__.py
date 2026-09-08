"""Validate `data/languages/<iso3>/` against `tagset.yaml` and the store schema (SPEC.md §3.3).

This module is the M0 skeleton. It already does one real thing: it finds which language files
`--changed` or `--all` cover, and exits 0 when there is nothing to check (an empty
`data/languages/`). Schema checks, tagset checks and the "every rule has a test" check arrive with
the importer at M1 and become an error from M3 (SPEC.md §3.3).
"""

__version__ = "0.0.0"
