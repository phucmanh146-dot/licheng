import unittest
from datetime import datetime,timezone,timedelta
from unittest.mock import patch
import test_general_loop as fixtures
import team_orchestrator as team
import research_companion as rc
import threading
from urllib.request import urlopen
from learning_agent_server import Handler, ThreadingHTTPServer


class ResearchCompanionTests(unittest.TestCase):
    setUp = fixtures.GeneralLoopTests.setUp
    tearDown = fixtures.GeneralLoopTests.tearDown
    ctx = fixtures.GeneralLoopTests.ctx

    def test_http_serves_the_script_referenced_by_workbench(self):
        server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
        try:
            base='http://127.0.0.1:'+str(server.server_port)
            with urlopen(base+'/team.html',timeout=5) as response:
                self.assertIn('research-companion.js',response.read().decode())
            with urlopen(base+'/research-companion.js',timeout=5) as response:
                self.assertEqual(response.status,200)
                self.assertIn('rc-form',response.read().decode())
        finally:
            server.shutdown();server.server_close();worker.join(timeout=3)

    def save(self, deadline=None):
        self.p=rc.save({**self.ctx(),'outcome':'访谈对应产品','materials':'受控工程夹具，非真人材料',
                       'blocker':'缺资料或附件','available_minutes':20,'today_output':'一行需求卡',
                       'first_action':'摘一条用途原话并记录位置',
                       'deadline':deadline or (datetime.now(timezone.utc)+timedelta(hours=1)).isoformat()})

    def test_exact_ten_minute_boundary_and_overdue_without_deadline_extension(self):
        end=datetime(2026,11,1,8,tzinfo=timezone.utc);self.save(end.isoformat())
        self.assertFalse(rc.today(self.p['project_id'],end-timedelta(seconds=601))['show_checkin'])
        self.assertTrue(rc.today(self.p['project_id'],end-timedelta(seconds=600))['show_checkin'])
        self.assertEqual(rc.today(self.p['project_id'],end)['deadline_state'],'overdue')
        self.assertEqual(team.state(self.p['project_id'])['research_companion']['deadline'],end.isoformat())

    def test_naive_deadline_rejected(self):
        with self.assertRaises(ValueError): self.save('2026-11-01T16:00')

    def test_early_progress_does_not_silence_deadline_checkin(self):
        self.save();self.p=rc.checkin({**self.ctx(),'card_revision':1,'choice':'progress','note':'只做了第一行'})
        end=rc.stamp(self.p['research_companion']['deadline'])
        self.assertTrue(rc.today(self.p['project_id'],end-timedelta(minutes=9))['show_checkin'])

    def test_help_records_scene_and_does_not_change_formal_plan(self):
        self.save();before=self.p.get('plan')
        self.p=rc.checkin({**self.ctx(),'card_revision':1,'choice':'need_help','note':'找不到原附件'})
        self.assertIn('不要补造',self.p['research_companion']['next_support'])
        self.assertEqual(self.p.get('plan'),before)
        self.assertEqual(self.p['research_companion']['events'][0]['note'],'找不到原附件')

    def test_submitted_requires_artifact_and_remains_pending_review(self):
        self.save()
        with self.assertRaises(ValueError):rc.checkin({**self.ctx(),'card_revision':1,'choice':'submitted','note':'做完了'})
        self.p=rc.checkin({**self.ctx(),'card_revision':1,'choice':'submitted','note':'一行完成','artifact_ref':'实际文件待人工核对的路径'})
        self.assertEqual(rc.today(self.p['project_id'])['deadline_state'],'submitted_pending_review')
        self.assertNotEqual(self.p.get('status'),'completed')

    def test_old_card_and_old_project_versions_rejected(self):
        self.save();old=self.ctx();self.save()
        with self.assertRaises(team.Conflict):rc.checkin({**old,'card_revision':1,'choice':'pause','note':'旧窗口'})
        with self.assertRaises(team.Conflict):rc.checkin({**self.ctx(),'card_revision':1,'choice':'pause','note':'旧卡'})

    def test_projects_are_isolated(self):
        self.save();other=team.create({'goal':'另一项目','mode':'live'})
        self.assertIsNone(rc.today(other['project_id'])['card'])

    def test_revised_deadline_rearms_reminder_and_keeps_history(self):
        self.save('2026-01-01T00:00:00Z')
        self.p=rc.checkin({**self.ctx(),'card_revision':1,'choice':'shrink','note':'先只核一条'})
        self.save()
        card=self.p['research_companion']
        self.assertEqual(card['revision'],2)
        self.assertIsNone(card['checkin_revision'])
        self.assertEqual(len(card['events']),1)

    def test_reload_reads_persisted_today_card(self):
        self.save();p=team.state(self.p['project_id'])
        self.assertEqual(p['research_companion']['today_output'],'一行需求卡')
        self.assertEqual(rc.today(p['project_id'])['card']['first_action'],'摘一条用途原话并记录位置')
