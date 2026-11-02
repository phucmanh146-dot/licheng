"""Start only this workbench's existing loopback desktop panel on demand."""
import json
from pathlib import Path
import socket
import subprocess
import sys
import threading
import time
from urllib.request import urlopen
from rescue_service import RescueError
from growth_paths import data_directory

ROOT = Path(__file__).resolve().parent
URL = 'http://127.0.0.1:8878'
LOCK = threading.Lock()


def status():
    try:
        with urlopen(URL + '/health', timeout=1) as response:
            info = json.load(response)
        return {'ready': info.get('ok') is True and info.get('service') == 'shanganya-local-desktop', 'url': URL + '/'}
    except (OSError, ValueError):
        return {'ready': False, 'url': URL + '/'}


def ensure_ready():
    with LOCK:
        result = status()
        if result['ready']: return result
        bridge = ROOT / 'sy_remote_bridge.py'
        if not bridge.is_file():
            raise RescueError('没有找到原远程面板程序，请从完整工作台目录启动。', 'REMOTE_MISSING', 409)
        with socket.socket() as check:
            check.settimeout(1)
            if check.connect_ex(('127.0.0.1', 8878)) == 0:
                raise RescueError('8878端口被其他程序占用，未关闭其他程序。', 'REMOTE_PORT_BUSY', 409)
        logs = data_directory()
        logs.mkdir(exist_ok=True)
        with (logs / 'remote.log').open('ab') as output:
            process = subprocess.Popen([sys.executable, str(bridge)], cwd=str(ROOT), stdout=output, stderr=output,
                                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        for _ in range(20):
            result = status()
            if result['ready']: return result
            if process.poll() is not None: break
            time.sleep(.2)
        raise RescueError('远程面板启动未完成，请检查远程服务日志后重试；当前尚未连接桌面。', 'REMOTE_START_FAILED', 502)
