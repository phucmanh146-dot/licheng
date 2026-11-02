// Real Chromium + HTTP + SQLite. A packets and worker replies are human fixtures.
// The worker fixture never invokes a model, searches, or assesses real media quality.
const {spawn, execFileSync} = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright') : 'playwright');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-check-'));
const base = 'http://127.0.0.1:8933';
let server, browser;
const errors = [], checks = [], mediaCounts = [];
async function state(id) {return (await fetch(base + '/api/agent/team?id=' + id)).json();}
async function post(route, data) {
  const r = await fetch(base + '/api/agent/team/' + route, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
  const value=await r.json();assert.ok(r.ok,JSON.stringify(value));return value;
}
(async()=>{
 try {
  const bootstrap = `import pathlib, runpy, sys
import learning_agent as agent, rescue_service as rescue
original = rescue.public_config
rescue.public_config = lambda: {**original(), 'configured': (agent.DATA / 'fixture-ai-ready').exists(), 'verified': False}
agent.run_agent = lambda identifier, data: {'fixture': 'human-authored-worker', 'advice': '人工夹具：先保存输入版本，再记录输出', 'frame_count': len(data['frames'])}
sys.argv = ['learning_agent_server.py','--port','8933','--with-b-planner']
runpy.run_path('learning_agent_server.py', run_name='__main__')`;
  server=spawn('python',['-c',bootstrap],{cwd:__dirname,env:{...process.env,SHANGAN_AGENT_DATA:temp,
    FOCUS_AI_BASE_URL:'',FOCUS_AI_MODEL:'',FOCUS_AI_API_KEY:''},stdio:'ignore'});
  let ready=false;
  for(let i=0;i<50;i++){try{if((await fetch(base+'/api/agent/team')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,'temporary server did not start');
  const diagnosis=JSON.parse(execFileSync('python',['-c',
    "import json; from test_handoff import diagnosis_fixture; print(json.dumps(diagnosis_fixture(),ensure_ascii=False))"
  ],{cwd:__dirname,encoding:'utf8'}));
  diagnosis.gaps[0].target_result+=' <img src=x onerror="window.__unsafe=1">';
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1365,height:1000},acceptDownloads:true});
  page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.url().endsWith('/rescue-start'))mediaCounts.push(JSON.parse(r.postData()).frames.length);});
  await page.goto(base+'/team.html');
  await page.locator('#goal').fill('队友交付接线 · 人工浏览器验收');
  await page.locator('#mode').selectOption('live');await page.locator('#create button').click();
  await page.getByText('A：待接入 / B：已接入',{exact:true}).waitFor();
  assert.equal(await page.locator('#dispatch-run').isDisabled(),true);
  checks.push('real-B-bound-without-fabricating-A');
  const id=await page.locator('#projects').inputValue();
  const invalid=structuredClone(diagnosis);delete invalid.gaps[0].acceptance_criteria;
  async function importA(d){await page.locator('#a-file').setInputFiles({name:'A-diagnosis.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(d))});await page.getByText('已读入文件，请检查后再保存',{exact:true}).waitFor();}
  await importA(invalid);await page.locator('#handoff-check').click();
  await page.locator('#handoff-check-result').getByText(/缺少可核对的 acceptance_criteria/).waitFor();
  assert.equal((await state(id)).diagnosis,null);
  await importA(diagnosis);await page.locator('#handoff-check').click();
  await page.getByText('字段已具备，可交给 B；内容仍需核对',{exact:true}).waitFor();
  await page.locator('#diagnosis-form button').click();await page.locator('#b-run:enabled').waitFor();
  checks.push('A-file-preflight-no-auto-save');
  await page.locator('#b-run').click();await page.locator('#apply:enabled').waitFor();
  let p=await state(id);assert.equal(p.plan,null);assert.equal(p.proposal.plan.provider,'deterministic-action-planner');
  assert.equal(await page.locator('#proposal img').count(),0);assert.equal(await page.evaluate(()=>!!window.__unsafe),false);
  await page.locator('#apply').click();
  const task=page.locator('#tasks [data-task-id="G1:deliver"]');
  await task.getByRole('button',{name:'开始任务',exact:true}).click();
  await page.locator('#note').fill('开始人工验收');await page.locator('#feedback-form button[type=submit]').click();
  await task.getByRole('button',{name:'提交成果',exact:true}).waitFor();
  checks.push('actual-B-preview-adopt-start', 'untrusted-handoff-rendered-as-text');
  // Upload an actual browser screenshot; only the controlled worker sees it.
  await page.locator('#rescue-media').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:await page.screenshot()});
  await page.locator('#rescue-note').fill('人工验收：保存结果遇到卡点');
  await page.locator('#rescue-start').click();
  await page.getByText('请先在 AI 连接中配置模型，再提交截图或录屏求助。',{exact:true}).waitFor();
  assert.equal((await state(id)).rescue_requests,undefined);
  checks.push('missing-model-does-not-create-help');
  fs.writeFileSync(path.join(temp,'fixture-ai-ready'),'controlled worker only');
  await page.locator('#rescue-start').click();
  await page.locator('#linked-rescue-results').getByRole('button',{name:'读取最新解答'}).waitFor();
  await page.locator('#linked-rescue-results').getByRole('button',{name:'读取最新解答'}).click();
  await page.locator('#linked-rescue-results summary').waitFor();
  p=await state(id);assert.equal(p.rescue_requests[0].result.frame_count,1);assert.equal(p.plan.tasks[0].status,'in_progress');
  assert.equal(p.rescue_requests[0].action_id,'step:1');assert.equal(p.live_verified,false);
  checks.push('image-help-binds-action-without-completing-task');
  // WebM exercises actual browser frame extraction, not model correctness.
  const video=path.join(temp,'fixture.webm');
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:s=120x80:d=1','-c:v','libvpx','-t','1','-y',video]);
  await page.locator('#rescue-media').setInputFiles(video);await page.locator('#rescue-start').click();
  await page.locator('#linked-rescue-results').getByRole('button',{name:'读取最新解答'}).waitFor();
  await page.locator('#linked-rescue-results').getByRole('button',{name:'读取最新解答'}).click();
  await page.waitForFunction(()=>project.rescue_requests.length===2&&project.rescue_requests[1].status==='completed');
  p=await state(id);assert.equal(p.rescue_requests[1].result.frame_count,3);assert.deepEqual(mediaCounts,[1,1,3]);
  checks.push('video-keyframes-use-same-linked-engine');
  await task.getByRole('button',{name:'提交成果',exact:true}).click();
  await page.locator('#note').fill('提交人工夹具成果');await page.locator('#artifact-id').fill('interface-record');
  await page.locator('#artifact-version').fill('2');await page.locator('#minutes').fill('12');
  await page.locator('#evidence').fill('人工夹具：输入版本和执行结果');await page.locator('#feedback-form button[type=submit]').click();
  await page.locator('#review-export:enabled').waitFor();
  const downloadPromise=page.waitForEvent('download');await page.locator('#review-export').click();
  const download=await downloadPromise;const packet=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.equal(packet.pending_tasks[0].submission.artifact_version,2);
  assert.equal(await page.locator('#a-review-call button').isDisabled(),true);
  checks.push('A-export-contains-current-version-and-evidence');
  p=await state(id);const current=p.plan.tasks[0];
  const review={review_id:'browser-review-1',task_id:current.task_id,reviewer_id:'A',
    plan_version:p.plan.plan_version,diagnosis_version:p.diagnosis.diagnosis_version,
    artifact_id:'interface-record',artifact_version:99,method:'manual',note:'人工复核夹具',
    criterion_results:current.acceptance_criteria.map(criterion=>({criterion,passed:false,evidence:'人工夹具：需修改'})),
    gap_results:[{gap_id:'G1',status:'remaining',evidence:'人工夹具：尚有差距',remaining_issue:'继续真实场景验证'}]};
  await page.getByText('接收 A 的成果复核',{exact:true}).click();
  async function receive(r){await page.locator('#a-review-json').fill(JSON.stringify(r));await page.locator('#a-review-form button').click();}
  await receive(review);await page.getByText('A 复核的成果版本与当前提交不一致',{exact:true}).waitFor();
  assert.equal((await state(id)).artifact_reviews,undefined);
  review.artifact_version=2;await receive(review);await page.locator('#received-reviews p').waitFor();
  assert.equal((await state(id)).plan.tasks[0].status,'pending_review');
  checks.push('review-version-rejection-and-no-auto-completion');
  async function approve(){await task.getByRole('button',{name:'验收通过',exact:true}).click();await page.locator('#note').fill('人工逐条核对');await page.locator('#reviewer').selectOption('captain');for(let i=0;i<current.acceptance_criteria.length;i++){await page.locator('.criterion-pass').nth(i).check();await page.locator('.criterion-evidence').nth(i).fill('人工夹具：对应证据已看到');}await page.locator('#feedback-form button[type=submit]').click();}
  await approve();await page.getByText('A 复核仍有验收条件未通过，请退回修改或接收更新后的复核',{exact:true}).waitFor();
  await page.locator('#cancel').click();review.review_id='browser-review-2';for(const row of review.criterion_results)row.passed=true;
  await receive(review);await page.waitForFunction(()=>project.artifact_reviews.length===2);
  await approve();await task.getByRole('button',{name:'验收通过',exact:true}).waitFor({state:'detached'});
  await page.reload();await page.waitForFunction(()=>project?.plan?.tasks[0].status==='completed');
  p=await state(id);assert.equal(p.artifact_reviews.length,2);assert.equal(p.plan.tasks[0].external_review.packet.gap_results[0].status,'remaining');
  assert.equal(p.plan.tasks[0].review.criterion_results.length,2);assert.equal(p.live_verified,false);
  checks.push('failed-A-review-blocks-manual-approval', 'task-pass-keeps-gap-and-history-after-reload');
  // Hold media decoding, change server state, and verify the request cannot bind
  // old frames to a different/newer task or silently submit with the new version.
  const d=structuredClone(p.diagnosis);d.diagnosis_version=2;const extra=structuredClone(d.gaps[0]);extra.gap_id='G2';extra.target_result='第二个人工任务';d.gaps.push(extra);
  p=await post('diagnosis',{project_id:id,expected_version:p.version,diagnosis:d});
  p=await post('generate-b',{project_id:id,expected_version:p.version});
  p=await post('apply',{project_id:id,expected_version:p.version,proposal_id:p.proposal.id});
  await page.locator('#refresh').click();await page.locator('#rescue-task').selectOption('G2:deliver');
  await page.evaluate(()=>{rescueMediaFrames=async()=>new Promise(r=>{window.releaseMedia=r;});});
  await page.locator('#rescue-note').fill('媒体读取中改变材料');await page.locator('#rescue-start').click();
  await page.waitForFunction(()=>typeof window.releaseMedia==='function');
  p=await state(id);await post('brief',{project_id:id,expected_version:p.version,content:'媒体处理时新增材料'});
  await page.locator('#refresh').click();await page.waitForFunction(()=>project.diagnosis_needs_refresh);
  await page.evaluate(()=>window.releaseMedia([]));
  await page.getByText('媒体读取期间任务或版本变化，请重新选择后提交',{exact:true}).waitFor();
  assert.equal((await state(id)).rescue_requests.length,2);
  assert.ok((await page.locator('#linked-rescue-results').innerText()).includes('旧诊断或旧计划'));
  checks.push('media-concurrency-rejects-wrong-binding', 'old-help-visibly-stale-after-new-input');
  fs.mkdirSync(path.join(__dirname,'test-output'),{recursive:true});
  await page.locator('#handoff-panel').screenshot({path:path.join(__dirname,'test-output/handoff-panel.png')});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(__dirname,'test-output/handoff-mobile.png'),fullPage:true});
  checks.push('mobile-no-horizontal-overflow');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,fixture:'human-authored-A-and-worker',checks,browserErrors:errors}));
 } finally {
  if(browser)await browser.close();
  if(server){const done=new Promise(r=>server.once('exit',r));server.kill();await done;}
  fs.rmSync(temp,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
