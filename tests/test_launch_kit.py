"""The launch kit (partner desk + public offer) builds and its node checks pass."""

import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).parent.parent


def test_launch_kit_builds():
    subprocess.run([sys.executable, str(ROOT / "launch" / "build.py")], check=True, capture_output=True)
    assert (ROOT / "launch" / "dist" / "Ashyq_Dala_Desk.html").stat().st_size > 0
    assert b'charset="utf-8"' in (ROOT / "launch" / "dist" / "Ashyq_Dala_Offer.html").read_bytes()[:200]


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_launch_kit_core_checks_pass_in_node():
    run = subprocess.run(["node", str(ROOT / "launch" / "tests" / "core.cjs")], capture_output=True, text=True)
    assert run.returncode == 0, run.stdout[-3000:] + run.stderr[-500:]
