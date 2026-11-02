"""Loopback-only research workflow. Human review records are not official scores.

Run: python server.py --workspace <task workspace> --port 9010
Static cloud preview uses browser-local records and does not call this server.
"""
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse,parse_qs,quote
from datetime import datetime,timezone
from contextlib import contextmanager
import argparse,base64,copy,hashlib,json,os,secrets,sqlite3,sys,threading,uuid

HERE=Path(__file__).resolve().parent
LOCK=threading.RLock()
MAX_UPLOAD=20*1024*1024

def now():return datetime.now(timezone.utc).isoformat()
def initial():return {'revision':0,'stage':'clarify','context':{},'criteria':[],'frozen':False,'action':'','history':[],'cycles':[],'submissions':[],'review':None,'checkin_ack':None}
def require_text(data,key,limit=5000):
    val=data.get(key,'')
    if not isinstance(val,str) or not val.strip() or len(val)>limit:raise ValueError('请填写：'+key)
    return val.strip()

def apply_event(old,event,data,project):
    if event.startswith('q_'):
        from quality_loop import transition
        return transition(old,event,data,project,now())
    s=copy.deepcopy(old);detail=''
    if event=='context':
        context={k:require_text(data,k) for k in ('goal','materials','blocker','executor')}
        for k in ('baseline','capability','deadline','output','first_action'):context[k]=str(data.get(k,''))[:5000]
        minutes=data.get('minutes',20)
        if type(minutes)!=int or not 1<=minutes<=720:raise ValueError('可用时间填1至720分钟')
        context['minutes']=minutes
        if context['deadline']:
            dt=datetime.fromisoformat(context['deadline'].replace('Z','+00:00'))
            if dt.tzinfo is None:raise ValueError('截止时间缺少时区')
        if s.get('frozen') and any(context[k]!=s['context'].get(k) for k in ('goal','materials','executor')):
            s['previous_cycle']=copy.deepcopy({k:s.get(k) for k in ('criteria','submissions','review','action')})
            s.update(frozen=False,criteria=[],review=None,submissions=[],action='')
        s['context']=context;s['stage']='gap' if not s['frozen'] else 'action';s['checkin_ack']=None
        s.pop('model_result',None)
        s.pop('personalized_plan',None)
        detail='目标：'+context['goal']+'；现有材料：'+context['materials']+'；卡点：'+context['blocker']
    elif event=='freeze':
        if not s['context']:raise ValueError('先保存目标、材料和卡点')
        criteria=data.get('criteria')
        if not isinstance(criteria,list) or not 1<=len(criteria)<=6 or any(not isinstance(x,str) or not x.strip() for x in criteria):raise ValueError('请填写1至6条可检查的判据')
        if s['frozen'] and criteria!=s['criteria']:
            s.setdefault('cycles',[]).append({k:copy.deepcopy(s.get(k)) for k in ('context','criteria','action','submissions','review')})
            s['submissions']=[];s['action']=''
        s.pop('personalized_plan',None)
        s.update(criteria=criteria,frozen=True,stage='action',review=None);detail='冻结本轮判据：'+'；'.join(criteria)
    elif event=='start':
        if not s['frozen']:raise ValueError('先确认本轮判据')
        s['action']=require_text(data,'action');s['stage']='execute';s['action_origin']=data.get('origin','human_candidate')
        detail='执行者：'+s['context']['executor']+'；首步：'+s['action']
    elif event=='blocked':
        note=require_text(data,'note');kind=data.get('category')
        tips={'method':'只解释当前一个操作，再做一行试做；把不懂的术语和原文位置写下来。',
              'materials':'列出缺的具体附件及可询问的人，保存求助卡；切换到材料齐全的一项。',
              'environment':'保留报错原文、输入、版本和已试方法；只查一个前置条件，仍失败就求助。',
              'scope':'把今天产物缩到一行或一处；如需改变目标/判据，回到目标页重新确认，不自动顺延原截止。'}
        if kind not in tips:raise ValueError('请选择困难类型')
        s['stage']='blocked';s['help']={'category':kind,'note':note,'suggestion':tips[kind]};detail=note+'；调整建议：'+tips[kind]
    elif event=='resume':
        if not s['frozen']:raise ValueError('先确认判据')
        s['stage']='execute';detail='保留上次上下文继续；下一动作：'+s.get('action','')
    elif event=='submit':
        if not s['frozen'] or not s.get('action'):raise ValueError('先选定判据和实际首步')
        upload=data.get('upload')
        if not isinstance(upload,dict) or not upload.get('sha256'):raise ValueError('先上传本人实际修改的小产物')
        if data.get('human_declaration') is not True:raise ValueError('需要确认这是本人实际修改的产物')
        item={'id':uuid.uuid4().hex,'time':now(),'executor':s['context']['executor'],'upload':upload,'explanation':require_text(data,'explanation'),'criteria':copy.deepcopy(s['criteria'])}
        s['submissions'].append(item);s['review']=None;s['stage']='review';detail='本人提交：'+upload['filename']+'；'+item['explanation']
    elif event=='review':
        if not s['submissions'] or s['stage']!='review':raise ValueError('先上传本轮修改产物')
        reviewer=require_text(data,'reviewer');executor=s['submissions'][-1]['executor']
        from task_acceptance import identity as norm
        if norm(reviewer)==norm(executor):raise ValueError('执行者不能复核自己的产物，请换非执行者')
        checks=data.get('checks')
        if not isinstance(checks,list) or len(checks)!=len(s['criteria']):raise ValueError('请逐条复核冻结判据')
        for row in checks:
            if type(row.get('passed'))!=bool:raise ValueError('每项要选择通过或退回')
            require_text(row,'note')
        passed=all(x['passed'] for x in checks)
        s['review']={'reviewer':reviewer,'time':now(),'checks':checks,'passed':passed,'submission_id':s['submissions'][-1]['id'],'scope':'human_record_not_independently_identity_verified'}
        s['stage']='accepted' if passed else 'execute';detail='复核者：'+reviewer+'；'+('本轮小产物通过' if passed else '按原判据退回，只补未通过项')
    elif event=='ack':
        s['checkin_ack']=s['revision'];detail='已询问当前进度；'+require_text(data,'note')
    elif event=='next':
        if s['stage']!='accepted':raise ValueError('本轮复核通过后再开启下一步')
        detail='上一轮完成，进入下一目标；上下文保留在历史记录'
        s.setdefault('cycles',[]).append({k:copy.deepcopy(s.get(k)) for k in ('context','criteria','action','submissions','review')})
        s['cycles'][-1]['reflection']=str(data.get('reflection',''))[:3000]
        s.update(stage='clarify',frozen=False,criteria=[],action='',review=None,submissions=[])
    else:raise ValueError('不支持的操作')
    s['revision']+=1;s['history'].append({'time':now(),'event':event,'detail':detail});s['updated']=now()
    return s

