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


# --- Mini-program phone-first authentication (2026-11-03) ---
# The browser's existing username flow is preserved. Mini-program clients use
# a bearer session token and a verified-phone challenge before password setup.
with db() as _c:
    _cols = {row['name'] for row in _c.execute("PRAGMA table_info(users)")}
    if 'phone' not in _cols:
        _c.execute("ALTER TABLE users ADD COLUMN phone TEXT")
    _c.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique ON users(phone) WHERE phone IS NOT NULL")
    _c.executescript("""
    CREATE TABLE IF NOT EXISTS mini_sms_codes(
      phone TEXT NOT NULL, purpose TEXT NOT NULL, code_hash TEXT NOT NULL,
      expires REAL NOT NULL, created REAL NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(phone,purpose)
    );
    CREATE TABLE IF NOT EXISTS mini_phone_challenges(
      token_hash TEXT PRIMARY KEY, phone TEXT NOT NULL, purpose TEXT NOT NULL, expires REAL NOT NULL
    );
    """)

def _mini_phone(value):
    value = re.sub(r'[\\s()-]', '', str(value or ''))
    if re.fullmatch(r'1[3-9]\\d{9}', value):
        value = '+86' + value
    if not re.fullmatch(r'\\+[1-9]\\d{7,14}', value):
        raise ValueError('请输入有效手机号，包含国家区号。')
    return value

def _mini_password(value):
    if not isinstance(value, str) or not 8 <= len(value) <= 128:
        raise ValueError('密码需要8至128个字符。')
    if not re.search(r'[A-Za-z]', value) or not re.search(r'\\d', value):
        raise ValueError('密码至少包含一个字母和一个数字。')
    salt = secrets.token_bytes(16)
    hashed = hashlib.scrypt(value.encode(), salt=salt, n=16384, r=8, p=1, maxmem=67108864)
    return salt.hex() + ':' + hashed.hex()

