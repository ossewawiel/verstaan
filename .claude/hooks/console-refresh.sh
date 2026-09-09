#!/usr/bin/env bash
# Tier: fast, non-blocking. Trigger: Stop. Wrapper only. The logic is
# tools/factory/hooks/console_refresh.sh, a tracked script with tests
# (tools/factory/tests/test_console_refresh.py). This file is edited by hand, never by an agent.
exec bash "$(dirname "$0")/../../tools/factory/hooks/console_refresh.sh"
