"""Human-authored fixtures verify the captain contract, not AI generation quality."""
import copy
import json
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import test_team
import team_orchestrator as team


def diagnosis_fixture(project):
    d = team.demo_researcher(project)
    d['artifact_versions'] = [
        {'artifact_id': 'brief', 'artifact_version': 1, 'title': '测试说明文档'},
        {'artifact_id': 'data', 'artifact_version': 2, 'title': '测试数据表'},
    ]
    d['gaps'][0].update(
        current_evidence='测试夹具：说明文档第2节仍引用旧数字',
        current_artifact={'artifact_id': 'brief', 'artifact_version': 1},
        current_locator='说明文档第2节「结果」第一段',
        target_result='修订第2节并保留数字的出处与前后差异',
        target_locator='说明文档第2节「结果」第一段',
        reason='旧数字与测试数据表第2行不一致',
        applicability='此例验证数据变化后的文档修订；不假设所有任务都需要改文档',
        verification_method='对照测试数据表第2行，逐项核对修订稿与差异记录',
    )
    return d


def plan_fixture(d, project):
    plan = team.demo_planner(d, project)
    task = plan['tasks'][0]
    task.update(title='修订测试说明文档第2节', deliverable='第2节修订稿 v2 与差异记录',
                acceptance_criteria=['修订数字与测试数据表一致', '差异记录注明材料版本与位置'])
    task['micro_steps'] = [{
        'step_id': 'S1', 'input_version': {'artifact_id': 'brief', 'artifact_version': 1},
        'target_locator': '说明文档第2节「结果」第一段',
        'action': '对照测试数据表第2行，替换第2节的旧数字并记录出处',
        'reason': '先校正内容依据，再处理表达与排版',
        'expected_change': '第一段数字与测试数据表一致，读者可追溯出处',
        'output': '第2节修订稿 v2；差异记录包含旧值、新值与数据版本',
        'self_check': '逐项比对测试数据表第2行，并确认差异记录写有 v1 → v2',
        'failure_next': '若数据口径不一致，保留旧值并把具体行号交 A 核对',
        'capability_basis': '这是人工测试夹具；实际操作能力需成员提供证据后判断',
        'source_refs': ['input'],
    }]
    return plan


