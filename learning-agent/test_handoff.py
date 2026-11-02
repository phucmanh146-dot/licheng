"""Actual B rules, human-authored A packets; no live AI claims."""
import copy
import json
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch
import test_team
import team_orchestrator as team
import team_dispatch as dispatch
import team_handoff as handoff


def diagnosis_fixture(context=None, skills=None):
    d = team.demo_researcher(context or {'goal': '人工测试目标'})
    d['unknowns'] = ['人工验收夹具，不是 A 模型产出']
    d['artifact_versions'] = [{'artifact_id':'fixture-input','artifact_version':1,'title':'人工测试输入材料'}]
    gap = d['gaps'][0]
    gap.update(target_result='提交一次可复查的接口记录',
               required_capabilities=skills or [],
               acceptance_criteria=['记录输入版本', '记录执行结果与证据'],
               current_artifact={'artifact_id':'fixture-input','artifact_version':1},
               current_locator='fixture:line:1',
               current_evidence='人工夹具：交接材料输入版本需被核对',
               extract_pattern='提取输入版本→实际执行→结果证据的可复核记录结构，不复制外部作品',
               steps=['打开当前交接材料核对输入版本', '执行一次接口并保存结果', '逐条核对并提交证据'],
               micro_steps=[{'step_id':'G1-step-1','input_version':{'artifact_id':'fixture-input','artifact_version':1},
                   'target_locator':'fixture:line:1','action':'核对当前交接材料的输入版本，并记录实际接口调用的请求与响应',
                   'reason':'当前交接必须留下能回查的真实输入和结果','expected_change':'记录中同时包含输入版本、请求摘要、响应状态与结果',
                   'output':'接口执行记录.md','self_check':'检查记录中的输入版本与请求/响应是否齐全',
                   'failure_next':'若无法核对版本，暂停执行并请队长补齐材料目录','capability_basis':'人工验收夹具；不代表能力已验证',
                   'source_refs':['input'] }])
    return d


