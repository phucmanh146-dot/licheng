from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
import json, os, socket
if os.environ.get('SHANGANYA_WORKER_PORT'):
    os.environ['FOCUS_ALLOW_LOCAL_AI'] = '0'
else:
    os.environ.setdefault('FOCUS_ALLOW_LOCAL_AI', '1')
from urllib.parse import unquote
import pm_agent_bridge as pm
import obsidian_direct_links as odlinks
import pm_ext_sources as ext
import pm_vault_manager as vman
import pm_wechat_desktop as wxdesk
import wechat_toolbar_bridge as wxtool
import p2_chat_backend as p2
import agent_runtime as agent
import knowledge_agent_skills as kskills
import source_workflow as sourceflow
from public_link_reader import research as source_research
from local_integrations import initialize, ccswitch_catalog, connect_ccswitch, connect_local_gateway
from local_tools import vault_info, vault_list, vault_search, vault_read, vault_save, screen_ocr
from rescue_service import RescueError, ask_ai, extract, extract_uploaded, extract_video, preview_url, read_feishu, search_web, search_config_snapshot, set_search_config, public_config, set_config, test_connection, observe_frame, list_models, provider_catalog, discover_model_catalog, team_public_config, set_team_config
from desktop_feishu_reader import read_feishu_via_browser

