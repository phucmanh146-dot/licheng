import unittest
import team_ai


class ActionSpecificityTests(unittest.TestCase):
    def test_observed_generic_live_outputs_are_rejected(self):
        for action in ['仔细阅读原文','分析原文中提到的竞争因素',
                       '分析项目描述，提取对接医保支付政策的实现状态和证据。',
                       '分析原文中提到的数据，确定具体的测算方法和数据来源。']:
            with self.subTest(action=action), self.assertRaises(ValueError):
                team_ai.validate_action_specificity({'action':action})

    def test_project_specific_recording_actions_are_allowed(self):
        for action in ['摘录P14和P15的专利数量，填写统计日期和申请/授权对照表第一行',
                       '复制一条访谈预算原话，记录原文位置并填写对应产品',
                       '计算同期间实收减成本，填入每亩净收益一格',
                       '阅读第3段，圈出一条主张并记录缺少的原始证据']:
            with self.subTest(action=action):
                self.assertEqual(team_ai.validate_action_specificity({'action':action}),action)

    def test_missing_resource_can_be_an_explicit_handoff_action(self):
        action='在缺证清单记录缺少的访谈附件名称和可以询问的人，不编造访谈内容'
        self.assertEqual(team_ai.validate_action_specificity({'action':action}),action)
