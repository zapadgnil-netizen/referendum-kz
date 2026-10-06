"""Click through every page and flow of the built app in a real browser.

Usage: python tools/smoke.py [web/dist/index.html] [screenshot_dir]
Needs playwright and a Chromium (PLAYWRIGHT_BROWSERS_PATH). Exits non-zero on any failure.
"""

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
ARG = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "web" / "dist" / "index.html")
URL = ARG if ARG.startswith("http") else "file://" + str(Path(ARG).resolve())
SHOTS = Path(sys.argv[2]) if len(sys.argv) > 2 else None
fails, errors = [], []


def check(cond, what):
    print(("  ok   " if cond else "  FAIL ") + what)
    if not cond:
        fails.append(what)


def shot(page, name):
    if SHOTS:
        SHOTS.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=True)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 1200, "height": 900})
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        page.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)
        url = URL.rstrip("#")

        print("home")
        page.goto(url); page.wait_for_selector("#content h1")
        check("Know who you are dealing with" in page.inner_text("#content"), "home hero shows")
        check(page.locator("#nav a").count() >= 7, "left navigation has links")
        shot(page, "01-home")

        print("search")
        page.fill("#q", "Altyn Dala Stroy"); page.press("#q", "Enter")
        page.wait_for_selector("table")
        rows = page.locator("#content tbody tr").count()
        check(rows >= 3, f"search 'Altyn Dala Stroy' finds the Altyn family ({rows} rows)")
        check("Same name" in page.inner_text("#content tbody tr:first-child"), "exact name ranks first")
        page.fill("#q", "Nur Stroy"); page.press("#q", "Enter"); page.wait_for_selector("table")
        check("share this name" in page.inner_text("#content"), "namesake warning appears")
        page.fill("#q", "123456789012"); page.press("#q", "Enter")
        check("not a valid BIN" in page.inner_text("#content"), "invalid BIN is explained")
        page.fill("#q", "ТОО"); page.press("#q", "Enter")
        check("not only the legal form" in page.inner_text("#content"), "legal-form-only query is explained")
        page.fill("#q", "Bogen Dorstroy"); page.press("#q", "Enter"); page.wait_for_selector("table")
        check("former name" in page.inner_text("#content"), "old name finds the renamed company")
        page.fill("#q", "Altyn Dala Stroy"); page.press("#q", "Enter"); page.wait_for_selector("table")
        shot(page, "02-search")
        page.click("#content tbody tr:first-child a >> text=Open report")

        print("report")
        page.wait_for_selector(".tabs")
        check("ТОО «Алтын Дала Строй»" in page.inner_text("h1"), "report opens for the right company")
        check("70" in page.inner_text(".big"), "score is 70")
        shot(page, "03-report-summary")
        for tab in ["Risk indicators", "Ownership", "Contracts", "Courts", "Land", "History", "Records", "Sources", "Summary"]:
            page.click(f".tabs a:has-text('{tab}')")
            page.wait_for_timeout(50)
            check(page.locator(f".tabs a[aria-current=page]:has-text('{tab}')").count() == 1, f"tab '{tab}' opens")
            if tab in ("Risk indicators", "Contracts", "Ownership"):
                shot(page, "04-" + tab.split()[0].lower())
        page.click(".tabs a:has-text('Risk indicators')")
        page.click("text=Show details >> nth=1")
        check("Check next" in page.inner_text("#content"), "risk details expand")
        page.click(".tabs a:has-text('Contracts')")
        page.click("th a:has-text('M KZT')")
        check(page.locator("th[aria-sort=ascending], th[aria-sort=descending]").count() >= 1, "contracts table sorts")
        page.click("text=Confirmed only")
        check("Confirmed only" in page.inner_text(".pipes b"), "contracts filter works")
        page.click(".tabs a:has-text('Summary')")
        page.check("input[data-act=assume]")
        check("95" in page.inner_text(".big"), "assuming unconfirmed evidence moves the score to 95")
        page.uncheck("input[data-act=assume]")

        print("watchlist and clock")
        page.click("button:has-text('Add to watchlist')")
        check("On watchlist" in page.inner_text("#content"), "company is watched")
        page.click("button[data-act=clock][data-days='30']")
        check("Clock moved" in page.inner_text("#flash"), "clock moves with a summary")
        check("new" in page.inner_text("#nav"), "nav shows new alerts")
        page.click("button[data-act=clock][data-days='30']")  # a second month brings the court-data refresh as well
        page.click("#nav a:has-text('Watchlist')"); page.wait_for_selector("h1:has-text('Watchlist')")
        check(page.locator("tr.unread").count() >= 1, "watchlist shows unread alerts")
        shot(page, "05-watchlist")
        n0 = page.locator("tr.unread").count()
        check(n0 >= 2, f"two months of data give several alerts ({n0})")
        page.click("button[data-act=read] >> nth=0")
        check(page.locator("tr.unread").count() == n0 - 1, "mark read works")
        page.click("button[data-act=readall]")
        check(page.locator("tr.unread").count() == 0, "mark all read works")
        page.click("input[data-act=rule][data-type=win]")
        check(page.locator("input[data-act=rule][data-type=win]").is_checked() is False, "alert rule can be switched off")
        page.click("input[data-act=rule][data-type=win]")

        print("review queue")
        page.click("#nav a:has-text('Review queue')"); page.wait_for_selector("h1:has-text('Review queue')")
        before = page.locator("#content table >> nth=0").locator("tbody tr").count()
        shot(page, "06-queue")
        check("Needs a decision" in page.inner_text("#content .pipes b"), "queue opens on the items that need a decision")
        page.click("button[data-act=decide][data-entity='']  >> nth=0")
        check("Saved" in page.inner_text("#flash"), "a decision is saved with a message")
        after = page.locator("#content table >> nth=0").locator("tbody tr").count()
        check(after in (before - 1, before), f"queue updates after a decision ({before} to {after})")
        page.click("button[data-act=undo] >> nth=0")
        check("Decision removed" in page.inner_text("#flash"), "decision can be undone")
        page.click("text=All name-only links (")
        check(page.locator("#content .pipes b:has-text('name-only')").count() == 1, "queue filter works")
        page.click("button[data-act=decide]:has-text('Confirm') >> nth=0")
        check("Saved" in page.inner_text("#flash"), "confirming a name-only link works")

        print("compare, quality, help")
        page.click("#nav a:has-text('Compare')"); page.wait_for_selector("#cmpA")
        opts = page.locator("#cmpA option").count()
        page.select_option("#cmpA", index=4); page.select_option("#cmpB", index=12)
        page.wait_for_selector("table")
        check("Risk score" in page.inner_text("#content"), f"compare shows a table ({opts} options)")
        shot(page, "07-compare")
        page.click("#nav a:has-text('Matcher quality')"); page.wait_for_selector("h1:has-text('Matcher quality')")
        check("Linked wrongly" in page.inner_text("#content") and "None. No record was linked" in page.inner_text("#content"), "QA shows no false merges")
        shot(page, "08-qa")
        page.click("#nav a:has-text('Help')"); page.wait_for_selector("h1:has-text('Help')")
        check("The matcher in six rules" in page.inner_text("#content"), "help page renders")

        print("history")
        page.goto(url + "#home"); page.wait_for_selector("#content h1")
        page.click("#nav a:has-text('Help')"); page.wait_for_selector("h1:has-text('Help')")
        page.click("#nav a:has-text('Compare')"); page.wait_for_selector("h1:has-text('Compare')")
        page.go_back(); page.wait_for_selector("h1:has-text('Help')")
        check("Help and method" in page.inner_text("#content h1"), "the browser Back button returns to the previous page")

        print("keyboard and persistence")
        page.goto(url + "#home"); page.wait_for_selector("#content h1")
        page.keyboard.press("/")
        check(page.evaluate("document.activeElement.id") == "q", "'/' focuses the search box")
        page.reload(); page.wait_for_selector("#content h1")
        check("Watchlist (" in page.inner_text("#nav"), "watchlist survives a reload")

        print("phone width")
        phone = browser.new_context(viewport={"width": 390, "height": 800}).new_page()
        phone.on("pageerror", lambda e: errors.append("phone pageerror: " + str(e)))
        for hash_ in ["home", "search", "watchlist", "queue", "compare", "qa", "help"]:
            phone.goto(url + "#" + hash_); phone.wait_for_selector("#content h1"); phone.wait_for_timeout(50)
            sw = phone.evaluate("document.documentElement.scrollWidth")
            check(sw <= 392, f"no sideways scroll on #{hash_} (scrollWidth {sw})")
        bin_ = page.evaluate("JSON.parse(document.getElementById('data').textContent).registry[3].bin")
        for tab in ["summary", "risk", "ownership", "contracts", "courts", "land", "history", "records", "sources"]:
            phone.goto(url + f"#company.{bin_}.{tab}"); phone.wait_for_selector(".tabs"); phone.wait_for_timeout(50)
            sw = phone.evaluate("document.documentElement.scrollWidth")
            check(sw <= 392, f"no sideways scroll on report/{tab} (scrollWidth {sw})")
        phone.goto(url + f"#company.{bin_}.summary"); phone.wait_for_selector(".tabs"); shot(phone, "09-phone-report")
        browser.close()

    check(not errors, "no JavaScript errors" + ("" if not errors else ": " + "; ".join(errors[:3])))
    print(f"\n{len(fails)} failure(s)")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
