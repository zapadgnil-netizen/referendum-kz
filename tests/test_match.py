from ashyqdala.match import Decision, Record, score

BIN_A = "100140526019"
BIN_B = "100140815904"


def test_same_valid_bin_is_a_certain_match_even_if_names_differ():
    r = score(Record("ТОО Алтын Дала", BIN_A), Record("Totally Renamed Co", BIN_A))
    assert r.decision is Decision.MATCH and r.score == 1.0
    assert "bin_exact" in r.reasons


def test_different_valid_bins_are_a_hard_no_even_if_names_are_identical():
    r = score(Record("ТОО Алтын Дала", BIN_A), Record("ТОО Алтын Дала", BIN_B))
    assert r.decision is Decision.NO_MATCH and r.score == 0.0
    assert "bin_conflict" in r.reasons


def test_invalid_bin_is_ignored_and_flagged_not_trusted():
    r = score(Record("ТОО Алтын Дала", "100140526018"), Record("Altyn Dala LLP", BIN_A))
    assert "bin_invalid_ignored" in r.reasons
    assert r.decision is Decision.MATCH  # falls back to the name evidence


def test_transliteration_variants_match_by_name_alone():
    r = score(Record("ТОО «Алтын Дала»"), Record("Altyn Dala LLP"))
    assert r.decision is Decision.MATCH


def test_word_order_does_not_matter():
    r = score(Record("Дала Алтын ТОО"), Record("ТОО Алтын Дала"))
    assert r.decision is Decision.MATCH


def test_legal_form_mismatch_lowers_the_score():
    same = score(Record("ТОО Алтын Дала"), Record("TOO Altyn Dala"))
    diff = score(Record("ТОО Алтын Дала"), Record("АО Алтын Дала"))
    assert diff.score < same.score
    assert "legal_form_mismatch" in diff.reasons


def test_similar_but_not_identical_goes_to_review():
    r = score(Record("ТОО Алтын Дала Строй"), Record("ТОО Алтын Дала Сервис"))
    assert r.decision is Decision.REVIEW


def test_unrelated_names_do_not_match():
    r = score(Record("ТОО Алтын Дала"), Record("АО Қазақ Темір Жолы"))
    assert r.decision is Decision.NO_MATCH


def test_empty_names_never_match():
    assert score(Record(""), Record("")).decision is Decision.NO_MATCH


def test_differing_numbers_can_never_auto_match_even_in_a_long_shared_name():
    # Long shared text pushes raw similarity past the match threshold; the digit is the only difference.
    a = Record("ТОО «Алтын Дала Агро Холдинг Инвест Групп Строй 1»")
    b = Record("ТОО «Алтын Дала Агро Холдинг Инвест Групп Строй 2»")
    r = score(a, b)
    assert r.decision is Decision.REVIEW
    assert "numeric_token_mismatch" in r.reasons


def test_same_numbers_still_match():
    r = score(Record("ТОО «Нур Строй 2»"), Record("Nur Stroy 2 LLP"))
    assert r.decision is Decision.MATCH
