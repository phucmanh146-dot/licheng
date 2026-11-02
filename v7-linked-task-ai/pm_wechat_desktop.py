"""Authorized UI-only WeChat search (no database decryption, no background scraping)."""
import time,re,threading,base64,io,secrets
from PIL import ImageGrab
from rescue_service import RescueError
_LOCK=threading.RLock()
_SEARCHES={}
_OCR=None
def _windows():
    import psutil
    from pywinauto import Desktop
    ids={p.pid for p in psutil.process_iter(['name']) if str(p.info.get('name') or '').lower() in ('wechat.exe','weixin.exe')}
    options=[]
    if not ids:return options
    for w in Desktop(backend='uia').windows():
        try:
            if w.process_id() not in ids or not w.is_visible():continue
            rect=w.rectangle()
            if rect.width()<350 or rect.height()<260:continue
            options.append((w,w.class_name(),rect))
        except Exception:continue
    options.sort(key=lambda x:(1 if x[1].lower().startswith('qt') else 0,x[2].height()*x[2].width()),reverse=True)
    return options

def status():
    windows=_windows()
    return {'ok':True,'available':bool(windows),
            'windowCount':len(windows),
            'uiSearch':'keyword-based search through visible WeChat UI (accessibility/OCR depends on WeChat version)',
            'note':'不会扫描微信私有数据库、发送消息或打开未选择的群聊。'}

def _focus():
    windows=_windows()
    if not windows:raise RescueError('没有找到当前登录的可见微信窗口，请先打开微信聊天主窗口。','WECHAT_NOT_VISIBLE',503)
    w,klass,rect=windows[0]
    try:
        if w.is_minimized():w.restore()
        w.set_focus()
    except Exception:
        try:
            import win32gui
            win32gui.ShowWindow(w.handle,9)
            win32gui.SetForegroundWindow(w.handle)
        except Exception as exc:raise RescueError('微信窗口存在但无法获得焦点，请手动将其置于前台再点一次。','WECHAT_FOREGROUND_FAILED',422) from exc
    time.sleep(.22)
    return w

def focus_wechat():
    w=_focus()
    return {'ok':True,'note':'已经请求把当前电脑上的微信窗口切换到前台。','windowFound':bool(w)}

def _ocr_rows(image):
    global _OCR
    import numpy as np
    from rapidocr_onnxruntime import RapidOCR
    if _OCR is None:_OCR=RapidOCR()
    result,_elapsed=_OCR(np.asarray(image))
    rows=[]
    for item in result or []:
        try:
            pts,txt,score=item
            if score < .48:continue
            xx=[float(t[0]) for t in pts];yy=[float(t[1]) for t in pts]
            text=str(txt).strip()
            if not text:continue
            rows.append({'text':text[:180],'confidence':round(float(score),3),
                        'x':int(min(xx)),'y':int(min(yy)),
                        'width':max(1,int(max(xx)-min(xx))),'height':max(1,int(max(yy)-min(yy)))})
        except Exception:continue
    return rows

def _capture(w):
    rect=w.rectangle()
    import ctypes
    user32=ctypes.windll.user32
    left=max(0,rect.left);top=max(0,rect.top)
    right=min(user32.GetSystemMetrics(0),rect.right)
    bottom=min(user32.GetSystemMetrics(1),rect.bottom)
    if right-left<180 or bottom-top<170:
        raise RescueError('微信窗口没有完全显示在屏幕上，请移动后重试。','WECHAT_WINDOW_OFFSCREEN',422)
    image=ImageGrab.grab(bbox=(left,top,right,bottom))
    if image.mode!='RGB':image=image.convert('RGB')
    image.thumbnail((1460,1200))
    bio=io.BytesIO();image.save(bio,'JPEG',quality=79)
    return image,'data:image/jpeg;base64,'+base64.b64encode(bio.getvalue()).decode('ascii'),(left,top,right-left,bottom-top)

