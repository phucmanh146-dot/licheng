// DOM contract tests, using fixture APIs. No claim of live WeChat / Obsidian.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(path.resolve(process.argv[2],'package.json'));
const {Window}=await import(pathToFileURL(require.resolve('happy-dom')).href);
const win=new Window({url:'http://127.0.0.1:8877/index.html',settings:{enableJavaScriptEvaluation:true}});
const root=path.dirname(new URL(import.meta.url).pathname), calls=[], errors=[];
win.addEventListener('error',e=>errors.push(e.message));
win.document.write('<div class="app-topbar-right"></div><button id="syRemoteEntry">微信跟随</button><section class="sykv-toolbar"><div class="sykv-actions"><button>连接 Obsidian</button></div></section>');
let account='alice',pool=[],seq=0;
const data={tasks:[{id:'existing',name:'原任务',done:false}],categories:['学习']};
win.SY={get currentAccountKey(){return account;},getAcctData:()=>data,saveAcctData:()=>{},refreshCurrentView:()=>{},todayKey:()=> '2026-10-14'};
const project={id:'p1',version:1,title:'已有目标',dailyMinutes:60,outcome:'',deadline:''};
const run={id:'r1',projectId:'p1',project,status:'answered',stage:'diagnose',sources:[{id:'source-1',title:'笔记',text:'导入正文'}],
  diagnosis:{summary:'摘要',answer:'分析回答',keyPoints:[],unknowns:[],relevantSources:[],steps:[],productOptimization:[{text:'优化导入',sourceIds:['source-1']}],technicalPlan:[]},events:[],warnings:[],question:'怎么改'};
function add(items){for(const item of items){const old=pool.find(m=>m.content===item.content && m.sourceRef===item.sourceRef);if(old)old.selected=true;else pool.push({...item,id:'m'+(++seq),selected:true});}}
win.fetch=async(url,options={})=>{
  const route=new URL(url,win.location.href).pathname,input=options.body?JSON.parse(options.body):null;
  calls.push({route,input});let result={};
  if(route.endsWith('/session'))result={token:'fixture'};
  else if(route.endsWith('/materials'))result={materials:account==='alice'?pool:[]};
  else if(route.endsWith('/materials-add')){const before=pool.length;add(input.materials);result={materials:pool,addedIds:pool.slice(before).map(m=>m.id),existingIds:[]};}
  else if(route.endsWith('/materials-change')){if(input.action==='remove')pool=pool.filter(m=>m.id!==input.id);else pool.find(m=>m.id===input.id).selected=input.selected;result={materials:pool};}
  else if(route.endsWith('/state'))result={projects:[project],runs:[]};
  else if(route.endsWith('/health'))result={ai:{verified:false},providers:[]};
  else if(route.endsWith('/obsidian-status'))result={connected:true,activeVaultId:'vault1',vaults:[{vaultId:'vault1',name:'真实库 fixture',recent:[{path:'学习/笔记.md',title:'最近笔记'}]}]};
  else if(route.endsWith('/obsidian-import')){add([{source:'obsidian',title:'最近笔记',content:'Obsidian Markdown 正文 fixture',sourceRef:'vault1/学习/笔记.md'}]);result={materials:pool,addedIds:[pool.at(-1).id],existingIds:[]};}
  else if(route.endsWith('/wechat-search'))result={keyword:input.keyword,groups:[{name:'学习群'}],messages:[{text:'需要的 RAG 消息'},{text:'不想导入的消息'}],text:'不应该自动导入的所有搜索结果'};
  else if(route.endsWith('/project'))result={...project,...input};
  else if(route.endsWith('/run'))result=options.method==='POST'?{id:'r1'}:run;
  else if(route.endsWith('/obsidian-save'))result={saved:true,path:'上岸鸭输出/PRD.md'};
  else throw Error('unhandled fixture '+route);
  return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
};
win.eval(fs.readFileSync(path.join(root,'growth-workspace.js'),'utf8'));
const settle=()=>new Promise(r=>setTimeout(r,30));
const dialog=()=>win.document.querySelector('.growth-dialog');
const click=text=>{const b=[...dialog().querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,'button '+text);b.click();};
try{
  assert.equal(win.document.querySelector('[data-growth-obsidian]').textContent,'打开我的 Obsidian');
  win.SYGrowth.open({title:'正在写的目标',question:'我的问题'});await settle();
  assert.ok(dialog());assert.match(dialog().querySelector('[data-obsidian]').textContent,/最近笔记/);
  const note=[...dialog().querySelectorAll('button')].find(b=>b.textContent==='最近笔记');
  note.dispatchEvent(new win.MouseEvent('dblclick'));await settle();
  assert.equal(pool.length,1);assert.match(dialog().querySelector('[data-pool]').textContent,/Obsidian Markdown 正文/);
  dialog().querySelector('[name=wxDirectKeyword]').value='RAG';dialog().querySelector('[data-wechat-search]').click();await settle();
  assert.equal(pool.length,1,'search never auto-imports');
  const choices=dialog().querySelectorAll('.growth-wx-choice input');assert.equal(choices.length,2);assert.equal(choices[0].checked,false);
  choices[0].checked=true;choices[0].dispatchEvent(new win.Event('change'));click('将所选消息加入资料池');await settle();
  assert.equal(pool.length,2);assert.equal(pool[1].content,'需要的 RAG 消息');assert.ok(!pool.some(m=>m.content.includes('不想导入')));
  assert.match(dialog().querySelector('[data-wechat-results]').textContent,/你想用这些资料做什么/);
  const checks=dialog().querySelectorAll('[data-pool] input[type=checkbox]');checks[1].checked=false;checks[1].dispatchEvent(new win.Event('change'));await settle();
  dialog().querySelector('[name=links]').value='https://example.org/not-selected';
  dialog().querySelector('[data-analyze]').click();await settle();
  const start=calls.find(c=>c.route.endsWith('/run')&&c.input);assert.deepEqual(start.input.materialIds,[pool[0].id]);
  assert.equal(start.input.links,'','analysis cannot silently fetch unselected draft links');
  assert.match(dialog().querySelector('[data-result]').textContent,/产品优化/);
  click('保存到 Obsidian');await settle();
  assert.match(calls.find(c=>c.route.endsWith('/obsidian-save')).input.content,/## 当前问题/);
  win.SYGrowth.close();win.SYGrowth.open({wechatCapture:{text:'框选原文',keyword:'截图',messages:[]}});await settle();
  assert.equal(dialog().querySelector('[name=title]').value,'正在写的目标','remote return retains goal');
  assert.equal(dialog().querySelector('[name=question]').value,'我的问题','remote return retains question');
  assert.ok(pool.some(m=>m.content==='框选原文'));assert.equal(data.tasks.length,1,'original tasks preserved');
  win.SYGrowth.close();account='bob';win.SYGrowth.open();await settle();
  assert.ok(!dialog().querySelector('[data-pool]').textContent.includes('需要的 RAG 消息'),'account switch does not reuse previous materials');
  assert.deepEqual(errors,[]);
  console.log('PASS: note double click, explicit WeChat selection, durable pool, selected context, PRD save, remote draft restore, account switch');
}finally{await win.happyDOM.close();}
