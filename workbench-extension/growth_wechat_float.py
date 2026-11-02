"""Floating WeChat crop UI. Images come ONLY from the user's browser share.
No OS screen capture, keyboard hooks, arbitrary commands, or message sending.
"""
import base64
import io
import json
import os
from pathlib import Path
import queue
import secrets
import subprocess
import sys
import threading
import time
from rescue_service import RescueError

SESSIONS = {}
LOCK = threading.RLock()


def stop(identifier):
    with LOCK:
        state = SESSIONS.pop(str(identifier), None)
    if state:
        try:
            state['process'].stdin.write('{"type":"stop"}\n'); state['process'].stdin.flush()
        except (OSError, ValueError): pass
        def cleanup():
            try: state['process'].wait(timeout=2)
            except subprocess.TimeoutExpired: state['process'].terminate()
        threading.Thread(target=cleanup, daemon=True).start()
    return {'ok': True}


def get_state(identifier):
    with LOCK: state = SESSIONS.get(str(identifier))
    if not state or state['process'].poll() is not None:
        raise RescueError('浮动操作条已关闭，请重新点击“跟随微信框选”。', 'FLOAT_STOPPED', 409)
    return state


def start(data):
    if os.name != 'nt': raise RescueError('浮动操作条需要本机 Windows 服务。', 'FLOAT_UNAVAILABLE', 503)
    from growth_wechat_screen import check_shared, matching_window, physical_pixels
    check_shared(data)
    try:
        doc = {'width': int(data['width']), 'height': int(data['height'])}
        if not (100 <= doc['width'] <= 10000 and 100 <= doc['height'] <= 10000): raise ValueError()
    except (KeyError, TypeError, ValueError):
        raise RescueError('共享窗口画面尚未就绪。', 'BAD_FRAME', 400) from None
    with physical_pixels(): hwnd, _ = matching_window(doc, data.get('windowLabel', ''))
    from pywinauto import Desktop
    try: Desktop(backend='uia').window(handle=hwnd).wrapper_object().set_focus()
    except Exception:
        raise RescueError('微信没有切到前台，请点开微信后再开启浮动工具条。', 'WECHAT_FOCUS', 409) from None
    with LOCK:
        for old in list(SESSIONS): stop(old)
        process = subprocess.Popen([sys.executable, str(Path(__file__)), '--widget', str(hwnd)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, encoding='utf-8', bufsize=1, creationflags=subprocess.CREATE_NO_WINDOW)
        identifier = secrets.token_urlsafe(24)
        state = {'process': process, 'events': queue.Queue(maxsize=5), 'until': time.monotonic()+40,
                 'capture': None, 'hwnd': hwnd, 'write': threading.Lock()}
        SESSIONS[identifier] = state
    def receive():
        try:
            for line in process.stdout:
                if len(line) > 7_200_000: continue
                try: event = json.loads(line)
                except ValueError: continue
                if event.get('type') not in ('capture', 'crop', 'show', 'stop', 'error'): continue
                if event.get('type') == 'capture': state['capture'] = time.monotonic()
                if state['events'].full(): state['events'].get_nowait()
                state['events'].put_nowait(event)
        except (OSError, ValueError): pass
        finally:
            if not state['events'].full(): state['events'].put_nowait({'type': 'stop'})
    def watchdog():
        while process.poll() is None:
            if time.monotonic() > state['until']: stop(identifier); break
            time.sleep(1)
    threading.Thread(target=receive, daemon=True).start()
    threading.Thread(target=watchdog, daemon=True).start()
    return {'id': identifier, 'ok': True}


def poll(identifier):
    with LOCK: state = SESSIONS.get(str(identifier))
    if not state: return {'events': [{'type':'stop'}]}
    state['until'] = time.monotonic()+40
    events = []
    while not state['events'].empty():
        try: events.append(state['events'].get_nowait())
        except queue.Empty: break
    if state['process'].poll() is not None:
        if not any(event.get('type') == 'stop' for event in events): events.append({'type':'stop'})
        stop(identifier)
    return {'events': events}


def submit_frame(data):
    state = get_state(data.get('id'))
    if state['capture'] is None or time.monotonic()-state['capture'] > 15:
        raise RescueError('框选请求已过期，请再点一次操作条上的“框选”。', 'FLOAT_EXPIRED', 409)
    image = data.get('image', '')
    if not isinstance(image, str) or not image.startswith('data:image/png;base64,') or len(image) > 7_000_000:
        raise RescueError('共享画面格式不正确。', 'BAD_FRAME', 400)
    from growth_wechat_screen import check_shared, matching_window, physical_pixels
    from PIL import Image
    check_shared(data)
    try:
        raw = base64.b64decode(image.split(',', 1)[1], validate=True)
        with Image.open(io.BytesIO(raw)) as im:
            if im.width*im.height > 10_000_000: raise ValueError()
            doc = {'width': im.width, 'height': im.height}
    except Exception: raise RescueError('共享画面无法解码。', 'BAD_FRAME', 400) from None
    with physical_pixels(): hwnd, _ = matching_window(doc, data.get('windowLabel', ''))
    if hwnd != state['hwnd']: raise RescueError('共享窗口已变化，请重新连接。', 'WECHAT_WINDOW_CHANGED', 409)
    state['capture'] = None
    with state['write']:
        try:
            state['process'].stdin.write(json.dumps({'type': 'frame', 'image': image})+'\n')
            state['process'].stdin.flush()
        except (OSError, ValueError): raise RescueError('操作条已关闭。', 'FLOAT_STOPPED', 409) from None
    return {'ok': True}


def run_widget(hwnd):
    import ctypes
    from ctypes import wintypes
    from PIL import Image, ImageTk
    import tkinter as tk
    user = ctypes.windll.user32
    try: user.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
    except (OSError, AttributeError): pass
    inbox = queue.Queue()
    def emit(event):
        try: print(json.dumps(event, ensure_ascii=True), flush=True)
        except (OSError, ValueError): root.destroy()
    def read_commands():
        try:
            for line in sys.stdin:
                try: inbox.put(json.loads(line))
                except ValueError: pass
        finally: inbox.put({'type': 'stop'})
    def bounds():
        rect = wintypes.RECT()
        if ctypes.windll.dwmapi.DwmGetWindowAttribute(hwnd, 9, ctypes.byref(rect), ctypes.sizeof(rect)):
            user.GetWindowRect(hwnd, ctypes.byref(rect))
        return rect.left, rect.top, rect.right-rect.left, rect.bottom-rect.top
    root = tk.Tk(); root.title('上岸鸭 · 微信框选操作条'); root.overrideredirect(True)
    root.attributes('-topmost', True); root.configure(bg='#143a2e')
    overlay = None; capture_until = 0
    status = tk.StringVar(master=root, value='自由操作微信 · 跟随窗口')
    tk.Label(root, textvariable=status, fg='#eef2df', bg='#143a2e', font=('Microsoft YaHei',9)).pack(side='left', padx=8)
    def request_capture():
        nonlocal capture_until
        if capture_until or overlay is not None: return
        capture_until = time.monotonic()+12; status.set('正在取共享画面…'); emit({'type': 'capture'})
    def finish(): emit({'type': 'stop'}); root.destroy()
    def show_list():
        emit({'type': 'show'})
        # Bring back only an unambiguous workbench browser window.
        import pygetwindow, psutil
        choices=[]
        for w in pygetwindow.getAllWindows():
            if '上岸鸭' not in w.title or w._hWnd == root.winfo_id(): continue
            pid=wintypes.DWORD();user.GetWindowThreadProcessId(w._hWnd,ctypes.byref(pid))
            try:
                if psutil.Process(pid.value).name().lower() in ('chrome.exe','msedge.exe'): choices.append(w)
            except (psutil.NoSuchProcess,psutil.AccessDenied): pass
        if len(choices)==1:
            try: choices[0].restore(); choices[0].activate()
            except Exception: pass
    for label, action in [('框选',request_capture),('回列表',show_list),('停止',finish)]:
        tk.Button(root, text=label, command=action, takefocus=False, bg='#ddebaf', fg='#173d2a', relief='flat', font=('Microsoft YaHei',10)).pack(side='left',padx=3,pady=5)
    def freeze(image):
        nonlocal overlay, capture_until
        capture_until=0
        if overlay: overlay.destroy()
        source=Image.open(io.BytesIO(base64.b64decode(image.split(',',1)[1],validate=True))).convert('RGB')
        left,top,width,height=bounds()
        if abs(source.width/width-source.height/height)/max(source.width/width,source.height/height)>.012:
            emit({'type':'error','message':'微信窗口尺寸变了，请重新框选。'}); return
        root.withdraw()
        overlay=tk.Toplevel(root); overlay.overrideredirect(True); overlay.attributes('-topmost',True)
        overlay.geometry(f'{width}x{height}{left:+d}{top:+d}')
        canvas=tk.Canvas(overlay,highlightthickness=0,cursor='crosshair'); canvas.pack(fill='both',expand=True)
        photo=ImageTk.PhotoImage(source.resize((width,height)),master=canvas); canvas.image=photo
        canvas.create_image(0,0,anchor='nw',image=photo)
        rect=[None,None,None,None];box=None
        def cancel():
            nonlocal overlay
            if overlay: overlay.destroy();overlay=None
            status.set('自由操作微信 · 跟随窗口')
        def down(e): rect[:]=[max(0,min(width,e.x)),max(0,min(height,e.y)),e.x,e.y]
        def move(e):
            nonlocal box
            if rect[0] is None:return
            rect[2:]=[max(0,min(width,e.x)),max(0,min(height,e.y))]
            if box:canvas.delete(box)
            box=canvas.create_rectangle(*rect,outline='#ffbf35',width=3)
        def done():
            if rect[0] is None:return
            x1,x2=sorted([rect[0],rect[2]]);y1,y2=sorted([rect[1],rect[3]])
            if x2-x1<16 or y2-y1<16:return
            region=(round(x1*source.width/width),round(y1*source.height/height),round(x2*source.width/width),round(y2*source.height/height))
            output=io.BytesIO();source.crop(region).save(output,'PNG')
            emit({'type':'crop','image':'data:image/png;base64,'+base64.b64encode(output.getvalue()).decode()})
            cancel();status.set('已框选 · 回列表勾选内容')
        canvas.bind('<ButtonPress-1>',down);canvas.bind('<B1-Motion>',move);canvas.bind('<ButtonRelease-1>',move)
        bar=tk.Frame(overlay,bg='#143a2e');bar.place(relx=1,x=-8,y=8,anchor='ne')
        tk.Label(bar,text='拖动框选 · Esc取消',fg='white',bg='#143a2e').pack(side='left',padx=8)
        tk.Button(bar,text='确认并识别',command=done).pack(side='left',padx=3,pady=4)
        tk.Button(bar,text='取消',command=cancel).pack(side='left',padx=3,pady=4)
        overlay.bind('<Escape>',lambda e:cancel());overlay.focus_force()
    def tick():
        nonlocal capture_until
        if not user.IsWindow(hwnd): finish();return
        while not inbox.empty():
            item=inbox.get_nowait()
            if item.get('type')=='stop':root.destroy();return
            if item.get('type')=='frame':
                try:freeze(item['image'])
                except Exception:emit({'type':'error','message':'共享画面未能展开，请重新框选。'})
        if capture_until and time.monotonic()>capture_until:
            capture_until=0;status.set('未收到画面 · 请回工作台重试')
        if overlay is None:
            if user.IsIconic(hwnd) or not user.IsWindowVisible(hwnd):root.withdraw()
            else:
                left,top,width,height=bounds();root.update_idletasks()
                bw,bh=root.winfo_reqwidth(),root.winfo_reqheight()
                vx,vy,vw,vh=[user.GetSystemMetrics(i) for i in (76,77,78,79)]
                x=min(vx+vw-bw,max(vx,left+width-bw));y=top-bh-4 if top-bh>=vy else top+6
                root.geometry(f'{bw}x{bh}{x:+d}{y:+d}');root.deiconify()
        root.after(250,tick)
    threading.Thread(target=read_commands,daemon=True).start();root.after(0,tick);root.mainloop()


if __name__=='__main__' and len(sys.argv)==3 and sys.argv[1]=='--widget':
    run_widget(int(sys.argv[2]))
