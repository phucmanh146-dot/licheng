"""Local-only, manually operated desktop bridge. No shell execution endpoint."""
import base64, io, json, secrets, time, threading, os
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from urllib.request import Request,urlopen
from urllib.error import HTTPError
import pyautogui as desktop
from PIL import ImageGrab
PORT=8878
HOST=f'127.0.0.1:{PORT}'
ORIGIN='http://'+HOST
TOKEN=secrets.token_urlsafe(32)
STATE={'until':0,'control':False,'session':None,'history':[],'job':None,'step':0,'working':False}
LOCK=threading.Lock()
desktop.FAILSAFE=True
def wechat_request(action,data):
    # The main service owns one WeChat automation lock across both frontends.
    base='http://127.0.0.1:8877'
    from rescue_service import RescueError
    try:
        auth=json.load(urlopen(base+'/api/growth/session',timeout=3))
        request=Request(base+'/api/growth/'+action,data=json.dumps(data).encode(),headers={'Content-Type':'application/json','Origin':base,'X-Growth-Token':auth['token']})
        return json.load(urlopen(request,timeout=40))
    except HTTPError as exc:
        try:result=json.load(exc)
        except (ValueError,OSError):result={}
        raise RescueError(result.get('error','微信搜索未完成，请重新连接工作台。'),result.get('code','WECHAT_REQUEST_FAILED'),exc.code) from None
    except OSError:
        raise RescueError('工作台资料服务未连接，请从“上岸鸭-资料行动”入口启动。','WORKSPACE_OFFLINE',503) from None
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def send(self,code,data,kind='application/json; charset=utf-8'):
        raw=json.dumps(data,ensure_ascii=False).encode() if not isinstance(data,bytes) else data
        self.send_response(code)
        self.send_header('Content-Type',kind)
        self.send_header('Content-Length',str(len(raw)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'self' http://127.0.0.1:8877 http://localhost:8877")
        self.end_headers()
        try:self.wfile.write(raw)
        except (BrokenPipeError,ConnectionResetError):pass
    def valid_host(self):return self.headers.get('Host')==HOST
    def do_GET(self):
        if not self.valid_host():return self.send(403,{'error':'Host rejected'})
        path=urlsplit(self.path).path
        if path=='/health':return self.send(200,{'ok':True,'service':'shanganya-local-desktop','version':'1.0','scope':'loopback-only','screen':list(desktop.size())})
        if path=='/':
            raw=(Path(__file__).with_name('sy_remote_panel.html').read_text(encoding='utf-8').replace('__TOKEN__',TOKEN)).encode()
            return self.send(200,raw,'text/html; charset=utf-8')
        if path in ('/sy_wechat_share.js','/sy_wechat_select.js','/sy_wechat_store.js'):
            return self.send(200,Path(__file__).with_name(path[1:]).read_bytes(),'text/javascript; charset=utf-8')
        self.send(404,{'error':'Not found'})
    def do_POST(self):
        if not self.valid_host() or self.headers.get('Origin')!=ORIGIN or not secrets.compare_digest(self.headers.get('X-SY-Token',''),TOKEN):
            return self.send(403,{'error':'连接验证失败，请刷新本机面板。'})
        try:
            n=int(self.headers.get('Content-Length','0'))
            route=urlsplit(self.path).path
            limit=7_800_000 if route in ('/wechat-screen-start','/wechat-screen-read','/wechat-screen-follow','/wechat-screen-open','/wechat-float-frame','/wechat-crop-read') else 5000
            if not 0<n<limit or not self.headers.get('Content-Type','').startswith('application/json'):raise ValueError('请求格式不正确')
            data=json.loads(self.rfile.read(n))
            if not isinstance(data,dict):raise ValueError('请求格式不正确')
            if urlsplit(self.path).path=='/wechat-search':
                return self.send(200,wechat_request('wechat-search',{'keyword':data.get('keyword','')}))
            if route in ('/wechat-open','/wechat-open-choice'):
                return self.send(200,wechat_request(route[1:],{'id':data.get('id')}))
            if urlsplit(self.path).path=='/wechat-stop':
                return self.send(200,wechat_request('wechat-stop',{}))
            if route in ('/wechat-float-start','/wechat-float-poll','/wechat-float-frame','/wechat-float-stop'):
                return self.send(200,wechat_request(route[1:],{k:data.get(k) for k in ('id','width','height','image','displaySurface','windowLabel')}))
            if route in ('/wechat-group-list','/wechat-group-messages'):
                return self.send(200,wechat_request(route[1:],{k:data.get(k) for k in ('id','query','keyword')}))
            if route=='/wechat-crop-read':
                return self.send(200,wechat_request('ocr-frame',{'image':data.get('image')}))
            if route in ('/wechat-screen-start','/wechat-screen-read','/wechat-screen-follow','/wechat-screen-open'):
                return self.send(200,wechat_request(route[1:],{k:data.get(k) for k in ('keyword','image','displaySurface','windowLabel','searchId','manual','group','kind','name')}))
            if urlsplit(self.path).path=='/assist-step':
                from sy_wechat_assistant import plan_step,execute_step
                with LOCK:
                    session=str(data.get('session',''))
                    if not STATE['session'] or session!=STATE['session'] or not STATE['control'] or time.monotonic()>STATE['until']:return self.send(403,{'error':'先允许控制并连接桌面，才能开始助手查找。'})
                    if STATE['working']:return self.send(409,{'error':'上一步还在执行，请等待。'})
                    group=str(data.get('group','')).strip()[:100];keyword=str(data.get('keyword','')).strip()[:100]
                    if not group or not keyword or any(ord(c)<32 for c in group+keyword):return self.send(400,{'error':'请提供单行的准确群名和关键词。'})
                    job=(group,keyword)
                    if STATE['job'] and STATE['job']!=job:return self.send(409,{'error':'更换范围前，请停止并重新连接。'})
                    if STATE['step']>=10:return self.send(409,{'error':'本轮已执行十步，停止以便核对。'})
                    STATE['job']=job;STATE['working']=True;STATE['until']=time.monotonic()+120
                    history=list(STATE['history'])
                try:
                    step,bounds,shot=plan_step(group,keyword,history)
                    with LOCK:
                        if session!=STATE['session'] or time.monotonic()>STATE['until']:return self.send(409,{'error':'本轮已停止，不再执行操作。'})
                        execute_step(step,bounds,group,keyword)
                        STATE['history'].append({k:step.get(k) for k in ('action','reason','purpose')});STATE['step']+=1;STATE['until']=time.monotonic()+30
                    return self.send(200,{'step':step,'image':shot,'number':STATE['step']})
                finally:
                    with LOCK:STATE['working']=False
            with LOCK:
                now=time.monotonic(); action=urlsplit(self.path).path
                if action=='/start':
                    if STATE['until']>now:return self.send(409,{'error':'已有面板连接，请先停止原面板或等待 30 秒过期。'})
                    STATE.update(until=now+30,control=data.get('control') is True,session=secrets.token_urlsafe(24),history=[],job=None,step=0,working=False)
                    return self.send(200,{'ok':True,'session':STATE['session'],'control':STATE['control']})
                if not STATE['session'] or not secrets.compare_digest(str(data.get('session','')),STATE['session']):return self.send(403,{'error':'会话不匹配，请重新连接。'})
                if action=='/stop':
                    STATE.update(until=0,control=False,session=None)
                    return self.send(200,{'ok':True})
                if now>STATE['until']:return self.send(409,{'error':'连接已停止或过期，请重新连接。'})
                if action=='/frame':
                    im=ImageGrab.grab(); original=list(im.size); im.thumbnail((1280,900)); out=io.BytesIO(); im.convert('RGB').save(out,format='JPEG',quality=72)
                    STATE['until']=now+30
                    return self.send(200,{'image':base64.b64encode(out.getvalue()).decode(),'size':original,'control':STATE['control']})
                if not STATE['control']:return self.send(403,{'error':'当前为只看模式，请停止后勾选允许点击再连接。'})
                if action=='/click':
                    x,y=float(data['x']),float(data['y'])
                    if not(0<=x<=1 and 0<=y<=1):raise ValueError('坐标不正确')
                    w,h=desktop.size(); desktop.click(min(w-2,max(1,int(x*w))),min(h-2,max(1,int(y*h))))
                else:return self.send(404,{'error':'不支持的操作'})
                return self.send(200,{'ok':True})
        except desktop.FailSafeException:
            STATE.update(until=0,control=False,session=None)
            self.send(409,{'error':'鼠标移到屏幕角落，控制已紧急停止。'})
        except (ValueError,KeyError,TypeError):self.send(400,{'error':'请求参数不正确。'})
        except Exception as exc:
            from rescue_service import RescueError
            self.send(getattr(exc,'status',500),{'error':str(exc) if isinstance(exc,RescueError) else '桌面读取失败，请确认电脑未锁屏且桌面会话可用。','code':getattr(exc,'code','DESKTOP_UNAVAILABLE')})
if __name__=='__main__':
    print('Shanganya desktop bridge: '+ORIGIN,flush=True)
    ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()
