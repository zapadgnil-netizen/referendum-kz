"""Demo: one synthetic counterparty report built by the real matcher.

Every company, BIN, amount and case here is invented. Flag thresholds and score weights are
illustrative placeholders for the demo, not calibrated values.
"""

from __future__ import annotations

import hashlib
import json
from datetime import date

from .match import Decision, Record, score as match_score

REPORT_DATE = "2026-10-06"
TARGET = Record("ТОО «Алтын Дала Строй»", "100140526019")

# Synthetic BINs (valid check digits).
BIN_TARGET, BIN_HOLDING, BIN_SIBLING_2 = "100140526019", "100140815904", "100140830165"
BIN_SERVICE, BIN_OLD_OWNER, BIN_TRANS = "100140613182", "100140609134", "100140909966"

SOURCES = [
    {"id": "registry", "label": "Company registry", "fetched": "2026-10-05"},
    {"id": "procurement", "label": "State procurement", "fetched": "2026-10-05"},
    {"id": "courts", "label": "Court records", "fetched": "2026-08-26"},
    {"id": "cadastre", "label": "Land cadastre", "fetched": "2026-10-04"},
]
STALE_AFTER_DAYS = 30

# Registry history: the portal only ever shows the latest version; we keep both.
_SNAPSHOT_PAYLOADS = [
    {"fetched": "2026-06-14", "name": TARGET.name, "bin": BIN_TARGET, "employees": 2,
     "owner": "ТОО «Қызыл Тау Холдинг»", "owner_bin": BIN_OLD_OWNER},
    {"fetched": "2026-09-02", "name": TARGET.name, "bin": BIN_TARGET, "employees": 2,
     "owner": "ТОО «Дала Инвест Групп»", "owner_bin": BIN_HOLDING},
]

_REGISTRY = [
    {"name": "ТОО «Алтын Дала Строй»", "bin": BIN_TARGET, "owner_bin": BIN_HOLDING},
    {"name": "ТОО «Алтын Дала Сервис»", "bin": BIN_SERVICE, "owner_bin": BIN_HOLDING},
    {"name": "ТОО «Сары Арка Транс»", "bin": BIN_TRANS, "owner_bin": BIN_HOLDING},
    {"name": "ТОО «Алтын Дала Строй 2»", "bin": BIN_SIBLING_2, "owner_bin": "100140000000"},
]

_WIN_AMOUNTS_M = [38, 52, 41, 27, 64, 33, 71, 45, 58, 36, 49, 640, 30, 62]  # million KZT
_WIN_DATES = ["2025-10-14", "2025-11-03", "2025-11-27", "2025-12-18", "2026-01-22", "2026-02-09",
              "2026-03-05", "2026-03-30", "2026-04-21", "2026-05-12", "2026-06-02", "2026-09-20",
              "2026-07-08", "2026-08-14"]
_LARGEST_CONTRACT = "C-2026-0417"
_LARGEST_DATE = "2026-09-20"

_SPELLINGS = [
    ("Russian", "ТОО «Алтын Дала Строй»"),
    ("Kazakh form", "ЖШС «Алтын Дала Строй»"),
    ("Latin", "Altyn Dala Stroy LLP"),
    ("Messy Latin", "ALTYN-DALA STROI TOO"),
    ("Different legal form", "АО «Алтын Дала Строй»"),
    ("Numbered sibling", "ТОО «Алтын Дала Строй 2»"),
    ("Same brand, other business", "ТОО «Алтын Дала Сервис»"),
]


def _days_between(earlier: str, later: str) -> int:
    return (date.fromisoformat(later) - date.fromisoformat(earlier)).days


def _hash(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:12]


