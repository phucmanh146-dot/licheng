/* Real browser -> API -> loopback mock model -> SQLite. No live vision claim. */
const {spawn,spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const temp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'duck-rescue-'));
const python=process.env.PYTHON||'python',port=8916,modelPort=8917,base=`http://127.0.0.1:${port}`;
const env={...process.env,SHANGAN_AGENT_DATA:temp,FOCUS_AI_BASE_URL:`http://127.0.0.1:${modelPort}/v1`,FOCUS_AI_MODEL:'explicit-mock-vision',FOCUS_AI_API_KEY:''};
const imagePath=path.join(temp,'fixture.png'),videoPath=path.join(temp,'fixture.webm');
const visionCalls=[],planningCalls=[],errors=[];let server,browser,gateway,log='';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function checked(command,args){const r=spawnSync(command,args,{cwd:__dirname,env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;}
function mockAnswer(context){
 const frame=context.frames.find(f=>f.timestamp===1.25)||context.frames[0];
 return {action:'finish',title:'测试夹具：截图卡点解答',answer:'测试返回：先记录报错原文，再核对输入内容。',
  observed:[{text:'测试模型返回的画面描述，不代表实际识别能力',frameIndex:frame?.frameIndex??null}],
  possibleCauses:['测试推测：需要补充完整错误信息'],missingInfo:['请补充软件名称与版本'],sourceIds:[],success:'完整报错已记录',
  steps:[{title:'记录错误文字',instruction:'在报错区域复制完整错误信息。',minutes:3,result:'完整错误文本',check:'文字可以完整阅读',onFailure:'放大错误区域并补一张截图',frameIndex:frame?.frameIndex??null}]};
}
(async()=>{try{
 checked(python,['-c',"from PIL import Image,ImageDraw; import sys; im=Image.new('RGB',(400,220),'white'); ImageDraw.Draw(im).text((20,60),'TEST FIXTURE E42',fill='black'); im.save(sys.argv[1])",imagePath]);
 checked('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=320x200:rate=10','-t','3','-c:v','libvpx-vp9','-deadline','realtime',videoPath]);
 gateway=http.createServer(async(req,res)=>{try{let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);assert.equal(req.url,'/v1/chat/completions');const messages=body.messages;const content=messages.find(m=>m.role==='user').content;let reply;
  if(Array.isArray(content)){const images=content.filter(x=>x.type==='image_url');assert.ok(images.length>=1&&images.length<=6);for(const image of images){const data=Buffer.from(image.image_url.url.split(',')[1],'base64');assert.equal(data.subarray(0,2).toString('hex'),'ffd8');assert.ok(data.length>100);}visionCalls.push(images.length);reply='测试画面描述：有一条提示，需要确认文字。';}
  else{const context=JSON.parse(content);planningCalls.push(context);reply=JSON.stringify(mockAnswer(context));}
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{role:'assistant',content:reply}}]}));
 }catch(error){errors.push(error.message);res.writeHead(500);res.end('{}');}});
 await new Promise(r=>gateway.listen(modelPort,'127.0.0.1',r));
 server=spawn(python,['learning_agent_server.py','--port',String(port)],{cwd:__dirname,env});server.stderr.on('data',x=>log+=x);
 let ready=false;for(let i=0;i<60;i++){try{const r=await fetch(base+'/api/agent/health');if(r.ok){ready=true;break;}}catch{}await wait(150);}assert.ok(ready,log);
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/learning-agent.html');
 await page.locator('#open-rescue').click();assert.equal(await page.locator('#planning-settings').isVisible(),false);
 await page.locator('#goal').fill('测试：这张截图里的提示应该怎么处理？');await page.locator('#media').setInputFiles(imagePath);await page.locator('#media-preview img').waitFor();await page.locator('#start').click();
 await page.locator('#help-answer').waitFor({timeout:30000});await page.getByText('如果没有成功：放大错误区域并补一张截图').waitFor();
 assert.deepEqual(visionCalls,[1]);assert.equal(await page.locator('.task-card').count(),1);assert.equal(planningCalls[0].sources.length,0);
 let state=await (await fetch(base+'/api/agent/state')).json();const original=state.routes[0];assert.equal(original.frameCount,1);assert.equal(original.hasWebEvidence,false);
 await page.getByRole('button',{name:'还没解决，继续补图追问',exact:true}).click();assert.match(await page.locator('#followup-context').textContent(),/继续解答/);assert.equal(await page.locator('#media').evaluate(x=>x.files.length),0);
 await page.locator('#goal').fill('测试：第一步之后仍然报错，重点看录屏第1.25秒。');await page.locator('#media').setInputFiles(videoPath);await page.locator('#video-focus').fill('8');await page.locator('#start').click();await page.getByText(/重点秒数需在/).waitFor();assert.equal(visionCalls.length,1);
 await page.locator('#video-focus').fill('1.25');await page.locator('#start').click();await page.getByText('本次只分析了 6 张采样画面，没有分析声音。').waitFor({timeout:30000}).catch(async error=>{throw new Error(error.message+'; form='+await page.locator('#form-error').textContent()+'; events='+await page.locator('#events').textContent()+'; vision='+JSON.stringify(visionCalls)+'; modelCalls='+planningCalls.length);});
 assert.deepEqual(visionCalls,[1,6]);assert.equal(planningCalls[1].previousHelp.goal,original.goal);assert.ok(planningCalls[1].frames.some(f=>f.timestamp===1.25));
 assert.match(await page.locator('#help-answer').textContent(),/录屏第 1.25 秒/);
 state=await (await fetch(base+'/api/agent/state')).json();assert.equal(state.routes[0].previousRouteId,original.id);assert.equal(state.routes[0].help.observed[0].timestamp,1.25);
 await page.reload();await page.locator('#help-answer').waitFor();assert.equal(await page.locator('#mode').inputValue(),'rescue');assert.match(await page.locator('#help-answer').textContent(),/录屏第 1.25 秒/);
 fs.mkdirSync(path.join(__dirname,'test-output'),{recursive:true});await page.screenshot({path:path.join(__dirname,'test-output/rescue-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(__dirname,'test-output/rescue-mobile.png'),fullPage:true});
 const privacy=JSON.parse(checked(python,['-c',"import sqlite3,json,os; c=sqlite3.connect(os.path.join(os.environ['SHANGAN_AGENT_DATA'],'agent.sqlite3')); rows=c.execute('select input,result from runs').fetchall(); print(json.dumps({'hasFrames':any('data:image/' in str(r) for r in rows),'count':len(rows)}))"]));assert.equal(privacy.hasFrames,false);assert.equal(privacy.count,2);assert.deepEqual(errors,[]);
 const report={ok:true,checks:['PNG-to-JPEG-model-transport','direct-answer-and-failure-branch','single-focused-task','followup-context','invalid-focus-time-blocked','video-six-frames-including-focus','server-verified-timestamp','saved-answer-reload','raw-media-not-in-SQLite','mobile-no-overflow'],model:'loopback HTTP mock; real vision understanding NOT tested',browserErrors:errors};fs.writeFileSync(path.join(__dirname,'test-output/rescue-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(browser)await browser.close();if(server){const ended=new Promise(r=>server.once('exit',r));server.kill();await ended;}if(gateway)await new Promise(r=>gateway.close(r));fs.rmSync(temp,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
