from pathlib import Path
import sys, argparse, runpy, subprocess, os
root=Path(__file__).resolve().parent
p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=9010);p.add_argument('--legacy',action='store_true');p.add_argument('--no-worker',action='store_true');p.add_argument('--hermes',action='store_true');a=p.parse_args()
if a.hermes:os.environ['SHANGAN_USE_HERMES']='1'
if a.legacy:
 sys.path.insert(0,str(root/'learning-agent/visual-workflow'));sys.argv=['server.py','--workspace',str(root),'--port',str(a.port)];runpy.run_path(str(root/'learning-agent/visual-workflow/server.py'),run_name='__main__')
else:
 sys.path.insert(0,str(root/'learning-agent'))
 import uvicorn
 child=None
 try:
  if not a.no_worker:child=subprocess.Popen([sys.executable,str(root/'learning-agent/research_graph.py')],creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
  uvicorn.run('shared_api:app',host='127.0.0.1',port=a.port)
 finally:
  if child:child.terminate();child.wait(timeout=10)
