import unittest
from copy import deepcopy
import test_action_planner
import action_planner as b

class IndependentTests(test_action_planner.PlannerTests):
    def setUp(self):
        super().setUp()
        self.d['member_profiles'].append({'member_id':'C','verified_capabilities':['x']})
        self.d['gaps'][0]['related_member_ids']=['B','C']
        self.p=b.generate(self.d,{'deadline':'2030-01-02'})
        base={k:deepcopy(v) for k,v in self.s.items() if k in ('windows','busy','daily_limit','buffer_minutes')}
        self.j={k:deepcopy(v) for k,v in self.s.items() if k not in ('member_id','windows','busy','daily_limit','buffer_minutes')}
        self.j['members']={'B':base,'C':deepcopy(base)}
    def joint(self,p=None):return b.replan(self.d,p or self.p,self.j,(p or self.p)['plan_version'],self.now)
    # Override inherited single-owner acceptance cases to use joint allocation.
    def runplan(self,p=None):
        if not hasattr(self,'j'):return super().runplan(p)
        self.j['members']['B'].update({k:deepcopy(v) for k,v in self.s.items() if k in ('daily_limit','busy')})
        return self.joint(p)
    def test_backward_dependency(self):
        self.d['member_profiles'][0]['verified_capabilities']=[]
        self.p=b.generate(self.d,{'deadline':'2030-01-02'})
        for m in self.j['members'].values():m['daily_limit']=180;m['windows'][0]['end']='13:00'
        q=self.joint();f={x['task_id']:x for x in q['milestone_forecast']}
        self.assertLessEqual(f['g:B:0:learn']['latest_finish'],f['g:B:0:practice']['latest_start'])
        self.assertLessEqual(f['g:B:0:practice']['latest_finish'],f['g:deliver']['latest_start'])
        self.assertFalse(q['time_blocks'])
    def test_shared_intersection(self):
        self.j['members']['C']['windows'][0]['start']='10:30'
        p=self.joint();self.assertEqual(len(p['time_blocks']),4)
        self.assertEqual(p['time_blocks'][0]['start'],'2030-01-02T10:30+08:00')
        self.assertTrue(p['schedule_summary']['fits'])
    def test_disjoint(self):
        self.j['members']['C']['windows']=[{'date':'2030-01-02','start':'12:00','end':'13:00'}]
        self.assertFalse(self.joint()['time_blocks'])
    def test_partial_lock_mismatch(self):
        p=self.joint()
        for block in p['time_blocks']:block['locked']=True
        self.j['members']['C']['busy']=[{'date':'2030-01-02','start':'10:00','end':'10:30'}]
        with self.assertRaises(ValueError):self.joint(p)
    def test_edit(self):
        p=self.joint();q=b.edit(self.d,p,'g:deliver',{'estimate_minutes_range':[60,90]},p['plan_version'])
        self.assertFalse(q['time_blocks']);self.assertEqual(q['plan_version'],3)
    def test_feedback_not_completion(self):
        q=b.feedback(self.d,self.p,'g:deliver',70,0,1)
        self.assertEqual(q['tasks'][0]['status'],'pending_review')
    def test_feedback_remaining(self):
        q=b.feedback(self.d,self.p,'g:deliver',25,35,1)
        r=self.joint(q)
        self.assertEqual(r['schedule_summary']['needed_minutes'],35)
    def test_completed_preserved(self):
        p=self.joint();p['tasks'][0]['status']='completed'
        q=self.joint(p);self.assertEqual(q['time_blocks'],p['time_blocks'])
    def test_invalid_import(self):
        self.p['tasks'][0]['acceptance_criteria']=[]
        with self.assertRaises(ValueError):b.validate(self.p,self.d)
    def test_unaffected_slot(self):
        p=self.joint();q=self.joint(p);self.assertEqual(p['time_blocks'],q['time_blocks'])

if __name__=='__main__':unittest.main()
