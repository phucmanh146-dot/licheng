import unittest
import tempfile
import os
import team_orchestrator as team
import ai_skill_registry as registry


class AISkillRegistryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old = team.DB_PATH
        team.DB_PATH = os.path.join(self.tmp.name, "skill.db")
        registry.init_schema()
        self.case = {"case_id":"gold-1","skill":"evidence_diagnosis","expected_gap_ids":["g1"],
            "required_unknowns":["unknown-x"],"evidence_catalog":[{"artifact_id":"v1","artifact_version":1,
            "locator":"page:1","quote":"source quote"}]}
        self.output = {"gaps":[{"gap_id":"g1","evidence_refs":[{"artifact_id":"v1","artifact_version":1,
            "locator":"page:1","quote":"source quote"}]}],"unknowns":["unknown-x"],"micro_steps":[{
            "input_version":{"artifact_id":"v1","artifact_version":1},"target_locator":"page:1",
            "action":"在第1页补充缺失的来源字段","reason":"当前记录没有来源","expected_change":"形成可追溯记录",
            "output":"更新后的证据行","self_check":"核对来源和版本","failure_next":"找材料负责人补取",
            "capability_basis":"先做定位试做"}]}
        self.run = {"mode":"LIVE","model_id":"m1","trace_id":"t1","task_type":"evidence_diagnosis"}

    def tearDown(self):
        team.DB_PATH = self.old
        self.tmp.cleanup()

    def test_requires_independent_reviewer_before_model_profile(self):
        result = registry.create("p1","executor",self.case,self.output,self.run)
        model, rows = registry.profile("p1","evidence_diagnosis")
        self.assertEqual(model["level"],"unverified")
        with self.assertRaises(PermissionError):
            registry.review("p1",result["evaluation_id"],"executor",True,True,"我自己复核")
        registry.review("p1",result["evaluation_id"],"reviewer",True,True,"逐项读取原文和输出，引用一致")
        model, rows = registry.profile("p1","evidence_diagnosis")
        self.assertEqual(model["live_human_reviewed_cases"],1)
        self.assertEqual(model["level"],"unverified")

    def test_failed_semantic_review_never_certifies_model(self):
        result = registry.create("p1","executor",self.case,self.output,self.run)
        registry.review("p1",result["evaluation_id"],"reviewer",False,True,"输出语义错误，未满足判据")
        model, _ = registry.profile("p1","evidence_diagnosis")
        self.assertEqual(model["live_human_reviewed_cases"],0)

    def test_wrong_version_hard_fail_is_preserved(self):
        output = dict(self.output)
        output["gaps"] = [{"gap_id":"g1","evidence_refs":[{"artifact_id":"v1","artifact_version":2,
            "locator":"page:1","quote":"source quote"}]}]
        result = registry.create("p1","executor",self.case,output,self.run)
        self.assertIn("unsupported_or_wrong_version_evidence",result["hard_failures"])
        registry.review("p1",result["evaluation_id"],"reviewer",True,True,"结构复核通过但错版本硬失败仍保留")
        model, _ = registry.profile("p1","evidence_diagnosis")
        self.assertEqual(model["live_human_reviewed_cases"],0)


if __name__ == "__main__":
    unittest.main()
