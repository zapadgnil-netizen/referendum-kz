# Data sources: findings and open questions

Status key: **verified** (read the source), **reported** (a secondary source says so), **unknown**.

| Source | What it holds | Access | Status |
|---|---|---|---|
| data.egov.kz | 3,000+ open datasets from state bodies | Open data portal | reported: [egov.kz](https://egov.kz/cms/en/articles/open-data) |
| stat.gov.kz | BIN-based business register lookup | Free BIN lookup | reported |
| State Database of Legal Entities (GBD UL) | Official register | Reportedly local ID required | reported: [guide](https://businessdataguide.com/blog/jurisdictions/kazakhstan-company-search-guide). **Do not circumvent.** |
| Public financial statements | Joint-stock companies only (~2,500); LLPs keep financials private | Government portal | reported (same guide) |
| Procurement (goszakup.gov.kz) | Tenders, winners | Reported to publish open data via an API; the OECD notes machine-readability is not guaranteed by law. Tokens, rate limits, terms not confirmed | reported: [OECD](https://www.oecd.org/en/publications/public-procurement-in-kazakhstan_c11183ae-en/full-report/e-procurement-to-strengthen-transparency-and-develop-performance-evaluation-of-public-procurement-in-kazakhstan_84ba05c4). **check terms/API** |
| Courts (sud.gov.kz, Torelik system) | Case records | Whether a search by BIN or bulk access exists is unconfirmed. Records usually carry no BIN, so linking is by name | **unknown: check terms/API** |
| Land cadastre (eGov service) | Title, encumbrances | Requested through eGov with a digital signature (EDS), framed as an owner obtaining their own data | reported: [gov4c.kz](https://gov4c.kz/en/top-questions/land-cadastre/). Third-party access unconfirmed |
| State Revenue Committee (kgd.gov.kz) | Taxpayer search, tax-debt check, unreliable-taxpayer list | Lookup by BIN. No bulk download found | reported; bulk **unknown** |
| Business partners register | Official register of business partners | Rules exist ([adilet](https://adilet.zan.kz/eng/docs/P2100000372)); access for third parties unknown | **unknown: investigate** |
| Sanctions / PEP | OFAC, EU, UN, PEP lists | OpenSanctions data is CC BY-NC; commercial use needs a paid licence | reported: [licensing](https://www.opensanctions.org/docs/commercial/exemption/), [self-hosting](https://www.opensanctions.org/docs/self-hosted/) |

## Before ingesting any source
Fill in a row: terms of use read (date), robots.txt, rate limit, whether an API exists, whether
personal data appears, what we may redistribute. See skill `source-ingestion`.

## Known BIN facts to verify against an official sample
Check-digit algorithm and the BIN/IIN fifth-digit heuristic in `src/ashyqdala/bin.py` were written from
the published scheme and tested only on synthetic numbers.

## Competitors already aggregating this data (found 2026-10, not in the original pitch)
- [Adata.kz](https://adata.kz/en/useful/counterparty): pulls from the tax committee, procurement, statistics, Supreme Court and Ministry of Justice; has an API, mass checks, sanctions checks.
- [Kompra.kz](https://www.bcc.kz/en/bcc-journal/business-partner-check): counterparty checks for Kazakh and CIS companies from open data.
Consequence: aggregation is not the moat. Differentiate on entity-resolution confidence, an analyst review workflow, English KYB reports, history snapshots and monitoring.

## Law that shapes the architecture (reported, ask counsel before relying on it)
Personal data of persons in Kazakhstan must be stored in a database located in Kazakhstan; transfers abroad need consent; a 2026 Digital Code tightens this.
Sources: [summary](https://uppersetup.com/en/blog/personal-data-and-localisation-in-kazakhstan-in-2026-law-no), [AmCham brief](https://amcham.kz/wp-content/uploads/2026/05/2026-05-15_AmCham_DataLocalization_Issue-Brief_ENG_v5.pdf).
Design response: keep the core to company facts and public officials in role; treat anything person-level as a separate store, if it exists at all.
