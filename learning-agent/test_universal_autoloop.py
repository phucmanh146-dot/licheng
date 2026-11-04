"""Authenticated cross-conversation inbox tests; model execution is mocked."""
import unittest
import json
from unittest.mock import patch
import platform_store as store
import universal_autoloop
import test_general_loop as fixtures
import team_orchestrator as team


class UniversalAutoloopTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.GeneralLoopTests("test_rag_preview_uses_existing_model_and_citation_gate")
        self.fixture.setUp()
        self.fixture.setup_inputs()
        self.project = self.fixture.p
        store.init()
        universal_autoloop.init()
        self.user_id = store.add_user("autoloop-owner", "synthetic-password-123")
        store.member(self.project["project_id"], self.user_id, "owner")

    def tearDown(self):
        self.fixture.tearDown()

    def test_message_is_persisted_and_queued_with_project_context(self):
        payload = {"conversation_id":"chat-001","message_id":"msg-001",
                   "project_id":self.project["project_id"],
                   "content":"把上次的检索失败记录接上，先修复可自动处理的部分。"}
        with patch.object(universal_autoloop.store, "enqueue", return_value="run-001") as enqueue:
            result = universal_autoloop.ingest(self.user_id, payload)
        self.assertEqual(result["status"], "queued")
        self.assertEqual(result["run_id"], "run-001")
        self.assertEqual(enqueue.call_args.args[1], self.user_id)
        self.assertIn("不要要求用户重复提供", enqueue.call_args.args[3])
        thread = universal_autoloop.thread(self.user_id, "chat-001")
        self.assertEqual(len(thread["events"]), 1)
        self.assertEqual(thread["events"][0]["status"], "queued")

    def test_repeated_message_id_is_idempotent(self):
        payload = {"conversation_id":"chat-002","message_id":"msg-same",
                   "project_id":self.project["project_id"],"content":"继续上一次任务。"}
        with patch.object(universal_autoloop.store, "enqueue", return_value="run-002") as enqueue:
            first = universal_autoloop.ingest(self.user_id, payload)
            second = universal_autoloop.ingest(self.user_id, payload)
        self.assertEqual(first["event_id"], second["event_id"])
        self.assertTrue(second["duplicate"])
        self.assertEqual(enqueue.call_count, 1)

    def test_cross_user_project_access_is_rejected(self):
        other = store.add_user("autoloop-other", "synthetic-password-456")
        payload = {"conversation_id":"private-chat","message_id":"private-msg",
                   "project_id":self.project["project_id"],"content":"读取这个项目。"}
        with self.assertRaises(PermissionError):
            universal_autoloop.ingest(other, payload)

    def test_outbox_sweeper_recovers_message_after_enqueue_crash(self):
        payload = {"conversation_id":"crash-chat","message_id":"crash-msg",
                   "project_id":self.project["project_id"],"content":"不要丢掉这条灵感。"}
        with patch.object(universal_autoloop.store, "enqueue", side_effect=RuntimeError("simulated crash")):
            with self.assertRaises(RuntimeError):
                universal_autoloop.ingest(self.user_id, payload)
        with patch.object(universal_autoloop.store, "enqueue", return_value="recovered-run") as enqueue:
            recovered = universal_autoloop.dispatch_pending()
        self.assertEqual(recovered[0]["run_id"], "recovered-run")
        self.assertEqual(enqueue.call_count, 1)
        thread = universal_autoloop.thread(self.user_id, "crash-chat")
        self.assertEqual(thread["events"][0]["status"], "queued")

    def test_ambiguous_thread_can_be_bound_and_dispatched(self):
        second = team.create({"goal":"另一个独立项目","mode":"live"})
        store.member(second["project_id"], self.user_id, "owner")
        payload = {"conversation_id":"bind-chat","message_id":"bind-msg",
                   "content":"把这个想法接到我正在做的项目。"}
        saved = universal_autoloop.ingest(self.user_id, payload)
        self.assertEqual(saved["status"], "needs_project")
        with patch.object(universal_autoloop.store, "enqueue", return_value="bound-run"):
            bound = universal_autoloop.bind_thread(self.user_id, "bind-chat", self.project["project_id"])
        self.assertEqual(bound["queued"], 1)
        self.assertEqual(bound["events"][0]["run_id"], "bound-run")
    def test_previous_run_results_are_reused_across_conversations(self):
        run_id = store.enqueue(self.project, self.user_id, "prior-run-key-001", "上次任务诊断")
        with team.connection() as c:
            c.execute(
                "UPDATE platform_runs SET status='succeeded',result=? WHERE id=?",
                (json.dumps({"auto_adopted": True,
                             "diagnosis": {"gaps": [{"current_evidence": "缺少验收截图"}],
                                           "unknowns": ["尚未核对原始文件"]},
                             "plan": {"tasks": [{"title": "补充截图", "status": "todo"}],
                                      "unscheduled": []}}, ensure_ascii=False), run_id))
        history = universal_autoloop._project_context(self.user_id, self.project["project_id"], "new-event")
        prior = [item for item in history if item["type"] == "previous_run"]
        self.assertTrue(prior)
        self.assertIn("缺少验收截图", prior[-1]["content"])
        self.assertIn(run_id, prior[-1]["content"])


    def test_active_recovery_checkpoint_is_reused_across_conversations_without_reupload(self):
        checkpoint = {
            "checkpoint_id": "checkpoint-1", "task_id": "task-1", "action_id": "step-2",
            "status": "paused", "reason": "interrupted", "note": "临时事情打断",
            "done_note": "已完成前两步", "next_action": "继续核对第二页表格",
            "location": "report.pdf page 2", "condition": {"kind": "manual", "description": "回来后继续"},
            "check_after": None, "input_version": {"artifact_id": "brief", "artifact_version": 2},
        }
        project = {**self.project, "recovery": {"checkpoints": [checkpoint]}}
        packet = {
            "task_id": "task-1", "action_id": "step-2", "step": {
                "step_id": "step-2", "action": "核对第二页表格",
                "reason": "保留上次动作", "expected_change": "补齐表格",
                "target_locator": "page:2", "output": "更新报告",
                "self_check": "回看原文", "failure_next": "记录差异",
                "input_version": {"artifact_id": "brief", "artifact_version": 2},
            },
            "previous_attempts": [{"action": "核对第一页", "observed": "已完成",
                                   "reported_outcome": "succeeded", "actual_minutes": 12}],
            "retrieved_material": {"artifact_id": "brief", "artifact_version": 2,
                                   "sha256": "sha-2", "units": [
                                       {"locator": "page:2", "text": "原文片段"}]},
            "earlier_attempt_count": 0, "historical_attempt_count": 0,
        }
        with (
            patch.object(universal_autoloop.team, "state", return_value=project),
            patch.object(universal_autoloop.team_recovery, "stale", return_value=False),
            patch.object(universal_autoloop.team_recovery, "context_packet", return_value=packet),
        ):
            history = universal_autoloop._project_context(
                self.user_id, self.project["project_id"], "new-event")
        active = next(item for item in history if item["type"] == "active_recovery_checkpoint")
        self.assertIn("继续核对第二页表格", active["content"])
        self.assertIn("brief", active["content"])
        self.assertIn("sha-2", active["content"])
        self.assertIn("step-2", active["content"])

    def test_missing_project_is_saved_without_guessing(self):
        second = team.create({"goal":"另一个独立项目","mode":"live"})
        store.member(second["project_id"], self.user_id, "owner")
        payload = {"conversation_id":"ambiguous-chat","message_id":"ambiguous-msg",
                   "content":"把这个想法接到我的项目里。"}
        result = universal_autoloop.ingest(self.user_id, payload)
        self.assertEqual(result["status"], "needs_project")
        thread = universal_autoloop.thread(self.user_id, "ambiguous-chat")
        self.assertEqual(thread["events"][0]["status"], "needs_project")


if __name__ == "__main__":
    unittest.main()
