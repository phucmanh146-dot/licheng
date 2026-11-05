"""Authenticated shared FastAPI entry for the existing 上岸鸭 domain services."""
import hashlib
import json
import os
import re
import secrets
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import artifact_store
import artifact_retrieval
import learning_agent as agent
import platform_store as store
import rescue_service
import team_ai
import team_handoff
import team_inputs
import team_orchestrator as team
import team_recovery
import team_revision
import team_runtime
import cloud_hub
import cloud_hub

ROOT = Path(__file__).resolve().parent


@asynccontextmanager
async def lifespan(app):
    if os.getenv('SHANGAN_ENV') == 'production':
        for name in ('SHANGAN_DATABASE_URL','SHANGAN_S3_BUCKET','SHANGAN_ALLOWED_ORIGINS'):
            if not os.getenv(name):
                raise RuntimeError(name+' is required in production')
    if os.getenv('SHANGAN_USE_HERMES') == '1':
        from hermes_gateway import connect_local_gateway
        if not connect_local_gateway():
            raise RuntimeError('HERMES_CONNECTION_FAILED')
    store.init()
    cloud_hub.init()
    team_ai.bind()
    yield


app = FastAPI(title='上岸鸭共享科研Agent', lifespan=lifespan)
origins = [x.strip().rstrip('/') for x in os.getenv('SHANGAN_ALLOWED_ORIGINS','').split(',') if x.strip()]
if '*' in origins:
    raise RuntimeError('Credentialed API requires explicit origins')
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_origin_regex=r'^chrome-extension://[a-p]{32}


@app.middleware('http')
async def boundary(request, call_next):
    if request.method == 'POST':
        origin = request.headers.get('origin')
        same = str(request.base_url).rstrip('/')
        extension_origin = bool(origin and re.fullmatch(r'chrome-extension://[a-p]{32}', origin))
        if origin and origin not in origins+[same] and not extension_origin:
            return JSONResponse({'error':'来源未授权'}, status_code=403)
        content = bytearray()
        async for chunk in request.stream():
            content.extend(chunk)
            if len(content) > 3_000_000:
                return JSONResponse({'error':'请求超过3MB，请拆分材料'}, status_code=413)
        request._body = bytes(content)
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' "+' '.join(origins)+"; frame-ancestors 'none'; base-uri 'none'"
    return response


@app.exception_handler(team.Conflict)
async def conflict(request, exc):
    return JSONResponse({'error':str(exc), 'code':'VERSION_CONFLICT'}, status_code=409)


@app.exception_handler(ValueError)
async def invalid(request, exc):
    return JSONResponse({'error':str(exc)}, status_code=400)


@app.exception_handler(PermissionError)
async def forbidden(request, exc):
    return JSONResponse({'error':str(exc)}, status_code=403)


@app.exception_handler(Exception)
async def unavailable(request, exc):
    return JSONResponse({'error':'服务暂不可用，请查看运行记录或检查服务配置', 'code':type(exc).__name__}, status_code=503)


def identity(request):
    value = store.session(request.cookies.get('shangan_session', ''))
    if request.method != 'GET' and not secrets.compare_digest(request.headers.get('x-csrf-token', ''), value['csrf']):
        raise PermissionError('会话校验失败，请刷新后重试')
    return value


def access(request, project_id, roles=None):
    user = identity(request)
    store.authorize(project_id, user['user_id'], roles)
    return user


@app.post('/api/v1/login')
def login(request: Request, data: dict):
    user = store.login(data.get('name',''), data.get('password',''), request.client.host if request.client else '')
    if user is None:
        raise PermissionError('账号或密码错误')
    token = user.pop('token')
    response = JSONResponse(user)
    response.set_cookie('shangan_session', token, httponly=True, secure=os.getenv('SHANGAN_ENV')=='production',
                        samesite='lax', max_age=43200, path='/')
    return response


@app.get('/api/v1/me')
def me(request: Request):
    return identity(request)


@app.post('/api/v1/logout')
def logout(request: Request):
    identity(request)
    token_hash = hashlib.sha256(request.cookies.get('shangan_session','').encode()).hexdigest()
    with team.connection() as c:
        c.execute('DELETE FROM platform_sessions WHERE token_hash=?', (token_hash,))
    response = JSONResponse({'ok':True}); response.delete_cookie('shangan_session')
    return response


