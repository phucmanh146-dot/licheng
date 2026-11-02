import unittest
from unittest.mock import patch
import verify_two_real_projects as verifier


class VerifyTwoProjectsTests(unittest.TestCase):
    def test_exactly_two_distinct_project_ids_required(self):
        with self.assertRaisesRegex(ValueError, "两个不同"):
            verifier.verify(["same", "same"])
        with self.assertRaisesRegex(ValueError, "两个不同"):
            verifier.verify(["one"])

    def test_demo_or_unreviewed_project_never_passes(self):
        project = {
            "project_id":"p1", "goal":"真实项目",
            "stored_artifacts":[
                {"artifact_id":"v1","artifact_version":1,"purpose":"input"},
                {"artifact_id":"v2","artifact_version":1,"purpose":"submission"}],
            "plan":{"tasks":[{"task_id":"t1","status":"pending_review",
                "submission":{"artifact_id":"v2","artifact_version":1,
                              "executor_ids":["A"],"executor_record_source":"declared"},
                "external_review":{}, "review":{}}]}}
        with patch.object(verifier.team, "state", return_value=project), \
             patch.object(verifier.artifact_store, "read", side_effect=[
                 {"sha256":"a"}, {"sha256":"b"}]):
            result = verifier.inspect_project("p1")
        self.assertFalse(result["passed"])
        self.assertFalse(result["checks"]["independent_manual_review"])
        self.assertFalse(result["checks"]["human_confirmation"])

    def test_two_ids_must_both_pass(self):
        with patch.object(verifier, "inspect_project", side_effect=[
            {"project_id":"p1","passed":True}, {"project_id":"p2","passed":False}]):
            result = verifier.verify(["p1","p2"])
        self.assertFalse(result["passed"])


if __name__ == "__main__":
    unittest.main()
