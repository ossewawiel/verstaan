#!/usr/bin/env bash
# Tier: fast, blocking. Trigger: Stop. Runtime target: under 60 s.
# Wrapper only. The logic is tools/factory/hooks/gate_fast.sh, a tracked script with tests
# (tools/factory/tests/test_gate_fast.py). This file is edited by hand, never by an agent.
exec bash "$(dirname "$0")/../../tools/factory/hooks/gate_fast.sh"