/* Local integration test. Route data is explicitly a fixture; no live LLM claim. */
const {spawn, spawnSync} = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict');
const dependency = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const {chromium} = require(dependency ? path.join(dependency,'playwright') : 'playwright');
const dataDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(),'duck-ui-'));
const env={...process.env, SHANGAN_AGENT_DATA:dataDir};
const fixture = `import learning_agent as a
from agent_schedule import schedule
items=[]
for i,nums in enumerate(([5,15,10],[5,20,5])):
 id='T'+str(i+1)
 t={'id':id,'title':['梳理真实学习卡点','验证联网原型'][i],'phase':'测试阶段','minutes':sum(nums),'dependsOn':[] if i==0 else ['T1'],'status':'todo','firstStep':'打开材料写下本次目标','deliverable':'可核对的记录','acceptance':'目标、操作、结果均有记录','sourceIds':[]}
 t['actions']=[{'id':id+'-A'+str(j+1),'title':['准备材料','执行操作','核对并记录'][j],'instruction':['打开项目，写下一条明确查询','提交查询并保存返回的来源','逐条打开来源，记录是否支持建议'][j],'minutes':n,'result':'本步骤记录','check':'有可复查的文本或截图','status':'todo'} for j,n in enumerate(nums)]
 items.append(t)
r=a.save_route(dict(schedule(items,{'startDate':'2026-10-08','deadline':'2026-10-12','dailyMinutes':60}),id='b'*32,title='测试夹具：上岸鸭学习路线',goal='浏览器测试，非模型生成',summary='这些数据仅用于验证真实页面、接口与持久化。',assumptions=[],sources=[],tutorialSteps=[]),'UI test fixture')
`;
const seeded=spawnSync(process.env.PYTHON||'python',['-c',fixture],{cwd:__dirname,env,encoding:'utf8'});
if(seeded.status!==0)throw new Error(seeded.stderr);
const port=8913, base=`http://127.0.0.1:${port}`;
let server, browser, log='';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function startServer(){server=spawn(process.env.PYTHON||'python',['learning_agent_server.py','--port',String(port)],{cwd:__dirname,env});server.stderr.on('data',x=>log+=x);for(let i=0;i<40;i++){try{const r=await fetch(base+'/api/agent/health');if(r.ok)return;}catch{}await wait(150);}throw new Error('server not ready: '+log);}
(async()=>{
 try {
  await startServer();
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/learning-agent.html');await page.getByRole('heading',{name:'测试夹具：上岸鸭学习路线'}).waitFor();
  await page.getByRole('button',{name:'我选今天做什么',exact:true}).click();
  await page.locator('#day-date').fill('2026-10-08');await page.locator('#day-windows').fill('19:00-20:30');
  await page.getByRole('button',{name:'生成日程预览',exact:true}).click();await page.getByText('请先勾选今天要做的任务，不能重复勾选').waitFor();
  await page.locator('#day-choices input').nth(0).check();await page.locator('#day-choices input').nth(1).check();
  await page.getByRole('button',{name:'生成日程预览',exact:true}).click();await page.locator('.day-table tbody tr').nth(5).waitFor();
  assert.equal(await page.locator('.day-table tbody tr').count(),6);
  await page.getByRole('button',{name:'采用今天的日程',exact:true}).click();await page.getByRole('heading',{name:'2026-10-08 · 已采用日程'}).waitFor();
  await page.reload();await page.getByRole('heading',{name:'测试夹具：上岸鸭学习路线'}).waitFor();await page.getByRole('button',{name:'我选今天做什么',exact:true}).click();await page.locator('#day-date').fill('2026-10-08');await page.locator('#day-date').dispatchEvent('change');await page.getByRole('heading',{name:'2026-10-08 · 已采用日程'}).waitFor();
  fs.mkdirSync(path.join(__dirname,'test-output'),{recursive:true});await page.screenshot({path:path.join(__dirname,'test-output/desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'逐步行动',exact:true}).click();await page.getByRole('button',{name:'这一步完成了',exact:true}).first().click();
  await page.locator('#completion-evidence').fill('测试：已写下明确查询');await page.locator('#completion-actual').fill('7');await page.getByRole('button',{name:'验收完成',exact:true}).click();await page.getByText('✓ 已完成 · 实际 7 分钟').waitFor();
  let state=await (await fetch(base+'/api/agent/state')).json();assert.equal(state.routes[0].tasks[0].status,'todo');assert.equal(state.routes[0].tasks[0].actions[0].status,'done');
  await page.getByRole('button',{name:'临时有事，重新安排',exact:true}).click();await page.locator('#new-title').fill('测试临时任务');await page.locator('#new-minutes').fill('30');await page.locator('#replan-daily').fill('90');await page.getByRole('button',{name:'预览调整',exact:true}).click();await page.locator('#apply-replan:enabled').waitFor();await page.locator('#apply-replan').click();await page.getByRole('heading',{name:'测试临时任务',exact:true}).waitFor();
  await page.getByRole('button',{name:'撤销修改',exact:true}).click();await page.getByRole('heading',{name:'测试临时任务',exact:true}).waitFor({state:'detached'});
  const foreign=await fetch(base+'/api/agent/day',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'});assert.equal(foreign.status,403);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(__dirname,'test-output/mobile.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const videoResponse=await fetch(base+'/api/agent/tutorial',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({routeId:'b'.repeat(32)})});const video=await videoResponse.json();assert.equal(videoResponse.status,200,JSON.stringify(video));
  const bytes=Buffer.from(await (await fetch(base+video.url)).arrayBuffer());assert.ok(bytes.length>1000);const videoPath=path.join(__dirname,'test-output/steps.mp4');fs.writeFileSync(videoPath,bytes);
  const meta=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','json',videoPath],{encoding:'utf8'});assert.equal(meta.status,0);assert.ok(Number(JSON.parse(meta.stdout).format.duration)>=14);
  const ended=new Promise(resolve=>server.once('exit',resolve));server.kill();await ended;await startServer();state=await (await fetch(base+'/api/agent/state')).json();assert.equal(state.routes[0].tasks[0].actions[0].status,'done');assert.ok(state.routes[0].dailyPlans['2026-10-08']);assert.deepEqual(errors,[]);
  const report={ok:true,checks:['user-selection-required','concrete-timetable','save-and-reload','action-progress','replan-preview-and-apply','undo','foreign-origin-rejected','mobile-no-overflow','MP4-render-and-probe','server-restart-persistence'],model:'fixture (live LLM not tested)',videoBytes:bytes.length,videoSeconds:Number(JSON.parse(meta.stdout).format.duration),browserErrors:errors};
  fs.writeFileSync(path.join(__dirname,'test-output/browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 } finally {if(browser)await browser.close();if(server)server.kill();fs.rmSync(dataDir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