@app.get('/api/v1/health')
def health(request: Request):
    identity(request)
    cfg = rescue_service.public_config()
    with team.connection() as c:
        c.execute('SELECT 1')
    return {'database':'postgresql' if os.getenv('SHANGAN_DATABASE_URL') else 'sqlite_local',
            'model_configured':cfg['configured'], 'model_verified':cfg['verified'],
            'embedding_configured':bool(os.getenv('SHANGAN_OLLAMA_URL')),
            'vector_configured':bool(os.getenv('SHANGAN_QDRANT_URL') or os.getenv('SHANGAN_QDRANT_PATH')),
            'object_storage_configured':bool(os.getenv('SHANGAN_S3_BUCKET')),
            'redis_configured':bool(os.getenv('SHANGAN_REDIS_URL')),
            'note':'configured只表示配置存在；真实可用性以运行轨迹与验收记录为准'}


@app.get('/api/v1/projects')
def projects(request: Request):
    user = identity(request)
    with team.connection() as c:
        rows = c.execute('SELECT project_id,role FROM platform_members WHERE user_id=?', (user['user_id'],)).fetchall()
    return {'projects':[{**team.state(r['project_id']), 'my_role':r['role']} for r in rows]}


@app.post('/api/v1/projects')
def create(request: Request, data: dict):
    user = identity(request)
    p = team.create({'goal':data.get('goal'), 'mode':'live'})
    store.member(p['project_id'], user['user_id'], 'owner')
    return p


@app.get('/api/v1/projects/{pid}')
def project(request: Request, pid: str):
    access(request,pid)
    return team.state(pid)


@app.get('/api/v1/projects/{pid}/members')
def members(request: Request, pid: str):
    access(request,pid)
    with team.connection() as c:
        return {'members':[dict(r) for r in c.execute('SELECT u.id,u.name,m.role FROM platform_members m JOIN platform_users u ON u.id=m.user_id WHERE m.project_id=?', (pid,))]}


@app.post('/api/v1/projects/{pid}/members')
def grant(request: Request, pid: str, data: dict):
    user = access(request,pid,('owner',))
    team.current({**data,'project_id':pid})
    if data.get('user_id') == user['user_id']:
        raise ValueError('不能从这里更改自己的所有者权限')
    store.member(pid, data.get('user_id'), data.get('role'))
    store.event('acl:'+pid, 'membership', 'changed', {'actor':user['user_id'], 'member':data.get('user_id'), 'role':data.get('role')})
    return {'ok':True}


HANDLERS = {'context':team_inputs.save_context, 'member':team_inputs.save_member,
            'artifact-import':artifact_store.import_file, 'apply':team.apply,
            'feedback':team.feedback, 'review-receive':team_handoff.receive_review,
            'recovery-pause':team_recovery.pause, 'recovery-condition':team_recovery.signal,
            'recovery-resume':team_recovery.resume, 'recovery-attempt':team_recovery.attempt,
            'advance-review':team_revision.advance, 'runtime-focus':team_runtime.focus,
            'capability':team_inputs.record_capability}


@app.post('/api/v1/projects/{pid}/operations/{operation}')
def operation(request: Request, pid: str, operation: str, data: dict):
    if operation not in HANDLERS:
        raise HTTPException(404, '接口不存在')
    roles = ('owner','reviewer') if operation in ('review-receive','advance-review') or (operation=='feedback' and data.get('action') in ('approve','reject')) else ('owner','executor')
    if operation == 'member':
        roles = ('owner','executor','reviewer')
    user = access(request,pid,roles)
    value = {**data, 'project_id':pid}
    if operation == 'capability':
        value['member_id'] = user['user_id']
    if operation.startswith('recovery-'):
        p = team.current(value)
        if value.get('checkpoint_id'):
            records = p.get('recovery',{}).get('checkpoints',[])
            checkpoint = next((r for r in records if r.get('checkpoint_id') == value['checkpoint_id']), {})
            task_id = checkpoint.get('task_id')
        else:
            task_id = value.get('task_id')
        task = next((t for t in (p['plan'] or {}).get('tasks',[]) if t['task_id'] == task_id), None)
        if not task or user['user_id'] not in task['owner_ids']:
            raise PermissionError('只有任务执行者可以更改恢复现场')
    if operation == 'member':
        row = dict(value.get('member', {}))
        row['member_id'] = user['user_id']; row['name'] = user['name']
        value['member'] = row
    if operation == 'feedback':
        action = value.get('action')
        p = team.current(value)
        task = next((t for t in (p['plan'] or {}).get('tasks',[]) if t['task_id'] == value.get('task_id')), None)
        if action in ('approve','reject'):
            store.authorize(pid,user['user_id'],('owner','reviewer'))
            value['reviewer_id'] = user['user_id']
        else:
            if not task or user['user_id'] not in task['owner_ids']:
                raise PermissionError('只有任务执行者可以更新执行状态')
            value['executor_ids'] = [user['user_id']]
    if operation == 'review-receive':
        review = dict(value.get('review',{}))
        review['reviewer_id'] = user['user_id']; review['method'] = 'manual'
        value['review'] = review
    result = HANDLERS[operation](value)
    store.event('project:'+pid, operation, 'completed', {'actor':user['user_id'], 'version':result.get('version')})
    return result


