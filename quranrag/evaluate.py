"""Score saved retrieval predictions against human-reviewed JSONL cases, offline."""
import argparse
import json
from pathlib import Path
from statistics import mean


def load_rows(path):
    rows = {}
    for line_number, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        row = json.loads(line)
        if not isinstance(row, dict) or not isinstance(row.get("id"), str) or not row["id"]:
            raise ValueError(f"{path}:{line_number}: a nonempty string id is required")
        if row["id"] in rows:
            raise ValueError(f"Duplicate case id: {row['id']}")
        rows[row["id"]] = row
    return rows


def ids(row, field):
    values = row.get(field)
    if not isinstance(values, list) or any(not isinstance(v, str) or not v for v in values):
        raise ValueError(f"{row.get('id')}: {field} must be a list of nonempty strings")
    return list(dict.fromkeys(values))


def evaluate(cases, predictions, k=5):
    if k < 1 or not cases or cases.keys() != predictions.keys():
        raise ValueError("Use k >= 1 and matching nonempty sets of case/prediction IDs")
    scored = []
    for case_id, case in cases.items():
        expected = set(ids(case, "expected_verse_ids"))
        predicted = ids(predictions[case_id], "retrieved_verse_ids")[:k]
        hits = len(expected & set(predicted))
        scored.append({"id": case_id, "answerable": bool(expected),
                       "recall_at_k": hits / len(expected) if expected else None,
                       "precision_at_k": hits / k if expected else None,
                       "reciprocal_rank": next((1 / rank for rank, ref in enumerate(predicted, 1)
                                                if ref in expected), 0) if expected else None,
                       "correct_abstention": not predicted if not expected else None})
    answerable = [r for r in scored if r["answerable"]]
    unanswerable = [r for r in scored if not r["answerable"]]
    return {"k": k, "cases": len(scored), "answerable_cases": len(answerable),
            "unanswerable_cases": len(unanswerable),
            "mean_recall_at_k": mean(r["recall_at_k"] for r in answerable) if answerable else None,
            "mean_precision_at_k": mean(r["precision_at_k"] for r in answerable) if answerable else None,
            "mrr_at_k": mean(r["reciprocal_rank"] for r in answerable) if answerable else None,
            "abstention_accuracy": mean(r["correct_abstention"] for r in unanswerable) if unanswerable else None,
            "per_case": scored}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", required=True, type=Path)
    parser.add_argument("--predictions", required=True, type=Path)
    parser.add_argument("--k", type=int, default=5)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = evaluate(load_rows(args.cases), load_rows(args.predictions), args.k)
    serialized = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(serialized, encoding="utf-8")
    print(serialized)
