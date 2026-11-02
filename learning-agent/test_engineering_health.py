import os
import unittest
from unittest.mock import patch
import engineering_health


class EngineeringHealthTests(unittest.TestCase):
    def test_missing_services_are_never_reported_ready(self):
        names = ("SHANGAN_OLLAMA_URL", "SHANGAN_QDRANT_URL", "SHANGAN_QDRANT_PATH",
                 "SHANGAN_RERANKER_URL", "SHANGAN_DATABASE_URL", "SHANGAN_REDIS_URL")
        with patch.dict(os.environ, {}, clear=True):
            for name in names:
                os.environ.pop(name, None)
            result = engineering_health.report()
        self.assertFalse(result["summary"]["ready"])
        self.assertIn("bge_m3", result["summary"]["blocking_services"])
        self.assertEqual(result["bge_m3"]["status"], "NOT_CONFIGURED")
        self.assertEqual(result["bge_reranker"]["status"], "NOT_CONFIGURED")

    def test_configured_reranker_is_not_claimed_available_without_probe(self):
        with patch.dict(os.environ, {"SHANGAN_RERANKER_URL":"http://not-real/rerank"}):
            result = engineering_health.check_reranker(deep=False)
        self.assertEqual(result["status"], "CONFIGURED_NOT_PROBED")

    def test_unconfigured_postgres_and_redis(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(engineering_health.check_postgres()["status"], "NOT_CONFIGURED")
            self.assertEqual(engineering_health.check_redis()["status"], "NOT_CONFIGURED")

    def test_empty_qdrant_collection_is_not_reported_available(self):
        from types import SimpleNamespace
        info = SimpleNamespace(points_count=0, config=SimpleNamespace(
            params=SimpleNamespace(vectors=SimpleNamespace(size=1024))))
        db = type("FakeQdrant", (), {
            "collection_exists": lambda self, name: True,
            "get_collection": lambda self, name: info,
        })()
        fake = type("FakeClient", (), {"__new__": lambda cls, **kwargs: db})
        with patch.dict(os.environ, {"SHANGAN_QDRANT_URL":"http://qdrant.invalid",
                                     "SHANGAN_EMBEDDING_DIMENSIONS":"1024"}), \
             patch.dict("sys.modules", {"qdrant_client":SimpleNamespace(QdrantClient=fake)}):
            result = engineering_health.check_qdrant()
        self.assertEqual(result["status"], "COLLECTION_EMPTY")
        self.assertEqual(result["points_count"], 0)

    def test_qdrant_dimensions_must_match_expected_embedding(self):
        from types import SimpleNamespace
        info = SimpleNamespace(points_count=20, config=SimpleNamespace(
            params=SimpleNamespace(vectors=SimpleNamespace(size=768))))
        db = type("FakeQdrant", (), {
            "collection_exists": lambda self, name: True,
            "get_collection": lambda self, name: info,
        })()
        fake = type("FakeClient", (), {"__new__": lambda cls, **kwargs: db})
        with patch.dict(os.environ, {"SHANGAN_QDRANT_URL":"http://qdrant.invalid",
                                     "SHANGAN_EMBEDDING_DIMENSIONS":"1024"}), \
             patch.dict("sys.modules", {"qdrant_client":SimpleNamespace(QdrantClient=fake)}):
            result = engineering_health.check_qdrant()
        self.assertEqual(result["status"], "VECTOR_DIMENSION_MISMATCH")
        self.assertEqual(result["actual_dimensions"], 768)


    def test_empty_qdrant_collection_is_not_reported_available(self):
        from types import SimpleNamespace
        info = SimpleNamespace(points_count=0, config=SimpleNamespace(
            params=SimpleNamespace(vectors=SimpleNamespace(size=1024))))
        db = type("FakeQdrant", (), {
            "collection_exists": lambda self, name: True,
            "get_collection": lambda self, name: info,
        })()
        fake = type("FakeClient", (), {"__new__": lambda cls, **kwargs: db})
        with patch.dict(os.environ, {"SHANGAN_QDRANT_URL":"http://qdrant.invalid",
                                     "SHANGAN_EMBEDDING_DIMENSIONS":"1024"}), \
             patch.dict("sys.modules", {"qdrant_client":SimpleNamespace(QdrantClient=fake)}):
            result = engineering_health.check_qdrant()
        self.assertEqual(result["status"], "COLLECTION_EMPTY")
        self.assertEqual(result["points_count"], 0)

    def test_qdrant_dimensions_must_match_expected_embedding(self):
        from types import SimpleNamespace
        info = SimpleNamespace(points_count=20, config=SimpleNamespace(
            params=SimpleNamespace(vectors=SimpleNamespace(size=768))))
        db = type("FakeQdrant", (), {
            "collection_exists": lambda self, name: True,
            "get_collection": lambda self, name: info,
        })()
        fake = type("FakeClient", (), {"__new__": lambda cls, **kwargs: db})
        with patch.dict(os.environ, {"SHANGAN_QDRANT_URL":"http://qdrant.invalid",
                                     "SHANGAN_EMBEDDING_DIMENSIONS":"1024"}), \
             patch.dict("sys.modules", {"qdrant_client":SimpleNamespace(QdrantClient=fake)}):
            result = engineering_health.check_qdrant()
        self.assertEqual(result["status"], "VECTOR_DIMENSION_MISMATCH")
        self.assertEqual(result["actual_dimensions"], 768)


if __name__ == "__main__":
    unittest.main()
