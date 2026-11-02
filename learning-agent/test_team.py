import copy, json, tempfile, threading, unittest
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from unittest.mock import patch
import learning_agent as agent
import team_orchestrator as team
from learning_agent_server import Handler, ThreadingHTTPServer

class TeamTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.db=patch.object(agent,'DB',self.tmp.name+'/team.sqlite3');self.db.start()
        self.p=team.create({'goal':'测试三人交接','mode':'demo'})
    def tearDown(self):self.db.stop();self.tmp.cleanup()
    def ctx(self):return {'project_id':self.p['project_id'],'expected_version':self.p['version']}
    def planned(self):
        self.p=team.demo(self.ctx());self.p=team.apply({**self.ctx(),'proposal_id':self.p['proposal']['id']})
    def feedback(self,action,**extra):
        self.p=team.feedback({**self.ctx(),'task_id':'T1','expected_plan_version':1,'action':action,'note':'检查记录',**extra})
    def test_handoff_preview_persistence(self):
        self.p=team.demo(self.ctx());self.assertIsNone(self.p['plan'])
        self.assertEqual(self.p['proposal']['plan']['tasks'][0]['gap_ids'],[self.p['diagnosis']['gaps'][0]['gap_id']])
        self.assertFalse(team.state(self.p['project_id'])['live_verified'])
        self.p=team.apply({**self.ctx(),'proposal_id':self.p['proposal']['id']})
        self.assertEqual(len(team.state(self.p['project_id'])['history']),4)
    def test_review_and_artifact_versions(self):
        self.planned()
        with self.assertRaises(ValueError):self.feedback('approve',reviewer_id='A')
        self.feedback('start');self.feedback('submit',artifact_id='report',artifact_version=2,actual_minutes=8,evidence='初稿')
        self.assertEqual(self.p['plan']['tasks'][0]['status'],'pending_review')
        self.feedback('reject',reviewer_id='A');self.feedback('submit',artifact_id='report',artifact_version=3,actual_minutes=4,evidence='修订')
        self.feedback('approve',reviewer_id='A');self.assertEqual(self.p['plan']['tasks'][0]['review']['artifact_version'],3)
        self.assertEqual(self.p['plan']['tasks'][0]['status'],'completed')
    def test_concurrent_writes(self):
        self.planned();old=self.ctx()
        def run(_):
            try:return team.feedback({**old,'task_id':'T1','expected_plan_version':1,'action':'change','note':'临时安排'})
            except team.Conflict:return None
        with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(run,range(2)))
        self.assertEqual(sum(x is not None for x in results),1)
    def test_diagnosis_invalidates_without_losing_progress(self):
        self.planned();self.feedback('start');d=copy.deepcopy(self.p['diagnosis']);d['diagnosis_version']=2
        self.p=team.diagnosis({**self.ctx(),'diagnosis':d});self.assertTrue(self.p['plan_stale'])
        self.assertEqual(self.p['plan']['tasks'][0]['status'],'in_progress')
        with self.assertRaises(team.Conflict):self.feedback('block')
    def test_replan_guards(self):
        self.planned();self.feedback('start');plan=copy.deepcopy(self.p['plan']);plan['plan_version']=2;plan['tasks'][0]['steps']=['覆盖']
        with self.assertRaisesRegex(ValueError,'覆盖'):team.propose({**self.ctx(),'plan':plan,'reason':'重排'})
        with self.assertRaisesRegex(ValueError,'锁定'):team.protected({'tasks':[],'time_blocks':[{'locked':True}]},{'tasks':[],'time_blocks':[]})
    def test_sources_cycles_overlap(self):
        self.planned();d=copy.deepcopy(self.p['diagnosis']);d['gaps'][0]['source_refs']=['fake']
        with self.assertRaisesRegex(ValueError,'来源'):team.validate_diagnosis(d)
        plan=copy.deepcopy(self.p['plan']);plan['tasks'][0]['depends_on']=['T1']
        with self.assertRaisesRegex(ValueError,'循环'):team.validate_plan(plan,self.p['diagnosis'])
        plan=copy.deepcopy(self.p['plan']);slot={'task_id':'T1','member_id':'captain','start':'2026-10-09T10:00:00+08:00','end':'2026-10-09T11:00:00+08:00'};plan['time_blocks']=[slot,slot]
        with self.assertRaisesRegex(ValueError,'重叠'):team.validate_plan(plan,self.p['diagnosis'])
    def test_live_cannot_use_demo(self):
        self.p=team.create({'goal':'真实目标','mode':'live'})
        with self.assertRaisesRegex(ValueError,'Demo'):team.demo(self.ctx())
    def test_planner_failure_retains_A(self):
        d=team.demo(self.ctx())['diagnosis'];self.p=team.create({'goal':'失败测试'})
        def fail(*_):raise RuntimeError('B 不可用')
        with self.assertRaises(RuntimeError):team.run_handoff(self.ctx(),lambda p:d,fail)
        saved=team.state(self.p['project_id']);self.assertEqual(saved['diagnosis']['diagnosis_version'],1);self.assertIsNone(saved['plan'])
    def test_http(self):
        server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();base=f'http://127.0.0.1:{server.server_port}'
        def post(data,origin=None):
            headers={'Content-Type':'application/json'}
            if origin:headers['Origin']=origin
            return urlopen(Request(base+'/api/agent/team/demo',data=json.dumps(data).encode(),headers=headers))
        try:
            self.assertIn('三人协作',urlopen(base+'/team.html').read().decode())
            self.assertEqual(len(json.load(urlopen(base+'/api/agent/team'))['projects']),1)
            with self.assertRaises(HTTPError) as error:post({**self.ctx(),'expected_version':0})
            self.assertEqual(error.exception.code,409)
            with self.assertRaises(HTTPError) as error:post(self.ctx(),'https://untrusted.example')
            self.assertEqual(error.exception.code,403)
            self.assertIsNotNone(json.load(post(self.ctx()))['proposal'])
        finally:server.shutdown();server.server_close();thread.join()

if __name__=='__main__':unittest.main()
