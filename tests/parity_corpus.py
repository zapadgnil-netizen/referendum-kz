"""Build a corpus of inputs plus the reference (Python) outputs, for comparison with web/engine.js."""

from __future__ import annotations

import json
import random
from pathlib import Path

from ashyqdala import bin as kzbin
from ashyqdala.match import Record, score
from ashyqdala.names import parse_company_name
from ashyqdala.similarity import ratio
from ashyqdala.translit import match_key

GOLD = Path(__file__).parent.parent / "data" / "gold" / "pairs.jsonl"

WORDS = [
    "Алтын", "Altyn", "Дала", "Dala", "Қызыл", "Kyzyl", "Кызыл", "Тау", "Tau", "Жетісу", "Zhetisu", "Jetisu",
    "Нұр", "Nur", "Нур", "Сары", "Sary", "Арка", "Arka", "Ертіс", "Yertis", "Ertis", "Жайық", "Zhaiyk",
    "Хан", "Khan", "Тенгри", "Tengri", "Ақ", "Aq", "Ak", "Орда", "Orda", "Строй", "Stroy", "Stroi", "Транс",
    "Trans", "Агро", "Agro", "Энерго", "Energo", "Снаб", "Snab", "Сервис", "Servis", "Инвест", "Invest",
    "Лоджистик", "Logistik", "Тур", "Tur", "Холдинг", "Holding", "Трейд", "Trade", "Қазақстан", "Kazakhstan",
    "Шымкент", "Shymkent", "Чу", "Chu", "Щит", "Эхо", "Юг", "Ya", "Ye", "Yelena", "Алекс", "Alex", "Wexler",
    "Hamit", "Ädilet", "Şaşkın", "Çay", "Ğalym", "Ñuñez", "Ibrahim", "Cent", "Center", "1", "2", "12", "Бұрғы",
    "Өнім", "Ұлы", "Үй", "Һәм", "Іле", "Ile",
]
FORMS = ["ТОО", "TOO", "LLP", "ЖШС", "АО", "AO", "JSC", "АҚ", "ИП", "IP", "IE", "ЖК", "",
         "Товарищество с ограниченной ответственностью", "Акционерное общество", "Жеке кәсіпкер"]
QUOTES = [("«", "»"), ('"', '"'), ("", ""), ("(", ")"), ("“", "”")]


def _name(rng: random.Random) -> str:
    core = " ".join(rng.choice(WORDS) for _ in range(rng.randint(1, 4)))
    if rng.random() < 0.2:
        core = core.upper()
    elif rng.random() < 0.1:
        core = core.replace(" ", "-")
    left, right = rng.choice(QUOTES)
    form = rng.choice(FORMS)
    wrapped = f"{left}{core}{right}"
    where = rng.random()
    if not form:
        return wrapped
    return f"{form} {wrapped}" if where < 0.6 else f"{wrapped} {form}"


def _bins(rng: random.Random) -> list[str]:
    out = []
    for _ in range(300):
        prefix = "".join(rng.choice("0123456789") for _ in range(11))
        digit = kzbin.check_digit(prefix)
        out.append(prefix + str(digit if digit is not None else 0))
    out += [v[:-1] + str((int(v[-1]) + 1) % 10) for v in out[:100]]  # wrong check digit
    out += ["", None, "abc", "1001 4052-6019", "١٠٠١٤٠٥٢٦٠١٩", "10014052601", "1001405260199", "100140526019 "]
    out += [f"1001{rng.choice('456')}0" + "".join(rng.choice("0123456789") for _ in range(6)) for _ in range(50)]
    out += [f"9003{rng.choice('0123')}1" + "".join(rng.choice("0123456789") for _ in range(6)) for _ in range(50)]
    return out


def build(seed: int = 20261006) -> dict:
    rng = random.Random(seed)
    names = [_name(rng) for _ in range(1500)]
    names += ["中ye", "Ye", "Yelena", "ТОО", "", "  ", "ТОО «»", "Дала ао Центр", "ао", "Hamit Aq", "ß street", "İstanbul"]
    pairs = [json.loads(line) for line in GOLD.read_text(encoding="utf-8").splitlines() if line.strip()]
    pool_bins = [b for b in _bins(rng) if b]
    records = [Record(p["a"]["name"], p["a"].get("bin")) for p in pairs] + [Record(p["b"]["name"], p["b"].get("bin")) for p in pairs]

    score_cases = []
    for p in pairs:
        score_cases.append((Record(p["a"]["name"], p["a"].get("bin")), Record(p["b"]["name"], p["b"].get("bin"))))
    for _ in range(2500):
        a, b = rng.choice(names), rng.choice(names)
        if rng.random() < 0.3:
            b = a if rng.random() < 0.5 else a.replace("Алтын", "Altyn")
        ba = rng.choice(pool_bins) if rng.random() < 0.35 else None
        bb = (ba if rng.random() < 0.5 else rng.choice(pool_bins)) if rng.random() < 0.35 else None
        score_cases.append((Record(a, ba), Record(b, bb)))

    for _ in range(400):  # numbered siblings: a digit is the only difference, in short and long names
        base = " ".join(rng.choice(WORDS[:-20]) for _ in range(rng.randint(1, 7)))
        n1, n2 = rng.choice(["1", "2", "3", "12"]), rng.choice(["1", "2", "4", "21"])
        form = rng.choice(["ТОО", "LLP", "АО"])
        score_cases.append((Record(f"{form} «{base} {n1}»"), Record(f"{rng.choice(['ТОО', 'TOO', 'LLP'])} {base} {n2}")))

    ratio_pairs = []
    for _ in range(2500):
        a = "".join(rng.choice("abcdefg 0123") for _ in range(rng.randint(0, 45)))
        b = "".join(rng.choice("abcdefg 0123") for _ in range(rng.randint(0, 45)))
        ratio_pairs.append((a, b))
    for _ in range(300):  # exact tie cases at 2 and 4 digits: j/8 and j/32 ratios
        n = rng.choice([4, 8, 16, 32])
        a = "".join(rng.choice("ab") for _ in range(n))
        b = "".join(rng.choice("ab") for _ in range(n))
        ratio_pairs.append((a, b))

    bins = _bins(rng)
    prefixes = ["".join(rng.choice("0123456789") for _ in range(11)) for _ in range(400)] + ["10034022415", "1002406960", "x"]

    def res(r):
        return {"score": r.score, "decision": r.decision.value, "reasons": list(r.reasons)}

    return {
        "match_key": [[n, match_key(n)] for n in names],
        "parse": [[n, {"form": parse_company_name(n).form, "core": parse_company_name(n).core, "key": parse_company_name(n).key}] for n in names],
        "bins": [[b, {"normalize": kzbin.normalize(b), "valid": kzbin.is_valid(b),
                      "kind": (kzbin.classify(b).value if kzbin.classify(b) else None)}] for b in bins],
        "check_digit": [[p, kzbin.check_digit(p)] for p in prefixes],
        "ratio": [[a, b, ratio(a, b)] for a, b in ratio_pairs],
        "score": [[{"name": a.name, "bin": a.bin}, {"name": b.name, "bin": b.bin}, res(score(a, b))] for a, b in score_cases],
    }
