"""HTTP boundary test for the authenticated universal Autoloop ingress."""
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient

import platform_store as store
import shared_api
import test_general_loop as fixtures


class UniversalAutoloopApiTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.GeneralLoopTests("test_rag_preview_uses_existing_model_and_citation_gate")
        self.fixture.setUp()
        self.fixture.setup_inputs()
        self.project = self.fixture.p
        store.init()
        self.user_id = store.add_user("autoloop-api-owner", "synthetic-password-789")
        store.member(self.project["project_id"], self.user_id, "owner")
        self.client = TestClient(shared_api.app)
        self.client.__enter__()
        login = self.client.post("/api/v1/login", json={
            "name":"autoloop-api-owner", "password":"synthetic-password-789"})
        self.assertEqual(login.status_code, 200, login.text)
        self.headers = {"X-CSRF-Token":login.json()["csrf"]}

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.fixture.tearDown()

    def test_authenticated_message_enters_universal_queue(self):
        payload = {"conversation_id":"api-chat","message_id":"api-msg",
                   "project_id":self.project["project_id"],"content":"继续推进我上次的任务。"}
        with patch("universal_autoloop.store.enqueue", return_value="api-run") as enqueue:
            response = self.client.post("/api/v1/autoloop/events", headers=self.headers, json=payload)
        self.assertEqual(response.status_code, 202, response.text)
        self.assertEqual(response.json()["run_id"], "api-run")
        self.assertEqual(enqueue.call_args.args[1], self.user_id)
        thread = self.client.get("/api/v1/autoloop/threads/api-chat")
        self.assertEqual(thread.status_code, 200, thread.text)
        self.assertEqual(len(thread.json()["events"]), 1)

    def test_ingress_rejects_missing_session_and_csrf(self):
        payload = {"conversation_id":"unauth","message_id":"unauth-msg",
                   "project_id":self.project["project_id"],"content":"执行"}
        with TestClient(shared_api.app) as anonymous:
            response = anonymous.post("/api/v1/autoloop/events", json=payload)
        self.assertEqual(response.status_code, 403)
        response = self.client.post("/api/v1/autoloop/events", json=payload)
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
