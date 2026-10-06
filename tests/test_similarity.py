import random
from difflib import SequenceMatcher

import pytest

from ashyqdala.similarity import ratio


@pytest.mark.parametrize(
    "a,b,expected",
    [
        ("abcd", "bcde", 0.75),
        ("abc", "abc", 1.0),
        ("abc", "xyz", 0.0),
        ("altin dala stroi", "altin dala servis", 2 * 14 / 33),
    ],
)
def test_known_values(a, b, expected):
    assert ratio(a, b) == pytest.approx(expected)


def test_empty_cases_follow_difflib():
    assert ratio("", "") == 1.0
    assert ratio("", "abc") == 0.0
    assert ratio("abc", "") == 0.0


def test_matches_difflib_on_random_strings():
    rng = random.Random(1234)
    alphabet = "abcdefg 0123"
    for _ in range(3000):
        a = "".join(rng.choice(alphabet) for _ in range(rng.randint(0, 40)))
        b = "".join(rng.choice(alphabet) for _ in range(rng.randint(0, 40)))
        expected = SequenceMatcher(None, a, b, autojunk=False).ratio()
        assert ratio(a, b) == pytest.approx(expected, abs=1e-12), (a, b)


def test_matches_difflib_on_long_strings_where_autojunk_would_apply():
    rng = random.Random(99)
    a = "".join(rng.choice("ab ") for _ in range(260))
    b = "".join(rng.choice("ab ") for _ in range(240))
    assert ratio(a, b) == pytest.approx(SequenceMatcher(None, a, b, autojunk=False).ratio(), abs=1e-12)
