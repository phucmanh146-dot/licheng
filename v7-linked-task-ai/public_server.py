"""Public gateway for the original complete app. Browser sessions own separate backend processes."""
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from http.cookies import SimpleCookie
from urllib.parse import urlsplit,unquote
from pathlib import Path
import os,sys,secrets,threading,subprocess,socket,time,json,http.client,atexit
import cloud_accounts
ROOT=Path(__file__).resolve().parent
SESSION_ROOT=Path(os.environ.get('SHANGANYA_SESSION_ROOT',str(cloud_accounts.DATA/'sessions')))
SESSION_ROOT.mkdir(parents=True,exist_ok=True)
SESSIONS={};LOCK=threading.RLock()
BLOCKED=('/api/wechat-private/','/api/pm/wx/','/api/pm/desktop-tool/','/api/pm/screen-')
EXACT={'/api/screen-ocr','/api/ai-local-gateway','/api/cc-switch','/api/cc-switch/connect','/api/pm/vault-select','/api/pm/vault-open','/api/pm/vault-explorer','/api/pm/vault-reveal-note'}
def backend(cookie):
 with LOCK:
  item=SESSIONS.get(cookie)
  if item and item['process'].poll() is None:item['seen']=time.monotonic();return item['port']
  if len(SESSIONS)>=40:raise RuntimeError('当前访客较多，请稍后重试')
  sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close()
  home=SESSION_ROOT/cookie;home.mkdir(exist_ok=True)
  env=os.environ.copy();env.pop('SY_WECHAT_AGENT_TOKEN',None);env.pop('SHANGANYA_ACCOUNT_DATA_DIR',None);env.update(SHANGANYA_SESSION_HOME=str(home),SHANGANYA_WORKER_PORT=str(port))
  process=subprocess.Popen([sys.executable,str(ROOT/'public_worker.py')],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  SESSIONS[cookie]={'process':process,'port':port,'seen':time.monotonic()}
 for _ in range(100):
  if process.poll() is not None:raise RuntimeError('后台未能启动，请稍后重试')
  try:
   with socket.create_connection(('127.0.0.1',port),.2):return port
  except OSError:time.sleep(.1)
 raise RuntimeError('后台启动较慢，请重试')
def has_cloud_notes(account):
 home=SESSION_ROOT/('user_'+account['storage'])
 folders=[home/'vault']
 active=home/'active-vault.json'
 try:
  name=json.loads(active.read_text(encoding='utf-8')).get('name','')
  if name and not any(c in name for c in ('/',chr(92),chr(0))) and not name.startswith('.'):folders=[home/'vaults'/name]
 except (OSError,ValueError,TypeError):pass
 return any(p.is_file() and p.suffix.lower() in ('.md','.canvas') for folder in folders if folder.exists() for p in folder.rglob('*'))
def cleanup():
 while True:
  time.sleep(60)
  with LOCK:
   for key,item in list(SESSIONS.items()):
    if time.monotonic()-item['seen']>7200:item['process'].terminate();del SESSIONS[key]
threading.Thread(target=cleanup,daemon=True).start()
atexit.register(lambda:[x['process'].terminate() for x in SESSIONS.values() if x['process'].poll() is None])
class Public(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):self.session=None;self.new_session=False;self.account_cookie=None;super().__init__(*a,directory=str(ROOT),**kw)
 def identity(self):
  account=cloud_accounts.current(self)
  if account:return 'user_'+account['storage']
  cookies=SimpleCookie()
  try:cookies.load(self.headers.get('Cookie',''))
  except Exception:pass
  key=cookies.get('sy_session');key=key.value if key else ''
  if len(key)!=64 or not all(c in '0123456789abcdef' for c in key):key=secrets.token_hex(32);self.new_session=True
  self.session=key;return 'guest_'+key
 def log_message(self,fmt,*args):
  if urlsplit(self.path).path=='/auth/claim':return
  return super().log_message(fmt,*args)
 def end_headers(self):
  if self.account_cookie:self.send_header('Set-Cookie',self.account_cookie)
  if self.new_session and self.session:
   secure='; Secure' if self.headers.get('X-Forwarded-Proto')=='https' else ''
   self.send_header('Set-Cookie','sy_session='+self.session+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400'+secure)
  self.send_header('X-Content-Type-Options','nosniff');self.send_header('Cache-Control','no-store');super().end_headers()
 def message(self,data,status=200):
  body=json.dumps(data,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def api(self):
  path=urlsplit(self.path).path
  forward_body=None
  if self.headers.get('Origin') and urlsplit(self.headers['Origin']).netloc!=self.headers.get('Host'):return self.message({'error':'请从本网站打开'},403)
  if cloud_accounts.handle(self):return
  account=cloud_accounts.current(self)
  if account and cloud_accounts.agent_for(account['id']) and path in ('/api/pm/tutorials','/api/pm/tutorial-links','/api/source/prepare','/api/sources/read') and not (path in ('/api/pm/tutorials','/api/pm/tutorial-links','/api/source/prepare') and has_cloud_notes(account)):
   try:
    size=int(self.headers.get('Content-Length','0'))
    if size<0 or size>40000:return self.message({'error':'查询大小无效。'},413)
    forward_body=self.rfile.read(size) if size else b''
    payload=json.loads(forward_body) if forward_body else {}
    if path=='/api/pm/tutorials':payload={'q':__import__('urllib.parse',fromlist=['parse_qs']).parse_qs(urlsplit(self.path).query).get('q',[''])[0]}
    if path!='/api/source/prepare' or payload.get('url'):
     return self.message(cloud_accounts.relay(account['id'],path,payload))
   except Exception as exc:return self.message({'error':str(exc)[:250]},503)
  if path in EXACT or path.startswith(BLOCKED):return self.message({'error':'当前账号尚未完成此项服务授权，本次未读取数据。','code':'SERVICE_AUTHORIZATION_REQUIRED'},409)
  try:
   port=backend(self.identity());size=int(self.headers.get('Content-Length','0'))
   if size<0 or size>32*1024*1024:return self.message({'error':'网页单次请求上限32MB，请分批导入'},413)
   body=forward_body if forward_body is not None else (self.rfile.read(size) if size else None);connection=http.client.HTTPConnection('127.0.0.1',port,timeout=180)
   headers={'Content-Type':self.headers.get('Content-Type','application/json'),'Host':'127.0.0.1:'+str(port),'Origin':'http://127.0.0.1:'+str(port)}
   connection.request(self.command,self.path,body=body,headers=headers);response=connection.getresponse();payload=response.read();self.send_response(response.status)
   for key,value in response.getheaders():
    if key.lower() in ('content-type','content-disposition'):self.send_header(key,value)
   self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload);connection.close()
  except Exception as e:self.message({'error':str(e)},503)
 def do_GET(self):
  if urlsplit(self.path).path=='/auth/claim':return cloud_accounts.handle(self)
  if urlsplit(self.path).path in ('/public-health','/publichealth'):return self.message({'ok':True,'product':'shanganya-original-complete'})
  if self.path.startswith('/api/'):return self.api()
  path=unquote(urlsplit(self.path).path)
  if path in ('/','/index.html') or path.endswith('.html'):self.identity()
  target=(ROOT/path.lstrip('/')).resolve()
  if not target.is_relative_to(ROOT) or any(p.startswith('.') for p in Path(path).parts) or target.suffix.lower() not in ('.html','.js','.mjs','.css','.png','.jpg','.jpeg','.webp','.gif','.svg','.ico','.woff','.woff2','.ttf') and path not in ('/',''):return self.send_error(404)
  return super().do_GET()
 def do_POST(self):
  if self.path.startswith('/api/'):return self.api()
  return self.send_error(404)
 def do_HEAD(self):
  path=unquote(urlsplit(self.path).path)
  if path.startswith('/api/'):return self.send_error(405)
  return self.do_GET()
if __name__=='__main__':
 port=int(os.environ.get('PORT','8898'));print('Original complete app listening on '+str(port),flush=True);ThreadingHTTPServer(('0.0.0.0',port),Public).serve_forever()
