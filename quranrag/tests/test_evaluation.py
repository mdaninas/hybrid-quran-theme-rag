import pytest
from evaluate import evaluate, load_rows


def test_metrics_penalize_misses_and_ignore_duplicate_retrievals():
    cases = {"a": {"id": "a", "expected_verse_ids": ["2:153", "2:155"]}}
    predictions = {"a": {"id": "a", "retrieved_verse_ids": ["1:1", "2:153", "2:153"]}}
    result = evaluate(cases, predictions, k=3)
    assert result["mean_recall_at_k"] == 0.5
    assert result["mean_precision_at_k"] == 1 / 3
    assert result["mrr_at_k"] == 0.5


def test_unanswerable_cases_measure_abstention_separately():
    cases = {"a": {"id": "a", "expected_verse_ids": []}}
    predictions = {"a": {"id": "a", "retrieved_verse_ids": []}}
    result = evaluate(cases, predictions)
    assert result["abstention_accuracy"] == 1
    assert result["mean_recall_at_k"] is None


def test_missing_predictions_are_rejected_instead_of_improving_average():
    with pytest.raises(ValueError):
        evaluate({"a": {}}, {})


def test_duplicate_cases_rejected(tmp_path):
    path = tmp_path / "cases.jsonl"
    path.write_text('{"id":"a"}\n{"id":"a"}\n', encoding="utf-8")
    with pytest.raises(ValueError):
        load_rows(path)
