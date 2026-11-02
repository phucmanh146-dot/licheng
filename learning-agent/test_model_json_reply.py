import unittest
import learning_agent as agent
import rescue_service as rescue

class ModelJsonReplyTests(unittest.TestCase):
    def test_plain_json_object(self):
        self.assertEqual(agent.json_reply('{"ok":true}'), {"ok": True})
    def test_complete_json_markdown_fence(self):
        self.assertEqual(agent.json_reply("```json\n{\"ok\":true}\n```"), {"ok": True})
    def test_fenced_json_with_surrounding_whitespace(self):
        self.assertEqual(agent.json_reply("  ```\n{\"n\":2}\n```  "), {"n": 2})
    def test_accepts_short_json_preamble(self):
        self.assertEqual(agent.json_reply('JSON result:\n{"ok":true}'), {"ok": True})

    def test_accepts_json_with_closing_fence_only(self):
        self.assertEqual(agent.json_reply('{"ok":true}\n```'), {"ok": True})

    def test_rejects_trailing_prose(self):
        with self.assertRaises(ValueError): agent.json_reply('{"ok":true} trailing text')
    def test_rejects_unclosed_fence(self):
        with self.assertRaises(ValueError): agent.json_reply("```json\n{\"ok\":true}")
    def test_rejects_non_object_json(self):
        with self.assertRaises(ValueError): agent.json_reply("```json\n[]\n```")

if __name__ == '__main__': unittest.main()

class ModelActionNormalizationTests(unittest.TestCase):
    def test_complete_task_payload_can_be_normalized(self):
        obj = {"action":"plan", "tasks":[{"id":"T1"}]}
        result = agent.normalize_model_action(obj)
        self.assertEqual(result['action'], 'finish')
        self.assertEqual(result['_action_normalized_from'], 'plan')
    def test_unknown_action_without_tasks_is_not_normalized(self):
        obj = {"action":"execute", "query":"search this"}
        self.assertEqual(agent.normalize_model_action(obj), obj)

class ModelRequestTimeoutTests(unittest.TestCase):
    def test_local_gateway_gets_longer_timeout(self):
        self.assertEqual(rescue.model_request_timeout({'base':'http://127.0.0.1:8642/v1'}, True), 180)
    def test_remote_provider_keeps_bounded_timeout(self):
        self.assertEqual(rescue.model_request_timeout({'base':'https://api.example.com/v1'}, True), 90)
    def test_timeout_environment_override_is_clamped(self):
        import os
        old = os.environ.get('SHANGAN_MODEL_TIMEOUT_SECONDS')
        try:
            os.environ['SHANGAN_MODEL_TIMEOUT_SECONDS'] = '999'
            self.assertEqual(rescue.model_request_timeout({'base':'http://localhost:8642/v1'}, True), 300)
        finally:
            if old is None: os.environ.pop('SHANGAN_MODEL_TIMEOUT_SECONDS', None)
            else: os.environ['SHANGAN_MODEL_TIMEOUT_SECONDS'] = old

class ModelOutputBudgetTests(unittest.TestCase):
    def test_local_model_gets_larger_output_budget(self):
        self.assertEqual(rescue.model_output_limit({'base':'http://127.0.0.1:8642/v1'}), 8192)
    def test_remote_model_budget_is_bounded(self):
        self.assertEqual(rescue.model_output_limit({'base':'https://api.example.com/v1'}), 4096)

class ModelJsonModeTests(unittest.TestCase):
    def test_json_mode_is_enabled_for_local_gateway(self):
        import os
        old = os.environ.get('SHANGAN_MODEL_JSON_MODE')
        try:
            os.environ.pop('SHANGAN_MODEL_JSON_MODE', None)
            self.assertTrue(rescue.model_json_mode({'base':'http://127.0.0.1:8642/v1'}))
            self.assertFalse(rescue.model_json_mode({'base':'https://api.example.com/v1'}))
        finally:
            if old is None: os.environ.pop('SHANGAN_MODEL_JSON_MODE', None)
            else: os.environ['SHANGAN_MODEL_JSON_MODE'] = old
