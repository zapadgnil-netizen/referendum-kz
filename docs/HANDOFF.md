# Handoff: everything a coding agent needs to continue Ashyq Dala

Read this, then `CLAUDE.md` (rules and commands), then `docs/spec.md`. Last updated 2026-10-06.

## What this is
"Who am I dealing with?" for Kazakhstan: type a company name or BIN, get owners, affiliates, land, state
contracts, court cases, plain-language risk indicators with sources, monitoring, and history snapshots.
Wedge buyer: KYB / compliance teams at foreign banks and investors, and law firms doing Kazakh M&A or disputes.
The pitch rests on Kazakhstan being a sanctions-evasion transit hub.

## Where we are (verified unless marked)
- **Matcher core (Python, the reference):** `src/ashyqdala/` BIN check digit, Cyrillic/Kazakh/Latin match keys,
  legal-form parsing, similarity, MATCH / REVIEW / NO_MATCH decision. Gold set: `data/gold/pairs.jsonl` (35 pairs,
  precision 1.000, recall 0.95).
- **JS port:** `web/engine.js`, line for line. `tests/test_js_parity.py` runs both on about 9,700 generated cases and
  fails on any difference. Mutation-checked.
- **Synthetic world:** `src/ashyqdala/synth.py` makes 27 invented companies across registry, procurement, courts and
  cadastre, with hidden ground truth, planted risk scenarios, traps, and dated future events. BINs use month 13 so none
  can be real. `web/data.json` is generated; a test fails if it is stale.
- **Pipeline:** `web/pipeline.js` links records to companies, derives risk flags, ownership, search, monitoring events,
  matcher QA. 26 node tests, mutation-checked.
- **App:** `web/app.js` + `web/app.css` + `web/template.html`, built into one file by `web/build.py`. Early-2000s
  portal look. Pages: Home, Search, Company (9 tabs), Watchlist (simulated clock), Review queue, Compare, Matcher quality,
  Help. State in localStorage with in-memory fallback.
- **Tests:** `python -m pytest -q` (82), `python tools/smoke.py <url>` (about 50 browser checks incl. phone width),
  `python tools/viewer_sim.py` (sandboxed frame, strict CSP, no storage, hashchange blocked).
- **Published copy (private):** https://claude.ai/artifact/Pp3otgnkgSpYYhQHZhNS3Q
- **Not real:** every company, number, case and official is invented. Nothing is connected to any real source.
- **Unverified:** the BIN check-digit algorithm and the BIN-vs-IIN fifth-digit rule against an official sample.
  Risk thresholds and point weights are placeholders. The public-official (PEP) list in the app is synthetic.
- **Project skills** (`.claude/skills/`, v0, not pressure-tested with subagents): `kz-entity-resolution`,
  `source-ingestion`, `risk-flags`, `kz-data-compliance`.

## Decisions made (do not relitigate without the user)
1. Companies and public officials only. No profiling of private individuals.
2. A false merge is worse than a missed link. Precision is the gate; unsure goes to REVIEW.
3. Name-only evidence is shown but never adds to a risk score until a BIN or a person confirms it.
4. Python is the reference for the matcher; the JS port must match it exactly.
5. **Next 90 days: priority is the first paying customer.** Chosen approach (proposed, **not yet approved by the user**):
   *concierge-first.* Sell one fixed-price Kazakh counterparty report, built by an analyst using public lookups by hand,
   loaded into the tool. Automate only the lookups that repeat. Stop rule: six weeks of outreach with no paid pilot means
   change the buyer or product before writing pipeline code. See "Brainstorm status" below.

