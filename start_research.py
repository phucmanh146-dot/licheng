"""Keep the original research workbench as the default; shared mode is opt-in."""
from pathlib import Path
import argparse
import os
import runpy
import subprocess
import sys

root = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description='�ϰ�Ѽ��Ĭ�ϴ�ԭ�п��й���̨��ԭ����')
parser.add_argument('--port', type=int, default=9010)
modes = parser.add_mutually_exclusive_group()
modes.add_argument('--shared', action='store_true', help='��ʽ���ù�����ˣ���Ǩ��ԭ����̨����')
modes.add_argument('--legacy', action='store_true', help='���ݾ������Ĭ������һ��')
parser.add_argument('--no-worker', action='store_true')
parser.add_argument('--hermes', action='store_true')
args, remaining = parser.parse_known_args()

if not args.shared:
    app = root / 'learning-agent/visual-workflow'
    sys.path.insert(0, str(app))
    sys.argv = [str(app / 'server.py'), '--workspace', str(root), '--port', str(args.port), *remaining]
    runpy.run_path(str(app / 'server.py'), run_name='__main__')
else:
    if remaining:
        parser.error('����ģʽ��֧�֣�' + ' '.join(remaining))
    if args.hermes:
        os.environ['SHANGAN_USE_HERMES'] = '1'
    sys.path.insert(0, str(root / 'learning-agent'))
    import uvicorn
    child = None
    try:
        if not args.no_worker:
            child = subprocess.Popen([sys.executable, str(root / 'learning-agent/research_graph.py')],
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        uvicorn.run('shared_api:app', host='127.0.0.1', port=args.port)
    finally:
        if child:
            child.terminate()
            child.wait(timeout=10)
