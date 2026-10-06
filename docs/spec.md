# Ashyq Dala: product spec (v0)

## Problem
Kazakhstan's public records (company registry, land cadastre, procurement, courts) are mostly free
but scattered and awkward. "Aggregated public data" is a feature nobody pays for. People pay for
**answers** and **avoiding risk**.

## Product: a "who am I dealing with?" engine
Type a company, get a full picture in about 60 seconds.

1. **Entity resolution (the moat).** Join one company to owners, affiliates, land holdings, state
   contracts won and court cases across portals, through Cyrillic / Latin / Kazakh transliteration chaos.
2. **Risk flags, not raw records.** Short plain-language summary, a score, sources one click away.
   Examples: wins many tenders but has 2 employees; owns land next to a project it got a contract for;
   tied to a PEP; repeated litigation.
3. **Monitoring.** Alerts when a counterparty is sued, wins a tender, or changes owners. This turns a
   one-off lookup into a subscription.
4. **Historical snapshots.** Government sites quietly edit or delete records. Our own archive gains
   value over time.

## Buyer (pick one first)
1. **Foreign investors, banks, compliance teams doing KYB / due diligence on Kazakh counterparties.**
   Best wedge: Kazakhstan is a sanctions-evasion transit hub, so the need is real and report budgets
   are hundreds to thousands of dollars.
2. Law firms and consultancies (M&A, disputes). 3. Procurement bidders. 4. Journalists and NGOs
   (low revenue, high credibility). 5. Real-estate buyers checking title and encumbrances.

## Pricing hypothesis
Free search shows basic info and teases flags; per-report $20-100 for one-off users; monthly
subscription with monitoring and an API for banks and firms.

## Risks to manage
- Scraping terms and Kazakhstan's personal-data law. Scope to companies and public officials.
  See `docs/legal-questions.md`.
- Data quality and freshness decide trust: "last updated" on everything.
- Prove people pay for due-diligence reports before building the full platform.

## Build order
1. Entity-resolution core + gold set (done, v0).
2. One source end-to-end with snapshots (company registry via open data).
3. Report format for the KYB buyer; 5-10 hand-checked sample reports.
4. Sell reports to a handful of buyers. Only then: monitoring, API, more sources.
