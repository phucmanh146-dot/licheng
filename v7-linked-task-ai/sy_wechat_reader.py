"""Original workbench adapter: local visible WeChat UI only; no send methods."""
import re,time,threading
from urllib.parse import urlparse,parse_qs
import sy_wechat_daemon as store
import pm_wechat_desktop as old
_LOCK=threading.Lock()
_HITS={}
_OCR=None
def windows():
 import win32gui,win32process,psutil
 ids={p.pid for p in psutil.process_iter(['name']) if str(p.info.get('name') or '').lower() in ('wechat.exe','weixin.exe')}
 out=[]
 def collect(h,_):
  try:
   r=win32gui.GetWindowPlacement(h)[4] if win32gui.IsIconic(h) else win32gui.GetWindowRect(h)
   if win32process.GetWindowThreadProcessId(h)[1] in ids and win32gui.IsWindowVisible(h) and win32gui.GetWindowText(h) in ('微信','WeChat','Weixin') and r[2]-r[0]>350 and r[3]-r[1]>260:
    out.append((h,r))
  except Exception:pass
 win32gui.EnumWindows(collect,None)
 return sorted(out,key=lambda a:(a[1][2]-a[1][0])*(a[1][3]-a[1][1]),reverse=True)
def capture(activate=True):
 import win32gui,win32con,pyautogui,ctypes,io,base64
 from PIL import ImageGrab
 options=windows()
 if not options:raise RuntimeError('没有找到微信主窗口，请登录桌面微信并打开主窗口。')
 h,r=options[0]
 if win32gui.IsIconic(h):win32gui.ShowWindow(h,win32con.SW_RESTORE)
 if activate:
  try:win32gui.SetForegroundWindow(h)
  except Exception:pass
 time.sleep(.7)
 r=win32gui.GetWindowRect(h)
 if activate and win32gui.GetForegroundWindow()!=h:
  raise RuntimeError('请先点击微信主窗口使其显示在前台，再重试读取。')
 if not activate:
  import win32process
  foreground_pid=win32process.GetWindowThreadProcessId(win32gui.GetForegroundWindow())[1]
  main_pid=win32process.GetWindowThreadProcessId(h)[1]
  import psutil
  owned={main_pid}|{proc.pid for proc in psutil.Process(main_pid).children(recursive=True)}
  if foreground_pid not in owned:
   raise RuntimeError('微信搜索被其他窗口打断，请保持微信前台并重新搜索。')
 screen=ImageGrab.grab()
 l,t=max(0,r[0]),max(0,r[1]);right,bottom=min(screen.width,r[2]),min(screen.height,r[3])
 if right-l<250 or bottom-t<200:raise RuntimeError('微信窗口超出屏幕，请移回屏幕后重试。')
 im=screen.crop((l,t,right,bottom));im.thumbnail((1100,1100))
 bio=io.BytesIO();im.save(bio,'JPEG',quality=76)
 return h,im,(l,t,right-l,bottom-t),'data:image/jpeg;base64,'+base64.b64encode(bio.getvalue()).decode()
def normalized(s):return re.sub(r'\s+','',str(s)).casefold()
def ocr_rows(im):
 global _OCR
 import numpy as np
 from rapidocr_onnxruntime import RapidOCR
 if _OCR is None:
  import rapidocr_onnxruntime.utils as runtime
  original=runtime.SessionOptions
  def bounded():
   options=original();options.intra_op_num_threads=2;options.inter_op_num_threads=1
   return options
  runtime.SessionOptions=bounded
  try:_OCR=RapidOCR()
  finally:runtime.SessionOptions=original
 result,_elapsed=_OCR(np.asarray(im))
 rows=[]
 for item in result or []:
  try:
   points,text,confidence=item
   confidence=float(confidence)
   if confidence<.48:continue
   xx=[float(v[0]) for v in points];yy=[float(v[1]) for v in points]
   rows.append({'text':str(text),'confidence':round(confidence,3),'x':int(min(xx)),'y':int(min(yy)),'width':max(1,int(max(xx)-min(xx))),'height':max(1,int(max(yy)-min(yy)))})
  except (ValueError,TypeError,IndexError):continue
 return rows
def read_current():
 with _LOCK:
  h,im,rect,preview=capture()
  rows=ocr_rows(im)
 return {'ok':True,'rows':rows,'preview':preview,'width':im.width,'height':im.height,'note':'当前微信窗口截图的 OCR 原文，可能有识别错误；不是全部历史消息。'},(h,rect)
