"""上岸鸭本机微信桥接 - 群名单由用户授权，读取通过桌面 UI，不访问微信数据库。"""
import os, json, re, time, sqlite3, hashlib, secrets, threading
from datetime import datetime
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

PORT=8896
HOME=Path(os.getenv('LOCALAPPDATA') or str(Path.home()/'AppData'/'Local'))/'ShanganyaPrivate'
HOME.mkdir(parents=True,exist_ok=True)
DB=HOME/'wechat-messages.sqlite3'
TOKEN=secrets.token_urlsafe(18)
ORIGINS={'http://127.0.0.1:8892','http://localhost:8892'}
LOCK=threading.Lock()
TASK=re.compile(r'请|截止|提交|今晚|明天|今日|今天|本周|完成|修改|开会|发一版|安排|DDL',re.I)
DOC=re.compile(r'资料|教程|分享|pdf|ppt|文档|飞书|链接|课程|知识库|网盘|https?://',re.I)
OPPORTUNITY=re.compile(r'副业|兼职|招聘|招募|接单|合作|报价',re.I)

def conn():
 db=sqlite3.connect(DB,timeout=8)
 db.execute('CREATE TABLE IF NOT EXISTS groups(name TEXT PRIMARY KEY)')
 db.execute('CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, grp TEXT, sender TEXT, body TEXT, date TEXT, category TEXT, inserted REAL)')
 db.commit()
 return db

def kind(s):
 if TASK.search(s): return '待确认任务'
 if OPPORTUNITY.search(s): return '副业机会'
 if DOC.search(s): return '资料与链接'
 return '普通消息'

def add_messages(grp,items):
 with conn() as db:
  if not db.execute('SELECT 1 FROM groups WHERE name=?',(grp,)).fetchone(): raise PermissionError('该群未加入授权关注名单')
  count=0
  for item in list(items)[:120]:
   if not isinstance(item,dict):continue
   text=str(item.get('text') or item.get('content') or '').strip()[:4000]
   if not text: continue
   sender=str(item.get('sender') or '').strip()[:100]
   tm=str(item.get('time') or '').strip()[:100]
   uid=hashlib.sha256(('|'.join((grp,sender,text,tm))).encode()).hexdigest()[:26]
   result=db.execute('INSERT OR IGNORE INTO messages VALUES (?,?,?,?,?,?,?)',(uid,grp,sender,text,tm,kind(text),time.time()))
   count+=result.rowcount
 return count

def wx():
 try: from wxauto4 import WeChat
 except Exception as exc:raise RuntimeError('wxauto4 尚未安装或不可用，请先核对微信4.1版本与Python环境：'+str(exc)[:150])
 try: return WeChat()
 except Exception as exc: raise RuntimeError('未能连接已登录的桌面微信，请打开主窗口：'+str(exc)[:150])

def get_sessions():
 with LOCK:
  w=wx()
  r=w.GetSession()
 names=[]
 for a in list(r or [])[:100]:
  d=getattr(a,'info',None)
  if callable(d):d=d()
  if not isinstance(d,dict): d={}
  n=str(d.get('name') or d.get('chat_name') or getattr(a,'name','')).strip()
  if n and n not in names:names.append(n[:160])
 return {'sessions':names,'note':'这是当前会话列表，不代表微信置顶标记；仅供手动选择群。'}

def sync_group(grp):
 with conn() as db:
  if not db.execute('SELECT 1 FROM groups WHERE name=?',(grp,)).fetchone():raise PermissionError('先加入关注名单')
 with LOCK:
  w=wx()
  w.ChatWith(grp,exact=True)
  info=w.ChatInfo()
  if not isinstance(info,dict) or str(info.get('chat_name') or '')!=grp:
   raise RuntimeError('微信没有确认精确切换到指定群，请手动核对，读取已停止')
  messages=list(w.GetAllMessage() or [])[-100:]
 rows=[{'text':getattr(m,'content',''),'sender':getattr(m,'sender',''),'time':getattr(m,'time','')} for m in messages]
 return {'scanned':len(rows),'added':add_messages(grp,rows),'note':'仅当前已加载的可见消息，不代表整个群历史'}