def _raw_records() -> list[dict]:
    rows = [{"source": "registry", "id": "REG-0001", "name": TARGET.name, "bin": BIN_TARGET,
             "detail": "Active · 2 employees · owner ТОО «Дала Инвест Групп»"}]
    for i, (amount, d) in enumerate(zip(_WIN_AMOUNTS_M, _WIN_DATES), start=1):
        big = amount == 640
        rows.append({
            "source": "procurement", "id": _LARGEST_CONTRACT if big else f"T-{i:04d}",
            "name": "Altyn Dala Stroy LLP" if i % 2 else "ТОО Алтын Дала Строй",
            "bin": BIN_TARGET, "date": d, "amount_m": amount,
            "detail": f"Tender won · {amount} M KZT",
        })
    for i, amount in enumerate([44, 31, 56], start=1):
        rows.append({"source": "procurement", "id": f"T-9{i:03d}", "name": "ТОО «Алтын Дала Строй 2»",
                     "bin": BIN_SIBLING_2, "date": "2026-05-1" + str(i), "amount_m": amount,
                     "detail": f"Tender won · {amount} M KZT"})
    for i, d in enumerate(["2026-01-12", "2026-03-03", "2026-04-17", "2026-06-25"], start=1):
        rows.append({"source": "courts", "id": f"CASE-{i:03d}", "name": "Алтын Дала Строй ТОО",
                     "bin": None, "date": d, "detail": "Defendant · payment dispute"})
    rows.append({"source": "courts", "id": "CASE-005", "name": "Алтын Дала Сервис ТОО", "bin": None,
                 "date": "2026-05-08", "detail": "Defendant · payment dispute"})
    rows.append({"source": "cadastre", "id": "PARCEL-0042", "name": "Altyn Dala Stroy LLP", "bin": BIN_TARGET,
                 "detail": "2.4 ha · no encumbrances · 120 m from the site of " + _LARGEST_CONTRACT,
                 "adjacent_to": _LARGEST_CONTRACT, "distance_m": 120})
    return rows


def _link(rows: list[dict]) -> list[dict]:
    linked = []
    for row in rows:
        result = match_score(TARGET, Record(row["name"], row["bin"]))
        confirmed = "bin_exact" in result.reasons
        linked.append({
            **row,
            "decision": result.decision.value,
            "score": result.score,
            "reasons": list(result.reasons),
            "confidence": ("confirmed" if confirmed else "name_only") if result.decision is Decision.MATCH else None,
            "used_in_flags": result.decision is Decision.MATCH and confirmed,
        })
    return linked


