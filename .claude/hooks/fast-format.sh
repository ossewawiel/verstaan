#!/usr/bin/env bash
# Tier: auto-fix. Trigger: PostToolUse on Edit|Write. Runtime: ~1 s.
# Wrapper only. The logic is tools/factory/hooks/fast_format.sh, a tracked script with tests
# (tools/factory/tests/test_fast_format.py). This file is edited by hand, never by an agent.
exec bash "$(dirname "$0")/../../tools/factory/hooks/fast_format.sh"
