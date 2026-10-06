import pytest

from ashyqdala.bin import BinKind, check_digit, classify, is_valid, normalize

VALID_BIN = "100140526019"
VALID_BIN_FALLBACK_WEIGHTS = "100240696061"  # first-pass remainder is 10; second weights give the digit
VALID_IIN = "900315378770"
NO_VALID_CHECK_DIGIT_PREFIX = "10034022415"  # both weight passes give 10


def test_normalize_strips_spaces_and_dashes():
    assert normalize("1001 4052-6019") == "100140526019"


def test_normalize_rejects_non_digits_and_wrong_length():
    assert normalize("10014052601") is None
    assert normalize("10014052601A") is None
    assert normalize("") is None
    assert normalize(None) is None


def test_check_digit_first_pass():
    assert check_digit("10014052601") == 9


def test_check_digit_falls_back_to_second_weights():
    assert check_digit("10024069606") == 1


def test_check_digit_none_when_both_passes_give_ten():
    assert check_digit(NO_VALID_CHECK_DIGIT_PREFIX) is None


@pytest.mark.parametrize("value", [VALID_BIN, VALID_BIN_FALLBACK_WEIGHTS, VALID_IIN])
def test_valid_numbers(value):
    assert is_valid(value)


def test_wrong_check_digit_is_invalid():
    assert not is_valid("100140526018")


def test_malformed_is_invalid():
    assert not is_valid("abc")


def test_classify_legal_entity_vs_individual():
    assert classify(VALID_BIN) is BinKind.BIN
    assert classify(VALID_IIN) is BinKind.IIN


def test_classify_invalid_is_none():
    assert classify("100140526018") is None


def test_non_ascii_digits_are_not_digits():
    # Arabic-Indic digits satisfy Python's \d and int(); a BIN must be ASCII 0-9 only.
    assert normalize("١٠٠١٤٠٥٢٦٠١٩") is None
    assert not is_valid("١٠٠١٤٠٥٢٦٠١٩")
    assert check_digit("١٠٠١٤٠٥٢٦٠١") is None
