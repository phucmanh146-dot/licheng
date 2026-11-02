"""One durable material pool for the existing local workbench.

Account keys partition this single-user desktop service; they are not cloud auth.
Only explicitly imported, non-empty bodies enter the pool. No model keys here.
"""
import hashlib
import json
import uuid
import growth_pipeline as flow

SOURCES = {'obsidian', 'wechat', 'web', 'manual'}
META = {'vault', 'vaultId', 'notePath', 'groupName', 'messageTime', 'sender', 'url', 'readStatus'}


def setup():
    with flow.connect() as db:
        db.execute('''CREATE TABLE IF NOT EXISTS materials (
            id TEXT PRIMARY KEY, account TEXT NOT NULL, fingerprint TEXT NOT NULL,
            body TEXT NOT NULL, imported TEXT NOT NULL, UNIQUE(account,fingerprint))''')


def listing(account):
    setup()
    with flow.connect() as db:
        rows = db.execute('SELECT body FROM materials WHERE account=? ORDER BY imported DESC,id', (flow.account(account),))
        return {'materials': [json.loads(row['body']) for row in rows]}


def normalize(raw):
    if not isinstance(raw, dict):
        raise ValueError('资料格式不正确。')
    source = raw.get('source', 'manual')
    if source not in SOURCES:
        raise ValueError('资料来源不支持。')
    content = raw.get('content', raw.get('text', ''))
    if not isinstance(content, str) or not content.strip():
        raise ValueError('尚未读取到正文，不能把空内容当成资料。')
    content = content.strip()
    if len(content) > 30000:
        raise ValueError('每份正文最多30000字，请分章节导入。')
    reference = str(raw.get('sourceRef') or '')[:2000]
    if source == 'web' and (content == reference or raw.get('thin')):
        raise ValueError('只取得链接或摘要，请补充原文后再导入。')
    metadata = raw.get('metadata') or {}
    if not isinstance(metadata, dict):
        raise ValueError('资料来源信息不正确。')
    return {'id': uuid.uuid4().hex, 'source': source,
            'title': flow.text(raw.get('title') or '未命名资料', 180), 'content': content,
            'sourceRef': reference, 'importedAt': flow.now(), 'selected': True,
            'fingerprint': hashlib.sha256(json.dumps([source, reference, content], ensure_ascii=False).encode()).hexdigest(),
            'metadata': {k: flow.text(v, 2000) for k, v in metadata.items() if k in META}}


def add(account, items):
    if not isinstance(items, list) or not 1 <= len(items) <= 100:
        raise ValueError('一次请导入1到100份正文资料。')
    normalized = [normalize(item) for item in items]
    acct = flow.account(account)
    setup()
    added, existing = [], []
    with flow.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        count = db.execute('SELECT COUNT(*) FROM materials WHERE account=?', (acct,)).fetchone()[0]
        for body in normalized:
            row = db.execute('SELECT body FROM materials WHERE account=? AND fingerprint=?', (acct, body['fingerprint'])).fetchone()
            if row:
                kept = json.loads(row['body'])
                kept['selected'] = True
                db.execute('UPDATE materials SET body=? WHERE id=? AND account=?', (flow.encode(kept), kept['id'], acct))
                existing.append(kept['id'])
                continue
            if count >= 200:
                raise ValueError('资料池已达200份，请移除不再使用的资料后导入。')
            db.execute('INSERT INTO materials VALUES(?,?,?,?,?)', (body['id'], acct, body['fingerprint'], flow.encode(body), body['importedAt']))
            count += 1
            added.append(body['id'])
    return {**listing(account), 'addedIds': added, 'existingIds': existing}


def change(data):
    acct, identifier = flow.account(data.get('account')), str(data.get('id', ''))
    setup()
    with flow.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT body FROM materials WHERE account=? AND id=?', (acct, identifier)).fetchone()
        if not row:
            raise ValueError('这份资料已移除或不属于当前资料空间。')
        if data.get('action') == 'remove':
            db.execute('DELETE FROM materials WHERE account=? AND id=?', (acct, identifier))
        elif data.get('action') == 'select' and isinstance(data.get('selected'), bool):
            body = json.loads(row['body'])
            body['selected'] = data['selected']
            db.execute('UPDATE materials SET body=? WHERE account=? AND id=?', (flow.encode(body), acct, identifier))
        else:
            raise ValueError('请选择资料池操作。')
    return listing(data['account'])


def selected(account, ids):
    if not isinstance(ids, list) or len(ids) > 100 or any(not isinstance(i, str) for i in ids):
        raise ValueError('资料选择无效。')
    saved = {m['id']: m for m in listing(account)['materials']}
    if any(i not in saved for i in ids):
        raise ValueError('部分资料已移除，请刷新资料池。')
    return [saved[i] for i in dict.fromkeys(ids)]
