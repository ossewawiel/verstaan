# SPDX-License-Identifier: MPL-2.0
from tools.mirror import placeholder_answer


def test_placeholder_answer():
    assert placeholder_answer() == 42
