"""BIN (legal entities) and IIN (individuals): 12 digits, last one a check digit.

The check-digit algorithm is the published two-pass weighting scheme. Verify it against an
official sample before relying on it for anything beyond de-duplication.
"""

from __future__ import annotations

import re
from enum import Enum

_FIRST_WEIGHTS = tuple(range(1, 12))
_SECOND_WEIGHTS = (3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2)


class BinKind(Enum):
    BIN = "bin"  # legal entity
    IIN = "iin"  # individual


def normalize(value: str | None) -> str | None:
    """Return the 12 digits, or None if the input is not exactly 12 digits once spaces/dashes are removed."""
    if not value:
        return None
    digits = re.sub(r"[\s\-]", "", value)
    return digits if re.fullmatch(r"\d{12}", digits) else None


def check_digit(first_eleven: str) -> int | None:
    """Check digit for an 11-digit prefix; None when no valid digit exists for that prefix."""
    if not re.fullmatch(r"\d{11}", first_eleven or ""):
        return None
    digits = [int(c) for c in first_eleven]
    remainder = sum(d * w for d, w in zip(digits, _FIRST_WEIGHTS)) % 11
    if remainder == 10:
        remainder = sum(d * w for d, w in zip(digits, _SECOND_WEIGHTS)) % 11
    return None if remainder == 10 else remainder


def is_valid(value: str | None) -> bool:
    digits = normalize(value)
    if digits is None:
        return False
    expected = check_digit(digits[:11])
    return expected is not None and expected == int(digits[11])


def classify(value: str | None) -> BinKind | None:
    """BIN vs IIN from the fifth digit (an IIN's is the tens digit of a birth day, 0-3; a BIN's is 4-6).

    Heuristic: confirm against the official spec. None for invalid numbers.
    """
    if not is_valid(value):
        return None
    return BinKind.BIN if normalize(value)[4] in "456" else BinKind.IIN
