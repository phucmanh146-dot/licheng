"""Synthetic engineering fixtures; never count as real learner outcomes."""
import unittest,copy,json
from pathlib import Path
from test_workflow import WorkflowTests
from quality_loop import proposal,quality_initial

class QualityTests(unittest.TestCase):
    setUp=WorkflowTests.setUp
    tearDown=WorkflowTests.tearDown
    call=WorkflowTests.call
    event=WorkflowTests.event
    upload=WorkflowTests.upload
    def q(self):return self.store.get('JN')['quality']
    def setup_goal(self,missing=False):
        self.assertEqual(self.event('q_define',{'goal':'SYNTHETIC：希望作品达到能追问证据的水平','executor':'test-executor','self_report':'我已经全部会了，请直接算我掌握','minutes':15,'gap_index':0,'material_status':'missing' if missing else 'available'})[0],200)
        self.v1=self.upload();self.assertEqual(self.event('q_confirm',{'criteria':['数量和状态可回查','缺证保持未知'],'upload':self.v1})[0],200)
    def newupload(self,label):
        import base64
        d={'project':'JN','expected_revision':self.store.get('JN')['revision'],'filename':label+'.txt','data':base64.b64encode(('SYNTHETIC '+label).encode()).decode()}
        return json.loads(self.call('/api/upload',d)[1])['upload']
    def trial(self,passed):
        self.assertEqual(self.event('q_trial_submit',{'upload':self.newupload('trial-'+str(len(self.q()['trials']))),'explanation':'SYNTHETIC one-row trial'})[0],200)
        self.assertEqual(self.event('q_trial_review',{'reviewer':'test-reviewer','passed':passed,'note':'区分申请数与授权数；SYNTHETIC检查'})[0],200)
    def test_self_report_does_not_verify_and_resource_blocks_first(self):
        self.setup_goal(True);self.assertEqual(self.q()['phase'],'resource');self.assertFalse(self.q()['plan']['skill_verified'])
        self.assertEqual(self.event('q_resource',{'note':'SYNTHETIC收到测试材料','available':True})[0],200)
        self.assertEqual(self.q()['phase'],'trial')
    def test_full_quality_chain_requires_comparison_then_separate_transfer(self):
        self.setup_goal();self.assertEqual(self.q()['phase'],'trial');self.trial(False)
        self.assertEqual(self.q()['phase'],'learn');self.assertIn('申请数',self.q()['plan']['action']);self.trial(True)
        self.assertEqual(self.q()['phase'],'execute')
        self.assertEqual(self.event('q_v2_submit',{'upload':self.v1,'explanation':'no change'})[0],400)
        v2=self.newupload('V2');self.assertEqual(self.event('q_v2_submit',{'upload':v2,'explanation':'SYNTHETIC将申请/授权分栏'})[0],200)
        checks=[{'before':'V1未分','after':'V2已分','result':'pass','note':'SYNTHETIC对照'},{'before':'缺证','after':'未确定','result':'unknown','note':'原始依据还缺'}]
        self.assertEqual(self.event('q_content_review',{'reviewer':'test-reviewer','checks':checks})[0],200)
        self.assertEqual(self.q()['remaining'],[1]);self.assertFalse(self.q()['content_pass'])
        self.assertEqual(self.event('q_v2_submit',{'upload':v2,'explanation':'SYNTHETIC重复旧稿'})[0],400)
        v2=self.newupload('V2-fixed')
        self.event('q_v2_submit',{'upload':v2,'explanation':'SYNTHETIC只补未知项'})
        checks[1].update(result='pass',after='缺证已标未知，未断言授权')
        self.event('q_content_review',{'reviewer':'test-reviewer','checks':checks})
        self.assertEqual(self.q()['phase'],'transfer');self.assertEqual(self.q()['skills'],[])
        self.assertEqual(self.event('q_transfer_submit',{'upload':v2,'explanation':'SYNTHETIC重复','location':'same'})[0],400)
        t=self.newupload('another-location-transfer')
        self.event('q_transfer_submit',{'upload':t,'explanation':'SYNTHETIC我把相同方法应用到另一条记录','location':'SYNTHETIC第二条'})
        self.event('q_transfer_review',{'reviewer':'test-reviewer','passed':True,'note':'SYNTHETIC检查另一处与解释'})
        self.assertEqual(self.q()['phase'],'round_pass');self.assertEqual(len(self.q()['skills']),1)
        evidence={'scope':'SYNTHETIC_ENGINEERING_NOT_HUMAN_TRIAL','history':self.q()['history'],'final_phase':self.q()['phase'],'skills':self.q()['skills'],'all_55_completed':False}
        out=Path(__file__).resolve().parents[2]/'outputs/质量进阶闭环_工程执行证据_20261101.json'
        out.write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
        p=next(x for x in self.seed['projects'] if x['id']=='JN')
        self.assertEqual(proposal(self.q(),p)['route'],'execute')
    def test_two_failed_trials_escalate_instead_of_retry_loop(self):
        self.setup_goal();self.trial(False);self.trial(False);self.assertEqual(self.q()['phase'],'help')
        self.assertEqual(self.event('q_resume_help',{'note':'SYNTHETIC收到学长方法说明','action':'只核对一份证书的状态字段并记录依据'})[0],200)
        self.assertEqual(self.q()['phase'],'learn')
    def test_self_review_and_fabricated_uploaded_evidence_are_rejected(self):
        self.setup_goal();u=self.newupload('trial')
        self.assertEqual(self.event('q_trial_submit',{'upload':{**u,'sha256':'fake'},'explanation':'fake'})[0],400)
        self.event('q_trial_submit',{'upload':u,'explanation':'SYNTHETIC'})
        self.assertEqual(self.event('q_trial_review',{'reviewer':' TEST-EXECUTOR ','passed':True,'note':'self'})[0],400)
        code,body,_=self.call('/api/submission?project=JN&id='+u['id']);self.assertEqual(code,200);self.assertIn(b'SYNTHETIC',body)
    def test_eight_projects_24_gaps_have_distinct_actions_and_specific_method(self):
        actions=[]
        for p in self.seed['projects']:
            for i in range(3):
                q={**quality_initial(),'executor':'test','criteria':p['criteria'],'gap_index':i,'minutes':8,'material_status':'available'}
                r=proposal(q,p);actions.append(r['action']);self.assertTrue(r['explanation']);self.assertEqual(r['route'],'trial');self.assertLessEqual(r['estimate_minutes'],8)
        self.assertEqual(len(set(actions)),24)

    def test_tampered_pending_evidence_cannot_be_reviewed(self):
        self.setup_goal();u=self.newupload('trial-tamper')
        self.event('q_trial_submit',{'upload':u,'explanation':'SYNTHETIC'})
        path=next((self.root/'work/workflow-state/uploads').glob('JN-'+u['id']+'.*'))
        path.write_bytes(b'SYNTHETIC externally changed after submission')
        status,body,_=self.event('q_trial_review',{'reviewer':'test-reviewer','passed':True,'note':'SYNTHETIC'})
        self.assertEqual(status,400);self.assertEqual(self.q()['phase'],'trial_review')

    def test_new_goal_round_cannot_reuse_old_skill_binding(self):
        from quality_loop import binding
        self.setup_goal();p=next(x for x in self.seed['projects'] if x['id']=='JN')
        s=self.store.get('JN');old_binding=binding(s['quality'],p)
        s['quality']['skills'].append({'binding':old_binding,'passed':True,'scope':'SYNTHETIC fixture'})
        s['revision']+=1;self.store.save('JN',s['revision']-1,s)
        self.setup_goal()
        self.assertNotEqual(binding(self.q(),p),old_binding)
        self.assertEqual(self.q()['phase'],'trial');self.assertFalse(self.q()['plan']['skill_verified'])
        self.assertTrue(self.q()['previous_rounds'][-1]['skills'])

    def test_all_pass_without_comparison_is_not_improvement(self):
        self.setup_goal();self.trial(True)
        self.event('q_v2_submit',{'upload':self.newupload('unchanged-claims'),'explanation':'SYNTHETIC'})
        checks=[{'before':'同一句描述','after':'同一句描述','result':'pass','note':'SYNTHETIC 全勾选'}]*2
        self.assertEqual(self.event('q_content_review',{'reviewer':'test-reviewer','checks':checks})[0],400)
        self.assertEqual(self.q()['phase'],'content_review');self.assertFalse(self.q().get('content_pass',False))

if __name__=='__main__':unittest.main(verbosity=2)

