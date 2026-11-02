// Isolated UI fixtures: no real users, model quality, or business outcomes claimed.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'contest-progress-fixture-'));
const server=spawn('python',['-X','utf8','learning_agent_server.py','--port','8978'],{cwd:__dirname,env:{...process.env,SHANGAN_AGENT_DATA:temp},stdio:'ignore'});
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.setDefaultTimeout(10000);
 for(let i=0;i<50;i++){try{await fetch('http://127.0.0.1:8978/api/agent/health');break}catch{await new Promise(r=>setTimeout(r,100))}}
 await page.goto('http://127.0.0.1:8978/contest-progress.html');
 assert.match(await page.title(),/赛事/);
 await page.locator('#projectId').fill('missing-fixture-project');await page.locator('button').click();await page.getByRole('status').filter({hasText:'BLOCKED'}).waitFor();
 await page.screenshot({path:path.join(__dirname,'../evidence/2026-11-02/contest-progress-live-blocked.png'),fullPage:true});
 await page.route('**/api/agent/team/evidence-score?*',r=>r.fulfill({json:{project_version:7,rubric:'fixture coverage, not contest score',roles:[{role:'A',criteria:[{label:'fixture source',status:'missing',comment:'<script>unsafe</script>'}]}]}}));
 await page.route('**/api/agent/team/cc-board?*',r=>r.fulfill({json:{windows:[{label:'A fixture',stage:'waiting',status:'blocked',current_item:'fixture only',source:'derived',live:false}]}}));
 await page.locator('button').click();await page.getByRole('status').filter({hasText:'读取成功'}).waitFor();assert.match(await page.locator('#result').innerText(),/非实时窗口心跳/);assert.equal(await page.locator('#result script').count(),0);
 await page.route('**/api/agent/team/cc-board?*',r=>r.fulfill({status:503,body:'unavailable'}));await page.locator('button').click();await page.getByRole('status').filter({hasText:'BLOCKED'}).waitFor();assert.equal(await page.locator('#result').innerText(),'');assert.deepEqual(errors,[]);
 console.log(JSON.stringify({status:'PASS',kind:'isolated-browser-fixture',checks:['live-page-load','unknown-project-fail-closed','fixture-derived-not-heartbeat','untrusted-text-rendered-safely','failure-clears-stale-progress'],realUser:false,modelQualityEvaluated:false}));
 }finally{await browser.close();server.kill();console.log('Fixture data retained for inspection: '+temp)}})().catch(e=>{server.kill();console.error(e);process.exitCode=1});