## Why not "every company in Kazakhstan" yet
Competitors already aggregate this ([Adata.kz](https://adata.kz/en/useful/counterparty), [Kompra.kz](https://www.bcc.kz/en/bcc-journal/business-partner-check)),
so the data is obtainable; aggregation is not the moat. Real chokepoints: owner-only land data behind a digital
signature; per-BIN lookups with no bulk download found; court records without BINs; LLP financials private; procurement
API terms unconfirmed; personal-data localisation law; scraper upkeep; sanctions-list licensing; and no proof yet that
anyone pays. Details and sources: `docs/data-sources.md`. Questions for counsel: `docs/legal-questions.md`.

## Brainstorm status (superpowers:brainstorming, in progress)
- Done: context, chokepoints, three approaches (A wholesale via an aggregator API, B own pipeline with pull-through cache
  and event feeds, C counterparty-consented data plus bring-your-own-data matching), user priority = first paying customer.
- Design section 1 presented (concierge-first). Waiting for the user's approval.
- If approved, section 2 is: a paste/CSV import path for records, a report export a customer can receive, and a one-page
  counterparty consent request. No scrapers. Then write the spec to
  `docs/superpowers/specs/YYYY-MM-DD-concierge-mvp-design.md`, get the user's review, then `superpowers:writing-plans`.
- **Do not write code for this until the user approves the design.**

## Next tasks, in order (after approval)
1. Record import: paste or CSV of records (source, name, BIN, date, amount, etc.) into the app, validated, through the
   same linking pipeline. Keep the review queue.
2. Report export: a clean report a customer can receive. The artifact viewer blocks downloads and printing, so this is
   for the local app or a real host: a standalone HTML file or a text summary (a copy-summary function exists).
3. Counterparty consent request: one-page template (EN and RU) asking a counterparty to share their own signed land and
   tax-debt extracts.
4. Real source number one, only after the user and counsel agree: fill the `docs/data-sources.md` row first (terms,
   robots, rate limit, API, personal data, redistribution), then build with skill `source-ingestion`.
5. Calibrate flag thresholds and weights on real data. Verify the BIN check digit against an official sample.
6. Port the pipeline to Python when a backend exists (today the pipeline lives only in JS; the matcher is the part with
   a Python reference).

## Rules for working here
- Test first. Add the failing test or gold pair before changing matcher behaviour. For JS, change Python first, then
  `web/engine.js`, and the parity test must pass.
- After a code change run: `python -m pytest -q`, `python web/build.py`, `python tools/smoke.py <url>`,
  `python tools/viewer_sim.py`. Look at screenshots for UI changes; passing assertions do not mean it looks right.
- When you write tests after code, mutation-test them (break the code on purpose, confirm a test fails).
- Never commit `web/dist/` (it is generated and gitignored). Never put real company or personal data in fixtures.
- Never bypass a portal's access controls. Never scrape before the terms are read and recorded.
- Copy and labels: indicators, not accusations. Every fact shows its source and a "last updated" date.
- Commits: end the message with the attribution lines the user's environment specifies. Do not open a PR unless asked.

## Gotchas already paid for
- `<meta charset="utf-8">` is required in the page. A plain server sends no charset and browsers then garble Cyrillic;
  search silently found nothing. `tools/serve.py` also sends the charset in the header.
- No regex lookbehind in browser code (older Safari and WebViews cannot parse it and the whole script dies).
- The app must not depend on the URL hash, localStorage or clipboard; each is wrapped and has a fallback.
- Python `\d` matches non-ASCII digits; BIN checks use `[0-9]`. Python rounds half to even, JS `toFixed` does not;
  `pyRound` in `engine.js` handles it.
- `pkill -f <pattern>` can match and kill your own shell. Find a PID by port or `/proc` instead.
- A layout rule that sets `display` overrides the `hidden` attribute; the page has an explicit `[hidden]` rule.
- In the artifact viewer, only a plain `#anchor` reaches `location.hash`; no external hosts except a short allowlist;
  downloads and `window.print()` do nothing.

## Setup on a new machine
```
git clone https://github.com/zapadgnil-netizen/referendum-kz
cd referendum-kz && git checkout claude/ashyqdala-building-skills-ed11yp
pip install -e ".[dev]"            # pytest
python -m pytest -q                # expect 82 passed (needs node for the 2 JS tests; they skip without it)
python tools/serve.py              # http://127.0.0.1:8000/
pip install playwright             # optional, for tools/smoke.py and tools/viewer_sim.py (needs a Chromium)
```

## A prompt to start a local coding agent
> Read `docs/HANDOFF.md`, `CLAUDE.md` and `docs/spec.md`. Run the tests. Then tell me what you understand the project
> to be, what is verified and what is not, and what you would do next. Do not write code until I approve a design.
