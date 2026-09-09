#!/usr/bin/env bash
# Tier: helper, called by gate-fast.sh. Not a Claude Code hook trigger itself.
# Wrapper only. The logic is tools/factory/hooks/capture_failure.sh, a tracked script with tests
# (tools/factory/tests/test_capture_failure.py). This file is edited by hand, never by an agent.
exec bash "$(dirname "$0")/../../tools/factory/hooks/capture_failure.sh" "$@"
