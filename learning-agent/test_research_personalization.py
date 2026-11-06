import unittest

from research_personalization import capability_profile, research_route


class ResearchPersonalizationTests(unittest.TestCase):
    def test_self_report_without_confirmed_artifact_stays_unverified(self):
        member = {"capability_evidence": [], "skills": ["Python"]}
        result = capability_profile(member, "Python")
        self.assertEqual(result["level"], "unverified")
        self.assertEqual(result["support_mode"], "diagnostic_trial")

    def test_one_confirmed_pass_gets_guided_support_not_expert_label(self):
        member = {"capability_evidence": [{
            "capability": "Python", "evidence_confirmed": True, "passed": True,
            "criterion": "能读取CSV并核对行数", "artifact_id": "a1", "artifact_version": 1,
            "task_id": "t1",
        }]}
        result = capability_profile(member, "python")
        self.assertEqual(result["level"], "guided")
        self.assertEqual(result["support_mode"], "checklist_and_feedback")

    def test_two_distinct_passed_tasks_support_independent_execution(self):
        rows = []
        for i in (1, 2):
            rows.append({
                "capability": "统计分析", "evidence_confirmed": True, "passed": True,
                "criterion": "可复现计算", "artifact_id": f"a{i}", "artifact_version": 1,
                "task_id": f"t{i}",
            })
        self.assertEqual(capability_profile({"capability_evidence": rows}, "统计分析")["level"], "independent")

    def test_transfer_requires_three_tasks_and_explicit_transfer_check(self):
        rows = [{
            "capability": "科研设计", "evidence_confirmed": True, "passed": True,
            "criterion": "独立完成", "artifact_id": f"a{i}", "artifact_version": 1,
            "task_id": f"t{i}", "transfer_verified": i == 3,
        } for i in (1, 2, 3)]
        self.assertEqual(capability_profile({"capability_evidence": rows}, "科研设计")["level"], "transfer")

    def test_latest_confirmed_failure_triggers_targeted_reteach(self):
        rows = [
            {"capability": "RAG", "evidence_confirmed": True, "passed": True,
             "criterion": "基线可运行", "artifact_id": "a1", "artifact_version": 1, "task_id": "t1"},
            {"capability": "RAG", "evidence_confirmed": True, "passed": False,
             "criterion": "引用正确率达标", "artifact_id": "a2", "artifact_version": 1, "task_id": "t2"},
        ]
        self.assertEqual(capability_profile({"capability_evidence": rows}, "RAG")["support_mode"], "targeted_reteach")

    def test_route_is_per_skill_not_one_global_student_rank(self):
        member = {"capability_evidence": [{
            "capability": "Python", "evidence_confirmed": True, "passed": True,
            "criterion": "完成", "artifact_id": "p", "artifact_version": 1, "task_id": "t1",
        }]}
        route = research_route(member, ["Python", "统计"])
        self.assertEqual(route["Python"]["level"], "guided")
        self.assertEqual(route["统计"]["level"], "unverified")


if __name__ == "__main__":
    unittest.main()
