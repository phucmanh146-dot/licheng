"""Real SQLite and HTTP, controlled A fixtures; no human/model efficacy claim."""
import copy
import json
import threading
import unittest
from datetime import timedelta
from unittest.mock import patch
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import test_recovery
import team_orchestrator as team
import team_intervention as support
import team_evidence_score as score
import learning_agent_server as server

class InterventionTests(unittest.TestCase):
    setUp = test_recovery.RecoveryTests.setUp
    tearDown = test_recovery.RecoveryTests.tearDown
    ctx = test_recovery.RecoveryTests.ctx
    setup_inputs = test_recovery.RecoveryTests.setup_inputs
    upload = test_recovery.RecoveryTests.upload
    model_context = test_recovery.RecoveryTests.model_context
    diagnose = test_recovery.RecoveryTests.diagnose
    plan = test_recovery.RecoveryTests.plan
    event = test_recovery.RecoveryTests.event
    ready = test_recovery.RecoveryTests.ready
    payload = test_recovery.RecoveryTests.payload

    def checkin(self, state='confused', **extra):
        self.p=support.checkin(self.payload(state=state,member_id='member-a',note='控制测试：不理解分母',
                                             first_step_minutes=5,**extra))
        return self.p['interventions'][-1]

    def answer(self, row, **extra):
        self.p=support.respond(self.payload(intervention_id=row['id'],**extra))

    def feedback(self, row, **extra):
        self.p=support.feedback(self.payload(intervention_id=row['id'],actual_minutes=3,note='实际尝试记录',**extra))

    def test_all_five_states_preserve_task_and_artifact(self):
        self.ready()
        original=copy.deepcopy(self.p)
        for state in support.STATES:
            with self.subTest(state=state):
                with patch.object(team,'commit',side_effect=lambda p,*a:p):
                    result=support.checkin(self.payload(state=state,member_id='member-a',note='选择状态',first_step_minutes=5))
                row=result['interventions'][-1]
                self.assertEqual(row['location'],'line:1')
                self.assertEqual(result['plan'],original['plan'])
                self.assertEqual(result['stored_artifacts'],original['stored_artifacts'])
                self.assertFalse(result['live_verified'])

    def test_duplicate_stale_project_and_long_first_step_rejected(self):
        self.ready()
        data=self.payload(state='confused',member_id='member-a',note='问题',first_step_minutes=6)
        with self.assertRaises(ValueError):support.checkin(data)
        row=self.checkin()
        with self.assertRaises(team.Conflict):support.checkin(data)
        with self.assertRaises(team.Conflict):self.checkin()
        self.assertEqual(len(team.state(self.p['project_id'])['interventions']),1)

    def test_owner_and_unknown_state_rejected(self):
        self.ready()
        for field,value in [('state','camera_inferred'),('member_id','other')]:
            data=self.payload(state='confused',member_id='member-a',note='问题',first_step_minutes=5)
            data[field]=value
            with self.assertRaises(ValueError):support.checkin(data)

    def test_due_rest_does_not_resume_or_complete(self):
        self.ready();row=self.checkin('tired')
        future=support.now()+timedelta(minutes=6)
        with patch.object(support,'now',return_value=future):
            r=support.report(team.state(self.p['project_id']))
        self.assertTrue(r['interventions'][0]['rest_due'])
        self.assertEqual(r['interventions'][0]['status'],'resting')
        self.assertEqual(r['terminal']['status'],'not_complete')
        with self.assertRaises(ValueError):self.feedback(row,outcome='no_output')
        with self.assertRaises(ValueError):self.answer(row,choice='continue')
        self.answer(row,choice='continue',confirmed=True)
        self.assertEqual(self.p['interventions'][0]['status'],'active')
        self.assertNotEqual(self.p['plan']['tasks'][0]['status'],'completed')

    def test_end_and_extend_persist(self):
        self.ready();row=self.checkin('tired')
        self.answer(row,choice='extend')
        self.answer(row,choice='end')
        saved=team.state(self.p['project_id'])
        self.assertEqual(saved['interventions'][0]['status'],'ended_today')
        self.assertNotIn('rest_until',saved['interventions'][0])
        self.answer(row,choice='continue',confirmed=True)
        self.assertEqual(len(self.p['interventions'][0]['resumes']),1)

    def test_two_failed_attempts_stop_and_keep_help_context(self):
        self.ready();row=self.checkin('blocked')
        self.feedback(row,outcome='no_output')
        self.assertIn('拆成一格',self.p['interventions'][0]['support'])
        self.feedback(row,outcome='no_output')
        report=support.report(self.p)
        self.assertEqual(report['interventions'][0]['status'],'needs_help')
        self.assertEqual(len(report['interventions'][0]['help_card']['attempts']),2)
        with self.assertRaises(ValueError):self.feedback(row,outcome='no_output')
        self.answer(row,choice='after_help',confirmed=True,note='队友帮助定位原始分母；新的解释策略')
        self.feedback(row,outcome='no_output')
        self.assertEqual(self.p['interventions'][0]['status'],'active')
        self.assertEqual(len(self.p['interventions'][0]['feedback']),3)

    def test_original_input_or_old_output_cannot_be_claimed_as_new_output(self):
        self.ready()
        self.upload('旧产物',identifier='old',purpose='submission')
        row=self.checkin()
        for identifier,quote in [('report','人数=3'),('old','旧产物')]:
            with self.assertRaises(ValueError):
                self.feedback(row,outcome='output',evidence_refs=[{'artifact_id':identifier,'artifact_version':1,'locator':'line:1','quote':quote}])

    def test_new_output_stays_pending_and_does_not_accept_task(self):
        self.ready();row=self.checkin()
        self.upload('有效分母=2；缺失人数=1',purpose='submission')
        self.feedback(row,outcome='output',evidence_refs=[{'artifact_id':'report','artifact_version':2,'locator':'line:1','quote':'有效分母=2'}])
        self.assertEqual(self.p['interventions'][0]['status'],'output_pending_review')
        self.assertNotEqual(self.p['plan']['tasks'][0]['status'],'completed')
        self.assertEqual(support.report(self.p)['terminal']['status'],'not_complete')
        self.assertFalse(score.report(self.p)['terminal']['quality_verified'])

    def test_wrong_quote_missing_output_and_invalid_minutes_rejected(self):
        self.ready();row=self.checkin()
        for refs in [[],[{'artifact_id':'report','artifact_version':1,'locator':'line:1','quote':'不存在'}]]:
            with self.assertRaises(ValueError):self.feedback(row,outcome='output',evidence_refs=refs)
        with self.assertRaises(ValueError):
            support.feedback(self.payload(intervention_id=row['id'],outcome='no_output',actual_minutes=True,note='问题'))

    def test_modified_material_and_cross_project_blocked(self):
        self.ready();row=self.checkin()
        self.upload('材料变化')
        self.assertTrue(support.report(self.p)['interventions'][0]['stale'])
        with self.assertRaises(team.Conflict):self.feedback(row,outcome='no_output')
        other=team.create({'mode':'live','goal':'另一项目'})
        with self.assertRaises((ValueError,team.Conflict)):
            support.respond({'project_id':other['project_id'],'expected_version':other['version'],
                             'expected_plan_version':1,'intervention_id':row['id'],'choice':'continue','confirmed':True})

    def test_demo_never_scores_and_missing_project_stays_not_complete(self):
        d=team.create({'mode':'demo','goal':'示例'})
        r=score.report(d)
        self.assertTrue(all(x['points']==0 for x in r['roles']))
        self.assertEqual(r['terminal']['status'],'not_complete')
        self.ready();row=self.checkin()
        r=score.report(self.p)
        self.assertTrue(all(x['points']<=20 for x in r['roles']))
        self.assertEqual(r['human_effectiveness'],'not_verified')
        self.assertFalse(self.p['live_verified'])

    def test_http_checkin_score_and_stale_conflict(self):
        self.ready()
        srv=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        thread=threading.Thread(target=srv.serve_forever,daemon=True);thread.start()
        base='http://127.0.0.1:'+str(srv.server_port)+'/api/agent/team/'
        try:
            self.assertIn(b'interventionView',urlopen('http://127.0.0.1:'+str(srv.server_port)+'/team-intervention.js',timeout=5).read())
            payload=self.payload(state='tired',member_id='member-a',note='控制HTTP测试',first_step_minutes=5)
            def post():
                return json.load(urlopen(Request(base+'intervention-checkin',json.dumps(payload).encode(),{'Content-Type':'application/json'}),timeout=5))
            p=post()
            with self.assertRaises(HTTPError) as cm:post()
            self.assertEqual(cm.exception.code,409)
            result=json.load(urlopen(base+'evidence-score?id='+p['project_id'],timeout=5))
            self.assertEqual(len(result['roles']),3)
            self.assertEqual(result['terminal']['status'],'not_complete')
        finally:
            srv.shutdown();srv.server_close();thread.join()

if __name__=='__main__':unittest.main()