class GuidanceTests(unittest.TestCase):
    setUp = test_team.TeamTests.setUp
    tearDown = test_team.TeamTests.tearDown
    ctx = test_team.TeamTests.ctx

    def planned(self):
        self.p = team.diagnosis({**self.ctx(), 'diagnosis': diagnosis_fixture(self.p)})
        self.p = team.propose({**self.ctx(), 'plan': plan_fixture(self.p['diagnosis'], self.p), 'reason': '人工夹具'})
        self.p = team.apply({**self.ctx(), 'proposal_id': self.p['proposal']['id']})

    def feedback(self, action, **extra):
        self.p = team.feedback({**self.ctx(), 'task_id': 'T1', 'expected_plan_version': 1,
                                'action': action, 'note': '人工检查记录', **extra})

    def submitted(self):
        self.planned()
        self.feedback('start')
        self.feedback('submit', artifact_id='brief', artifact_version=2, actual_minutes=12,
                      evidence='人工测试成果：第2节修订稿与差异记录')

    def results(self):
        return [{'criterion': x, 'passed': True, 'evidence': '人工夹具：已对照第2行和版本记录'}
                for x in self.p['plan']['tasks'][0]['acceptance_criteria']]

    def test_legacy_diagnosis_and_plan_remain_supported(self):
        self.p = team.demo(self.ctx())
        self.p = team.apply({**self.ctx(), 'proposal_id': self.p['proposal']['id']})
        self.assertNotIn('micro_steps', self.p['plan']['tasks'][0])

    def test_detailed_guidance_survives_readback_without_live_claim(self):
        self.planned()
        saved = team.state(self.p['project_id'])
        self.assertEqual(saved['diagnosis']['gaps'][0]['current_locator'], '说明文档第2节「结果」第一段')
        self.assertEqual(saved['plan']['tasks'][0]['micro_steps'][0]['input_version']['artifact_version'], 1)
        self.assertFalse(saved['live_verified'])

    def test_artifact_catalog_duplicates_and_invalid_versions(self):
        for version in (0, True, '1'):
            with self.subTest(version=version):
                d = diagnosis_fixture(self.p)
                d['artifact_versions'][0]['artifact_version'] = version
                with self.assertRaises(ValueError): team.validate_diagnosis(d)
        d = diagnosis_fixture(self.p)
        d['artifact_versions'].append(copy.deepcopy(d['artifact_versions'][0]))
        with self.assertRaisesRegex(ValueError, '重复'): team.validate_diagnosis(d)

    def test_gap_cannot_reference_unregistered_artifact_version(self):
        d = diagnosis_fixture(self.p)
        d['gaps'][0]['current_artifact']['artifact_version'] = 99
        with self.assertRaisesRegex(ValueError, '未登记'): team.diagnosis({**self.ctx(), 'diagnosis': d})
        self.assertEqual(team.state(self.p['project_id'])['version'], self.p['version'])

    def test_invalid_optional_locator_does_not_save(self):
        d = diagnosis_fixture(self.p)
        d['gaps'][0]['current_locator'] = {'invented': 'object'}
        with self.assertRaisesRegex(ValueError, 'current_locator'): team.validate_diagnosis(d)

    def test_micro_step_unknown_version_does_not_save_preview(self):
        self.p = team.diagnosis({**self.ctx(), 'diagnosis': diagnosis_fixture(self.p)})
        plan = plan_fixture(self.p['diagnosis'], self.p)
        plan['tasks'][0]['micro_steps'][0]['input_version']['artifact_version'] = 99
        with self.assertRaisesRegex(ValueError, '未登记'):
            team.propose({**self.ctx(), 'plan': plan, 'reason': '不可接受'})
        self.assertIsNone(team.state(self.p['project_id'])['proposal'])

    def test_micro_steps_require_concrete_fields_and_unique_ids(self):
        d = diagnosis_fixture(self.p)
        for key in ('action', 'reason', 'output', 'self_check', 'failure_next', 'capability_basis'):
            with self.subTest(key=key):
                plan = plan_fixture(d, self.p)
                plan['tasks'][0]['micro_steps'][0].pop(key)
                with self.assertRaisesRegex(ValueError, key): team.validate_plan(plan, d)
        plan = plan_fixture(d, self.p)
        plan['tasks'][0]['micro_steps'] *= 2
        with self.assertRaisesRegex(ValueError, '重复'): team.validate_plan(plan, d)

    def test_micro_step_unknown_source_is_rejected(self):
        d = diagnosis_fixture(self.p)
        plan = plan_fixture(d, self.p)
        plan['tasks'][0]['micro_steps'][0]['source_refs'] = ['invented']
        with self.assertRaisesRegex(ValueError, '来源'): team.validate_plan(plan, d)

    def test_fine_task_approval_requires_each_criterion(self):
        self.submitted()
        for extra in ({}, {'criterion_results': self.results()[:1]}):
            with self.subTest(extra=extra):
                with self.assertRaises(ValueError): self.feedback('approve', reviewer_id='A', **extra)
        self.assertEqual(team.state(self.p['project_id'])['plan']['tasks'][0]['status'], 'pending_review')

    def test_unpassed_or_unobserved_criterion_cannot_mark_complete(self):
        self.submitted()
        for key, value in (('passed', False), ('passed', 'true'), ('evidence', ''), ('criterion', '伪造条件')):
            with self.subTest(key=key, value=value):
                results = self.results()
                results[0][key] = value
                with self.assertRaises(ValueError):
                    self.feedback('approve', reviewer_id='A', criterion_results=results)
        self.assertEqual(team.state(self.p['project_id'])['plan']['tasks'][0]['status'], 'pending_review')

    def test_criterion_evidence_and_submitted_version_are_preserved(self):
        self.submitted()
        self.feedback('approve', reviewer_id='A', criterion_results=self.results())
        task = team.state(self.p['project_id'])['plan']['tasks'][0]
        self.assertEqual(task['status'], 'completed')
        self.assertEqual(task['review']['artifact_version'], 2)
        self.assertEqual(len(task['review']['criterion_results']), 2)

    def test_returned_task_keeps_guidance_and_submission(self):
        self.submitted()
        self.feedback('reject', reviewer_id='A')
        self.assertEqual(self.p['plan']['tasks'][0]['status'], 'in_progress')
        self.assertEqual(self.p['plan']['tasks'][0]['submission']['artifact_version'], 2)
        self.assertEqual(len(self.p['plan']['tasks'][0]['micro_steps']), 1)

    def test_http_invalid_nested_object_returns_400(self):
        from learning_agent_server import Handler, ThreadingHTTPServer
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        d = diagnosis_fixture(self.p)
        d['artifact_versions'] = [None]
        request = Request(f'http://127.0.0.1:{server.server_port}/api/agent/team/diagnosis',
                          data=json.dumps({**self.ctx(), 'diagnosis': d}).encode(),
                          headers={'Content-Type': 'application/json'})
        try:
            with self.assertRaises(HTTPError) as error: urlopen(request)
            self.assertEqual(error.exception.code, 400)
        finally:
            server.shutdown(); server.server_close(); thread.join()


if __name__ == '__main__':
    unittest.main()
