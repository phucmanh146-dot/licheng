"""Captain boundaries over actual SQLite/materials; model replies are controlled."""
import copy
import json
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import team_handoff as handoff
import team_orchestrator as team
import test_general_loop as fixtures
from learning_agent_server import Handler, ThreadingHTTPServer


class CaptainReviewGateTests(unittest.TestCase):
    setUp = fixtures.GeneralLoopTests.setUp
    tearDown = fixtures.GeneralLoopTests.tearDown
    ctx = fixtures.GeneralLoopTests.ctx
    setup_inputs = fixtures.GeneralLoopTests.setup_inputs
    upload = fixtures.GeneralLoopTests.upload
    model_context = fixtures.GeneralLoopTests.model_context
    diagnose = fixtures.GeneralLoopTests.diagnose
    plan = fixtures.GeneralLoopTests.plan
    event = fixtures.GeneralLoopTests.event
    submitted = fixtures.GeneralLoopTests.submitted
    packet = fixtures.GeneralLoopTests.packet

    def approve(self):
        self.event('approve', reviewer_id='member-reviewer', criterion_results=[{
            'criterion': '写明有效分母和缺失人数', 'passed': True,
            'evidence': '人工确认实际新版line:1的分母与缺失人数'}])

    def test_direct_approval_cannot_skip_A_review_receipt(self):
        self.submitted()
        version = self.p['version']
        with self.assertRaisesRegex(ValueError, 'A.*复核'):
            self.approve()
        saved = team.state(self.p['project_id'])
        self.assertEqual(saved['version'], version)
        self.assertEqual(saved['plan']['tasks'][0]['status'], 'pending_review')

    def test_received_review_still_needs_confirmation_and_keeps_review_id(self):
        self.submitted()
        self.p = handoff.receive_review({**self.ctx(), 'review': self.packet()})
        self.assertEqual(self.p['plan']['tasks'][0]['status'], 'pending_review')
        self.approve()
        saved = team.state(self.p['project_id'])
        self.assertEqual(saved['plan']['tasks'][0]['status'], 'completed')
        self.assertEqual(saved['plan']['tasks'][0]['review']['review_id'], 'controlled-review')

    def test_old_review_after_plan_change_waits_for_current_review(self):
        self.submitted()
        self.p = handoff.receive_review({**self.ctx(), 'review': self.packet()})
        draft = copy.deepcopy(self.p['plan'])
        draft['plan_version'] += 1
        self.p = team.propose({**self.ctx(), 'plan': draft, 'reason': '保留待复核任务，更新计划版本'})
        self.p = team.apply({**self.ctx(), 'proposal_id': self.p['proposal']['id']})
        version = self.p['version']
        with self.assertRaises(team.Conflict):
            self.approve()
        self.assertEqual(team.state(self.p['project_id'])['version'], version)
        self.assertEqual(self.p['plan']['tasks'][0]['status'], 'pending_review')
        packet = self.packet()
        packet['review_id'] = 'current-plan-review'
        self.p = handoff.receive_review({**self.ctx(), 'review': packet})
        self.approve()
        self.assertEqual(self.p['plan']['tasks'][0]['review']['review_id'], 'current-plan-review')

    def test_missing_micro_actions_survive_first_preview_and_remaining_replan(self):
        for adopted in (False, True):
            with self.subTest(adopted=adopted):
                self.p = team.create({'goal': '受控案例：缺证据的生产任务', 'mode': 'live'})
                self.setup_inputs()
                self.diagnose()
                if adopted:
                    self.plan()
                diagnosis = copy.deepcopy(self.p['diagnosis'])
                diagnosis['diagnosis_version'] += 1
                diagnosis['gaps'][0]['verification_status'] = 'unknown'
                diagnosis['gaps'][0].pop('micro_steps', None)
                self.p = team.diagnosis({**self.ctx(), 'diagnosis': diagnosis})
                self.p = handoff.generate(self.ctx())
                draft = self.p['proposal']['plan']
                task = next(t for t in draft['tasks'] if t['task_id'] == 'G1:deliver')
                self.assertEqual(task['status'], 'blocked')
                self.assertEqual(task['execution_readiness'], 'blocked_missing_grounded_micro_steps')
                self.assertTrue(any(x.get('task_id') == task['task_id'] for x in draft['unscheduled']))
                self.p = team.apply({**self.ctx(), 'proposal_id': self.p['proposal']['id']})
                version = self.p['version']
                with self.assertRaises(ValueError):
                    self.event('start')
                self.assertEqual(team.state(self.p['project_id'])['version'], version)
                self.assertEqual(self.p['plan']['tasks'][0]['status'], 'blocked')

    def test_HTTP_confirmation_requires_review_then_persists_exact_receipt(self):
        self.submitted()
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = 'http://127.0.0.1:' + str(server.server_port) + '/api/agent/team/'

        def post(path, data):
            request = Request(base + path, data=json.dumps(data).encode(),
                              headers={'Content-Type': 'application/json'})
            with urlopen(request) as response:
                return json.load(response)

        def approval():
            return {**self.ctx(), 'expected_plan_version': self.p['plan']['plan_version'],
                    'task_id': 'G1:deliver', 'action': 'approve', 'note': '人工确认受控新版',
                    'reviewer_id': 'member-reviewer', 'criterion_results': self.packet()['criterion_results']}

        try:
            version = self.p['version']
            with self.assertRaises(HTTPError) as error:
                post('feedback', approval())
            self.assertEqual(error.exception.code, 400)
            self.assertEqual(team.state(self.p['project_id'])['version'], version)
            self.p = post('review-receive', {**self.ctx(), 'review': self.packet()})
            self.assertEqual(self.p['plan']['tasks'][0]['status'], 'pending_review')
            self.p = post('feedback', approval())
            saved = team.state(self.p['project_id'])
            self.assertEqual(saved['plan']['tasks'][0]['review']['review_id'], 'controlled-review')
            self.assertEqual(saved['dispatch_status']['stage'], 'followup')
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
