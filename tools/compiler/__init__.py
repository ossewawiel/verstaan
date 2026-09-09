# SPDX-License-Identifier: MPL-2.0
"""Turn the store and `tiers.toml` into `engine/generated/` and `tests/golden/` (SPEC.md §3.5).

This module is the M0 skeleton: `python -m tools.compiler` prints usage. The real build (tables,
rules, golden files, the source-hash header) arrives with milestone M1.
"""

__version__ = "0.0.0"
