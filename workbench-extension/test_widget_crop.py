"""Windows Tk verification against an offscreen, synthetic window/image only.
Does not capture the OS desktop, move the mouse, or approve browser sharing.
"""
import base64
import ctypes
import io
import json
import queue
import sys
import tkinter as tk
from PIL import Image, ImageDraw
import growth_wechat_float as floating

real_stdout=sys.stdout
original_tk,original_top=tk.Tk,tk.Toplevel
try: ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
except (OSError,AttributeError): pass
from ctypes import wintypes
user=ctypes.windll.user32
user.CreateWindowExW.restype=wintypes.HWND
user.CreateWindowExW.argtypes=[wintypes.DWORD,wintypes.LPCWSTR,wintypes.LPCWSTR,wintypes.DWORD,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_int,wintypes.HWND,wintypes.HMENU,wintypes.HINSTANCE,wintypes.LPVOID]
hwnd=user.CreateWindowExW(0,'STATIC','Synthetic crop target',0x90000000,10000,10000,900,600,None,None,None,None)
assert hwnd
im=Image.new('RGB',(900,600),'blue');ImageDraw.Draw(im).rectangle((100,100,399,299),fill='red')
buf=io.BytesIO();im.save(buf,'PNG');frame='data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode()
commands=queue.Queue();events=[];errors=[];progress=[]
class Input:
    def __iter__(self):return self
    def __next__(self):return commands.get()
class Output:
    pending=''
    def write(self,text):
        self.pending+=text
        while '\n' in self.pending:
            line,self.pending=self.pending.split('\n',1)
            if not line:continue
            event=json.loads(line);events.append(event['type'])
            if event['type']=='capture': commands.put(json.dumps({'type':'frame','image':frame})+'\n')
            if event['type']=='crop':
                crop=Image.open(io.BytesIO(base64.b64decode(event['image'].split(',',1)[1])))
                if crop.size!=(300,200) or crop.getpixel((150,100))!=(255,0,0):errors.append('crop bounds or pixels differ')
                commands.put('{"type":"stop"}\n')
            if event['type']=='error':errors.append(event['message']);commands.put('{"type":"stop"}\n')
        return len(text)
    def flush(self):pass

def widget_root(*a,**kw):
    root=original_tk(*a,**kw)
    def request():
        progress.append('request')
        for child in root.winfo_children():
            if isinstance(child,tk.Button) and child.cget('text')=='框选':child.invoke();return
        errors.append('crop button missing');root.destroy()
    root.after(500,request);root.after(8000,lambda:(errors.append('timeout'),root.destroy()))
    return root

def overlay(*a,**kw):
    top=original_top(*a,**kw);top.focus_force=lambda:None
    def select():
        top.update_idletasks()
        canvas=next(w for w in top.winfo_children() if isinstance(w,tk.Canvas))
        progress.append({'select':True,'mapped':canvas.winfo_ismapped(),'size':[canvas.winfo_width(),canvas.winfo_height()]})
        canvas.event_generate('<ButtonPress-1>',x=100,y=100)
        canvas.event_generate('<B1-Motion>',x=400,y=300)
        canvas.event_generate('<ButtonRelease-1>',x=400,y=300)
        for row in top.winfo_children():
            for child in row.winfo_children():
                if isinstance(child,tk.Button) and child.cget('text')=='确认并识别':progress.append('confirm');child.invoke();return
        errors.append('confirm button missing')
    top.after(200,select);return top

try:
    sys.stdin=Input();sys.stdout=Output();tk.Tk=widget_root;tk.Toplevel=overlay
    floating.run_widget(hwnd)
finally:
    tk.Tk=original_tk;tk.Toplevel=original_top;sys.stdout=real_stdout;user.DestroyWindow(hwnd)
assert not errors,(errors,events,progress)
assert events==['capture','crop'],events
print(json.dumps({'ok':True,'checks':['native-widget-request','provided-frame-overlay','exact-crop-bounds','crop-confirmation'],'realWeChat':False}))
