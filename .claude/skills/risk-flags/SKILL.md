---
name: risk-flags
description: Use when adding, changing or wording a risk flag, risk score or plain-language summary in a counterparty report, or when deciding how a flag is evidenced and sourced.
---

# Risk flags

## Principle
A flag is an **indicator backed by cited records**, never an accusation. Wrong or unfair flags are
the main legal and trust risk of this product.

## A flag is only valid if it has
1. `id` and a one-sentence plain-language statement a compliance officer can read in 5 seconds.
2. The exact records that triggered it, each with source link and `fetched_at`.
3. A threshold stated in numbers (calibrate on real data; never invent one and ship it).
4. Known false-positive modes (e.g. a new company has few employees because it is new).
5. A severity and what a reader should check next.

## Wording
| Use | Avoid |
|---|---|
| "Won 14 tenders in 12 months; 2 employees reported (source, date)" | "Shell company", "fraud", "corrupt" |
| "Linked to a PEP via shared director (record, date)" | "Politically connected criminal" |
| "4 court cases as defendant since 2023" | "Serial litigant" |
Say what the records show and when. Say what is **not** known (no data is different from clean).

## Starter catalogue (thresholds TBD)
- Tender wins vs headcount mismatch
- Land held next to a project the company won a contract for
- PEP or sanctions tie (needs a licensed list, see `docs/data-sources.md`)
- Repeated litigation as defendant
- Ownership change shortly before or after a contract
- **Data-freshness flag**: key source stale or unavailable

## Score
Combine flags transparently (list contributions); do not hide a number behind a black box.
Show coverage ("3 of 5 sources checked") so a low score is not mistaken for a clean bill.

## Before shipping a new flag
Test with matcher REVIEW cases: a flag must never fire off an unresolved REVIEW link.
Have counsel review the wording (`docs/legal-questions.md` item 5).

## Common mistakes
- Firing a flag from a name-only match.
- Treating missing data as a pass.
- Averaging flags into one opaque number.
