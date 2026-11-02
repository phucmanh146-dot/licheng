"""Regression checks for real-work evidence readiness.

These checks validate repository metadata and dispatch coverage only. They do not
claim that original artifacts, live models, or human reviews have passed.
"""
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "docs" / "all-works-manifest-20261023.json"
CORPUS_PATH = ROOT / "docs" / "all-works-corpus-test-20261023.json"

# The eight workstreams named by the current team total-dispatch document.
# IDs point to manifest entries; the source originals still need runtime loading.
SAMPLES = {
    "嘉农芯生": ["work-001", "work-002"],
    "滴水润疆": ["work-011", "work-012"],
    "菌润乡土": ["work-013", "work-014"],
    "文玩玉米": ["work-005", "work-006"],
    "本草云联": ["work-008", "work-009"],
    "湘匠织秀/湘秀未来": ["work-010"],
    "数智助老": ["work-003", "work-004"],
    "无界智泊": ["work-007"],
}


class RealArtifactClosedLoopTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        cls.by_id = {item["id"]: item for item in cls.manifest}
        cls.corpus = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))

    def test_all_eight_dispatch_samples_map_to_real_manifest_entries(self):
        self.assertEqual(len(SAMPLES), 8)
        for sample, artifact_ids in SAMPLES.items():
            with self.subTest(sample=sample):
                self.assertTrue(artifact_ids)
                for artifact_id in artifact_ids:
                    self.assertIn(artifact_id, self.by_id)

    def test_manifest_does_not_claim_model_or_target_success(self):
        # Extracted metadata is not equivalent to a semantic review or a V2 pass.
        self.assertGreaterEqual(len(self.manifest), 32)
        for item in self.manifest:
            with self.subTest(artifact=item["id"]):
                self.assertFalse(item.get("model_verified", False))
                self.assertFalse(item.get("target_achieved", False))

    def test_corpus_labels_extraction_checks_as_non_semantic(self):
        self.assertTrue(self.corpus.get("not_model_or_human_result"))
        self.assertGreater(self.corpus.get("checks_passed", 0), 0)
        self.assertEqual(
            self.corpus["checks_passed"],
            sum(len(item.get("checks", [])) for item in self.corpus.get("results", [])),
        )
        for item in self.corpus.get("results", []):
            with self.subTest(work=item["id"]):
                status = item.get("status", "")
                self.assertTrue("unverified" in status or status == "not_text_verified", status)

    def test_unparsed_or_image_only_materials_are_not_marked_verified(self):
        restricted = ("not_parsed", "image_only_needs_visual_review",
                      "image_registered_needs_visual_review")
        for item in self.manifest:
            if item.get("status") in restricted:
                with self.subTest(artifact=item["id"], status=item["status"]):
                    self.assertFalse(item.get("model_verified", False))
                    self.assertFalse(item.get("target_achieved", False))

    def test_sample_specific_acceptance_stays_in_dispatch_scope(self):
        expected_focus = {
            "嘉农芯生": ("真实需求", "原文证据"),
            "滴水润疆": ("真实材料", "unknown"),
            "菌润乡土": ("原始材料", "blocked"),
            "文玩玉米": ("行动卡", "真人执行"),
            "本草云联": ("真实产物", "复核"),
            "湘匠织秀/湘秀未来": ("行动卡", "V2"),
            "数智助老": ("真实基线", "效果证据"),
            "无界智泊": ("端到端", "版本保护"),
        }
        self.assertEqual(set(expected_focus), set(SAMPLES))
        # The focus strings are acceptance prompts for human review, not claims
        # that these outcomes have already been observed.
        for sample, focus in expected_focus.items():
            with self.subTest(sample=sample):
                self.assertEqual(len(focus), 2)
                self.assertTrue(all(isinstance(term, str) and term for term in focus))


if __name__ == "__main__":
    unittest.main()
