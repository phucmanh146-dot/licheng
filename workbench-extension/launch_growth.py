"""Start the original localhost workspace with its additive material workflow."""
import json
from pathlib import Path
import socket
import subprocess
import sys
import time
from urllib.request import urlopen
import webbrowser
from growth_paths import data_directory, prepare_temporary_directory

ROOT = Path(__file__).resolve().parent
URL = 'http://127.0.0.1:8877'

def ready():
    try:
        with urlopen(URL + '/api/growth/health', timeout=2) as response:
            return json.load(response).get('version') == 'growth-1'
    except Exception:
        return False

def main():
    prepare_temporary_directory()
    if not ready():
        with socket.socket() as test:
            if test.connect_ex(('127.0.0.1', 8877)) == 0:
                print('8877端口已有其他版本运行。请先关闭旧的上岸鸭服务，再启动资料行动；未停止其他程序。')
                return 1
        logs = data_directory()
        logs.mkdir(exist_ok=True)
        with (logs / 'server.log').open('ab') as output:
            subprocess.Popen([sys.executable, str(ROOT / 'growth_server.py')], cwd=ROOT,
                             stdout=output, stderr=output,
                             creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        for _ in range(20):
            if ready():
                break
            time.sleep(.3)
    if not ready():
        print('资料服务未能启动，请检查上岸鸭服务日志。')
        return 1
    webbrowser.open(URL + '/index.html')
    print('已打开上岸鸭：在“知识与路线 → 资料航线工坊”导入资料。')
    return 0

if __name__ == '__main__':
    sys.exit(main())
