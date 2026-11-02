"""Evidence-gated, project-specific quality progression; no model success fallback."""
import copy,hashlib,json
from task_acceptance import identity

METHODS={
'JN':('区分主张与专利凭证','数量只是主张；把申请、授权、文件份数和统计日分别登记。先把P14一条主张与一份证书对应，缺号码/权利人保持待核。','一行主张—证书—状态—日期映射'),
'XX':('从访谈原话到产品决策','先圈出用途/预算/交期原话，再解释它限制哪一个产品选择。原话、你的需求解释、设计理由分三栏；不能由统计数推出成交。','一行原话—位置—需求—产品选择—理由'),
'WJ':('把能力主张变成可观察状态','第三方报道不是自身能力。先确认自有入口，记录一个车位时段的初始状态、请求和实际返回；没有入口先交环境缺项。','一条初始状态—请求—返回记录'),
'YM':('分开收入与净收益','产量不等于销量，收入不等于利润。先统一一个批次的面积、期间、实收与成本，再重算一行，未售库存单列。','一行同批次收入—成本—净收益—面积账'),
'DS':('确定比例分母与批次证据','机制图不是回收实绩。固定一个真实批次和单位，投放与回收称重分开记录，先定义分母再计算。','一条同批次投放—回收—去向证据记录'),
'JR':('把订单连接到实际结算','同规格同批次核订单、结算与生产/物流/损耗成本。先找一份结算凭证，缺结算就不能把订单额当净收益。','一行规格—批次—实收—分类成本'),
'BC':('区分技术连通、合作与效果','选一个已有节点，保存合法输入及实际输出；合作凭证和使用效果另核。架构图不能当接口返回。','一条节点—输入—实际返回—实现状态记录'),
'SZ':('定义服务时点并重算改善','发起、首次响应、办结是三个时点。先核一条脱敏日志，再检查同服务条件的基线；缺基线不能计算改善幅度。','一条请求—发起—响应—办结—基线记录')}
LATER_STEPS={
'JN':['在一行证书映射补权利人、项目关联与使用依据；缺使用依据填写待核及索取对象。','把P15的申请数、授权数、文件份数分三栏，标同一统计日并用凭证独立重算一行。'],
'XX':['选一条实际访谈原话，在旁边分别填写需求解释、对应样品/产品选择与理由；缺访谈先登记缺项。','把一款产品的状态填写为已有样品/报价/真实交付/计划，逐条链接依据，缺反馈写待核。'],
'WJ':['在自有测试原型对同车位同时间提交两次请求，保存初始状态、返回与取消后状态；无入口先记环境缺项。','按现有人工退款规则记录一次模拟取消与重复请求的实际返回，标出客服决策节点；不得产生真实交易。'],
'YM':['选择一个批次，把实际销量、实收单价与库存分列，分别链接凭证；没有实账则单列测算假设。','将预测与实绩分栏，用同面积同期间基线重算一个收益倍数；缺基线保留未知。'],
'DS':['取同一真实批次的投放与回收称重记录，填写日期、单位、重量和去向；缺记录登记缺项。','在回收率及可利用率旁填写各自分母，再按同单位同批次重算一格，不用机制图代替效果。'],
'JR':['把同一批次订单金额、到账结算、净收益分三栏，逐一链接依据；缺结算不得填已实现利润。','填写一款同规格产品的生产、包装、物流、平台和损耗成本，再用实收减成本重算一格。'],
'BC':['选一个自有节点保存合法输入和一个无效输入的实际返回；无入口填写缺项，不用架构图代替。','将一处平台陈述拆为技术连通、机构合作、应用效果三栏，各自填独立依据或待核。'],
'SZ':['在同服务类型同统计期下填写基线、当前时长和样本依据，再重算一项改善率；缺基线不填65%。','在P3/P7相关陈述旁分别标已测、目标或待验证，并用一条脱敏时间线核15/30分钟的适用条件。']}

def text(d,k):
    s=d.get(k,'')
    if not isinstance(s,str) or not s.strip() or len(s)>5000:raise ValueError('请补充：'+k)
    return s.strip()