@app.get('/api/v1/projects/{pid}/artifacts/{aid}/{version}')
def artifact(request: Request, pid: str, aid: str, version: int):
    access(request,pid)
    return artifact_store.read(team.state(pid),aid,version)


@app.post('/api/v1/projects/{pid}/retrieve')
def retrieve(request: Request, pid: str, data: dict):
    access(request,pid)
    return artifact_retrieval.retrieve({**data,'project_id':pid})


@app.get('/api/v1/projects/{pid}/runs')
def project_runs(request: Request, pid: str):
    access(request,pid)
    with team.connection() as c:
        return {'runs':[dict(row) for row in c.execute('SELECT id,status,error,created,updated FROM platform_runs WHERE project_id=? ORDER BY created DESC LIMIT 30',(pid,))]}


@app.post('/api/v1/projects/{pid}/runs', status_code=202)
def submit(request: Request, pid: str, data: dict):
    user = access(request,pid,('owner','executor'))
    p = team.current({**data,'project_id':pid})
    run_id = store.enqueue(p,user['user_id'],request.headers.get('idempotency-key'),data.get('query'))
    return {'run_id':run_id}


@app.get('/api/v1/runs/{run_id}')
def run(request: Request, run_id: str):
    user = identity(request)
    return store.get_run(run_id,user['user_id'])


@app.post('/api/v1/runs/{run_id}/cancel')
def cancel(request: Request, run_id: str):
    user = identity(request); run = store.get_run(run_id,user['user_id'])
    store.authorize(run['project_id'],user['user_id'],('owner','executor'))
    store.cancel(run_id)
    return store.get_run(run_id,user['user_id'])


@app.post('/api/v1/runs/{run_id}/accept')
def accept(request: Request, run_id: str, data: dict):
    user = identity(request); run = store.get_run(run_id,user['user_id'])
    store.authorize(run['project_id'],user['user_id'],('owner',))
    if run['status'] != 'awaiting_confirmation' or data.get('confirmed') is not True:
        raise ValueError('请先核对成功运行结果并明确确认')
    snapshot = team.state(run['project_id'])
    if run_id in snapshot.get('accepted_agent_runs', []):
        return snapshot
    ctx = {'project_id':run['project_id'], 'expected_version':data.get('expected_version')}
    if ctx['expected_version'] != run['input']['expected_version']:
        raise team.Conflict('运行依据已过期，请重新运行')
    p = team.diagnosis({**ctx,'diagnosis':run['result']['diagnosis']}, persist=False)
    p = team.propose({**ctx,'plan':run['result']['plan'],'reason':'用户确认Agent候选，计划仍需采用'}, prepared_project=p, persist=False)
    p.setdefault('accepted_agent_runs',[]).append(run_id)
    return team.commit(p,p['version'],'确认Agent诊断及计划预览；尚未采用计划')


@app.get('/healthz')
def public_healthz():
    return cloud_hub.health()


@app.get('/hub')
def cloud_hub_page():
    return FileResponse(ROOT/'cloud-hub.html')


@app.get('/api/v1/hub/health')
def hub_health(request: Request):
    cloud_hub.require_token(request)
    return cloud_hub.health()


@app.get('/api/v1/hub/dashboard')
def hub_dashboard(request: Request):
    cloud_hub.require_token(request)
    return cloud_hub.dashboard()


@app.post('/api/v1/hub/tasks', status_code=202)
def hub_submit_task(request: Request, data: dict):
    cloud_hub.require_token(request, 'chatgpt')
    return cloud_hub.submit_task(data, source='chatgpt')


@app.post('/api/v1/hub/tasks/claim')
def hub_claim_task(request: Request, data: dict):
    cloud_hub.require_token(request, 'chatgpt')
    return cloud_hub.claim_task(data)


@app.get('/api/v1/hub/tasks/{task_id}')
def hub_task_status(request: Request, task_id: str):
    cloud_hub.require_token(request, 'chatgpt')
    return cloud_hub.task_status(task_id)


