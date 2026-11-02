import json
import tempfile
import unittest
from unittest.mock import patch

import learning_agent as agent
import team_orchestrator as team
import team_sessions as team_recovery


class CrossSessionRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_patch = patch.object(agent, "DB", self.tmp.name + "/recovery.sqlite3")
        self.db_patch.start()
        self.project = team.create({
            "goal": "把科研项目的用户访谈证据补齐并复核",
            "mode": "live",
        })

    def tearDown(self):
        self.db_patch.stop()
        self.tmp.cleanup()

    def test_exact_goal_proposes_and_only_confirmation_links_session(self):
        before = team.state(self.project["project_id"])
        result = team_recovery.recover({
            "intent": "接着做：把科研项目的用户访谈证据补齐并复核",
            "sessionId": "session-next",
        })
        after = team.state(self.project["project_id"])
        self.assertEqual(result["project"]["project_id"], self.project["project_id"])
        self.assertEqual(result["match_method"], "exact")
        self.assertTrue(result["needs_confirmation"])
        self.assertEqual(after["version"], before["version"])
        self.assertEqual(result["project"]["session_links"], [])
        linked = team_recovery.confirm({"project_id":self.project["project_id"],
            "expected_version":before["version"],"session_id":"session-next","confirmed":True})
        self.assertEqual(linked["project"]["session_links"][0]["session_id"], "session-next")
        self.assertEqual(team.state(self.project["project_id"])["version"],before["version"])

    def test_model_match_must_choose_existing_candidate_and_pass_confidence(self):
        with patch.object(agent.rescue, "config_snapshot", return_value={"base": "https://example.invalid", "model": "test"}), \
             patch.object(agent.rescue, "complete", return_value=json.dumps({
                 "project_id": self.project["project_id"], "confidence": 0.91, "reason": "目标与用户访谈证据一致"
             }, ensure_ascii=False)):
            result = team_recovery.recover({
                "intent": "继续之前那个访谈证据没补完的科研任务",
                "session_id": "session-model",
            })
        self.assertEqual(result["project"]["project_id"], self.project["project_id"])
        self.assertEqual(result["match_method"], "model_intent")
        self.assertEqual(result["confidence"], 0.91)

    def test_invalid_model_id_fails_closed(self):
        with patch.object(agent.rescue, "config_snapshot", return_value={"base": "https://example.invalid", "model": "test"}), \
             patch.object(agent.rescue, "complete", return_value=json.dumps({
                 "project_id": "invented-project", "confidence": 0.99, "reason": "invented"
             })):
            result = team_recovery.recover({"intent": "继续上次做的科研任务", "session_id": "session-unknown"})
        self.assertIsNone(result["project"])
        self.assertEqual(result["match_method"], "none")
        self.assertTrue(result["needs_confirmation"])
        self.assertEqual(result["matches"][0]["project_id"], self.project["project_id"])

    def test_no_model_does_not_guess_from_weak_intent(self):
        with patch.object(agent.rescue, "config_snapshot", return_value={"base": "", "model": ""}):
            result = team_recovery.recover({"intent": "继续上次那个", "session_id": "session-weak"})
        self.assertIsNone(result["project"])
        self.assertEqual(result["match_method"], "none")
        self.assertTrue(result["matches"])


if __name__ == "__main__":
    unittest.main()
