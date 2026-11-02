import json,threading,unittest,urllib.request,urllib.error
from learning_agent_server import Handler,ThreadingHTTPServer
import test_action_planner

class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        threading.Thread(target=cls.server.serve_forever,daemon=True).start()
        cls.base='http://127.0.0.1:'+str(cls.server.server_port)
    @classmethod
    def tearDownClass(cls):cls.server.shutdown();cls.server.server_close()
    def setUp(self):
        f=test_action_planner.PlannerTests();f.setUp();self.d=f.d;self.p=f.p
    def post(self,path,data):
        req=urllib.request.Request(self.base+'/api/agent/planner/'+path,data=json.dumps(data).encode(),headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(req) as r:return json.load(r)
    def test_generate_and_assets(self):
        p=self.post('generate',{'diagnosis':self.d,'context':{'deadline':'2030-01-02'}})
        self.assertEqual(len(p['tasks']),1)
        for path in ('/planner.html','/planner.js'):
            with urllib.request.urlopen(self.base+path) as r:self.assertEqual(r.status,200)
    def test_edit(self):
        p=self.post('edit',{'diagnosis':self.d,'plan':self.p,'task_id':'g:deliver','patch':{'title':'新标题'},'expected_plan_version':1})
        self.assertEqual(p['tasks'][0]['title'],'新标题')
    def test_feedback(self):
        p=self.post('feedback',{'diagnosis':self.d,'plan':self.p,'task_id':'g:deliver','actual_minutes':70,'remaining_minutes':0,'expected_plan_version':1})
        self.assertEqual(p['tasks'][0]['status'],'pending_review')
    def test_bad_import(self):
        self.p['tasks'][0]['source_refs']=[]
        with self.assertRaises(urllib.error.HTTPError) as e:self.post('validate',{'diagnosis':self.d,'plan':self.p})
        self.assertEqual(e.exception.code,400)