@app.post('/api/v1/hub/tasks/{task_id}/complete')
def hub_complete_task(request: Request, task_id: str, data: dict):
    cloud_hub.require_token(request, 'chatgpt')
    return cloud_hub.complete_task(task_id, data)


@app.post('/api/v1/hub/evidence')
def hub_capture_evidence(request: Request, data: dict):
    cloud_hub.require_token(request, 'bridge')
    return cloud_hub.capture_evidence(data)


@app.post('/api/v1/hub/approvals/{approval_id}/decision')
def hub_decide_approval(request: Request, approval_id: str, data: dict):
    cloud_hub.require_token(request, 'bridge')
    return cloud_hub.decide_approval(approval_id, data)


@app.get('/api/v1/hub/decisions')
def hub_list_decisions(request: Request):
    cloud_hub.require_token(request, 'chatgpt')
    return cloud_hub.list_decisions()


@app.post('/api/v1/hub/decisions')
def hub_record_decision(request: Request, data: dict):
    cloud_hub.require_token(request, 'bridge')
    return cloud_hub.record_decision(data)


@app.post('/api/v1/hub/feedback')
def hub_add_feedback(request: Request, data: dict):
    cloud_hub.require_token(request, 'bridge')
    return cloud_hub.add_feedback(data)


@app.post('/api/v1/hub/feedback/{feedback_id}/decision')
def hub_decide_feedback(request: Request, feedback_id: str, data: dict):
    cloud_hub.require_token(request, 'bridge')
    return cloud_hub.decide_feedback(feedback_id, data)


@app.get('/')
def index():
    return FileResponse(ROOT/'visual-workflow'/'shared-workbench.html')


@app.get('/assets/{name}')
def asset(name: str):
    allowed = {'shared-workbench.js','shared-workbench.css','style.css','cloud-hub.js'}
    if name not in allowed:
        raise HTTPException(404)
    return FileResponse(ROOT/'visual-workflow'/name)
, allow_credentials=True,
                   allow_methods=['GET','POST'], allow_headers=['Content-Type','X-CSRF-Token','Idempotency-Key','Authorization','X-SY-Platform-Token'])


@app.middleware('http')
async def boundary(request, call_next):
    if request.method == 'POST':
        origin = request.headers.get('origin')
        same = str(request.base_url).rstrip('/')
        extension_origin = bool(origin and re.fullmatch(r'chrome-extension://[a-p]{32}', origin))
        if origin and origin not in origins+[same] and not extension_origin:
            return JSONResponse({'error':'来源未授权'}, status_code=403)
        content = bytearray()
        async for chunk in request.stream():
            content.extend(chunk)
            if len(content) > 3_000_000:
                return JSONResponse({'error':'请求超过3MB，请拆分材料'}, status_code=413)
        request._body = bytes(content)
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' "+' '.join(origins)+"; frame-ancestors 'none'; base-uri 'none'"
    return response


@app.exception_handler(team.Conflict)
async def conflict(request, exc):
    return JSONResponse({'error':str(exc), 'code':'VERSION_CONFLICT'}, status_code=409)


@app.exception_handler(ValueError)
async def invalid(request, exc):
    return JSONResponse({'error':str(exc)}, status_code=400)


@app.exception_handler(PermissionError)
async def forbidden(request, exc):
    return JSONResponse({'error':str(exc)}, status_code=403)


@app.exception_handler(Exception)
async def unavailable(request, exc):
    return JSONResponse({'error':'服务暂不可用，请查看运行记录或检查服务配置', 'code':type(exc).__name__}, status_code=503)


def identity(request):
    value = store.session(request.cookies.get('shangan_session', ''))
    if request.method != 'GET' and not secrets.compare_digest(request.headers.get('x-csrf-token', ''), value['csrf']):
        raise PermissionError('会话校验失败，请刷新后重试')
    return value


def access(request, project_id, roles=None):
    user = identity(request)
    store.authorize(project_id, user['user_id'], roles)
    return user


@app.post('/api/v1/login')
def login(request: Request, data: dict):
    user = store.login(data.get('name',''), data.get('password',''), request.client.host if request.client else '')
    if user is None:
        raise PermissionError('账号或密码错误')
    token = user.pop('token')
    response = JSONResponse(user)
    response.set_cookie('shangan_session', token, httponly=True, secure=os.getenv('SHANGAN_ENV')=='production',
                        samesite='lax', max_age=43200, path='/')
    return response


