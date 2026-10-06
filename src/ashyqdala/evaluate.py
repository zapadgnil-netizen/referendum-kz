"""Score the matcher against a labelled gold set (JSONL of pairs).

Precision is the gate: a false merge pins one company's court cases on another.
Usage: python -m ashyqdala.evaluate data/gold/pairs.jsonl [--min-precision 0.98]
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

from .match import Decision, MatchResult, Record, score


@dataclass(frozen=True)
class LabelledPair:
    a: Record
    b: Record
    same: bool
    note: str = ""


@dataclass(frozen=True)
class PairError:
    kind: str  # "false_positive" | "false_negative"
    note: str
    a: Record
    b: Record
    result: MatchResult


@dataclass
class Report:
    total: int = 0
    true_positive: int = 0
    false_positive: int = 0
    false_negative: int = 0
    true_negative: int = 0
    sent_to_review: int = 0
    errors: list[PairError] = field(default_factory=list)

    @property
    def precision(self) -> float:
        predicted = self.true_positive + self.false_positive
        return self.true_positive / predicted if predicted else 1.0

    @property
    def recall(self) -> float:
        actual = self.true_positive + self.false_negative
        return self.true_positive / actual if actual else 1.0


def load_pairs(path: str | Path) -> list[LabelledPair]:
    pairs = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        pairs.append(
            LabelledPair(
                a=Record(row["a"]["name"], row["a"].get("bin")),
                b=Record(row["b"]["name"], row["b"].get("bin")),
                same=row["same"],
                note=row.get("note", ""),
            )
        )
    return pairs


def evaluate(pairs: list[LabelledPair]) -> Report:
    report = Report(total=len(pairs))
    for p in pairs:
        result = score(p.a, p.b)
        predicted_same = result.decision is Decision.MATCH
        if result.decision is Decision.REVIEW:
            report.sent_to_review += 1
        if predicted_same and p.same:
            report.true_positive += 1
        elif predicted_same and not p.same:
            report.false_positive += 1
            report.errors.append(PairError("false_positive", p.note, p.a, p.b, result))
        elif not predicted_same and p.same:
            report.false_negative += 1
            report.errors.append(PairError("false_negative", p.note, p.a, p.b, result))
        else:
            report.true_negative += 1
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("gold")
    parser.add_argument("--min-precision", type=float, default=0.98)
    args = parser.parse_args(argv)

    report = evaluate(load_pairs(args.gold))
    print(f"pairs={report.total} precision={report.precision:.3f} recall={report.recall:.3f} "
          f"review={report.sent_to_review}")
    for e in report.errors:
        print(f"  {e.kind}: {e.a.name!r} vs {e.b.name!r} -> {e.result.decision.value} "
              f"({e.result.score}, {', '.join(e.result.reasons)}) [{e.note}]")
    return 0 if report.precision >= args.min_precision else 1


if __name__ == "__main__":
    sys.exit(main())
