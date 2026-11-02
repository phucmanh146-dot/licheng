"""HTTP access and document extraction checks against the original Python backend.

Run with original-workbench and its dependencies on PYTHONPATH. No live models
or private documents are requested; all data lives in a temporary directory.
"""
import base64
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import zipfile
from email.message import Message

TEMP = tempfile.TemporaryDirectory()
os.environ['SHANGAN_GROWTH_DATA'] = TEMP.name
sys.path.insert(0, str(Path(__file__).parent))
import growth_server as app
server = app.legacy.LocalServer(('127.0.0.1', 0), app.Handler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
BASE = 'http://127.0.0.1:' + str(server.server_port)

def request(path, data=None, headers=None):
    h = {'Origin': BASE, **(headers or {})}
    if data is not None:
        h['Content-Type'] = 'application/json'
    req = Request(BASE + path, json.dumps(data).encode() if data is not None else None, h)
    try:
        with urlopen(req, timeout=3) as response:
            return response.status, json.load(response)
    except HTTPError as exc:
        return exc.code, json.load(exc)

class HTTPTests(unittest.TestCase):
    def test_shared_frames_require_same_origin_token(self):
        import growth_ocr, growth_wechat_screen, growth_wechat_float, growth_wechat
        routes = [('/api/growth/ocr-frame', growth_ocr, 'read_frame'),
                  ('/api/growth/wechat-screen-start', growth_wechat_screen, 'start_search'),
                  ('/api/growth/wechat-screen-read', growth_wechat_screen, 'finish_search'),
                  ('/api/growth/wechat-screen-follow', growth_wechat_screen, 'follow_results'),
                  ('/api/growth/wechat-screen-open', growth_wechat_screen, 'open_result'),
                  ('/api/growth/wechat-open', growth_wechat, 'open_wechat'),
                  ('/api/growth/wechat-open-choice', growth_wechat, 'open_choice'),
                  ('/api/growth/wechat-float-start', growth_wechat_float, 'start'),
                  ('/api/growth/wechat-float-frame', growth_wechat_float, 'submit_frame'),
                  ('/api/growth/wechat-group-list', growth_wechat, 'search_group_list'),
                  ('/api/growth/wechat-group-messages', growth_wechat, 'read_group_messages')]
        for route, module, method in routes:
            with patch.object(module, method, return_value={'ok': True}) as call:
                self.assertEqual(request(route, {'image': 'fixture'})[0], 403)
                self.assertEqual(request(route, {'image': 'fixture'}, {'X-Growth-Token': app.TOKEN, 'Origin': 'https://example.org'})[0], 403)
                call.assert_not_called()
                self.assertEqual(request(route, {'image': 'fixture'}, {'X-Growth-Token': app.TOKEN})[0], 200)
                call.assert_called_once()

    def test_remote_start_requires_token_and_reports_real_readiness(self):
        import growth_remote
        self.assertEqual(request('/api/growth/remote-start', {})[0],403)
        with patch.object(growth_remote,'ensure_ready',return_value={'ready':True,'url':'http://127.0.0.1:8878/'}) as start:
            status,body=request('/api/growth/remote-start',{}, {'X-Growth-Token':app.TOKEN})
        self.assertEqual(status,200);self.assertTrue(body['ready']);start.assert_called_once()
        with patch.object(growth_remote,'status',return_value={'ready':False,'url':'http://127.0.0.1:8878/'}):
            self.assertFalse(request('/api/growth/remote-status')[1]['ready'])

    def test_public_docx_link_is_read_as_document(self):
        import growth_sources
        content = io.BytesIO()
        with zipfile.ZipFile(content, 'w') as doc:
            doc.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>来自文档链接的验收要求。</w:t></w:r></w:p></w:body></w:document>')
        response = io.BytesIO(content.getvalue())
        response.headers = Message()
        response.headers['Content-Type'] = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        with patch.object(app.rescue, 'validate_url'), patch.object(growth_sources, 'build_opener') as opener:
            opener.return_value.open.return_value = response
            result = growth_sources.read_url('https://example.org/requirements.docx?download=1')
        self.assertIn('来自文档链接的验收要求', result['text'])
        self.assertEqual(result['kind'], 'document')

    def test_video_access_failure_is_distinguished(self):
        import growth_sources, growth_video
        result = type('Result', (), {'stdout':json.dumps({'error':'需要有效会话','code':'SOURCE_REQUIRES_LOGIN'})})()
        self.assertEqual(growth_video.error_code('Fresh cookies are needed'), 'SOURCE_REQUIRES_LOGIN')
        with patch.object(app.rescue, 'validate_url'), patch.object(growth_video.subprocess, 'run', return_value=result):
            with self.assertRaises(app.rescue.RescueError) as raised:
                growth_sources.read_url('https://v.douyin.com/example/')
        self.assertEqual(raised.exception.code, 'SOURCE_REQUIRES_LOGIN')

    def test_bilibili_srt_and_json_captions_are_parsed_without_danmaku(self):
        import growth_video
        self.assertIn('先明确目标', growth_video.subtitle_text('1\n00:00:01,000 --> 00:00:02,000\n先明确目标\n\n','srt'))
        self.assertEqual(growth_video.subtitle_text('{"body":[{"content":"再核对来源"}]}','json'),'再核对来源')

    def test_wechat_and_baidu_body_containers(self):
        from growth_web import parse_page
        article = '<html><head><meta property="og:title" content="学习资料"></head><body><nav>菜单</nav><div id="js_content"><p>' + '先读资料，再写出具体任务。' * 12 + '</p><script>这不是正文</script></div><footer>页脚</footer></body></html>'
        result = parse_page(article,'https://mp.weixin.qq.com/s/example')
        self.assertEqual(result['title'],'学习资料')
        self.assertNotIn('菜单',result['text']);self.assertNotIn('这不是正文',result['text'])
        result = parse_page('<html><title>百度搜索</title><div id="content_left">' + '搜索结果的标题和摘要。'*12 + '</div></html>','https://www.baidu.com/s?wd=example')
        self.assertEqual(result['kind'],'search-results')
        with self.assertRaises(app.rescue.RescueError):
            parse_page('<title>百度安全验证</title><main>'+'请完成验证。'*30+'</main>','https://www.baidu.com/')
        fallback = parse_page('<html><noscript><meta http-equiv="refresh" content="0;url=http://www.baidu.com/"></noscript></html>', 'https://www.baidu.com/s?wd=RAG')
        self.assertEqual(fallback.get('redirect'), '', 'noscript fallback must not silently discard the user search query')

    def test_semantic_main_container_is_extracted_without_browser(self):
        import sy_web_reader as reader
        html='<html><title>测试文档</title><nav>不相关导航</nav><div role="main"><h1>阅读要求</h1><p>' + '根据访谈整理目标和验收要求。' * 20 + '</p></div></html>'
        with patch.object(reader, 'fetch_page', return_value=html), patch.object(reader, 'render', side_effect=AssertionError('unnecessary browser fallback')):
            result=reader.extract_readable('https://example.org/doc')
        self.assertIn('阅读要求',result['text'])
        self.assertNotIn('不相关导航',result['text'])

    def test_origin_and_token(self):
        self.assertEqual(request('/api/growth/session', headers={'Origin':'https://example.org'})[0],403)
        self.assertEqual(request('/api/growth/project', {'account':'qa','title':'project'})[0],403)
        status, project = request('/api/growth/project', {'account':'qa','title':'project'}, {'X-Growth-Token':app.TOKEN})
        self.assertEqual(status,200)
        self.assertEqual(project['title'],'project')

    def test_encoded_source_paths_are_not_served(self):
        for path in ('/local_server.py','/local_server.%70%79','/%2egrowth-backup/file.html','/workflow.sqlite3'):
            self.assertEqual(request(path)[0],403,path)

    def test_original_docx_import_still_works(self):
        content=io.BytesIO()
        with zipfile.ZipFile(content,'w') as doc:
            doc.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>测试要求：整理需求，核对验收条件。</w:t></w:r></w:p></w:body></w:document>')
        status, doc=request('/api/extract-file',{'name':'sample.docx','content':base64.b64encode(content.getvalue()).decode()})
        self.assertEqual(status,200)
        self.assertIn('整理需求',doc['text'])

if __name__=='__main__':
    try:
        result=unittest.main(exit=False).result
    finally:
        server.shutdown();server.server_close();app.flow.POOL.shutdown(wait=True);TEMP.cleanup()
    sys.exit(0 if result.wasSuccessful() else 1)
