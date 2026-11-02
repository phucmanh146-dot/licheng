"""Run beside the existing local_server.py; never exposes the PC to the Internet."""
import argparse
import importlib.util
import json
import secrets
import time
from urllib.parse import parse_qs, urlparse, unquote
from growth_paths import prepare_temporary_directory

prepare_temporary_directory()

import local_server as legacy
import rescue_service as rescue
import growth_pipeline as flow
from growth_models import model_request

# Original provider adapters still form and parse requests. This transport adds
# typed failures while retaining their URL checks and no-redirect policy.
rescue.model_request = model_request

TOKEN = secrets.token_urlsafe(32)
MODEL_FILE = flow.DATA / 'model-selection.json'


def initialize_model():
    # Keep provider secrets in the user's existing CC Switch store, on this PC.
    try:
        selected = json.loads(MODEL_FILE.read_text(encoding='utf-8'))['id']
        legacy.connect_ccswitch(selected, verify=False)
    except (OSError, ValueError, KeyError, rescue.RescueError):
        pass


initialize_model()


class Handler(legacy.Handler):
    def source_file(self):
        path = unquote(urlparse(self.path).path).lower().replace('\\', '/')
        return (any(p.startswith('.') for p in path.split('/') if p)
                or path.endswith(('.py', '.pyc', '.cmd', '.ps1', '.env', '.log', '.zip', '.json', '.db', '.sqlite3')))

    def do_HEAD(self):
        if not self.growth_allowed() or self.source_file():
            self.send_response(403)
            self.end_headers()
            return
        return super().do_HEAD()

    def growth_allowed(self):
        port = self.server.server_port
        hosts = {'127.0.0.1:' + str(port), 'localhost:' + str(port)}
        return self.headers.get('Host') in hosts and self.headers.get('Origin') in (
            None, 'http://127.0.0.1:' + str(port), 'http://localhost:' + str(port))

    def list_directory(self, path):
        return self.send_json({'error': '目录不可通过浏览器浏览。'}, 403)

    def do_GET(self):
        if self.source_file():
            return self.send_json({'error': '文件不可通过浏览器读取'}, 403)
        parsed = urlparse(self.path)
        if not parsed.path.startswith('/api/growth/'):
            return super().do_GET()
        if not self.growth_allowed():
            return self.send_json({'error': '来源不允许'}, 403)
        params = parse_qs(parsed.query)
        account = params.get('account', [''])[0]
        try:
            if parsed.path == '/api/growth/session':
                return self.send_json({'token': TOKEN})
            if parsed.path == '/api/growth/health':
                return self.send_json({'ok': True, 'version': 'growth-1', 'ai': rescue.public_config(),
                    'providers': legacy.ccswitch_catalog()['providers'],
                    'capabilities': {'pdf': bool(importlib.util.find_spec('pypdf')), 'docx': True,
                                     'wechat': bool(importlib.util.find_spec('pywinauto')),
                                     'videoFrames': True, 'videoAudio': False},
                    'storage': '此电脑持久保存资料与处理进度；原清单仍在原浏览器空间。'})
            if parsed.path == '/api/growth/remote-status':
                from growth_remote import status
                return self.send_json(status())
            if parsed.path == '/api/growth/state':
                return self.send_json(flow.state(account))
            if parsed.path == '/api/growth/materials':
                from growth_materials import listing
                return self.send_json(listing(account))
            if parsed.path == '/api/growth/obsidian-status':
                from growth_obsidian import status
                return self.send_json(status())
            if parsed.path == '/api/growth/run':
                return self.send_json(flow.get_run(account, params.get('id', [''])[0]))
            return self.send_json({'error': '接口不存在'}, 404)
        except ValueError as exc:
            return self.send_json({'error': str(exc)}, 400)

    def do_POST(self):
        path = urlparse(self.path).path
        if path.startswith('/api/obsidian-bridge/'):
            return self.obsidian_bridge(path)
        if not path.startswith('/api/growth/'):
            return super().do_POST()
        if not self.growth_allowed() or not secrets.compare_digest(self.headers.get('X-Growth-Token', ''), TOKEN):
            return self.send_json({'error': '连接验证已过期，请关闭资料窗口后重开。'}, 403)
        if not self.headers.get('Content-Type', '').startswith('application/json'):
            return self.send_json({'error': '需要 JSON 请求'}, 415)
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 1 <= size <= 8_000_000:
                return self.send_json({'error': '请求超过 8 MB，请减少图片数量或压缩资料。'}, 413)
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict):
                raise ValueError('请求格式不正确。')
            if path == '/api/growth/project':
                return self.send_json(flow.save_project(data))
            if path == '/api/growth/materials-add':
                from growth_materials import add
                return self.send_json(add(data.get('account'), data.get('materials')))
            if path == '/api/growth/materials-change':
                from growth_materials import change
                return self.send_json(change(data))
            if path == '/api/growth/obsidian-connect':
                from growth_obsidian import pair_start
                return self.send_json(pair_start())
            if path == '/api/growth/obsidian-import':
                import growth_obsidian as obsidian
                from growth_materials import add
                vaults = {v['vaultId']: v for v in obsidian.status()['vaults']}
                vault = vaults.get(str(data.get('vaultId')))
                if not vault:
                    raise ValueError('当前知识库未连接，请重新打开 Obsidian。')
                note = obsidian.request(vault['vaultId'], 'read', data)
                return self.send_json(add(data.get('account'), [{'source': 'obsidian', 'title': note['path'].rsplit('/', 1)[-1],
                    'content': note['content'], 'sourceRef': vault['vaultId'] + '/' + note['path'],
                    'metadata': {'vault': vault['name'], 'vaultId': vault['vaultId'], 'notePath': note['path']}}]))
            if path == '/api/growth/obsidian-save':
                from growth_obsidian import request
                return self.send_json(request(str(data.get('vaultId')), 'save', data))
            if path == '/api/growth/run':
                return self.send_json(flow.start(data), 202)
            if path == '/api/growth/retry':
                return self.send_json(flow.retry(data), 202)
            if path == '/api/growth/model':
                identifier = str(data.get('id', ''))
                started = time.monotonic()
                result = legacy.connect_ccswitch(identifier, verify=True)
                temp = MODEL_FILE.with_suffix('.tmp')
                temp.write_text(json.dumps({'id': identifier}), encoding='utf-8')
                temp.replace(MODEL_FILE)
                return self.send_json({**result, 'latencyMs': round((time.monotonic() - started) * 1000)})
            if path == '/api/growth/model-test':
                started = time.monotonic()
                result = rescue.test_connection()
                if not result.get('verified'):
                    raise ValueError('模型配置已在测试期间改变，请重新测试当前模型。')
                return self.send_json({**result, 'latencyMs': round((time.monotonic() - started) * 1000)})
            if path == '/api/growth/search-test':
                return self.send_json(rescue.search_web('Python official tutorial', 3))
            if path == '/api/growth/remote-start':
                from growth_remote import ensure_ready
                return self.send_json(ensure_ready())
            if path == '/api/growth/wechat-search':
                from growth_wechat import search_messages
                return self.send_json(search_messages(data.get('keyword', '')))
            if path == '/api/growth/wechat-open':
                from growth_wechat import open_wechat
                return self.send_json(open_wechat())
            if path == '/api/growth/wechat-open-choice':
                from growth_wechat import open_choice
                return self.send_json(open_choice(data.get('id')))
            if path == '/api/growth/wechat-screen-follow':
                from growth_wechat_screen import follow_results
                return self.send_json(follow_results(data))
            if path == '/api/growth/wechat-screen-open':
                from growth_wechat_screen import open_result
                return self.send_json(open_result(data))
            if path == '/api/growth/wechat-stop':
                from growth_wechat import cancel_search
                from growth_wechat_screen import cancel
                cancel()
                return self.send_json(cancel_search())
            if path in ('/api/growth/wechat-screen-start', '/api/growth/wechat-screen-read'):
                from growth_wechat_screen import start_search, finish_search
                return self.send_json(start_search(data) if path.endswith('start') else finish_search(data))
            if path == '/api/growth/ocr-frame':
                from growth_ocr import read_frame
                return self.send_json(read_frame(data.get('image')))
            if path.startswith('/api/growth/wechat-float-'):
                import growth_wechat_float as floating
                action = path.rsplit('-', 1)[-1]
                if action == 'start': return self.send_json(floating.start(data))
                if action == 'poll': return self.send_json(floating.poll(data.get('id')))
                if action == 'frame': return self.send_json(floating.submit_frame(data))
                if action == 'stop': return self.send_json(floating.stop(data.get('id')))
            if path == '/api/growth/wechat-group-list':
                from growth_wechat import search_group_list
                return self.send_json(search_group_list(data.get('query', '')))
            if path == '/api/growth/wechat-group-messages':
                from growth_wechat import read_group_messages
                return self.send_json(read_group_messages(data.get('id'), data.get('keyword', '')))
            if path in ('/api/growth/wechat-groups', '/api/growth/wechat-messages'):
                from sy_wechat_search import search_groups, read_messages
                result = search_groups(data.get('query', '')) if path.endswith('groups') else read_messages(data.get('id'), data.get('keyword'))
                return self.send_json(result)
            return self.send_json({'error': '接口不存在'}, 404)
        except rescue.RescueError as exc:
            return self.send_json({'error': str(exc), 'code': exc.code, **exc.extra}, exc.status)
        except (ValueError, TypeError, KeyError, UnicodeError) as exc:
            return self.send_json({'error': str(exc)}, 400)
        except Exception as exc:
            return self.send_json({'error': '此步未完成（' + type(exc).__name__ + '）。已有内容保留。'}, 502)

    def obsidian_bridge(self, path):
        # Plugin-to-local-service only. A webpage cannot obtain a reusable plugin
        # credential; registration consumes a 60-second single-use pairing code.
        port = self.server.server_port
        if self.headers.get('Host') not in {f'127.0.0.1:{port}', f'localhost:{port}'} or self.headers.get('Origin') not in (None, 'app://obsidian.md'):
            return self.send_json({'error': '来源不允许'}, 403)
        if not self.headers.get('Content-Type', '').startswith('application/json'):
            return self.send_json({'error': '需要 JSON 请求'}, 415)
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 1 <= size <= 500000:
                return self.send_json({'error': '笔记请求过大'}, 413)
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict):
                raise ValueError('请求无效。')
            import growth_obsidian as obsidian
            if path == '/api/obsidian-bridge/register':
                return self.send_json(obsidian.register(data))
            if path == '/api/obsidian-bridge/poll':
                return self.send_json(obsidian.poll(data, self.headers.get('X-Obsidian-Token', '')))
            return self.send_json({'error': '接口不存在'}, 404)
        except PermissionError as exc:
            return self.send_json({'error': str(exc)}, 403)
        except (ValueError, TypeError, KeyError, UnicodeError) as exc:
            return self.send_json({'error': str(exc)}, 400)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8877)
    args = parser.parse_args()
    server = legacy.LocalServer(('127.0.0.1', args.port), Handler)
    flow.recover_interrupted()
    print(f'上岸鸭资料行动： http://127.0.0.1:{args.port}/index.html', flush=True)
    server.serve_forever()
