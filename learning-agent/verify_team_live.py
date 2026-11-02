"""Opt-in live-model engineering probe with synthetic files, never a user study.

Does not override the configured model or print credentials. Diagnosis is previewed.
Review is a separate action for this probe project; never auto-approves a result.
"""
import argparse
import base64
import json
from urllib.parse import urlparse
from urllib.request import Request, urlopen


def run(base, stage, project_id=None, task_id=None):
    parsed=urlparse(base)
    if parsed.scheme!='http' or parsed.hostname not in ('127.0.0.1','localhost') or parsed.query or parsed.fragment:
        raise ValueError('工程探针只连接本人回环服务')
    base=base.rstrip('/')
    def request(path, data=None):
        req=Request(base+path, data=None if data is None else json.dumps(data,ensure_ascii=False).encode('utf-8'),
                    headers={'Content-Type':'application/json'} if data is not None else {})
        with urlopen(req, timeout=160) as response:return json.load(response)
    def ctx(p):return {'project_id':p['project_id'],'expected_version':p['version']}
    def post(p, op, **data):return request('/api/agent/team/'+op,{**ctx(p),**data})
    def upload(p,name,text,identifier,kind='user_material',purpose='input'):
        return post(p,'artifact-import',filename=name,artifact_id=identifier,kind=kind,purpose=purpose,
                    data_base64=base64.b64encode(text.encode('utf-8')).decode('ascii'))
    health=request('/api/agent/health')
    if not health['ai']['configured']:
        raise ValueError('实际服务没有模型配置；探针不使用假模型替代')
    if stage=='diagnose':
        if project_id:
            p=request('/api/agent/team?id='+project_id)
            if p['goal']!='真实模型工程探针（人工构造输入，不是用户效果）':
                raise ValueError('此脚本不能重新诊断真实用户项目')
        else:
            p=request('/api/agent/team/create',{'goal':'真实模型工程探针（人工构造输入，不是用户效果）','mode':'live'})
            p=post(p,'context',project_context={'project_type':'research','event_name':'工程核验，无赛事资格或官方规则含义',
            'target_result':'修正统计说明并解释有效分母','acceptance_criteria':['总记录3、有效2、缺失1；0为有效值，缺失不计入均值分母；均值2.5；能回查CSV行'],'deadline':''})
            p=post(p,'member',member={'member_id':'probe-member','name':'工程核验者（非真实团队成员）',
            'owned_task':'在给定报告中修正均值并写明缺失与0的口径','understanding':'按CSV实际记录核对分母，缺失与0分开',
            'tools':'Python和文本编辑器','self_reported_capabilities':['文本编辑','基础算术']})
            p=upload(p,'probe-report.txt','人工工程材料\n记录3条，当前平均值=5/3=1.67。\n未说明有效分母，缺失与0尚未区分。','probe-report')
            p=upload(p,'probe-data.csv','id,score\nr1,5\nr2,\nr3,0\n','probe-data')
            p=upload(p,'probe-criteria.txt','人工工程判据，不是官方赛事规则。\n缺失不计入均值分母，0为有效记录。\n正确口径：总记录3，有效2，缺失1，均值2.5；解释原因并回查CSV行。','probe-criteria',kind='reference')
        p=post(p,'dispatch')
    else:
        if not project_id or not task_id:
            raise ValueError('先读取诊断预览，指定本工程探针的project-id和task-id后复核')
        p=request('/api/agent/team?id='+project_id)
        if p['goal']!='真实模型工程探针（人工构造输入，不是用户效果）':
            raise ValueError('此脚本不能采用或提交真实用户项目')
        if p.get('proposal'):
            p=post(p,'apply',proposal_id=p['proposal']['id'])
        task=next(t for t in p['plan']['tasks'] if t['task_id']==task_id)
        if task['status']=='candidate':
            p=post(p,'feedback',expected_plan_version=p['plan']['plan_version'],task_id=task_id,action='start',note='工程探针：核对预览后开始；不是用户试做')
        p=upload(p,'probe-report.txt','人工工程复核产物\nCSV回查：row:2 r1=5；row:3 r2缺失；row:4 r3=0。\n总记录3，有效2，缺失1。0是有效值，缺失不进入均值分母。均值=(5+0)/2=2.5。\n试做判据：有效分母、缺失计数与均值可逐行复算；方法为保留0、单独记录缺失。','probe-report',purpose='submission')
        version=p['stored_artifacts'][-1]['artifact_version']
        p=post(p,'feedback',expected_plan_version=p['plan']['plan_version'],task_id=task_id,action='submit',note='工程探针合成产物，未开展用户研究',
               artifact_id='probe-report',artifact_version=version,actual_minutes=0,evidence='脚本生成的可复算新版工程材料；不是实际用户用时')
        p=post(p,'review-run',task_id=task_id)
    d=p.get('diagnosis') or {}
    plan=(p.get('proposal') or {}).get('plan') or p.get('plan') or {}
    return {'probe':'live-model-with-synthetic-files','stage':stage,'project_id':p['project_id'],
            'model':health['ai']['model'],'dispatch':p.get('dispatch'),
            'gaps':[{'gap_id':g['gap_id'],'current_evidence':g['current_evidence'],'target_result':g['target_result'],
                     'current_locator':g.get('current_locator'),'required_capabilities':g['required_capabilities']} for g in d.get('gaps',[])],
            'tasks':[{'task_id':t['task_id'],'kind':t.get('kind'),'status':t['status'],'title':t['title'],'depends_on':t['depends_on'],
                      'external_review':t.get('external_review')} for t in plan.get('tasks',[])],
            'unknowns':d.get('unknowns',[]),'diagnosis_trace':d.get('model_trace'),
            'user_effect_verified':False,'human_approval_performed':False}


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--base',default='http://127.0.0.1:8922')
    parser.add_argument('--stage',choices=('diagnose','review'),default='diagnose')
    parser.add_argument('--project-id');parser.add_argument('--task-id')
    args=parser.parse_args()
    print(json.dumps(run(args.base,args.stage,args.project_id,args.task_id),ensure_ascii=False,indent=2))