def _mini_sms_send(phone, code):
    secret_id = os.environ.get('TENCENTCLOUD_SECRET_ID', '')
    secret_key = os.environ.get('TENCENTCLOUD_SECRET_KEY', '')
    app_id = os.environ.get('TENCENT_SMS_SDK_APP_ID', '')
    sign_name = os.environ.get('TENCENT_SMS_SIGN_NAME', '')
    template_id = os.environ.get('TENCENT_SMS_TEMPLATE_ID', '')
    if not all([secret_id, secret_key, app_id, sign_name, template_id]):
        raise RuntimeError('短信服务未配置：请在服务端配置腾讯云短信密钥、应用ID、签名和已审核模板。系统不会使用模拟验证码。')
    import urllib.request, datetime
    host = 'sms.tencentcloudapi.com'
    timestamp = int(time.time())
    date = datetime.datetime.utcfromtimestamp(timestamp).strftime('%Y-%m-%d')
    payload = json.dumps({
        'SmsSdkAppId': app_id, 'SignName': sign_name, 'TemplateId': template_id,
        'TemplateParamSet': [code, '5'], 'PhoneNumberSet': [phone]
    }, separators=(',', ':'))
    hashed = hashlib.sha256(payload.encode()).hexdigest()
    canonical = 'POST\\n/\\n\\ncontent-type:application/json; charset=utf-8\\nhost:' + host + '\\n\\ncontent-type;host\\n' + hashed
    scope = date + '/sms/tc3_request'
    string_to_sign = 'TC3-HMAC-SHA256\\n' + str(timestamp) + '\\n' + scope + '\\n' + hashlib.sha256(canonical.encode()).hexdigest()
    def _sign(key, message):
        return hmac.new(key, message.encode(), hashlib.sha256).digest()
    secret_date = _sign(('TC3' + secret_key).encode(), date)
    secret_service = _sign(secret_date, 'sms')
    secret_signing = _sign(secret_service, 'tc3_request')
    signature = hmac.new(secret_signing, string_to_sign.encode(), hashlib.sha256).hexdigest()
    authorization = 'TC3-HMAC-SHA256 Credential=' + secret_id + '/' + scope + ', SignedHeaders=content-type;host, Signature=' + signature
    request = urllib.request.Request(
        'https://' + host, data=payload.encode(),
        headers={
            'Authorization': authorization, 'Content-Type': 'application/json; charset=utf-8',
            'Host': host, 'X-TC-Action': 'SendSms', 'X-TC-Version': '2021-01-11',
            'X-TC-Timestamp': str(timestamp),
            'X-TC-Region': os.environ.get('TENCENT_SMS_REGION', 'ap-guangzhou')
        }, method='POST'
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            result = json.loads(response.read().decode())
    except Exception as exc:
        raise RuntimeError('短信服务商请求失败，请检查短信配置、签名和模板审核状态。') from exc
    status = result.get('Response', {}).get('SendStatusSet', [{}])[0]
    if status.get('Code') != 'Ok':
        raise RuntimeError('短信发送失败：' + str(status.get('Message', '服务商未确认发送'))[:120])

def _mini_issue_session(handler, uid):
    token = secrets.token_hex(32)
    with db() as c:
        c.execute('DELETE FROM sessions WHERE expires<?', (time.time(),))
        c.execute('INSERT INTO sessions VALUES (?,?,?)', (digest(token), uid, time.time() + 30 * 86400))
    return token

def _mini_current(handler):
    auth = handler.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        token = auth[7:].strip()
        if len(token) != 64 or not re.fullmatch(r'[0-9a-f]{64}', token):
            return None
        with db() as c:
            row = c.execute('SELECT users.* FROM users JOIN sessions ON users.id=sessions.uid WHERE sessions.token=? AND sessions.expires>?', (digest(token), time.time())).fetchone()
        return dict(row) if row else None
    return _mini_current_original(handler)

_mini_current_original = current
current = _mini_current
_mini_handle_original = handle

def handle(handler):
    path = urlsplit(handler.path).path
    if not path.startswith('/api/mini-auth/'):
        return _mini_handle_original(handler)
    try:
        if handler.headers.get('Origin') and urlsplit(handler.headers['Origin']).netloc != handler.headers.get('Host'):
            handler.message({'error': '请求来源无效。'}, 403)
            return True
        if handler.command != 'POST' and path not in ('/api/mini-auth/me',):
            handler.message({'error': '请使用POST。'}, 405)
            return True
        if path == '/api/mini-auth/sms/send':
            data = body(handler)
            phone = _mini_phone(data.get('phone'))
            purpose = str(data.get('purpose', 'register'))
            if purpose not in ('register', 'reset'):
                raise ValueError('验证码用途无效。')
            with db() as c:
                exists = c.execute('SELECT id FROM users WHERE phone=?', (phone,)).fetchone()
                previous = c.execute('SELECT created FROM mini_sms_codes WHERE phone=? AND purpose=?', (phone, purpose)).fetchone()
            if purpose == 'register' and exists:
                raise ValueError('该手机号已注册，请直接登录。')
            if purpose == 'reset' and not exists:
                raise ValueError('该手机号尚未注册。')
            if previous and time.time() - previous['created'] < 60:
                raise ValueError('验证码发送过于频繁，请60秒后再试。')
            throttle('mini-sms:' + purpose + ':' + phone)
            code = f'{secrets.randbelow(1000000):06d}'
            _mini_sms_send(phone, code)
            with db() as c:
                c.execute('INSERT OR REPLACE INTO mini_sms_codes(phone,purpose,code_hash,expires,created,attempts) VALUES (?,?,?,?,?,0)',
                          (phone, purpose, digest(phone + '|' + purpose + '|' + code), time.time() + 300, time.time()))
            handler.message({'sent': True, 'expiresIn': 300, 'resendAfter': 60})
            return True
        if path == '/api/mini-auth/sms/verify':
            data = body(handler)
            phone = _mini_phone(data.get('phone'))
            purpose = str(data.get('purpose', 'register'))
            code = str(data.get('code', ''))
            if purpose not in ('register', 'reset') or not re.fullmatch(r'\\d{6}', code):
                raise ValueError('请输入6位短信验证码。')
            wrong_code = False
            with db() as c:
                row = c.execute('SELECT * FROM mini_sms_codes WHERE phone=? AND purpose=?', (phone, purpose)).fetchone()
                exists = c.execute('SELECT id FROM users WHERE phone=?', (phone,)).fetchone()
                if not row or row['expires'] < time.time():
                    raise ValueError('验证码已过期，请重新获取。')
                if row['attempts'] >= 5:
                    raise ValueError('验证码错误次数过多，请重新获取。')
                if not hmac.compare_digest(row['code_hash'], digest(phone + '|' + purpose + '|' + code)):
                    c.execute('UPDATE mini_sms_codes SET attempts=attempts+1 WHERE phone=? AND purpose=?', (phone, purpose))
                    wrong_code = True
                elif purpose == 'register' and exists:
                    raise ValueError('该手机号已注册，请直接登录。')
                elif purpose == 'reset' and not exists:
                    raise ValueError('该手机号尚未注册。')
                else:
                    c.execute('DELETE FROM mini_sms_codes WHERE phone=? AND purpose=?', (phone, purpose))
                    raw = secrets.token_hex(32)
                    c.execute('INSERT INTO mini_phone_challenges VALUES (?,?,?,?)',
                              (digest(raw), phone, purpose, time.time() + 600))
            if wrong_code:
                raise ValueError('短信验证码不正确。')
            handler.message({'verified': True, 'verificationToken': raw, 'expiresIn': 600})
            return True
        if path == '/api/mini-auth/register':
            data = body(handler)
            phone = _mini_phone(data.get('phone'))
            challenge = str(data.get('verificationToken', ''))
            if len(challenge) != 64:
                raise ValueError('请先完成短信验证。')
            hashed = _mini_password(data.get('password', ''))
            with db() as c:
                verified = c.execute('SELECT * FROM mini_phone_challenges WHERE token_hash=? AND phone=? AND purpose=? AND expires>?',
                                     (digest(challenge), phone, 'register', time.time())).fetchone()
                if not verified:
                    raise ValueError('手机号验证已过期，请重新验证。')
                if c.execute('SELECT 1 FROM users WHERE phone=?', (phone,)).fetchone():
                    raise ValueError('该手机号已注册，请直接登录。')
                uid = secrets.token_hex(16)
                name = '手机号用户' + phone[-4:] + '-' + secrets.token_hex(3)
                c.execute('INSERT INTO users(id,name,password,storage,phone) VALUES (?,?,?,?,?)',
                          (uid, name, hashed, secrets.token_hex(32), phone))
                c.execute('DELETE FROM mini_phone_challenges WHERE token_hash=?', (digest(challenge),))
            token = _mini_issue_session(handler, uid)
            handler.message({'authenticated': True, 'token': token, 'user': {'id': uid, 'phone': phone, 'name': name}})
            return True
        if path == '/api/mini-auth/login':
            data = body(handler)
            phone = _mini_phone(data.get('phone'))
            password = data.get('password', '')
            with db() as c:
                row = c.execute('SELECT * FROM users WHERE phone=?', (phone,)).fetchone()
            if not row or not password_matches(password, row['password']):
                handler.message({'error': '手机号或密码不正确。'}, 401)
                return True
            token = _mini_issue_session(handler, row['id'])
            handler.message({'authenticated': True, 'token': token, 'user': {'id': row['id'], 'phone': phone, 'name': row['name']}})
            return True
        if path == '/api/mini-auth/legacy-login':
            data = body(handler)
            name = str(data.get('name', '')).strip()
            password = data.get('password', '')
            with db() as c:
                row = c.execute('SELECT * FROM users WHERE name=?', (name,)).fetchone()
            if not row or not password_matches(password, row['password']):
                handler.message({'error': '旧账号或密码不正确。'}, 401)
                return True
            token = _mini_issue_session(handler, row['id'])
            handler.message({'authenticated': True, 'token': token, 'user': {'id': row['id'], 'phone': row.get('phone'), 'name': row['name'], 'needsPhoneBinding': not bool(row.get('phone'))}})
            return True
        if path == '/api/mini-auth/bind-phone':
            data = body(handler)
            user = current(handler)
            if not user:
                handler.message({'error': '请先登录原有工作台账号。'}, 401)
                return True
            phone = _mini_phone(data.get('phone'))
            challenge = str(data.get('verificationToken', ''))
            if len(challenge) != 64:
                raise ValueError('请先完成短信验证。')
            hashed = _mini_password(data.get('password', ''))
            with db() as c:
                verified = c.execute('SELECT * FROM mini_phone_challenges WHERE token_hash=? AND phone=? AND purpose=? AND expires>?',
                                     (digest(challenge), phone, 'register', time.time())).fetchone()
                if not verified:
                    raise ValueError('手机号验证已过期，请重新验证。')
                owner = c.execute('SELECT id FROM users WHERE phone=?', (phone,)).fetchone()
                if owner and owner['id'] != user['id']:
                    raise ValueError('该手机号已绑定其他账号，不能重复绑定。')
                c.execute('UPDATE users SET phone=?, password=? WHERE id=?', (phone, hashed, user['id']))
                c.execute('DELETE FROM mini_phone_challenges WHERE token_hash=?', (digest(challenge),))
            handler.message({'ok': True, 'bound': True, 'user': {'id': user['id'], 'phone': phone, 'name': user['name']}})
            return True
        if path == '/api/mini-auth/password/reset':
            data = body(handler)
            phone = _mini_phone(data.get('phone'))
            challenge = str(data.get('verificationToken', ''))
            if len(challenge) != 64:
                raise ValueError('请先完成短信验证。')
            hashed = _mini_password(data.get('password', ''))
            with db() as c:
                verified = c.execute('SELECT * FROM mini_phone_challenges WHERE token_hash=? AND phone=? AND purpose=? AND expires>?',
                                     (digest(challenge), phone, 'reset', time.time())).fetchone()
                if not verified:
                    raise ValueError('手机号验证已过期，请重新验证。')
                changed = c.execute('UPDATE users SET password=? WHERE phone=?', (hashed, phone)).rowcount
                if not changed:
                    raise ValueError('该手机号尚未注册。')
                c.execute('DELETE FROM mini_phone_challenges WHERE token_hash=?', (digest(challenge),))
                c.execute('DELETE FROM sessions WHERE uid=(SELECT id FROM users WHERE phone=?)', (phone,))
            handler.message({'ok': True, 'passwordReset': True})
            return True
        if path == '/api/mini-auth/me':
            user = current(handler)
            if not user:
                handler.message({'error': '登录状态已过期，请重新登录。'}, 401)
                return True
            handler.message({'authenticated': True, 'user': {'id': user['id'], 'phone': user.get('phone'), 'name': user['name']}})
            return True
        if path == '/api/mini-auth/logout':
            user = current(handler)
            token = handler.headers.get('Authorization', '')
            if token.startswith('Bearer '):
                with db() as c:
                    c.execute('DELETE FROM sessions WHERE token=?', (digest(token[7:].strip()),))
            elif user:
                with db() as c:
                    c.execute('DELETE FROM sessions WHERE token=?', (digest(cookie_token(handler)),))
            handler.message({'ok': True})
            return True
        handler.message({'error': '小程序账号接口不存在。'}, 404)
        return True
    except PermissionError as exc:
        handler.message({'error': str(exc)}, 409)
    except ValueError as exc:
        handler.message({'error': str(exc)}, 422)
    except Exception as exc:
        handler.message({'error': str(exc)[:240]}, 503)
    return True
