#!/usr/bin/env bash
# Tier: full gate enforcement. Trigger: PreToolUse on Bash|PowerShell. Runtime: ms.
# Wrapper only. The logic is tools/factory/hooks/require_gate.sh, a tracked script with tests
# (tools/factory/tests/test_require_gate.py). This file is edited by hand, never by an agent.
exec bash "$(dirname "$0")/../../tools/factory/hooks/require_gate.sh"