"""Synthetic text, real SQLite and bytes; no model quality claims."""
import base64
import tempfile
import unittest
from unittest.mock import patch
import learning_agent as agent
import team_orchestrator as team
import artifact_store as store
import artifact_retrieval as retrieval
import team_ai


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


    def test_quote_catalog_covers_long_units_beyond_start_middle_end(self):
        marker = 'TARGET_EVIDENCE_MIDPOINT_742'
        text = ('前置内容。' * 260) + marker + ('后续内容。' * 260)
        docs = [{'artifact_id':'report', 'artifact_version':1,
                 'units':[{'locator':'paragraph:1', 'text':text}]}]
        catalog = team_ai.quote_catalog(docs)
        self.assertTrue(any(marker in row['quote'] for row in catalog))
        self.assertTrue(all(row['artifact_version'] == 1 for row in catalog))

    def test_quote_alignment_uses_exact_text_and_real_storage_locator(self):
        original = '第一项说明\n关键证据：本轮有效分母为\n7。\n最后一项说明'
        docs = [{'artifact_id':'report', 'artifact_version':2,
                 'units':[{'locator':'page:7/line:2', 'text':original}]}]
        resolved = team_ai.resolve_quote_refs([{
            'artifact_id':'report', 'artifact_version':2,
            'locator':'PDF第7页第二段', 'quote':'关键证据：本轮有效分母为 7。'
        }], docs)
        self.assertEqual(resolved[0]['locator'], 'page:7/line:2')
        self.assertEqual(resolved[0]['quote'], '关键证据：本轮有效分母为\n7。')
        self.assertEqual(resolved[0]['model_locator'], 'PDF第7页第二段')
        self.assertEqual(resolved[0]['quote_origin'], 'server_unique_whitespace_alignment')

    def test_quote_alignment_tolerates_linebreaks_but_not_ambiguous_matches(self):
        docs = [{'artifact_id':'report', 'artifact_version':1,
                 'units':[{'locator':'line:1', 'text':'关键证据：\n有效分母为 7。'}]}]
        resolved = team_ai.resolve_quote_refs([{
            'artifact_id':'report', 'artifact_version':1,
            'quote':'关键证据： 有效分母为 7。'
        }], docs)
        self.assertEqual(resolved[0]['quote'], '关键证据：\n有效分母为 7。')
        ambiguous = [{'artifact_id':'report', 'artifact_version':1, 'units':[
            {'locator':'line:1', 'text':'关键证据：有效分母为 7。'},
            {'locator':'line:2', 'text':'关键证据：有效分母为 7。'}]}]
        with self.assertRaisesRegex(ValueError, '无法唯一对齐'):
            team_ai.resolve_quote_refs([{'artifact_id':'report','artifact_version':1,
                                         'quote':'关键证据：有效分母为 7。'}], ambiguous)


if __name__ == '__main__':
    unittest.main()
