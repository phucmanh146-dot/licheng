"""Evidence-bound acceptance for the original 55 tasks. No automatic semantic pass."""
import copy,hashlib,json,uuid,unicodedata
def required_text(d,key):
    value=d.get(key)
    if not isinstance(value,str) or not value.strip() or len(value)>5000:raise ValueError('请填写有效文字：'+key)
    return value.strip()
def identity(value):
    value=unicodedata.normalize('NFKC',value).casefold()
    return ''.join(x for x in value if not x.isspace() and unicodedata.category(x)!='Cf')
SOURCE_ONLY={9,19,24,34,39,44}
REVIEWS={12,18,23,28,33,38,43,48,53}
def contract(t):
    roles=['原始依据','修改产物'] if t['id'] in REVIEWS else ['交付产物','执行记录']
    if t['id'] in SOURCE_ONLY:roles=['交付产物']
    if t['id']==55:roles=['对照方案','脱敏原始试用记录','完整结果含失败']
    c={'task_id':t['id'],'requirement':t['task'],'roles':roles}
    c['hash']=hashlib.sha256(json.dumps(c,ensure_ascii=False,sort_keys=True).encode()).hexdigest();return c
def verify(a,pid,uploads):
    if not isinstance(a,dict):raise ValueError('附件必须是实际上传的对象')
    uid=a.get('id','')
    if not isinstance(uid,str) or len(uid)!=32 or not uid.isalnum() or a.get('project')!=pid:raise ValueError('附件不属于该项目')
    files=list(uploads.glob(pid+'-'+uid+'.*'))
    if len(files)!=1 or hashlib.sha256(files[0].read_bytes()).hexdigest()!=a.get('sha256'):raise ValueError('附件缺失或内容已改变，旧验收失效')
def transition(old,event,d,t,pid,uploads,stamp):
    s=copy.deepcopy(old);rec=s.setdefault('acceptance_tasks',{}).setdefault(str(t['id']),{'history':[],'status':'pending'});c=contract(t)
    if event=='submit':
        aa=d.get('artifacts',{})
        if not isinstance(aa,dict):raise ValueError('附件必须按角色提供')
        if set(aa)!=set(c['roles']):raise ValueError('需要附件：'+'、'.join(c['roles']))
        for a in aa.values():verify(a,pid,uploads)
        if len({a['sha256'] for a in aa.values()})!=len(aa):raise ValueError('不同证据角色不能复用相同文件内容')
        executor=required_text(d,'executor');required_text(d,'note')
        if rec.get('status')=='returned' and {k:a['sha256'] for k,a in aa.items()}=={k:a['sha256'] for k,a in rec['submission']['artifacts'].items()}:
            raise ValueError('退回后证据内容未改变，请先补做未过项')
        if rec.get('submission'):rec['history'].append({k:copy.deepcopy(rec.get(k)) for k in ('submission','review','status')})
        rec.update(status='pending_review',review=None,submission={'id':uuid.uuid4().hex,'contract_hash':c['hash'],'executor':executor,'artifacts':aa,'note':d['note'],'time':stamp})
    elif event=='review':
        sub=rec.get('submission')
        if rec['status']!='pending_review' or not sub:raise ValueError('先提交本任务的实际产物')
        if d.get('submission_id')!=sub['id'] or c['hash']!=sub['contract_hash']:raise ValueError('验收对象或要求已变化，请重新提交或刷新')
        for a in sub['artifacts'].values():verify(a,pid,uploads)
        reviewer=required_text(d,'reviewer')
        if identity(reviewer)==identity(sub['executor']):raise ValueError('必须由非执行者复核')
        checks=d.get('checks',{})
        if not isinstance(checks,dict):raise ValueError('复核必须按附件角色逐项填写')
        if set(checks)!=set(c['roles']):raise ValueError('需逐项复核所有必需附件')
        for row in checks.values():
            if not isinstance(row,dict) or row.get('result') not in ('pass','fail','unknown'):raise ValueError('填写有效复核结果')
            required_text(row,'location');required_text(row,'note')
        if d.get('requirement_result') not in ('pass','fail','unknown'):raise ValueError('还需判断原任务要求是否满足')
        required_text(d,'requirement_note')
        rec.update(status='passed' if d['requirement_result']=='pass' and all(x['result']=='pass' for x in checks.values()) else 'returned',review={'reviewer':d['reviewer'],'submission_id':sub['id'],'checks':checks,'time':stamp,'identity_verified':False,'requirement_result':d['requirement_result'],'requirement_note':d['requirement_note']})
    else:raise ValueError('未知验收操作')
    s['revision']+=1;s['history'].append({'time':stamp,'event':'acceptance_'+event,'detail':'原55项第'+str(t['id'])+'项：'+rec['status']});return s
def ledger(tasks,states,uploads):
    rows=[]
    for t in tasks:
        pid=t.get('project') or 'RS';c=contract(t);rec=states.get(pid,{}).get('acceptance_tasks',{}).get(str(t['id']));invalid=None
        status=rec['status'] if rec else ('historical_scoped_complete' if t['scoped_complete'] else 'pending')
        if rec:
            try:
                sub=rec['submission']
                if sub['contract_hash']!=c['hash']:raise ValueError('原验收要求已变化')
                for a in sub['artifacts'].values():verify(a,pid,uploads)
            except ValueError as e:status='invalidated';invalid=str(e)
        rows.append({'task':t,'project':pid,'contract':c,'record':rec,'effective_status':status,'invalid_reason':invalid})
    return rows

