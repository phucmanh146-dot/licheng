"""Full HTTP rehearsal with explicit synthetic actors; not a real student trial."""
import json,threading,urllib.request,urllib.error,base64
from pathlib import Path
from http.server import ThreadingHTTPServer
from server import Store,handler,HERE
from research_starter import propose

ROOT=HERE.parents[1];OUT=ROOT/'outputs/科研迷茫起步闭环演示_20261101';OUT.mkdir(exist_ok=True)
WORK=ROOT/'work/research-starter-synthetic-20261101';WORK.mkdir(exist_ok=True)
seed=json.loads((HERE/'data.json').read_text(encoding='utf-8'))
store=Store(WORK/'demo.sqlite3');http=ThreadingHTTPServer(('127.0.0.1',0),handler(WORK,store,seed,'synthetic-token'))
threading.Thread(target=http.serve_forever,daemon=True).start();base='http://127.0.0.1:'+str(http.server_port)
events=[]
def call(path,body):
    body={'project':'RS','expected_revision':store.get('RS')['revision'],**body}
    req=urllib.request.Request(base+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json','X-Workflow-Token':'synthetic-token'})
    with urllib.request.urlopen(req) as r:result=json.load(r)
    events.append({'endpoint':path,'event':body.get('event'),'http':r.status,'stage':result.get('state',{}).get('stage')})
    return result
def event(name,payload):return call('/api/event',{'event':name,'payload':payload})
def submit(filename,text):
    path=OUT/filename;path.write_text(text,encoding='utf-8')
    upload=call('/api/upload',{'filename':filename,'data':base64.b64encode(text.encode()).decode()})['upload']
    event('submit',{'upload':upload,'explanation':'SYNTHETIC教学演示产物，非真人或实证结果','human_declaration':True})

variants=[propose({'interest':'不知道','minutes':20}),propose({'interest':'AI辅助阅读','minutes':20}),propose({'interest':'AI辅助阅读','materials':'教学片段：读完摘要仍说不出研究问题。非真实访谈。','minutes':10}),propose({'interest':'AI辅助阅读','materials':'两段教学材料，非真实访谈','minutes':40})]
assert len({x['route'] for x in variants})==4
for title in ['第一次开始','再次尝试']:
    if store.get('RS')['stage']=='accepted':event('next',{'reflection':'演示：先用原话找困难，再写范围；下次先自己做一行'})
    elif store.get('RS')['revision']:break
    if title=='再次尝试':break
    plan=variants[2]
    event('context',{'goal':plan['goal'],'materials':'SYNTHETIC教学片段：读完摘要仍说不出研究问题；不是受访者原话。','blocker':'想研究AI阅读，但不知道“研究问题”怎么从困难里变出来','executor':'SYNTHETIC-learner','minutes':10,'output':plan['output'],'first_action':plan['action']})
    event('freeze',{'criteria':plan['criteria']});event('start',{'action':plan['action'],'origin':plan['origin']})
    event('blocked',{'category':'method','note':'SYNTHETIC：不知道怎样区分材料支持的内容与自己的猜测'})
    event('resume',{})
    submit('V1_教学困惑卡.md','# 教学演示V1（非真人）\n我想研究AI如何提升所有大学生的科研能力。\n待问：AI是不是一定有效？\n')
    event('review',{'reviewer':'SYNTHETIC-review-role','checks':[{'passed':False,'note':'教学演示V1没有来源位置'},{'passed':True,'note':'未编造引文'},{'passed':False,'note':'问题过大，未说明摘要阅读这一场景'}]})
    assert store.get('RS')['stage']=='execute'
    submit('V2_教学研究问题卡.md','# 教学研究问题卡V2\n来源：本演示提供的教学片段，第1句；非访谈、非实证数据。\n原句：读完摘要仍说不出研究问题。\n可支持：这个教学情境涉及摘要阅读后的理解表达困难。\n不能推出：不能认定所有学生都有困难，也不能认定AI有效。\n候选问题：在初学者阅读一篇摘要的任务中，能否准确指出作者提出的研究问题？\n下一步：请助教确认一篇可公开使用的摘要及“指出研究问题”的判断标准，再做一条有依据的标注。\n未知：真实对象、基线及方法均待确认；当前不开展效果推断。\n')
    event('review',{'reviewer':'SYNTHETIC-review-role','checks':[{'passed':True,'note':'卡片注明教学片段第1句，可回查'},{'passed':True,'note':'可支持与不能推出分列，未声称AI有效'},{'passed':True,'note':'范围缩到一篇摘要，下一步材料和判据待助教确认'}]})
    assert store.get('RS')['stage']=='accepted'
    event('next',{'reflection':'演示：把大愿望缩成一次任务；原话、推测和未知分开，下次先自己列这一行。'})
    assert store.get('RS')['cycles'][-1]['review']['passed']
    break
http.shutdown();http.server_close()
report={'scope':'SYNTHETIC_HTTP_REHEARSAL_NOT_REAL_STUDENT','real_student_tested':False,'real_model_called':False,'variants':variants,'http_events':events,'final_stage':store.get('RS')['stage'],'cycle_archived':True,'eight_projects_55_status_changed':False}
(OUT/'实际执行记录.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'说明.md').write_text('# 科研迷茫起步：软件闭环演示\n\n演示人物想研究AI阅读，但不知道如何从困惑转成问题。系统按已有材料与10分钟条件，建议先做一行证据定位。\n\n实际经HTTP执行：澄清→冻结判据→首步→卡住保存→继续→上传V1→按原标准退回→上传V2→模拟复核→归档并开启下一步。V1/V2与逐步HTTP记录在本目录。\n\n人物、复核角色和教学材料均为SYNTHETIC，未证明真人效果，也没有调用模型或声称替真人完成科研。该演示证明软件流程可走通；真实使用仍需学生做产物和非执行者复核。\n',encoding='utf-8')
print('Four distinct starting conditions; full HTTP rehearsal including V1 rejection, V2 review and archived next cycle passed. SYNTHETIC, not human validation.')

