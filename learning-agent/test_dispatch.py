import copy
import threading
import unittest
import json
from urllib.request import Request, urlopen
from unittest.mock import patch
import test_team
import team_orchestrator as team
import team_dispatch as dispatch


class DispatchTests(unittest.TestCase):
    setUp = test_team.TeamTests.setUp
    tearDown = test_team.TeamTests.tearDown
    ctx = test_team.TeamTests.ctx

    def test_demo_waits_for_confirmation(self):
        self.p = dispatch.dispatch(self.ctx())
        self.assertEqual(self.p['dispatch']['status'], 'succeeded')
        self.assertEqual(self.p['dispatch_status']['stage'], 'confirm')
        self.assertIsNone(self.p['plan'])
        self.assertFalse(self.p['live_verified'])
        with self.assertRaises(ValueError):
            dispatch.dispatch(self.ctx())

    def test_live_missing_provider_does_not_write(self):
        self.p = team.create({'goal': '真实项目', 'mode': 'live'})
        with self.assertRaisesRegex(ValueError, '尚未接入'):
            dispatch.dispatch(self.ctx())
        self.assertEqual(team.state(self.p['project_id'])['version'], self.p['version'])

    def test_B_failure_retries_only_B_and_hides_secrets(self):
        self.p = team.create({'goal': '真实模块夹具', 'mode': 'live'})
        calls = []
        def researcher(p):
            calls.append('A')
            return team.demo_researcher(p)
        def fail(*args):
            raise RuntimeError('secret-token-must-not-appear')
        with patch.object(dispatch, 'RESEARCHER', researcher), patch.object(dispatch, 'PLANNER', fail):
            self.p = dispatch.dispatch(self.ctx())
        self.assertEqual(self.p['dispatch']['stage'], 'B')
        self.assertNotIn('secret-token', str(self.p))
        version = self.p['diagnosis']['diagnosis_version']
        with patch.object(dispatch, 'RESEARCHER', researcher), patch.object(dispatch, 'PLANNER', team.demo_planner):
            self.p = dispatch.dispatch(self.ctx())
        self.assertEqual(calls, ['A'])
        self.assertEqual(self.p['diagnosis']['diagnosis_version'], version)
        self.assertEqual(self.p['dispatch']['status'], 'succeeded')

    def test_A_validation_failure_keeps_stage(self):
        with patch.object(team, 'demo_researcher', lambda p: {}):
            self.p = dispatch.dispatch(self.ctx())
        self.assertIsNone(self.p['diagnosis'])
        self.assertEqual(self.p['dispatch']['status'], 'failed')
        self.assertEqual(self.p['dispatch_status']['stage'], 'A')

    def test_new_information_invalidates_preview_and_preserves_progress(self):
        self.p = dispatch.dispatch(self.ctx())
        self.p = team.apply({**self.ctx(), 'proposal_id': self.p['proposal']['id']})
        self.p = team.feedback({**self.ctx(), 'expected_plan_version': 1, 'task_id': 'T1', 'action': 'start', 'note': '开始'})
        self.p = dispatch.brief({**self.ctx(), 'content': '新增成果要求，需 A 重新核对'})
        self.assertTrue(self.p['plan_stale'])
        self.assertEqual(self.p['plan']['tasks'][0]['status'], 'in_progress')
        self.assertEqual(self.p['dispatch_status']['stage'], 'A')
        with self.assertRaises(ValueError):
            team.propose({**self.ctx(), 'plan': copy.deepcopy(self.p['plan']), 'reason': '旧诊断'})

    def test_concurrent_run_and_new_input_cannot_be_overwritten(self):
        entered, release = threading.Event(), threading.Event()
        original = team.demo_researcher
        def slow(p):
            entered.set()
            release.wait(5)
            return original(p)
        result = []
        with patch.object(team, 'demo_researcher', slow):
            worker = threading.Thread(target=lambda: result.append(dispatch.dispatch(self.ctx())))
            worker.start()
            try:
                self.assertTrue(entered.wait(3))
                self.p = team.state(self.p['project_id'])
                with self.assertRaises(team.Conflict):
                    dispatch.dispatch(self.ctx())
                self.p = dispatch.brief({**self.ctx(), 'content': '运行期间新增材料'})
            finally:
                release.set()
                worker.join(5)
        saved = team.state(self.p['project_id'])
        self.assertIsNone(saved['diagnosis'])
        self.assertEqual(saved['brief_history'][0]['content'], '运行期间新增材料')
        self.assertEqual(saved['dispatch']['status'], 'failed')

    def test_restart_can_resume_persisted_A(self):
        self.p = team.demo(self.ctx())
        self.p['proposal'] = None
        self.p['dispatch'] = {'status': 'running', 'stage': 'B', 'boot_id': 'old-process'}
        self.p = team.commit(self.p, self.p['version'], '模拟服务中断')
        self.assertTrue(self.p['dispatch_status']['interrupted'])
        with patch.object(team, 'demo_researcher', side_effect=AssertionError('不可重复 A')):
            self.p = dispatch.dispatch(self.ctx())
        self.assertEqual(self.p['dispatch']['status'], 'succeeded')

    def test_http_dispatch_brief_and_resume(self):
        from learning_agent_server import Handler, ThreadingHTTPServer
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f'http://127.0.0.1:{server.server_port}/api/agent/team'
        def post(route, extra=None):
            request = Request(base + '/' + route,
                              data=json.dumps({**self.ctx(), **(extra or {})}).encode(),
                              headers={'Content-Type': 'application/json'})
            with urlopen(request) as response:
                return json.load(response)
        try:
            self.p = post('dispatch')
            self.assertEqual(self.p['dispatch_status']['stage'], 'confirm')
            self.p = post('brief', {'content': '补充验收要求'})
            self.assertEqual(self.p['dispatch_status']['stage'], 'A')
            self.assertIsNone(self.p['proposal'])
            self.p = post('dispatch')
            with urlopen(base + '?id=' + self.p['project_id']) as response:
                saved = json.load(response)
            self.assertEqual(saved['diagnosis']['diagnosis_version'], 2)
            self.assertEqual(saved['dispatch']['status'], 'succeeded')
            self.assertIsNone(saved['plan'])
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
