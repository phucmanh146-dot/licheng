"""Account-owned, authenticated relay. Only fixed read operations may reach the agent."""
from pathlib import Path
from http.cookies import SimpleCookie
from urllib.parse import urlsplit,parse_qs
import os,json,time,secrets,sqlite3,hashlib,hmac,threading,re
DATA=Path(os.environ.get('SHANGANYA_ACCOUNT_DATA_DIR',str(Path(__file__).parent/'.cloud-data')))
DATA.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('SHANGANYA_PUBLIC_BASE_URL','https://shanganya-full-public-20261017-production.up.railway.app').rstrip('/')
ATTEMPTS={};RATE_LOCK=threading.Lock()
def db():
 c=sqlite3.connect(DATA/'accounts.sqlite3',timeout=15);c.row_factory=sqlite3.Row;c.execute('PRAGMA busy_timeout=15000');return c
with db() as c:
 c.executescript("""
 PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL,password TEXT,storage TEXT NOT NULL UNIQUE);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,uid TEXT NOT NULL,expires REAL NOT NULL);
 CREATE TABLE IF NOT EXISTS agents(id TEXT PRIMARY KEY,uid TEXT NOT NULL,seen REAL NOT NULL);
 CREATE TABLE IF NOT EXISTS claims(token TEXT PRIMARY KEY,uid TEXT NOT NULL,expires REAL NOT NULL);
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,uid TEXT NOT NULL,agent TEXT NOT NULL,op TEXT NOT NULL,payload TEXT NOT NULL,state TEXT NOT NULL,result TEXT,created REAL NOT NULL);
 CREATE TABLE IF NOT EXISTS follows(uid TEXT NOT NULL,name TEXT NOT NULL,PRIMARY KEY(uid,name));
 CREATE TABLE IF NOT EXISTS messages(uid TEXT NOT NULL,id TEXT NOT NULL,grp TEXT NOT NULL,sender TEXT,body TEXT NOT NULL,date TEXT,PRIMARY KEY(uid,id));
 """)
def digest(value):return hashlib.sha256(value.encode()).hexdigest()
def password_hash(value):
 if not isinstance(value,str) or not 10<=len(value)<=128:raise ValueError('密码需要10至128个字符。')
 salt=secrets.token_bytes(16);hashed=hashlib.scrypt(value.encode(),salt=salt,n=16384,r=8,p=1,maxmem=67108864)
 return salt.hex()+':'+hashed.hex()
def password_matches(value,stored):
 if not stored or not isinstance(value,str) or len(value)>128:return False
 salt,expected=stored.split(':',1)
 actual=hashlib.scrypt(value.encode(),salt=bytes.fromhex(salt),n=16384,r=8,p=1,maxmem=67108864).hex()
 return hmac.compare_digest(actual,expected)
def cookie_token(handler):
 cookie=SimpleCookie()
 try:cookie.load(handler.headers.get('Cookie',''))
 except Exception:return ''
 return cookie.get('sy_auth').value if cookie.get('sy_auth') else ''
def current(handler):
 token=cookie_token(handler)
 if len(token)!=64:return None
 with db() as c:row=c.execute('SELECT users.* FROM users JOIN sessions ON users.id=sessions.uid WHERE sessions.token=? AND sessions.expires>?',(digest(token),time.time())).fetchone()
 return dict(row) if row else None
def set_session(handler,uid):
 token=secrets.token_hex(32)
 with db() as c:
  c.execute('DELETE FROM sessions WHERE expires<?',(time.time(),))
  c.execute('DELETE FROM sessions WHERE uid=? AND token NOT IN (SELECT token FROM sessions WHERE uid=? ORDER BY expires DESC LIMIT 9)',(uid,uid))
  c.execute('INSERT INTO sessions VALUES (?,?,?)',(digest(token),uid,time.time()+30*86400))
 secure='; Secure' if handler.headers.get('X-Forwarded-Proto')=='https' else ''
 handler.account_cookie='sy_auth='+token+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000'+secure