class HandoffTests(unittest.TestCase):
    setUp = test_team.TeamTests.setUp
    tearDown = test_team.TeamTests.tearDown
    ctx = test_team.TeamTests.ctx

    def prepared(self, skills=None):
        self.p = team.create({'goal': '真实模式人工验收夹具', 'mode': 'live'})
        self.p = team.diagnosis({**self.ctx(), 'diagnosis': diagnosis_fixture(skills=skills)})
        self.p = handoff.generate(self.ctx())
        self.p = team.apply({**self.ctx(), 'proposal_id': self.p['proposal']['id']})

    def event(self, action, task_id='G1:deliver', **extra):
        self.p = team.feedback({**self.ctx(), 'expected_plan_version': self.p['plan']['plan_version'],
                                'task_id': task_id, 'action': action, 'note': '人工核对记录', **extra})

    def submitted(self):
        self.prepared()
        self.event('start')
        self.event('submit', artifact_id='interface-record', artifact_version=2,
                   actual_minutes=12, evidence='人工夹具：输入和输出记录')

    def review(self, passed=True, gap_status='closed'):
        t = self.p['plan']['tasks'][0]
        return {'review_id': 'review-1', 'task_id': t['task_id'], 'reviewer_id': 'A',
                'plan_version': self.p['plan']['plan_version'],
                'diagnosis_version': self.p['diagnosis']['diagnosis_version'],
                'artifact_id': t['submission']['artifact_id'], 'artifact_version': 2,
                'method': 'manual', 'note': '人工夹具，逐条复核，尚未独立读取文件',
                'criterion_results': [{'criterion': c, 'passed': passed, 'evidence': '人工夹具：对应证据位置'}
                                      for c in t['acceptance_criteria']],
                'gap_results': [{'gap_id': 'G1', 'status': gap_status, 'evidence': '人工夹具：新旧结果比较',
                                 **({'remaining_issue': '还需真实场景验证'} if gap_status != 'closed' else {})}]}

    def test_empty_A_template_and_missing_criteria_cannot_generate(self):
        d = diagnosis_fixture(); d['gaps'] = []
        self.assertFalse(handoff.check_diagnosis(d)['ready_for_B'])
        d = diagnosis_fixture(); del d['gaps'][0]['acceptance_criteria']
        self.assertFalse(handoff.check_diagnosis(d)['ready_for_B'])
        self.p = team.diagnosis({**self.ctx(), 'diagnosis': d})
        with self.assertRaisesRegex(ValueError, 'acceptance_criteria'):
            handoff.generate(self.ctx())
        self.assertEqual(team.state(self.p['project_id'])['version'], self.p['version'])

    def test_B_code_generates_preview_and_enforces_learning_dependencies(self):
        d = diagnosis_fixture(skills=['接口记录'])
        self.p = team.diagnosis({**self.ctx(), 'diagnosis': d})
        self.p = handoff.generate(self.ctx())
        self.assertIsNone(self.p['plan'])
        self.assertEqual(self.p['proposal']['plan']['handoff_provenance']['source_commit'], handoff.B_SOURCE_COMMIT)
        self.assertEqual(len(self.p['proposal']['plan']['tasks']), 3)
        self.p = team.apply({**self.ctx(), 'proposal_id': self.p['proposal']['id']})
        with self.assertRaisesRegex(ValueError, '前置任务'):
            self.event('start')
        self.event('start', task_id='G1:captain:0:learn')
        self.assertFalse(self.p['live_verified'])

    def test_verified_skill_skips_only_learning_and_external_dependency_blocks_start(self):
        d = diagnosis_fixture(skills=['接口记录'])
        d['member_profiles'][0]['verified_capabilities'] = ['接口记录']
        d['gaps'][0]['depends_on_gap_ids'] = ['not-yet-delivered']
        self.p = team.diagnosis({**self.ctx(), 'diagnosis': d})
        self.p = handoff.generate(self.ctx())
        self.assertEqual(len(self.p['proposal']['plan']['tasks']), 1)
        self.p = team.apply({**self.ctx(), 'proposal_id': self.p['proposal']['id']})
        with self.assertRaisesRegex(ValueError, '外部前置成果'):
            self.event('start')

    def test_incremental_A_addition_preserves_completed_task_and_evidence(self):
        self.prepared(); self.event('start')
        self.event('submit', artifact_id='record', artifact_version=1, actual_minutes=10, evidence='实际记录')
        self.event('approve', reviewer_id='A', criterion_results=[
            {'criterion':c,'passed':True,'evidence':'人工夹具：逐条核对本次提交的执行记录'}
            for c in self.p['plan']['tasks'][0]['acceptance_criteria']])
        original = copy.deepcopy(self.p['plan']['tasks'][0])
        d = copy.deepcopy(self.p['diagnosis']); d['diagnosis_version'] = 2
        extra = copy.deepcopy(d['gaps'][0]); extra['gap_id'] = 'G2'; extra['target_result'] = '第二次交接记录'
        d['gaps'].append(extra)
        self.p = team.diagnosis({**self.ctx(), 'diagnosis': d})
        self.assertEqual(self.p['plan_diagnosis']['diagnosis_version'], 1)
        self.p = handoff.generate(self.ctx())
        preserved = next(t for t in self.p['proposal']['plan']['tasks'] if t['task_id'] == original['task_id'])
        self.assertEqual(preserved, original)
        self.assertEqual(len(self.p['proposal']['plan']['tasks']), 2)

    def test_changed_A_requirement_cannot_overwrite_started_work(self):
        self.prepared(); self.event('start')
        original = copy.deepcopy(self.p['plan'])
        d = copy.deepcopy(self.p['diagnosis']); d['diagnosis_version'] = 2
        d['gaps'][0]['target_result'] = '改变交付目标'
        self.p = team.diagnosis({**self.ctx(), 'diagnosis': d})
        with self.assertRaisesRegex(team.Conflict, '受保护'):
            handoff.generate(self.ctx())
        saved = team.state(self.p['project_id'])
        self.assertEqual(saved['plan'], original)
        self.assertIsNone(saved['proposal'])

    def test_dispatch_uses_B_after_persisted_A_without_repeating_A(self):
        self.p = team.create({'goal': '已交付 A 的项目', 'mode': 'live'})
        self.p = team.diagnosis({**self.ctx(), 'diagnosis': diagnosis_fixture()})
        with patch.object(dispatch, 'PLANNER', handoff.planner), patch.object(dispatch, 'RESEARCHER', side_effect=AssertionError('不应再次调用 A')):
            self.p = dispatch.dispatch(self.ctx())
        self.assertEqual(self.p['dispatch']['status'], 'succeeded')
        self.assertEqual(self.p['proposal']['plan']['provider'], 'deterministic-action-planner')

    def test_review_export_exact_submission_and_receive_does_not_complete(self):
        self.submitted()
        request = handoff.review_request(self.p, 'G1:deliver')
        self.assertEqual(request['pending_tasks'][0]['submission']['artifact_version'], 2)
        self.p = handoff.receive_review({**self.ctx(), 'review': self.review()})
        self.assertEqual(self.p['plan']['tasks'][0]['status'], 'pending_review')
        self.assertFalse(self.p['artifact_reviews'][0]['content_independently_verified'])
        self.assertFalse(self.p['live_verified'])
        saved = team.state(self.p['project_id'])
        self.assertEqual(saved['artifact_reviews'], self.p['artifact_reviews'])

    def test_review_guards_wrong_versions_members_gap_and_criterion(self):
        self.submitted()
        cases = [('artifact_version', 99), ('plan_version', 99), ('diagnosis_version', 99), ('reviewer_id', 'stranger')]
        for key, value in cases:
            review = self.review(); review[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                handoff.receive_review({**self.ctx(), 'review': review})
        for field, change in [('gap_results', [{'gap_id': 'foreign', 'status': 'closed', 'evidence': '无关'}]),
                              ('criterion_results', [{'criterion': '不同标准', 'passed': True, 'evidence': '无关'}])]:
            review = self.review(); review[field] = change
            with self.subTest(field=field), self.assertRaises(ValueError):
                handoff.receive_review({**self.ctx(), 'review': review})
        self.assertEqual(team.state(self.p['project_id'])['version'], self.p['version'])

    def test_failed_review_blocks_approve_and_cannot_claim_closed_gap(self):
        self.submitted()
        with self.assertRaisesRegex(ValueError, '不能将对应差距'):
            handoff.receive_review({**self.ctx(), 'review': self.review(False, 'closed')})
        self.p = handoff.receive_review({**self.ctx(), 'review': self.review(False, 'remaining')})
        with self.assertRaisesRegex(ValueError, '验收条件未通过'):
            self.event('approve', reviewer_id='A')
        self.assertEqual(team.state(self.p['project_id'])['plan']['tasks'][0]['status'], 'pending_review')

    def test_task_can_pass_while_gap_remains_and_still_needs_human_evidence(self):
        self.submitted()
        review = self.review(True, 'remaining')
        self.p = handoff.receive_review({**self.ctx(), 'review': review})
        with self.assertRaisesRegex(ValueError, 'criterion_results'):
            self.event('approve', reviewer_id='captain')
        self.event('approve', reviewer_id='captain', criterion_results=review['criterion_results'])
        t = self.p['plan']['tasks'][0]
        self.assertEqual(t['status'], 'completed')
        self.assertEqual(t['external_review']['packet']['gap_results'][0]['status'], 'remaining')
        self.assertEqual(self.p['diagnosis']['gaps'][0]['verification_status'], 'demo_fixture')

    def test_duplicate_review_and_new_submission_do_not_reuse_stale_review(self):
        self.submitted(); review = self.review()
        self.p = handoff.receive_review({**self.ctx(), 'review': review})
        version = self.p['version']
        self.p = handoff.receive_review({**self.ctx(), 'review': review})
        self.assertEqual(self.p['version'], version)
        different = copy.deepcopy(review); different['note'] = '修改同一编号'
        with self.assertRaises(team.Conflict): handoff.receive_review({**self.ctx(), 'review': different})
        self.event('reject', reviewer_id='A')
        self.event('submit', artifact_id='interface-record', artifact_version=3, actual_minutes=16, evidence='修订成果')
        self.assertNotIn('external_review', self.p['plan']['tasks'][0])
        self.assertEqual(len(self.p['artifact_reviews']), 1)

    def test_review_provider_missing_and_stale_callback_cannot_write(self):
        self.submitted()
        with self.assertRaisesRegex(ValueError, '尚未接入'):
            handoff.invoke_review({**self.ctx(), 'task_id': 'G1:deliver'})
        def raced(project, request):
            team.feedback({**self.ctx(), 'expected_plan_version': 1, 'task_id': 'G1:deliver',
                           'action': 'change', 'note': '回调期间新增消息'})
            return self.review()
        with patch.object(dispatch, 'REVIEWER', raced), self.assertRaises(team.Conflict):
            handoff.invoke_review({**self.ctx(), 'task_id': 'G1:deliver'})
        self.assertNotIn('artifact_reviews', team.state(self.p['project_id']))

    def test_HTTP_real_B_review_and_missing_id(self):
        from learning_agent_server import Handler, ThreadingHTTPServer
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        base = f'http://127.0.0.1:{server.server_port}/api/agent/team'
        def post(route, **extra):
            return json.load(urlopen(Request(base + '/' + route, data=json.dumps({**self.ctx(), **extra}).encode(),
                                             headers={'Content-Type': 'application/json'})))
        try:
            d = diagnosis_fixture()
            self.assertTrue(post('handoff-check', diagnosis=d)['ready_for_B'])
            self.p = post('diagnosis', diagnosis=d); self.p = post('generate-b')
            self.p = post('apply', proposal_id=self.p['proposal']['id'])
            self.event('start'); self.event('submit', artifact_id='interface-record', artifact_version=2,
                                        actual_minutes=12, evidence='HTTP 测试材料')
            package = json.load(urlopen(base + '/handoff?id=' + self.p['project_id']))
            self.assertEqual(len(package['pending_tasks']), 1)
            self.p = post('review-receive', review=self.review())
            self.assertEqual(self.p['plan']['tasks'][0]['status'], 'pending_review')
            with self.assertRaises(HTTPError) as error: urlopen(base + '/handoff')
            self.assertEqual(error.exception.code, 400)
        finally:
            server.shutdown(); server.server_close(); thread.join()


if __name__ == '__main__': unittest.main()
