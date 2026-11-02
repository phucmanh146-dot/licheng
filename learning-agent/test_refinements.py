import unittest
from copy import deepcopy
from datetime import datetime
import action_planner as a
import b_refinements as b
import test_action_planner

class Refinements(unittest.TestCase):
    def setUp(self):
        f=test_action_planner.PlannerTests();f.setUp();self.d,self.p,self.s,self.now=f.d,f.p,f.s,f.now
        self.j={'period_start':'2030-01-02','period_end':'2030-01-02','selected_task_ids':['g:deliver'],'chunk_minutes':30,'allow_split':True,'members':{'B':{'daily_limit':90,'buffer_minutes':0,'windows':[{'date':'2030-01-02','start':'10:00','end':'11:30'}],'busy':[]}}}
    def test_split_conserves_budget(self):
        q=b.split(self.d,self.p,'g:deliver',1,20)
        self.assertEqual(len(q['tasks']),4)
        self.assertEqual([sum(t['estimate_minutes_range'][i] for t in q['tasks']) for i in range(2)],[30,60])
        self.assertEqual(q['tasks'][2]['wait_after_dependencies_minutes'],20)
    def test_short_split(self):
        self.p['tasks'][0]['estimate_minutes_range']=[4,4]
        q=b.split(self.d,self.p,'g:deliver',1)
        self.assertTrue(all(t['estimate_minutes_range']==[1,1] for t in q['tasks']))
    def test_lock(self):
        q=b.lock(self.d,self.p,'g:deliver',True,1)
        with self.assertRaises(ValueError):b.split(self.d,q,'g:deliver',2)
        q=b.lock(self.d,q,'g:deliver',False,2);self.assertFalse(q['tasks'][0]['locked'])
    def test_calibration_sample_and_idempotence(self):
        for i in range(3):
            t=deepcopy(self.p['tasks'][0]);t.update(task_id='done'+str(i),status='completed',actual_minutes=90);self.p['tasks'].append(t)
        q=b.calibrate(self.d,self.p,1);self.assertEqual(q['tasks'][0]['estimate_minutes_range'],[60,120])
        r=b.calibrate(self.d,q,2);self.assertEqual(q['tasks'][0]['estimate_minutes_range'],r['tasks'][0]['estimate_minutes_range'])
        self.assertEqual(q['tasks'][1],self.p['tasks'][1])
    def test_insufficient_samples(self):self.assertEqual(b.calibrate(self.d,self.p,1)['calibration_summary']['updated_task_ids'],[])
    def test_weekly_merges(self):
        self.j['members']['B']['weekly_windows']=[{'weekday':2,'start':'10:30','end':'12:00'}]
        self.assertEqual(b.expand(self.j)['members']['B']['windows'][0]['end'],'12:00')
    def test_incremental_keeps_completed_and_split(self):
        self.p=b.split(self.d,self.p,'g:deliver',1);self.p['tasks'][0]['status']='completed'
        new=deepcopy(self.d);new['diagnosis_version']=2;g=deepcopy(new['gaps'][0]);g['gap_id']='g2';new['gaps'].append(g)
        q=b.reconcile(self.d,new,self.p,{'deadline':'2030-01-02'},2)
        self.assertFalse(q['requires_confirmation']);self.assertEqual(next(t for t in q['plan']['tasks'] if t['task_id']==self.p['tasks'][0]['task_id']),self.p['tasks'][0])
        self.assertEqual(len(q['plan']['tasks']),5)
    def test_changed_completed_conflict(self):
        self.p['tasks'][0]['status']='completed';new=deepcopy(self.d);new['diagnosis_version']=2;new['gaps'][0]['target_result']='新要求'
        q=b.reconcile(self.d,new,self.p,{},1);self.assertTrue(q['requires_confirmation']);self.assertEqual(q['plan'],self.p)
    def test_wait_release(self):
        q=b.split(self.d,self.p,'g:deliver',1,60)
        for t in q['tasks'][:2]:t.update(status='completed',completed_at='2030-01-02T10:00+08:00')
        self.j['selected_task_ids']=[q['tasks'][2]['task_id']]
        result=a.replan(self.d,q,self.j,2,self.now)
        self.assertGreaterEqual(result['time_blocks'][0]['start'],'2030-01-02T11:00+08:00')
    def test_alternative_collaboration(self):
        self.d['member_profiles'].append({'member_id':'C','verified_capabilities':['x']})
        self.j['members']['B']['daily_limit']=10
        self.j['members']['C']=deepcopy(self.j['members']['B']);self.j['members']['C']['daily_limit']=90
        result=b.alternatives(self.d,self.p,self.j,1)
        self.assertEqual(result['baseline_missing_minutes'],50)
        self.assertTrue(result['alternatives'][0]['fits'])
        self.assertEqual(self.p['tasks'][0]['owner_ids'],['B'])

if __name__=='__main__':unittest.main()
