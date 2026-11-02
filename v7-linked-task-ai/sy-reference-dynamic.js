/* 上岸鸭：截图式动态学习路线/救援工作台。附加原站、只用真实资料与模型结果。 */
(function(){
'use strict';if(window.SYReferenceDynamic)return;
const THEMES=[
 {id:'pm',label:'AI产品经理',key:/产品经理|产品分析|竞品|产品设计|PRD|需求|用户调研|产品能力|产品路线/i},
 {id:'agent',label:'MCP / Agent',key:/MCP|Agent|智能体|OpenClaw|Codex|大模型|LLM|AI工具|提示词|Prompt|模型|RAG/i},
 {id:'cs',label:'智能客服',key:/客服|智能问答|服务机器人|对话系统|自动应答/i},
 {id:'ops',label:'运营创作',key:/运营|视频|剪辑|文案|图文|小红书|副业|拍摄|公众号|个人IP|短视频/i},
 {id:'works',label:'作品集',key:/作品|项目|实战|竞赛|比赛|作品集|简历|面试|交付/i},
 {id:'all',label:'全部知识',key:/.*/}];
const STAGES=[['基础认知','建立核心概念，理解为什么'],['工具与方法','找到能复用的步骤与工具'],['案例实战','用真实任务验证所学'],['作品输出','沉淀笔记、项目和成果']];
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x};
const btn=(name,fn,cls='')=>{const b=el('button','syref-btn '+cls,name);b.type='button';b.addEventListener('click',fn);return b};
const day=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const acct=()=>window.SY?.getAcctData?.()||{tasks:[]}, user=()=>String(window.SY?.currentAccountKey||'guest');
const getLocal=k=>{try{return JSON.parse(localStorage.getItem('syref:v1:'+user()+':'+k)||'null')}catch(_){return null}};
const putLocal=(k,x)=>localStorage.setItem('syref:v1:'+user()+':'+k,JSON.stringify(x));
let root=null,sideA=null,sideB=null,mode='',theme='pm',nodes=[],selected='',readText='',statuses={vault:null,ai:null},vault=[],busy=false,recoveryInterval=null,answer=null,sourceDocs=[],imageOCR='';
const duck='<svg viewBox="0 0 190 170" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M72 41c2-19 21-33 40-31l2-8 11 9c22-2 39 17 39 37 1 18-12 28-16 33 18 15 27 45 20 69-26 18-90 12-126 2-14-17-13-49 2-64 1-12 11-18 28-26z" stroke="#f19a00" stroke-width="4.8" fill="#fffdf8"/><circle cx="83" cy="48" r="4.5" fill="#151a27"/><circle cx="133" cy="48" r="4.5" fill="#151a27"/><ellipse cx="64" cy="65" rx="11" ry="7" fill="#ffdee2"/><ellipse cx="144" cy="66" rx="11" ry="7" fill="#ffdee2"/><path d="M91 58c10-9 25-8 36 1 4 9-8 16-19 17-12 0-25-8-17-18z" fill="#ffac15" stroke="#ec7c13" stroke-width="3"/><path d="M96 65c6-2 14-3 23-2" fill="none" stroke="#ef6818" stroke-width="2.5"/><path d="M145 94c17-3 19-26 23-41" stroke="#ed920d" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M168 54c-5-15-1-20 2-21 8-3 10 5 11 9" stroke="#ef9a06" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M58 103c11-8 26-5 31 8" fill="none" stroke="#ef9a06" stroke-width="4" stroke-linecap="round"/><path d="M95 147c-5 11-5 15-14 17m51-15c4 10 8 13 17 15" fill="none" stroke="#ed920d" stroke-width="4" stroke-linecap="round"/></svg>';
function getTask(){const a=acct(),id=(a.activeTimer||{}).taskId||a.priorityFocusTaskId;return (a.tasks||[]).find(t=>String(t.id)===String(id))||(a.tasks||[]).find(t=>!t.done&&t.date===day())||(a.tasks||[]).find(t=>!t.done)||null;}
async function post(path,payload){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store'});const d=await r.json().catch(()=>({error:'接口未返回JSON'}));if(!r.ok||d.error)throw Error(d.error||'后台接口不可用');return d;}
async function fetchStatuses(){try{const r=await fetch('/api/pm/status',{cache:'no-store'});if(r.ok){const d=await r.json();statuses.vault=d.vault||d.vaultConfig||null;statuses.ai=d.ai||null;vault=Array.isArray(d.vault?.notes)?d.vault.notes:[];if(statuses.vault?.connected){try{const full=await post('/api/vault-list',{limit:1000,with_text:false});if(full.connected&&Array.isArray(full.files)){vault=full.files;statuses.vault={...statuses.vault,count:full.files.length,truncated:!!full.truncated};}}catch(_){}}}}
catch(e){statuses.vault={connected:false,note:'本机服务未响应'};statuses.ai=null;}}
function notes(){const extra=(getLocal('nodes')||[]).filter(x=>x&&x.id&&x.title).map(x=>({...x,kind:x.kind||'manual'}));
const docs=vault.filter(x=>x&&x.path).map(x=>({id:'vault:'+x.path,title:x.title||x.path.split('/').pop(),path:x.path,kind:'vault',updatedAt:x.updatedAt||0,content:'',stage:null}));
const a=acct();
const tasks=(a.tasks||[]).filter(t=>t&&t.name).map(t=>({id:'task:'+t.id,title:t.name,kind:'task',taskId:t.id,task:t,stage:t.done?3:2,content:[t.noteGain,t.noteKnowledge,t.noteRemark,t.noteFramework].filter(Boolean).join('\n')}));
const pool=(a.pmMaterialPool||[]).filter(x=>x&&(x.title||x.url)).slice(0,250).map(x=>({id:'material:'+String(x.id||x.url||x.title),title:x.title||x.url,kind:'material',url:x.url||'',content:x.content||x.description||'',stage:1}));
return [...extra,...tasks,...pool,...docs];}
function getStage(n){if(n.stage!==null&&n.stage!==undefined)return Math.min(3,Math.max(0,Number(n.stage)||0));let s=n.title+' '+(n.path||'');if(/作品|复盘|总结|发布|汇报|PRD|交付|答辩|面试/i.test(s))return 3;if(/项目|案例|实战|竞赛|制作|练习|应用|运营/i.test(s))return 2;if(/工具|教程|技能|方法|配置|操作|流程|使用|技巧/i.test(s))return 1;return 0;}
function filtered(){const t=THEMES.find(t=>t.id===theme)||THEMES[0];return notes().filter(n=>n.theme?t.id==='all'||n.theme===t.id:t.key.test([n.title,n.path||'',n.content||'',n.task?.category||''].join(' ')));}
function activeNode(){return nodes.find(x=>x.id===selected)||nodes[0]||null;}
function progress(){return getLocal('progress')||{};}
function hero(isRescue){return '<div class="syref-hero"><h1>'+ (isRescue?'遇到困难时，先接住你':'学习路线与知识库')+'</h1><p>'+(isRescue?'不管是报错、卡住、看不懂，还是不知道下一步怎么做，上岸鸭都陪你一起找到解决办法。':'把系统的知识，变成可执行的任务，一步一步，陪你上岸。')+'</p><div class="syref-mascot">'+duck+'</div><div class="syref-slogan">'+(isRescue?'卡住了？<br>别担心，我来帮你！':'知识不止于收藏<br>更要变成行动！')+'<br><b>加油！ ♥</b></div></div>';}
function modeOn(which){if(!root)return;window.SY?.switchAppView?.('__reference-dynamic');mode=which;const main=document.querySelector('.app-main');if(main)main.classList.add('syref-active');root.hidden=false;document.querySelectorAll('.syref-nav').forEach(x=>x.classList.toggle('active',x.dataset.syrefPage===which));document.querySelectorAll('.app-nav-item[data-view]').forEach(x=>x.classList.remove('active'));if(which==='route')renderRoute();else renderRescue();if(main)main.scrollTop=0;}
function leave(){mode='';if(root)root.hidden=true;document.querySelector('.app-main')?.classList.remove('syref-active');document.querySelectorAll('.syref-nav').forEach(x=>x.classList.remove('active'));if(recoveryInterval){clearInterval(recoveryInterval);recoveryInterval=null;}}
function open(which){if(!window.SY?.currentAccountKey)return alert('请先登录上岸鸭，再打开学习路线。');modeOn(which);fetchStatuses().then(()=>{if(mode===which){if(which==='route')renderRoute();else renderRescue();}});}
function makePanel(html){const box=el('div');box.innerHTML=html;return box;}
function notify(id,text){const x=root?.querySelector('[data-syref-msg="'+id+'"]');if(x)x.textContent=text;}
function createTask(n){if(!window.SY?.getAcctData||!n)return;const a=acct(),identifier='syref-learning:'+n.id;const exists=(a.tasks||[]).some(t=>String(t.refNodeId||'')===identifier);if(exists){notify('route','这条知识节点已经加入过任务清单。');return;}if(!confirm('将“'+n.title+'”加入今天的原任务清单？不会修改任何已有任务。'))return;
const proposed=Math.max(15,Math.min(120,Number(n.task?.plannedMinutes||n.task?.estMinutes)||40)),minutes=Number(prompt('本节预计投入多少分钟？可稍后按实际耗时修正。',String(proposed)));
if(!Number.isFinite(minutes)||minutes<5||minutes>500)return notify('route','请输入 5–500 分钟。');
const tasks=a.tasks||[];a.tasks=tasks;tasks.push({id:'syref-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),name:n.title,date:day(),done:false,completedAt:null,category:'学习',firstTime:true,multiplier:1,weight:'mid',estMinutes:minutes,plannedMinutes:minutes,startMinutes:null,createdAt:Date.now(),order:tasks.reduce((m,t)=>Math.max(m,Number(t.order||0)),0)+1,refNodeId:identifier,noteFramework:'来源：'+(n.path||n.url||'个人学习路线')});
SY.saveAcctData(a);notify('route','已加入原今日任务。你可以回到“今日任务”开始计时。');}
function renderRoute(){if(mode!=='route')return;nodes=filtered();if(!nodes.some(x=>x.id===selected))selected=nodes[0]?.id||'';
const done=progress(),doneCount=nodes.filter(x=>done[x.id]||x.task?.done).length;
const taskCount=nodes.filter(x=>x.kind==='task').length,realCount=nodes.filter(x=>x.kind==='vault').length;
root.innerHTML=hero(false)+
'<div class="syref-tabbar"><div class="syref-tabs">'+THEMES.map(t=>'<button class="syref-tab '+(theme===t.id?'active':'')+'" data-ref-theme="'+t.id+'">'+esc(t.label)+'</button>').join('')+'</div><button class="syref-btn muted" data-ref-action="old-knowledge">打开原知识库 ↗</button></div>'+
'<div class="syref-grid"><div><div class="syref-panel syref-summary"><div style="font-size:30px">🧰</div><div class="syref-summary-main"><strong>'+esc((THEMES.find(x=>x.id===theme)||THEMES[0]).label)+' 成长路线</strong><p>由本机 Obsidian、资料池和当前账号任务动态生成 · 不展示虚构完成状态</p></div><div class="syref-metric"><b>'+STAGES.length+'</b><small>学习阶段</small></div><div class="syref-metric"><b>'+nodes.length+'</b><small>知识节点</small></div><div class="syref-metric"><b>'+doneCount+'</b><small>已完成</small></div></div>'+
'<div class="syref-panel"><div class="syref-heading"><span class="syref-hico">▣</span>学习路线图 <span style="font-weight:400;color:#9aaac0;font-size:12px;margin-left:auto">'+realCount+' 条原笔记 · '+taskCount+' 项关联任务</span></div>'+
'<div class="syref-stages">'+STAGES.map((stage,i)=>{const group=nodes.filter(x=>getStage(x)===i);return '<div class="syref-stage"><div class="syref-stage-label"><span class="syref-stage-num">'+(i+1)+'</span><div><strong>'+stage[0]+'</strong><p>'+stage[1]+'</p><p>'+group.length+' 个真实节点</p></div></div><div class="syref-stage-cards">'+(group.length?group.map(n=>'<button class="syref-node '+(selected===n.id?'selected ':'')+(done[n.id]||n.task?.done?'done':'')+'" data-ref-node="'+esc(n.id)+'"><span class="syref-nodeicon">'+(n.kind==='vault'?'📘':n.kind==='task'?'🎯':n.kind==='material'?'🔗':'✍️')+'</span><strong>'+esc(n.title)+'</strong></button>').join(''):'<p class="syref-nil">暂无真实关联资料。可连接 Obsidian、导入链接或添加本节知识点。</p>')+'</div></div>';}).join('')+'</div>'+
'<div class="syref-actions"><button class="syref-btn muted" data-ref-action="original-routes">查看已保存的原课程目录</button><button class="syref-btn" data-ref-action="add-node">＋ 添加知识点</button><button class="syref-btn" data-ref-action="add-link">🔗 读取新链接</button><button class="syref-btn muted" data-ref-action="refresh">↻ 从本机同步</button></div><p class="syref-status" data-syref-msg="route"></p></div>'+
'<div class="syref-banner"><span>🦆 让知识真正帮你上岸：阅读、确认、拆成一小步再做。</span><button class="syref-btn primary" data-ref-action="task-current">将选中知识点变成今日任务 →</button></div></div>'+
'<div><div class="syref-panel" id="syref-detail"></div><div class="syref-panel"><div class="syref-heading"><span class="syref-hico">🔗</span>关联知识库</div><div class="syref-linked">'+
linkedCard('Obsidian',statuses.vault?.connected?String(statuses.vault.count||vault.length)+' 篇笔记':'未连接',!!statuses.vault?.connected)+
linkedCard('当前账号','任务 '+(acct().tasks||[]).length+' 项',true)+
linkedCard('AI 模型',statuses.ai?.verified?'已通过实际测试':statuses.ai?.configured?'已配置待验证':'未连接',!!statuses.ai?.verified)+'</div>'+
'<div class="syref-actions"><button class="syref-btn muted" data-ref-action="old-knowledge">管理 Obsidian</button><button class="syref-btn muted" data-ref-action="ai-config">连接 AI</button><button class="syref-btn muted" data-ref-action="hub">读取飞书 / B站 / 网页</button><button class="syref-btn muted" data-ref-action="multi-sources">全网检索 / 来源监测 / API</button></div></div></div></div>';
renderDetail();
root.querySelectorAll('[data-ref-theme]').forEach(b=>b.onclick=()=>{theme=b.dataset.refTheme;selected='';renderRoute();});
root.querySelectorAll('[data-ref-node]').forEach(b=>b.onclick=()=>{selected=b.dataset.refNode;root.querySelectorAll('[data-ref-node]').forEach(x=>x.classList.toggle('selected',x===b));renderDetail();});
root.querySelectorAll('[data-ref-action]').forEach(b=>b.onclick=()=>action(b.dataset.refAction));}
function linkedCard(name,status,active){return '<div class="syref-linked-item"><strong>'+name+'</strong><p><span class="syref-chip '+(active?'green':'')+'">'+esc(status)+'</span></p></div>';}
let detailJob=0;
async function renderDetail(){const host=root?.querySelector('#syref-detail');if(!host)return;const n=activeNode();const stamp=++detailJob;
if(!n){host.innerHTML='<div class="syref-heading">知识节点详情</div><p class="syref-stat-note">当前主题没有找到资料。点击左侧“添加知识点”，或连接 Obsidian、导入真实链接。</p>';return;}
const status=!!(progress()[n.id]||n.task?.done),estimate=n.task?Number(n.task.plannedMinutes||n.task.estMinutes||40):Math.max(10,Math.min(90,Math.ceil((n.content||'').length/300)*5||20));
host.innerHTML='<div class="syref-heading"><span class="syref-hico">☷</span>知识节点详情 <span class="syref-chip '+(status?'green':'')+'" style="margin-left:auto">'+(status?'✓ 已完成':'待学习')+'</span></div>'+
'<h3 class="syref-detail-title">'+esc(n.title)+'</h3><p class="syref-sub"><span class="syref-chip">'+STAGES[getStage(n)][0]+'</span> <span class="syref-chip blue">'+(n.kind==='vault'?'Obsidian 实时笔记':n.kind==='task'?'真实任务':n.kind==='material'?'已保存资料':'自建知识点')+'</span> · 参考 '+estimate+' 分钟</p>'+
'<div class="syref-heading" style="margin-top:17px;font-size:14px">📖 知识点简介</div><div class="syref-detail-text" data-ref-content>'+(n.kind==='vault'?'正在读取本机 Obsidian 笔记…':esc((n.content||n.task?.noteFramework||'这个节点来自你保存的知识与任务；可以开始学习，完成后记录实际耗时。').slice(0,1000)))+'</div>'+
'<div class="syref-heading" style="font-size:14px;margin-top:19px">🔗 资料来源</div><div id="syref-sources">'+(n.path?'<div class="syref-source">📘 <span><b>'+esc(n.path)+'</b><span class="syref-sub">来自本机实际笔记目录</span></span></div>':n.url&&/^https?:\/\//i.test(n.url)?'<div class="syref-source">🌐 <a href="'+esc(n.url)+'" target="_blank" rel="noopener noreferrer">'+esc(n.url)+'</a></div>':'<p class="syref-sub">当前节点没有外部原文链接。</p>')+'</div>'+
'<div class="syref-heading" style="font-size:14px;margin-top:17px">🗒️ 相关笔记</div><div id="syref-related"></div>'+
'<div class="syref-actions"><button class="syref-btn primary" data-detail="complete">'+(status?'取消完成':'✓ 标记本知识点已完成')+'</button><button class="syref-btn" data-detail="add-task">＋ 加入今日任务</button><button class="syref-btn muted" data-detail="rescue">不会？AI 帮我</button></div><p class="syref-status" data-syref-msg="detail"></p>';
host.querySelector('[data-detail="complete"]').onclick=()=>{let p=progress();p[n.id]=!p[n.id];putLocal('progress',p);renderRoute();};
host.querySelector('[data-detail="add-task"]').onclick=()=>createTask(n);
host.querySelector('[data-detail="rescue"]').onclick=()=>{modeOn('rescue');const ta=root.querySelector('[data-ref-question]');if(ta)ta.value='我在学习「'+n.title+'」时卡住了。请结合我真实的知识库给出一个可验证的下一步。';};
let others=nodes.filter(x=>x.id!==n.id && (x.title.includes(n.title.slice(0,2))||n.title.includes(x.title.slice(0,2)))).slice(0,3);const related=host.querySelector('#syref-related');
related.textContent=others.length?others.map(x=>x.title).join(' · '):'暂无关联笔记。';
if(n.kind==='vault'){try{const out=await post('/api/vault-read',{path:n.path,limit:11000});if(stamp!==detailJob||mode!=='route')return;
const content=out.text||out.content||out.note?.text||'';n.content=content;const snippet=content.replace(/^---[\s\S]*?---\s*/,'').slice(0,1500);const target=host.querySelector('[data-ref-content]');if(target)target.textContent=snippet||'笔记存在，但当前没有可显示的正文。';
if(!content && out.error)notify('detail',out.error);
}catch(e){if(stamp===detailJob){const target=host.querySelector('[data-ref-content]');if(target)target.textContent='读取失败：'+e.message;}}}
}
function action(type){if(type==='multi-sources')return window.SYMultiSources?.open();const n=activeNode();if(type==='task-current')return createTask(n);
if(type==='old-knowledge'){return window.SYKnowledge?.open?.();}
if(type==='ai-config')return window.SYRescue?.configure?.();
if(type==='hub'){if(window.SYCoverModules?.show)return SYCoverModules.show('sources');if(window.SYHub?.open)return SYHub.open(null,'sources');return alert('原链接解析模块未加载');}if(type==='original-routes')return window.SYCoverModules?.show?.('routes');
if(type==='refresh'){fetchStatuses().then(()=>renderRoute());return;}
if(type==='add-node'){const title=prompt('新增知识点标题');if(!title||!title.trim())return;const s=Number(prompt('放进哪个阶段？1 基础认知 / 2 工具方法 / 3 案例实战 / 4 作品输出','2'));if(![1,2,3,4].includes(s))return;const all=getLocal('nodes')||[];all.push({id:'manual:'+Date.now(),title:title.trim().slice(0,150),kind:'manual',stage:s-1,theme:theme,content:'自行添加的知识点'});putLocal('nodes',all);selected=all[all.length-1].id;renderRoute();return;}
if(type==='add-link'){const url=prompt('粘贴飞书、B站、YouTube 或网页完整链接');if(!url)return;try{const u=new URL(url.trim());if(!['http:','https:'].includes(u.protocol))throw Error();}catch(_){return notify('route','请输入有效的 http(s) 链接');}
notify('route','正在使用原项目的联网资料解析接口…');(async()=>{try{const d=window.SYSourceIO?.readLink?await SYSourceIO.readLink(url.trim()):await post('/api/extract',{url:url.trim()});const all=getLocal('nodes')||[];const n={id:'link:'+Date.now(),kind:'material',theme:theme,stage:1,title:String(d.title||url).slice(0,150),url:url.trim(),content:String(d.text||d.content||d.summary||'').slice(0,12000)};all.push(n);putLocal('nodes',all);selected=n.id;renderRoute();notify('route','原文读取已结束。现在可点击节点查看内容，并选择加入任务。');}catch(e){notify('route','读取未成功：'+e.message+'。请确认权限或用原资料导入入口。');}})();}}
function renderRescue(){const task=getTask();const prior=getLocal('rescue')||{};const ai=statuses.ai||{};
root.innerHTML=hero(true)+'<div class="syref-taskbar"><span style="font-size:23px">📄</span><div style="flex:1;min-width:0"><strong>当前任务：'+esc(task?.name||'尚未选中任务')+'</strong><div><span>'+esc(task?.noteFramework||'请描述你卡住的具体步骤，并保留任务的学习断点。').slice(0,150)+'</span></div></div><button class="syref-btn" data-r-action="back">↶ 返回当前任务</button></div>'+
'<div class="syref-rescue-grid"><div class="syref-panel"><div class="syref-heading"><span class="syref-hico">①</span>告诉我你遇到的困难</div><p class="syref-sub">上传截图、粘贴报错，或用文字描述。AI 会结合真实任务和已授权资料分析。</p><div class="syref-mode"><button data-r-mode="image" class="active">▧ 上传截图 / 报错</button><button data-r-mode="voice">🎙 语音描述</button><button data-r-mode="text">▤ 文字描述</button></div>'+
'<label class="syref-upload"><span>🖼️ 点击上传截图，或将图片拖到这里</span><span class="syref-sub">支持 JPG / PNG / WebP，最大 5 MB</span><input data-r-file type="file" accept="image/png,image/jpeg,image/webp" hidden><img data-r-preview hidden></label>'+
'<label class="syref-sub" style="display:block;margin:14px 0 3px;font-weight:700">或者粘贴报错信息 / 代码 / 相关内容</label><textarea class="syref-input syref-textarea" data-ref-question maxlength="3000" placeholder="例如：我在配置 MCP 时出现报错；现在做到哪一步、已经试过什么、希望得到什么结果？">'+esc(prior.question||'')+'</textarea>'+
'<label style="font-size:12px;color:#677e98;display:block;margin-top:9px"><input type="checkbox" data-r-notes checked> 检索已授权资料：Obsidian、导入文档及飞书 / 微信摘录（仅相关片段）</label>'+
'<label style="font-size:12px;color:#677e98;display:block;margin-top:9px"><input type="checkbox" data-r-web checked> 联网检索公开网页（问题关键词会发送至所选搜索服务）</label><label class="syref-sub" style="display:block;margin-top:10px">指定资料链接（可选，每行一个）<textarea class="syref-input" data-r-urls rows="2" placeholder="飞书 / 网页 / B站 / YouTube 原链接"></textarea></label><div class="syref-actions"><button class="syref-btn muted" data-r-action="sources">全网资料 / API / 监测</button></div>'+
'<div class="syref-actions"><button class="syref-btn primary" data-r-action="analyze">✦ 开始真实 AI 分析 ▶</button><button class="syref-btn" data-r-action="full">打开原 AI 救援与模型配置</button></div>'+
'<p class="syref-status" data-syref-msg="rescue">当前模型：'+esc(ai.verified?'已通过连接测试 · '+(ai.model||''):ai.configured?'已配置但未完成验证':'未验证/未配置')+'。截图会先尝试提取文字，视觉识别以原截图 AI 工作为准。</p></div>'+
'<div class="syref-panel"><div class="syref-heading"><span class="syref-hico">②</span>上岸鸭 AI 正在为你分析 <span class="syref-chip blue" style="margin-left:auto" data-r-status>等待提问</span></div>'+
'<div class="syref-step"><b>先只做一步</b><div data-r-one style="margin-top:8px">告诉我具体的卡点后，我会根据真实模型答复提取你接下来要验证的第一步。</div></div>'+
'<div class="syref-heading" style="font-size:15px">◉ 问题分析与建议</div><div class="syref-response" data-r-answer>还没有发送问题。本区不会预先放入示例 AI 答案。</div>'+
'<div class="syref-heading" style="font-size:15px;margin-top:16px">📚 相关来源与笔记</div><div data-r-sources class="syref-stat-note">分析后显示确实检索到的来源；无法读取时会如实告知。</div>'+
'<div class="syref-actions"><button class="syref-btn" data-r-action="save" disabled>保存到原任务笔记</button><button class="syref-btn muted" data-r-action="notes">搜索 Obsidian</button></div></div></div>'+
'<div class="syref-timer"><div>🦆 <b>疲惫了？先休息 90 秒</b><div class="syref-sub">可以随时停止，休息后回到刚才那一步。</div></div><button class="syref-btn" data-r-action="rest">▶ 开始休息</button></div>'+
'<p class="syref-status">AI 答案需自行验证。精力偏低时可以换轻任务；不会自动开始摄像头，也不会把疲惫判断成医学诊断。</p>';
root.querySelector('[data-ref-question]').addEventListener('input',e=>putLocal('rescue',{question:e.target.value}));
root.querySelectorAll('[data-r-mode]').forEach(b=>b.onclick=()=>{root.querySelectorAll('[data-r-mode]').forEach(x=>x.classList.toggle('active',x===b));if(b.dataset.rMode==='voice')startVoice();else if(b.dataset.rMode==='image')root.querySelector('[data-r-file]').click();else root.querySelector('[data-ref-question]').focus();});
root.querySelectorAll('[data-r-action]').forEach(b=>b.onclick=()=>rescueAction(b.dataset.rAction));
const zone=root.querySelector('.syref-upload'),file=root.querySelector('[data-r-file]');zone.addEventListener('dragover',e=>e.preventDefault());zone.addEventListener('drop',e=>{e.preventDefault();if(e.dataTransfer?.files?.[0])fileReceived(e.dataTransfer.files[0]);});file.addEventListener('change',()=>{if(file.files?.[0])fileReceived(file.files[0]);});}
async function fileReceived(file){if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>5*1024*1024)return notify('rescue','仅支持最大 5MB 的 PNG、JPG 或 WebP');
const img=root.querySelector('[data-r-preview]');img.src=URL.createObjectURL(file);img.hidden=false;imageOCR='';notify('rescue','正在使用原项目的文件识别能力读取截图文字…');
try{if(!window.SYSourceIO?.readFile)throw Error('当前文件解析接口未加载');const d=await SYSourceIO.readFile(file);imageOCR=String(d.text||d.content||'').trim().slice(0,4500);notify('rescue',imageOCR?'已识别截图文字 '+imageOCR.length+' 字；提问时会一并提交。':'未识别到可用文字；请在问题框中描述，或打开原工作台的视觉模型工具。');}catch(e){notify('rescue','截图已预览，但 OCR 未完成：'+e.message+'。请补充文字，或使用原工作台视觉识别。');}}
async function analyze(){if(busy)return;const task=getTask();const t=root.querySelector('[data-ref-question]');const question=t?.value.trim()||'';if(!question&&!imageOCR)return notify('rescue','请先描述你的问题或提供能识别的截图文字。');busy=true;const startBtn=root.querySelector('[data-r-action="analyze"]');startBtn.disabled=true;root.querySelector('[data-r-status]').textContent='真实请求中';root.querySelector('[data-r-answer]').textContent='正在调用已配置模型与联网搜索，请稍候…';answer=null;
try{let matches=[],context='',external={sources:[],warnings:[],context:''};if(root.querySelector('[data-r-notes]').checked){if(window.SYKnowledge?.getStatus?.().count){matches=await SYKnowledge.search(question||imageOCR);}else{const r=await post('/api/vault-search',{q:(question||imageOCR).slice(0,160),limit:5});matches=(r.results||r.matches||r.notes||[]).map(x=>({title:x.title||x.path,path:x.path,text:x.text||x.snippet||''}));}
context=matches.slice(0,5).map(x=>x.title+'\n'+(x.text||'').slice(0,1200)).join('\n\n');}
if(window.SYMultiSources){external=await SYMultiSources.collect(question||imageOCR,{web:!!root.querySelector('[data-r-web]')?.checked,urls:(root.querySelector('[data-r-urls]')?.value||'').split(/\s+/).filter(Boolean),pool:!!root.querySelector('[data-r-notes]')?.checked});context=context.slice(0,4000)+'\n\n'+external.context;SYMultiSources.renderSources(root.querySelector('[data-r-sources]'),external.sources,external.warnings);}
const payload={mode:'stuck',search:!window.SYMultiSources,task:task?.name||'当前学习任务',question:question+(imageOCR?'\n\n[截图文字识别]\n'+imageOCR:''),context:context};
const res=await post('/api/ask-ai',payload);res.sources=[...external.sources,...(res.sources||[])];if(!res.reply)throw Error('模型没有返回可用答案');answer={res,matches,question,taskId:task?.id};root.querySelector('[data-r-status]').textContent='模型已返回';root.querySelector('[data-r-answer]').textContent=res.reply;root.querySelector('[data-r-one]').textContent=firstStep(res.reply);
const references=root.querySelector('[data-r-sources]');references.replaceChildren();
(res.sources||[]).slice(0,8).forEach(s=>{if(!s.url||!/^https?:\/\//.test(s.url))return;const a=el('a','',s.title||s.url);a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';const row=el('div','syref-source');row.append(el('span','', '🔗'),a);references.append(row);});
matches.slice(0,5).forEach(x=>{const row=el('div','syref-source');row.append(el('span','', '📘'),el('span','', x.title||x.path||'笔记'));references.append(row);});
if(external.warnings.length)references.append(el('p','syref-sub','来源读取提示：'+external.warnings.join('；')));
if(!references.children.length)references.textContent='本次没有返回可核对的外部来源。';root.querySelector('[data-r-action="save"]').disabled=!task;
notify('rescue','真实 AI 分析已返回。请先验证“一步建议”，再决定是否保存。');
}catch(e){root.querySelector('[data-r-status]').textContent='请求失败';root.querySelector('[data-r-answer]').textContent='真实 AI 请求失败：'+e.message+'\n\n可以使用“打开原 AI 救援与模型配置”检查模型、余额与联网状态。';root.querySelector('[data-r-one]').textContent='请先完成模型连接测试，或使用已有笔记尝试解决。';notify('rescue',e.message);}
finally{busy=false;startBtn.disabled=false;}}
function firstStep(s){const lines=String(s).split(/\n/).map(x=>x.trim()).filter(Boolean),start=lines.findIndex(x=>/先做|第一步|Step 1|现在先|建议优先|首先/i.test(x));return (start>=0?lines.slice(start,start+3):lines.slice(0,2)).join('\n').slice(0,650)||'请查看下方完整建议。';}
function startVoice(){const S=window.SpeechRecognition||window.webkitSpeechRecognition;if(!S)return notify('rescue','此浏览器不支持语音转写，请用文字输入。');const r=new S();r.lang='zh-CN';r.onresult=e=>{const field=root.querySelector('[data-ref-question]');field.value+=(field.value?'\n':'')+Array.from(e.results).map(x=>x[0].transcript).join('');putLocal('rescue',{question:field.value});};r.onerror=()=>notify('rescue','语音未识别成功，请检查麦克风权限。');try{r.start();notify('rescue','正在听取语音，识别后请核对文字。');}catch(e){notify('rescue',e.message);}}
function rescueAction(which){if(which==='sources')return window.SYMultiSources?.open(root.querySelector('[data-ref-question]')?.value||'');if(which==='back'){leave();window.SY?.switchAppView?.('daily');return;}
if(which==='analyze')return analyze();
if(which==='full')return window.SYRescue?.open?.({task:getTask()||{},question:root.querySelector('[data-ref-question]').value,useNotes:true});
if(which==='notes')return window.SYKnowledge?.open?.();
if(which==='save'){if(!answer)return;const a=acct(),task=(a.tasks||[]).find(t=>String(t.id)===String(answer.taskId));if(!task)return notify('rescue','原任务已经不存在，无法保存。');
task.noteRemark=(task.noteRemark||'')+'\n\n卡点：'+answer.question+'\nAI建议（待验证）：\n'+answer.res.reply+'\n来源：\n'+(answer.res.sources||[]).map(s=>s.url||'').join('\n');SY.saveAcctData(a);root.querySelector('[data-r-action="save"]').disabled=true;notify('rescue','已保存到当前原任务的笔记。');return;}
if(which==='rest'){const b=root.querySelector('[data-r-action="rest"]');if(recoveryInterval){clearInterval(recoveryInterval);recoveryInterval=null;b.textContent='▶ 开始休息';return;}let remain=90;b.textContent='停止休息 · 90s';recoveryInterval=setInterval(()=>{remain--;b.textContent='停止休息 · '+remain+'s';if(remain<=0){clearInterval(recoveryInterval);recoveryInterval=null;b.textContent='休息结束 · 可继续任务';}},1000);}}
function install(){const main=document.querySelector('.app-main'),nav=document.querySelector('.app-sidebar .app-nav');if(!main||!nav||!window.SY)return false;if(document.querySelector('script[src*="cover-module-layout.js"]')&&!window.SYCoverModules)return false;
if(document.getElementById('syref-root'))return true;
root=el('section','syref-root');root.id='syref-root';root.hidden=true;main.append(root);
function navBtn(label,page,icon){const b=el('button','app-nav-item syref-nav');b.type='button';b.dataset.syrefPage=page;b.innerHTML='<span class="app-nav-icon">'+icon+'</span><span>'+label+'</span>';b.onclick=()=>open(page);return b;}
const primary=nav.querySelector('.cv-primary-nav');if(primary){sideA=primary.querySelector('[data-cv-view="routes"]');sideB=primary.querySelector('[data-cv-view="help"]');for(const [b,page] of [[sideA,'route'],[sideB,'rescue']]){if(b){b.classList.add('syref-nav');b.dataset.syrefPage=page;b.onclick=()=>open(page);}}}else{const kn=nav.querySelector('.app-nav-item[data-view="knowledge"]');sideA=navBtn('学习路线','route','▥');sideB=navBtn('遇到困难','rescue','☏');if(kn){kn.before(sideA);kn.after(sideB);}else nav.append(sideA,sideB);}
nav.addEventListener('click',e=>{if(e.target.closest('.app-nav-item[data-view]'))leave();},true);
const original=SY.switchAppView;if(typeof original==='function'&&!original.syrefWrapped){const fn=function(){leave();return original.apply(this,arguments)};fn.syrefWrapped=true;SY.switchAppView=fn;}
return true;}
window.SYReferenceDynamic={open,refresh:fetchStatuses,leave};
if(!install()){document.addEventListener('sy:ready',install);let n=0;const it=setInterval(()=>{if(install()||++n>80)clearInterval(it)},250);}
})();
