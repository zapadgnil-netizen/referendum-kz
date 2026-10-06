"""A deterministic synthetic world for the Ashyq Dala MVP.

Every company, BIN, contract, court case and official here is invented. BINs carry month 13, which a
real BIN never has, so no synthetic number can belong to a real company. Each record keeps a hidden
`truth` (the BIN of the company it really belongs to) so the app can score its own matcher; the
matcher itself never reads it.

Run: python -m ashyqdala.synth web/data.json
"""

from __future__ import annotations

import json
import random
import sys
from datetime import date, timedelta

from . import bin as kzbin

START_DATE = "2026-10-06"  # the app's clock starts here
END_DATE = "2026-12-31"
SEED = 20261006
COURT_REFRESHES = ["2026-03-04", "2026-04-01", "2026-04-29", "2026-05-27", "2026-06-24",
                   "2026-07-29", "2026-08-26", "2026-11-12"]

BRANDS = [("Алтын", "Altyn"), ("Қызыл", "Kyzyl"), ("Жетісу", "Zhetisu"), ("Нұр", "Nur"), ("Сары Арка", "Sary Arka"),
          ("Ертіс", "Yertis"), ("Жайық", "Zhaiyk"), ("Хан Тенгри", "Khan Tengri"), ("Ақ Орда", "Aq Orda"),
          ("Шалқар", "Shalkar"), ("Дала", "Dala"), ("Бөген", "Bogen"), ("Тұран", "Turan"), ("Арай", "Arai"),
          ("Көкжиек", "Kokzhiek"), ("Алатау", "Alatau"), ("Мерей", "Merei"), ("Асыл", "Asyl"), ("Береке", "Bereke"),
          ("Сарыағаш", "Saryagash")]
SUFFIXES = [("Строй", "Stroy"), ("Транс", "Trans"), ("Агро", "Agro"), ("Энерго", "Energo"), ("Снаб", "Snab"),
            ("Сервис", "Servis"), ("Инвест", "Invest"), ("Лоджистик", "Logistik"), ("Тур", "Tur"),
            ("Трейд", "Trade"), ("Дорстрой", "Dorstroy"), ("Нефтесервис", "Neftservis"), ("Мясо", "Myaso")]
KZ_TO_RU = str.maketrans({
    "қ": "к", "ұ": "у", "ү": "у", "і": "и", "ә": "а", "ө": "о", "ғ": "г", "ң": "н", "һ": "х",
    "Қ": "К", "Ұ": "У", "Ү": "У", "І": "И", "Ә": "А", "Ө": "О", "Ғ": "Г", "Ң": "Н", "Һ": "Х",
})
CUSTOMERS = [f"District {n} administration (example)" for n in range(1, 7)] + ["Regional roads department (example)"]
MARKERS = {"llp": ("ТОО", "ЖШС", "LLP", "TOO"), "jsc": ("АО", "АҚ", "JSC", "AO")}


def _iso(d: date) -> str:
    return d.isoformat()


def _d(s: str) -> date:
    return date.fromisoformat(s)


