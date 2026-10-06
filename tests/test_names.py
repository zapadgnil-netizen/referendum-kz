import pytest

from ashyqdala.names import parse_company_name


@pytest.mark.parametrize(
    "raw,form",
    [
        ("ТОО «Алтын Дала»", "llp"),
        ("TOO Altyn Dala", "llp"),  # Latin look-alike letters are common in the wild
        ("Altyn Dala LLP", "llp"),
        ("«Алтын Дала» ЖШС", "llp"),
        ("АО «Алтын Дала»", "jsc"),
        ("Altyn Dala JSC", "jsc"),
        ("Алтын Дала АҚ", "jsc"),
        ("ИП Алтынбеков", "ie"),
        ("Товарищество с ограниченной ответственностью «Алтын Дала»", "llp"),
        ("Алтын Дала", None),
    ],
)
def test_legal_form_detected(raw, form):
    assert parse_company_name(raw).form == form


def test_legal_form_is_stripped_from_the_core():
    assert parse_company_name("ТОО «Алтын Дала»").core == "Алтын Дала"


def test_same_company_in_three_spellings_has_one_key():
    keys = {
        parse_company_name(n).key
        for n in ["ТОО «Алтын Дала»", "Altyn Dala LLP", "ЖШС Алтын Дала"]
    }
    assert len(keys) == 1


def test_form_token_in_the_middle_of_a_name_is_not_stripped():
    # "ао" inside a name must not be mistaken for a joint-stock marker
    parsed = parse_company_name("Дала ао Центр")
    assert parsed.form is None
    assert "ао" in parsed.core.lower()


def test_empty_name():
    parsed = parse_company_name("")
    assert parsed.form is None and parsed.key == ""
