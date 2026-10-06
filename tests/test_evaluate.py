import json
from pathlib import Path

from ashyqdala.evaluate import evaluate, load_pairs

GOLD = Path(__file__).parent.parent / "data" / "gold" / "pairs.jsonl"


def _write(tmp_path, rows):
    p = tmp_path / "pairs.jsonl"
    p.write_text("\n".join(json.dumps(r) for r in rows), encoding="utf-8")
    return p


def test_precision_and_recall_on_a_tiny_set(tmp_path):
    rows = [
        {"a": {"name": "ТОО Алтын Дала"}, "b": {"name": "Altyn Dala LLP"}, "same": True},
        {"a": {"name": "ТОО Алтын Дала"}, "b": {"name": "АО Қазақ Темір Жолы"}, "same": False},
        {"a": {"name": "ТОО Алтын Дала"}, "b": {"name": "ТОО Кара Жол"}, "same": True},  # unrecoverable by name
    ]
    report = evaluate(load_pairs(_write(tmp_path, rows)))
    assert report.true_positive == 1
    assert report.false_negative == 1
    assert report.false_positive == 0
    assert report.precision == 1.0
    assert report.recall == 0.5


def test_errors_are_listed_for_inspection(tmp_path):
    rows = [{"a": {"name": "ТОО Алтын Дала"}, "b": {"name": "ТОО Кара Жол"}, "same": True, "note": "renamed"}]
    report = evaluate(load_pairs(_write(tmp_path, rows)))
    assert len(report.errors) == 1 and report.errors[0].note == "renamed"


def test_committed_gold_set_meets_the_precision_bar():
    """A false merge puts one company's litigation on another's report, so precision is the gate."""
    report = evaluate(load_pairs(GOLD))
    assert report.total >= 30
    assert report.precision >= 0.98, [e.note for e in report.errors if e.kind == "false_positive"]
