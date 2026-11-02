import unittest
import personal_guidance as guidance


class GroundedTrialTests(unittest.TestCase):
    def gap(self, action, output, check, locator):
        return {'gap_id': 'G', 'target_result': '完成当前作品的一处改进',
                'current_locator': 'line:1', 'source_refs': ['S'],
                'required_capabilities': ['当前操作'],
                'micro_steps': [{'target_locator': locator, 'action': action,
                                 'output': output, 'self_check': check}]}

    def test_trial_changes_with_real_action_not_just_project_name(self):
        member = {'capability_evidence': []}
        a = self.gap('核对一条专利证书的申请与授权日期', '一行专利对照', '日期与证书相符', 'line:2')
        b = self.gap('从访谈中摘录一条预算原话', '一行需求卡', '逐字引用能回原文', 'line:5')
        first = guidance.prerequisites(a, 'U', member, {}, {})[0][0]
        second = guidance.prerequisites(b, 'U', member, {}, {})[0][0]
        self.assertIn('专利证书', first['steps'][0])
        self.assertIn('预算原话', second['steps'][0])
        self.assertIn('line:2', first['steps'][0])
        self.assertIn('line:5', second['steps'][0])
        self.assertIn('一行专利对照', first['steps'][1])
        self.assertNotEqual(first['steps'], second['steps'])
        self.assertEqual(first['capability_status'], 'unknown')

    def test_declared_skill_without_confirmed_evidence_still_needs_trial(self):
        g = self.gap('核一行收入减成本', '一行账', '单位与期间一致', 'line:3')
        member = {'self_reported_capabilities': ['当前操作'], 'capability_evidence': []}
        tasks, _, _ = guidance.prerequisites(g, 'U', member, {}, {})
        self.assertEqual(tasks[0]['kind'], 'trial')
        self.assertEqual(tasks[0]['capability_status'], 'unknown')

    def test_confirmed_pass_skips_trial(self):
        g = self.gap('核一行收入减成本', '一行账', '单位与期间一致', 'line:3')
        member = {'capability_evidence': [{'capability': '当前操作', 'evidence_confirmed': True,
                                          'passed': True}]}
        self.assertEqual(guidance.prerequisites(g, 'U', member, {}, {})[0], [])
