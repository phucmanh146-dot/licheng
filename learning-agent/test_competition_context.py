"""Contest-specific retrieval and persistence; network/model replies are fixtures."""
import json
import tempfile
import unittest
from unittest.mock import patch
import learning_agent as agent

SETTINGS = {'startDate': '2026-10-11', 'dailyMinutes': 60, 'deadline': ''}


class CompetitionContextTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = patch.object(agent, 'DB', self.temp.name + '/agent.sqlite3'); self.db.start()
        with agent.connection() as c:
            c.executescript('CREATE TABLE runs(id TEXT PRIMARY KEY,kind TEXT,status TEXT,input TEXT,result TEXT,error TEXT,created TEXT); CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT,run_id TEXT,kind TEXT,message TEXT,created TEXT); CREATE TABLE routes(id TEXT PRIMARY KEY,version INTEGER,body TEXT,updated TEXT); CREATE TABLE revisions(route_id TEXT,version INTEGER,body TEXT,reason TEXT,created TEXT,PRIMARY KEY(route_id,version));')

    def tearDown(self):
        self.db.stop(); self.temp.cleanup()

    def payload(self, name='人工赛事甲·演示届次'):
        return {'goal': '完善当前报告的需求证据', 'mode': 'competition',
                'competitionName': name, 'settings': SETTINGS, 'researchOnly': True}

    def test_missing_or_invalid_name_rejected_before_retrieval(self):
        for name in ('', ' ', None, 123, 'x' * 201):
            with self.subTest(name=str(name)[:20]), patch.object(agent.rescue, 'search_web') as search:
                with self.assertRaisesRegex(ValueError, '实际赛事名称'):
                    agent.prepare_input(self.payload(name))
                with self.assertRaises(ValueError): agent.run_agent('test', self.payload(name))
                search.assert_not_called()

    def test_different_contest_queries_do_not_reuse_another_contests_sources(self):
        for name in ('人工赛事甲·演示届次', '人工赛事乙·另一个赛道'):
            with self.subTest(name=name), patch.object(agent.rescue, 'validate_url'), \
                 patch.object(agent.rescue, 'search_web', return_value={'provider': 'fixture', 'results': [
                     {'title': '人工通知夹具', 'url': 'https://example.com/fixture', 'snippet': '仅供测试'}]}) as search:
                result = agent.run_agent('research', self.payload(name))
            self.assertEqual(search.call_args.args[0], name + ' 官方通知 参赛规则 提交要求')
            self.assertEqual(result['competitionName'], name)
            self.assertEqual(len(result['sources']), 1)
            self.assertEqual(result['sources'][0]['url'], 'https://example.com/fixture')

    def test_user_supplied_material_still_read_without_fixed_official_seeds(self):
        data = self.payload(); data['urls'] = ['https://example.com/user-notice']
        with patch.object(agent.rescue, 'validate_url'), \
             patch.object(agent, 'read_url', return_value={'text': '用户材料夹具', 'readStatus': 'fulltext', 'method': 'fixture'}) as read, \
             patch.object(agent.rescue, 'search_web', return_value={'provider': 'fixture', 'results': []}):
            result = agent.run_agent('user-material', data)
        read.assert_called_once_with('https://example.com/user-notice')
        self.assertEqual(len(result['sources']), 1)

    def test_same_second_saves_restore_the_latest_competition_route(self):
        with patch.object(agent, 'now', return_value='2026-10-11T12:00:00+00:00'):
            agent.save_route({'id': 'contest-a', 'competitionName': '人工赛事甲'}, 'fixture')
            agent.save_route({'id': 'contest-b', 'competitionName': '人工赛事乙'}, 'fixture')
            self.assertEqual(agent.state()['routes'][0]['competitionName'], '人工赛事乙')
            agent.save_route({'id': 'contest-a', 'competitionName': '人工赛事甲', 'version': 1}, 'updated fixture')
            self.assertEqual(agent.state()['routes'][0]['competitionName'], '人工赛事甲')

    def test_model_receives_selected_contest_and_no_invented_deadline_is_saved(self):
        data = self.payload(' 人工赛事乙·另一赛道 '); data['researchOnly'] = False
        data = agent.prepare_input(data)
        response = {'action': 'finish', 'title': '人工规划夹具', 'tasks': [{
            'id': 'T1', 'title': '核对一条证据', 'minutes': 5, 'dependsOn': [],
            'deliverable': '证据位置记录', 'acceptance': '原文可追溯', 'firstStep': '打开当前报告',
            'sourceIds': ['S1'], 'actions': [{'title': '记录原文', 'instruction': '在报告中写明证据位置',
                'minutes': 5, 'result': '位置记录', 'check': '可以回到原文'}]}]}
        with patch.object(agent.rescue, 'validate_url'), \
             patch.object(agent.rescue, 'search_web', return_value={'provider': 'fixture', 'results': [
                 {'title': '人工通知', 'url': 'https://example.com/fixture', 'snippet': '人工测试要求'}]}), \
             patch.object(agent.rescue, 'public_config', return_value={'configured': True}), \
             patch.object(agent.rescue, 'config_snapshot', return_value={'model': 'fixture'}), \
             patch.object(agent.rescue, 'complete', return_value=json.dumps(response)) as model:
            result = agent.run_agent('planning', data)
        context = json.loads(model.call_args.args[0][1]['content'])
        self.assertEqual(context['competitionName'], '人工赛事乙·另一赛道')
        self.assertEqual(agent.route(result['id'])['competitionName'], context['competitionName'])
        self.assertEqual(result['settings']['deadline'], '')
        self.assertEqual(result['tasks'][0]['status'], 'todo')


if __name__ == '__main__': unittest.main()
