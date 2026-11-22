"""Small deterministic evaluation so mixed retrieval claims are backed by numbers."""
from __future__ import annotations

from .retriever import BM25Index, Retriever, TfidfVectorIndex, build_default_corpus

CASES = [
    ("跑不通官方例子，报 TypeError", "error", {"D8"}),
    ("LangGraph 是什么", "concept", {"D1"}),
    ("状态怎么在节点之间传", "howto", {"D3"}),
    ("TypeError missing argument", "error", {"D8"}),
    ("怎么做检查点恢复", "howto", {"D5"}),
    ("流式输出前端怎么解析", "howto", {"D9"}),
    ("边缘设备部署注意事项", "lookup", {"D10"}),
    ("如何设计条件边和循环", "howto", {"D4"}),
    ("那个 LangGraph 的东西", "vague", set()),
]


def reciprocal_rank(ranked_ids: list[str], relevant: set[str]) -> float:
    for rank, doc_id in enumerate(ranked_ids, start=1):
        if doc_id in relevant:
            return 1 / rank
    return 0.0


def main() -> None:
    docs = build_default_corpus()
    retriever = Retriever(docs=docs)
    bm25 = BM25Index()
    vector = TfidfVectorIndex()

    intent_hits = 0
    top1_mixed = top1_bm25 = top1_vector = 0
    mrr_mixed = mrr_bm25 = mrr_vector = 0.0
    evaluated = 0

    for query, expected_intent, relevant in CASES:
        result = retriever.retrieve(query, profile={"level": 1.0})
        intent_hits += int(result.intent == expected_intent)
        if not relevant:
            assert result.intent == "vague" and not result.results
            print(f"✓ 澄清跳过: {query}")
            continue
        evaluated += 1
        mixed_ids = [item["docId"] for item in result.results]
        bm25_ids = [
            doc_id
            for doc_id, _ in sorted(
                bm25.scores(query, docs).items(), key=lambda item: item[1], reverse=True
            )
        ]
        vector_ids = [
            doc_id
            for doc_id, _ in sorted(
                vector.scores(query, docs).items(), key=lambda item: item[1], reverse=True
            )
        ]
        top1_mixed += int(bool(mixed_ids) and mixed_ids[0] in relevant)
        top1_bm25 += int(bool(bm25_ids) and bm25_ids[0] in relevant)
        top1_vector += int(bool(vector_ids) and vector_ids[0] in relevant)
        mrr_mixed += reciprocal_rank(mixed_ids, relevant)
        mrr_bm25 += reciprocal_rank(bm25_ids, relevant)
        mrr_vector += reciprocal_rank(vector_ids, relevant)
        print(
            f"{query[:22]:<24} mixed={mixed_ids[:3]} bm25={bm25_ids[:1]} "
            f"vector={vector_ids[:1]}"
        )

    print("\n指标（9 条标注 query，其中 8 条参与检索）")
    print(f"  路由准确率        : {intent_hits}/{len(CASES)}")
    print(f"  Top1 命中 BM25    : {top1_bm25}/{evaluated}")
    print(f"  Top1 命中 向量    : {top1_vector}/{evaluated}")
    print(f"  Top1 命中 混合RRF : {top1_mixed}/{evaluated}")
    print(f"  MRR BM25          : {mrr_bm25 / evaluated:.3f}")
    print(f"  MRR 向量          : {mrr_vector / evaluated:.3f}")
    print(f"  MRR 混合RRF       : {mrr_mixed / evaluated:.3f}")


if __name__ == "__main__":
    main()
