// DOM integration test only; API replies are fixtures and are not live AI evidence.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root = process.argv[2];
const require = createRequire(process.argv[3]);
const {Window} = await import(pathToFileURL(require.resolve('happy-dom')).href);
const win = new Window({url:'http://127.0.0.1:8877/index.html', settings:{enableJavaScriptEvaluation:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
const errors = [];
win.addEventListener('error', e => errors.push(e.message));
const project = {id:'project-fixture',version:1,title:'需求笔记',dailyMinutes:60,deadline:'',outcome:''};
const run = {id:'run-fixture',projectId:project.id,project,status:'succeeded',stage:'review',events:[],warnings:[],totalMinutes:25,
  sources:[{id:'source-1',title:'资料示例',text:'<img src=x onerror=alert(1)>',url:'https://example.org/requirements',kind:'text'}],
  question:'怎样整理需求？',diagnosis:{summary:'一页需求笔记',answer:'先写出访谈目标，再核对验收条件。',steps:['整理一页需求笔记'],relevantSources:[{id:'source-1',why:'提供目标和验收要求'}],keyPoints:['目标与验收要求'],gaps:[],unknowns:[]},
  drafts:[{id:'draft-1',name:'整理一页需求',minutes:25,owner:'待分配',firstStep:'写下目标',deliverable:'需求笔记',check:'包含目标与验收要求',sourceIds:['source-1'],dueDate:''}]};
let started = false;
let materialPool = [];
const calls=[];
const payloads = {'/api/health':{ok:true,capabilities:{ai:false}},'/api/ai-config':{configured:false},'/api/ai-providers':{providers:[]},'/api/cc-switch':{providers:[]},
  '/api/growth/session':{token:'fixture-token'},'/api/growth/health':{ai:{verified:false},providers:[]}};
win.fetch = async (url, options={}) => {
  const p = new URL(url,win.location.href).pathname;
  const input=options.body?JSON.parse(options.body):null;calls.push({path:p,body:input});
  let body = payloads[p] || {ok:true};
  if(p==='/api/growth/materials') body={materials:materialPool};
  if(p==='/api/growth/obsidian-status') body={connected:false,vaults:[],activeVaultId:null};
  if(p==='/api/growth/materials-add') {
    const added=[];
    for(const m of input.materials){const old=materialPool.find(saved=>saved.content===m.content&&saved.sourceRef===m.sourceRef);if(old)old.selected=true;else{const id='material-'+(materialPool.length+1);materialPool.push({...m,id,selected:true});added.push(id);}}
    body={materials:materialPool,addedIds:added,existingIds:[]};
  }
  if(p==='/api/growth/state') body = {projects:[project],runs:started?[run]:[]};
  if(p==='/api/growth/project') body = {...project,...JSON.parse(options.body),id:project.id,version:2};
  if(p==='/api/growth/run') { if(options.method==='POST'){started=true;run.status=input.analysisOnly?'answered':'succeeded';body={id:run.id};} else body=run; }
  if(p==='/api/growth/retry'){run.status=input.analysisOnly?'answered':'succeeded';body={id:run.id};}
  if(p==='/api/growth/wechat-search') body={count:1,groupCount:1,groups:[{name:'RAG 学习群'}],messages:[{text:'关键词 RAG：学习资料 https://example.org/rag'}],conversations:['其他会话：2条相关聊天记录'],text:'关键词 RAG：学习资料 https://example.org/rag',source:'wechat-accessibility'};
  return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
};
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script\b[^>]*src="\.\/([^"]+)"[^>]*>/g)].map(m=>m[1]);
win.document.write(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,''));win.document.close();
for(const name of scripts){try{const overlay=path.join(process.argv[4]||root,name);win.eval(fs.readFileSync(fs.existsSync(overlay)?overlay:path.join(root,name),'utf8'));}catch(e){errors.push(name+': '+e.message);}}
win.document.dispatchEvent(new win.Event('DOMContentLoaded'));
const settle=()=>new Promise(r=>setTimeout(r,80));
try {
  await settle();
  const S=win.SY;assert.ok(S,'original core API loads');
  S.enterApp('验证空间','qa');await settle();
  const original={id:'existing',name:'保留原任务',category:'学习',date:S.todayKey(),done:false,order:1};
  const data=S.getAcctData();data.tasks=[original];S.saveAcctData(data);
  S.switchAppView('knowledge');await settle();
  let form=win.document.querySelector('#syRouteForm');assert.ok(form,'original route form available');
  form.querySelector('[data-route-field=name]').value='我的竞赛目标';
  form.querySelector('[data-route-field=sourceText]').value='需要整理访谈中的目标与验收条件。';
  const entry=form.querySelector('[data-growth-route] button');assert.ok(entry,'entry mounted inside original route');entry.click();await settle();
  let dialog=win.document.querySelector('.growth-dialog');assert.ok(dialog, JSON.stringify({errors,account:S.currentAccountKey,option:typeof win.Option}));
  assert.equal(dialog.querySelector('[name=title]').value,'我的竞赛目标');
  assert.match(dialog.querySelector('input[type=file]').accept,/video\/mp4/);
  assert.match(dialog.querySelector('input[type=file]').accept,/\.pdf/);
  dialog.querySelector('[name=question]').value=run.question;
  dialog.querySelector('[name=wxDirectKeyword]').value='RAG';
  dialog.querySelector('[data-wechat-search]').click();await settle();
  assert.ok(calls.some(c=>c.path==='/api/growth/wechat-search'&&c.body.keyword==='RAG'));
  assert.ok(!calls.some(c=>c.path==='/api/growth/wechat-groups'),'global keyword search has no group prerequisite');
  assert.match(dialog.querySelector('[data-wechat-results]').textContent,/RAG 学习群/);
  assert.match(dialog.querySelector('[data-wechat-results]').textContent,/尚未展开消息/);
  assert.equal(materialPool.length,0,'search alone never imports messages');
  const choice=dialog.querySelector('.growth-wx-choice input');choice.checked=true;choice.dispatchEvent(new win.Event('change'));
  Array.from(dialog.querySelectorAll('button')).find(b=>b.textContent==='将所选消息加入资料池').click();await settle();
  assert.match(materialPool[0].content,/example.org\/rag/);
  dialog.querySelector('[data-analyze]').click();await settle();
  assert.match(dialog.querySelector('[name=text]').value,/先写出访谈目标/);
  assert.match(dialog.querySelector('[name=text]').value,/https:\/\/example.org\/requirements/);
  assert.equal(calls.find(c=>c.path==='/api/growth/run'&&c.body).body.analysisOnly,true);
  Array.from(dialog.querySelectorAll('button')).find(b=>b.textContent==='返回原始正文').click();
  assert.equal(dialog.querySelector('[name=text]').value,'需要整理访谈中的目标与验收条件。');
  dialog.querySelector('[data-analyze]').click();await settle();
  assert.match(dialog.querySelector('[name=text]').value,/先写出访谈目标/);
  dialog.querySelector('[data-run]').click();await settle();
  assert.equal(calls.filter(c=>c.path==='/api/growth/run'&&c.body).length,1,'saved sources reused; generated answer is not reimported as evidence');
  assert.equal(dialog.querySelectorAll('[data-draft]').length,1);
  assert.equal(dialog.querySelectorAll('.growth-source img').length,0,'source content remains literal text');
  const save=Array.from(dialog.querySelectorAll('button')).find(b=>b.textContent==='保存所选任务，同时存入备忘');
  assert.ok(save);save.click();await settle();
  let saved=S.getAcctData();assert.equal(saved.tasks.length,2);assert.deepEqual(JSON.parse(JSON.stringify(saved.tasks[0])),original);
  assert.equal(saved.growthMemos.length,1);assert.equal(saved.tasks[1].growthSourceKey,'draft-1');
  Array.from(dialog.querySelectorAll('button')).find(b=>b.textContent==='保存所选任务，同时存入备忘').click();await settle();
  assert.equal(S.getAcctData().tasks.length,2,'repeat apply is idempotent');
  win.SYGrowth.close();win.SYGrowth.open();await settle();
  dialog=win.document.querySelector('.growth-dialog');assert.ok(dialog.querySelector('[data-memos]').textContent.includes('先写出访谈目标'));
  assert.equal(dialog.querySelector('[name=text]').value,'需要整理访谈中的目标与验收条件。','reopening retains original composer');
  assert.equal(win.document.querySelectorAll('[data-growth-open]').length,1,'toolbar entry does not duplicate');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,checks:['original-route-entry','goal-prefill','media-inputs','wechat-direct-search','wechat-links','question-to-body','source-citations','original-body-preserved','no-generated-evidence','literal-source','task-and-memo-write','idempotency','reopen','preserve-existing-task']}));
} finally {await win.happyDOM.close();}
