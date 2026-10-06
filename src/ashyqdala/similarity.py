"""Ratcliff/Obershelp string similarity, written out so the browser port can match it exactly.

Equals ``difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()``: find the longest common
substring (earliest in ``a``, then earliest in ``b``), recurse on both sides, ratio = 2*M / (len(a)+len(b)).
"""

from __future__ import annotations


def _longest(a: str, alo: int, ahi: int, b: str, blo: int, bhi: int) -> tuple[int, int, int]:
    best_i, best_j, best_k = alo, blo, 0
    previous: dict[int, int] = {}
    for i in range(alo, ahi):
        current: dict[int, int] = {}
        for j in range(blo, bhi):
            if a[i] == b[j]:
                k = previous.get(j - 1, 0) + 1
                current[j] = k
                if k > best_k:
                    best_i, best_j, best_k = i - k + 1, j - k + 1, k
        previous = current
    return best_i, best_j, best_k


def _matched(a: str, alo: int, ahi: int, b: str, blo: int, bhi: int) -> int:
    if alo >= ahi or blo >= bhi:
        return 0
    i, j, k = _longest(a, alo, ahi, b, blo, bhi)
    if k == 0:
        return 0
    return k + _matched(a, alo, i, b, blo, j) + _matched(a, i + k, ahi, b, j + k, bhi)


def ratio(a: str, b: str) -> float:
    total = len(a) + len(b)
    if total == 0:
        return 1.0
    return 2.0 * _matched(a, 0, len(a), b, 0, len(b)) / total
