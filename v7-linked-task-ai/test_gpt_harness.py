import os
import unittest
from unittest.mock import patch

import gpt_harness
from rescue_service import RescueError


class GPTHarnessTests(unittest.TestCase):
    def test_status_never_returns_secret(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-secret-do-not-return"}):
            state = gpt_harness.status()
        self.assertTrue(state["configured"])
        self.assertNotIn("key", state)
        self.assertNotIn("test-secret-do-not-return", repr(state))

    def test_missing_key_is_explicit(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(RescueError) as caught:
                gpt_harness._response({"model": "gpt-6-astra"})
        self.assertEqual(caught.exception.code, "OPENAI_KEY_MISSING")

    def test_unknown_tool_is_not_executed(self):
        result = gpt_harness._tool("delete_everything", {})
        self.assertFalse(result["ok"])
        self.assertIn("未注册", result["error"])

    def test_function_call_round_trip(self):
        call = {"type": "function_call", "name": "search_web", "call_id": "call_1",
                "arguments": '{"query":"official docs","limit":2}'}
        first = {"model": "gpt-test", "output": [call]}
        second = {"model": "gpt-test", "output_text": "已完成检索。", "output": []}
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}), \
             patch.object(gpt_harness, "_response", side_effect=[first, second]) as request, \
             patch.object(gpt_harness, "_tool", return_value={"ok": True, "results": []}) as tool:
            result = gpt_harness.ask({"question": "查官方资料"}, client="unit-test-client")
        self.assertEqual(result["reply"], "已完成检索。")
        self.assertEqual(result["toolsUsed"], ["search_web"])
        self.assertEqual(result["rounds"], 2)
        self.assertEqual(request.call_count, 2)
        self.assertEqual(tool.call_count, 1)


    def test_autoloop_state_is_read_for_current_account(self):
        expected = {"ok": True, "checkpoint": {"taskId": "daily-plan"}, "pendingInterruptions": []}
        with patch.dict(os.environ, {"SHANGANYA_AUTOLOOP_ACCOUNT_ID": "user_test"}), \
             patch.object(gpt_harness.autoloop, "get_state", return_value=expected) as read:
            result = gpt_harness._tool("get_execution_state", {})
        self.assertTrue(result["ok"])
        self.assertEqual(result["state"], expected)
        read.assert_called_once_with("user_test", limit=100)

    def test_interruption_requires_existing_checkpoint(self):
        with patch.object(gpt_harness.autoloop, "get_state", return_value={"checkpoint": None}):
            result = gpt_harness._tool("record_interruption", {
                "note": "临时突发任务", "currentTaskId": "task-1", "progress": "已完成一半"
            })
        self.assertFalse(result["ok"])
        self.assertIn("未写入空白快照", result["error"])

    def test_interruption_records_checkpoint_without_rescheduling(self):
        state = {"checkpoint": {"taskId": "daily-plan", "snapshot": {"tasks": [{"id": "task-1"}]}}}
        with patch.object(gpt_harness.autoloop, "get_state", return_value=state), \
             patch.object(gpt_harness.autoloop, "interrupt", return_value={"ok": True, "revision": 2}) as save:
            result = gpt_harness._tool("record_interruption", {
                "note": "紧急电话", "currentTaskId": "task-1", "progress": "已完成第一步"
            })
        self.assertTrue(result["ok"])
        self.assertIn("日程未自动改写", result["note"])
        self.assertEqual(save.call_args.kwargs if save.call_args.kwargs else save.call_args.args[0]["taskId"], "daily-plan")

    def test_resume_requires_pending_interruption(self):
        with patch.object(gpt_harness.autoloop, "get_state", return_value={"pendingInterruptions": []}):
            result = gpt_harness._tool("resume_interruption", {"note": "我回来了"})
        self.assertFalse(result["ok"])
        self.assertIn("没有未解决的中断", result["error"])

    def test_rate_limit_is_enforced(self):
        client = "rate-test-client"
        with gpt_harness._RATE_LOCK:
            gpt_harness._RATE.pop(client, None)
        for _ in range(gpt_harness._RATE_LIMIT):
            gpt_harness._rate_limit(client)
        with self.assertRaises(RescueError) as caught:
            gpt_harness._rate_limit(client)
        self.assertEqual(caught.exception.code, "RATE_LIMIT")


if __name__ == "__main__":
    unittest.main()