class Store:
    def __init__(self,path):self.path=path;path.parent.mkdir(parents=True,exist_ok=True);self.init()
    @contextmanager
    def connect(self):
        c=sqlite3.connect(self.path)
        try:
            with c:yield c
        finally:c.close()
    def init(self):
        with self.connect() as c:c.execute('CREATE TABLE IF NOT EXISTS workflows(project TEXT PRIMARY KEY,body TEXT)')
    def get(self,pid):
        with self.connect() as c:r=c.execute('SELECT body FROM workflows WHERE project=?',(pid,)).fetchone()
        return json.loads(r[0]) if r else initial()
    def save(self,pid,expected,body):
        with LOCK,self.connect() as c:
            c.execute('BEGIN IMMEDIATE');r=c.execute('SELECT body FROM workflows WHERE project=?',(pid,)).fetchone();old=json.loads(r[0]) if r else initial()
            if old['revision']!=expected:raise ValueError('REVISION_CONFLICT：进度已变化，请刷新，不覆盖新记录')
            c.execute('INSERT OR REPLACE INTO workflows VALUES(?,?)',(pid,json.dumps(body,ensure_ascii=False)))

def handler(workspace,store,seed,token):
    projects={p['id']:p for p in seed['projects']}
    projects['RS']={'id':'RS','name':'科研迷茫起步','scope':'独立试用，不改变原八项目55项'}
    uploads=workspace/'work/workflow-state/uploads';uploads.mkdir(parents=True,exist_ok=True)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def allowed_host(self):
            return self.headers.get('Host') in ('127.0.0.1:'+str(self.server.server_port),'localhost:'+str(self.server.server_port))
        def download(self,file,filename):
            self.send_response(200);self.send_header('Content-Type','application/octet-stream');self.send_header('Content-Length',str(file.stat().st_size));self.send_header('Content-Disposition',"attachment; filename*=UTF-8''"+quote(filename));self.send_header('X-Content-Type-Options','nosniff');self.end_headers()
            try:
                with file.open('rb') as f:
                    while chunk:=f.read(1024*1024):self.wfile.write(chunk)
            except (BrokenPipeError,ConnectionResetError):pass
        def send(self,status,body,ctype='application/json; charset=utf-8',extra=None):
            if not isinstance(body,bytes):body=json.dumps(body,ensure_ascii=False).encode()
            self.send_response(status);self.send_header('Content-Type',ctype);self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff')
            if extra:
                for k,v in extra.items():self.send_header(k,v)
            self.end_headers();self.wfile.write(body)
        def do_GET(self):
            if not self.allowed_host():return self.send(403,{'error':'仅本机入口可用'})
            parsed=urlparse(self.path);path=parsed.path
            if path=='/api/data':return self.send(200,{'seed':seed,'states':{k:store.get(k) for k in projects},'mode':'local','token':token})
            if path=='/api/acceptance':
                from task_acceptance import ledger
                return self.send(200,{'rows':ledger(seed['tasks'],{k:store.get(k) for k in projects},uploads)})
            if path=='/api/submission':
                args=parse_qs(parsed.query);pid=args.get('project',[''])[0];uid=args.get('id',[''])[0]
                if pid not in projects:return self.send(404,{'error':'项目不存在'})
                saved=store.get(pid);candidates=[x['upload'] for x in saved['submissions']]
                for rec in saved.get('acceptance_tasks',{}).values():
                    candidates.extend(rec.get('submission',{}).get('artifacts',{}).values())
                q=saved.get('quality',{})
                if q.get('v1'):candidates.append(q['v1'])
                for k in ('pending_trial','pending_v2','pending_transfer'):
                    if q.get(k):candidates.append(q[k]['upload'])
                for k in ('trials','versions','transfers'):candidates.extend(x['upload'] for x in q.get(k,[]))
                upload=next((x for x in candidates if x['id']==uid),None)
                if not upload:return self.send(404,{'error':'尚未提交此产物'})
                files=list(uploads.glob(pid+'-'+uid+'.*'))
                if len(files)!=1:return self.send(404,{'error':'提交文件不可用'})
                return self.download(files[0],upload['filename'])
            if path=='/api/file':
                args=parse_qs(parsed.query);pid=args.get('project',[''])[0];kind=args.get('kind',[''])[0]
                if pid not in projects or kind not in ('draft','workbook'):return self.send(404,{'error':'文件不存在'})
                manifest=workspace/'outputs/八项目_实际补齐草稿_20261031/修改清单与原件校验.json'
                if not manifest.is_file():return self.send(404,{'error':'本机材料索引尚未配置；预览没有附带私密原作'})
                a=next(x for x in json.loads(manifest.read_text(encoding='utf-8')) if x['project']==projects[pid]['name'])
                file=Path(a['draft_path' if kind=='draft' else 'workbook_path'])
                # The mapping is generated by us, not caller-controlled paths.
                if not file.is_file():return self.send(404,{'error':'本机文件不在当前路径'})
                return self.download(file,file.name)
            files={'/acceptance':'acceptance.html','/acceptance.html':'acceptance.html','/annotations':'annotations.html','/annotations.html':'annotations.html','/original-feature-annotations.json':'original-feature-annotations.json','/':'index.html','/index.html':'index.html','/quality':'quality.html','/quality.html':'quality.html','/quality.js':'quality.js','/starter':'starter.html','/starter.html':'starter.html','/starter.js':'starter.js','/app.js':'app.js','/style.css':'style.css','/data.json':'data.json'}
            if path not in files:return self.send(404,{'error':'不存在'})
            file=HERE/files[path];ctype='text/html; charset=utf-8' if file.suffix=='.html' else 'text/javascript; charset=utf-8' if file.suffix=='.js' else 'text/css; charset=utf-8' if file.suffix=='.css' else 'application/json; charset=utf-8'
            return self.send(200,file.read_bytes(),ctype)
        def do_POST(self):
            try:
                if not self.allowed_host():return self.send(403,{'error':'仅本机入口可用'})
                if self.headers.get('X-Workflow-Token')!=token:return self.send(403,{'error':'请从本工作台打开操作'})
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=MAX_UPLOAD*1.4:return self.send(413,{'error':'小产物限制20MB，请只交一页或一个表'})
                data=json.loads(self.rfile.read(length));pid=data.get('project')
                if pid not in projects:raise ValueError('项目不存在')
                project=projects[pid];old=store.get(pid)
                if data.get('expected_revision')!=old['revision']:raise ValueError('REVISION_CONFLICT：进度已变化，请刷新')
                if self.path=='/api/task-acceptance':
                    from task_acceptance import transition
                    t=next((t for t in seed['tasks'] if t['id']==data.get('task_id')),None)
                    if not t or (t.get('project') or 'RS')!=pid:raise ValueError('任务不属于该项目')
                    new=transition(old,data.get('event'),data.get('payload',{}),t,pid,uploads,now())
                    store.save(pid,old['revision'],new);return self.send(200,{'state':new})
                if self.path=='/api/starter':
                    from research_starter import propose
                    return self.send(200,{'proposal':propose(data.get('payload',{}))})
                if self.path=='/api/quality-plan':
                    if pid=='RS':raise ValueError('请选择八个实际作品之一，此计划针对原项目质量闭环')
                    from quality_plan import build_plan
                    plan=build_plan(project,old,seed['tasks']);new=copy.deepcopy(old)
                    new['personalized_plan']=plan;new['revision']+=1
                    new['history'].append({'time':now(),'event':'quality_plan','detail':'按本轮质量判据、资源和实际反馈分流：'+plan['route']+'；规则候选，未自动认证能力或勾选55项'})
                    store.save(pid,old['revision'],new);return self.send(200,{'state':new})
                if self.path=='/api/upload':
                    filename=Path(require_text(data,'filename',240)).name
                    if Path(filename).suffix.lower() not in ('.png','.jpg','.jpeg','.pdf','.docx','.pptx','.xlsx','.csv','.txt','.md'):raise ValueError('请上传文档、表格或图片')
                    content=base64.b64decode(data.get('data',''),validate=True)
                    if not 0<len(content)<=MAX_UPLOAD:raise ValueError('小产物限制20MB')
                    digest=hashlib.sha256(content).hexdigest();uid=uuid.uuid4().hex
                    target=uploads/(pid+'-'+uid+Path(filename).suffix.lower());target.write_bytes(content)
                    return self.send(200,{'upload':{'id':uid,'filename':filename,'sha256':digest,'bytes':len(content),'project':pid}})
                if self.path=='/api/model':
                    if not old['context']:raise ValueError('先保存本人目标、材料和卡点')
                    code=workspace/'work/current-snapshot/shangan-ya-captain-independent-review-acceptance-20261027/learning-agent'
                    if not code.is_dir():code=HERE.parent
                    if not (code/'team_ai.py').is_file():raise ValueError('本机Agent运行目录尚未配置')
                    os.environ['SHANGAN_AGENT_DATA']=str(workspace/'work/eight-real-live-remediation-final-20261031/state')
                    if str(code) not in sys.path:sys.path.insert(0,str(code))
                    import team_orchestrator as team,team_ai as ai
                    from hermes_gateway import connect_local_gateway
                    if not connect_local_gateway():raise ValueError('真实模型尚未连接；没有使用人工草稿冒充模型结果')
                    p=team.state(project['live_project_id']);ctx=old['context']
                    p['research_companion']={'outcome':ctx['goal'],'materials':ctx['materials'],'blocker':ctx['blocker'],'available_minutes':ctx['minutes'],'today_output':ctx.get('output',''),'deadline':ctx.get('deadline','')}
                    p['project_context']['target_result']=ctx['goal']
                    if old['criteria']:p['project_context']['acceptance_criteria']=old['criteria']
                    for member in p['member_task_briefs']:
                        member['understanding']=ctx.get('capability','未确认')+'；仅本人自述，不认定能力已通过'
                    d=ai.researcher(p)
                    new=copy.deepcopy(old);new['model_result']={'status':'technical_checked_pending_content_review','gaps':d['gaps'],'trace':d['model_trace']};new['revision']+=1
                    new['history'].append({'time':now(),'event':'model','detail':'真实模型返回通过技术校验；仍待原文支持性与可执行性复核，未自动批准首步'})
                    store.save(pid,old['revision'],new);return self.send(200,{'state':new})
                if self.path!='/api/event':return self.send(404,{'error':'不存在'})
                evidence=[]
                q=old.get('quality',{})
                if data.get('event') in ('q_trial_review','q_content_review','q_transfer_review'):
                    evidence.append(q.get('v1'))
                    pending={'q_trial_review':'pending_trial','q_content_review':'pending_v2','q_transfer_review':'pending_transfer'}[data['event']]
                    evidence.append(q.get(pending,{}).get('upload'))
                    if data['event']=='q_transfer_review' and q.get('versions'):evidence.append(q['versions'][-1]['upload'])
                for artifact in filter(None,evidence):
                    uid=artifact.get('id','')
                    candidates=list(uploads.glob(pid+'-'+uid+'.*')) if len(uid)==32 and uid.isalnum() else []
                    if len(candidates)!=1 or hashlib.sha256(candidates[0].read_bytes()).hexdigest()!=artifact.get('sha256'):
                        raise ValueError('验收依据文件缺失或内容已改变，旧验收版本失效；请重新提交确认')
                if data.get('event') in ('submit','q_confirm','q_trial_submit','q_v2_submit','q_transfer_submit'):
                    upload=data.get('payload',{}).get('upload',{});uid=upload.get('id','')
                    matches=list(uploads.glob(pid+'-'+uid+'.*')) if len(uid)==32 and uid.isalnum() else []
                    if len(matches)!=1 or upload.get('project')!=pid or hashlib.sha256(matches[0].read_bytes()).hexdigest()!=upload.get('sha256'):raise ValueError('上传凭证不属于本项目或内容已变化')
                new=apply_event(old,data.get('event'),data.get('payload',{}),project)
                store.save(pid,old['revision'],new);return self.send(200,{'state':new})
            except Exception as exc:
                # No credential values or full stack traces returned to the page.
                return self.send(409 if 'REVISION_CONFLICT' in str(exc) else 400,{'error':str(exc)[:500]})
    return Handler

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--workspace',type=Path,required=True);parser.add_argument('--port',type=int,default=9010);args=parser.parse_args()
    seed=json.loads((HERE/'data.json').read_text(encoding='utf-8'));workspace=args.workspace.resolve()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),handler(workspace,Store(workspace/'work/workflow-state/workflow.sqlite3'),seed,secrets.token_urlsafe(24)))
    print('上岸鸭可视化工作台 http://127.0.0.1:'+str(args.port)+' 仅本机；数据持久保存在本任务目录',flush=True)
    server.serve_forever()

