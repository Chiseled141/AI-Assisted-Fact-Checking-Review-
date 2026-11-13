"""Scores the pipeline on a labeled set.

    PYTHONPATH=src uv run python -m claimtrace.core.evaluate eval.jsonl --judges gpt-luna claude-haiku --out results.json

Each line of the file is {"claim": "...", "label": "..."}. Labels are the app's verdicts, or the report's names
(Refuted, Not enough evidence). This spends real API credit: a full check's worth for every claim.
"""

import argparse
import json
import time
from collections import Counter
from pathlib import Path

from sqlalchemy.orm import sessionmaker

from claimtrace.config.settings import Settings, get_settings
from claimtrace.db.models import Check, Claim
from claimtrace.db.session import Base, make_engine

from .pipeline.run import Providers, run_check

LABEL_NAMES = {
    "supported": "supported",
    "refuted": "contradicted",
    "contradicted": "contradicted",
    "not enough evidence": "insufficient_evidence",
    "insufficient evidence": "insufficient_evidence",
    "insufficient_evidence": "insufficient_evidence",
    "outdated": "outdated",
}


def normalize_label(label: str) -> str:
    name = LABEL_NAMES.get(label.strip().lower())
    if name is None:
        raise ValueError(f"Unknown label: {label!r}")
    return name


def accuracy(truth: list[str], predicted: list[str]) -> float:
    return sum(a == b for a, b in zip(truth, predicted, strict=True)) / len(truth) if truth else 0.0


def macro_f1(truth: list[str], predicted: list[str]) -> float:
    labels = sorted(set(truth) | set(predicted))
    scores = []
    for label in labels:
        true_positive = sum(a == label and b == label for a, b in zip(truth, predicted, strict=True))
        guessed, actual = predicted.count(label), truth.count(label)
        precision = true_positive / guessed if guessed else 0.0
        recall = true_positive / actual if actual else 0.0
        scores.append(2 * precision * recall / (precision + recall) if precision + recall else 0.0)
    return sum(scores) / len(scores) if scores else 0.0


def cohen_kappa(first: list[str], second: list[str]) -> float | None:
    """Chance-corrected agreement. None when it isn't defined, such as when both always give one label."""
    if not first:
        return None
    observed = accuracy(first, second)
    first_counts, second_counts = Counter(first), Counter(second)
    expected = sum(first_counts[label] * second_counts[label] for label in first_counts) / len(first) ** 2
    return None if expected == 1 else (observed - expected) / (1 - expected)


def percentile(values: list[float], share: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[min(int(share * len(ordered)), len(ordered) - 1)]


def evaluate(rows: list[dict], judge_ids: list[str], providers: Providers, settings: Settings) -> dict:
    # A throwaway database, so that evaluation runs never appear in the app's history.
    engine = make_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    make_session = sessionmaker(bind=engine, expire_on_commit=False)
    names = [settings.judges[judge_id].name for judge_id in judge_ids]

    truth: list[str] = []
    answers: dict[str, list[str | None]] = {name: [] for name in names}
    latencies: list[float] = []
    unavailable = 0

    for row in rows:
        with make_session() as session:
            check = Check(title="evaluation", input_type="text", input_text=row["claim"], judge_ids=judge_ids)
            session.add(check)
            session.commit()
            check_id = check.id
        started = time.perf_counter()
        run_check(check_id, make_session, providers, settings, given_claims=[row["claim"]])
        latencies.append(time.perf_counter() - started)

        with make_session() as session:
            claim = session.query(Claim).filter_by(check_id=check_id).first()
            truth.append(normalize_label(row["label"]))
            verdict = claim.verdicts[-1] if claim and claim.verdicts else None
            if claim is None or claim.status == "unavailable" or verdict is None:
                unavailable += 1
            by_judge = {item["judge"]: item["verdict"] for item in (verdict.judges or [])} if verdict else {}
            for name in names:
                # A verdict made without judges, because no source was found, counts for every judge.
                answers[name].append(by_judge.get(name) or (verdict.label if verdict and not verdict.judges else None))

    judges = {}
    for name in names:
        pairs = [(a, b) for a, b in zip(truth, answers[name], strict=True) if b is not None]
        scored_truth, scored = [a for a, _ in pairs], [b for _, b in pairs]
        judges[name] = {
            "answered": len(pairs),
            "accuracy": accuracy(scored_truth, scored),
            "macroF1": macro_f1(scored_truth, scored),
        }
    both = [(a, b) for a, b in zip(answers[names[0]], answers[names[1]], strict=True) if a is not None and b is not None]
    first, second = [a for a, _ in both], [b for _, b in both]
    return {
        "claims": len(rows),
        "unavailable": unavailable,
        "judges": judges,
        "agreement": {"percent": accuracy(first, second), "cohenKappa": cohen_kappa(first, second)},
        "latencySeconds": {"p50": percentile(latencies, 0.5), "p95": percentile(latencies, 0.95)},
    }


def main() -> None:
    from claimtrace.main import make_providers

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("data", type=Path)
    parser.add_argument("--judges", nargs=2, required=True)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    settings = get_settings()
    providers = make_providers(settings)
    if providers is None:
        raise SystemExit("Set OPENROUTER_API_KEY and TAVILY_API_KEY first.")
    rows = [json.loads(line) for line in args.data.read_text(encoding="utf-8").splitlines() if line.strip()]
    for row in rows:
        normalize_label(row["label"])  # Fail before spending anything.
    report = json.dumps(evaluate(rows, args.judges, providers, settings), indent=2)
    print(report)
    if args.out:
        args.out.write_text(report, encoding="utf-8")


if __name__ == "__main__":
    main()