ROOT = os.path.dirname(os.path.abspath(__file__))
# Original credential discovery disabled in hosted copy.

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw): super().__init__(*a,directory=ROOT,**kw)
    def allowed(self):
        hosts = ('127.0.0.1:' + str(self.server.server_port), 'localhost:' + str(self.server.server_port))
        origin = self.headers.get('Origin')
        path = urlparse(self.path).path
        local_origin = origin is None or origin == 'null' or origin in ('http://' + h for h in hosts)
        # Public workbench bridges are narrowly allowlisted. Obsidian routes are read-only
        # and are called only after the user explicitly enables knowledge retrieval in Connect AI.
        public_origin = origin == 'https://shanganya-full-public-20261017-production.up.railway.app'
        public_bridge_origin = public_origin and path == '/api/feishu/desktop-read'
        public_obsidian_origin = public_origin and path in ('/api/pm/tutorials', '/api/pm/tutorial-links', '/api/vault', '/api/vault-list', '/api/vault-search', '/api/vault-read')
        return self.headers.get('Host', '') in hosts and (local_origin or public_bridge_origin or public_obsidian_origin)
    def end_headers(self):
        origin = self.headers.get('Origin')
        if origin and self.allowed():
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Focus-Client')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()
    def send_json(self,obj,status=200):
        raw=json.dumps(obj,ensure_ascii=False).encode('utf-8'); self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Content-Length',str(len(raw))); self.end_headers()
        try: self.wfile.write(raw)
        except (BrokenPipeError, ConnectionResetError): pass
    def wechat_private(self,method,data=None):
        # Loopback Host and same-origin browser requests only. No bridge token in HTML.
        host=self.headers.get('Host','')
        origin=self.headers.get('Origin')
        site=self.headers.get('Sec-Fetch-Site','')
        if not self.allowed() or origin=='null' or site in ('cross-site','same-site') or (origin and origin!='http://'+host):
            return self.send_json({'error':'请从本机上岸鸭页面连接'},403)
        import win32gui
        foreground=win32gui.GetForegroundWindow()
        try:
            from sy_wechat_reader import api
            route=self.path[len('/api/wechat-private'):]
            result=api(method,route,data)
            return self.send_json(result)
        except Exception as ex:
            return self.send_json({'error':str(ex)[:300]},422)
        finally:
            try:win32gui.SetForegroundWindow(foreground)
            except Exception:pass
    def do_OPTIONS(self):
        if not self.allowed(): return self.send_json({'error':'来源不允许'},403)
        self.send_response(204); self.end_headers()
    def do_GET(self):
        if not self.allowed(): return self.send_json({'error':'来源不允许'},403)
        path = urlparse(self.path).path
        if path.startswith('/api/wechat-private/'):
            return self.wechat_private('GET')
        if path == '/api/health':
            cfg = public_config()
            try:
                import yt_dlp  # noqa: F401
                video = True
            except ImportError:
                video = False
            feishu = bool(os.getenv('FEISHU_APP_ID','').strip() and os.getenv('FEISHU_APP_SECRET','').strip())
            vault = vault_info()
            return self.send_json({'ok':True,'version':'rescue-3','build':'v7.2','capabilities':{'search':True,'searchFallback':False,'extract':True,'urlPreview':True,'video':video,'feishu':feishu,'ai':cfg['configured'],'aiVerified':cfg['verified'],'imageImport':True,'outline':True,'vault':vault['connected'],'screenOcr':True},'ai':cfg,'vault':vault,'warn':'' if cfg['configured'] else 'AI 尚未连接；资料读取与按材料排路线仍可使用。','feishuNote':None if feishu else '飞书读取未启用；请配置 FEISHU_APP_ID 和 FEISHU_APP_SECRET 后重新启动服务。'})
        if path == '/api/ai-config': return self.send_json(public_config())
        if path == '/api/search-config': return self.send_json(search_config_snapshot())
        if path == '/api/ai-team-config': return self.send_json(team_public_config())
        if path == '/api/public-feishu-status': return self.send_json({'ok':True,'configured':bool(os.getenv('FEISHU_APP_ID','').strip() and os.getenv('FEISHU_APP_SECRET','').strip())})
        if path == '/api/vault': return self.send_json(vault_info())
        if path == '/api/p2/status': return self.send_json(p2.status())
        if path == '/api/agent/tasks':
            from urllib.parse import parse_qs
            q=parse_qs(urlparse(self.path).query)
            return self.send_json(agent.list_tasks(account_id=q.get('accountId',['default'])[0]))
        if path == '/api/agent/skill-catalog': return self.send_json(kskills.skills())
        if path == '/api/agent/tools': return self.send_json(agent.tool_catalog())
        if path == '/api/agent/recover':
            from urllib.parse import parse_qs
            q=parse_qs(urlparse(self.path).query)
            return self.send_json(agent.recover({'taskId':q.get('taskId',[''])[0],'query':q.get('q',[''])[0],'sessionId':q.get('sessionId',[''])[0],'accountId':q.get('accountId',['default'])[0]}))
        if path == '/api/pm/tutorials': return self.send_json(odlinks.catalog(__import__('urllib.parse',fromlist=['parse_qs']).parse_qs(urlparse(self.path).query).get('q',[''])[0]))
        if path == '/api/pm/status': return self.send_json({**pm.status(),'transcription':ext.get_transcribe_state(),'vaultConfig':vman.vault_status()})
        if path == '/api/pm/wx/status': return self.send_json(wxdesk.status())
        if path == '/api/pm/events': return self.send_json(pm.obsidian_bridge_events(__import__('urllib.parse',fromlist=['parse_qs']).parse_qs(urlparse(self.path).query).get('after',['0'])[0]))
        if path == '/api/ai-providers': return self.send_json(provider_catalog())
        if path == '/api/model-discovery':
            q=parse_qs(urlparse(self.path).query)
            return self.send_json(discover_model_catalog(q.get('q',[''])[0], q.get('provider',[''])[0], q.get('limit',['100'])[0]))
        if path == '/api/cc-switch': return self.send_json(ccswitch_catalog())
        if path.startswith('/api/'): return self.send_json({'error':'接口不存在'},404)
        if path.endswith(('.py','.pyc','.cmd','.ps1','.env','.log','.zip','.json','.sqlite','.sqlite3','.db','.sqlite3-wal','.sqlite3-shm')) or any(p.startswith('.') for p in path.split('/') if p):
            return self.send_json({'error':'文件不可通过浏览器读取'},403)
        return super().do_GET()
    def do_POST(self):
        if not self.allowed(): return self.send_json({'error':'来源不允许'},403)
        if self.path=='/api/pm/file':
            if self.headers.get('Content-Type','').split(';')[0] != 'application/octet-stream':
                return self.send_json({'error':'文件应以二进制格式上传'},415)
            try:
                size=int(self.headers.get('Content-Length','0'))
                if size<1 or size>pm.MAX_BINARY:
                    return self.send_json({'error':'上传文件必须小于220MB','code':'FILE_TOO_LARGE'},413)
                name=unquote(self.headers.get('X-Upload-Name',''))[:200]
                if not name:return self.send_json({'error':'缺少文件名'},400)
                return self.send_json(pm.receive_file(name,self.rfile,size))
            except RescueError as ex:return self.send_json({'error':str(ex),'code':ex.code},ex.status)
            except Exception:return self.send_json({'error':'附件处理失败，检查文件是否完整'},422)
        if not self.headers.get('Content-Type','').startswith('application/json'):
            return self.send_json({'error':'需要 JSON 请求'},415)
        try:
            size = int(self.headers.get('Content-Length','0'))
            max_size = 350000 if self.path == '/api/focus-observe' else (7200000 if self.path == '/api/extract-file' else (1200000 if self.path == '/api/p2/ask' else 150000))
            if self.path == '/api/source/prepare': max_size = 4_000_000
            if self.path == '/api/vault-save': max_size = 12_000_000
            if size < 1 or size > max_size: return self.send_json({'error':'请求大小不正确'},413)
            data = json.loads(self.rfile.read(size))
            if not isinstance(data,dict): raise ValueError()
        except (ValueError,UnicodeError): return self.send_json({'error':'请求格式不正确'},400)
        try:
            if self.path.startswith('/api/wechat-private/'):
                return self.wechat_private('POST',data)
            if self.path=='/api/pm/obsidian-event':
                return self.send_json(pm.obsidian_bridge_event(data,self.headers.get('X-SY-Obsidian-Token','')))
            if self.path=='/api/pm/wx/focus': return self.send_json(wxdesk.focus_wechat())
            if self.path=='/api/pm/wx/search': return self.send_json(wxdesk.search_visible(data.get('keyword',''),data.get('scope','group')))
            if self.path=='/api/pm/wx/open-hit': return self.send_json(wxdesk.open_search_result(data.get('searchId'),data.get('candidateId')))
            if self.path=='/api/pm/desktop-tool/start': return self.send_json(wxtool.start(self.server.server_port))
            if self.path=='/api/pm/desktop-tool/events': return self.send_json(wxtool.events(data))
            if self.path=='/api/pm/desktop-tool/capture': return self.send_json(wxtool.capture(data))
            if self.path=='/api/pm/desktop-tool/crop': return self.send_json(wxtool.crop(data))
            if self.path=='/api/pm/screen-capture': return self.send_json(pm.capture_wechat_window())
            if self.path=='/api/pm/screen-crop': return self.send_json(pm.crop_wechat_window(data))
            if self.path=='/api/pm/vault-select': return self.send_json(vman.choose_vault(data.get('path'),bool(data.get('interactive',False))))
            if self.path=='/api/pm/vault-open': return self.send_json(vman.open_vault())
            if self.path=='/api/pm/vault-explorer': return self.send_json(vman.reveal_in_explorer())
            if self.path=='/api/pm/vault-reveal-note': return self.send_json(vman.reveal_note_in_explorer(data.get('path','')))
            if self.path=='/api/pm/tutorial-links': return self.send_json(odlinks.document_links(data.get('path','')))
            if self.path=='/api/pm/note': return self.send_json(pm.read_note(data.get('path','')))
            if self.path=='/api/source/prepare': return self.send_json(sourceflow.prepare(data))
            if self.path=='/api/source/research': return self.send_json(source_research(data.get('url',''),data.get('title','')))
            if self.path=='/api/source/summarize': return self.send_json(sourceflow.summarize(data))
            if self.path=='/api/pm/url': return self.send_json(pm.import_url(data.get('url','')))
            if self.path=='/api/p2/ask': return self.send_json(p2.ask(data))
            if self.path=='/api/agent/recover-intent': return self.send_json(agent.recover_intent(data))
            if self.path=='/api/agent/task/create': return self.send_json({'ok':True,'task':agent.create_task(data)})
            if self.path=='/api/agent/task/switch': return self.send_json(agent.switch_task(data))
            if self.path=='/api/agent/task/checkpoint': return self.send_json(agent.checkpoint(data))
            if self.path=='/api/agent/task/complete': return self.send_json(agent.complete_task(data))
            if self.path=='/api/agent/knowledge/classify':
                try: return self.send_json(kskills.batch(data))
                except (ValueError, TypeError) as exc: return self.send_json({'ok':False,'error':str(exc)},400)
            if self.path=='/api/agent/run': return self.send_json(agent.run_agent(data))
            if self.path=='/api/agent/tool-call': return self.send_json({'ok':True,'tool':str(data.get('tool') or ''),'result':agent.call_tool(str(data.get('tool') or ''),data.get('arguments') or {})})
            if self.path=='/api/pm/ask': return self.send_json(pm.analyze(data))
            if self.path=='/api/pm/transcribe-config': return self.send_json(ext.set_transcribe_config(data))
            if self.path=='/api/pm/config': return self.send_json(set_config(dict(data,verify=True)))
            if self.path=='/api/ai-team-config': return self.send_json(set_team_config(data))
            if self.path=='/api/feishu/desktop-read':
                return self.send_json(read_feishu_via_browser(data.get('url','')))
            if self.path=='/api/public-feishu-config':
                if data.get('clear'):
                    os.environ.pop('FEISHU_APP_ID',None); os.environ.pop('FEISHU_APP_SECRET',None)
                    return self.send_json({'ok':True,'configured':False})
                app_id=str(data.get('appId','')).strip(); app_secret=str(data.get('appSecret','')).strip()
                if not (app_id and app_secret) or len(app_id)>200 or len(app_secret)>200 or '\n' in app_id+app_secret or '\r' in app_id+app_secret:
                    return self.send_json({'error':'请填写有效的飞书应用凭证'},400)
                os.environ['FEISHU_APP_ID']=app_id; os.environ['FEISHU_APP_SECRET']=app_secret
                return self.send_json({'ok':True,'configured':True,'note':'凭证已保存在本机服务内存；请测试实际文档权限。'})
            if self.path=='/api/sources/read':
                return self.send_json(extract(str(data.get('url','')).strip()))
            if self.path=='/api/pm/test': return self.send_json(test_connection())
            if self.path=='/api/search-config': return self.send_json(set_search_config(data))
            if self.path=='/api/search':
                q=str(data.get('q','')).strip(); n=max(1,min(12,int(data.get('n',8))))
                if not q: return self.send_json({'error':'缺少搜索词'},400)
                return self.send_json(search_web(q,n,data.get('provider')))
            if self.path=='/api/extract':
                return self.send_json(extract(str(data.get('url','')).strip()))
            if self.path=='/api/url-preview':
                return self.send_json(preview_url(str(data.get('url','')).strip()))
            if self.path=='/api/feishu':
                return self.send_json(read_feishu(str(data.get('url','')).strip()))
            if self.path=='/api/extract-file':
                return self.send_json(extract_uploaded(data))
            if self.path in ('/api/video-extract','/api/video'):
                return self.send_json(extract_video(str(data.get('url','')).strip()))
            if self.path=='/api/ask-ai': return self.send_json(ask_ai(data))
            if self.path=='/api/vault-list': return self.send_json(vault_list(data.get('limit', 200), bool(data.get('with_text'))))
            if self.path=='/api/vault-search': return self.send_json(vault_search(data.get('q',''), data.get('limit', 12)))
            if self.path=='/api/vault-read': return self.send_json(vault_read(data.get('path',''), data.get('limit', 20000)))
            if self.path=='/api/vault-save': return self.send_json(vault_save(data.get('title',''), data.get('text','')))
            if self.path=='/api/screen-ocr': return self.send_json(screen_ocr())
            if self.path=='/api/ai-local-gateway':
                result = connect_local_gateway()
                if result is None:
                    raise RescueError('没有连上本机 Hermes 网关。请确认 127.0.0.1:8642 正在运行，且 ~/.hermes/.env 里有 API_SERVER_KEY。', 'GATEWAY_UNAVAILABLE', 503)
                return self.send_json(dict(result, provider='本机 Hermes 网关', imported=True))
            if self.path=='/api/focus-observe': return self.send_json(observe_frame(data))
            if self.path=='/api/ai-config': return self.send_json(set_config(data))
            if self.path=='/api/ai-models': return self.send_json(list_models(data))
            if self.path=='/api/ai-test': return self.send_json(test_connection())
            if self.path=='/api/cc-switch/connect': return self.send_json(connect_ccswitch(data.get('id')))
            return self.send_json({'error':'接口不存在'},404)
        except RescueError as ex: return self.send_json({'error':str(ex),'code':ex.code,**ex.extra},ex.status)
        except Exception: return self.send_json({'error':'服务暂时未完成请求，请检查输入后重试。','code':'SERVER_ERROR'},502)

class LocalServer(ThreadingHTTPServer):
    allow_reuse_address = False
    def server_bind(self):
        if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


if __name__=='__main__':
    os.chdir(ROOT)
    # On the local desktop only, reconnect the already-running Hermes gateway at startup.
    # Hosted public_worker sessions do not run this block and cannot access the user's loopback gateway.
    try:
        gateway = connect_local_gateway()
        if gateway:
            print('Local AI gateway detected and configured.', flush=True)
    except Exception:
        pass
    print('Focus Quest: http://127.0.0.1:8877/index.html', flush=True)
    LocalServer(('127.0.0.1',8877),Handler).serve_forever()
