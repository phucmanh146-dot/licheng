"""Loopback broker for a paired Obsidian plugin; never scans arbitrary folders."""
import hashlib
import json
import secrets
import threading
import time
import uuid
from urllib.parse import urlencode
from growth_paths import data_directory

LOCK = threading.RLock()
PAIRS = data_directory() / 'obsidian-pairs.json'
pending_pairs, sessions, jobs = {}, {}, {}


def pairs():
    try:
        return json.loads(PAIRS.read_text(encoding='utf-8'))
    except FileNotFoundError:
        return {}


def pair_start():
    with LOCK:
        now = time.monotonic()
        for code in list(pending_pairs):
            if pending_pairs[code] < now:
                del pending_pairs[code]
        code = secrets.token_urlsafe(32)
        pending_pairs[code] = now + 60
    return {'url': 'obsidian://shanganya-connect?' + urlencode({'code': code}), 'expiresIn': 60}


def register(data):
    code, identifier = str(data.get('code', '')), str(data.get('vaultId', ''))
    if len(identifier) != 32 or any(c not in '0123456789abcdef' for c in identifier):
        raise ValueError('知识库标识无效。')
    with LOCK:
        expiry = pending_pairs.pop(code, 0)
        if expiry < time.monotonic():
            raise ValueError('配对已过期，请在工作台再次点击打开 Obsidian。')
        token = secrets.token_urlsafe(40)
        saved = pairs()
        saved[identifier] = {'tokenHash': hashlib.sha256(token.encode()).hexdigest()}
        PAIRS.parent.mkdir(parents=True, exist_ok=True)
        temp = PAIRS.with_suffix('.tmp')
        temp.write_text(json.dumps(saved), encoding='utf-8')
        temp.chmod(0o600)
        temp.replace(PAIRS)
        sessions.pop(identifier, None)
    return {'token': token}


def authenticate(identifier, token):
    saved = pairs().get(identifier)
    return bool(saved and secrets.compare_digest(saved['tokenHash'], hashlib.sha256(token.encode()).hexdigest()))


def safe_path(value):
    path = str(value or '')
    if not path or len(path) > 1000 or '\\' in path or ':' in path or not path.endswith('.md') or any(p in ('', '.', '..') or p.startswith('.') for p in path.split('/')):
        raise ValueError('只允许读取当前知识库中的 Markdown 笔记。')
    return path


def poll(data, token):
    identifier = str(data.get('vaultId', ''))
    with LOCK:
        if not authenticate(identifier, token):
            raise PermissionError('Obsidian 配对无效，请重新连接。')
        recent = data.get('recent', [])
        if not isinstance(recent, list) or len(recent) > 30:
            raise ValueError('最近笔记列表无效。')
        notes = []
        for row in recent:
            if not isinstance(row, dict):
                raise ValueError('笔记格式无效。')
            path = safe_path(row.get('path'))
            notes.append({'path': path, 'title': path.rsplit('/', 1)[-1][:-3]})
        old = sessions.get(identifier, {})
        now = time.monotonic()
        sessions[identifier] = {'vaultId': identifier, 'name': str(data.get('vaultName') or '当前知识库')[:180],
                                'recent': notes, 'seen': now,
                                'focusedAt': now if data.get('focused') is True else old.get('focusedAt', 0)}
        replies = data.get('results', [])
        if not isinstance(replies, list) or len(replies) > 10:
            raise ValueError('笔记返回内容无效。')
        ack = []
        for result in replies:
            if not isinstance(result, dict):
                continue
            job = jobs.get(str(result.get('id')))
            if not job or job['vaultId'] != identifier:
                continue
            ack.append(result['id'])
            if not job['event'].is_set():
                # Results are data only. They cannot enqueue additional operations.
                job['result'] = result
                job['event'].set()
        for key, job in list(jobs.items()):
            if now - job['created'] > 180:
                job['result'] = {'error': '笔记请求已过期。'}
                job['event'].set()
                del jobs[key]
        work = []
        for job in jobs.values():
            if job['vaultId'] == identifier and not job['dispatched'] and not job['event'].is_set():
                job['dispatched'] = True
                work.append(job['payload'])
                if len(work) == 5:
                    break
        return {'jobs': work, 'ack': ack}


def status():
    with LOCK:
        now = time.monotonic()
        live = [s for s in sessions.values() if now - s['seen'] < 12]
        live.sort(key=lambda s: (s['focusedAt'], s['seen']), reverse=True)
        return {'connected': bool(live), 'vaults': [{k: v for k, v in s.items() if k not in ('seen', 'focusedAt')} for s in live],
                'activeVaultId': live[0]['vaultId'] if live else None}


def request(vault_id, action, data):
    with LOCK:
        if vault_id not in {v['vaultId'] for v in status()['vaults']}:
            raise ValueError('Obsidian 未连接，请打开知识库并启用上岸鸭 Bridge。')
        if sum(not j['event'].is_set() for j in jobs.values()) >= 10:
            raise ValueError('正在读取笔记，请稍后重试。')
        identifier = uuid.uuid4().hex
        payload = {'id': identifier, 'action': action}
        if action == 'read':
            payload['path'] = safe_path(data.get('path'))
        elif action == 'save':
            content = data.get('content')
            if not isinstance(content, str) or not content.strip() or len(content) > 60000:
                raise ValueError('保存内容必须非空且不超过60000字。')
            payload.update(content=content, title=str(data.get('title') or '产品分析')[:100])
        else:
            raise ValueError('笔记操作无效。')
        job = {'vaultId': vault_id, 'payload': payload, 'event': threading.Event(), 'created': time.monotonic(), 'dispatched': False}
        jobs[identifier] = job
    if not job['event'].wait(20):
        # A timed-out operation is not replayed. It may still complete in Obsidian.
        raise ValueError('Obsidian 尚未返回。保存操作可能仍在执行，请先查看“上岸鸭输出”目录再重试。' if action == 'save' else 'Obsidian 读取超时，请确认知识库仍然打开。')
    result = job['result']
    if result.get('error'):
        raise ValueError(str(result['error'])[:300])
    if action == 'read':
        content = result.get('content')
        if not isinstance(content, str) or not content.strip() or len(content) > 30000:
            raise ValueError('笔记正文为空或超过30000字，请分章节导入。')
        return {'path': payload['path'], 'content': content}
    path = safe_path(result.get('path'))
    if not path.startswith('上岸鸭输出/'):
        raise ValueError('Obsidian 未确认输出文件的位置。')
    return {'saved': True, 'path': path}
