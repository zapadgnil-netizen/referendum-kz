"""Build the app and run it locally.

    python tools/serve.py            # http://127.0.0.1:8000/ and opens your browser
    python tools/serve.py 9000       # another port
    python tools/serve.py --no-open  # do not open a browser

Everything runs in the page; this server only hands out one HTML file, so there is nothing to configure.
"""

import functools
import http.server
import runpy
import sys
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class Handler(http.server.SimpleHTTPRequestHandler):
    """Serves web/dist with an explicit UTF-8 charset (a bare text/html makes browsers guess and garble Cyrillic)."""

    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".html": "text/html; charset=utf-8"}

    def log_message(self, *args, **kwargs):
        pass


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    port = int(args[0]) if args else 8000
    runpy.run_path(str(ROOT / "web" / "build.py"))
    handler = functools.partial(Handler, directory=str(ROOT / "web" / "dist"))
    try:
        server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    except OSError as err:
        print(f"Cannot use port {port}: {err}. Try: python tools/serve.py {port + 1}")
        return 1
    url = f"http://127.0.0.1:{port}/"
    print(f"Ashyq Dala is running at {url}  (press Ctrl+C to stop)", flush=True)
    if "--no-open" not in argv:
        try:
            webbrowser.open(url)
        except Exception:
            pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
