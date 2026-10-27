# SPDX-License-Identifier: MPL-2.0
"""Tests for tools/factory/status.py, the script behind /factory-status (issue 190).

The script and tools/console/src/parse.mjs must name the same last-completed and next-up issues on
the fixture repo under tools/console/test/fixtures/. The expected numbers below were read by hand
from those fixture files; they are not produced by either implementation.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from tools.factory.tests.conftest import init_repo

REPO = Path(__file__).resolve().parents[3]
FIXTURES = REPO / "tools" / "console" / "test" / "fixtures"
PARSE_MJS = REPO / "tools" / "console" / "src" / "parse.mjs"

# Hand-derived from the fixtures: 01 is the only done issue; 02 is open and depends on 01;
# 90 is a Side quest and is never "next up".
EXPECTED_LAST = 1
EXPECTED_NEXT = 2


def run_script(*args: str, cwd: Path = REPO) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "tools.factory.status", *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )


def picks(stdout: str) -> tuple[int | None, int | None]:
    last = re.search(r"^Last completed:\s+#(\d+)", stdout, re.MULTILINE)
    nxt = re.search(r"^Next up:\s+#(\d+)", stdout, re.MULTILINE)
    return (int(last.group(1)) if last else None, int(nxt.group(1)) if nxt else None)


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    init_repo(root)
    return root


def snapshot(root: Path) -> dict[str, bytes]:
    """Every file under `root` except `.git`, with its bytes."""
    out: dict[str, bytes] = {}
    for path in root.rglob("*"):
        if path.is_file() and ".git" not in path.relative_to(root).parts:
            out[path.relative_to(root).as_posix()] = path.read_bytes()
    return out


def issue_file(
    n: int, status: str, *, milestone: str = "M0", depends: str = "[]", commit: str = "null"
) -> str:
    return (
        "---\n"
        f"issue: {n}\n"
        f'title: "Issue {n}"\n'
        f"milestone: {milestone}\n"
        f"status: {status}\n"
        f"depends_on: {depends}\n"
        "agent: implementer\n"
        "model: sonnet\n"
        "effort: low\n"
        "checkpoint: null\n"
        f"commit: {commit}\n"
        "---\n"
        "## What\n\nBody.\n"
    )


def test_script_names_hand_derived_picks_on_fixture(repo):
    result = run_script("--root", str(repo), "--issues", str(FIXTURES))
    assert result.returncode == 0, result.stderr
    assert picks(result.stdout) == (EXPECTED_LAST, EXPECTED_NEXT)


def test_script_and_parse_mjs_agree_on_fixture(repo, tmp_path):
    if shutil.which("node") is None:
        pytest.skip("node is not installed; cannot run tools/console/src/parse.mjs")
    driver = tmp_path / "parse_driver.mjs"
    driver.write_text(
        "import { readdirSync, readFileSync } from 'node:fs';\n"
        "import { join } from 'node:path';\n"
        f"import {{ parseIssues, lastCompleted, nextIssue }} from {json.dumps(PARSE_MJS.as_uri())};\n"
        "const dir = process.argv[2];\n"
        "const files = readdirSync(dir).map((name) => ({ name, content: readFileSync(join(dir, name), 'utf8') }));\n"
        "const issues = parseIssues(files);\n"
        "const last = lastCompleted(issues);\n"
        "const next = nextIssue(issues);\n"
        "process.stdout.write(JSON.stringify({ last: last ? last.n : null, next: next ? next.n : null }));\n",
        encoding="utf-8",
    )
    node = subprocess.run(
        ["node", str(driver), str(FIXTURES)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    assert node.returncode == 0, node.stderr
    js = json.loads(node.stdout)
    script = picks(run_script("--root", str(repo), "--issues", str(FIXTURES)).stdout)
    assert (js["last"], js["next"]) == (EXPECTED_LAST, EXPECTED_NEXT)
    assert script == (js["last"], js["next"])


def test_default_run_prints_four_fields_in_order_and_exits_zero(repo):
    result = run_script("--root", str(repo), "--issues", str(FIXTURES))
    assert result.returncode == 0, result.stderr
    labels = [
        line.split(":", 1)[0] + ":"
        for line in result.stdout.splitlines()
        if re.match(r"^(Last completed|Next up|Branch / PR|Resume with):", line)
    ]
    assert labels == ["Last completed:", "Next up:", "Branch / PR:", "Resume with:"]
    assert "Resume with:     /factory-run 02" in result.stdout


def test_default_run_writes_nothing(repo):
    before = snapshot(repo)
    result = run_script("--root", str(repo), "--issues", str(FIXTURES))
    assert result.returncode == 0, result.stderr
    assert snapshot(repo) == before


def test_write_touches_only_state_md(repo):
    issues = repo / "docs" / "factory" / "issues"
    issues.mkdir(parents=True)
    for path in FIXTURES.iterdir():
        shutil.copy(path, issues / path.name)
    before = snapshot(repo)
    result = run_script("--root", str(repo), "--write")
    assert result.returncode == 0, result.stderr
    after = snapshot(repo)
    changed = {p for p in set(before) | set(after) if before.get(p) != after.get(p)}
    assert changed == {"docs/factory/STATE.md"}
    state = after["docs/factory/STATE.md"].decode("utf-8")
    assert state.startswith("<!-- Regenerated by /factory-status")
    assert "Resume with:     /factory-run 02" in state
    assert picks(state) == (EXPECTED_LAST, EXPECTED_NEXT)


def test_faults_print_before_the_fields(repo, tmp_path):
    issues = tmp_path / "issues"
    issues.mkdir()
    (issues / "01-done-without-commit.md").write_text(
        issue_file(1, "done", commit="null"), encoding="utf-8"
    )
    (issues / "02-open-missing-dep.md").write_text(
        issue_file(2, "open", depends="[99]"), encoding="utf-8"
    )
    result = run_script("--root", str(repo), "--issues", str(issues))
    assert result.returncode == 0, result.stderr
    out = result.stdout
    fault_at = out.index("FAULT:")
    assert fault_at < out.index("Last completed:")
    assert "done #1 has commit: null" in out
    assert "open #2 depends_on #99" in out


def test_no_fault_lines_on_clean_fixture(repo):
    result = run_script("--root", str(repo), "--issues", str(FIXTURES))
    assert result.returncode == 0, result.stderr
    assert "FAULT:" not in result.stdout