def agent_ok(handler):
 wanted=os.environ.get('SY_WECHAT_AGENT_TOKEN','')
 supplied=handler.headers.get('Authorization','')
 return len(wanted)>=32 and hmac.compare_digest(supplied,'Bearer '+wanted)
def body(handler,limit=40000):
 n=int(handler.headers.get('Content-Length','0'))
 if n<1 or n>limit:raise ValueError('请求大小无效。')
 data=json.loads(handler.rfile.read(n))
 if not isinstance(data,dict):raise ValueError('请求格式无效。')
 return data
def throttle(name):
 now=time.time()
 with RATE_LOCK:
  ATTEMPTS[name]=[t for t in ATTEMPTS.get(name,[]) if now-t<60]
  if len(ATTEMPTS[name])>=8:raise ValueError('尝试较频繁，请一分钟后重试。')
  ATTEMPTS[name].append(now)
  if len(ATTEMPTS)>3000:ATTEMPTS.clear()
def agent_for(uid):
 with db() as c:row=c.execute('SELECT * FROM agents WHERE uid=? ORDER BY seen DESC LIMIT 1',(uid,)).fetchone()
 return dict(row) if row else None
def relay(uid,op,payload):
 agent=agent_for(uid)
 if not agent:raise PermissionError('此账号尚未绑定微信授权，没有读取聊天内容。')
 if time.time()-agent['seen']>45:raise RuntimeError('已授权的读取会话暂时离线，本次尚未取得结果。')
 jid=secrets.token_hex(16)
 with db() as c:
  active=c.execute("SELECT COUNT(*) FROM jobs WHERE uid=? AND state IN ('queued','running') AND created>?",(uid,time.time()-100)).fetchone()[0]
  if active>=4:raise ValueError('已有读取任务进行中，请等待结果。')
  c.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?)',(jid,uid,agent['id'],op,json.dumps(payload,ensure_ascii=False),'queued',None,time.time()))
 deadline=time.monotonic()+85
 while time.monotonic()<deadline:
  with db() as c:row=c.execute('SELECT state,result FROM jobs WHERE id=? AND uid=?',(jid,uid)).fetchone()
  if row and row['state']=='done':
   result=json.loads(row['result'])
   with db() as c:c.execute('DELETE FROM jobs WHERE id=?',(jid,))
   if result.get('error'):raise RuntimeError(result['error'])
   return result
  time.sleep(.3)
 with db() as c:c.execute('DELETE FROM jobs WHERE id=?',(jid,))
 raise RuntimeError('本次读取超时，未取得可验证结果，可以重试。')
