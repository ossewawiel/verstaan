#!/usr/bin/env bash
# Tier: rendering, never blocking. Trigger: SessionStart. Wrapper only. The logic is
# tools/factory/hooks/console_serve.sh (tests: tools/factory/tests/test_console_serve.py).
# This file is edited by hand, never by an agent.
exec bash "$(dirname "$0")/../../tools/factory/hooks/console_serve.sh"
