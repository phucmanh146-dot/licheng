"""Contract tests with controlled model replies; these do not claim live AI success."""
import importlib
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import types
import unittest
from unittest.mock import patch

TEMP = tempfile.TemporaryDirectory()
os.environ['SHANGAN_GROWTH_DATA'] = TEMP.name
sys.path.insert(0, str(Path(__file__).parent))

class RescueError(Exception):
    pass

rescue = types.ModuleType('rescue_service')
rescue.RescueError = RescueError
rescue.config_snapshot = lambda: {'model': 'test-fixture'}
rescue.complete = lambda *args: None
rescue.search_web = lambda *args: None
sys.modules['rescue_service'] = rescue
import growth_pipeline as flow

DIAG = {'summary': '根据提供资料整理行动。', 'answer': '先从访谈中整理目标，再逐条核对验收要求。', 'steps': ['写下访谈目标'], 'relevantSources': [{'id': 'source-1', 'why': '提供实际要求'}], 'keyPoints': ['资料中的关键点'], 'gaps': [], 'unknowns': []}
TASK = {'name': '整理一页需求', 'minutes': 25, 'firstStep': '打开笔记并写下目标',
        'deliverable': '一页需求笔记', 'check': '包含目标和验收要求', 'sourceIds': ['source-1'], 'owner': '待分配'}

def await_run(account, identifier):
    for _ in range(150):
        state = flow.get_run(account, identifier)
        if state['status'] not in ('running', 'queued'):
            return state
        time.sleep(.02)
    raise AssertionError('run did not finish')


