"""Read-only history queries for the current user's authorized WeChat data."""
from pathlib import Path
import os,sys,types,threading,time,datetime,re,contextlib,logging,hashlib
ROOT=Path(__file__).resolve().parent
PRIVATE=Path(os.environ.get('SHANGANYA_WECHAT_HISTORY_DIR',r'D:\shanganya-private\wechat-history'))
_LOCK=threading.RLock()
_STATE={'phase':'not_started','historyVerified':False,'checkedAt':None,'groupCount':0,'error':''}
_DB=None
def safe_error(exc):
 text=re.sub(r'[0-9a-fA-F]{24,}','[redacted]',str(exc))
 if isinstance(exc,PermissionError):return '当前授权不足，未取得历史记录访问权限。'
 if 'No space left' in text:return '历史读取缓存空间不足，本次未取得数据。'
 if 'ModuleNotFoundError'==type(exc).__name__:return '历史读取组件缺少依赖，尚未取得数据。'
 return text[:250]
def initialize():
 global _DB
 try:
  PRIVATE.mkdir(parents=True,exist_ok=True)
  os.environ['WECHATAUTO_KEYS_DIR']=str(PRIVATE/'keys');os.environ['TEMP']=str(PRIVATE);os.environ['TMP']=str(PRIVATE)
  if 'wechatauto' not in sys.modules:
   package=types.ModuleType('wechatauto');package.__path__=[str(ROOT/'.wechat-history-libs/wechatauto')];package.__package__='wechatauto';sys.modules['wechatauto']=package
  with open(os.devnull,'w') as silent,contextlib.redirect_stdout(silent),contextlib.redirect_stderr(silent):
   logging.disable(logging.CRITICAL)
   from wechatauto.db import WeChatDB
   db=WeChatDB(keys_file=str(PRIVATE/'keys.json'),workdir=str(PRIVATE/'cache'))
   conn=db._contact_conn()
   if conn is None:raise RuntimeError('未取得群聊目录，历史读取尚未验证。')
   try:count=conn.execute("SELECT COUNT(*) FROM contact WHERE username LIKE '%@chatroom'").fetchone()[0]
   finally:conn.close()
  with _LOCK:
   _DB=db;_STATE.update(phase='directory_ready',groupCount=count,checkedAt=time.time(),error='')
 except Exception as exc:
  with _LOCK:_STATE.update(phase='failed',error=safe_error(exc),checkedAt=time.time())
def status(retry=False):
 with _LOCK:
  if _STATE['phase']=='not_started' or retry and _STATE['phase']=='failed':
   _STATE.update(phase='initializing',error='');threading.Thread(target=initialize,daemon=True).start()
  return dict(_STATE)
def database():
 state=status()
 if state['phase'] not in ('directory_ready','history_ready'):
  raise ValueError(state['error'] or '历史记录正在验证，尚未取得查询结果。')
 return _DB
def groups(query=''):
 query=str(query).strip()[:100];db=database()
 with _LOCK:
  conn=db._contact_conn()
  if conn is None:raise ValueError('群目录暂不可读，本次没有返回结果。')
  try:
   pattern='%'+query.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%'
   where="username LIKE '%@chatroom' AND (nick_name LIKE ? ESCAPE '\\' OR remark LIKE ? ESCAPE '\\')"
   total=conn.execute('SELECT COUNT(*) FROM contact WHERE '+where,(pattern,pattern)).fetchone()[0]
   rows=conn.execute('SELECT username,nick_name,remark FROM contact WHERE '+where+' ORDER BY nick_name LIMIT 200',(pattern,pattern)).fetchall()
  finally:conn.close()
 return {'groups':[{'id':r['username'],'name':r['remark'] or r['nick_name'] or r['username']} for r in rows],'total':total,'partial':total>len(rows),'checkedAt':time.time(),'source':'wechat-history-directory'}
def readable_content(row):
 raw=str(row.get('content') or '')
 try:kind=int(row.get('type',1)) & 65535
 except (ValueError,TypeError):kind=1
 labels={3:'图片',34:'语音',43:'视频',47:'表情'}
 if kind in labels:return '['+labels[kind]+'消息，媒体内容尚未转写]',labels[kind]+' · 未转写'
 xml_start=raw.find('<')
 xml_candidate=raw[xml_start:] if 0<=xml_start<240 and raw[:xml_start].strip().endswith(':') else raw
 if xml_candidate.lstrip().startswith('<') and (kind in (49,57) or '<appmsg' in xml_candidate[:5000] or '<msg' in xml_candidate[:5000]):
  try:
   from xml.etree import ElementTree as ET
   tree=ET.fromstring(xml_candidate[:1000000]);parts=[]
   for tag in ('title','des','url','lowurl','datadesc'):
    for node in tree.iter(tag):
     value=(node.text or '').strip()
     if value and value not in parts:parts.append(value)
   return '\n'.join(parts) or '[\u5206\u4eab\u6d88\u606f\uff0c\u6587\u5b57\u5c1a\u672a\u89e3\u6790]','\u5206\u4eab\u6d88\u606f \xb7 \u5df2\u63d0\u53d6\u6587\u5b57'
  except Exception:return '[\u5206\u4eab\u6d88\u606f\uff0c\u6587\u5b57\u5c1a\u672a\u89e3\u6790]','\u5206\u4eab\u6d88\u606f \xb7 \u5f85\u89e3\u6790'
 return raw,'微信历史原文'
def history(data):
 group=str(data.get('groupId','')).strip()
 if not group.endswith('@chatroom'):raise ValueError('请从真实群目录中选择一个群聊。')
 keyword=str(data.get('keyword','')).strip()[:200]
 offset=max(0,int(data.get('offset',0)));limit=max(1,min(100,int(data.get('limit',50))))
 db=database();items=[];scanned=0;exhausted=False
 with _LOCK:
  conn=db._contact_conn()
  try:contact=conn.execute('SELECT username,nick_name,remark FROM contact WHERE username=?',(group,)).fetchone()
  finally:conn.close()
  if not contact:raise ValueError('该群不在当前授权目录中。')
  name=contact['remark'] or contact['nick_name'] or group
  for _ in range(1):
   rows=db.get_messages(group,limit=50,offset=offset+scanned)
   if not rows:exhausted=True;break
   for row in rows:
    scanned+=1
    text,tag=readable_content(row)
    if keyword and keyword.casefold() not in text.casefold():continue
    stamp=row.get('create_time') or 0
    try:date=datetime.datetime.fromtimestamp(float(stamp)).isoformat(timespec='seconds') if stamp else ''
    except (ValueError,OSError,TypeError):date=''
    uid=hashlib.sha256((group+'|'+str(row.get('shard',''))+'|'+str(row.get('local_id',''))).encode()).hexdigest()[:24]
    items.append({'id':uid,'group':name,'text':text,'sender':db.get_nickname(row['sender_username']) if row.get('sender_username') else '','time':date,'timestamp':stamp,'source':'wechat-history','tag':tag})
    if len(items)>=limit:break
   if len(items)>=limit:break
   if len(rows)<50:exhausted=True;break
  if scanned:_STATE.update(phase='history_ready',historyVerified=True,checkedAt=time.time())
 return {'items':items,'group':name,'scanned':scanned,'nextOffset':offset+scanned,'hasMore':not exhausted,'checkedAt':time.time(),'scope':'当前授权账号在设备上保存的历史；不含设备尚未同步或已删除的记录。'}

[executed on device: 江月的诗 (1527971c-6917-4fd0-9778-01f40b451bc0)]