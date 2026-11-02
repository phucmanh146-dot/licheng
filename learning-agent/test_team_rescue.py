"""Actual queued-run persistence with controlled worker fixtures; no network/model."""
import copy
import json
import threading
import unittest
from unittest.mock import patch
import learning_agent as agent
import rescue_service
import team_orchestrator as team
import team_rescue as linked
import test_handoff as fixtures


class LinkedRescueTests(unittest.TestCase):
    setUp = fixtures.HandoffTests.setUp
    tearDown = fixtures.HandoffTests.tearDown
    ctx = fixtures.HandoffTests.ctx
    prepared = fixtures.HandoffTests.prepared
    event = fixtures.HandoffTests.event

    def ready(self):
        self.prepared()
        with agent.connection() as c:
            c.executescript('CREATE TABLE runs(id TEXT PRIMARY KEY,kind TEXT,status TEXT,input TEXT,result TEXT,error TEXT,created TEXT); CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT,run_id TEXT,kind TEXT,message TEXT,created TEXT);')

    def request(self, **extra):
        task = next(t for t in self.p['plan']['tasks'] if t['task_id'] == 'G1:deliver')
        action_id = task['micro_steps'][0]['step_id'] if task.get('micro_steps') else 'step:1'
        return {**self.ctx(), 'expected_plan_version': 1, 'task_id': 'G1:deliver',
                'gap_id': 'G1', 'action_id': action_id, 'note': '人工测试：不知道如何保存结果', **extra}

    def queue(self, **extra):
        # Use real submit/input validation and SQLite. Isolate the semaphore and
        # suppress only worker execution so this test never calls a model.
        with patch.object(agent, 'GATE', threading.BoundedSemaphore(3)), \
             patch.object(agent.EXECUTOR, 'submit'), \
             patch.object(rescue_service, 'public_config', return_value={'configured': True}):
            self.p = linked.start(self.request(**extra))
        return self.p['rescue_requests'][-1]

    def finish(self, record, status='completed', error=None):
        result = {'type': 'controlled-worker-fixture', 'advice': '人工测试：先保存输入版本，再记录输出'}
        with agent.connection() as c:
            c.execute('UPDATE runs SET status=?,result=?,error=? WHERE id=?', (status, json.dumps(result), error, record['run_id']))

    def test_model_not_configured_does_not_queue_or_write(self):
        self.ready()
        with patch.object(rescue_service, 'public_config', return_value={'configured': False}), self.assertRaises(rescue_service.RescueError) as caught:
            linked.start(self.request())
        self.assertEqual(caught.exception.code, 'CONFIG_REQUIRED')
        self.assertEqual(team.state(self.p['project_id'])['version'], self.p['version'])
        with agent.connection() as c: self.assertEqual(c.execute('SELECT COUNT(*) FROM runs').fetchone()[0], 0)

    def test_wrong_task_gap_action_and_stale_version_never_submit(self):
        self.ready()
        for field, value in [('task_id', 'foreign'), ('gap_id', 'foreign'), ('action_id', 'foreign'), ('expected_plan_version', 99)]:
            with self.subTest(field=field), patch.object(agent, 'submit') as submit, self.assertRaises(ValueError):
                linked.start(self.request(**{field: value}))
            submit.assert_not_called()

    def test_uploaded_frame_removed_from_logs_and_task_unchanged(self):
        self.ready(); original = copy.deepcopy(self.p['plan'])
        frame = {'timestamp': 0, 'image': 'data:image/jpeg;base64,/9j/2Q=='}
        record = self.queue(frames=[frame], mediaKind='image')
        self.assertEqual(self.p['plan'], original)
        with agent.connection() as c:
            row = c.execute('SELECT input FROM runs WHERE id=?', (record['run_id'],)).fetchone()
        stored = json.loads(row['input'])
        self.assertNotIn('frames', stored)
        self.assertEqual(stored['team_context']['action_id'], self.request()['action_id'])
        self.assertNotIn(frame['image'], agent.dump(self.p))

    def test_duplicate_active_help_rejected_and_other_project_cannot_sync(self):
        self.ready(); record = self.queue()
        with patch.object(rescue_service, 'public_config', return_value={'configured': True}), self.assertRaises(team.Conflict):
            linked.start(self.request())
        other = team.create({'goal': '另一个项目'})
        with self.assertRaisesRegex(ValueError, '不属于当前项目'):
            linked.sync({'project_id': other['project_id'], 'expected_version': other['version'], 'incident_id': record['incident_id']})

    def test_sync_persists_advice_idempotently_without_completing_task(self):
        self.ready(); record = self.queue()
        self.assertEqual(linked.sync({**self.ctx(), 'incident_id': record['incident_id']})['version'], self.p['version'])
        self.finish(record)
        self.p = linked.sync({**self.ctx(), 'incident_id': record['incident_id']})
        self.assertEqual(self.p['rescue_requests'][0]['result']['type'], 'controlled-worker-fixture')
        self.assertFalse(self.p['rescue_requests'][0]['stale'])
        self.assertEqual(self.p['plan']['tasks'][0]['status'], 'candidate')
        version = self.p['version']
        self.p = linked.sync({**self.ctx(), 'incident_id': record['incident_id']})
        self.assertEqual(self.p['version'], version)
        self.assertEqual(team.state(self.p['project_id'])['rescue_requests'], self.p['rescue_requests'])

    def test_new_diagnosis_makes_help_historical_and_failed_run_stays_failed(self):
        self.ready(); record = self.queue()
        d = copy.deepcopy(self.p['diagnosis']); d['diagnosis_version'] = 2
        self.p = team.diagnosis({**self.ctx(), 'diagnosis': d})
        self.finish(record, status='failed', error='受控模型失败夹具')
        self.p = linked.sync({**self.ctx(), 'incident_id': record['incident_id']})
        self.assertTrue(self.p['rescue_requests'][0]['stale'])
        self.assertEqual(self.p['rescue_requests'][0]['status'], 'failed')
        self.assertEqual(self.p['plan']['tasks'][0]['status'], 'candidate')
        self.assertTrue(self.p['plan_stale'])

    def test_already_saved_answer_becomes_historical_after_later_input(self):
        self.ready(); record = self.queue(); self.finish(record)
        self.p = linked.sync({**self.ctx(), 'incident_id': record['incident_id']})
        self.assertFalse(self.p['rescue_requests'][0]['stale'])
        import team_dispatch
        self.p = team_dispatch.brief({**self.ctx(), 'content': '新增材料，需重新核对'})
        self.assertTrue(team.state(self.p['project_id'])['rescue_requests'][0]['stale'])


if __name__ == '__main__': unittest.main()