class _World:
    def __init__(self, seed: int = SEED):
        self.rng = random.Random(seed)
        self.entities: list[dict] = []
        self.records: list[dict] = []
        self.used_bins: set[str] = set()

    # ---- identifiers ---------------------------------------------------------------------
    def new_bin(self, year: int) -> str:
        while True:
            prefix = f"{year % 100:02d}13" + "4" + "0" + "".join(self.rng.choice("0123456789") for _ in range(5))
            digit = kzbin.check_digit(prefix)
            candidate = prefix + str(digit) if digit is not None else None
            if candidate and candidate not in self.used_bins:
                self.used_bins.add(candidate)
                return candidate

    # ---- names ---------------------------------------------------------------------------
    def spelling(self, ent: dict, on: str) -> str:
        names = [n for n in ent["names"] if n[0] <= on]
        _, cyr, lat = names[-1]
        form = ent["form"]
        f_ru, f_kz, f_lat, f_lat2 = MARKERS[form]
        ru = cyr.translate(KZ_TO_RU)
        lat2 = lat.replace("Zh", "J").replace("zh", "j")
        options = [f"{f_ru} «{cyr}»", f"{f_ru} {ru}", f"{cyr} {f_ru}", f"{f_kz} «{cyr}»", f"{lat} {f_lat}",
                   f"{f_lat2} {lat}", f"{lat.upper()} {f_lat2}", f"{lat2} {f_lat}", f"{f_ru} «{cyr}»"]
        return self.rng.choice(options)

    def typo(self, name: str) -> str:
        letters = [i for i, c in enumerate(name) if c.isalpha()]
        if len(letters) < 8:
            return name
        i = self.rng.choice(letters[2:-2])
        return name[:i] + name[i + 1:] if self.rng.random() < 0.5 else name[:i] + name[i + 1] + name[i] + name[i + 2:]

    def pick_bin(self, ent: dict, mode: str) -> str | None:
        if mode == "auto":
            r = self.rng.random()
            mode = "valid" if r < 0.84 else "typo" if r < 0.9 else "none"
        if mode == "valid":
            return ent["bin"]
        if mode == "typo":
            b = ent["bin"]
            return b[:-1] + str((int(b[-1]) + 1) % 10)
        return None

    # ---- records -------------------------------------------------------------------------
    def first_seen(self, d: str, lag: int) -> str:
        return min(_iso(_d(d) + timedelta(days=lag)), START_DATE) if d <= START_DATE else _iso(_d(d) + timedelta(days=lag))

    def win(self, ent, d, amount_m, customer=None, bin_mode="auto", name=None, contract=None):
        self.records.append({
            "source": "procurement", "name": name or self.spelling(ent, d), "bin": self.pick_bin(ent, bin_mode),
            "date": d, "first_seen": self.first_seen(d, 2), "amount_m": amount_m,
            "customer": customer or self.rng.choice(CUSTOMERS), "contract": contract, "truth": ent["bin"],
        })

    def case(self, ent, d, role="defendant", kind="payment dispute", amount_m=None, bin_mode="none", name=None):
        seen = next((r for r in COURT_REFRESHES if r >= _iso(_d(d) + timedelta(days=5))), COURT_REFRESHES[-1])
        self.records.append({
            "source": "courts", "name": name or self.spelling(ent, d), "bin": self.pick_bin(ent, bin_mode),
            "date": d, "first_seen": seen, "role": role, "kind": kind,
            "amount_m": amount_m if amount_m is not None else self.rng.choice([3, 5, 8, 12, 20]),
            "court": "District court (example)", "truth": ent["bin"],
        })

    def parcel(self, ent, acquired, area_ha, near=None, distance=None, bin_mode="auto", encumbrance=None):
        self.records.append({
            "source": "cadastre", "name": self.spelling(ent, acquired), "bin": self.pick_bin(ent, bin_mode),
            "date": acquired, "first_seen": self.first_seen(acquired, 7), "area_ha": area_ha,
            "cadastral": f"99:999:999:{self.rng.randint(1, 9999):04d}", "near_contract": near,
            "distance_m": distance, "encumbrance": encumbrance, "truth": ent["bin"],
        })


def _snapshot(ent, d, **changes):
    base = dict(ent["snapshots"][-1]) if ent["snapshots"] else {}
    base.update({"date": d, **changes})
    ent["snapshots"].append(base)


def _owner(ent_by_key, key):
    if key == "ind":
        return {"type": "individual", "label": "Individual shareholder (not shown)"}
    return {"type": "company", "bin": ent_by_key[key]["bin"]}


