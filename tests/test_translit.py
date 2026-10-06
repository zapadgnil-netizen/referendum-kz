import pytest

from ashyqdala.translit import match_key


@pytest.mark.parametrize(
    "variants",
    [
        # Kazakh қ, Russian х and English 'kh' all land on one key
        ["Қазақстан", "Казахстан", "Kazakhstan", "Qazaqstan"],
        ["Алтын Дала", "Altyn Dala", "ALTYN DALA"],
        ["Жамбыл", "Jambyl", "Zhambyl"],
        ["Айбек", "Aibek", "Aybek"],
        ["Елена", "Yelena"],
        ["Қазақстанский", "Kazakhstansky", "Kazakhstanskiy"],
        ["Алекс", "Alex"],
    ],
)
def test_script_variants_share_a_key(variants):
    keys = {match_key(v) for v in variants}
    assert len(keys) == 1, keys


def test_kazakh_specific_letters():
    assert match_key("ӘҒҚҢӨҰҮҺІ") == match_key("agknouuki")


def test_latin_diacritics_from_the_newer_kazakh_latin_are_folded():
    assert match_key("Qazaqstan Ädilet") == match_key("Казахстан Адилет")


def test_punctuation_quotes_and_case_are_ignored():
    assert match_key("«Алтын-Дала»,  ") == match_key("altyn dala")


def test_distinct_names_keep_distinct_keys():
    assert match_key("Алтын Дала") != match_key("Алтын Жол")


def test_empty_and_none():
    assert match_key("") == ""
    assert match_key(None) == ""


def test_word_boundaries_are_ascii_only_so_the_browser_port_agrees():
    # An unmapped letter next to "ye": only an ASCII-aware \b sees a word start here.
    assert match_key("中ye") == "e"
