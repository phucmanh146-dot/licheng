from app.retrieval.memory import RetrievalMemoryStore, extract_theme
from app.retrieval.retriever import BM25Index, Retriever, TfidfVectorIndex, build_default_corpus


def test_query_routing_keeps_vague_query_out_of_retrieval():
    retriever = Retriever()
    vague = retriever.retrieve("那个 LangGraph 的东西")
    assert vague.intent == "vague"
    assert vague.results == []
    assert len(vague.clarification) == 3

    error = retriever.retrieve("跑不通官方例子，报 TypeError", profile={"level": 0.3})
    assert error.intent == "error"
    assert error.results[0]["docId"] == "D8"


def test_bm25_and_semantic_routes_disagree_then_rrf_rescues_error_doc():
    docs = build_default_corpus()
    query = "跑不通官方例子，报 TypeError"
    bm25_top = max(BM25Index().scores(query, docs), key=BM25Index().scores(query, docs).get)
    vector_top = max(TfidfVectorIndex().scores(query, docs), key=TfidfVectorIndex().scores(query, docs).get)
    result = Retriever(docs).retrieve(query, profile={"level": 0.3}, trace=True)
    assert bm25_top == "D7"  # raw query: semantic phrase wins keyword route
    assert vector_top == "D7"
    assert result.results[0]["docId"] == "D8"  # error-focused rewrite + RRF rescues D8
    assert result.trace["routes"]["bm25Query"] == "报 typeerror 参数错误 missing argument"


def test_metadata_filter_uses_soft_i_plus_one_boundary():
    retriever = Retriever()
    beginner = retriever.retrieve("LangGraph 部署到边缘设备怎么做", profile={"level": 0.2}, trace=True)
    assert all(item["docId"] != "D10" for item in beginner.results)
    assert any("难度" in item["reason"] for item in beginner.trace["metadataFilter"]["removed"])

    advanced = retriever.retrieve("LangGraph 部署到边缘设备怎么做", profile={"level": 1.0})
    assert any(item["docId"] == "D10" for item in advanced.results)


def test_memory_dedups_fragments_and_alerts_on_third_query(tmp_path):
    store = RetrievalMemoryStore(tmp_path / "memory.json")
    retriever = Retriever()
    assert extract_theme("LangGraph 还是跑不通") == "langgraph"

    first = retriever.retrieve(
        "LangGraph 还是跑不通，一直报错", profile={"level": 0.3}, memory=store
    )
    second = retriever.retrieve(
        "LangGraph 还是跑不通，一直报错", profile={"level": 0.3}, memory=store
    )
    third = retriever.retrieve(
        "LangGraph 还是跑不通，一直报错", profile={"level": 0.3}, memory=store
    )
    assert first.memory["fragmentsAdded"] > 0
    assert second.memory["fragmentsDeduped"] > 0
    assert third.memory["themeCount"] == 3
    assert third.memory["alerts"] and "换类型" in third.memory["alerts"][0]
    assert len(store.data["L1_raw"]) == 3
