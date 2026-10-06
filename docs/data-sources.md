# Data sources: findings and open questions

Status key: **verified** (read the source), **reported** (a secondary source says so), **unknown**.

| Source | What it holds | Access | Status |
|---|---|---|---|
| data.egov.kz | 3,000+ open datasets from state bodies | Open data portal | reported: [egov.kz](https://egov.kz/cms/en/articles/open-data) |
| stat.gov.kz | BIN-based business register lookup | Free BIN lookup | reported |
| State Database of Legal Entities (GBD UL) | Official register | Reportedly local ID required | reported: [guide](https://businessdataguide.com/blog/jurisdictions/kazakhstan-company-search-guide). **Do not circumvent.** |
| Public financial statements | Joint-stock companies only (~2,500); LLPs keep financials private | Government portal | reported (same guide) |
| Procurement (goszakup) | Tenders, winners | unknown | **unknown: check terms/API** |
| Courts | Case records | unknown | **unknown: check terms/API** |
| Land cadastre | Title, encumbrances | unknown | **unknown: check terms/API** |
| Sanctions / PEP | OFAC, EU, UN, PEP lists | OpenSanctions data is CC BY-NC; commercial use needs a paid licence | reported: [licensing](https://www.opensanctions.org/docs/commercial/exemption/), [self-hosting](https://www.opensanctions.org/docs/self-hosted/) |

## Before ingesting any source
Fill in a row: terms of use read (date), robots.txt, rate limit, whether an API exists, whether
personal data appears, what we may redistribute. See skill `source-ingestion`.

## Known BIN facts to verify against an official sample
Check-digit algorithm and the BIN/IIN fifth-digit heuristic in `src/ashyqdala/bin.py` were written from
the published scheme and tested only on synthetic numbers.
