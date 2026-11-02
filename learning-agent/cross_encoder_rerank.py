"""Optional production Cross-Encoder reranking adapter.

Supports Jina/Cohere-style JSON responses and Hugging Face TEI /rerank responses.
The adapter never invents scores: unavailable or malformed services return an
explicit status so retrieval can use its deterministic lexical fallback.
"""
import math
import os


def _request(url, payload, headers, timeout):
    import httpx
    with httpx.Client(timeout=timeout, trust_env=False) as client:
        response = client.post(url, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()


def rank(query, documents):
    """Return (index, relevance_score) ordered by score, or None when unavailable."""
    url = os.getenv("SHANGAN_RERANKER_URL", "").strip()
    model = os.getenv("SHANGAN_RERANKER_MODEL", "BAAI/bge-reranker-v2-m3")
    if not url:
        return None, {"status": "NOT_CONFIGURED", "model": model}
    if not isinstance(query, str) or not query.strip() or not documents:
        raise ValueError("RERANK_INPUT_INVALID")
    if len(documents) > 50 or any(not isinstance(x, str) or not x.strip() for x in documents):
        raise ValueError("RERANK_DOCUMENTS_INVALID")
    payload = {"query": query, "documents": documents, "model": model, "top_n": len(documents)}
    token = os.getenv("SHANGAN_RERANKER_API_KEY", "")
    headers = {"Authorization": "Bearer " + token} if token else {}
    try:
        body = _request(url, payload, headers, float(os.getenv("SHANGAN_RERANKER_TIMEOUT", "20")))
        rows = body if isinstance(body, list) else body.get("results") if isinstance(body, dict) else None
        if not isinstance(rows, list):
            raise ValueError("RERANK_RESPONSE_INVALID")
        scores = {}
        for row in rows:
            if not isinstance(row, dict):
                raise ValueError("RERANK_RESPONSE_INVALID")
            index = row.get("index")
            score = row.get("relevance_score", row.get("score"))
            if type(index) is not int or not 0 <= index < len(documents):
                raise ValueError("RERANK_INDEX_INVALID")
            if index in scores or isinstance(score, bool) or not isinstance(score, (int, float)) or not math.isfinite(score):
                raise ValueError("RERANK_SCORE_INVALID")
            scores[index] = float(score)
        if len(scores) != len(documents):
            raise ValueError("RERANK_RESULT_INCOMPLETE")
        ordered = sorted(scores.items(), key=lambda item: (-item[1], item[0]))
        return ordered, {"status": "AVAILABLE", "model": model, "scored_candidates": len(scores)}
    except Exception as exc:
        # Do not leak endpoint URLs, credentials, or provider response bodies.
        return None, {"status": "UNAVAILABLE", "model": model, "error_code": type(exc).__name__}
