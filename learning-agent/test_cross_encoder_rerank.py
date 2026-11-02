import base64
import os
import tempfile
import unittest
from unittest.mock import patch

import artifact_retrieval
import artifact_store
import cross_encoder_rerank
import learning_agent as agent
import semantic_retrieval
import team_orchestrator as team


class CrossEncoderTests(unittest.TestCase):
    def test_unconfigured_is_explicit(self):
        with patch.dict(os.environ, {}, clear=True):
            scores, trace = cross_encoder_rerank.rank("query", ["doc"])
        self.assertIsNone(scores)
        self.assertEqual(trace["status"], "NOT_CONFIGURED")

    def test_jina_response_is_sorted_and_validated(self):
        body = {"results": [
            {"index": 0, "relevance_score": 0.12},
            {"index": 1, "relevance_score": 0.93},
        ]}
        with patch.dict(os.environ, {"SHANGAN_RERANKER_URL": "https://reranker.invalid/rerank"}), \
             patch.object(cross_encoder_rerank, "_request", return_value=body):
            scores, trace = cross_encoder_rerank.rank("query", ["weak", "strong"])
        self.assertEqual(scores, [(1, 0.93), (0, 0.12)])
        self.assertEqual(trace["status"], "AVAILABLE")

    def test_incomplete_or_invalid_provider_output_fails_closed(self):
        body = [{"index": 0, "score": float("nan")}]
        with patch.dict(os.environ, {"SHANGAN_RERANKER_URL": "https://reranker.invalid/rerank"}), \
             patch.object(cross_encoder_rerank, "_request", return_value=body):
            scores, trace = cross_encoder_rerank.rank("query", ["one", "two"])
        self.assertIsNone(scores)
        self.assertEqual(trace["status"], "UNAVAILABLE")
        self.assertEqual(trace["error_code"], "ValueError")

    def test_retrieval_uses_reranker_and_keeps_original_evidence(self):
        with tempfile.TemporaryDirectory() as temp, \
             patch.object(agent, "DB", temp + "/state.sqlite3"):
            project = team.create({"goal": "SYNTHETIC reranker test", "mode": "live"})
            raw = "交付验收应有可检查成果\n交付验收需要保留执行证据".encode()
            project = artifact_store.import_file({
                "project_id": project["project_id"],
                "expected_version": project["version"],
                "filename": "fixture.txt",
                "artifact_id": "report",
                "data_base64": base64.b64encode(raw).decode(),
            })
            captured = {}
            def fake_rank(query, documents):
                captured["documents"] = list(documents)
                return [(i, 1.0 if i == len(documents)-1 else 0.1)
                        for i in reversed(range(len(documents)))], {
                            "status": "AVAILABLE", "model": "synthetic-cross-encoder",
                            "scored_candidates": len(documents)}
            with patch.object(semantic_retrieval, "search",
                              return_value=([], {"status": "NOT_CONFIGURED"})), \
                 patch.object(cross_encoder_rerank, "rank", side_effect=fake_rank):
                result = artifact_retrieval.select(project, "交付验收")
            self.assertEqual(result["reranker"], "cross_encoder")
            self.assertTrue(result["rrf_hits"])  # Preserve the pre-rerank ranking for paired evaluation.
            self.assertEqual(result["reranker_trace"]["status"], "AVAILABLE")
            self.assertEqual(result["hits"][0]["text"], captured["documents"][-1])
            hit = result["hits"][0]
            artifact_store.references(project, [{**hit, "quote": hit["text"]}])

    def test_rag_workbench_assets_are_served(self):
        import threading
        from http.server import ThreadingHTTPServer
        from urllib.request import urlopen
        from learning_agent_server import Handler
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base = "http://127.0.0.1:" + str(server.server_port)
            with urlopen(base + "/team.html", timeout=5) as response:
                html = response.read().decode("utf-8")
            with urlopen(base + "/team-rag.js", timeout=5) as response:
                script = response.read().decode("utf-8")
            self.assertIn('id="rag-panel"', html)
            self.assertIn('src="team-rag.js"', html)
            self.assertIn("/artifact-retrieve", script)
            self.assertIn("/rag-diagnosis-preview", script)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


class CrossEncoderProviderTests(unittest.TestCase):
    def test_tei_uses_texts_contract(self):
        payload = cross_encoder_rerank._payload("tei", "query", ["a", "b"], "model")
        self.assertEqual(payload, {"query":"query", "texts":["a","b"], "raw_scores":True})
        self.assertNotIn("documents", payload)

    def test_jina_uses_documents_contract(self):
        payload = cross_encoder_rerank._payload("jina", "query", ["a"], "model")
        self.assertEqual(payload["documents"], ["a"])
        self.assertEqual(payload["top_n"], 1)

    def test_unsupported_provider_fails_closed(self):
        with patch.dict(os.environ, {"SHANGAN_RERANKER_URL":"https://example.invalid",
                                     "SHANGAN_RERANKER_PROVIDER":"unknown"}):
            result, trace = cross_encoder_rerank.rank("query", ["document"])
        self.assertIsNone(result)
        self.assertEqual(trace["status"], "UNAVAILABLE")
        self.assertEqual(trace["error_code"], "UnsupportedProvider")


if __name__ == "__main__":
    unittest.main()
