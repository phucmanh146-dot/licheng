import os
import sqlite3
import tempfile
import unittest
from contextlib import contextmanager
from unittest.mock import patch

import cloud_hub
import team_orchestrator as team


class CloudHubTests(unittest.TestCase):
    def setUp(self):
        handle = tempfile.NamedTemporaryFile(delete=False)
        self.path = handle.name
        handle.close()

        @contextmanager
        def connection():
            c = sqlite3.connect(self.path, timeout=10)
            c.row_factory = sqlite3.Row
            try:
                yield c
                c.commit()
            except Exception:
                c.rollback()
                raise
            finally:
                c.close()

        self.conn_patch = patch.object(team, "connection", connection)
        self.conn_patch.start()
        self.env_patch = patch.dict(os.environ, {"SHANGAN_BRIDGE_PAIR_CODE":"one-time-test-code"}, clear=False)
        self.env_patch.start()
        cloud_hub.init()

    def tearDown(self):
        self.env_patch.stop()
        self.conn_patch.stop()
        try:
            os.unlink(self.path)
        except OSError:
            pass

    def test_pair_code_is_one_time_and_token_is_stored_hashed(self):
        result = cloud_hub.pair({"pair_code":"one-time-test-code","label":"unit-test"})
        self.assertTrue(result["token"])
        self.assertNotIn(result["token"], open(self.path,"rb").read().decode("latin1"))
        class Request:
            headers = {"authorization":"Bearer "+result["token"]}
        self.assertTrue(cloud_hub.require_token(Request()))
        with self.assertRaises(PermissionError):
            cloud_hub.pair({"pair_code":"one-time-test-code"})

    def test_high_risk_task_waits_for_approval_then_is_claimable(self):
        created = cloud_hub.submit_task({
            "task":"删除生产数据库中的旧记录。",
            "requested_action":"delete_data",
            "acceptance_criteria":[{"type":"contains_text","value":"删除完成"}],
        })
        self.assertEqual(created["status"],"awaiting_approval")
        approved = cloud_hub.decide_approval(created["approval_id"],{"decision":"approve"})
        self.assertEqual(approved["status"],"approved_pending_executor")
        claimed = cloud_hub.claim_task({"worker":"test-chatgpt"})
        self.assertEqual(claimed["task"]["task_id"],created["task_id"])
        self.assertTrue(claimed["task"]["claim_token"])

    def test_chatgpt_self_report_is_not_enough_browser_evidence_verifies(self):
        created = cloud_hub.submit_task({
            "task":"在测试站点发布一个草稿。",
            "acceptance_criteria":[
                {"type":"contains_text","value":"发布成功"},
                {"type":"url_contains","value":"example.test"},
            ],
        })
        claimed = cloud_hub.claim_task({"worker":"test-chatgpt"})["task"]
        evidence = cloud_hub.capture_evidence({
            "source":"browser","task_id":created["task_id"],
            "page_url":"https://example.test/drafts/1",
            "page_title":"草稿状态","text":"页面显示：发布成功",
        })
        self.assertEqual(evidence["verification"]["status"],"claimed")
        receipt = cloud_hub.complete_task(created["task_id"],{
            "claim_token":claimed["claim_token"],"result":"我已完成发布。"
        })
        self.assertEqual(receipt["status"],"passed")

    def test_passive_browser_capture_does_not_create_a_task(self):
        cloud_hub.capture_evidence({
            "source":"chatgpt","conversation_id":"chatgpt:/c/123",
            "page_url":"https://chatgpt.com/c/123","page_title":"ChatGPT",
            "text":"用户和助手正在讨论一个项目，这只是被动采集的页面快照。",
        })
        self.assertEqual(cloud_hub.dashboard()["tasks"],[])
        self.assertEqual(len(cloud_hub.dashboard()["events"]),1)

    def test_rejected_decision_suppresses_same_scoped_task(self):
        cloud_hub.record_decision({
            "decision_key":"demo-no-new-api-key","decision_type":"rejected",
            "original_quote":"这个 Demo 不新增 API Key。","scope":"该 Demo",
        })
        result = cloud_hub.submit_task({
            "task":"为 Demo 创建一个 API Key。",
            "requested_action":"create_key",
            "decision_key":"demo-no-new-api-key",
        })
        self.assertEqual(result["status"],"rejected_by_policy")

    def test_feedback_is_not_adopted_until_user_clicks(self):
        saved = cloud_hub.add_feedback({
            "source":"email","sender_email":"tester@example.test",
            "original_text":"希望自动保存每次任务的执行证据。",
        })
        self.assertEqual(cloud_hub.dashboard()["feedback"][0]["status"],"unreviewed")
        result = cloud_hub.decide_feedback(saved["feedback_id"],{"decision":"adopt"})
        self.assertEqual(result["status"],"adopted")
        self.assertEqual(cloud_hub.dashboard()["tasks"][0]["status"],"queued")

    def test_no_acceptance_criteria_means_human_review_not_pass(self):
        created = cloud_hub.submit_task({"task":"整理一份产品分析。"})
        claimed = cloud_hub.claim_task({"worker":"test-chatgpt"})["task"]
        result = cloud_hub.complete_task(created["task_id"],{
            "claim_token":claimed["claim_token"],"result":"分析已完成。"
        })
        self.assertEqual(result["status"],"needs_human")


if __name__ == "__main__":
    unittest.main()
