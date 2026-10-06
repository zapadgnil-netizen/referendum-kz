"""Split a registry company name into (legal form, core name) and derive a match key."""

from __future__ import annotations

import re
from dataclasses import dataclass

from .translit import match_key

# Canonical form codes: llp (ТОО/ЖШС), jsc (АО/АҚ), ie (ИП/ЖК).
# Latin look-alikes ("TOO", "AO", "IP") are listed because registries and invoices mix scripts.
_FORMS: dict[tuple[str, ...], str] = {
    ("товарищество", "с", "ограниченной", "ответственностью"): "llp",
    ("жауапкершілігі", "шектеулі", "серіктестік"): "llp",
    ("акционерное", "общество"): "jsc",
    ("акционерлік", "қоғам"): "jsc",
    ("индивидуальный", "предприниматель"): "ie",
    ("жеке", "кәсіпкер"): "ie",
    ("тоо",): "llp", ("too",): "llp", ("llp",): "llp", ("жшс",): "llp",
    ("ао",): "jsc", ("ao",): "jsc", ("jsc",): "jsc", ("ақ",): "jsc",
    ("ип",): "ie", ("ip",): "ie", ("ie",): "ie", ("жк",): "ie",
}
_BY_LENGTH = sorted(_FORMS, key=len, reverse=True)  # longest phrase first

_PUNCT = re.compile(r"[«»\"“”„‹›().,;:]")


@dataclass(frozen=True)
class LegalName:
    raw: str
    form: str | None
    core: str
    key: str


def parse_company_name(raw: str | None) -> LegalName:
    raw = raw or ""
    tokens = _PUNCT.sub(" ", raw).split()
    lowered = [t.casefold() for t in tokens]
    form = None
    # Only a leading or trailing marker counts: "ао" in the middle of a name is just a word.
    for phrase in _BY_LENGTH:
        n = len(phrase)
        if len(tokens) >= n and tuple(lowered[:n]) == phrase:
            form, tokens = _FORMS[phrase], tokens[n:]
            break
        if len(tokens) >= n and tuple(lowered[-n:]) == phrase:
            form, tokens = _FORMS[phrase], tokens[:-n]
            break
    core = " ".join(tokens)
    return LegalName(raw=raw, form=form, core=core, key=match_key(core))