class PipelineTests(unittest.TestCase):
    def setUp(self):
        with flow.connect() as db:
            db.execute('DELETE FROM runs')
            db.execute('DELETE FROM projects')
        self.project = flow.save_project({'account': 'qa', 'title': '我的成长项目', 'dailyMinutes': 60})

    def start(self, **extra):
        return flow.start({'account': 'qa', 'projectId': self.project['id'],
                           'materials': [{'title': '任务要求', 'text': '根据访谈资料制作一页需求笔记。'}], **extra})['id']

    def test_context_and_task_provenance(self):
        with patch.object(rescue, 'complete', side_effect=[json.dumps(DIAG), json.dumps({'tasks': [TASK]})]) as model:
            result = await_run('qa', self.start())
        self.assertEqual(result['status'], 'succeeded')
        self.assertEqual(result['drafts'][0]['sourceIds'], ['source-1'])
        planning = json.loads(model.call_args_list[1].args[0][1]['content'])
        self.assertEqual(planning['diagnosis']['summary'], DIAG['summary'])
        self.assertEqual(planning['project']['id'], self.project['id'])
        self.assertNotIn('input', result)

    def test_failed_plan_retries_without_repeating_diagnosis(self):
        invalid = dict(TASK, sourceIds=['made-up-source'])
        with patch.object(rescue, 'complete', side_effect=[json.dumps(DIAG), json.dumps({'tasks': [invalid]})]):
            identifier = self.start()
            failed = await_run('qa', identifier)
        self.assertEqual(failed['status'], 'failed')
        self.assertNotIn('drafts', failed)
        with patch.object(rescue, 'complete', return_value=json.dumps({'tasks': [TASK]})) as model:
            flow.retry({'account': 'qa', 'id': identifier})
            completed = await_run('qa', identifier)
        self.assertEqual(completed['status'], 'succeeded')
        self.assertEqual(model.call_count, 1)
        self.assertEqual(completed['sources'], failed['sources'])

    def test_empty_diagnosis_is_not_reused(self):
        with patch.object(rescue, 'complete', return_value='{"summary":""}'):
            identifier = self.start()
            failed = await_run('qa', identifier)
        self.assertEqual(failed['status'], 'failed')
        self.assertNotIn('diagnosis', failed)
        with patch.object(rescue, 'complete', side_effect=[json.dumps(DIAG), json.dumps({'tasks': []})]) as model:
            flow.retry({'account': 'qa', 'id': identifier})
            self.assertEqual(await_run('qa', identifier)['status'], 'succeeded')
        self.assertEqual(model.call_count, 2)

    def test_account_isolation_and_optimistic_update(self):
        self.assertEqual(flow.state('another')['projects'], [])
        with self.assertRaises(ValueError):
            flow.get_project(flow.account('another'), self.project['id'])
        updated = flow.save_project(dict(self.project, account='qa', title='更新的目标'))
        self.assertEqual(updated['version'], 2)
        with self.assertRaises(ValueError):
            flow.save_project(dict(self.project, account='qa'))

    def test_invalid_inputs_do_not_start_jobs(self):
        for extra in ({'materials': ['bad']}, {'frames': [None]}, {'categories': 'bad'},
                      {'materials': [{'text': 'a' * 30000}] * 3}):
            with self.assertRaises(ValueError):
                self.start(**extra)
        self.assertEqual(flow.state('qa')['runs'], [])

    def test_daily_budget_is_enforced(self):
        with patch.object(rescue, 'complete', side_effect=[json.dumps(DIAG), json.dumps({'tasks': [dict(TASK, minutes=100)]})]):
            self.assertEqual(await_run('qa', self.start())['status'], 'failed')

    def test_all_links_are_attempted_and_read_only_never_uses_model(self):
        def read(url):
            if url.endswith('/bad'):
                raise ValueError('登录后才能读取')
            return {'title': url, 'text': '可读取的资料正文。'}
        with patch.object(flow, 'read_url', side_effect=read) as reader, patch.object(rescue, 'complete') as model:
            identifier = self.start(materials=[], links='分享 https://example.org/bad。还有 [正文](https://example.org/good) https://example.org/good', readOnly=True)
            result = await_run('qa', identifier)
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(reader.call_count, 2)
        self.assertEqual(result['collection'], {'total': 2, 'read': 1, 'unread': 1})
        self.assertEqual(result['sources'][0]['id'], 'source-2')
        self.assertEqual(result['sourceResults'][0]['status'], 'failed')
        model.assert_not_called()
        with patch.object(flow, 'read_url', return_value={'title': '已恢复', 'text': '补齐的正文。'}) as retry_reader:
            flow.retry({'account': 'qa', 'id': identifier, 'readOnly': True})
            retried = await_run('qa', identifier)
        self.assertEqual(retried['status'], 'collected')
        self.assertEqual(retry_reader.call_args.args[0], 'https://example.org/bad')
        self.assertEqual(retry_reader.call_count, 1)
        self.assertEqual(len(retried['sources']), 2)

    def test_video_preview_is_saved_but_not_treated_as_transcript(self):
        with patch.object(flow, 'read_url', return_value={'title': '视频', 'text': '这只是简介', 'thin': True, 'note': '没有公开字幕'}), patch.object(rescue, 'complete') as model:
            result = await_run('qa', self.start(materials=[], links='https://example.org/video', readOnly=True))
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(result['sources'], [])
        self.assertEqual(result['sourceResults'][0]['previewText'], '这只是简介')
        self.assertEqual(result['sourceResults'][0]['status'], 'partial')
        model.assert_not_called()

    def test_continue_uses_saved_content_without_repeating_failed_links(self):
        with patch.object(flow, 'read_url', side_effect=ValueError('受限')):
            identifier = self.start(links='https://example.org/restricted', readOnly=True)
            await_run('qa', identifier)
        with patch.object(flow, 'read_url') as reader, patch.object(rescue, 'complete', side_effect=[json.dumps(DIAG), json.dumps({'tasks': [TASK]})]):
            flow.retry({'account': 'qa', 'id': identifier, 'readOnly': False, 'retrySources': False})
            result = await_run('qa', identifier)
        reader.assert_not_called()
        self.assertEqual(result['status'], 'succeeded')
        self.assertEqual(result['collection']['unread'], 1)

    def test_batch_larger_than_twelve_links_and_single_source_retry(self):
        urls = '\n'.join('https://example.org/item/' + str(i) for i in range(15))
        with patch.object(flow, 'read_url', side_effect=ValueError('暂时不可读')):
            identifier = self.start(materials=[], links=urls, readOnly=True)
            result = await_run('qa', identifier)
        self.assertEqual(len(result['sourceResults']), 15)
        with patch.object(flow, 'read_url', return_value={'title': '一条', 'text': '恢复的正文'}) as reader:
            flow.retry({'account': 'qa', 'id': identifier, 'sourceId': 'source-5', 'readOnly': True})
            result = await_run('qa', identifier)
        self.assertEqual(reader.call_count, 1)
        self.assertEqual(result['collection']['read'], 1)
        with self.assertRaises(ValueError):
            flow.retry({'account': 'qa', 'id': identifier, 'sourceId': 'unknown'})

    def test_question_answer_persists_without_planning_and_reuses_sources(self):
        with patch.object(rescue, 'complete', return_value=json.dumps(DIAG)) as model:
            identifier = self.start(question='如何提炼访谈需求？', analysisOnly=True)
            result = await_run('qa', identifier)
        self.assertEqual(result['status'], 'answered')
        self.assertEqual(result['question'], '如何提炼访谈需求？')
        self.assertEqual(result['diagnosis']['answer'], DIAG['answer'])
        self.assertNotIn('drafts', result)
        self.assertEqual(model.call_count, 1)
        context = json.loads(model.call_args.args[0][1]['content'])
        self.assertEqual(context['question'], result['question'])
        with patch.object(rescue, 'complete', return_value=json.dumps({'tasks': [TASK]})) as model:
            flow.retry({'account': 'qa', 'id': identifier, 'analysisOnly': False, 'retrySources': False})
            self.assertEqual(await_run('qa', identifier)['status'], 'succeeded')
        self.assertEqual(model.call_count, 1)

    def test_changed_question_recomputes_answer_and_invalid_citations_are_rejected(self):
        with patch.object(rescue, 'complete', return_value=json.dumps(DIAG)):
            identifier = self.start(question='问题一', analysisOnly=True)
            await_run('qa', identifier)
        bad = dict(DIAG, relevantSources=[{'id': 'invented', 'why': '不存在'}])
        with patch.object(rescue, 'complete', return_value=json.dumps(bad)):
            flow.retry({'account': 'qa', 'id': identifier, 'question': '问题二', 'analysisOnly': True})
            result = await_run('qa', identifier)
        self.assertEqual(result['status'], 'failed')
        self.assertNotIn('diagnosis', result)
        self.assertEqual(result['question'], '问题二')

    def test_relevant_content_near_end_is_not_lost_in_context(self):
        from growth_analysis import question_excerpt
        content = '普通背景材料。' * 1500 + '重点：访谈需求应先记录用户的目标，再补充验收条件。'
        excerpt = question_excerpt(content, '访谈需求如何提炼？', 600)
        self.assertIn('访谈需求应先记录用户的目标', excerpt)
        self.assertLessEqual(len(excerpt), 600)

if __name__ == '__main__':
    try:
        result = unittest.main(exit=False).result
    finally:
        flow.POOL.shutdown(wait=True)
        TEMP.cleanup()
    sys.exit(0 if result.wasSuccessful() else 1)