def build_report() -> dict:
    records = _link(_raw_records())
    confirmed = [r for r in records if r["used_in_flags"]]
    wins = [r for r in confirmed if r["source"] == "procurement"]
    name_only_cases = [r for r in records if r["source"] == "courts" and r["decision"] == "match"]
    employees = _SNAPSHOT_PAYLOADS[-1]["employees"]
    total_m = sum(w["amount_m"] for w in wins)

    snapshots = [{**p, "content_hash": _hash(p)} for p in _SNAPSHOT_PAYLOADS]
    owner_changed = snapshots[0]["owner_bin"] != snapshots[1]["owner_bin"]
    days_before_contract = _days_between(snapshots[1]["fetched"], _LARGEST_DATE)

    sources = []
    for s in SOURCES:
        age = _days_between(s["fetched"], REPORT_DATE)
        sources.append({**s, "age_days": age, "stale": age > STALE_AFTER_DAYS})

    flags = []
    if len(wins) >= 10 and employees <= 5:
        flags.append({
            "id": "tender_headcount", "severity": "high", "status": "confirmed", "points": 30,
            "title": "Many tender wins, very few employees",
            "text": f"Won {len(wins)} state tenders worth {total_m:,} M KZT in the last 12 months, "
                    f"but the registry reports {employees} employees.",
            "evidence": [w["id"] for w in wins] + ["REG-0001"],
            "check_next": "Ask who performs the work: subcontractors, or a different group company.",
            "false_positive": "A new or asset-light firm can legitimately subcontract most work.",
        })
    parcel = next((r for r in confirmed if r["source"] == "cadastre"), None)
    if parcel and parcel.get("distance_m", 9999) <= 500:
        flags.append({
            "id": "land_adjacent", "severity": "medium", "status": "confirmed", "points": 20,
            "title": "Owns land next to a project it was awarded",
            "text": f"Holds a {parcel['detail'].split(' · ')[0]} parcel {parcel['distance_m']} m from the "
                    f"site of contract {parcel['adjacent_to']}.",
            "evidence": [parcel["id"], parcel["adjacent_to"]],
            "check_next": "Check when the parcel was acquired relative to the tender notice.",
            "false_positive": "Local contractors often hold land near where they work.",
        })
    if owner_changed and 0 <= days_before_contract <= 60:
        flags.append({
            "id": "ownership_change", "severity": "medium", "status": "confirmed", "points": 20,
            "title": "Owner changed shortly before its largest contract",
            "text": f"The registry owner changed on {snapshots[1]['fetched']}, {days_before_contract} days "
                    f"before the {_LARGEST_DATE} award of {_LARGEST_CONTRACT}. The portal now shows only the "
                    f"current owner; our archive holds both versions.",
            "evidence": ["snapshot v1", "snapshot v2", _LARGEST_CONTRACT],
            "check_next": "Find out why ownership moved and who benefits from the new structure.",
            "false_positive": "Group restructurings are common and often unrelated to contracts.",
        })
    if len(name_only_cases) >= 3:
        flags.append({
            "id": "litigation", "severity": "medium", "status": "unconfirmed", "points": 0,
            "points_if_confirmed": 15,
            "title": "Possible repeated litigation",
            "text": f"{len(name_only_cases)} court cases name a company spelled like this one, "
                    "but the records carry no BIN, so we cannot say they are the same company.",
            "evidence": [c["id"] for c in name_only_cases],
            "check_next": "Confirm the BIN from the case file. Until then this does not affect the score.",
            "false_positive": "A same-named company would produce the same match.",
        })
    stale = [s for s in sources if s["stale"]]
    if stale:
        flags.append({
            "id": "freshness", "severity": "info", "status": "confirmed", "points": 0,
            "title": "Some data is out of date",
            "text": ", ".join(f"{s['label']} last refreshed {s['age_days']} days ago" for s in stale) + ".",
            "evidence": [s["id"] for s in stale],
            "check_next": "Treat anything from these sources as possibly changed.",
            "false_positive": "",
        })

    total = sum(f["points"] for f in flags if f["status"] == "confirmed")
    pending = sum(f.get("points_if_confirmed", 0) for f in flags if f["status"] == "unconfirmed")
    band = "Elevated" if total >= 50 else "Moderate" if total >= 25 else "Low"

    spellings = []
    for label, text in _SPELLINGS:
        res = match_score(Record(TARGET.name), Record(text))
        spellings.append({"label": label, "text": text, "decision": res.decision.value,
                          "score": res.score, "reasons": list(res.reasons)})

    registry_owner_bin = snapshots[-1]["owner_bin"]
    affiliates = [c["name"] for c in _REGISTRY if c["owner_bin"] == registry_owner_bin and c["bin"] != BIN_TARGET]

    return {
        "report_date": REPORT_DATE,
        "entity": {"name": TARGET.name, "bin": BIN_TARGET, "owner": snapshots[-1]["owner"],
                   "employees": employees, "affiliates": affiliates},
        "sources": sources,
        "coverage": {"checked": len(SOURCES), "total": len(SOURCES) + 1,
                     "gap": "PEP and sanctions lists need a licensed dataset and are not connected."},
        "records": records,
        "snapshots": snapshots,
        "flags": flags,
        "score": {"total": total, "band": band, "pending_if_confirmed": pending,
                  "scale": 100, "note": "Demo weights, not calibrated."},
        "spellings": spellings,
        "totals": {"wins": len(wins), "wins_m_kzt": total_m,
                   "records_in": len(records), "linked": sum(1 for r in records if r["decision"] == "match"),
                   "review": sum(1 for r in records if r["decision"] == "review"),
                   "rejected": sum(1 for r in records if r["decision"] == "no_match")},
    }
