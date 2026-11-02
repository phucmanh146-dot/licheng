// Real Chromium/file upload/HTTP/SQLite; model output is a controlled fixture.
const {spawn}=require('node:child_process');
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'general-loop-'));
const base='http://127.0.0.1:8962', errors=[], checks=[];
let server,browser;
const bootstrap=`import json,runpy,sys
import learning_agent as agent, rescue_service as rescue, team_orchestrator as team
from test_general_loop import diagnosis_reply
original=rescue.public_config
rescue.public_config=lambda:{**original(),'configured':(agent.DATA/'fixture-ready').exists(),'verified':False}
rescue.config_snapshot=lambda:{'base':'http://127.0.0.1:1/v1','model':'controlled-browser-fixture','key':'','protocol':'chat','verified':False}
def controlled(messages,cfg):
    payload=json.loads(messages[1]['content'])
    if payload['stage']=='diagnosis':
        return json.dumps(diagnosis_reply(team.state()['projects'][0],['数据清洗']),ensure_ascii=False)
    task=payload['task'];doc=payload['submitted_document']
    ref={'artifact_id':doc['artifact_id'],'artifact_version':doc['artifact_version'],**{'locator':doc['units'][0]['locator'],'quote':doc['units'][0]['text']}}
    return json.dumps({'note':'人工控制模型夹具；实际字节已读取，不代表真实语义质量',
       'criterion_results':[{'criterion':c,'passed':True,'evidence':'控制夹具核对','evidence_refs':[ref]} for c in task['acceptance_criteria']],
       'gap_results':[{'gap_id':k,'status':'closed','evidence':'控制夹具核对','evidence_refs':[ref]} for k in task['gap_ids']]},ensure_ascii=False)
rescue.complete=controlled
sys.argv=['learning_agent_server.py','--port','8962','--with-team-ai']
runpy.run_path('learning_agent_server.py',run_name='__main__')`;
async function state(id){return (await fetch(base+'/api/agent/team?id='+id)).json();}
async function start(){server=spawn('python',['-c',bootstrap],{cwd:__dirname,env:{...process.env,SHANGAN_AGENT_DATA:temp,FOCUS_AI_BASE_URL:'',FOCUS_AI_MODEL:'',FOCUS_AI_API_KEY:''},stdio:'ignore'});for(let i=0;i<60;i++){try{if((await fetch(base+'/api/agent/team')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error('test server unavailable');}
(async()=>{try{
 await start();browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1365,height:1000}});page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
 await page.goto(base+'/team.html');await page.locator('#goal').fill('通用科研任务 · 实际文件浏览器检查');await page.locator('#mode').selectOption('live');await page.locator('#create button').click();await page.locator('#project').waitFor();
 const id=await page.locator('#projects').inputValue();
 await page.locator('#context-form').evaluate(f=>f.closest('details').open=true);await page.locator('#context-type').selectOption('research');await page.locator('#context-target').fill('可复查的人数报告');await page.locator('#context-criteria').fill('写明有效分母和缺失人数');await page.locator('#context-form button').click();await page.waitForFunction(()=>project?.project_context?.project_type==='research');
 await page.locator('#member-form').evaluate(f=>f.closest('details').open=true);await page.locator('#member-name').fill('成员甲 <img src=x onerror="window.__unsafe=1">');await page.locator('#member-task').fill('核对人数和缺失口径');await page.locator('#member-understanding').fill('缺失不是0，有效分母必须可回查');await page.locator('#member-skills').fill('数据清洗');await page.locator('#member-form button').click();await page.waitForFunction(()=>project?.member_task_briefs?.length===1);
 assert.equal(await page.locator('#member-summary img').count(),0);assert.equal(await page.evaluate(()=>!!window.__unsafe),false);
 checks.push('project-context-and-self-report-saved-as-text');
 async function upload(name,text,purpose,existing=''){await page.locator('#artifact-file').setInputFiles({name,mimeType:'text/plain',buffer:Buffer.from(text)});await page.locator('#artifact-purpose').selectOption(purpose);await page.locator('#artifact-existing').selectOption(existing);const n=(await state(id)).stored_artifacts?.length||0;await page.locator('#artifact-form button').click();await page.waitForFunction(n=>project?.stored_artifacts?.length===n+1,n);return (await state(id)).stored_artifacts.at(-1);}
 const report=await upload('report.txt','人数=3；有效分母未知','input');
 const downloadReady=page.waitForEvent('download');await page.locator('#review-export').click();const exported=await downloadReady;const packet=JSON.parse(fs.readFileSync(await exported.path(),'utf8'));assert.equal(packet.project_id,id);assert.equal(packet.project_context.target_result,'可复查的人数报告');assert.equal(packet.documents[0].units[0].text,'人数=3；有效分母未知');assert.equal(packet.pending_tasks.length,0);checks.push('goal-and-actual-materials-export-before-A-diagnosis');
 await page.getByRole('button',{name:'读取原文：report.txt v1',exact:true}).click();await page.locator('#artifact-content').getByText(/line:1/).waitFor();assert.match(await page.locator('#artifact-content').textContent(),/人数=3/);checks.push('actual-file-bytes-and-locator-visible');
 await page.locator('#dispatch-run').click();await page.waitForFunction(()=>project?.dispatch?.error_code==='CONFIG_REQUIRED');assert.equal((await state(id)).diagnosis,null);checks.push('missing-model-does-not-create-demo');
 fs.writeFileSync(path.join(temp,'fixture-ready'),'controlled model only');await page.locator('#dispatch-run').click();await page.locator('#apply:enabled').waitFor();let p=await state(id);assert.deepEqual(p.proposal.plan.tasks.map(t=>t.kind),['trial','production']);assert.equal(p.project_context.deadline,'');
 await page.locator('#apply').click();await page.waitForFunction(()=>project?.plan?.plan_version===1);checks.push('unknown-capability-trial-first');
 const trial=p.proposal.plan.tasks[0].task_id;
 const trialFile=await upload('trial.txt','试做：有效=2，缺失=1；缺失不计0；判据核对通过','capability');assert.equal((await state(id)).plan_stale,false);
 async function feedback(tid,kind){const task=page.locator('#tasks [data-task-id="'+tid+'"]');await task.getByRole('button',{name:kind,exact:true}).click();await page.locator('#note').fill('人工浏览器核对记录');return task;}
 await feedback(trial,'开始任务');await page.locator('#feedback-form button[type=submit]').click();await page.waitForFunction(tid=>project.plan.tasks.find(t=>t.task_id===tid).status==='in_progress',trial);
 await feedback(trial,'提交成果');await page.locator('#submission-artifact').selectOption(trialFile.artifact_id+':1');await page.locator('#evidence').fill('trial.txt line:1判据与实际记录');await page.locator('#feedback-form button[type=submit]').click();await page.waitForFunction(tid=>project.plan.tasks.find(t=>t.task_id===tid).status==='pending_review',trial);
 await page.locator('#a-review-call button').click();await page.waitForFunction(tid=>!!project.plan.tasks.find(t=>t.task_id===tid).external_review,trial);p=await state(id);assert.equal(p.plan.tasks[0].external_review.packet.gap_results[0].status,'remaining');checks.push('learning-review-never-closes-production-gap');
 async function approve(tid){await feedback(tid,'验收通过');for(const row of await page.locator('.criterion-row').all()){await row.locator('.criterion-pass').check();await row.locator('.criterion-evidence').fill('人工核对实际文件和原文位置');}await page.locator('#feedback-form button[type=submit]').click();await page.waitForFunction(tid=>project.plan.tasks.find(t=>t.task_id===tid).status==='completed',tid);}
 await approve(trial);
 await page.locator('#capability-form').evaluate(f=>f.closest('details').open=true);await page.locator('#cap-name').fill('数据清洗');await page.locator('#cap-criterion').fill('缺失不计0且分母可回查');await page.locator('#cap-artifact').selectOption(trialFile.artifact_id+':1');await page.locator('#cap-locator').fill('line:1');await page.locator('#cap-quote').fill('缺失不计0');await page.locator('#cap-evidence').fill('人工核对实际试做产物');await page.locator('#cap-result').selectOption('true');await page.locator('#capability-form button').click();await page.waitForFunction(()=>project.member_task_briefs[0].capability_evidence.length===1);
 await page.locator('#dispatch-run').click();await page.locator('#apply:enabled').waitFor();await page.locator('#apply').click();await page.waitForFunction(()=>project.plan.plan_version===2);p=await state(id);assert.equal(p.plan.tasks[0].task_id,trial);assert.equal(p.plan.tasks[0].status,'completed');assert.equal(p.plan.tasks[1].kind,'production');checks.push('verified-capability-and-completed-trial-preserved');
 await feedback('G1:deliver','开始任务');await page.locator('#feedback-form button[type=submit]').click();await page.waitForFunction(()=>project.plan.tasks.find(t=>t.task_id==='G1:deliver').status==='in_progress');
 await upload('report.txt','有效分母=2；缺失人数=1；缺失不计0','submission',report.artifact_id);assert.equal((await state(id)).plan_stale,false);
 await feedback('G1:deliver','提交成果');await page.locator('#submission-artifact').selectOption(report.artifact_id+':2');await page.locator('#evidence').fill('report.txt v2 line:1');await page.locator('#feedback-form button[type=submit]').click();await page.waitForFunction(()=>project.plan.tasks.find(t=>t.task_id==='G1:deliver').status==='pending_review');
 await page.locator('#a-review-call button').click();await page.waitForFunction(()=>!!project.plan.tasks.find(t=>t.task_id==='G1:deliver').external_review);p=await state(id);assert.equal(p.plan.tasks[1].external_review.packet.artifact_version,2);assert.equal(p.plan.tasks[1].external_review.content_read_verified,true);assert.notEqual(p.diagnosis.gaps[0].status,'closed');
 await approve('G1:deliver');await page.locator('#tasks [data-task-id="G1:deliver"]').getByRole('button',{name:'确认复核后更新剩余计划',exact:true}).click();await page.locator('#apply:enabled').waitFor();p=await state(id);assert.equal(p.diagnosis.gaps[0].status,'closed');assert.equal(p.proposal.plan.tasks.length,2);assert.ok(p.proposal.plan.tasks.every(t=>t.status==='completed'));await page.locator('#apply').click();await page.waitForFunction(()=>project.dispatch_status.stage==='done');checks.push('actual-new-version-review-human-confirmation-remaining-preview');
 await page.reload();await page.waitForFunction(()=>project?.dispatch_status?.stage==='done');assert.equal((await state(id)).stored_artifacts.length,3);
 server.kill();await new Promise(resolve=>server.once('exit',resolve));await start();await page.reload();await page.waitForFunction(()=>project?.dispatch_status?.stage==='done');assert.equal((await state(id)).live_verified,false);checks.push('refresh-and-process-restart-restore-original-evidence');
 // A failed skill chooses a named author/section/exercise rather than a generic course.
 await page.locator('#capability-form').evaluate(f=>f.closest('details').open=true);await page.locator('#cap-name').fill('数据清洗');await page.locator('#cap-criterion').fill('缺失不计0且分母可回查');await page.locator('#cap-artifact').selectOption(trialFile.artifact_id+':1');await page.locator('#cap-locator').fill('line:1');await page.locator('#cap-quote').fill('缺失不计0');await page.locator('#cap-result').selectOption('false');await page.locator('#cap-evidence').fill('人工控制未通过记录');await page.locator('#capability-form button').click();await page.waitForFunction(()=>project.member_task_briefs[0].capability_evidence.length===2);await page.locator('#dispatch-run').click();await page.locator('#apply:enabled').waitFor();assert.match(await page.locator('#proposal').textContent(),/莫烦/);assert.match(await page.locator('#proposal').textContent(),/NaN/);checks.push('failed-capability-shows-author-section-and-practice');
 const before=await state(id);const created=await page.request.post(base+'/api/agent/team/create',{data:{goal:'文件隔离检查 · 第二项目',mode:'live'}});assert.ok(created.ok());const other=await created.json();await page.locator('#refresh').click();await page.waitForFunction(id=>project?.project_id===id,id);
 await page.locator('#artifact-file').setInputFiles({name:'binding.txt',mimeType:'text/plain',buffer:Buffer.from('本文件只能进入选择时的项目')});await page.locator('#artifact-existing').selectOption('');await page.evaluate(()=>{window.__originalArrayBuffer=File.prototype.arrayBuffer;File.prototype.arrayBuffer=function(){window.__fileReading=true;return new Promise(resolve=>{window.__releaseFile=()=>window.__originalArrayBuffer.call(this).then(resolve);});};});
 await page.locator('#artifact-form button').click();await page.waitForFunction(()=>window.__fileReading===true);await page.locator('#projects').selectOption(other.project_id);await page.waitForFunction(id=>project?.project_id===id,other.project_id);await page.evaluate(()=>window.__releaseFile());await page.getByText(/材料读取期间项目或版本变化/).waitFor();await page.evaluate(()=>File.prototype.arrayBuffer=window.__originalArrayBuffer);
 assert.equal((await state(id)).stored_artifacts.length,before.stored_artifacts.length);assert.equal((await state(other.project_id)).stored_artifacts?.length||0,0);checks.push('file-read-project-switch-cannot-mix-materials');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({model:'controlled-browser-fixture',checks,pageErrors:errors},null,2));
}finally{if(browser)await browser.close();if(server)server.kill();fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
