# SPDX-License-Identifier: MPL-2.0
"""Validate `data/languages/<iso3>/` against `tagset.yaml` and the store schema (SPEC.md §3.3).

This module is the M0 skeleton. It already does one real thing: it finds which language files
`--changed` or `--all` cover, and exits 0 when there is nothing to check (an empty
`data/languages/`). Schema checks, tagset checks and the "every rule has a test" check arrive with
the importer at M1. A missing rule id is an error; an uncovered rule stays a warning (SPEC.md §3.3).
"""

__version__ = "0.0.0"
