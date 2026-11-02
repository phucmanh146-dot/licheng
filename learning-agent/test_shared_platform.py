"""Synthetic model, real HTTP/SQLite/LangGraph. No LIVE or human quality claim."""
import json
import time
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
import test_general_loop as fixtures
import learning_agent as agent
import platform_store as store
import shared_api
import research_graph
import team_orchestrator as team


class SharedPlatformTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.GeneralLoopTests('test_rag_preview_uses_existing_model_and_citation_gate')
        self.fixture.setUp(); self.fixture.setup_inputs(); self.p = self.fixture.p
        store.init()
        self.uid = store.add_user('test-owner', 'synthetic-password-123')
        store.member(self.p['project_id'],self.uid,'owner')
        self.client = TestClient(shared_api.app); self.client.__enter__()
        response = self.client.post('/api/v1/login',json={'name':'test-owner','password':'synthetic-password-123'})
        self.assertEqual(response.status_code,200)
        self.headers = {'X-CSRF-Token':response.json()['csrf']}

    def tearDown(self):
        self.client.__exit__(None,None,None); self.fixture.tearDown()

    def test_acl_csrf_and_version(self):
        other = team.create({'goal':'private-other','mode':'live'})
        self.assertEqual(self.client.get('/api/v1/projects/'+other['project_id']).status_code,403)
        self.assertEqual(self.client.post('/api/v1/projects',json={'goal':'blocked'}).status_code,403)
        r = self.client.post('/api/v1/projects/'+self.p['project_id']+'/operations/context',headers=self.headers,json={'expected_version':0})
        self.assertEqual(r.status_code,409)

    def test_durable_idempotency_and_cancellation(self):
        key = 'test-idempotency-key'
        rid = store.enqueue(self.p,self.uid,key,'有效分母')
        self.assertEqual(rid,store.enqueue(self.p,self.uid,key,'有效分母'))
        with self.assertRaises(team.Conflict):store.enqueue(self.p,self.uid,key,'另一个问题')
        store.cancel(rid); self.assertEqual(store.get_run(rid)['status'],'cancelled')
        self.assertIsNone(store.claim())

    def test_fenced_lease_and_checkpoint_recovery(self):
        rid = store.enqueue(self.p,self.uid,'test-lease-key','有效分母')
        first = store.claim(); store.checkpoint(rid,first['lease_token'],'test',{'saved':True})
        with team.connection() as c:c.execute('UPDATE platform_runs SET lease_until=? WHERE id=?',(time.time()-1,rid))
        second = store.claim(); self.assertNotEqual(first['lease_token'],second['lease_token'])
        with self.assertRaises(RuntimeError):store.checkpoint(rid,first['lease_token'],'bad',{})
        self.assertEqual(store.cached_node(rid,'test'),{'saved':True})

    def test_langgraph_preview_atomic_accept_and_stale_version(self):
        rid = store.enqueue(self.p,self.uid,'test-graph-key','有效分母')
        with self.fixture.model_context(fixtures.diagnosis_reply(self.p)):
            research_graph.execute(store.claim())
        run = store.get_run(rid)
        self.assertEqual(run['status'],'awaiting_confirmation',run)
        self.assertEqual(team.state(self.p['project_id'])['version'],self.p['version'])
        response = self.client.post('/api/v1/runs/'+rid+'/accept',headers=self.headers,json={'confirmed':True,'expected_version':self.p['version']})
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['version'],self.p['version']+1)
        self.assertIsNone(response.json()['plan'])
        self.assertIsNotNone(response.json()['proposal'])
        repeat = self.client.post('/api/v1/runs/'+rid+'/accept',headers=self.headers,json={'confirmed':True,'expected_version':self.p['version']})
        self.assertEqual(repeat.json()['version'],response.json()['version'])

    def test_model_unavailable_is_failure_not_demo(self):
        rid = store.enqueue(self.p,self.uid,'test-failure-key','有效分母')
        with patch.object(research_graph.team_ai.rescue,'public_config',return_value={'configured':False}):
            research_graph.execute(store.claim())
        self.assertEqual(store.get_run(rid)['status'],'failed')
        self.assertEqual(store.get_run(rid)['error'],'CONFIG_REQUIRED')

    def test_revoked_session(self):
        self.assertEqual(self.client.post('/api/v1/logout',headers=self.headers,json={}).status_code,200)
        self.assertEqual(self.client.get('/api/v1/projects').status_code,403)


if __name__ == '__main__':unittest.main()
