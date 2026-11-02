"""Read the user's existing local integrations. Never return credentials to the UI."""
import json
import os
import sqlite3
import re
from pathlib import Path


def load_feishu_credentials():
    path = Path.home() / '.hermes' / '.env'
    if not path.is_file():
        return
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        key, sep, value = line.partition('=')
        key = key.strip()
        if sep and key in ('FEISHU_APP_ID', 'FEISHU_APP_SECRET') and not os.environ.get(key):
            value = value.strip()
            if len(value) > 1 and value[0] == value[-1] and value[0] in ('"', "'"):
                value = value[1:-1]
            os.environ[key] = value


def _candidates():
    path = Path.home() / '.cc-switch' / 'cc-switch.db'
    if not path.is_file():
        return []
    rows = []
    with sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=3) as db:
        for identifier, app, name, raw, active in db.execute('SELECT id,app_type,name,settings_config,is_current FROM providers ORDER BY is_current DESC,sort_index'):
            try:
                settings = json.loads(raw)
                env = settings.get('env', {})
                if app == 'claude':
                    base = env.get('ANTHROPIC_BASE_URL', 'https://api.anthropic.com').rstrip('/')
                    if not base.endswith('/v1'):
                        base += '/v1'
                    model = env.get('ANTHROPIC_MODEL') or env.get('ANTHROPIC_DEFAULT_SONNET_MODEL', '')
                    key = env.get('ANTHROPIC_AUTH_TOKEN') or env.get('ANTHROPIC_API_KEY', '')
                    protocol = 'anthropic'
                elif app == 'codex':
                    import tomllib
                    config = tomllib.loads(settings.get('config', ''))
                    provider = config.get('model_providers', {}).get(config.get('model_provider'), {})
                    base = provider.get('base_url', 'https://api.openai.com/v1').rstrip('/')
                    model = config.get('model', '')
                    key = settings.get('auth', {}).get('OPENAI_API_KEY', '')
                    protocol = 'responses' if provider.get('wire_api', 'responses') == 'responses' else 'chat'
                else:
                    continue
                rows.append({'id': identifier, 'app': app, 'name': name, 'current': bool(active), 'base': base,
                             'model': model, 'key': key or '', 'protocol': protocol, 'available': bool(key and base and model)})
            except (ValueError, TypeError, AttributeError):
                continue
    return rows


def ccswitch_catalog():
    try:
        rows = _candidates()
        return {'providers': [{k: v for k, v in row.items() if k != 'key'} for row in rows], 'found': bool(rows)}
    except (OSError, sqlite3.Error):
        return {'providers': [], 'found': False}


def connect_ccswitch(identifier=None, verify=True):
    from rescue_service import RescueError, set_config, public_config, candidate_config, complete, CONFIG, CONFIG_LOCK
    rows = _candidates()
    row = next((x for x in rows if x['id'] == identifier), None) if identifier else next((x for x in rows if x['current'] and x['available']), None)
    if not row or not row['available']:
        raise RescueError('CC Switch 中没有可直接使用的 API 配置。请选择含 API Key 和模型的服务；网页登录账户不能当作 API Key。', 'CC_SWITCH_UNAVAILABLE', 409)
    # Probe the candidate without replacing the app's working connection.
    # The CC Switch database is always opened read-only.
    if verify:
        try:
            candidate = candidate_config(row)
            complete([{'role': 'user', 'content': '只回复：连接成功'}], candidate)
        except RescueError as exc:
            exc.extra['config'] = public_config()
            exc.extra['provider'] = row['name']
            exc.extra['unchanged'] = True
            raise
    set_config(row)
    if verify:
        with CONFIG_LOCK:
            if all(CONFIG.get(k) == candidate.get(k) for k in ('base','model','key','protocol')):
                CONFIG['verified'] = True
    return dict(public_config(), provider=row['name'], imported=True)


def initialize():
    load_feishu_credentials()
    if not os.getenv('FOCUS_AI_BASE_URL'):
        # 优先用本机 Hermes 网关：外部中转站经常整组欠费/无通道，
        # 而本机网关自带模型故障切换，是这台机器上最稳的一条通道。
        if not connect_local_gateway():
            try:
                connect_ccswitch(verify=False)
            except Exception:
                pass


GATEWAY_BASE = 'http://127.0.0.1:8642/v1'
GATEWAY_MODEL = 'hermes-agent'


def load_hermes_gateway_key():
    """读取本机 Hermes 网关的 API_SERVER_KEY（只在服务进程内存里用，不回传前端）。"""
    path = Path.home() / '.hermes' / '.env'
    if not path.is_file():
        return ''
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        key, sep, value = line.partition('=')
        if sep and key.strip() == 'API_SERVER_KEY' and not os.environ.get('HERMES_GATEWAY_KEY'):
            value = value.strip()
            if len(value) > 1 and value[0] == value[-1] and value[0] in ('"', "'"):
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
    from rescue_service import CONFIG, CONFIG_LOCK, model_request, public_config
    key = os.environ.get('HERMES_GATEWAY_KEY') or load_hermes_gateway_key()
    if not key or not gateway_port_open():
        return None
    candidate = {'base': GATEWAY_BASE, 'model': GATEWAY_MODEL, 'key': key,
                 'protocol': 'chat', 'verified': False, 'lastError': '', 'lastHttpStatus': None}
    try:
        model_request(candidate, '/models', stage='connection')
    except Exception:
        return None
    candidate['verified'] = True
    with CONFIG_LOCK:
        CONFIG.update(candidate)
    return public_config()