def handle(handler):
 path=urlsplit(handler.path).path
 if not (path.startswith('/api/cloud-account/') or path.startswith('/api/cloud-agent/') or path.startswith('/api/wechat-private/') or path=='/auth/claim'):return False
 try:
  if handler.headers.get('Origin') and urlsplit(handler.headers['Origin']).netloc!=handler.headers.get('Host'):
   handler.message({'error':'请求来源无效。'},403);return True
  if path.startswith('/api/cloud-account/') and path!='/api/cloud-account/me' and handler.command!='POST':
   handler.message({'error':'请使用POST。'},405);return True
  if path.startswith('/api/cloud-agent/'):
   if not agent_ok(handler):handler.message({'error':'授权无效。'},403);return True
   data=body(handler,4000000 if path.endswith('/result') else 40000)
   device=str(data.get('deviceId',''))
   if not re.fullmatch(r'[0-9a-f]{32}',device):raise ValueError('设备标识无效。')
   if path.endswith('/bootstrap'):
    with db() as c:
     existing=c.execute('SELECT uid FROM agents WHERE id=?',(device,)).fetchone()
     if existing:uid=existing['uid']
     else:
      uid=secrets.token_hex(16)
      c.execute('INSERT INTO users VALUES (?,?,?,?)',(uid,'我的工作台-'+device[:6],None,secrets.token_hex(32)))
     c.execute('INSERT INTO agents VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET seen=excluded.seen',(device,uid,time.time()))
     token=secrets.token_hex(32)
     c.execute('DELETE FROM claims WHERE uid=? OR expires<?',(uid,time.time()))
     c.execute('INSERT INTO claims VALUES (?,?,?)',(digest(token),uid,time.time()+600))
    handler.message({'claimUrl':BASE+'/auth/claim?token='+token});return True
   with db() as c:agent=c.execute('SELECT * FROM agents WHERE id=?',(device,)).fetchone()
   if not agent:raise PermissionError('授权会话尚未登记。')
   if path.endswith('/heartbeat'):
    with db() as c:c.execute('UPDATE agents SET seen=? WHERE id=?',(time.time(),device))
    handler.message({'ok':True});return True
   if path.endswith('/poll'):
    with db() as c:
     c.execute('UPDATE agents SET seen=? WHERE id=?',(time.time(),device));c.execute('DELETE FROM jobs WHERE created<?',(time.time()-600,))
     row=c.execute("SELECT * FROM jobs WHERE agent=? AND uid=? AND state='queued' ORDER BY created LIMIT 1",(device,agent['uid'])).fetchone()
     if row:c.execute("UPDATE jobs SET state='running' WHERE id=? AND state='queued'",(row['id'],))
    handler.message({'job':{'id':row['id'],'op':row['op'],'payload':json.loads(row['payload'])} if row else None});return True
   if path.endswith('/result'):
    result=data.get('result')
    if not isinstance(result,dict):raise ValueError('读取结果格式无效。')
    with db() as c:
     c.execute('UPDATE agents SET seen=? WHERE id=?',(time.time(),device))
     changed=c.execute("UPDATE jobs SET state='done',result=? WHERE id=? AND agent=? AND uid=? AND state='running'",(json.dumps(result,ensure_ascii=False),str(data.get('jobId','')),device,agent['uid'])).rowcount
    handler.message({'accepted':bool(changed)});return True
   raise ValueError('读取服务接口不存在。')
  if path=='/auth/claim':
   token=parse_qs(urlsplit(handler.path).query).get('token',[''])[0]
   with db() as c:
    row=c.execute('SELECT * FROM claims WHERE token=? AND expires>?',(digest(token),time.time())).fetchone()
    if row:c.execute('DELETE FROM claims WHERE token=?',(digest(token),))
   if not row:handler.message({'error':'登录授权已使用或过期，请重新取得授权。'},401);return True
   set_session(handler,row['uid']);handler.send_response(303);handler.send_header('Location','/index.html');handler.send_header('Content-Length','0');handler.end_headers();return True
  user=current(handler)
  if path=='/api/cloud-account/me':
   agent=agent_for(user['id']) if user else None
   handler.message({'authenticated':bool(user),'name':user['name'] if user else '', 'hasPassword':bool(user and user['password']),'authorizedSession':bool(agent),'serviceOnline':bool(agent and time.time()-agent['seen']<45)});return True
  if path in ('/api/cloud-account/login','/api/cloud-account/register'):
   data=body(handler);name=str(data.get('name','')).strip()
   if not 2<=len(name)<=40 or re.search(r'[\x00-\x1f]',name):raise ValueError('账号名需要2至40个字符。')
   throttle(name);password=data.get('password','')
   if path.endswith('/register'):
    hashed=password_hash(password);uid=secrets.token_hex(16)
    try:
     with db() as c:
      if c.execute('SELECT COUNT(*) FROM users').fetchone()[0]>=1000:raise ValueError('当前注册名额已满。')
      c.execute('INSERT INTO users VALUES (?,?,?,?)',(uid,name,hashed,secrets.token_hex(32)))
    except sqlite3.IntegrityError:raise ValueError('该账号名不可用。')
   else:
    with db() as c:row=c.execute('SELECT * FROM users WHERE name=?',(name,)).fetchone()
    if not row or not password_matches(password,row['password']):handler.message({'error':'账号或密码不正确。'},401);return True
    uid=row['id']
   set_session(handler,uid);handler.message({'authenticated':True,'name':name});return True
  if not user:handler.message({'error':'请先登录你的工作台账号。','code':'SIGN_IN_REQUIRED'},401);return True
  if path=='/api/cloud-account/logout':
   with db() as c:c.execute('DELETE FROM sessions WHERE token=?',(digest(cookie_token(handler)),))
   handler.account_cookie='sy_auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';handler.message({'ok':True});return True
  if path=='/api/cloud-account/password':
   data=body(handler)
   if user['password'] and not password_matches(data.get('currentPassword',''),user['password']):raise ValueError('原密码不正确。')
   hashed=password_hash(data.get('password',''))
   with db() as c:c.execute('UPDATE users SET password=? WHERE id=?',(hashed,user['id']))
   handler.message({'ok':True});return True
  route=path[len('/api/wechat-private'):] if path.startswith('/api/wechat-private/') else ''
  if route=='/groups':
   if handler.command=='POST':
    name=str(body(handler).get('name','')).strip()[:160]
    if not name:raise ValueError('群名不能为空。')
    with db() as c:c.execute('INSERT OR IGNORE INTO follows VALUES (?,?)',(user['id'],name))
   with db() as c:names=[r['name'] for r in c.execute('SELECT name FROM follows WHERE uid=? ORDER BY name',(user['id'],))]
   handler.message({'groups':names});return True
  if route=='/messages':
   params=parse_qs(urlsplit(handler.path).query);term=params.get('q',[''])[0][:120];group=params.get('group',[''])[0][:160]
   with db() as c:
    rows=c.execute('SELECT * FROM messages WHERE uid=? AND (?="" OR grp=?) AND (?="" OR body LIKE ?) ORDER BY rowid DESC LIMIT 200',(user['id'],group,group,term,'%'+term+'%')).fetchall()
   handler.message({'items':[{'id':r['id'],'group':r['grp'],'sender':r['sender'],'text':r['body'],'time':r['date'],'tag':'已归档原文'} for r in rows]});return True
  if route=='/import':
   data=body(handler,600000);name=str(data.get('group','')).strip()[:160];rows=data.get('messages',[])
   if not isinstance(rows,list) or len(rows)>120:raise ValueError('每批最多120条消息。')
   added=0
   with db() as c:
    if not c.execute('SELECT 1 FROM follows WHERE uid=? AND name=?',(user['id'],name)).fetchone():raise PermissionError('该群尚未加入当前账号的关注列表。')
    for item in rows:
     if not isinstance(item,dict):continue
     text=str(item.get('text') or '').strip()[:4000]
     if not text:continue
     sender=str(item.get('sender') or '')[:100];date=str(item.get('time') or '')[:100]
     mid=digest(user['id']+'|'+name+'|'+sender+'|'+text+'|'+date)
     added+=c.execute('INSERT OR IGNORE INTO messages VALUES (?,?,?,?,?,?)',(user['id'],mid,name,sender,text,date)).rowcount
   handler.message({'added':added});return True
  allowed={'/status':'/status','/wechat/history-status':'/wechat/history-status','/wechat/history-groups':'/wechat/history-groups','/wechat/history':'/wechat/history'}
  if route in allowed:
   data=body(handler) if handler.command=='POST' else {}
   if len(json.dumps(data))>20000:raise ValueError('查询过长。')
   handler.message(relay(user['id'],allowed[route],data));return True
  handler.message({'error':'此项微信操作尚未接入授权服务，本次未取得结果。'},409);return True
 except PermissionError as exc:handler.message({'error':str(exc),'code':'WECHAT_AUTHORIZATION_REQUIRED'},409)
 except ValueError as exc:handler.message({'error':str(exc)},422)
 except Exception as exc:handler.message({'error':str(exc)[:250]},503)
 return True
