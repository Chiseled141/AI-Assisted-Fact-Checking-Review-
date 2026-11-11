import json

import pytest

from config.settings import get_settings
from harness.evaluate import accuracy, cohen_kappa, evaluate, macro_f1, normalize_label, percentile
from harness.pipeline.run import Providers


def test_metrics_match_worked_examples():
    truth = ["a", "a", "b", "b"]
    predicted = ["a", "b", "b", "b"]
    assert accuracy(truth, predicted) == 0.75
    # a: precision 1, recall 0.5, F1 2/3. b: precision 2/3, recall 1, F1 0.8.
    assert macro_f1(truth, predicted) == pytest.approx((2 / 3 + 0.8) / 2)
    # Observed 0.75, expected (2*1 + 2*3)/16 = 0.5.
    assert cohen_kappa(truth, predicted) == pytest.approx(0.5)
    assert cohen_kappa(["a", "a"], ["a", "a"]) is None
    assert cohen_kappa([], []) is None
    assert accuracy([], []) == 0
    assert percentile([3.0, 1.0, 2.0], 0.5) == 2.0
    assert percentile([], 0.5) is None


def test_report_label_names_are_understood():
    assert normalize_label("Refuted") == "contradicted"
    assert normalize_label(" Not enough evidence ") == "insufficient_evidence"
    with pytest.raises(ValueError):
        normalize_label("Partly true")


def test_evaluation_scores_each_judge_and_stays_out_of_history(client, fakes):
    fakes.llm.verdicts = {"anthropic/claude-haiku-5.5": "insufficient_evidence"}
    rows = [
        {"claim": "The line opened on 6 November 2021.", "label": "Supported"},
        {"claim": "The line closed in 2020.", "label": "Refuted"},
    ]
    providers = Providers(llm=fakes.llm, search=fakes.search, fetch=fakes.fetch)
    report = evaluate(rows, ["gpt-luna", "claude-haiku"], providers, get_settings())
    assert report["claims"] == 2
    assert report["unavailable"] == 0
    assert report["judges"]["GPT Luna"]["accuracy"] == 0.5
    assert report["judges"]["Claude Haiku 5.5"]["accuracy"] == 0
    assert report["agreement"]["percent"] == 0
    assert report["latencySeconds"]["p50"] >= 0
    json.dumps(report)
    assert client.get("/api/checks").json()["total"] == 0


def test_evaluation_counts_failures_instead_of_scoring_them(client, fakes):
    fakes.search.fails = True
    providers = Providers(llm=fakes.llm, search=fakes.search, fetch=fakes.fetch)
    report = evaluate([{"claim": "A claim.", "label": "supported"}], ["gpt-luna", "claude-haiku"], providers, get_settings())
    assert report["unavailable"] == 1
    assert report["judges"]["GPT Luna"]["answered"] == 0
