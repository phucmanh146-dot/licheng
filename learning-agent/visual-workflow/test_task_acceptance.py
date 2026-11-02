import json,base64,unittest
from test_workflow import WorkflowTests

class TaskAcceptanceTests(unittest.TestCase):
    setUp=WorkflowTests.setUp
    tearDown=WorkflowTests.tearDown
    call=WorkflowTests.call
    def upload(self,label):
        status,b,_=self.call('/api/upload',{'project':'JN','expected_revision':self.store.get('JN')['revision'],'filename':label+'.txt','data':base64.b64encode(('SYNTHETIC '+label).encode()).decode()})
        self.assertEqual(status,200);return json.loads(b)['upload']
    def task(self,event,payload,n=11,revision=None):
        return self.call('/api/task-acceptance',{'project':'JN','task_id':n,'expected_revision':self.store.get('JN')['revision'] if revision is None else revision,'event':event,'payload':payload})
    def submit(self):
        self.aa={'交付产物':self.upload('V2'),'执行记录':self.upload('execution')}
        self.assertEqual(self.task('submit',{'executor':'SYNTHETIC-A','note':'isolated test','artifacts':self.aa})[0],200)
    def review(self):
        rec=self.store.get('JN')['acceptance_tasks']['11']
        return {'submission_id':rec['submission']['id'],'reviewer':'SYNTHETIC-B','checks':{k:{'result':'pass','location':'test line1','note':'synthetic check'} for k in self.aa},'requirement_result':'pass','requirement_note':'synthetic original task check'}
    def test_missing_evidence_self_review_and_stale_write_rejected(self):
        self.assertEqual(self.task('submit',{'executor':'A','note':'x','artifacts':{}})[0],400)
        self.submit();d=self.review();d['reviewer']=' SYNTHETIC-a '
        self.assertEqual(self.task('review',d)[0],400)
        self.assertEqual(self.task('review',self.review(),revision=0)[0],409)
    def test_pass_persistence_and_new_submission_revokes_pass(self):
        self.submit();self.assertEqual(self.task('review',self.review())[0],200)
        self.assertEqual(self.store.get('JN')['acceptance_tasks']['11']['status'],'passed')
        self.assertEqual(self.task('submit',{'executor':'SYNTHETIC-A','note':'new revision','artifacts':{**self.aa,'交付产物':self.upload('V3')}})[0],200)
        rec=self.store.get('JN')['acceptance_tasks']['11'];self.assertEqual(rec['status'],'pending_review');self.assertEqual(rec['history'][-1]['status'],'passed')
    def test_unknown_original_requirement_cannot_pass(self):
        self.submit();d=self.review();d['requirement_result']='unknown'
        self.assertEqual(self.task('review',d)[0],200)
        self.assertEqual(self.store.get('JN')['acceptance_tasks']['11']['status'],'returned')
        self.assertEqual(self.task('submit',{'executor':'A','note':'same','artifacts':self.aa})[0],400)
    def test_file_change_invalidates_effective_pass(self):
        self.submit();self.task('review',self.review())
        p=next((self.root/'work/workflow-state/uploads').glob('JN-'+self.aa['交付产物']['id']+'.*'));p.write_bytes(b'SYNTHETIC altered')
        status,b,_=self.call('/api/acceptance');self.assertEqual(status,200)
        rows=json.loads(b)['rows'];self.assertEqual(len(rows),55)
        self.assertEqual(next(x for x in rows if x['task']['id']==11)['effective_status'],'invalidated')
    def test_null_or_nontext_cannot_count_as_review_evidence(self):
        import copy
        self.submit()
        for value in (None,[],{},False,0,'   '):
            for key in ('reviewer','requirement_note'):
                d=self.review();d[key]=value
                with self.subTest(key=key,value=value):self.assertEqual(self.task('review',d)[0],400)
            for key in ('location','note'):
                d=copy.deepcopy(self.review());d['checks']['交付产物'][key]=value
                with self.subTest(key=key,value=value):self.assertEqual(self.task('review',d)[0],400)
        self.assertEqual(self.store.get('JN')['acceptance_tasks']['11']['status'],'pending_review')
    def test_unicode_cosmetic_identity_changes_do_not_bypass_self_review(self):
        self.submit()
        for reviewer in ['ＳＹＮＴＨＥＴＩＣ－Ａ','SYNTHETIC-\u200bA']:
            d=self.review();d['reviewer']=reviewer
            with self.subTest(reviewer=reviewer):self.assertEqual(self.task('review',d)[0],400)
    def test_null_executor_cannot_create_submission(self):
        aa={'交付产物':self.upload('test-result'),'执行记录':self.upload('test-log')}
        self.assertEqual(self.task('submit',{'executor':None,'note':'SYNTHETIC','artifacts':aa})[0],400)

