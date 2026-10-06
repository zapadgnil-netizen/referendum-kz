"""The browser engine (web/engine.js) must give exactly the same answers as the Python reference."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from tests.parity_corpus import build

ROOT = Path(__file__).parent.parent


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_js_engine_matches_python_reference(tmp_path):
    corpus = tmp_path / "corpus.json"
    corpus.write_text(json.dumps(build(), ensure_ascii=False), encoding="utf-8")
    run = subprocess.run(["node", str(ROOT / "web" / "tests" / "parity_check.js"), str(corpus)],
                         capture_output=True, text=True)
    assert run.returncode == 0, run.stdout[-3000:] + run.stderr[-500:]
    assert "parity ok" in run.stdout
