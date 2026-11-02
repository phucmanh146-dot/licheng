"""Independent review must reject executor identities through receipt and approval."""
import copy
import unittest
import team_orchestrator as team
import team_handoff as handoff
import test_captain_review_gates as fixture_module

class IndependentReviewTests(unittest.TestCase):
    setUp = fixture_module.CaptainReviewGateTests.setUp
    tearDown = fixture_module.CaptainReviewGateTests.tearDown
    ctx = fixture_module.CaptainReviewGateTests.ctx
    setup_inputs = fixture_module.CaptainReviewGateTests.setup_inputs
    upload = fixture_module.CaptainReviewGateTests.upload
    model_context = fixture_module.CaptainReviewGateTests.model_context
    diagnose = fixture_module.CaptainReviewGateTests.diagnose
    plan = fixture_module.CaptainReviewGateTests.plan
    event = fixture_module.CaptainReviewGateTests.event
    submitted = fixture_module.CaptainReviewGateTests.submitted
    packet = fixture_module.CaptainReviewGateTests.packet
    approve = fixture_module.CaptainReviewGateTests.approve

    def test_submission_snapshots_executors(self):
        self.submitted()
        saved = team.state(self.p['project_id'])
        self.assertEqual(saved['plan']['tasks'][0]['submission']['executor_ids'], ['member-a'])

    def test_self_review_receipt_rejected_without_mutation(self):
        self.submitted()
        before = team.state(self.p['project_id'])
        packet = self.packet(); packet['reviewer_id'] = 'member-a'
        with self.assertRaisesRegex(ValueError, '执行者'):
            handoff.receive_review({**self.ctx(), 'review': packet})
        self.assertEqual(before, team.state(self.p['project_id']))

    def test_self_approval_rejected_even_after_independent_receipt(self):
        self.submitted()
        self.p = handoff.receive_review({**self.ctx(), 'review': self.packet()})
        before = team.state(self.p['project_id'])
        with self.assertRaisesRegex(ValueError, '执行者'):
            self.event('approve', reviewer_id='member-a', criterion_results=self.packet()['criterion_results'])
        self.assertEqual(before, team.state(self.p['project_id']))

    def test_actual_executor_override_prevents_delegated_self_review(self):
        self.setup_inputs(); self.diagnose(); self.plan(); self.event('start')
        self.upload('有效分母=2；缺失人数=1', purpose='submission')
        self.event('submit', artifact_id='report', artifact_version=2, actual_minutes=1,
                   evidence='controlled', executor_ids=['member-reviewer'])
        with self.assertRaisesRegex(ValueError, '执行者'):
            handoff.receive_review({**self.ctx(), 'review': self.packet()})

    def test_all_coexecutors_are_excluded(self):
        self.setup_inputs(); self.diagnose(); self.plan(); self.event('start')
        self.upload('有效分母=2；缺失人数=1', purpose='submission')
        self.event('submit', artifact_id='report', artifact_version=2, actual_minutes=1,
                   evidence='controlled', executor_ids=['member-a','member-reviewer'])
        for member in ('member-a','member-reviewer'):
            packet = self.packet(); packet['reviewer_id'] = member
            with self.subTest(member=member), self.assertRaisesRegex(ValueError, '执行者'):
                handoff.receive_review({**self.ctx(), 'review': packet})

    def test_invalid_executor_records_do_not_persist(self):
        self.setup_inputs(); self.diagnose(); self.plan(); self.event('start')
        for values in ([], ['missing'], ['member-a','member-a'], 'member-a', [False]):
            before = team.state(self.p['project_id'])
            with self.subTest(values=values), self.assertRaises(ValueError):
                self.event('submit', artifact_id='report', artifact_version=1,
                    actual_minutes=1, evidence='controlled', executor_ids=values)
            self.assertEqual(before, team.state(self.p['project_id']))

    def test_independent_review_remains_pending_until_confirmation(self):
        self.submitted()
        self.p = handoff.receive_review({**self.ctx(), 'review': self.packet()})
        self.assertEqual(self.p['plan']['tasks'][0]['status'], 'pending_review')
        self.approve()
        self.assertEqual(team.state(self.p['project_id'])['plan']['tasks'][0]['status'], 'completed')

    def test_legacy_submission_conservatively_uses_owners(self):
        p={'artifact_storage_required': True}
        t={'kind':'production','owner_ids':['member-a'],'submission':{}}
        with self.assertRaisesRegex(ValueError,'执行者'):
            team.assert_independent_reviewer(p,t,'member-a')
        team.assert_independent_reviewer(p,t,'member-reviewer')

    def test_model_review_without_independent_candidate_fails_before_call(self):
        import team_ai as ai
        from unittest.mock import patch
        self.submitted()
        p=copy.deepcopy(self.p)
        p['diagnosis']['member_profiles']=[m for m in p['diagnosis']['member_profiles'] if m['member_id']=='member-a']
        request=handoff.review_request(p,'G1:deliver')
        with patch.object(ai.rescue,'complete') as model:
            with self.assertRaisesRegex(ValueError,'非执行者'):
                ai.reviewer(p,request)
        model.assert_not_called()

if __name__ == '__main__': unittest.main()
