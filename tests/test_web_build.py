"""The built page must be self-describing: it is opened from disk and from plain servers, not only the artifact viewer."""

import subprocess
import sys
import threading
import http.server
import functools
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent.parent


def _build():
    subprocess.run([sys.executable, str(ROOT / "web" / "build.py")], check=True, capture_output=True)
    return (ROOT / "web" / "dist" / "index.html").read_text(encoding="utf-8")


def test_page_declares_utf8_before_any_text():
    page = _build()
    assert '<meta charset="utf-8">' in page[:300], "without it a plain server's default charset garbles Cyrillic"


def test_page_is_self_contained():
    page = _build()
    assert "/*__" not in page, "an unfilled build placeholder is left in the page"
    for external in ("src=\"http", "href=\"http"):
        assert external not in page, f"page loads something external: {external}"


def test_local_server_sends_a_utf8_content_type():
    sys.path.insert(0, str(ROOT / "tools"))
    import serve

    _build()
    handler = functools.partial(serve.Handler, directory=str(ROOT / "web" / "dist"))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{server.server_address[1]}/") as r:
            assert "charset=utf-8" in r.headers["Content-Type"].lower()
    finally:
        server.shutdown()
