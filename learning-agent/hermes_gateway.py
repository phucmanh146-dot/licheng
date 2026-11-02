"""Explicit local Hermes connection using this PC existing credential source.
Credentials are read at runtime, never returned or copied to repository files.
Import/initialize does not call a model; connection is opt-in.
"""
import os
from pathlib import Path

GATEWAY_BASE = 'http://127.0.0.1:8642/v1'

GATEWAY_MODEL = 'hermes-agent'

def load_hermes_gateway_key():
    """读取本机 Hermes 网关的 API_SERVER_KEY（只在服务进程内存里用，不回传前端）。"""
    path = Path.home() / '.hermes' / '.env'
    if not path.is_file():
        return ''
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        key, sep, value = line.partition('=')
        if sep and key.strip() == 'API_SERVER_KEY' and (not os.environ.get('HERMES_GATEWAY_KEY')):
            value = value.strip()
            if len(value) > 1 and value[0] == value[-1] and (value[0] in ('"', "'")):
                value = value[1:-1]
            os.environ['HERMES_GATEWAY_KEY'] = value
    return os.environ.get('HERMES_GATEWAY_KEY', '')

def gateway_port_open(timeout=0.6):
    import socket as _socket
    try:
        with _socket.create_connection(('127.0.0.1', 8642), timeout):
            return True
    except OSError:
        return False

def connect_local_gateway():
    """把上岸鸭接到本机 Hermes 网关，成功返回公开配置，失败返回 None。"""
    from rescue_service import CONFIG, CONFIG_LOCK, model_request, complete, public_config
    key = os.environ.get('HERMES_GATEWAY_KEY') or load_hermes_gateway_key()
    if not key or not gateway_port_open():
        return None
    candidate = {'base': GATEWAY_BASE, 'model': GATEWAY_MODEL, 'key': key, 'protocol': 'chat', 'verified': False, 'lastError': '', 'lastHttpStatus': None}
    try:
        model_request(candidate, '/models', stage='connection')
        complete([{'role': 'user', 'content': '只回复：连接成功'}], candidate)
    except Exception:
        return None
    candidate['verified'] = True
    with CONFIG_LOCK:
        CONFIG.update(candidate)
    return public_config()

def initialize():
    """Standalone import leaves model selection to the explicit connection action."""
    return None
