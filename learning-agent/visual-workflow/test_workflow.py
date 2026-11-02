"""Isolated HTTP engineering fixtures. These do not represent human trials."""
import base64,json,tempfile,threading,unittest,urllib.request,urllib.error
from pathlib import Path
from http.server import ThreadingHTTPServer
from server import Store,handler,initial,apply_event,HERE

class WorkflowTests(unittest.TestCase):
    def setUp(self):
        qa=HERE.parent/'workflow-qa';qa.mkdir(exist_ok=True)
        self.tmp=tempfile.TemporaryDirectory(dir=qa)
        self.root=Path(self.tmp.name).resolve();assert self.root.is_relative_to(qa.resolve())
        self.seed=json.loads((HERE/'data.json').read_text(encoding='utf-8'));self.store=Store(self.root/'state.sqlite3')
        self.http=ThreadingHTTPServer(('127.0.0.1',0),handler(self.root,self.store,self.seed,'test-token'))
        self.thread=threading.Thread(target=self.http.serve_forever,daemon=True);self.thread.start()
        self.base='http://127.0.0.1:'+str(self.http.server_port)
    def tearDown(self):
        self.http.shutdown();self.http.server_close();self.thread.join();self.tmp.cleanup()
    def call(self,path,body=None,token='test-token'):
        req=urllib.request.Request(self.base+path,data=json.dumps(body).encode() if body else None,
            headers={'Content-Type':'application/json','X-Workflow-Token':token})
        try:
            with urllib.request.urlopen(req) as r:return r.status,r.read(),dict(r.headers)
        except urllib.error.HTTPError as e:return e.code,e.read(),dict(e.headers)
    def event(self,event,payload,pid='JN',revision=None):
        return self.call('/api/event',{'project':pid,'expected_revision':self.store.get(pid)['revision'] if revision is None else revision,'event':event,'payload':payload})
    def prepare(self,pid='JN'):
        context={'goal':'SYNTHETIC：核对一行主张','materials':'SYNTHETIC fixture.txt','blocker':'不清楚核对哪一栏','executor':'test-executor','minutes':20,'deadline':'2026-11-01T16:00:00+08:00'}
        self.assertEqual(self.event('context',context,pid)[0],200)
        self.assertEqual(self.event('freeze',{'criteria':['一行可回查','缺证保持未知']},pid)[0],200)
        self.assertEqual(self.event('start',{'action':'把测试原句填入测试表第一行'},pid)[0],200)
    def upload(self,pid='JN'):
        body={'project':pid,'expected_revision':self.store.get(pid)['revision'],'filename':'SYNTHETIC-engineering-fixture.txt','data':base64.b64encode(b'SYNTHETIC ONLY - NOT HUMAN EVIDENCE').decode()}
        status,data,_=self.call('/api/upload',body);self.assertEqual(status,200);return json.loads(data)['upload']
    def submit(self,pid='JN'):
        u=self.upload(pid);self.assertEqual(self.event('submit',{'upload':u,'explanation':'SYNTHETIC test change','human_declaration':True},pid)[0],200);return u
    def test_upload_review_rework_and_persistence(self):
        self.prepare();u=self.submit()
        self.assertEqual(self.event('review',{'reviewer':' TEST-EXECUTOR ','checks':[{'passed':True,'note':'fixture'}]*2})[0],400)
        self.assertEqual(self.event('review',{'reviewer':'test-reviewer','checks':[{'passed':False,'note':'补第一项'},{'passed':True,'note':'核对第二项'}]})[0],200)
        self.assertEqual(self.store.get('JN')['stage'],'execute')
        self.submit();self.assertEqual(self.event('review',{'reviewer':'test-reviewer','checks':[{'passed':True,'note':'SYNTHETIC review'}]*2})[0],200)
        reloaded=Store(self.root/'state.sqlite3').get('JN');self.assertEqual(reloaded['stage'],'accepted')
        self.assertEqual(self.event('next',{})[0],200);self.assertEqual(len(self.store.get('JN')['cycles']),1)
        self.assertTrue(self.store.get('JN')['cycles'][0]['review']['passed'])
    def test_stale_write_cannot_overwrite_context(self):
        self.prepare();old=self.store.get('JN');self.assertEqual(self.event('blocked',{'category':'method','note':'SYNTHETIC step issue'},revision=0)[0],409)
        self.assertEqual(self.store.get('JN'),old)
    def test_project_and_uploaded_artifact_isolation(self):
        self.prepare('JN');u=self.upload('JN');self.prepare('XX')
        forged={**u,'project':'XX'}
        self.assertEqual(self.event('submit',{'upload':forged,'explanation':'SYNTHETIC','human_declaration':True},'XX')[0],400)
        self.assertEqual(self.store.get('XX')['stage'],'execute')
    def test_actual_uploaded_bytes_download_for_reviewer(self):
        self.prepare();u=self.submit();status,body,headers=self.call('/api/submission?project=JN&id='+u['id'])
        self.assertEqual(status,200);self.assertEqual(body,b'SYNTHETIC ONLY - NOT HUMAN EVIDENCE')
        self.assertIn('filename*=',headers['Content-Disposition'])
        self.assertEqual(self.call('/api/submission?project=XX&id='+u['id'])[0],404)
    def test_revised_standard_invalidates_old_submission(self):
        self.prepare();self.submit();self.assertEqual(self.event('freeze',{'criteria':['新的明确判据']})[0],200)
        self.assertEqual(self.store.get('JN')['submissions'],[])
        self.assertEqual(self.event('review',{'reviewer':'other','checks':[{'passed':True,'note':'old'}]})[0],400)
    def test_blocker_recovery_does_not_delay_deadline(self):
        self.prepare();deadline=self.store.get('JN')['context']['deadline']
        for kind in ['method','materials','environment','scope']:
            self.assertEqual(self.event('blocked',{'category':kind,'note':'SYNTHETIC blocker'})[0],200)
            self.assertTrue(self.store.get('JN')['help']['suggestion'])
            self.assertEqual(self.event('resume',{})[0],200)
        self.assertEqual(self.store.get('JN')['context']['deadline'],deadline)
    def test_origin_token_and_fixed_file_routing(self):
        self.assertEqual(self.call('/api/event',{'project':'JN','expected_revision':0},token='bad')[0],403)
        self.assertEqual(self.call('/api/file?project=../../&kind=draft')[0],404)
        self.assertEqual(self.call('/../../server.py')[0],404)
    def test_eight_projects_and_original_acceptance_stay_unchanged(self):
        status,body,_=self.call('/api/data');data=json.loads(body)
        self.assertEqual(status,200);self.assertEqual(len(data['seed']['projects']),8);self.assertEqual(len(data['seed']['tasks']),55)
        self.assertEqual(sum(t['scoped_complete'] for t in data['seed']['tasks']),6)
        self.assertEqual(len({tuple(p['criteria']) for p in data['seed']['projects']}),8)
        for file in ['/','/app.js','/style.css']:
            self.assertEqual(self.call(file)[0],200)

if __name__=='__main__':unittest.main(verbosity=2)