def search(q):
 q=str(q or '').strip()
 if not 1<=len(q)<=80:raise ValueError('请输入1—80字的群名关键词。')
 import pyautogui,pyperclip
 with _LOCK:
  h,_,search_rect,_=capture()
  previous=pyperclip.paste()
  try:
   import ctypes
   scale=ctypes.windll.user32.GetDpiForWindow(h)/96
   pyautogui.click(search_rect[0]+167*scale,search_rect[1]+55*scale)
   time.sleep(.4)
   pyperclip.copy(q);pyautogui.hotkey('ctrl','a');pyautogui.hotkey('ctrl','v');time.sleep(1.1)
  finally:pyperclip.copy(previous)
  h,im,rect,preview=capture(False)
  rows=ocr_rows(im)
  hits=[]
  _HITS.clear()
  for i,row in enumerate(rows):
   if row['y']<70 or normalized(q) not in normalized(row['text']):continue
   key=str(i)+'-'+str(time.time_ns())
   _HITS[key]={'h':h,'rect':rect,'size':im.size,'box':row,'at':time.time(),'query':q}
   hits.append({'id':key,'label':row['text'],'confidence':row['confidence']})
 return {'ok':True,'candidates':hits,'preview':preview,'note':'这是微信真实搜索画面的 OCR 候选，请对照截图选择群聊；可能含聊天记录等非群聊结果。'}
def open_hit(key):
 import pyautogui,win32gui
 hit=_HITS.get(str(key))
 if not hit or time.time()-hit['at']>180:raise ValueError('候选已过期，请重新搜索。')
 fresh=search(hit['query'])
 matches=[x for x in fresh['candidates'] if normalized(x['label'])==normalized(hit['box']['text'])]
 if len(matches)!=1:raise ValueError('搜索结果发生变化或有重名，请重新核对候选。')
 hit=_HITS[matches[0]['id']]
 with _LOCK:
  h,im,rect,_=capture(False)
  if h!=hit['h'] or rect!=hit['rect']:raise ValueError('微信窗口已移动，请重新搜索，避免点错。')
  b=hit['box'];l,t,w,hh=rect; iw,ih=hit['size']
  pyautogui.click(l+(b['x']+b['width']/2)*w/iw,t+(b['y']+b['height']/2)*hh/ih)
  time.sleep(.5)
 return {'ok':True,'label':hit['box']['text'],'note':'已点击所选微信候选。请核对目标会话，然后读取当前画面。'}
def api(method,path,data=None):
 data=data or {};u=urlparse(path);q=parse_qs(u.query)
 if u.path=='/wechat/history-status':
  import sy_history_reader as history_reader
  return history_reader.status(bool(data.get('retry')))
 if u.path=='/wechat/history-groups':
  import sy_history_reader as history_reader
  return history_reader.groups(data.get('query',''))
 if u.path=='/wechat/history':
  import sy_history_reader as history_reader
  return history_reader.history(data)
 if u.path=='/status':
  return {'ok':True,'available':bool(windows()),'wxauto4':False,'driver':'Windows 微信窗口 + OCR','mode':'same-origin-local'}
 if u.path=='/wechat/search':return search(data.get('query'))
 if u.path=='/wechat/open':return open_hit(data.get('id'))
 if u.path in ('/wechat/preview','/wechat/sessions'):
  result,_=read_current()
  result['sessions']=[];return result
 if u.path=='/groups':
  if method=='POST':
   name=str(data.get('name') or '').strip()[:160]
   if not name:raise ValueError('请填写确认后的群名。')
   with store.conn() as db:db.execute('INSERT OR IGNORE INTO groups VALUES (?)',(name,))
  with store.conn() as db:groups=[r[0] for r in db.execute('SELECT name FROM groups ORDER BY name')]
  return {'ok':True,'groups':groups}
 if u.path=='/messages':
  term=str(q.get('q',[''])[0])[:120];grp=str(q.get('group',[''])[0])[:160]
  sql='SELECT id,grp,sender,body,date,category FROM messages WHERE 1=1';args=[]
  if grp:sql+=' AND grp=?';args.append(grp)
  if term:sql+=' AND (body LIKE ? OR grp LIKE ?)';args.extend(['%'+term+'%']*2)
  with store.conn() as db:rows=db.execute(sql+' ORDER BY inserted DESC LIMIT 200',args).fetchall()
  return {'items':[dict(zip(['id','group','sender','text','time','tag'],r)) for r in rows]}
 if u.path=='/import':
  return {'added':store.add_messages(str(data.get('group') or '')[:160],data.get('messages') or [])}
 raise ValueError('接口不存在。')
