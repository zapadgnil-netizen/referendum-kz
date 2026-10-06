"""Matching keys across Kazakh/Russian Cyrillic and the Latin spellings seen in registries.

`match_key` is lossy on purpose: it is for deciding whether two spellings *might* be the same
name, never for display. Sounds that different scripts render inconsistently are collapsed:

- қ / к / х / kh / h / q / k  -> k   (Қазақстан, Казахстан, Kazakhstan all agree)
- ж / zh / j                  -> zh
- ү ұ у / ө о                 -> u / o
- y / i                       -> i
"""

from __future__ import annotations

import re
import unicodedata

_CYRILLIC = {
    "а": "a", "ә": "a", "б": "b", "в": "v", "г": "g", "ғ": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "і": "i", "й": "i", "к": "k", "қ": "k", "л": "l", "м": "m",
    "н": "n", "ң": "n", "о": "o", "ө": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ұ": "u", "ү": "u", "ф": "f", "х": "k", "һ": "k", "ц": "ts", "ч": "ch", "ш": "sh",
    "щ": "sh", "ъ": "", "ы": "i", "ь": "", "э": "e", "ю": "iu", "я": "ia",
}

# Latin letters from the newer Kazakh Latin alphabets that NFKD folding alone would get wrong.
_LATIN_PRE = {"ş": "sh", "ç": "ch", "ı": "i", "ğ": "g", "ñ": "n", "ʼ": "", "’": "", "'": ""}

# Applied in order on the already-Latin string.
_LATIN_COLLAPSE = [
    (r"\bye", "e"),  # Yelena -> Elena (Cyrillic Е is always plain "e")
    (r"kh", "k"),
    (r"(?<![szc])h", "k"),  # lone h (Kazakh һ, English Hamit); keep the sh/zh/ch digraphs intact
    (r"q", "k"),
    (r"x", "ks"),
    (r"j", "zh"),
    (r"w", "v"),
    (r"y", "i"),
    (r"c(?=[eiy])", "ts"),
]


def match_key(text: str | None) -> str:
    if not text:
        return ""
    s = unicodedata.normalize("NFKC", text).casefold()
    s = "".join(_LATIN_PRE.get(c, c) for c in s)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = "".join(_CYRILLIC.get(c, c) for c in s)
    for pattern, repl in _LATIN_COLLAPSE:
        s = re.sub(pattern, repl, s)
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    s = re.sub(r"(.)\1+", r"\1", s)  # Kazakhstanskii / Kazakhstanski, Aleks / Alekss
    return re.sub(r"\s+", " ", s)
