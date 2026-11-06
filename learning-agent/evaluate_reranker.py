"""Paired RRF-before vs Cross-Encoder-after evaluation on human-labeled cases.

Ground truth is supplied by a human reviewer. This tool never generates labels.
"""
import argparse
import json
import math
from pathlib import Path

import artifact_retrieval
import artifact_store
import team_orchestrator as team


def key(row):
    return (row["artifact_id"], row["artifact_version"], row["locator"])


def ranking_metrics(rows, expected, k=5):
    ranked = [key(row) for row in rows]
    top = ranked[:k]
    hits = [item in expected for item in top]
    recall = len(set(top) & expected) / len(expected)
    precision = sum(hits) / k
    first = next((i for i, item in enumerate(ranked, 1) if item in expected), None)
    mrr = 1 / first if first else 0.0
    dcg = sum(1 / math.log2(i + 2) for i, hit in enumerate(hits) if hit)
    ideal = sum(1 / math.log2(i + 2) for i in range(min(len(expected), k)))
    ndcg = dcg / ideal if ideal else 0.0
    return {"recall_at_5": recall, "precision_at_5": precision,
            "mrr_at_10": mrr, "ndcg_at_5": ndcg}


def _mean(rows, field):
    return sum(row[field] for row in rows) / len(rows) if rows else 0.0


def evaluate(dataset):
    cases = dataset.get("cases", [])
    if dataset.get("human_labeled") is not True or len(cases) < 30:
        raise ValueError("重排对照需至少30条人工标注问题；不能自动生成相关性标签")
    results, paired = [], []
    for case in cases:
        project = team.state(case["project_id"])
        expected = {key(row) for row in case.get("expected", [])}
        if not expected:
            raise ValueError("每个问题必须有人工确认的相关材料版本和 locator")
        # Validate all gold labels against the actual immutable bytes and locators.
        for artifact_id, version, locator in expected:
            doc = artifact_store.read(project, artifact_id, version)
            if not any(unit["locator"] == locator for unit in doc["units"]):
                raise ValueError("人工标注引用不存在或版本不匹配")
        result = artifact_retrieval.select(
            project, case["query"], limit=10, max_chars=30000,
            filters=case.get("filters", {"purpose": "input"}))
        before = ranking_metrics(result.get("rrf_hits", []), expected)
        after = ranking_metrics(result.get("hits", []), expected)
        status = result.get("reranker_trace", {}).get("status", "UNKNOWN")
        row = {
            "case_id": case.get("case_id", str(len(results) + 1)),
            "query": case["query"], "reranker": result.get("reranker"),
            "reranker_status": status, "rrf": before, "reranked": after,
            "delta": {name: after[name] - before[name] for name in before},
            "retrieval_trace": result,
        }
        results.append(row)
        if status == "AVAILABLE" and result.get("reranker") == "cross_encoder":
            paired.append(row)
    summary = {}
    for group in ("rrf", "reranked"):
        summary[group] = {
            metric: _mean([row[group] for row in results], metric)
            for metric in ("recall_at_5", "precision_at_5", "mrr_at_10", "ndcg_at_5")
        }
    delta = {metric: summary["reranked"][metric] - summary["rrf"][metric]
             for metric in summary["rrf"]}
    available = len(paired)
    return {
        "case_count": len(results), "cross_encoder_available_cases": available,
        "summary": summary, "delta": delta,
        "mrr_improved": delta["mrr_at_10"] > 0,
        "ndcg_improved": delta["ndcg_at_5"] > 0,
        "passed": available == len(results),
        "cases": results,
        "note": "passed仅表示所有样本均完成真实 Cross-Encoder 配对评测；是否提升以 delta 为准。内部检索指标不等于官方竞赛得分。",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("annotations")
    parser.add_argument("--output", default="")
    args = parser.parse_args()
    source = Path(args.annotations).resolve()
    report = evaluate(json.loads(source.read_text(encoding="utf-8")))
    rendered = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(rendered, encoding="utf-8")
    print(rendered)
