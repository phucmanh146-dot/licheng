"""Local user-clicked toolbar sessions. No capture starts from polling or launch."""
import os,secrets,subprocess,sys,threading,time
from pathlib import Path
from rescue_service import RescueError
_LOCK=threading.RLock()
_STATE={}
def _check(token):
    if not token or not secrets.compare_digest(str(token),str(_STATE.get('token',''))) or time.time()-_STATE.get('at',0)>3600:
        raise RescueError('微信浮窗会话已失效，请重新打开。','TOOLBAR_SESSION_EXPIRED',409)
def start(port):
    import pm_wechat_desktop as wx
    target=wx._focus()
    target_handle=int(target.handle)
    with _LOCK:
        old=_STATE.get('process')
        if old and old.poll() is None:old.terminate()
        token=secrets.token_urlsafe(24)
        env=dict(os.environ,SY_WECHAT_TOOL_TOKEN=token)
        worker=Path(__file__).with_name('wechat_toolbar_ui.py')
        python=Path(sys.executable).with_name('pythonw.exe')
        if not python.is_file():python=Path(sys.executable)
        proc=subprocess.Popen([str(python),str(worker),'--port',str(int(port)),
            '--handle',str(target_handle)],env=env,cwd=str(worker.parent))
        _STATE.clear()
        _STATE.update(token=token,process=proc,at=time.time(),events=[],seq=0,handle=target_handle)
        return {'ok':True,'sessionId':token,'started':True,
            'note':'已启动微信右上角浮窗；你点框选后才截图，确认选区后才识别。'}
def events(data):
    with _LOCK:
        _check(data.get('sessionId'))
        after=max(0,int(data.get('after',0)))
        return {'ok':True,'events':[x for x in _STATE['events'] if x['seq']>after],
            'running':_STATE['process'].poll() is None}
def capture(data):
    with _LOCK:
        _check(data.get('sessionId'))
        target=int(data.get('windowHandle') or _STATE['handle'])
    import pm_agent_bridge as pm
    return pm.capture_wechat_window(restore_previous=False,target_handle=target)
def crop(data):
    with _LOCK:_check(data.get('sessionId'))
    import pm_agent_bridge as pm
    result=pm.crop_wechat_window(data)
    with _LOCK:
        _check(data.get('sessionId'))
        _STATE['seq']+=1
        _STATE['events'].append({'seq':_STATE['seq'],'result':result})
        _STATE['events']=_STATE['events'][-20:]
    return {'ok':True,'chars':len(result.get('content',''))}