def quality_initial():return {'phase':'goal','goal_revision':0,'history':[],'trials':[],'versions':[],'transfers':[],'skills':[]}
def binding(q,p):return hashlib.sha256(json.dumps([p['id'],q['executor'],q['criteria'],q['gap_index'],q.get('goal_revision'),q.get('v1',{}).get('sha256')],ensure_ascii=False).encode()).hexdigest()
def proposal(q,p):
    skill,explain,output=METHODS[p['id']]
    key=binding(q,p)
    base_action=p['action'] if q['gap_index']==0 else LATER_STEPS[p['id']][q['gap_index']-1]
    learned=any(r['binding']==key and r['passed'] for r in q['skills'])
    attempt=next((r for r in reversed(q['trials']) if r['binding']==key and r.get('review')),None)
    if q.get('material_status')=='missing':
        route='resource';action='在缺项卡写清“'+p['gaps'][q['gap_index']]+'”缺哪份原始附件、可向谁索取及已有材料位置；先解决依赖，不虚构结果。'
    elif learned:route='execute';action='跳过已验证的入门试做，直接在当前作品处理“'+p['gaps'][q['gap_index']]+'”；沿用已掌握的方法：'+base_action
    elif attempt and attempt['review']['passed']:route='execute';action='当前试做有通过记录，开始应用到本轮V1：'+base_action
    elif attempt:route='learn';action='只修上次试做的错误“'+attempt['review']['note']+'”。先按这条方法再做一行：'+base_action
    else:route='trial';action='当前能力只有自述或尚无证据，先做一行试做：'+base_action
    return {'origin':'evidence_gated_rule_plan_not_model_diagnosis','route':route,'skill':skill,'explanation':explain,'action':action,'output':output,'criterion':q['criteria'][min(q['gap_index'],len(q['criteria'])-1)], 'gap':p['gaps'][q['gap_index']],'locator':p['locations'],'estimate_minutes':min(q['minutes'],10 if route=='trial' else 20),'failure_next':'保存一行产物和具体错误；缺附件先求助，不懂只讲当前方法；重复失败两次升级求助。','binding':key,'skill_verified':learned}

def reviewer(d,executor):
    name=text(d,'reviewer')
    if identity(name)==identity(executor):raise ValueError('请由非执行者复核，不允许同一代号自己复核自己')
    if type(d.get('passed')) is not bool:raise ValueError('请明确通过或未通过')
    return {'reviewer':name,'passed':d['passed'],'note':text(d,'note'),'scope':'human_entered_record_identity_not_independently_verified'}