@app.get('/api/v1/me')
def me(request: Request):
    return identity(request)


@app.post('/api/v1/logout')
def logout(request: Request):
    identity(request)
    token_hash = hashlib.sha256(request.cookies.get('shangan_session','').encode()).hexdigest()
    with team.connection() as c:
        c.execute('DELETE FROM platform_sessions WHERE token_hash=?', (token_hash,))
    response = JSONResponse({'ok':True}); response.delete_cookie('shangan_session')
    return response


@app.get('/api/v1/health')
def health(request: Request):
    identity(request)
    cfg = rescue_service.public_config()
    with team.connection() as c:
        c.execute('SELECT 1')
    return {'database':'postgresql' if os.getenv('SHANGAN_DATABASE_URL') else 'sqlite_local',
            'model_configured':cfg['configured'], 'model_verified':cfg['verified'],
            'embedding_configured':bool(os.getenv('SHANGAN_OLLAMA_URL')),
            'vector_configured':bool(os.getenv('SHANGAN_QDRANT_URL') or os.getenv('SHANGAN_QDRANT_PATH')),
            'object_storage_configured':bool(os.getenv('SHANGAN_S3_BUCKET')),
            'redis_configured':bool(os.getenv('SHANGAN_REDIS_URL')),
            'note':'configured只表示配置存在；真实可用性以运行轨迹与验收记录为准'}


@app.get('/api/v1/projects')
def projects(request: Request):
    user = identity(request)
    with team.connection() as c:
        rows = c.execute('SELECT project_id,role FROM platform_members WHERE user_id=?', (user['user_id'],)).fetchall()
    return {'projects':[{**team.state(r['project_id']), 'my_role':r['role']} for r in rows]}


@app.post('/api/v1/projects')
def create(request: Request, data: dict):
    user = identity(request)
    p = team.create({'goal':data.get('goal'), 'mode':'live'})
    store.member(p['project_id'], user['user_id'], 'owner')
    return p


@app.get('/api/v1/projects/{pid}')
def project(request: Request, pid: str):
    access(request,pid)
    return team.state(pid)


@app.get('/api/v1/projects/{pid}/members')
def members(request: Request, pid: str):
    access(request,pid)
    with team.connection() as c:
        return {'members':[dict(r) for r in c.execute('SELECT u.id,u.name,m.role FROM platform_members m JOIN platform_users u ON u.id=m.user_id WHERE m.project_id=?', (pid,))]}


@app.post('/api/v1/projects/{pid}/members')
def grant(request: Request, pid: str, data: dict):
    user = access(request,pid,('owner',))
    team.current({**data,'project_id':pid})
    if data.get('user_id') == user['user_id']:
        raise ValueError('不能从这里更改自己的所有者权限')
    store.member(pid, data.get('user_id'), data.get('role'))
    store.event('acl:'+pid, 'membership', 'changed', {'actor':user['user_id'], 'member':data.get('user_id'), 'role':data.get('role')})
    return {'ok':True}


HANDLERS = {'context':team_inputs.save_context, 'member':team_inputs.save_member,
            'artifact-import':artifact_store.import_file, 'apply':team.apply,
            'feedback':team.feedback, 'review-receive':team_handoff.receive_review,
            'recovery-pause':team_recovery.pause, 'recovery-condition':team_recovery.signal,
            'recovery-resume':team_recovery.resume, 'recovery-attempt':team_recovery.attempt,
            'advance-review':team_revision.advance, 'runtime-focus':team_runtime.focus,
            'capability':team_inputs.record_capability}


