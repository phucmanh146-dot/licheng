// Real UI/HTTP/SQLite with explicit fixture search/model replies. No live contest claim.
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'competition-ui-')),base='http://127.0.0.1:8934';
let server,browser;const errors=[],checks=[];
(async()=>{try{
 const bootstrap=`import json,runpy,sys
import learning_agent as a
a.rescue.validate_url=lambda url: None
a.read_url=lambda url: {'text':'人工测试通知，不是官方规则','readStatus':'fulltext','method':'fixture'}
a.rescue.search_web=lambda query,n: {'provider':'fixture','results':[{'title':query,'url':'https://example.com/synthetic-notice','snippet':'人工检索夹具'}]}
a.rescue.public_config=lambda: {'configured':True,'model':'fixture','verified':False}
a.rescue.config_snapshot=lambda: {'model':'fixture'}
def answer(messages,cfg):
 context=json.loads(messages[1]['content'])
 return json.dumps({'action':'finish','title':'人工规划夹具：'+context['competitionName'],'tasks':[{'id':'T1','title':'核对一条需求证据','minutes':5,'dependsOn':[],'deliverable':'证据位置记录','acceptance':'原文可追溯','firstStep':'打开当前报告','sourceIds':['S1'],'actions':[{'title':'记录原文位置','instruction':'打开报告第2.1节，记录一句结论的来源位置','minutes':5,'result':'位置记录','check':'可以回到原文'}]}]},ensure_ascii=False)
a.rescue.complete=answer
sys.argv=['learning_agent_server.py','--port','8934']
runpy.run_path('learning_agent_server.py',run_name='__main__')`;
 server=spawn('python',['-c',bootstrap],{cwd:__dirname,env:{...process.env,SHANGAN_AGENT_DATA:temp},stdio:'ignore'});
 let ready=false;for(let i=0;i<50;i++){try{if((await fetch(base+'/api/agent/state')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1365,height:1000}});page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/learning-agent.html');
 assert.equal(await page.locator('#competition-name').inputValue(),'');assert.equal(await page.locator('#goal').inputValue(),'');assert.equal(await page.locator('#deadline').inputValue(),'');
 await page.getByText('看一个案例（全部为假设）',{exact:true}).click();
 assert.equal(await page.locator('#competition-name').inputValue(),'');assert.equal(await page.locator('#deadline').inputValue(),'');
 checks.push('example-does-not-prefill-real-contest-goal-or-deadline');
 const invalid=await fetch(base+'/api/agent/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'competition',goal:'完善报告',settings:{dailyMinutes:60,startDate:'2026-10-11'}})});
 assert.equal(invalid.status,400);assert.match((await invalid.json()).error,/实际赛事名称/);
 assert.equal((await (await fetch(base+'/api/agent/state')).json()).runs.length,0);
 checks.push('missing-contest-rejected-before-queue');
 await page.locator('#competition-name').fill('人工赛事甲 · 示例届次');await page.locator('#goal').fill('完善当前报告的需求证据');
 await page.locator('#start').click();await page.getByRole('heading',{name:'人工规划夹具：人工赛事甲 · 示例届次',exact:true}).waitFor();
 let state=await (await fetch(base+'/api/agent/state')).json();const first=state.routes[0];
 assert.equal(first.competitionName,'人工赛事甲 · 示例届次');assert.equal(first.settings.deadline,'');assert.equal(first.sources.length,1);assert.match(first.sources[0].title,/人工赛事甲/);
 assert.equal(first.sources[0].url,'https://example.com/synthetic-notice');
 checks.push('selected-contest-reaches-search-model-and-saved-route');
 await page.locator('#competition-name').fill('人工赛事乙 · 另一赛道');await page.locator('#start:enabled').waitFor();await page.locator('#start').click();
 await page.getByRole('heading',{name:'人工规划夹具：人工赛事乙 · 另一赛道',exact:true}).waitFor();
 state=await (await fetch(base+'/api/agent/state')).json();const second=state.routes.find(r=>r.competitionName==='人工赛事乙 · 另一赛道');
 assert.ok(second);assert.equal(second.sources.length,1);assert.match(second.sources[0].title,/人工赛事乙/);assert.ok(!second.sources[0].title.includes('人工赛事甲'));
 await page.reload();await page.getByRole('heading',{name:'人工规划夹具：人工赛事乙 · 另一赛道',exact:true}).waitFor();
 checks.push('different-contest-does-not-reuse-fixed-seeds-and-persists');
 await page.locator('#mode').selectOption('learning');assert.equal(await page.locator('#competition-field').isVisible(),false);assert.equal(await page.locator('#competition-name').isDisabled(),true);
 await page.locator('#open-rescue').click();assert.equal(await page.locator('#competition-field').isVisible(),false);assert.equal(await page.locator('#competition-name').evaluate(x=>x.required),false);
 checks.push('learning-and-rescue-do-not-require-contest');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 checks.push('mobile-no-overflow');assert.deepEqual(errors,[]);
 console.log(JSON.stringify({ok:true,fixture:'human-authored-search-and-model',checks,browserErrors:errors}));
}finally{if(browser)await browser.close();if(server){const done=new Promise(r=>server.once('exit',r));server.kill();await done;}fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
