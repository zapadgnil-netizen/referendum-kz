"""The browser app's pipeline tests (node) and the shipped dataset must stay in step with Python."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from ashyqdala.synth import generate

ROOT = Path(__file__).parent.parent


def test_shipped_dataset_is_exactly_what_the_generator_produces():
    shipped = json.loads((ROOT / "web" / "data.json").read_text(encoding="utf-8"))
    assert shipped == json.loads(json.dumps(generate(), ensure_ascii=False)), "run: python -m ashyqdala.synth web/data.json"


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_pipeline_unit_tests_pass_in_node():
    run = subprocess.run(["node", "--test", str(ROOT / "web" / "tests" / "pipeline.test.js")], capture_output=True, text=True)
    assert run.returncode == 0, run.stdout[-3000:] + run.stderr[-500:]
