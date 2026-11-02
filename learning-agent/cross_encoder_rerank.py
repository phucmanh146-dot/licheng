"""Optional production Cross-Encoder adapters (Jina/Cohere and HF TEI).

No synthetic scores: malformed or unavailable providers are reported explicitly.
"""
import math
import os


def _request(url, payload, headers, timeout):
    import httpx
    with httpx.Client(timeout=timeout, trust_env=False) as client:
        response = client.post(url, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()


def _payload(provider, query, documents, model):
    if provider == "tei":
        # Hugging Face Text Embeddings Inference /rerank contract.
        return {"query": query, "texts": documents, "raw_scores": True}
    if provider in ("jina", "cohere"):
        return {"query": query, "documents": documents, "model": model,
                "top_n": len(documents)}
    raise ValueError("RERANK_PROVIDER_UNSUPPORTED")


def _rows(body):
    rows = body if isinstance(body, list) else body.get("results") if isinstance(body, dict) else None
    if not isinstance(rows, list):
        raise ValueError("RERANK_RESPONSE_INVALID")
    return rows


def rank(query, documents):
    """Return sorted (document_index, score) pairs, or None when unavailable."""
    url = os.getenv("SHANGAN_RERANKER_URL", "").strip()
    model = os.getenv("SHANGAN_RERANKER_MODEL", "BAAI/bge-reranker-v2-m3")
    provider = os.getenv("SHANGAN_RERANKER_PROVIDER", "jina").strip().lower()
    if not url:
        return None, {"status": "NOT_CONFIGURED", "model": model, "provider": provider}
    if not isinstance(query, str) or not query.strip() or not documents:
        raise ValueError("RERANK_INPUT_INVALID")
    if len(documents) > 50 or any(not isinstance(x, str) or not x.strip() for x in documents):
        raise ValueError("RERANK_DOCUMENTS_INVALID")
    if provider not in ("tei", "jina", "cohere"):
        return None, {"status": "UNAVAILABLE", "model": model,
                      "provider": provider, "error_code": "UnsupportedProvider"}
    token = os.getenv("SHANGAN_RERANKER_API_KEY", "")
    headers = {"Authorization": "Bearer " + token} if token else {}
    try:
        body = _request(url, _payload(provider, query, documents, model), headers,
                        float(os.getenv("SHANGAN_RERANKER_TIMEOUT", "30")))
        scores = {}
        for row in _rows(body):
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
        return ordered, {"status": "AVAILABLE", "model": model, "provider": provider,
                         "scored_candidates": len(scores)}
    except Exception as exc:
        return None, {"status": "UNAVAILABLE", "model": model, "provider": provider,
                      "error_code": type(exc).__name__}
