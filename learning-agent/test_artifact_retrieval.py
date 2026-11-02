"""Synthetic text, real SQLite and bytes; no model quality claims."""
import base64
import tempfile
import unittest
from unittest.mock import patch
import learning_agent as agent
import team_orchestrator as team
import artifact_store as store
import artifact_retrieval as retrieval


class RetrievalTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = patch.object(agent, 'DB', self.tmp.name+'/state.sqlite3')
        self.db.start()
        self.p = team.create({'goal':'SYNTHETIC 检索工程测试', 'mode':'live'})

    def tearDown(self):
        self.db.stop()
        self.tmp.cleanup()

    def upload(self, text, identifier='report'):
        self.p = store.import_file({'project_id':self.p['project_id'], 'expected_version':self.p['version'],
            'filename':'fixture.txt', 'artifact_id':identifier,
            'data_base64':base64.b64encode(text.encode()).decode()})

    def test_latest_version_and_exact_citation(self):
        self.upload('有效分母=3')
        self.upload('有效分母=5\n无关说明')
        result = retrieval.select(self.p, '有效分母')
        self.assertEqual(len(result['hits']), 1)
        hit = result['hits'][0]
        self.assertEqual(hit['artifact_version'], 2)
        store.references(self.p, [{**hit, 'quote':hit['text']}])
        self.assertEqual(store.read(self.p, 'report', 1)['units'][0]['text'], '有效分母=3')

    def test_project_isolation_and_no_match(self):
        self.upload('privatekeyword 预算')
        other = team.create({'goal':'other', 'mode':'live'})
        self.assertEqual(retrieval.select(other, 'privatekeyword')['hits'], [])
        self.assertEqual(retrieval.select(self.p, 'unmatched')['hits'], [])

    def test_budget_never_slices_original_unit(self):
        self.upload('预算'+('甲'*1100)+'\n预算=3')
        result = retrieval.select(self.p, '预算', max_chars=1000)
        self.assertEqual([h['text'] for h in result['hits']], ['预算=3'])
        self.assertEqual(result['omitted_matches'], 1)
        self.assertLessEqual(result['selected_chars'], 1000)

    def test_invalid_options_and_stable_order(self):
        self.upload('evidence denominator\n有效分母')
        self.assertEqual(retrieval.select(self.p, 'evidence 有效分母'), retrieval.select(self.p, 'evidence 有效分母'))
        for kwargs in ({'query':''}, {'query':'x','limit':True}, {'query':'x','max_chars':0}):
            with self.assertRaises(ValueError):
                retrieval.select(self.p, **kwargs)

    def test_http_retrieval_real_server(self):
        import json
        import threading
        from http.server import ThreadingHTTPServer
        from urllib.request import Request, urlopen
        from learning_agent_server import Handler
        self.upload('有效分母=7')
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            body = json.dumps({'project_id':self.p['project_id'], 'expected_version':self.p['version'],
                               'query':'有效分母'}).encode()
            request = Request('http://127.0.0.1:'+str(server.server_port)+'/api/agent/team/artifact-retrieve',
                              data=body, headers={'Content-Type':'application/json'})
            with urlopen(request, timeout=5) as response:
                result = json.load(response)
            self.assertEqual(result['hits'][0]['text'], '有效分母=7')
            self.assertEqual(result['coverage'], 'partial')
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


if __name__ == '__main__':
    unittest.main()
