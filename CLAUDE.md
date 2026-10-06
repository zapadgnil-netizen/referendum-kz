# Ashyq Dala ("open steppe")

A "who am I dealing with?" engine for Kazakhstan: type in a company, get owners, affiliates, land,
state contracts, court cases, plain-language risk flags and sources in about 60 seconds.
Wedge buyer: KYB / compliance teams at foreign banks and investors. Full spec: `docs/spec.md`.

## Commands
- Tests: `python -m pytest -q` (install with `pip install -e ".[dev]"`)
- Regenerate data: `PYTHONPATH=src python -m ashyqdala.synth web/data.json` (a test fails if it is stale)
- Build the app: `python web/build.py` writes the single page `web/dist/index.html`
- Click-through test in a real browser: `python tools/smoke.py` (needs playwright and Chromium)
- Browser unit tests: `node --test web/tests/pipeline.test.js` (also run by pytest)
- Matcher quality gate: `PYTHONPATH=src python -m ashyqdala.evaluate data/gold/pairs.jsonl`

## Layout
- `src/ashyqdala/` entity resolution: `bin.py` (BIN/IIN check digit), `translit.py` (match keys),
  `names.py` (legal forms), `match.py` (decision), `evaluate.py` (gold-set harness)
- `data/gold/pairs.jsonl` labelled pairs. All names and BINs are synthetic.
- `src/ashyqdala/synth.py` deterministic synthetic world (invented companies, hidden ground truth)
- `web/` the MVP app: `engine.js` (JS port of the matcher, parity-tested against Python), `pipeline.js` (linking, flags,
  search, events), `app.js` + `app.css` (early-2000s portal UI), `build.py`, `data.json`
- `docs/` spec, data sources, open legal questions
- `.claude/skills/` project skills (see below)

## Rules that are not negotiable
1. **A false merge is worse than a missed link.** It puts one company's litigation on another's report.
   Precision is the gate. Uncertain pairs go to REVIEW, never MATCH.
2. **Test first.** Add the failing test or gold pair before changing matcher behaviour.
3. **Companies and public officials only.** No profiling of private individuals.
4. **Every fact shows its source and a "last updated" stamp.**
5. **Risk flags are indicators, not accusations**, each backed by cited records.
6. Never bypass a portal's access controls (some registries require a local ID). Check terms before
   the first fetch and record the result in `docs/data-sources.md`.

## Project skills
`kz-entity-resolution`, `source-ingestion`, `risk-flags`, `kz-data-compliance`. These are v0: written
from the code and spec, not yet pressure-tested with subagents.

## Status
Entity-resolution core, a synthetic dataset and a working browser MVP (search, reports, watchlist with a simulated
clock, review queue, compare, matcher QA). Nothing ingests real data yet.
Unverified: the BIN check-digit algorithm and BIN-vs-IIN heuristic against an official sample.