@app.post('/api/v1/projects/{pid}/operations/{operation}')
def operation(request: Request, pid: str, operation: str, data: dict):
    if operation not in HANDLERS:
        raise HTTPException(404, '接口不存在')
    roles = ('owner','reviewer') if operation in ('review-receive','advance-review') or (operation=='feedback' and data.get('action') in ('approve','reject')) else ('owner','executor')
    if operation == 'member':
        roles = ('owner','executor','reviewer')
    user = access(request,pid,roles)
    value = {**data, 'project_id':pid}
    if operation == 'capability':
        value['member_id'] = user['user_id']
    if operation.startswith('recovery-'):
        p = team.current(value)
        if value.get('checkpoint_id'):
            records = p.get('recovery',{}).get('checkpoints',[])
            checkpoint = next((r for r in records if r.get('checkpoint_id') == value['checkpoint_id']), {})
            task_id = checkpoint.get('task_id')
        else:
            task_id = value.get('task_id')
        task = next((t for t in (p['plan'] or {}).get('tasks',[]) if t['task_id'] == task_id), None)
        if not task or user['user_id'] not in task['owner_ids']:
            raise PermissionError('只有任务执行者可以更改恢复现场')
    if operation == 'member':
        row = dict(value.get('member', {}))
        row['member_id'] = user['user_id']; row['name'] = user['name']
        value['member'] = row
    if operation == 'feedback':
        action = value.get('action')
        p = team.current(value)
        task = next((t for t in (p['plan'] or {}).get('tasks',[]) if t['task_id'] == value.get('task_id')), None)
        if action in ('approve','reject'):
            store.authorize(pid,user['user_id'],('owner','reviewer'))
            value['reviewer_id'] = user['user_id']
        else:
            if not task or user['user_id'] not in task['owner_ids']:
                raise PermissionError('只有任务执行者可以更新执行状态')
            value['executor_ids'] = [user['user_id']]
    if operation == 'review-receive':
        review = dict(value.get('review',{}))
        review['reviewer_id'] = user['user_id']; review['method'] = 'manual'
        value['review'] = review
    result = HANDLERS[operation](value)
    store.event('project:'+pid, operation, 'completed', {'actor':user['user_id'], 'version':result.get('version')})
    return result


@app.get('/api/v1/projects/{pid}/artifacts/{aid}/{version}')
def artifact(request: Request, pid: str, aid: str, version: int):
    access(request,pid)
    return artifact_store.read(team.state(pid),aid,version)


@app.post('/api/v1/projects/{pid}/retrieve')
def retrieve(request: Request, pid: str, data: dict):
    access(request,pid)
    return artifact_retrieval.retrieve({**data,'project_id':pid})


@app.get('/api/v1/projects/{pid}/runs')
def project_runs(request: Request, pid: str):
    access(request,pid)
    with team.connection() as c:
        return {'runs':[dict(row) for row in c.execute('SELECT id,status,error,created,updated FROM platform_runs WHERE project_id=? ORDER BY created DESC LIMIT 30',(pid,))]}


@app.post('/api/v1/projects/{pid}/runs', status_code=202)
def submit(request: Request, pid: str, data: dict):
    user = access(request,pid,('owner','executor'))
    p = team.current({**data,'project_id':pid})
    run_id = store.enqueue(p,user['user_id'],request.headers.get('idempotency-key'),data.get('query'))
    return {'run_id':run_id}


@app.get('/api/v1/runs/{run_id}')
def run(request: Request, run_id: str):
    user = identity(request)
    return store.get_run(run_id,user['user_id'])


@app.post('/api/v1/runs/{run_id}/cancel')
def cancel(request: Request, run_id: str):
    user = identity(request); run = store.get_run(run_id,user['user_id'])
    store.authorize(run['project_id'],user['user_id'],('owner','executor'))
    store.cancel(run_id)
    return store.get_run(run_id,user['user_id'])


@app.post('/api/v1/runs/{run_id}/accept')
def accept(request: Request, run_id: str, data: dict):
    user = identity(request); run = store.get_run(run_id,user['user_id'])
    store.authorize(run['project_id'],user['user_id'],('owner',))
    if run['status'] != 'awaiting_confirmation' or data.get('confirmed') is not True:
        raise ValueError('请先核对成功运行结果并明确确认')
    snapshot = team.state(run['project_id'])
    if run_id in snapshot.get('accepted_agent_runs', []):
        return snapshot
    ctx = {'project_id':run['project_id'], 'expected_version':data.get('expected_version')}
    if ctx['expected_version'] != run['input']['expected_version']:
        raise team.Conflict('运行依据已过期，请重新运行')
    p = team.diagnosis({**ctx,'diagnosis':run['result']['diagnosis']}, persist=False)
    p = team.propose({**ctx,'plan':run['result']['plan'],'reason':'用户确认Agent候选，计划仍需采用'}, prepared_project=p, persist=False)
    p.setdefault('accepted_agent_runs',[]).append(run_id)
    return team.commit(p,p['version'],'确认Agent诊断及计划预览；尚未采用计划')


@app.get('/')
def index():
    return FileResponse(ROOT/'visual-workflow'/'shared-workbench.html')


@app.get('/assets/{name}')
def asset(name: str):
    allowed = {'shared-workbench.js','shared-workbench.css','style.css'}
    if name not in allowed:
        raise HTTPException(404)
    return FileResponse(ROOT/'visual-workflow'/name)