def transition(old,event,d,p,stamp):
    state=copy.deepcopy(old);q=state.setdefault('quality',quality_initial());detail=''
    if event=='q_define':
        q.setdefault('previous_rounds',[])
        if q.get('criteria'):q['previous_rounds'].append(copy.deepcopy({k:v for k,v in q.items() if k not in ('previous_rounds','history')}))
        minutes=d.get('minutes',20);gap=d.get('gap_index',0)
        if type(minutes)!=int or not 1<=minutes<=720 or type(gap)!=int or not 0<=gap<len(p['gaps']):raise ValueError('时间或当前缺口不正确')
        q.update(goal=text(d,'goal'),executor=text(d,'executor'),self_report=text(d,'self_report'),minutes=minutes,gap_index=gap,material_status=d.get('material_status','unknown'),phase='confirm',criteria=[],goal_revision=q['goal_revision']+1)
        q.update(trials=[],versions=[],transfers=[],remaining=[])
        if q['material_status'] not in ('available','missing','unknown'):raise ValueError('请确认材料条件')
        for key in ('plan','v1','pending_trial','pending_v2','pending_transfer','content_pass'):q.pop(key,None)
        detail='复述目标：'+q['goal']+'；候选质量差距：'+p['gaps'][gap]+'；能力仅本人自述，未判已掌握。'
    elif event=='q_confirm':
        if q['phase']!='confirm':raise ValueError('先澄清目标再确认标准')
        criteria=d.get('criteria')
        if not isinstance(criteria,list) or not criteria or any(not isinstance(x,str) or not x.strip() for x in criteria):raise ValueError('请确认具体判据')
        q['criteria']=criteria;q['v1']=copy.deepcopy(d['upload']);q['plan']=proposal(q,p);q['phase']=q['plan']['route'];detail='V1和本轮G已绑定；'+q['plan']['action']
    elif event=='q_resource':
        if q.get('phase')!='resource':raise ValueError('当前不在材料求助环节')
        detail='材料求助记录：'+text(d,'note');q['resource_note']=d['note']
        if d.get('available') is True:q['material_status']='available';q['plan']=proposal(q,p);q['phase']=q['plan']['route']
    elif event=='q_trial_submit':
        if q.get('phase') not in ('trial','learn'):raise ValueError('当前不是试做步骤')
        q['pending_trial']={'upload':d['upload'],'binding':binding(q,p),'explanation':text(d,'explanation')};q['phase']='trial_review';detail='收到实际试做产物，等待非执行者看当前方法。'
    elif event=='q_trial_review':
        if q.get('phase')!='trial_review':raise ValueError('先交试做产物')
        review=reviewer(d,q['executor']);q['trials'].append({**q.pop('pending_trial'),'review':review});q['plan']=proposal(q,p);q['phase']=q['plan']['route'];detail='试做复核：'+review['note']
        failed=[t for t in q['trials'] if t['binding']==binding(q,p) and not t['review']['passed']]
        if len(failed)>=2 and not review['passed']:q['phase']='help';detail+='；两次实际试做未过，停止同类重试，带原文及两次错误向导师/学长姐求助。'
    elif event=='q_v2_submit':
        if q.get('phase')!='execute':raise ValueError('先解决试做或材料依赖')
        if d['upload']['sha256']==q['v1']['sha256']:raise ValueError('V2与V1字节相同，请提交实际改动并说明理由')
        if q['versions'] and not q['versions'][-1]['review']['passed'] and d['upload']['sha256']==q['versions'][-1]['upload']['sha256']:
            raise ValueError('退回后重复上传相同V2，未提供新的修改；请补未通过项后再提交')
        q['pending_v2']={'upload':d['upload'],'explanation':text(d,'explanation'),'criteria':copy.deepcopy(q['criteria'])};q['phase']='content_review';detail='收到V2和修改理由；仍须与V1按同一G比较。'
    elif event=='q_content_review':
        if q.get('phase')!='content_review':raise ValueError('先提交本轮V2')
        checks=d.get('checks')
        if not isinstance(checks,list) or len(checks)!=len(q['criteria']):raise ValueError('需按冻结判据逐条比较V1和V2')
        for c in checks:
            text(c,'before');text(c,'after');text(c,'note')
            if c.get('result') not in ('pass','fail','unknown'):raise ValueError('结果只能为通过、未通过或未知')
        if all(x['result']=='pass' for x in checks) and not any(x['before'].strip()!=x['after'].strip() for x in checks):
            raise ValueError('尚未指出V1到V2哪一处实际改善；不能只把结果全部选为通过')
        review=reviewer({**d,'passed':all(x['result']=='pass' for x in checks),'note':'；'.join(x['note'] for x in checks)},q['executor'])
        q['versions'].append({**q.pop('pending_v2'),'checks':checks,'review':review})
        q['remaining']=[i for i,c in enumerate(checks) if c['result']!='pass'];q['content_pass']=review['passed'];q['phase']='transfer' if review['passed'] else 'execute';detail='按原G比较后：'+('成果改善；尚未判定方法掌握' if review['passed'] else '仅补未通过/未知项：'+str(q['remaining']))
    elif event=='q_transfer_submit':
        if q.get('phase')!='transfer':raise ValueError('先通过本轮成果复核')
        seen=[q['v1']['sha256']]+[v['upload']['sha256'] for v in q['versions']]
        if d['upload']['sha256'] in seen:raise ValueError('迁移必须是另一处实际尝试，不能重复上传V1或V2')
        q['pending_transfer']={'upload':d['upload'],'explanation':text(d,'explanation'),'location':text(d,'location'),'binding':binding(q,p)};q['phase']='transfer_review';detail='收到另一处少提示试做与本人解释，等待复核。'
    elif event=='q_transfer_review':
        if q.get('phase')!='transfer_review':raise ValueError('先提交另一处迁移产物')
        review=reviewer(d,q['executor']);entry={**q.pop('pending_transfer'),'review':review};q['transfers'].append(entry)
        if review['passed']:q['skills'].append({'binding':entry['binding'],'passed':True,'artifact':entry['upload'],'review':review});q['phase']='round_pass'
        else:q['phase']='transfer'
        detail='迁移复核：'+review['note']+'；'+('仅登记当前判据下这一技能的通过记录，不推断整体科研能力' if review['passed'] else '成果通过记录保留，只补迁移方法')
    elif event=='q_help':
        q['help_note']=text(d,'note');q['phase']='help';detail='保存现场并升级求助：'+q['help_note']
    elif event=='q_resume_help':
        if q.get('phase')!='help':raise ValueError('当前不在升级求助环节')
        q['help_response']=text(d,'note');q['plan']['action']=text(d,'action');q['phase']='learn';detail='记录求助回复并调整当前方法：'+q['help_response']
    else:raise ValueError('未知质量进阶操作')
    q['history'].append({'time':stamp,'event':event,'detail':detail});state['revision']+=1;state['history'].append({'time':stamp,'event':event,'detail':detail});return state

