# Ashyq Dala ("open steppe")

A "who am I dealing with?" engine for Kazakhstan: type in a company, get owners, affiliates, land,
state contracts, court cases, plain-language risk flags and sources in about 60 seconds.
Wedge buyer: KYB / compliance teams at foreign banks and investors. Full spec: `docs/spec.md`.

## Commands
- Tests: `python -m pytest -q` (install with `pip install -e ".[dev]"`)
- Matcher quality gate: `PYTHONPATH=src python -m ashyqdala.evaluate data/gold/pairs.jsonl`

## Layout
- `src/ashyqdala/` entity resolution: `bin.py` (BIN/IIN check digit), `translit.py` (match keys),
  `names.py` (legal forms), `match.py` (decision), `evaluate.py` (gold-set harness)
- `data/gold/pairs.jsonl` labelled pairs. All names and BINs are synthetic.
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
Entity-resolution core with a 35-pair gold set. Nothing ingests real data yet.
Unverified: the BIN check-digit algorithm and BIN-vs-IIN heuristic against an official sample.
