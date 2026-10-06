---
name: kz-entity-resolution
description: Use when linking or de-duplicating Kazakhstan company records across sources, changing the matcher, handling Cyrillic/Latin/Kazakh name variants, BIN/IIN numbers, or adding gold-set pairs.
---

# Kazakhstan entity resolution

## Principle
A false merge puts one company's court cases on another's report. A missed link costs a lookup.
**Precision beats recall. Unsure means REVIEW, never MATCH.**

## Where things live
| Concern | File |
|---|---|
| 12-digit BIN/IIN, check digit | `src/ashyqdala/bin.py` |
| Script-collapsing match key | `src/ashyqdala/translit.py` |
| Legal form (ТОО/ЖШС/LLP, АО/АҚ/JSC, ИП/ЖК) + core name | `src/ashyqdala/names.py` |
| Decision (MATCH / REVIEW / NO_MATCH) | `src/ashyqdala/match.py` |
| Gold-set metrics | `src/ashyqdala/evaluate.py`, `data/gold/pairs.jsonl` |

## Rules the matcher follows (keep them)
1. Two **valid** BINs decide everything: equal means MATCH, different means NO_MATCH, whatever the names say.
2. A BIN with a bad check digit is **ignored and flagged** (`bin_invalid_ignored`), never trusted.
3. Names compare on `match_key`, which collapses қ/к/х/kh/q to `k`, ж/zh/j to `zh`, y/i, ү/ұ/у.
   The key is lossy: use it to compare, never to display.
4. Different legal forms lower the score (`legal_form_mismatch`). Same name as ТОО and АО is not auto-matched.
5. Different numbers ("Строй 1" vs "Строй 2") can never reach MATCH, however long the shared text.
6. A form marker counts only at the start or end of a name.

## Changing the matcher
1. Add the failing unit test **and** a labelled pair in `data/gold/pairs.jsonl` (all names and BINs synthetic).
2. `python -m pytest -q`, then `PYTHONPATH=src python -m ashyqdala.evaluate data/gold/pairs.jsonl`.
3. Precision must stay at or above 0.98. Do not buy recall with precision. Never move a threshold to fix one pair.
4. Look at borderline scores, not just pass/fail: a hard negative at 0.917 against a 0.92 cutoff is a bug waiting.

## Known limits
- Russian loan words with ж pronounced g (Лоджистик / Logistik) score about 0.88 and go to REVIEW.
- Latin `c` and `x` are ambiguous; only `x -> ks` and `c` before e/i/y are handled.
- BIN check-digit algorithm and BIN-vs-IIN fifth-digit heuristic are unverified against an official sample.

## Common mistakes
- Treating REVIEW as a soft MATCH in reports. REVIEW needs a human or more evidence.
- Matching on name when both BINs are valid and differ.
- Using real company names or BINs as fixtures. Keep fixtures synthetic.
