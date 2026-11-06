"""Shared identity, ACL, durable queue, fenced leases and node checkpoints."""
import hashlib
import hmac
import json
import secrets
import time
import uuid
import learning_agent as agent
import team_orchestrator as team

SCHEMA = '''
CREATE TABLE IF NOT EXISTS platform_users(id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL,password TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS platform_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,csrf TEXT,expires REAL);
CREATE TABLE IF NOT EXISTS platform_members(project_id TEXT,user_id TEXT,role TEXT,PRIMARY KEY(project_id,user_id));
CREATE TABLE IF NOT EXISTS platform_runs(id TEXT PRIMARY KEY,project_id TEXT,user_id TEXT,idempotency TEXT,input_hash TEXT,
 input TEXT,status TEXT,lease_token TEXT,lease_until REAL,attempts INTEGER,result TEXT,error TEXT,created REAL,updated REAL,
 UNIQUE(project_id,user_id,idempotency));
CREATE TABLE IF NOT EXISTS platform_run_events(id TEXT PRIMARY KEY,run_id TEXT,node TEXT,status TEXT,body TEXT,created REAL);
CREATE TABLE IF NOT EXISTS platform_checkpoints(run_id TEXT,node TEXT,body TEXT,PRIMARY KEY(run_id,node));
CREATE TABLE IF NOT EXISTS platform_login_attempts(id TEXT PRIMARY KEY,identity TEXT,created REAL);
CREATE TABLE IF NOT EXISTS platform_migrations(source_hash TEXT PRIMARY KEY,body TEXT,created REAL);
'''


def init():
    with team.connection() as c:
        c.executescript(SCHEMA)


def password_hash(password, salt=None):
    if not isinstance(password, str) or len(password) < 12 or len(password) > 256:
        raise ValueError('密码长度需为12至256字符')
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return salt+':'+digest


def add_user(name, password):
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 100:
        raise ValueError('账号名称无效')
    identifier = uuid.uuid4().hex
    with team.connection() as c:
        c.execute('INSERT INTO platform_users VALUES(?,?,?)', (identifier, name.strip(), password_hash(password)))
    return identifier


