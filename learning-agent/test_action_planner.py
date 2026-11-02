import unittest
from copy import deepcopy
from datetime import datetime
import action_planner as b

class PlannerTests(unittest.TestCase):
    def setUp(self):
        self.d={'diagnosis_version':1,'sources':[{'source_id':'s'}],'member_profiles':[{'member_id':'B','verified_capabilities':['x']}], 'gaps':[{'gap_id':'g','target_result':'作品','source_refs':['s'],'related_member_ids':['B'],'required_capabilities':['x'],'acceptance_criteria':['能复现'],'estimate_minutes_range':[30,60],'micro_steps':[{'step_id':'g-step-1','input_version':{'artifact_id':'artifact-v1','artifact_version':1},'target_locator':'项目书第3页用户验证段','action':'将现有用户需求描述拆成可核对的访谈问题，并输出访谈提纲','reason':'当前需求只有概述，缺少可复查的用户证据','expected_change':'形成可执行的访谈提纲','output':'访谈提纲.md','self_check':'每个问题都能对应一个需求假设','failure_next':'若无法定位需求假设，退回A补充当前证据','capability_basis':'先用一个需求假设做最小练习','source_refs':['s']}]}]}
        self.p=b.generate(self.d,{'deadline':'2030-01-02'})
        self.s={'member_id':'B','period_start':'2030-01-02','period_end':'2030-01-02','daily_limit':90,'buffer_minutes':0,'chunk_minutes':30,'windows':[{'date':'2030-01-02','start':'10:00','end':'11:30'}],'busy':[],'selected_task_ids':['g:deliver'],'allow_split':True}
        self.now=datetime.fromisoformat('2030-01-02T09:00+08:00')
    def runplan(self,p=None):return b.replan(self.d,p or self.p,self.s,(p or self.p)['plan_version'],self.now)
    def test_capacity(self):
        self.s['daily_limit']=30
        self.assertEqual(self.runplan()['schedule_summary']['unallocated_minutes'],30)
        self.s['daily_limit']=90
        self.assertTrue(self.runplan()['schedule_summary']['fits'])
    def test_missing_evidence(self):
        self.d['gaps'][0]['source_refs']=[]
        self.assertFalse(b.generate(self.d,{})['tasks'])
    def test_learning(self):
        self.d['member_profiles'][0]['verified_capabilities']=[]
        p=b.generate(self.d,{})
        self.assertEqual(len(p['tasks']),3)
        self.assertEqual(p['tasks'][-1]['status'],'blocked')
    def test_dependency_block(self):
        self.d['member_profiles'][0]['verified_capabilities']=[]
        p=b.generate(self.d,{'deadline':'2030-01-02'})
        self.assertFalse(self.runplan(p)['time_blocks'])

    def test_missing_grounded_micro_steps_blocks_production(self):
        self.d['gaps'][0].pop('micro_steps')
        p=b.generate(self.d,{'deadline':'2030-01-02'})
        task=next(t for t in p['tasks'] if t['kind']=='production')
        self.assertEqual(task['status'],'blocked')
        self.assertEqual(task['execution_readiness'],'blocked_missing_grounded_micro_steps')
        self.assertTrue(task['external_dependencies'])
        self.assertTrue(any('grounded micro_steps' in x['reason'] for x in p['unscheduled']))
        self.assertFalse(self.runplan(p)['time_blocks'])

    def test_micro_step_must_reference_source_or_explain_why_not(self):
        self.d['gaps'][0]['micro_steps'][0]['source_refs']=[]
        with self.assertRaisesRegex(ValueError,'为什么不需要外部参考'):
            b.generate(self.d,{})
    def test_interruption(self):
        p=self.runplan()
        self.s['busy']=[{'date':'2030-01-02','start':'10:00','end':'10:30'}]
        q=self.runplan(p)
        self.assertEqual(q['time_blocks'][0]['start'],'2030-01-02T10:30+08:00')
        self.assertTrue(q['changes'])
    def test_lock_conflict(self):
        p=self.runplan();p['time_blocks'][0]['locked']=True
        self.s['busy']=[{'date':'2030-01-02','start':'10:00','end':'10:30'}]
        with self.assertRaises(ValueError):self.runplan(p)
    def test_version(self):
        with self.assertRaises(ValueError):b.replan(self.d,self.p,self.s,99,self.now)
    def test_cycle(self):
        self.d['gaps'][0]['depends_on_gap_ids']=['g']
        with self.assertRaises(ValueError):b.generate(self.d,{})
    def test_completed_preserved(self):
        p=self.runplan();p['tasks'][0]['status']='completed'
        # Completed work cannot accidentally be selected for a fresh allocation.
        with self.assertRaises(ValueError):self.runplan(p)
        self.assertEqual(p['tasks'][0]['status'],'completed')

if __name__=='__main__':unittest.main()
