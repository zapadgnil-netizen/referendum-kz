"""Load the built page the way an embedding viewer does and drive it.

A sandboxed iframe (opaque origin, so no localStorage), a strict Content-Security-Policy, the platform's
document skeleton around the page, and hashchange events suppressed. If the app starts and navigates here,
it does not depend on storage, the URL hash, or anything outside the page.

Usage: python tools/viewer_sim.py [web/dist/index.html]
"""

import http.server
import sys
import tempfile
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PAGE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "web" / "dist" / "index.html"
SKELETON = ('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
            "<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}"
            "body{margin:0;font:14px system-ui,sans-serif;background:#fafaf7}img{max-width:100%}[hidden]{display:none!important}</style></head><body>__PAGE__</body></html>")
CSP = ("sandbox allow-scripts allow-popups allow-forms; default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; "
       "style-src 'unsafe-inline' https://fonts.googleapis.com; img-src data:; font-src https://fonts.gstatic.com; connect-src 'none'")
fails = []


def check(cond, what):
    print(("  ok   " if cond else "  FAIL ") + what)
    if not cond:
        fails.append(what)


def main():
    tmp = Path(tempfile.mkdtemp())
    (tmp / "child.html").write_text(SKELETON.replace("__PAGE__", PAGE.read_text(encoding="utf-8")), encoding="utf-8")
    (tmp / "parent.html").write_text('<!doctype html><body style="margin:0"><iframe id="f" src="http://127.0.0.1:8812/child.html" '
                                     'sandbox="allow-scripts allow-popups allow-forms" style="width:1100px;height:900px;border:0"></iframe></body>', encoding="utf-8")

    def handler(csp):
        class H(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *a, **k):
                super().__init__(*a, directory=str(tmp), **k)
            def end_headers(self):
                if csp:
                    self.send_header("Content-Security-Policy", CSP)
                super().end_headers()
            def log_message(self, *a):
                pass
        return H

    servers = [http.server.ThreadingHTTPServer(("127.0.0.1", 8811), handler(False)), http.server.ThreadingHTTPServer(("127.0.0.1", 8812), handler(True))]
    for s in servers:
        threading.Thread(target=s.serve_forever, daemon=True).start()

    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1100, "height": 900})
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "404" not in m.text else None)
        page.goto("http://127.0.0.1:8811/parent.html")
        f = page.frame_locator("#f")
        f.locator("#content h1").first.wait_for(timeout=5000)
        # suppress hashchange inside the frame: navigation must not depend on it
        page.frames[1].evaluate("window.addEventListener('hashchange', e => e.stopImmediatePropagation(), true)")
        check("Know who you are dealing with" in f.locator("#content h1").first.inner_text(), "app starts inside a sandboxed frame with strict CSP")
        f.locator("#q").fill("Altyn Dala Stroy"); f.locator("#q").press("Enter")
        check(f.locator("#content tbody tr").count() >= 3, "search works with no storage")
        f.locator("#content tbody tr a:has-text('Open report')").first.click()
        check("Алтын Дала Строй" in f.locator("#content h1").first.inner_text(), "links navigate even when hashchange is blocked")
        f.locator(".tabs a:has-text('Risk')").click()
        check(f.locator(".tabs a[aria-current=page]").inner_text().startswith("Risk"), "tabs navigate")
        f.locator("button:has-text('Add to watchlist')").click()
        check(f.locator("button[data-act=unwatch]").count() == 1, "watchlist works with no storage")
        f.locator("button[data-act=clock][data-days='30']").click()
        check("Clock moved" in f.locator("#flash").inner_text(), "clock moves")
        f.locator("#nav a:has-text('Review queue')").click()
        f.locator("button[data-act=decide]").first.click()
        check("Saved" in f.locator("#flash").inner_text(), "review decision works")
        page.frames[1].evaluate("setTimeout(() => { throw new Error('boom') }, 0)")
        page.wait_for_timeout(200)
        check("could not start" in f.locator("#fatal").inner_text(), "an unexpected error shows a visible message, not a blank page")
        browser.close()
    check(not [e for e in errors if "boom" not in e], "no unexpected console errors" + ("" if not errors else f": {errors[:2]}"))
    print(f"\n{len(fails)} failure(s)")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
