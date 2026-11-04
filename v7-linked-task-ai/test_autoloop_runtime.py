import tempfile
import os
import subprocess
import sys
import unittest
from contextlib import closing
from pathlib import Path
import autoloop_runtime as a

class AutoloopRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        a.DB_PATH = Path(self.tmp.name) / "autoloop-test.sqlite3"

    def tearDown(self):
        self.tmp.cleanup()

    def test_interrupt_is_idempotent_and_restores_checkpoint(self):
        payload = {"accountId":"user_a","taskId":"daily-plan","eventId":"interrupt-1",
                   "payload":{"title":"temporary class","eventId":"interrupt-1"},
                   "snapshot":{"tasks":[{"id":"t1","name":"accounting"}]}}
        first = a.interrupt(payload)
        second = a.interrupt(payload)
        self.assertTrue(first["ok"])
        self.assertFalse(first["duplicate"])
        self.assertTrue(second["duplicate"])
        state = a.get_state("user_a")
        self.assertEqual(state["checkpoint"]["snapshot"]["tasks"][0]["id"], "t1")
        self.assertEqual(len(state["pendingInterruptions"]), 1)

    def test_resume_clears_pending_interrupt_and_returns_snapshot(self):
        a.interrupt({"accountId":"user_a","taskId":"daily-plan","eventId":"i-2",
                     "payload":{"title":"meeting","eventId":"i-2"},"snapshot":{"activeTaskId":"t2"}})
        result = a.resume({"accountId":"user_a","taskId":"daily-plan","eventId":"resume-2",
                           "interruptionEventId":"i-2"})
        self.assertTrue(result["ok"])
        self.assertEqual(result["snapshot"]["activeTaskId"], "t2")
        self.assertEqual(a.get_state("user_a")["pendingInterruptions"], [])

    def test_accounts_are_isolated(self):
        a.append_event({"accountId":"user_a","eventId":"same","eventType":"plan.snapshot","payload":{"x":1}})
        a.append_event({"accountId":"user_b","eventId":"same","eventType":"plan.snapshot","payload":{"x":2}})
        self.assertEqual(a.get_state("user_a")["events"][0]["payload"]["x"], 1)
        self.assertEqual(a.get_state("user_b")["events"][0]["payload"]["x"], 2)

    def test_ledger_is_append_only(self):
        a.append_event({"accountId":"user_a","eventId":"e1","eventType":"plan.snapshot","payload":{}})
        with closing(a._db()) as conn:
            with self.assertRaises(Exception):
                conn.execute("UPDATE autoloop_events SET event_type='x' WHERE event_id='e1'")
            with self.assertRaises(Exception):
                conn.execute("DELETE FROM autoloop_events WHERE event_id='e1'")

    def test_agent_hop_limit_is_eight(self):
        a.append_event({"accountId":"user_a","eventId":"hop-8","eventType":"agent.woken","payload":{"hop":8}})
        with self.assertRaises(a.AutoloopError):
            a.append_event({"accountId":"user_a","eventId":"hop-9","eventType":"agent.woken","payload":{"hop":9}})

    def test_railway_account_volume_is_used_for_durable_database(self):
        env = os.environ.copy()
        env.pop("SHANGANYA_SESSION_HOME", None)
        env.pop("SHANGANYA_AUTOLOOP_HOME", None)
        with tempfile.TemporaryDirectory() as folder:
            env["SHANGANYA_ACCOUNT_DATA_DIR"] = folder
            code = "import autoloop_runtime as a; print(a.DB_PATH)"
            result = subprocess.check_output([sys.executable, "-c", code], cwd=str(Path(__file__).parent), env=env, text=True).strip()
            self.assertEqual(Path(result), Path(folder) / "autoloop.sqlite3")

    def test_new_workflow_events_are_durable(self):
        result = a.append_event({"accountId":"user_a","eventId":"pool-1",
                                 "eventType":"task.pool.changed",
                                 "payload":{"taskId":"t1","from":"scheduled","to":"buffer"}})
        self.assertTrue(result["ok"])
        self.assertEqual(a.get_state("user_a")["events"][0]["eventType"], "task.pool.changed")

    def test_unknown_event_type_rejected(self):
        with self.assertRaises(a.AutoloopError):
            a.append_event({"accountId":"user_a","eventId":"e2","eventType":"unknown.command","payload":{}})

if __name__ == "__main__":
    unittest.main()
