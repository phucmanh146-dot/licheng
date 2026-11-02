import copy,json,unittest
from pathlib import Path
from quality_plan import build_plan
from server import initial

class QualityPlanTests(unittest.TestCase):
    def setUp(self):
        self.seed=json.loads((Path(__file__).parent/'data.json').read_text(encoding='utf-8'));self.p=self.seed['projects'][1]
        self.s=initial();self.s.update(frozen=True,criteria=self.p['criteria'],context={'goal':'把访谈支撑产品决策做好','materials':'现有访谈与PPT','minutes':20,'capability':'我自称很会做'})
    def plan(self,s=None,p=None):return build_plan(p or self.p,s or self.s,self.seed['tasks'])
    def test_self_report_does_not_certify_ability(self):
        r=self.plan();self.assertEqual(r['route'],'grounded_micro_trial');self.assertEqual(r['capability_status'],'unknown_not_inferred_from_self_report')
    def test_no_target_gate_before_execution(self):
        self.assertEqual(self.plan(initial())['route'],'confirm_target')
    def test_missing_resource_is_not_skill_failure(self):
        self.s['context']['materials']='未取得访谈附件';self.assertEqual(self.plan()['route'],'resolve_resource')
    def test_actual_method_blocker_changes_help(self):
        self.s['help']={'category':'method'};r=self.plan();self.assertEqual(r['route'],'teach_current_method');self.assertIn('原话是材料',r['first_action'])
    def test_only_failed_criteria_are_replanned(self):
        self.s['review']={'passed':False,'checks':[{'passed':True},{'passed':False},{'passed':True}]};r=self.plan();self.assertEqual(r['route'],'repair_failed_criterion');self.assertIn(self.s['criteria'][1],r['first_action']);self.assertNotIn(self.s['criteria'][0],r['first_action'])
    def test_passed_artifact_does_not_claim_skill_mastery(self):
        self.s['stage']='accepted';r=self.plan();self.assertEqual(r['route'],'transfer_before_skill_claim');self.assertEqual(r['capability_status'],'current_artifact_passed_transfer_pending')
    def test_eight_projects_have_different_actions_and_trace_task_ids(self):
        plans=[self.plan(p=p) for p in self.seed['projects']];self.assertEqual(len({r['first_action'] for r in plans}),8);self.assertTrue(all(r['task_ids'] for r in plans))
    def test_planning_does_not_mutate_original_criteria_or_history(self):
        before=copy.deepcopy(self.s);self.plan();self.assertEqual(before,self.s)

