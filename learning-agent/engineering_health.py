"""Read-only readiness probes for the real engineering dependencies.

A configured URL is not treated as a successful connection. Deep probes perform
one real embedding and one real reranker inference; no secrets or endpoint URLs
are included in the returned report.
"""
import os
import time


def _item(status, **details):
    return {"status": status, **details}


def check_ollama(deep=False):
    base = os.getenv("SHANGAN_OLLAMA_URL", "").strip()
    model = os.getenv("SHANGAN_EMBEDDING_MODEL", "bge-m3")
    if not base:
        return _item("NOT_CONFIGURED", model=model)
    try:
        import httpx
        with httpx.Client(timeout=5, trust_env=False) as client:
            response = client.get(base.rstrip("/") + "/api/tags")
            response.raise_for_status()
            names = {row.get("name", "").split(":")[0] for row in response.json().get("models", [])}
        if model.split(":")[0] not in names:
            return _item("MODEL_NOT_INSTALLED", model=model)
        result = {"status": "AVAILABLE", "model": model}
        if deep:
            from semantic_retrieval import embed
            vector = embed(["上岸鸭真实语义检索健康检查"])
            result["embedding_dimensions"] = len(vector[0])
            result["inference"] = "PASSED"
        else:
            result["inference"] = "NOT_RUN"
        return result
    except Exception as exc:
        return _item("UNAVAILABLE", model=model, error_code=type(exc).__name__)


def check_qdrant(deep=False):
    url, path = os.getenv("SHANGAN_QDRANT_URL", "").strip(), os.getenv("SHANGAN_QDRANT_PATH", "").strip()
    if not url and not path:
        return _item("NOT_CONFIGURED")
    try:
        from qdrant_client import QdrantClient
        db = QdrantClient(path=path) if path else QdrantClient(
            url=url, api_key=os.getenv("SHANGAN_QDRANT_API_KEY") or None, timeout=5)
        collection = os.getenv("SHANGAN_QDRANT_COLLECTION", "shangan_artifacts_v1")
        exists = db.collection_exists(collection)
        result = {"status": "AVAILABLE" if exists else "COLLECTION_NOT_INITIALIZED",
                  "collection_exists": exists, "collection": collection}
        if exists:
            info = db.get_collection(collection)
            result["points_count"] = info.points_count
            result["vectors_configured"] = bool(info.config.params.vectors)
            result["expected_dimensions"] = int(os.getenv("SHANGAN_EMBEDDING_DIMENSIONS", "1024"))
        if deep and exists:
            result["count_probe"] = "PASSED"
        return result
    except Exception as exc:
        return _item("UNAVAILABLE", error_code=type(exc).__name__)


def check_reranker(deep=False):
    if not os.getenv("SHANGAN_RERANKER_URL", "").strip():
        return _item("NOT_CONFIGURED", model=os.getenv("SHANGAN_RERANKER_MODEL", "BAAI/bge-reranker-v2-m3"))
    if not deep:
        return _item("CONFIGURED_NOT_PROBED",
                     model=os.getenv("SHANGAN_RERANKER_MODEL", "BAAI/bge-reranker-v2-m3"))
    try:
        import cross_encoder_rerank
        scores, trace = cross_encoder_rerank.rank(
            "哪份材料说明了真实用户增长？",
            ["材料记录了用户增长数据和统计口径。",
             "这是一段与用户增长无关的页面颜色说明。"])
        if scores is None or trace.get("status") != "AVAILABLE":
            return _item("UNAVAILABLE", model=trace.get("model"),
                         provider=trace.get("provider"), error_code=trace.get("error_code"))
        return _item("AVAILABLE", model=trace["model"], provider=trace["provider"],
                     scored_candidates=len(scores), inference="PASSED")
    except Exception as exc:
        return _item("UNAVAILABLE", error_code=type(exc).__name__)


def check_postgres():
    url = os.getenv("SHANGAN_DATABASE_URL", "").strip()
    if not url:
        return _item("NOT_CONFIGURED")
    try:
        from sqlalchemy import create_engine, text
        engine = create_engine(url, pool_pre_ping=True, connect_args={"connect_timeout": 4})
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return _item("AVAILABLE", query="SELECT 1")
        finally:
            engine.dispose()
    except Exception as exc:
        return _item("UNAVAILABLE", error_code=type(exc).__name__)


def check_redis():
    url = os.getenv("SHANGAN_REDIS_URL", "").strip()
    if not url:
        return _item("NOT_CONFIGURED")
    try:
        import redis
        client = redis.Redis.from_url(url, socket_connect_timeout=2, socket_timeout=2)
        try:
            client.ping()
            return _item("AVAILABLE", ping="PONG")
        finally:
            client.close()
    except Exception as exc:
        return _item("UNAVAILABLE", error_code=type(exc).__name__)


def check_ocr():
    try:
        import numpy
        import onnxruntime
        from PIL import Image
        import rapidocr
        return _item("AVAILABLE", engine="RapidOCR/ONNX",
                     benchmark="NOT_RUN", numpy=numpy.__version__,
                     onnxruntime=onnxruntime.__version__)
    except Exception as exc:
        return _item("UNAVAILABLE", error_code=type(exc).__name__)


def report(deep=False):
    started = time.perf_counter()
    checks = {
        "bge_m3": check_ollama(deep),
        "qdrant": check_qdrant(deep),
        "bge_reranker": check_reranker(deep),
        "postgresql": check_postgres(),
        "redis": check_redis(),
        "ocr": check_ocr(),
    }
    blocking = ("NOT_CONFIGURED", "MODEL_NOT_INSTALLED", "COLLECTION_NOT_INITIALIZED", "UNAVAILABLE")
    checks["summary"] = {
        "ready": all(row["status"] == "AVAILABLE" for row in checks.values()),
        "blocking_services": [name for name, row in checks.items()
                              if name != "summary" and row["status"] in blocking],
        "not_available_services": [name for name, row in checks.items()
                                    if name != "summary" and row["status"] != "AVAILABLE"],
        "deep_inference_probes": bool(deep),
        "duration_ms": round((time.perf_counter() - started) * 1000, 1),
        "warning": "配置存在不等于服务可用；OCR依赖可用不等于真实扫描件准确率达标。"
    }
    return checks
