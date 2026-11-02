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


if __name__ == "__main__":
    unittest.main()
