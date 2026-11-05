import unittest

import ai_capability_evaluation as evaluation


class AICapabilityEvaluationTests(unittest.TestCase):
    def setUp(self):
        self.case = {
            "case_id": "case-001",
            "skill": "evidence_diagnosis",
            "expected_gap_ids": ["G1"],
            "required_unknowns": ["baseline_not_provided"],
            "evidence_catalog": [{
                "artifact_id": "v1-report",
                "artifact_version": 1,
                "locator": "page:2/paragraph:3",
                "quote": "原文证据片段",
            }],
        }
        self.output = {
            "gaps": [{
                "gap_id": "G1",
                "evidence_refs": [{
                    "artifact_id": "v1-report",
                    "artifact_version": 1,
                    "locator": "page:2/paragraph:3",
                    "quote": "原文证据片段",
                }],
            }],
            "unknowns": ["baseline_not_provided"],
            "micro_steps": [{
                "input_version": {"artifact_id": "v1-report", "artifact_version": 1},
                "target_locator": "page:2/paragraph:3",
                "action": "在第2页第3段补录基线来源字段",
                "reason": "当前材料没有可核验基线",
                "expected_change": "形成带来源的基线记录",
                "output": "基线证据表",
                "self_check": "逐项核对来源和日期",
                "failure_next": "联系数据负责人补取原始记录",
                "capability_basis": "先做最小证据定位试做",
            }],
        }
        self.run = {"mode": "LIVE", "model_id": "model-x", "trace_id": "trace-1", "task_type": "diagnosis"}

    def test_grounded_live_case_is_scored_but_not_auto_approved(self):
        result = evaluation.evaluate_case(self.case, self.output, self.run)
        self.assertEqual(result["score"], 100)
        self.assertTrue(result["human_review_required"])
        self.assertFalse(result["execution_allowed"])
        self.assertEqual(result["certification_status"], "pending_independent_human_review")

    def test_wrong_version_or_quote_hard_fails(self):
        output = dict(self.output)
        output["gaps"] = [dict(self.output["gaps"][0])]
        output["gaps"][0]["evidence_refs"] = [dict(self.output["gaps"][0]["evidence_refs"][0])]
        output["gaps"][0]["evidence_refs"][0]["artifact_version"] = 2
        result = evaluation.evaluate_case(self.case, output, self.run)
        self.assertIn("unsupported_or_wrong_version_evidence", result["hard_failures"])
        self.assertLessEqual(result["score"], 49)

    def test_required_unknown_must_not_be_hidden(self):
        output = dict(self.output)
        output["unknowns"] = []
        result = evaluation.evaluate_case(self.case, output, self.run)
        self.assertIn("required_unknown_not_reported", result["hard_failures"])

    def test_mock_run_never_certifies_live_model(self):
        run = dict(self.run, mode="MOCK")
        result = evaluation.evaluate_case(self.case, self.output, run)
        self.assertEqual(result["components"]["live_provenance"], 0)
        self.assertEqual(result["certification_status"], "not_live_evidence")

    def test_model_skill_level_requires_five_distinct_human_reviewed_live_cases(self):
        records = [{
            "skill": "evidence_diagnosis", "case_id": f"c{i}", "task_type": f"type{i%3}",
            "run_mode": "LIVE", "human_reviewed": True, "reviewer_id": "reviewer-2",
            "hard_failures": [], "score": 96,
        } for i in range(10)]
        profile = evaluation.model_skill_profile(records[:4], "evidence_diagnosis")
        self.assertEqual(profile["level"], "unverified")
        profile = evaluation.model_skill_profile(records, "evidence_diagnosis")
        self.assertEqual(profile["level"], "validated_bounded")

    def test_duplicate_case_does_not_inflate_model_level(self):
        row = {
            "skill": "evidence_diagnosis", "case_id": "same", "task_type": "diagnosis",
            "run_mode": "LIVE", "human_reviewed": True, "reviewer_id": "human",
            "hard_failures": [], "score": 100,
        }
        profile = evaluation.model_skill_profile([row] * 10, "evidence_diagnosis")
        self.assertEqual(profile["live_human_reviewed_cases"], 1)
        self.assertEqual(profile["level"], "unverified")

    def test_person_and_model_skill_levels_are_never_collapsed(self):
        result = evaluation.match_support(
            {"level": "validated_bounded"},
            {"level": "unverified"},
        )
        self.assertEqual(result["support_mode"], "guided_practice_with_human_check")
        self.assertEqual(result["model_skill_level"], "validated_bounded")
        self.assertEqual(result["member_skill_level"], "unverified")

    def test_high_risk_always_requires_human_review(self):
        result = evaluation.match_support(
            {"level": "validated_bounded"},
            {"level": "transfer"},
            risk="critical",
        )
        self.assertTrue(result["human_review_required"])


if __name__ == "__main__":
    unittest.main()