class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def permitted(self):
  return self.headers.get('Host') in ('127.0.0.1:8896','localhost:8896') and self.headers.get('Origin') in ORIGINS
 def sendj(self,status,payload):
  bs=json.dumps(payload,ensure_ascii=False,default=str).encode('utf8')
  self.send_response(status)
  self.send_header('Content-Type','application/json; charset=utf-8')
  self.send_header('Content-Length',str(len(bs)))
  self.send_header('Cache-Control','no-store')
  if self.permitted():
   self.send_header('Access-Control-Allow-Origin',self.headers.get('Origin'))
   self.send_header('Vary','Origin')
   self.send_header('Access-Control-Allow-Headers','Content-Type,X-SY-Bridge-Key')
   self.send_header('Access-Control-Allow-Methods','GET,POST,OPTIONS')
  self.end_headers()
  if status!=204:self.wfile.write(bs)
 def auth(self):
  if not self.permitted():self.sendj(403,{'error':'网页来源未授权'});return False
  if not secrets.compare_digest(self.headers.get('X-SY-Bridge-Key',''),TOKEN):
   self.sendj(401,{'error':'请使用本次启动窗口中的配对口令'});return False
  return True
 def do_OPTIONS(self):
  if not self.permitted():return self.sendj(403,{'error':'来源未授权'})
  return self.sendj(204,{})
 def do_GET(self):
  if not self.auth():return
  u=urlparse(self.path);p=parse_qs(u.query)
  try:
   if u.path=='/status':return self.sendj(200,{'ok':True,'mode':'本机授权微信桥接','wxauto4':self.has_driver()})
   if u.path=='/groups':
    with conn() as db:groups=[x[0] for x in db.execute('SELECT name FROM groups ORDER BY name')]
    return self.sendj(200,{'groups':groups})
   if u.path=='/messages':
    q=str(p.get('q',[''])[0])[:120];grp=str(p.get('group',[''])[0])[:160]
    sql='SELECT id,grp,sender,body,date,category FROM messages WHERE 1=1';args=[]
    if grp:sql+=' AND grp=?';args.append(grp)
    if q:sql+=' AND (body LIKE ? OR grp LIKE ?)';args.extend(['%'+q+'%']*2)
    sql+=' ORDER BY inserted DESC LIMIT 200'
    with conn() as db:rows=db.execute(sql,args).fetchall()
    return self.sendj(200,{'items':[dict(zip(['id','group','sender','text','time','tag'],x)) for x in rows]})
   return self.sendj(404,{'error':'接口不存在'})
  except Exception as e:return self.sendj(500,{'error':str(e)[:200]})
 @staticmethod
 def has_driver():
  from importlib.util import find_spec
  return find_spec('wxauto4') is not None
 def do_POST(self):
  if not self.auth():return
  size=int(self.headers.get('Content-Length','0'))
  if size<=0 or size>400000:return self.sendj(413,{'error':'请求太大'})
  try: d=json.loads(self.rfile.read(size))
  except Exception:return self.sendj(400,{'error':'JSON格式错误'})
  try:
   if self.path=='/groups':
    name=str(d.get('name','')).strip()[:160]
    if not name:return self.sendj(400,{'error':'群名不能为空'})
    with conn() as db:db.execute('INSERT OR IGNORE INTO groups VALUES (?)',(name,))
    return self.sendj(200,{'ok':True})
   if self.path=='/groups/remove':
    with conn() as db:db.execute('DELETE FROM groups WHERE name=?',(str(d.get('name',''))[:160],))
    return self.sendj(200,{'ok':True})
   if self.path=='/import':
    rows=d.get('messages') or []
    if not isinstance(rows,list):return self.sendj(400,{'error':'消息格式有误'})
    return self.sendj(200,{'added':add_messages(str(d.get('group',''))[:160],rows)})
   if self.path=='/wechat/sessions':return self.sendj(200,get_sessions())
   if self.path=='/wechat/sync':return self.sendj(200,sync_group(str(d.get('group',''))[:160]))
   return self.sendj(404,{'error':'接口不存在'})
  except PermissionError as e:return self.sendj(403,{'error':str(e)})
  except Exception as e:return self.sendj(503,{'error':str(e)[:300]})

if __name__=='__main__':
 conn().close()
 print('上岸鸭微信桥接 127.0.0.1:8896，私人数据库不在网站目录中',flush=True)
 print('本次配对口令：'+TOKEN,flush=True)
 ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()
