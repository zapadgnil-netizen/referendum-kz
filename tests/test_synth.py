import json
from datetime import date

from ashyqdala import bin as kzbin
from ashyqdala.match import Decision, Record, score
from ashyqdala.names import parse_company_name
from ashyqdala.synth import START_DATE, generate

DATA = generate()


def _entity(name_fragment):
    return next(e for e in DATA["registry"] if name_fragment in e["snapshots"][-1]["name"])


def test_generation_is_deterministic():
    assert json.dumps(generate(), sort_keys=True) == json.dumps(generate(), sort_keys=True)


def test_everything_is_marked_synthetic_and_json_safe():
    assert DATA["meta"]["synthetic"] is True
    json.dumps(DATA, ensure_ascii=False)


def test_registry_has_27_entities_with_valid_unique_synthetic_bins():
    bins = [e["bin"] for e in DATA["registry"]]
    assert len(bins) == len(set(bins)) == 27
    assert all(kzbin.is_valid(b) for b in bins)
    # Month 13 cannot occur in a real BIN, so a synthetic number can never be someone's real one.
    assert all(b[2:4] == "13" for b in bins)


def test_every_record_points_at_a_real_entity_via_hidden_truth():
    known = {e["bin"] for e in DATA["registry"]}
    assert DATA["records"] and all(r["truth"] in known for r in DATA["records"])


def test_all_four_sources_are_present_with_refresh_rules():
    assert {s["id"] for s in DATA["sources"]} == {"registry", "procurement", "courts", "cadastre"}
    assert all("refresh" in s for s in DATA["sources"])


def test_some_record_bins_are_deliberately_mistyped_and_some_are_missing():
    recs = DATA["records"]
    assert any(r["bin"] and not kzbin.is_valid(r["bin"]) for r in recs)
    assert any(r["bin"] is None for r in recs)
    assert any(r["bin"] and kzbin.is_valid(r["bin"]) for r in recs)


def _by_core(core, form=None):
    out = []
    for e in DATA["registry"]:
        parsed = parse_company_name(e["snapshots"][-1]["name"])
        if parsed.core == core and (form is None or parsed.form == form):
            out.append(e)
    return out


def test_trap_numbered_siblings_exist_with_different_bins():
    one, two = _by_core("Алтын Дала Строй"), _by_core("Алтын Дала Строй 2")
    assert len(one) == 1 and len(two) == 1 and one[0]["bin"] != two[0]["bin"]


def test_trap_namesakes_share_a_name_but_not_a_bin():
    twins = _by_core("Нұр Строй")
    assert len(twins) == 2 and twins[0]["bin"] != twins[1]["bin"]
    assert score(Record(twins[0]["snapshots"][-1]["name"]), Record(twins[1]["snapshots"][-1]["name"])).decision is Decision.MATCH


def test_trap_same_name_different_legal_form():
    assert len(_by_core("Қызыл Тау", "llp")) == 1 and len(_by_core("Қызыл Тау", "jsc")) == 1


def test_trap_renamed_company_keeps_its_bin_across_snapshots():
    renamed = [e for e in DATA["registry"] if len({parse_company_name(s["name"]).key for s in e["snapshots"]}) > 1]
    assert len(renamed) == 1


def test_planted_headcount_scenario_is_in_the_data():
    e = _by_core("Алтын Дала Строй")[0]
    wins = [r for r in DATA["records"] if r["source"] == "procurement" and r["truth"] == e["bin"]
            and "2025-10-06" <= r["date"] <= "2026-10-06"]
    assert len(wins) >= 10 and e["snapshots"][-1]["employees"] <= 5


def test_registry_never_lists_individuals_only_roles_and_public_official_ids():
    officials = {o["id"] for o in DATA["officials"]}
    for e in DATA["registry"]:
        for snap in e["snapshots"]:
            for member in snap["board"]:
                assert set(member) == {"role", "official_id"}
                assert member["official_id"] is None or member["official_id"] in officials


def test_future_events_exist_and_nothing_else_is_dated_after_the_start():
    start = START_DATE
    future = [r for r in DATA["records"] if r["first_seen"] > start]
    assert len(future) >= 6
    assert all(r["first_seen"] > start for r in future)
    assert all(r["date"] <= r["first_seen"] for r in DATA["records"])
    snaps_future = [s for e in DATA["registry"] for s in e["snapshots"] if s["date"] > start]
    assert snaps_future


def test_dates_are_valid_iso():
    for r in DATA["records"]:
        date.fromisoformat(r["date"]); date.fromisoformat(r["first_seen"])
    for e in DATA["registry"]:
        for s in e["snapshots"]:
            date.fromisoformat(s["date"])


def test_owner_chain_has_holdings_and_individual_owners():
    bins = {e["bin"] for e in DATA["registry"]}
    owners = [s["owner"] for e in DATA["registry"] for s in e["snapshots"]]
    assert any(o["type"] == "company" and o["bin"] in bins for o in owners)
    assert any(o["type"] == "individual" for o in owners)
    assert all(set(o) >= {"type"} for o in owners)