def login(name, password, remote):
    # Rate limit is durable and shared across worker processes.
    identity = hashlib.sha256((str(remote)+'|'+str(name)).encode()).hexdigest()
    now = time.time()
    with agent.WRITE_LOCK, team.connection() as c:
        c.execute('BEGIN IMMEDIATE')
        count = c.execute('SELECT COUNT(*) AS n FROM platform_login_attempts WHERE identity=? AND created>?', (identity, now-900)).fetchone()['n']
        if count >= 10:
            raise PermissionError('登录尝试过多，请15分钟后重试')
        c.execute('INSERT INTO platform_login_attempts VALUES(?,?,?)', (uuid.uuid4().hex, identity, now))
        row = c.execute('SELECT * FROM platform_users WHERE name=?', (name,)).fetchone()
        # Always run a KDF, even for an unknown account.
        stored = row['password'] if row else ('00'*16+':'+'00'*64)
        try:
            valid = hmac.compare_digest(password_hash(password, stored.split(':')[0]), stored)
        except ValueError:
            valid = False
        if not row or not valid:
            return None
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
        c.execute('INSERT INTO platform_sessions VALUES(?,?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), row['id'], csrf, now+43200))
        c.execute('DELETE FROM platform_login_attempts WHERE identity=?', (identity,))
        return {'token':token, 'csrf':csrf, 'user_id':row['id'], 'name':row['name']}


def session(token):
    with team.connection() as c:
        row = c.execute('SELECT s.user_id,s.csrf,u.name FROM platform_sessions s JOIN platform_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?',
                        (hashlib.sha256(str(token).encode()).hexdigest(), time.time())).fetchone()
    if not row:
        raise PermissionError('请登录')
    return dict(row)


def authorize(project_id, user_id, roles=None):
    with team.connection() as c:
        row = c.execute('SELECT role FROM platform_members WHERE project_id=? AND user_id=?', (project_id, user_id)).fetchone()
    if not row or (roles and row['role'] not in roles):
        raise PermissionError('无权访问或操作该项目')
    return row['role']


def member(project_id, user_id, role):
    if role not in ('owner', 'executor', 'reviewer', 'viewer'):
        raise ValueError('项目角色无效')
    with team.connection() as c:
        if not c.execute('SELECT id FROM platform_users WHERE id=?', (user_id,)).fetchone():
            raise ValueError('账号不存在')
        c.execute('INSERT INTO platform_members VALUES(?,?,?) ON CONFLICT(project_id,user_id) DO UPDATE SET role=excluded.role', (project_id,user_id,role))


def enqueue(project, user_id, key, query, metadata=None):
    if not isinstance(key, str) or not 8 <= len(key) <= 160:
        raise ValueError('Idempotency-Key需为8至160字符')
    if not isinstance(query, str) or not 1 <= len(query.strip()) <= 2000:
        raise ValueError('请填写1至2000字符的诊断问题')
    value = {'project_id':project['project_id'], 'expected_version':project['version'], 'query':query.strip(), **(metadata or {})}
    body = agent.dump(value)
    digest = hashlib.sha256(body.encode()).hexdigest()
    now = time.time(); run_id = uuid.uuid4().hex
    with agent.WRITE_LOCK, team.connection() as c:
        c.execute('BEGIN IMMEDIATE')
        existing = c.execute('SELECT id,input_hash FROM platform_runs WHERE project_id=? AND user_id=? AND idempotency=?', (project['project_id'],user_id,key)).fetchone()
        if existing:
            if existing['input_hash'] != digest:
                raise team.Conflict('同一幂等键对应了不同输入')
            return existing['id']
        c.execute('INSERT INTO platform_runs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (run_id,project['project_id'],user_id,key,digest,body,'queued','',0,0,'{}','',now,now))
    return run_id


def event(run_id, node, status, body):
    with team.connection() as c:
        c.execute('INSERT INTO platform_run_events VALUES(?,?,?,?,?,?)',
                   (uuid.uuid4().hex,run_id,node,status,agent.dump(body),time.time()))
    try:
        import os
        if os.getenv('SHANGAN_REDIS_URL'):
            import redis
            redis.Redis.from_url(os.environ['SHANGAN_REDIS_URL'], socket_timeout=1, socket_connect_timeout=1).publish('shangan:run:'+run_id, agent.dump({'node':node,'status':status}))
    except Exception:
        pass


def get_run(run_id, user_id=None):
    with team.connection() as c:
        row = c.execute('SELECT * FROM platform_runs WHERE id=?', (run_id,)).fetchone()
        if not row:
            raise ValueError('运行不存在')
        if user_id:
            authorize(row['project_id'], user_id)
        result = dict(row)
        result.pop('lease_token', None)
        result['input'] = json.loads(result['input'])
        result['result'] = json.loads(result['result'])
        result['events'] = [{**dict(r), 'body':json.loads(r['body'])} for r in c.execute('SELECT node,status,body,created FROM platform_run_events WHERE run_id=? ORDER BY created,id', (run_id,))]
    return result



def list_project_runs(project_id, limit=20):
    """List recent run receipts for the active project; never expose raw prompts or lease tokens."""
    if not isinstance(project_id, str) or not project_id:
        raise ValueError("项目ID无效")
    if type(limit) is not int or not 1 <= limit <= 50:
        raise ValueError("limit 必须在1至50之间")
    with team.connection() as c:
        rows = c.execute(
            "SELECT id,status,result,error,created,updated,input FROM platform_runs "
            "WHERE project_id=? ORDER BY updated DESC LIMIT ?",
            (project_id, limit),
        ).fetchall()
    runs = []
    for row in rows:
        source = json.loads(row["input"] or "{}")
        runs.append({
            "id": row["id"], "status": row["status"],
            "result": json.loads(row["result"] or "{}"),
            "error": row["error"], "created": row["created"], "updated": row["updated"],
            "event_type": source.get("event_type"),
        })
    return {"runs": runs}


def claim():
    now = time.time()
    with agent.WRITE_LOCK, team.connection() as c:
        c.execute('BEGIN IMMEDIATE')
        c.execute("UPDATE platform_runs SET status='cancelled',updated=? WHERE status='cancelling' AND lease_until<?", (now,now))
        c.execute("UPDATE platform_runs SET status='failed',error='RETRY_LIMIT',updated=? WHERE status='running' AND lease_until<? AND attempts>=3", (now,now))
        row = c.execute("SELECT * FROM platform_runs WHERE status='queued' OR (status='running' AND lease_until<? AND attempts<3) ORDER BY created LIMIT 1", (now,)).fetchone()
        if not row:
            return None
        token = secrets.token_hex(16)
        c.execute("UPDATE platform_runs SET status='running',lease_token=?,lease_until=?,attempts=attempts+1,updated=? WHERE id=?", (token,now+90,now,row['id']))
        return {**dict(row), 'lease_token':token}


def lease(run_id, token):
    now = time.time()
    with team.connection() as c:
        cursor = c.execute("UPDATE platform_runs SET lease_until=?,updated=? WHERE id=? AND lease_token=? AND status='running' AND lease_until>?", (now+90,now,run_id,token,now))
        if cursor.rowcount != 1:
            raise RuntimeError('LEASE_LOST_OR_CANCELLED')


def checkpoint(run_id, token, node, body):
    with agent.WRITE_LOCK, team.connection() as c:
        c.execute('BEGIN IMMEDIATE')
        row = c.execute('SELECT status,lease_token,lease_until FROM platform_runs WHERE id=?', (run_id,)).fetchone()
        if not row or row['status'] != 'running' or row['lease_token'] != token or row['lease_until'] < time.time():
            raise RuntimeError('LEASE_LOST_OR_CANCELLED')
        c.execute('INSERT INTO platform_checkpoints VALUES(?,?,?) ON CONFLICT(run_id,node) DO NOTHING', (run_id,node,agent.dump(body)))


def cached_node(run_id, node):
    with team.connection() as c:
        row = c.execute('SELECT body FROM platform_checkpoints WHERE run_id=? AND node=?', (run_id,node)).fetchone()
    return json.loads(row['body']) if row else None


def finish(run_id, token, status, result=None, error=''):
    with team.connection() as c:
        c.execute("UPDATE platform_runs SET status=?,result=?,error=?,updated=? WHERE id=? AND lease_token=? AND status='running' AND lease_until>?",
                  (status,agent.dump(result or {}),error,time.time(),run_id,token,time.time()))
        c.execute("UPDATE platform_runs SET status='cancelled',updated=? WHERE id=? AND lease_token=? AND status='cancelling'", (time.time(),run_id,token))


def cancel(run_id):
    with team.connection() as c:
        c.execute("UPDATE platform_runs SET status=CASE WHEN status='queued' THEN 'cancelled' ELSE 'cancelling' END,updated=? WHERE id=? AND status IN ('queued','running')", (time.time(),run_id))
