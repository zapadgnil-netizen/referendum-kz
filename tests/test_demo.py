import json

from ashyqdala.demo import REPORT_DATE, build_report


def _report():
    return build_report()


def test_report_is_json_serialisable():
    json.dumps(_report(), ensure_ascii=False)


def test_a_sibling_company_with_a_different_bin_is_never_counted():
    r = _report()
    wins = [x for x in r["records"] if x["source"] == "procurement" and x["decision"] == "match"]
    assert len(wins) == 14
    rejected = [x for x in r["records"] if x["source"] == "procurement" and x["decision"] == "no_match"]
    assert rejected and all("bin_conflict" in x["reasons"] for x in rejected)


def test_spelling_variants_with_the_same_bin_are_all_linked_with_high_confidence():
    r = _report()
    wins = [x for x in r["records"] if x["source"] == "procurement" and x["decision"] == "match"]
    assert len({x["name"] for x in wins}) >= 2
    assert all(x["confidence"] == "confirmed" for x in wins)


def test_name_only_records_are_linked_but_marked_unconfirmed():
    r = _report()
    cases = [x for x in r["records"] if x["source"] == "courts" and x["decision"] == "match"]
    assert len(cases) == 4
    assert all(x["confidence"] == "name_only" for x in cases)


def test_unconfirmed_evidence_never_adds_to_the_score():
    r = _report()
    lit = next(f for f in r["flags"] if f["id"] == "litigation")
    assert lit["status"] == "unconfirmed"
    assert lit["points"] == 0
    confirmed_points = sum(f["points"] for f in r["flags"] if f["status"] == "confirmed")
    assert r["score"]["total"] == confirmed_points


def test_near_name_goes_to_the_review_queue_and_is_not_used():
    r = _report()
    queued = [x for x in r["records"] if x["decision"] == "review"]
    assert any("Сервис" in x["name"] for x in queued)
    assert all(not x.get("used_in_flags") for x in queued)


def test_ownership_change_is_found_by_diffing_snapshots():
    r = _report()
    change = next(f for f in r["flags"] if f["id"] == "ownership_change")
    assert change["status"] == "confirmed"
    assert r["snapshots"][0]["content_hash"] != r["snapshots"][1]["content_hash"]


def test_stale_source_is_flagged_and_coverage_is_reported():
    r = _report()
    assert any(f["id"] == "freshness" for f in r["flags"])
    cov = r["coverage"]
    assert cov["checked"] < cov["total"]  # PEP/sanctions needs a licensed list, so it is a stated gap
    courts = next(s for s in r["sources"] if s["id"] == "courts")
    assert courts["age_days"] > 30


def test_spelling_probe_uses_the_real_matcher():
    r = _report()
    by_label = {p["label"]: p for p in r["spellings"]}
    assert by_label["Latin"]["decision"] == "match"
    assert by_label["Numbered sibling"]["decision"] != "match"


def test_report_date_is_fixed_so_the_demo_is_reproducible():
    assert REPORT_DATE == "2026-10-06"
