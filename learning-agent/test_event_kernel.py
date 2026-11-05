import unittest
from unittest.mock import patch
import event_kernel
import team_orchestrator as team


class EventKernelTests(unittest.TestCase):
    def setUp(self):
        self.project = {
            "project_id": "project-1",
            "version": 4,
            "mode": "live",
        }
        self.payload = {
            "project_id": "project-1",
            "expected_version": 4,
            "event_type": "user_signal",
            "query": "根据当前项目材料诊断缺口并生成下一步行动",
            "payload": {"channel": "workbench"},
        }

    @patch.object(event_kernel.platform_store, "enqueue", return_value="run-123")
    @patch.object(event_kernel.team, "state")
    def test_submit_queues_existing_live_project(self, state, enqueue):
        state.return_value = self.project
        result = event_kernel.submit(self.payload)
        self.assertTrue(result["accepted"])
        self.assertEqual(result["run_id"], "run-123")
        args, kwargs = enqueue.call_args
        self.assertEqual(args[0]["project_id"], "project-1")
        self.assertEqual(args[1], "local-agent")
        self.assertEqual(args[3], self.payload["query"])
        self.assertTrue(kwargs["metadata"]["auto_advance"])
        self.assertEqual(kwargs["metadata"]["event_type"], "user_signal")

    @patch.object(event_kernel.platform_store, "enqueue", return_value="run-123")
    @patch.object(event_kernel.team, "state")
    def test_same_signal_has_stable_idempotency_key(self, state, enqueue):
        state.return_value = self.project
        first = event_kernel.submit(self.payload)
        second = event_kernel.submit(self.payload)
        self.assertEqual(first["event_id"], second["event_id"])
        self.assertEqual(enqueue.call_args_list[0].args[2], enqueue.call_args_list[1].args[2])

    @patch.object(event_kernel.team, "state")
    def test_rejects_demo_project(self, state):
        state.return_value = {**self.project, "mode": "demo"}
        with self.assertRaisesRegex(ValueError, "live 项目"):
            event_kernel.submit(self.payload)

    @patch.object(event_kernel.team, "state")
    def test_rejects_stale_project_version(self, state):
        state.return_value = {**self.project, "version": 5}
        with self.assertRaises(team.Conflict):
            event_kernel.submit(self.payload)

    @patch.object(event_kernel.team, "state")
    def test_rejects_unknown_event_type(self, state):
        state.return_value = self.project
        data = {**self.payload, "event_type": "execute-arbitrary-code"}
        with self.assertRaisesRegex(ValueError, "不支持的事件类型"):
            event_kernel.submit(data)

    @patch.object(event_kernel.team, "state")
    def test_requires_query_and_valid_payload(self, state):
        state.return_value = self.project
        with self.assertRaises(ValueError):
            event_kernel.submit({k: v for k, v in self.payload.items() if k != "query"})
        with self.assertRaises(ValueError):
            event_kernel.submit({**self.payload, "payload": ["not", "an", "object"]})


if __name__ == "__main__":
    unittest.main()
