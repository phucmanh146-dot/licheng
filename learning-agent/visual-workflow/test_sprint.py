"""Sprint scope must not turn historical or fixture records into real delivery."""
import json,unittest
from test_workflow import WorkflowTests

class SprintTests(unittest.TestCase):
    setUp=WorkflowTests.setUp
    tearDown=WorkflowTests.tearDown
    call=WorkflowTests.call

    def test_sprint_preserves_original_ledger_and_never_auto_certifies(self):
        before=self.call('/api/acceptance')[1]
        status,body,_=self.call('/api/sprint')
        self.assertEqual(status,200)
        d=json.loads(body);self.assertEqual(len(d['items']),8)
        self.assertEqual([x['id'] for x in d['items']],list(range(1,9)))
        self.assertTrue(all(x['status']=='needs_deliverable_review' for x in d['items']))
        self.assertEqual(self.call('/api/acceptance')[1],before)
        for item in d['items']:
            self.assertTrue(item['related_tasks'])
            self.assertTrue(all(1<=r['id']<=55 for r in item['related_tasks']))
        self.assertIn('两份真人V2',d['items'][3]['title'])
        self.assertNotIn(55,[r['id'] for x in d['items'] for r in x['related_tasks']])

    def test_sprint_and_task_deep_link_pages_load(self):
        for path in ['/sprint','/sprint.html','/acceptance?task=27']:
            self.assertEqual(self.call(path)[0],200)

if __name__=='__main__':unittest.main()
