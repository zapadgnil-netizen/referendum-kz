"""Decide whether two registry records describe the same legal entity.

Design bias: a false merge attributes one company's litigation or contracts to another, which is
worse than a missed link. Anything not clearly the same goes to REVIEW rather than MATCH.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum

from . import bin as kzbin
from .names import parse_company_name
from .similarity import ratio

MATCH_THRESHOLD = 0.92
REVIEW_THRESHOLD = 0.75
LEGAL_FORM_MISMATCH_FACTOR = 0.8
NUMERIC_MISMATCH_CAP = REVIEW_THRESHOLD + (MATCH_THRESHOLD - REVIEW_THRESHOLD) / 2  # always REVIEW, never MATCH


class Decision(Enum):
    MATCH = "match"
    REVIEW = "review"
    NO_MATCH = "no_match"


@dataclass(frozen=True)
class Record:
    name: str
    bin: str | None = None


@dataclass(frozen=True)
class MatchResult:
    score: float
    decision: Decision
    reasons: tuple[str, ...] = field(default_factory=tuple)


def _name_similarity(key_a: str, key_b: str) -> float:
    if not key_a or not key_b:
        return 0.0
    direct = ratio(key_a, key_b)
    sorted_words = ratio(" ".join(sorted(key_a.split())), " ".join(sorted(key_b.split())))
    return max(direct, sorted_words)


def _numbers(key: str) -> list[str]:
    return sorted(re.findall(r"\d+", key))


def _decide(score: float) -> Decision:
    if score >= MATCH_THRESHOLD:
        return Decision.MATCH
    if score >= REVIEW_THRESHOLD:
        return Decision.REVIEW
    return Decision.NO_MATCH


def score(a: Record, b: Record) -> MatchResult:
    reasons: list[str] = []

    bin_a, bin_b = kzbin.normalize(a.bin), kzbin.normalize(b.bin)
    usable_a = bin_a is not None and kzbin.is_valid(bin_a)
    usable_b = bin_b is not None and kzbin.is_valid(bin_b)
    if (a.bin and not usable_a) or (b.bin and not usable_b):
        reasons.append("bin_invalid_ignored")  # typo or bad source data: never let it decide

    if usable_a and usable_b:
        if bin_a == bin_b:
            return MatchResult(1.0, Decision.MATCH, (*reasons, "bin_exact"))
        return MatchResult(0.0, Decision.NO_MATCH, (*reasons, "bin_conflict"))

    name_a, name_b = parse_company_name(a.name), parse_company_name(b.name)
    similarity = _name_similarity(name_a.key, name_b.key)
    if similarity == 0.0:
        return MatchResult(0.0, Decision.NO_MATCH, (*reasons, "name_empty_or_disjoint"))

    result = similarity
    if name_a.form and name_b.form and name_a.form != name_b.form:
        result *= LEGAL_FORM_MISMATCH_FACTOR
        reasons.append("legal_form_mismatch")
    if _numbers(name_a.key) != _numbers(name_b.key):
        # "Нур Строй 1" vs "Нур Строй 2" are different companies however long the shared text is.
        result = min(result, NUMERIC_MISMATCH_CAP)
        reasons.append("numeric_token_mismatch")
    reasons.append(f"name_similarity={similarity:.2f}")
    return MatchResult(round(result, 4), _decide(result), tuple(reasons))
