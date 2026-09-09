#!/usr/bin/env bash
# Tier: rendering, never blocking. Triggers: SessionStart; PostToolUse on doc/agent/skill/command
# files. Wrapper only. The logic is tools/factory/hooks/refresh_console.sh, a tracked script with
# tests (tools/factory/tests/test_refresh_console.py). Edited by hand, never by an agent.
exec bash "$(dirname "$0")/../../tools/factory/hooks/refresh_console.sh"