def generate(seed: int = SEED) -> dict:
    w = _World(seed)
    rng = w.rng
    by_key: dict[str, dict] = {}

    # (key, cyrillic, latin, form, registered, employees, owner, district)
    plan = [
        ("H01", "Дала Инвест Групп", "Dala Invest Group", "llp", "2014-05-02", 12, "H03", 1),
        ("H02", "Қызыл Тау Холдинг", "Kyzyl Tau Holding", "llp", "2011-09-19", 9, "ind", 3),
        ("H03", "Мерей Капитал", "Merei Capital", "llp", "2009-02-11", 6, "ind", 1),
        ("E01", "Алтын Дала Строй", "Altyn Dala Stroy", "llp", "2019-03-14", 2, "H02", 2),
        ("E02", "Алтын Дала Строй 2", "Altyn Dala Stroy 2", "llp", "2020-06-01", 18, "ind", 4),
        ("E03", "Алтын Дала Сервис", "Altyn Dala Servis", "llp", "2019-04-02", 38, "H01", 2),
        ("E04", "Сары Арка Транс", "Sary Arka Trans", "llp", "2016-11-23", 65, "H01", 5),
        ("E05", "Қызыл Тау", "Kyzyl Tau", "llp", "2015-03-30", 24, "H02", 3),
        ("E06", "Қызыл Тау", "Kyzyl Tau", "jsc", "2012-08-08", 140, "ind", 6),
        ("E07", "Нұр Строй", "Nur Stroy", "llp", "2018-01-17", 31, "ind", 1),
        ("E08", "Нұр Строй", "Nur Stroy", "llp", "2021-10-05", 22, "ind", 4),
        ("E09", "Жетісу Энерго", "Zhetisu Energo", "jsc", "2005-06-21", 410, "ind", 5),
        ("E10", "Ертіс Агро", "Yertis Agro", "llp", "2017-04-26", 47, "ind", 2),
        ("E11", "Жайық Снаб", "Zhaiyk Snab", "llp", "2026-04-20", 4, "ind", 6),
        ("E12", "Хан Тенгри Тур", "Khan Tengri Tur", "llp", "2013-12-03", 15, "ind", 3),
        ("E13", "Ақ Орда Лоджистик", "Aq Orda Logistik", "llp", "2018-07-09", 52, "H01", 5),
        ("E14", "Бөген Дорстрой", "Bogen Dorstroy", "llp", "2017-02-28", 71, "ind", 6),
    ]
    taken = {(c, f) for _, c, _, f, *_ in plan}
    extra, i = [], 15
    while len(extra) < 10:
        b, s = rng.choice(BRANDS), rng.choice(SUFFIXES)
        cyr, lat = f"{b[0]} {s[0]}", f"{b[1]} {s[1]}"
        if (cyr, "llp") in taken or any(cyr == p[1] for p in plan):
            continue
        taken.add((cyr, "llp"))
        year = rng.randint(2008, 2024)
        extra.append((f"E{i}", cyr, lat, rng.choice(["llp", "llp", "llp", "jsc"]),
                      f"{year}-{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}", rng.randint(5, 220),
                      rng.choice(["H01", "H02", "H03", "ind", "ind", "ind"]), rng.randint(1, 6)))
        i += 1
    plan += extra

    for key, cyr, lat, form, registered, employees, owner, district in plan:
        ent = {"key": key, "bin": w.new_bin(int(registered[:4])), "registered": registered, "form": form,
               "names": [("1900-01-01", cyr, lat)], "snapshots": [], "district": district, "_owner": owner,
               "_employees": employees}
        by_key[key] = ent
        w.entities.append(ent)
    by_key["E14"]["names"].append(("2026-05-12", "Тұран Дорстрой", "Turan Dorstroy"))

    def canonical(ent, d):
        _, cyr, _ = [n for n in ent["names"] if n[0] <= d][-1]
        return f"{MARKERS[ent['form']][0]} «{cyr}»"

    for ent in w.entities:
        first = max("2026-03-01", _iso(_d(ent["registered"]) + timedelta(days=7)))
        board = [{"role": "Director", "official_id": None}]
        if rng.random() < 0.5:
            board.append({"role": "Board member", "official_id": None})
        owner_key = "H02" if ent["key"] == "E01" else ent["_owner"]  # E01 changes hands later
        street = rng.choice(["Abay", "Dostyk", "Satpaev", "Gagarin"])
        ent["snapshots"].append({
            "date": first, "name": canonical(ent, first), "status": "active", "employees": ent["_employees"],
            "owner": _owner(by_key, owner_key), "region": f"District {ent['district']}",
            "address": f"{street} street {rng.randint(1, 120)}, District {ent['district']} (example)", "board": board,
        })

    e = by_key
    e["E10"]["snapshots"][0]["board"] = [{"role": "Director", "official_id": None},
                                               {"role": "Board member", "official_id": "P01"}]
    # registry changes that make the history tab and the monitoring simulation interesting
    _snapshot(e["E01"], "2026-09-02", owner=_owner(e, "H01"))
    _snapshot(e["E12"], "2026-08-10", status="liquidating")
    _snapshot(e["E14"], "2026-05-12", name=canonical(e["E14"], "2026-05-12"))  # renamed, same BIN
    _snapshot(e["E09"], "2026-06-14", employees=420)
    _snapshot(e["E03"], "2026-06-14", employees=40)
    _snapshot(e["E04"], "2026-10-21", owner=_owner(e, "ind"))  # future
    _snapshot(e["E02"], "2026-11-18", status="reorganizing")  # future

    # ---- planted scenario A: many wins, two employees, land next to the site, owner change before the big award
    a_dates = ["2025-10-14", "2025-11-03", "2025-11-27", "2025-12-18", "2026-01-22", "2026-02-09", "2026-03-05",
               "2026-03-30", "2026-04-21", "2026-05-12", "2026-06-02", "2026-07-08", "2026-08-14", "2026-09-20"]
    a_amounts = [38, 52, 41, 27, 64, 33, 71, 45, 58, 36, 49, 30, 62, 640]
    modes = ["valid"] * 3 + ["none"] + ["valid"] * 4 + ["typo"] + ["valid"] * 4 + ["valid"]
    for d, amt, mode in zip(a_dates, a_amounts, modes):
        w.win(e["E01"], d, amt, bin_mode=mode, contract="C-2026-0417" if amt == 640 else None)
    w.parcel(e["E01"], "2026-04-02", 2.4, near="C-2026-0417", distance=120, bin_mode="valid")
    for d in ["2026-01-12", "2026-03-03", "2026-04-17", "2026-06-25"]:
        w.case(e["E01"], d)  # no BIN: name only
    w.win(e["E01"], "2026-10-19", 45, bin_mode="valid")  # future
    w.case(e["E01"], "2026-10-27")  # future

    # ---- B: confirmed repeated litigation
    for d, k in [("2025-11-12", "payment dispute"), ("2026-01-30", "contract"), ("2026-04-08", "payment dispute"),
                 ("2026-06-19", "labour"), ("2026-08-05", "payment dispute")]:
        w.case(e["E04"], d, kind=k, bin_mode="valid")
    w.case(e["E04"], "2026-11-03", bin_mode="valid")  # future
    for d, amt in [("2025-12-02", 55), ("2026-03-17", 80), ("2026-06-11", 40)]:
        w.win(e["E04"], d, amt)

    # ---- C: public official on the board, contracts from that official's district
    for d, amt in [("2026-01-15", 120), ("2026-04-09", 95), ("2026-07-02", 140)]:
        w.win(e["E10"], d, amt, customer="District 2 administration (example)", bin_mode="valid")
    w.win(e["E10"], "2026-12-02", 70, customer="District 2 administration (example)", bin_mode="valid")  # future

    # ---- D: brand-new company, one very large award
    w.win(e["E11"], "2026-07-20", 900, customer="Regional roads department (example)", bin_mode="valid")

    # ---- F: liquidating company still winning
    w.win(e["E12"], "2026-09-04", 35, bin_mode="valid")
    w.win(e["E12"], "2026-09-22", 28, bin_mode="valid")
    w.win(e["E12"], "2026-10-12", 33, bin_mode="valid")  # future
    for d in ["2025-11-20", "2026-02-02"]:
        w.win(e["E12"], d, 22)

    # ---- E: large clean company
    for d, amt in [("2025-12-10", 180), ("2026-04-22", 240), ("2026-08-03", 210)]:
        w.win(e["E09"], d, amt, bin_mode="valid")
    w.win(e["E09"], "2026-11-09", 260, bin_mode="valid")  # future
    w.parcel(e["E09"], "2012-05-15", 14.0, bin_mode="valid")
    w.parcel(e["E09"], "2018-09-01", 6.5, bin_mode="valid", encumbrance="mortgage")

    # ---- traps ---------------------------------------------------------------------------
    for d, amt, mode in [("2026-02-12", 44, "valid"), ("2026-03-21", 31, "valid"), ("2026-05-18", 56, "valid"),
                         ("2026-06-30", 29, "none"), ("2026-08-09", 37, "none")]:
        w.win(e["E02"], d, amt, bin_mode=mode)
    for d in ["2026-02-02", "2026-05-14", "2026-07-21"]:
        w.win(e["E07"], d, rng.choice([20, 35, 60]), bin_mode="valid")
        w.win(e["E08"], d, rng.choice([18, 33, 52]), bin_mode="valid")
    w.win(e["E07"], "2026-08-20", 27, bin_mode="none", name="ТОО «Нұр Строй»")
    w.win(e["E08"], "2026-09-10", 41, bin_mode="none", name="Nur Stroy LLP")
    for d in ["2026-01-09", "2026-05-06"]:
        w.win(e["E05"], d, 26, bin_mode="valid")
        w.win(e["E06"], d, 85, bin_mode="valid")
    w.win(e["E05"], "2026-09-01", 24, bin_mode="none", name="Қызыл Тау")
    for d, amt in [("2026-01-27", 33), ("2026-03-12", 47), ("2026-06-05", 58), ("2026-08-26", 39)]:
        w.win(e["E13"], d, amt, bin_mode="valid")
    for d in ["2026-04-14", "2026-07-30", "2026-09-15"]:
        w.win(e["E13"], d, 36, bin_mode="none", name="Aq Orda Logistik LLP")
    for d in ["2025-11-05", "2026-01-21", "2026-04-02"]:
        w.win(e["E14"], d, 61, bin_mode="valid", name="ТОО «Бөген Дорстрой»")
    for d in ["2026-06-02", "2026-07-14", "2026-08-18", "2026-09-27"]:
        w.win(e["E14"], d, 66, bin_mode="valid")
    for d in ["2026-02-03", "2026-03-10", "2026-04-28"]:
        w.case(e["E14"], d, name="ТОО «Бөген Дорстрой»")  # filed under the old name, no BIN

    # ---- background companies --------------------------------------------------------------
    for key in [f"E{n}" for n in range(15, 25)]:
        ent = by_key[key]
        for _ in range(rng.randint(0, 7)):
            d = _iso(_d("2024-10-10") + timedelta(days=rng.randint(0, 720)))
            w.win(ent, d, rng.choice([12, 18, 25, 40, 55, 90]))
        for _ in range(rng.randint(0, 2)):
            w.case(ent, _iso(_d("2025-01-10") + timedelta(days=rng.randint(0, 560))), bin_mode=rng.choice(["none", "valid"]))
        for _ in range(rng.randint(0, 2)):
            w.parcel(ent, _iso(_d("2010-01-10") + timedelta(days=rng.randint(0, 5000))), round(rng.uniform(0.3, 9), 1))
    w.win(by_key["E15"], "2026-10-30", 38, bin_mode="valid")  # future

    # ---- finish: stable ids, tidy entity records ------------------------------------------
    for source, prefix in [("procurement", "T"), ("courts", "CASE"), ("cadastre", "PARCEL")]:
        rows = sorted((r for r in w.records if r["source"] == source), key=lambda r: (r["date"], r["name"], r["truth"]))
        for n, r in enumerate(rows, 1):
            r["id"] = f"{prefix}-{n:04d}"
            if source == "procurement" and not r.get("contract"):
                r["contract"] = f"C-{r['date'][:4]}-{n:04d}"
    w.records.sort(key=lambda r: (r["source"], r["id"]))

    registry = [{"bin": ent["bin"], "registered": ent["registered"], "snapshots": ent["snapshots"]} for ent in w.entities]
    for entry in registry:
        entry["snapshots"].sort(key=lambda s: s["date"])

    officials = [
        {"id": "P01", "label": "Public official P01 (synthetic)", "role": "Deputy head, District 2 administration", "district": 2},
        {"id": "P02", "label": "Public official P02 (synthetic)", "role": "Head of department, District 5 administration", "district": 5},
        {"id": "P03", "label": "Public official P03 (synthetic)", "role": "Regional roads department, deputy director", "district": 0},
    ]
    sources = [
        {"id": "registry", "label": "Company registry", "refresh": {"type": "daily"}},
        {"id": "procurement", "label": "State procurement", "refresh": {"type": "daily"}},
        {"id": "courts", "label": "Court records", "refresh": {"type": "dates", "dates": COURT_REFRESHES}},
        {"id": "cadastre", "label": "Land cadastre", "refresh": {"type": "weekly", "anchor": "2026-10-04"}},
    ]
    return {
        "meta": {"synthetic": True, "start": START_DATE, "end": END_DATE, "seed": seed,
                 "note": "All companies, numbers, cases and officials are invented. BINs use month 13, which no real BIN has."},
        "sources": sources, "officials": officials, "registry": registry, "records": w.records,
    }


def main(argv: list[str]) -> int:
    text = json.dumps(generate(), ensure_ascii=False, separators=(",", ":"))
    if len(argv) > 1:
        open(argv[1], "w", encoding="utf-8").write(text)
        print(f"wrote {argv[1]} ({len(text):,} bytes)")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
