""""Synthetic model, real HTTP/SQLite/LangGraph. No LIVE or human quality claim."""
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

    def test_complete_authenticated_v1_v2_review_recovery_loop(self):
        """Two test accounts, synthetic material/model, real API and domain state."""
        import base64
        import uuid
        p = self.client.post('/api/v1/projects',headers=self.headers,json={'goal':'SYNTHETIC 完整API闭环：核查有效分母'}).json()
        def change(client, headers, name, data):
            nonlocal p
            response = client.post('/api/v1/projects/'+p['project_id']+'/operations/'+name,
                                   headers=headers,json={**data,'expected_version':p['version'],**({'expected_plan_version':p['plan']['plan_version']} if p.get('plan') else {})})
            self.assertEqual(response.status_code,200,(name,response.text))
            p = response.json()
            return p
        change(self.client,self.headers,'context',{'project_context':{'project_type':'research',
            'target_result':'可复查的报告','acceptance_criteria':['写明有效分母和缺失人数'],'deadline':''}})
        change(self.client,self.headers,'member',{'member':{'owned_task':'核对人数口径',
            'understanding':'缺失不是0，分母要能回查','tools':'文本编辑器','self_reported_capabilities':[]}})
        reviewer_id = store.add_user('test-reviewer','synthetic-reviewer-123')
        store.member(p['project_id'],reviewer_id,'reviewer')
        with TestClient(shared_api.app) as reviewer:
            logged = reviewer.post('/api/v1/login',json={'name':'test-reviewer','password':'synthetic-reviewer-123'}).json()
            rh = {'X-CSRF-Token':logged['csrf']}
            change(reviewer,rh,'member',{'member':{'owned_task':'独立核对原文与新版','understanding':'测试账号，不代表真人验收',
                'tools':'文本编辑器','self_reported_capabilities':[]}})
            def upload(text,purpose):
                change(self.client,self.headers,'artifact-import',{'artifact_id':'report','filename':'fixture.txt',
                    'purpose':purpose,'kind':'user_material','data_base64':base64.b64encode(text.encode()).decode()})
            upload('人数=3；有效分母未知','input')
            submitted = self.client.post('/api/v1/projects/'+p['project_id']+'/runs',headers={**self.headers,'Idempotency-Key':uuid.uuid4().hex},
                json={'query':'有效分母','expected_version':p['version']})
            self.assertEqual(submitted.status_code,202,submitted.text)
            rid = submitted.json()['run_id']
            # Input import also emits an Autoloop signal. Isolate this test's
            # explicit run so store.claim() cannot consume the earlier side event.
            with team.connection() as c:
                c.execute(
                    "UPDATE platform_runs SET status='cancelled' WHERE project_id=? AND user_id=? AND status='queued' AND id<>?",
                    (p['project_id'], self.uid, rid))
            import os
            if os.getenv('SHANGAN_LIVE_CLOSED_LOOP') == '1':
                from hermes_gateway import connect_local_gateway
                self.assertTrue(connect_local_gateway(), 'LIVE gateway unavailable')
                research_graph.execute(store.claim())
            else:
                with self.fixture.model_context(fixtures.diagnosis_reply(p)):
                    research_graph.execute(store.claim())
            self.assertEqual(store.get_run(rid)['status'],'awaiting_confirmation',store.get_run(rid))
            accepted=self.client.post('/api/v1/runs/'+rid+'/accept',headers=self.headers,json={'confirmed':True,'expected_version':p['version']})
            self.assertEqual(accepted.status_code,200,accepted.text);p=accepted.json()
            change(self.client,self.headers,'apply',{'proposal_id':p['proposal']['id']})
            task=next(t for t in p['plan']['tasks'] if t.get('kind')=='production')
            tid=task['task_id']
            def feedback(client,headers,action,**extra):
                return change(client,headers,'feedback',{'task_id':tid,'expected_plan_version':p['plan']['plan_version'],
                    'action':action,'note':'SYNTHETIC API验收记录',**extra})
            feedback(self.client,self.headers,'start')
            change(self.client,self.headers,'recovery-pause',{'task_id':tid,'action_id':task['micro_steps'][0]['step_id'],
                'reason':'blocked','note':'测试中断','done_note':'已定位原文','next_action':'填写人数口径','location':'line:1',
                'condition':{'kind':'manual','description':'测试执行者确认后返回'}})
            checkpoint=p['recovery']['checkpoints'][-1]
            change(self.client,self.headers,'recovery-resume',{'checkpoint_id':checkpoint['checkpoint_id'],'note':'测试恢复'})
            upload('有效分母=2；缺失人数=1','submission')
            feedback(self.client,self.headers,'submit',artifact_id='report',artifact_version=2,actual_minutes=8,evidence='SYNTHETIC 新版line:1')
            own_review=self.client.post('/api/v1/projects/'+p['project_id']+'/operations/feedback',headers=self.headers,
                json={'expected_version':p['version'],'expected_plan_version':p['plan']['plan_version'],'task_id':tid,'action':'approve',
                      'note':'不应自评通过','criterion_results':[]})
            self.assertEqual(own_review.status_code,400,own_review.text)
            ref={'artifact_id':'report','artifact_version':2,'locator':'line:1','quote':'有效分母=2；缺失人数=1'}
            rows=[{'criterion':c,'passed':True,'evidence':'SYNTHETIC 原文逐项核对','evidence_refs':[ref]} for c in task['acceptance_criteria']]
            review_id=uuid.uuid4().hex
            review={'review_id':review_id,'task_id':tid,'plan_version':p['plan']['plan_version'],
                'diagnosis_version':p['diagnosis']['diagnosis_version'],'artifact_id':'report','artifact_version':2,
                'method':'manual','content_read_confirmed':True,
                'note':'测试复核账号逐项核对','criterion_results':rows,
                'gap_results':[{'gap_id':g,'status':'closed','evidence':'SYNTHETIC 已核对新版','evidence_refs':[ref]} for g in task['gap_ids']]}
            change(reviewer,rh,'review-receive',{'review':review})
            feedback(reviewer,rh,'approve',criterion_results=rows)
            change(reviewer,rh,'advance-review',{'review_id':review_id})
            self.assertTrue(p['diagnosis']['resolution_confirmed'])
            self.assertIn(review_id,p['applied_review_ids'])
            self.assertEqual(next(t for t in p['plan']['tasks'] if t['task_id']==tid)['status'],'completed')
            original=self.client.get('/api/v1/projects/'+p['project_id']+'/artifacts/report/1').json()
            self.assertEqual(original['units'][0]['text'],'人数=3；有效分母未知')


if __name__ == '__main__':unittest.main()
