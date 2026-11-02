import json
import unittest
from unittest.mock import patch
import test_general_loop as fixtures
import team_ai as ai


class LocatorContractTests(unittest.TestCase):
    setUp = fixtures.GeneralLoopTests.setUp
    tearDown = fixtures.GeneralLoopTests.tearDown
    setup_inputs = fixtures.GeneralLoopTests.setup_inputs
    upload = fixtures.GeneralLoopTests.upload
    ctx = fixtures.GeneralLoopTests.ctx
    # Reuse isolated database setup and material helpers, not inherited tests.
    def test_embedded_slide_label_uses_actual_unit_locator(self):
        self.setup_inputs()
        self.upload('原件slide:14：发明专利1项；统计日期未知')
        self.p['research_companion'] = {'outcome': '先核一行', 'blocker': '术语看不懂',
                                         'events': [{'note': 'not part of the model intake projection'}]}
        reply = fixtures.diagnosis_reply(self.p)
        observed = []
        def complete(messages, cfg):
            observed.append(json.loads(messages[1]['content']))
            return json.dumps(reply, ensure_ascii=False)
        with patch.multiple(ai.rescue, public_config=lambda: {'configured': True},
                            config_snapshot=lambda: {'model': 'controlled-fixture'},
                            complete=complete):
            result = ai.researcher(self.p)
        self.assertEqual(result['gaps'][0]['current_locator'], 'line:1')
        locations = observed[0]['citation_locator_contract']['allowed_locations']
        self.assertEqual(observed[0]['research_companion']['blocker'], '术语看不懂')
        self.assertNotIn('events', observed[0]['research_companion'])
        self.assertEqual(locations, [{'artifact_id': 'report', 'artifact_version': 2,
                                     'locator': 'line:1'}])

    def test_embedded_slide_locator_still_rejected_on_both_attempts(self):
        self.setup_inputs()
        self.upload('原件slide:14：发明专利1项；统计日期未知')
        reply = fixtures.diagnosis_reply(self.p)
        reply['gaps'][0]['current_locator'] = 'slide:14'
        reply['gaps'][0]['evidence_refs'][0]['locator'] = 'slide:14'
        observed = []
        def complete(messages, cfg):
            observed.append(json.loads(messages[1]['content']))
            return json.dumps(reply, ensure_ascii=False)
        with patch.multiple(ai.rescue, public_config=lambda: {'configured': True},
                            config_snapshot=lambda: {'model': 'controlled-fixture'},
                            complete=complete):
            with self.assertRaises(ValueError):
                ai.researcher(self.p)
        self.assertEqual(len(observed), 2)
        for request in observed:
            self.assertEqual(request['citation_locator_contract']['allowed_locations'][0]['locator'], 'line:1')
