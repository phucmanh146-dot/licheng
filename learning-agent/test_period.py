import copy,unittest
from datetime import datetime
from unittest.mock import patch
import test_team
import team_orchestrator as team
from period_planner import compute, TZ
NOW=datetime(2026,10,9,9,0,tzinfo=TZ)
class PeriodTests(unittest.TestCase):
    tearDown=test_team.TeamTests.tearDown
    ctx=test_team.TeamTests.ctx
    planned=test_team.TeamTests.planned
    def setUp(self):
        test_team.TeamTests.setUp(self);self.planned()
        self.p['plan']['tasks'][0]['estimate_minutes_range']=[60,120]
        self.p['plan']['tasks'][0]['deadline']='2026-10-12'
        self.c={'member_id':'captain','period_start':'2026-10-09','period_end':'2026-10-12','windows':[{'date':'2026-10-09','start':'19:00','end':'20:00'},{'date':'2026-10-10','start':'19:00','end':'20:00'},{'date':'2026-10-11','start':'19:00','end':'20:00'}], 'busy':[],'full_dates':['2026-10-09'],'daily_limit':60,'buffer_minutes':0,'chunk_minutes':25,'allow_split':True,'selected_task_ids':['T1'],'remaining_minutes':{'T1':120}}
    def test_today_full_uses_later_days(self):
        plan=compute(self.p,self.c,NOW);self.assertTrue(plan['schedule_summary']['fits'])
        self.assertEqual({x['start'][:10] for x in plan['time_blocks']},{'2026-10-10','2026-10-11'})
    def test_capacity_shortfall_buffer_and_event(self):
        self.c['buffer_minutes']=10;self.c['busy']=[{'date':'2026-10-10','start':'19:00','end':'19:30'}]
        s=compute(self.p,self.c,NOW)['schedule_summary'];self.assertEqual(s['available_minutes'],70);self.assertEqual(s['unallocated_minutes'],50);self.assertFalse(s['fits'])
    def test_deadline(self):
        self.p['plan']['tasks'][0]['deadline']='2026-10-10';plan=compute(self.p,self.c,NOW)
        self.assertEqual(plan['schedule_summary']['unallocated_minutes'],60);self.assertTrue(all(b['end'][:10]<='2026-10-10' for b in plan['time_blocks']))
    def test_unsplittable(self):
        self.c['allow_split']=False;self.assertEqual(compute(self.p,self.c,NOW)['schedule_summary']['unallocated_minutes'],120)
    def test_preserves_unaffected_slot(self):
        old={'task_id':'T1','member_id':'captain','start':'2026-10-11T19:00+08:00','end':'2026-10-11T19:25+08:00'};self.p['plan']['time_blocks']=[old]
        self.assertIn(old,compute(self.p,self.c,NOW)['time_blocks'])
    def test_locked_conflict(self):
        self.p['plan']['time_blocks']=[{'task_id':'T1','member_id':'captain','start':'2026-10-10T19:00+08:00','end':'2026-10-10T19:25+08:00','locked':True}]
        self.c['busy']=[{'date':'2026-10-10','start':'19:00','end':'19:30'}]
        with self.assertRaisesRegex(ValueError,'冲突'):compute(self.p,self.c,NOW)
    def test_dependency(self):
        t=copy.deepcopy(self.p['plan']['tasks'][0]);t['task_id']='T0';self.p['plan']['tasks'].append(t);self.p['plan']['tasks'][0]['depends_on']=['T0']
        s=compute(self.p,self.c,NOW)['schedule_summary'];self.assertEqual(s['unallocated_minutes'],120);self.assertIn('前置',s['unallocated'][0]['reason'])
    def test_in_progress_remaining(self):
        self.p['plan']['tasks'][0]['status']='in_progress';self.c['remaining_minutes']={}
        with self.assertRaisesRegex(ValueError,'剩余'):compute(self.p,self.c,NOW)
    def test_outside_period(self):
        self.p['plan']['time_blocks']=[{'task_id':'T1','member_id':'captain','start':'2026-10-13T19:00+08:00','end':'2026-10-13T19:25+08:00'}]
        with self.assertRaisesRegex(ValueError,'周期外'):compute(self.p,self.c,NOW)
    def test_overlapping_input(self):
        self.c['windows'].append(self.c['windows'][1])
        with self.assertRaisesRegex(ValueError,'重叠'):compute(self.p,self.c,NOW)
    def test_apply_undo_progress_guard(self):
        before=copy.deepcopy(self.p['plan']);self.p=team.commit(self.p,self.p['version'],'test fixture')
        with patch('period_planner.compute',side_effect=lambda p,c:compute(p,c,NOW)):
            self.p=team.period_replan({**self.ctx(),'expected_plan_version':1,'reason':'今天已排满','constraints':self.c})
        self.assertEqual(self.p['plan'],before);self.p=team.apply({**self.ctx(),'proposal_id':self.p['proposal']['id']});self.assertTrue(self.p['plan']['time_blocks'])
        self.p=team.undo_plan(self.ctx());self.assertEqual(self.p['plan']['time_blocks'],before['time_blocks']);self.assertEqual(self.p['plan']['plan_version'],3)
        plan=copy.deepcopy(self.p['plan']);plan['plan_version']=4;self.p=team.propose({**self.ctx(),'plan':plan,'reason':'再次调整'});self.p=team.apply({**self.ctx(),'proposal_id':self.p['proposal']['id']})
        self.p=team.feedback({**self.ctx(),'task_id':'T1','expected_plan_version':4,'action':'start','note':'已有进度'})
        with self.assertRaises(team.Conflict):team.undo_plan(self.ctx())
