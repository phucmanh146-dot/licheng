import os,json,secrets
from pathlib import Path
from urllib.parse import urlparse
home=Path(os.environ['SHANGANYA_SESSION_HOME']);home.mkdir(parents=True,exist_ok=True)
os.environ['HOME']=str(home);os.environ['USERPROFILE']=str(home);os.environ['APPDATA']=str(home/'appdata');os.environ['LOCALAPPDATA']=str(home/'localdata')
vault=home/'vault';vault.mkdir(exist_ok=True)
active=home/'active-vault.json'
try:
 name=json.loads(active.read_text(encoding='utf-8')).get('name','')
 if name and len(name)<=100 and not any(c in name for c in ('/',chr(92),chr(0))) and not name.startswith('.'):
  vault=home/'vaults'/name;vault.mkdir(parents=True,exist_ok=True)
except (OSError,ValueError,TypeError):pass
os.environ['FOCUS_VAULT_PATH']=str(vault)
for key in list(os.environ):
 if key.startswith(('FEISHU_','OPENAI_','ANTHROPIC_','DEEPSEEK_','GLM_','FOCUS_AI_','SHANGANYA_API_','HEYGEN_')):os.environ.pop(key,None)
import local_server
import multi_sources
import heygen_video
class Worker(local_server.Handler):
 def do_GET(self):
  path=urlparse(self.path).path
  if path.startswith('/api/heygen/'):
   try:return self.send_json(heygen_video.get(path,self.headers.get('X-SY-Session','')))
   except heygen_video.HeyGenError as e:return self.send_json({'error':str(e)},e.status)
   except Exception as e:return self.send_json({'error':str(e)[:300]},503)
  if self.path=="/api/sources/status":return self.send_json(multi_sources.status())
  if self.path.startswith("/api/sources/"):return self.send_json({"error":"请使用POST"},405)
  return super().do_GET()
 def do_POST(self):
  global vault
  path=urlparse(self.path).path
  if path.startswith('/api/heygen/'):
   try:
    size=int(self.headers.get('Content-Length','0'))
    if size<1 or size>200000:return self.send_json({'error':'请求大小无效'},413)
    data=json.loads(self.rfile.read(size))
    if not isinstance(data,dict):raise ValueError('请求无效')
    return self.send_json(heygen_video.post(path,data,self.headers.get('X-SY-Session','')))
   except heygen_video.HeyGenError as e:return self.send_json({'error':str(e)},e.status)
   except Exception as e:return self.send_json({'error':str(e)[:300]},422)
  if self.path.startswith("/api/sources/"):
   try:
    size=int(self.headers.get("Content-Length","0"))
    if size<1 or size>100000:return self.send_json({"error":"请求大小无效"},413)
    data=json.loads(self.rfile.read(size))
    if not isinstance(data,dict):raise ValueError("请求无效")
    return self.send_json(multi_sources.dispatch(self.path,data))
   except Exception as e:return self.send_json({"error":str(e)},422)
  if self.path in ('/api/public-vault-import','/api/public-feishu-config'):
   try:
    size=int(self.headers.get('Content-Length','0'))
    if size<=0 or size>6000000:return self.send_json({'error':'单批导入请小于6MB'},413)
    d=json.loads(self.rfile.read(size))
    if self.path.endswith('feishu-config'):
     for name,key in [('FEISHU_APP_ID','appId'),('FEISHU_APP_SECRET','appSecret')]:
      v=str(d.get(key,'')).strip()
      if not v or len(v)>8192:raise ValueError('请填写飞书应用ID和密钥')
      os.environ[name]=v
     return self.send_json({'ok':True,'note':'只用于你的会话；实际读取时核验权限。'})
    name=str(d.get('vaultName','')).strip()
    if name:
     if len(name)>100 or any(c in name for c in '/\\\x00') or name.startswith('.'):raise ValueError('库名无效')
     vault=home/'vaults'/name;vault.mkdir(parents=True,exist_ok=True);os.environ['FOCUS_VAULT_PATH']=str(vault)
     active.write_text(json.dumps({'name':name},ensure_ascii=False),encoding='utf-8')
    notes=d.get('notes',[])
    if not isinstance(notes,list) or len(notes)>200:raise ValueError('每批最多200个文件')
    prepared=[]
    for note in notes:
     relative=str(note.get('path','')).replace('\\','/')
     target=(vault/relative).resolve()
     if not target.is_relative_to(vault.resolve()) or any(x.startswith('.') for x in Path(relative).parts) or target.suffix.lower() not in ('.md','.canvas'):raise ValueError('笔记路径或格式无效')
     text=note.get('text')
     if not isinstance(text,str) or len(text)>2000000:raise ValueError('笔记过大')
     prepared.append((target,text))
    if len({str(p) for p,t in prepared})!=len(prepared):raise ValueError('同一批次包含重复文件路径。')
    existing=sum(p.stat().st_size for p in vault.rglob('*') if p.is_file())
    replacing=sum(p.stat().st_size for p,t in prepared if p.exists())
    incoming=sum(len(t.encode('utf-8')) for p,t in prepared)
    if existing-replacing+incoming>20*1024*1024:raise ValueError('当前账号的笔记空间上限20MB，请整理后再导入。')
    import shutil
    if shutil.disk_usage(home).free<30*1024*1024:raise ValueError('资料存储空间暂不足，本批没有写入。')
    for target,text in prepared:target.parent.mkdir(parents=True,exist_ok=True);target.write_text(text,encoding='utf-8')
    return self.send_json({'ok':True,'count':len(prepared)})
   except Exception as e:return self.send_json({'error':str(e)},422)
  return super().do_POST()
port=int(os.environ['SHANGANYA_WORKER_PORT'])
local_server.LocalServer(('127.0.0.1',port),Worker).serve_forever()
