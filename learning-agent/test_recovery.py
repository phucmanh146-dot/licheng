"""Real SQLite/material/HTTP tests, controlled diagnosis fixtures, no live AI claim."""
import copy
import json
import re
from pathlib import Path
from html.parser import HTMLParser
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from unittest.mock import patch

import action_planner
import learning_agent as agent
import team_orchestrator as team
import team_recovery as recovery
import team_rescue
import rescue_service
from learning_agent_server import Handler, ThreadingHTTPServer
import test_general_loop as fixtures


class RecoveryTests(unittest.TestCase):
    setUp = fixtures.GeneralLoopTests.setUp
    tearDown = fixtures.GeneralLoopTests.tearDown
    ctx = fixtures.GeneralLoopTests.ctx
    setup_inputs = fixtures.GeneralLoopTests.setup_inputs
    upload = fixtures.GeneralLoopTests.upload
    model_context = fixtures.GeneralLoopTests.model_context
    diagnose = fixtures.GeneralLoopTests.diagnose
    plan = fixtures.GeneralLoopTests.plan
    event = fixtures.GeneralLoopTests.event

    def ready(self, two=False):
        self.setup_inputs(); self.diagnose(); self.plan()
        if two:
            plan = copy.deepcopy(self.p['plan']); plan['plan_version'] += 1
            extra = copy.deepcopy(plan['tasks'][0]); extra['task_id']='additional'; extra['title']='控制案例B：核对同一材料'
            plan['tasks'].append(extra)
            self.p=team.propose({**self.ctx(),'plan':plan,'reason':'人工控制的第二项任务'})
            self.p=team.apply({**self.ctx(),'proposal_id':self.p['proposal']['id']})

    def payload(self, **extra):
        return {**self.ctx(),'expected_plan_version':self.p['plan']['plan_version'],
                'task_id':'G1:deliver','action_id':'s1',**extra}

    def pause(self, **extra):
        self.p=recovery.pause(self.payload(reason='interrupted',note='控制案例：临时请求打断',
            done_note='已经核对人数这一行',location='report.txt line:1',
            next_action='回到这一行核对有效分母',**extra))
        return self.p['recovery']['checkpoints'][-1]

    def attempt(self, **extra):
        data={'action':'检索分母统计口径','observed':'还缺一条原始记录','reported_outcome':'failed','actual_minutes':5,**extra}
        self.p=recovery.attempt(self.payload(**data))
        return self.p['recovery']['attempts'][-1]

    def promise(self, **extra):
        self.p=recovery.commitment({**self.ctx(),'member_id':'member-a','task_id':'G1:deliver',
            'deliverable':'交修订稿','promised_to':'协作同学','source':'本人粘贴的请求原话',
            'importance':3,'estimate_minutes':30,**extra})

    def test_real_material_retrieved_at_exact_step_and_persistent_pause(self):
        self.ready();self.event('start');card=self.pause()
        saved=team.state(self.p['project_id'])
        self.assertEqual(saved['recovery']['checkpoints'][0]['next_action'],card['next_action'])
        self.assertEqual(saved['plan']['tasks'][0]['status'],'blocked')
        packet=recovery.context_packet(saved,'G1:deliver','s1')
        self.assertIn('人数=3',packet['retrieved_material']['units'][0]['text'])
        self.assertEqual(packet['retrieved_material']['artifact_version'],1)
        self.assertEqual(len(packet['retrieved_material']['sha256']),64)

    def test_manual_resume_does_not_complete_or_lose_original_artifact(self):
        self.ready();self.event('start');card=self.pause()
        self.p=recovery.resume(self.payload(checkpoint_id=card['checkpoint_id'],note='核对现场后继续'))
        self.assertEqual(self.p['plan']['tasks'][0]['status'],'in_progress')
        self.assertEqual(self.p['plan']['tasks'][0]['micro_steps'][0]['input_version']['artifact_version'],1)
        self.assertFalse(self.p['live_verified'])
        self.assertEqual(self.p['recovery_summary']['resumed'],1)

    def test_schedule_lock_survives_explicit_execution_pause(self):
        self.ready();self.event('start');self.event('lock');card=self.pause()
        self.p=recovery.resume(self.payload(checkpoint_id=card['checkpoint_id'],note='本人确认后继续'))
        self.assertTrue(self.p['plan']['tasks'][0]['locked'])
        self.assertEqual(self.p['plan']['tasks'][0]['status'],'in_progress')

    def test_external_condition_check_due_is_not_ready_or_completion(self):
        self.ready();card=self.pause(condition={'kind':'external','description':'等同学回复'},check_after='2020-01-01T10:00:00+08:00')
        q=recovery.agenda(self.p,'member-a')
        self.assertTrue(q['waiting'][0]['check_due']);self.assertIsNone(q['next'])
        with self.assertRaisesRegex(ValueError,'尚未确认'):
            recovery.resume(self.payload(checkpoint_id=card['checkpoint_id'],note='继续'))
        self.p=recovery.signal(self.payload(checkpoint_id=card['checkpoint_id'],confirmed=True,evidence='本人已收到回复并核对材料可用'))
        self.assertEqual(self.p['plan']['tasks'][0]['status'],'blocked')
        self.assertEqual(self.p['recovery']['checkpoints'][0]['status'],'ready')

    def test_external_wait_requires_timezone_and_check_time(self):
        self.ready()
        for extra in ({},{'check_after':'2030-01-02T10:00'}):
            with self.subTest(extra=extra),self.assertRaises(ValueError):
                self.pause(condition={'kind':'external','description':'等材料'},**extra)

    def test_interruption_only_returns_after_actual_acceptance_of_B(self):
        self.ready(two=True);self.event('start');card=self.pause(condition={'kind':'task_accepted','task_id':'additional','description':'B验收后回到A'})
        with self.assertRaisesRegex(ValueError,'尚未验收'):
            recovery.signal(self.payload(checkpoint_id=card['checkpoint_id'],confirmed=True,evidence='看起来做完了'))
        self.event('start','additional')
        self.upload('有效分母=2；缺失人数=1',purpose='submission')
        self.event('submit','additional',artifact_id='report',artifact_version=2,actual_minutes=5,evidence='控制案例真实字节line:1')
        self.assertEqual(self.p['recovery']['checkpoints'][0]['status'],'waiting')
        review=fixtures.GeneralLoopTests.packet(self)
        review.update(review_id='controlled-additional-review',task_id='additional')
        import team_handoff
        self.p=team_handoff.receive_review({**self.ctx(),'review':review})
        self.event('approve','additional',reviewer_id='member-reviewer',criterion_results=[{'criterion':'写明有效分母和缺失人数','passed':True,'evidence':'line:1有效分母2，缺失1'}])
        self.assertEqual(self.p['recovery']['checkpoints'][0]['status'],'ready')
        self.p=recovery.resume(self.payload(checkpoint_id=card['checkpoint_id'],note='B验收后找回A'))
        self.assertEqual(self.p['plan']['tasks'][0]['status'],'in_progress')
        self.assertEqual(self.p['plan']['tasks'][1]['status'],'completed')

    def test_one_owner_cannot_start_more_work_without_saving_scene(self):
        self.ready(two=True);self.event('start')
        with self.assertRaisesRegex(ValueError,'保存当前进行中'):
            self.event('start','additional')
        self.pause();self.event('start','additional')
        self.assertEqual(self.p['plan']['tasks'][1]['status'],'in_progress')

    def test_standard_start_cannot_bypass_waiting_checkpoint(self):
        self.ready();self.pause(condition={'kind':'external','description':'等材料'},check_after='2030-01-02T10:00+08:00')
        with self.assertRaisesRegex(ValueError,'返回原任务'):
            self.event('resume')

    def test_attempt_is_user_report_and_never_finishes_task(self):
        self.ready();row=self.attempt(reported_outcome='succeeded',observed='这次能打开材料了')
        self.assertEqual(row['evidence_kind'],'user_report')
        self.assertEqual(self.p['plan']['tasks'][0]['status'],'candidate')
        self.assertNotIn('review',self.p['plan']['tasks'][0])
        self.assertIn('未运行真人对照',recovery.evaluation_export(self.p)['assessment'])

    def test_duplicate_attempt_rejected_but_new_observation_kept(self):
        self.ready();self.attempt()
        with self.assertRaises(team.Conflict):self.attempt()
        self.attempt(observed='新增证据：原始表第2行为空')
        self.assertEqual(len(self.p['recovery']['attempts']),2)

    def test_artifact_quote_checked_and_foreign_quote_rejected(self):
        self.ready()
        ref={'artifact_id':'report','artifact_version':1,'locator':'line:1','quote':'人数=3'}
        self.attempt(evidence_refs=[ref])
        self.assertEqual(self.p['recovery']['attempts'][0]['evidence_kind'],'artifact_quotes_checked')
        with self.assertRaisesRegex(ValueError,'引文'):
            self.attempt(observed='其他观察',evidence_refs=[{**ref,'quote':'杜撰的内容'}])

    def test_model_context_contains_real_failed_attempt_and_locator(self):
        self.ready();row=self.attempt()
        packet=json.loads(recovery.model_context(self.p,'G1:deliver','s1'))
        self.assertEqual(packet['previous_attempts'][0]['attempt_id'],row['attempt_id'])
        self.assertEqual(packet['retrieved_material']['locator'],'line:1')
        self.assertIn('人数=3',packet['retrieved_material']['excerpt'])
        self.assertLess(len(json.dumps(packet,ensure_ascii=False)),3300)

    def test_existing_help_engine_receives_previous_failure(self):
        self.ready();self.attempt()
        captured={}
        def submit(data):captured.update(data);return {'runId':'controlled-run','status':'queued'}
        with patch.object(agent,'submit',side_effect=submit),patch.object(rescue_service,'public_config',return_value={'configured':True}):
            self.p=team_rescue.start(self.payload(gap_id='G1',note='下一步怎么办'))
        self.assertIn('还缺一条原始记录',captured['goal'])
        self.assertIn('line:1',captured['goal'])
        self.assertEqual(self.p['plan']['tasks'][0]['status'],'candidate')

    def test_stale_diagnosis_rejects_resume_and_stale_context(self):
        self.ready();card=self.pause()
        d=copy.deepcopy(self.p['diagnosis']);d['diagnosis_version']+=1
        self.p=team.diagnosis({**self.ctx(),'diagnosis':d})
        self.assertIn(card['checkpoint_id'],self.p['recovery_summary']['stale_ids'])
        with self.assertRaises(team.Conflict):recovery.resume(self.payload(checkpoint_id=card['checkpoint_id'],note='继续'))
        with self.assertRaises(team.Conflict):recovery.context_packet(self.p,'G1:deliver','s1')

    def test_unchanged_task_survives_plan_version_change(self):
        self.ready();card=self.pause()
        plan=copy.deepcopy(self.p['plan']);plan['plan_version']+=1
        self.p=team.propose({**self.ctx(),'plan':plan,'reason':'只变计划版本，保留受保护的任务'})
        self.p=team.apply({**self.ctx(),'proposal_id':self.p['proposal']['id']})
        self.assertFalse(recovery.stale(self.p,card))
        self.p=recovery.resume(self.payload(checkpoint_id=card['checkpoint_id'],note='核对后返回'))
        self.assertEqual(self.p['plan']['tasks'][0]['status'],'in_progress')

    def test_cycle_and_foreign_card_rejected(self):
        self.ready(two=True);card=self.pause(condition={'kind':'task_accepted','task_id':'additional','description':'等B'})
        with self.assertRaisesRegex(ValueError,'循环'):
            self.p=recovery.pause(self.payload(task_id='additional',reason='interrupted',note='等A',done_note='已读',location='line:1',next_action='核对',condition={'kind':'task_accepted','task_id':'G1:deliver','description':'等A'}))
        with self.assertRaisesRegex(ValueError,'不属于'):
            recovery.signal(self.payload(checkpoint_id='foreign',confirmed=True,evidence='材料就绪'))

    def test_concurrent_pause_has_single_winner(self):
        self.ready();data=self.payload(reason='interrupted',note='临时事情',done_note='已读',location='line:1',next_action='继续核对')
        def run(_):
            try:return recovery.pause(data)
            except team.Conflict:return None
        with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(run,range(2)))
        self.assertEqual(sum(x is not None for x in results),1)
        self.assertEqual(len(team.state(self.p['project_id'])['recovery']['checkpoints']),1)

    def test_commitments_priority_capacity_and_unbound_requests(self):
        self.ready(two=True);before=copy.deepcopy(self.p['plan'])
        self.promise(task_id='additional',deliverable='更重要的修订稿',estimate_minutes=120)
        self.promise(task_id=None,deliverable='尚未拆解的新请求',source='另一条原话',estimate_minutes=45)
        result=recovery.agenda(self.p,'member-a',available_minutes=10)
        self.assertEqual(result['next']['task_id'],'additional')
        self.assertGreater(result['capacity_shortfall_minutes'],0)
        self.assertEqual(len(result['unbound_commitments']),1)
        self.assertEqual(self.p['plan'],before)

    def test_new_request_can_be_collected_before_initial_A_diagnosis(self):
        self.setup_inputs();self.assertIsNone(self.p['diagnosis'])
        self.promise(task_id=None)
        result=recovery.agenda(self.p,'member-a')
        self.assertEqual(len(result['unbound_commitments']),1)
        self.assertIsNone(result['next'])

    def test_reject_while_owner_works_on_B_does_not_open_two_active_tasks(self):
        self.ready(two=True);self.event('start')
        self.upload('有效分母=2；缺失人数=1',purpose='submission')
        self.event('submit',artifact_id='report',artifact_version=2,actual_minutes=5,evidence='控制夹具')
        self.event('start','additional');self.event('reject',reviewer_id='member-reviewer')
        self.assertEqual(sum(t['status']=='in_progress' for t in self.p['plan']['tasks']),1)
        self.assertEqual(self.p['plan']['tasks'][0]['status'],'blocked')

    def test_fatigue_changes_first_action_budget_without_fake_emotion_detection(self):
        self.ready();a=recovery.agenda(self.p,'member-a')['next']
        self.p=recovery.checkin({**self.ctx(),'member_id':'member-a','state':'tired','note':'本人反馈疲惫'})
        b=recovery.agenda(self.p,'member-a')['next']
        self.assertEqual(a['task_id'],b['task_id'])
        self.assertGreater(a['suggested_first_minutes'],b['suggested_first_minutes'])
        self.assertIn('短休',b['help_mode'])

    def test_urgent_request_can_rank_above_current_work_without_auto_switch(self):
        self.ready(two=True);self.event('start')
        ordinary=recovery.agenda(self.p,'member-a')['next']
        self.assertEqual(ordinary['task_id'],'G1:deliver')
        self.promise(task_id='additional',deadline='2020-01-01T10:00:00+08:00')
        urgent=recovery.agenda(self.p,'member-a')['next']
        self.assertEqual(urgent['task_id'],'additional')
        self.assertTrue(urgent['requires_pause'])
        self.assertEqual(self.p['plan']['tasks'][0]['status'],'in_progress')

    def test_unbound_commitment_can_be_edited_bound_and_handed_to_A(self):
        self.ready();self.promise(task_id=None)
        import team_handoff
        handoff=team_handoff.review_request(self.p)
        self.assertEqual(len(handoff['pending_commitments']),1)
        c=self.p['recovery']['commitments'][0]
        self.promise(commitment_id=c['commitment_id'],task_id='G1:deliver',importance=2)
        self.assertEqual(len(self.p['recovery']['commitments']),1)
        self.assertEqual(self.p['recovery']['commitments'][0]['importance'],2)
        self.assertEqual(team_handoff.review_request(self.p)['pending_commitments'],[])
        self.assertEqual(self.p['recovery']['events'][-1]['kind'],'commitment_updated')

    def test_http_routes_persist_and_reject_conflicting_version(self):
        self.ready();server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        base=f'http://127.0.0.1:{server.server_port}'
        def post(op,data):return urlopen(Request(base+'/api/agent/team/'+op,data=json.dumps(data).encode(),headers={'Content-Type':'application/json'}))
        try:
            html=urlopen(base+'/team.html').read().decode()
            self.assertIn('recovery-panel',html)
            self.assertIn('recoveryView',urlopen(base+'/team-recovery.js').read().decode())
            payload=self.payload(reason='interrupted',note='临时请求',done_note='已读',location='line:1',next_action='继续核对')
            self.p=json.load(post('recovery-pause',payload))
            with self.assertRaises(HTTPError) as error:post('recovery-pause',payload)
            self.assertEqual(error.exception.code,409)
            q=json.load(urlopen(base+'/api/agent/team/recovery-agenda?id='+self.p['project_id']+'&member_id=member-a&minutes=30'))
            self.assertTrue(q['next']['return_available'])
            packet=json.load(urlopen(base+'/api/agent/team/recovery-export?id='+self.p['project_id']))
            self.assertEqual(packet['records']['checkpoints'][0]['location'],'line:1')
        finally:server.shutdown();server.server_close();thread.join()

    def test_frontend_ids_are_unique_and_all_new_handlers_have_elements(self):
        class IDs(HTMLParser):
            def __init__(self):super().__init__();self.ids=[]
            def handle_starttag(self,tag,attrs):
                self.ids.extend(v for k,v in attrs if k=='id')
        root=Path(__file__).parent
        parser=IDs();parser.feed((root/'team.html').read_text())
        self.assertEqual(len(parser.ids),len(set(parser.ids)))
        script=(root/'team-recovery.js').read_text()
        referenced=set(re.findall(r"\$\('([^']+)'\)",script))
        self.assertEqual(referenced-set(parser.ids),set())


if __name__=='__main__':unittest.main()