def search_visible(query,scope='group'):
    query=str(query or '').strip()
    if not 1<=len(query)<=80:raise RescueError('请先输入1—80字的群聊或消息关键词。','SEARCH_QUERY_REQUIRED',400)
    if scope not in ('group','message'):raise RescueError('搜索类型不正确。','SEARCH_MODE_INVALID',400)
    w=_focus()
    from pywinauto.keyboard import send_keys
    try:
        # The connected WeChat version may treat Ctrl+F as global rather than current-chat search.
        # We only report OCR-visible candidates, never claim database-wide search.
        send_keys('^f')
        time.sleep(.24)
        send_keys('^a')
        send_keys(query,with_spaces=True)
        time.sleep(.85)
    except Exception as exc:
        raise RescueError('微信窗口没有接受键盘搜索。可点击“切换到微信”，手动搜索后回到框选区。','WECHAT_KEYBOARD_FAILED',422) from exc
    image,preview,rect=_capture(w)
    try:ocr=_ocr_rows(image)
    except Exception:
        return {'ok':True,'scope':scope,'query':query,'preview':preview,
                'candidates':[],'readable':False,'note':'当前微信界面没有提供可识别文字。可手动在微信中搜索，再点击“框选当前窗口”。'}
    candidates=[];seen=set()
    # Visible suggestions are only a candidate list; user must inspect and choose.
    for t in ocr:
        if not (55<t['y']<image.height-24) or len(t['text'])<2:continue
        if t['x']>image.width*.82:continue
        normalized=re.sub(r'\s+','',t['text']).lower()
        if normalized in seen:continue
        seen.add(normalized)
        cand={'id':secrets.token_urlsafe(10),'label':t['text'],
              'confidence':t['confidence'],'box':{k:t[k] for k in ('x','y','width','height')},
              'kind':'微信窗口可见文字'}
        candidates.append(cand)
        if len(candidates)>=45:break
    search_id=secrets.token_urlsafe(15)
    with _LOCK:
        for sid in list(_SEARCHES):
            if time.time()-_SEARCHES[sid]['at']>360:_SEARCHES.pop(sid,None)
        _SEARCHES[search_id]={'at':time.time(),'query':query,'scope':scope,'preview':preview,
            'hwnd':w.handle,'candidates':candidates,'rect':rect,'width':image.width,'height':image.height}
    return {'ok':True,'searchId':search_id,'query':query,'scope':scope,
            'candidates':candidates,'preview':preview,
            'readable':True,'note':'仅为当前登录微信窗口可见搜索结果的 OCR 候选，不代表已读取全部聊天历史。请核对截图后选择。'}

def open_search_result(search_id,candidate_id):
    with _LOCK:
        search=_SEARCHES.get(str(search_id))
        if not search or time.time()-search['at']>360:
            raise RescueError('搜索候选已过期，请重新搜索。','SEARCH_EXPIRED',409)
        candidate=next((x for x in search['candidates'] if x['id']==candidate_id),None)
        if not candidate:raise RescueError('请选择列表中的真实结果。','SEARCH_HIT_INVALID',400)
    w=_focus()
    if w.handle != search['hwnd']:
        raise RescueError('微信窗口已经发生变化，请重新搜索，防止误点其他应用。','SEARCH_WINDOW_CHANGED',409)
    area=candidate['box'];l,t,width,height=search['rect']
    # screenshot coordinates scaled to its 1460 max edge while the app window is larger
    x=l+int((area['x']+area['width']*.5)*width/search['width'])
    y=t+int((area['y']+area['height']*.5)*height/search['height'])
    import pyautogui
    pyautogui.click(x,y)
    time.sleep(.45)
    image,preview,rect=_capture(w)
    return {'ok':True,'selectedLabel':candidate['label'],'preview':preview,
            'note':'已点击微信界面上的该候选行。请看截图核对是否进入目标群聊。'}
