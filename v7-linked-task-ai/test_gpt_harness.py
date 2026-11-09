import os
import unittest
from unittest.mock import patch

import gpt_harness
from rescue_service import RescueError


class GPT ჰarnessTests(unittest.TestCase):
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
