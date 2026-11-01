'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stages=[['clarify','说清目标'],['gap','找准差距'],['action','选第一步'],['execute','本人执行'],['review','独立复核'],['accepted','带走方法']];
let seed,states={},selected,mode='preview',token='',tab='workspace',viewStage=null,upload=null,busy=false;
const blank=()=>({revision:0,stage:'clarify',context:{},criteria:[],frozen:false,action:'',history:[],submissions:[],review:null,checkin_ack:null});
const project=()=>seed.projects.find(p=>p.id===selected);
const state=()=>states[selected]||blank();
function notice(text){$('#notice').textContent=text;$('#notice').hidden=!text;}
function stamp(){return new Date().toISOString();}
async function request(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Workflow-Token':token},body:JSON.stringify({project:selected,expected_revision:state().revision,...body})});const result=await r.json();if(!r.ok)throw Error(result.error||'操作未完成');return result;}
function previewEvent(event,payload){
 const s=structuredClone(state());let detail='';
 if(event==='context'){
  for(const k of ['goal','materials','blocker','executor'])if(!payload[k]?.trim())throw Error('先填写目标、材料、卡点和执行者');
  if(s.frozen&&['goal','materials','executor'].some(k=>payload[k]!==s.context[k])){s.frozen=false;s.criteria=[];s.action='';s.review=null;s.submissions=[];}
  s.context=payload;s.stage=s.frozen?'action':'gap';s.checkin_ack=null;detail='目标：'+payload.goal+'；卡点：'+payload.blocker;
 }else if(event==='freeze'){
  if(!s.context.goal||!payload.criteria?.length||payload.criteria.some(c=>!c.trim()))throw Error('先保存需求并填写判据');
  s.criteria=payload.criteria;s.frozen=true;s.stage='action';detail='确认本轮判据：'+payload.criteria.join('；');
 }else if(event==='start'){
  if(!s.frozen||!payload.action?.trim())throw Error('先确认判据并填写具体动作');s.action=payload.action;s.action_origin=payload.origin;s.stage='execute';detail='首步：'+s.action;
 }else if(event==='blocked'){
  if(!payload.note?.trim())throw Error('请记录已经尝试什么和卡点');
  const tips={method:'只学当前一个操作，再试做一行；带着原文位置询问。',materials:'列出缺附件和可询问的人，先切换到材料齐全的一项。',environment:'保存报错、输入和已试方法；只查一个前置，仍失败就求助。',scope:'缩小今天产物；如改目标/判据请重新确认，原截止不自动顺延。'};
  s.help={...payload,suggestion:tips[payload.category]};s.stage='blocked';detail=payload.note+'；'+s.help.suggestion;
 }else if(event==='resume'){
  if(!s.frozen)throw Error('先确认判据');s.stage='execute';detail='带着上次上下文继续：'+s.action;
 }else if(event==='ack'){s.checkin_ack=s.revision;detail=payload.note;}
 else throw Error('上传和独立复核请在本机工作台操作；网页预览不会伪造通过记录。');
 s.revision++;s.updated=stamp();s.history.push({time:stamp(),event,detail});return s;
}
async function act(event,payload){
 if(busy)return;busy=true;notice('');
 try{
  const pid=selected;
  const result=mode==='local'?(await request('/api/event',{event,payload})).state:previewEvent(event,payload);
  states[pid]=result;
  if(mode==='preview')localStorage.setItem('shangan-workflow-v1',JSON.stringify(states));
  viewStage=null;render();notice('已保存。'+(mode==='local'?'本机重开后可继续。':'此预览仅保存在当前浏览器。'));
 }catch(e){notice(e.message);throw e;}finally{busy=false;}
}
function input(name,label,value,placeholder='',type='text'){return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}"></label>`;}
function textarea(name,label,value,placeholder=''){return `<label>${label}<textarea name="${name}" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;}
function render(){
 const p=project(),s=state(),ctx=s.context||{};const stage=viewStage||(s.stage==='blocked'?'execute':s.stage);
 $('#project-list').innerHTML=seed.projects.map((p,i)=>`<button class="project-item ${p.id===selected?'active':''}" data-project="${p.id}"><span class="project-icon">${String(i+1).padStart(2,'0')}</span>${esc(p.name)}</button>`).join('');
 const qualityLink=document.querySelector('a[href^="quality.html"]');if(qualityLink)qualityLink.href='quality.html#'+p.id;$('#project-name').textContent=p.name;$('#project-index').textContent=String(seed.projects.indexOf(p)+1).padStart(2,'0')+' / 08';
 $('#stage-label').textContent=s.stage==='blocked'?'遇到困难，正在调整':stages.find(x=>x[0]===s.stage)?.[1];
 const current=stages.findIndex(x=>x[0]===(s.stage==='blocked'?'execute':s.stage));
 $('#workflow').innerHTML=stages.map(([id,name],i)=>`<button class="flow-node ${id===stage?'active':''} ${i<current?'done':''}" data-stage="${id}"><span>${i<current?'✓':String(i+1).padStart(2,'0')}</span><b>${name}</b></button>`).join('');
 $('#panel-title').textContent=stages.find(x=>x[0]===stage)?.[1]||'本人执行';$('#panel-step').textContent='当前查看 · '+(stages.findIndex(x=>x[0]===stage)+1)+'/6';
 $('#progress-tag').textContent=s.stage==='accepted'?'本轮人工记录通过':s.stage==='blocked'?'卡点已保留':'尚待实际完成';
 $('#today-goal').textContent=ctx.output||ctx.goal||'还没选定今天的小产物';$('#today-minutes').textContent=ctx.minutes?ctx.minutes+'分钟':'—';$('#today-deadline').textContent=ctx.deadline?new Date(ctx.deadline).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'未设截止';
 for(const [selector,kind]of [['#draft-link','draft'],['#book-link','workbook']]){
  const a=$(selector);a.href=mode==='local'?'/api/file?project='+p.id+'&kind='+kind:'#';a.setAttribute('aria-disabled',mode!=='local');
 }
 $('#file-hint').textContent=mode==='local'?'下载来自本机的派生文件。原始证据仍需本人核对。':'云端预览不携带原作；材料下载、模型调用和上传复核在本机工作台完成。';
 $('#model-button').disabled=mode!=='local'||busy;
 const mr=s.model_result;
 $('#model-result').textContent=mr?mr.gaps.map(g=>'【模型候选，待内容确认】'+g.current_evidence+'\n'+g.micro_steps.map(x=>'• '+x.action).join('\n')).join('\n\n'):'尚未在本页生成诊断。已有原件和人工草稿不代表模型质量通过。';
 let html='';
 if(stage==='clarify'){
  let deadline=ctx.deadline?new Date(new Date(ctx.deadline).getTime()-new Date(ctx.deadline).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
  html=`<p class="muted">不需要先用专业术语表达。先说想把什么变成什么，以及你已经有什么。</p><form id="context-form">${textarea('goal','1 · 你真正想达到什么？',ctx.goal,p.goal)}${textarea('materials','2 · 现在手里有什么？',ctx.materials,'文件名、具体页码、已有数据或已经做过的步骤')}${textarea('blocker','3 · 哪一步不知道怎么下手？',ctx.blocker,'不是只说“优化一下”，可以写：知道要核收益，但不知道哪些算成本。')}${textarea('baseline','你已经试过什么？（选填）',ctx.baseline,'保存尝试过的方法，避免回来又从头找方向')}${input('capability','这个操作，你现在能做到哪？（选填）',ctx.capability,'自述只用于调整解释方式，不认定能力已验证')}<div class="split">${input('executor','这一步的本人执行者',ctx.executor,'姓名或稳定代号')}${input('minutes','今天实际可用分钟',ctx.minutes||20,'','number')}</div>${input('output','今天想交出的最小产物（选填）',ctx.output,p.output)}${input('deadline','今天这一步的截止时间（选填）',deadline,'','datetime-local')}<div class="hint">先解决当前一个缺口。学术边界：不代写提交段落，不伪造访谈、数据或引用。</div><button class="primary" type="submit">保存需求，看看具体差在哪 →</button></form>`;
 }else if(stage==='gap'){
  html=`<span class="source-badge">已有原文支持的人工候选 · 仍需你确认</span><p class="muted">目标：${esc(ctx.goal||'先回目标页填写本人目标')}。下面是当前材料的候选缺口，不是奖项评分结论。</p>${p.gaps.map((g,i)=>`<div class="gap-card"><strong>0${i+1}　${esc(g)}</strong><p>原文范围：${esc(p.locations)}。缺失附件不等于整个作品从未做过。</p></div>`).join('')}<form id="criteria-form"><p>这一步做到什么才算完成？先冻结判据，再执行，避免边做边换标准。</p>${(s.criteria.length?s.criteria:p.criteria).map((c,i)=>textarea('criterion'+i,'判据 '+(i+1),c)).join('')}<button class="primary" type="submit">确认这轮标准，选一个小动作 →</button></form>`;
 }else if(stage==='action'){
  html=`<span class="source-badge">人工首步草稿 · 不是模型自动生成</span><div class="hint">未知能力先试做一行；已有能力直接做。没有材料先求助，不要求先学完整课程。</div><form id="action-form">${textarea('action','具体改哪里、怎么改、交什么',s.action||p.action)}<label>这一步来自<select name="origin"><option value="human_candidate">已有人工候选，经本人确认</option><option value="human_adapted">本人调整过的候选</option></select></label><div class="gap-card"><strong>自检</strong><p>产物有一行/一处；来源能回查；未取得的信息标待核；别人知道怎么判断完成。</p></div><button class="primary" type="submit">确认首步，开始本人执行 →</button></form>`;
 }else if(stage==='execute'){
  html=`<div class="gap-card"><strong>这次只做</strong><p>${esc(s.action||'先到“选第一步”确认具体动作')}</p></div>${s.help?`<div class="hint"><b>上次卡在：</b>${esc(s.help.note)}<br><b>调整建议：</b>${esc(s.help.suggestion)}<div class="button-row"><button class="secondary" id="resume">保留上下文，继续这一步</button><button class="quiet" data-stage="clarify">重新确认目标与范围</button></div></div>`:''}<p class="muted">做完后只交小产物：修改的一页、一个表或一张截图。最多20MB。助手草稿不能直接冒充本人执行。</p><form id="submit-form"><label>上传本人实际修改的小产物<input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.docx,.pptx,.xlsx,.csv,.txt,.md" ${mode==='local'?'':'disabled'} required></label>${textarea('explanation','你改了哪一点？为什么这样改？','','说明来源、具体改动及仍未确定的地方')}<label class="criteria-item"><input type="checkbox" name="human_declaration" required><span>这是本人实际修改后提交的产物，仍需非执行者复核。</span></label><button class="primary" type="submit" ${mode==='local'?'':'disabled'}>保存产物，交给非执行者复核 →</button></form>${mode!=='local'?'<div class="hint">当前为浏览器预览，上传复核在本机工作台完成，预览不模拟通过。</div>':''}`;
 }else if(stage==='review'){
  const last=s.submissions.at(-1);
  html=last?`<div class="hint">执行者：${esc(last.executor)}<br>提交文件：<a href="/api/submission?project=${selected}&id=${encodeURIComponent(last.upload.id)}">${esc(last.upload.filename)} ↗</a><br>说明：${esc(last.explanation)}</div><form id="review-form">${input('reviewer','请由非执行者填写复核者姓名或稳定代号','','不能与执行者相同')}${s.criteria.map((c,i)=>`<div class="review-row"><strong>${i+1} · ${esc(c)}</strong><label>本项结果<select name="passed${i}" required><option value="">请选择</option><option value="true">通过</option><option value="false">退回，只补这一项</option></select></label>${textarea('note'+i,'具体依据／退回原因','','写出检查了产物哪里，不能只填“很好”')}</div>`).join('')}<button class="primary" type="submit">保存独立复核记录</button></form>`:'<div class="empty">还没有本人提交的产物。先执行并上传，再做内容复核。</div>';
 }else{
  html=s.stage==='accepted'?`<div class="hint success">本轮人工复核记录已通过。它只表示这一个小产物，不等于全部55项完成、业务效果已证实或比赛达到某个分数。</div><h3>这次学到的可迁移方法</h3><p>先指出原文已有信息；把缺口变成可交付的一行；按原判据核对。下次相近任务，先自己尝试这一套方法。</p><button class="primary" id="begin-next">保留历史，开启下一步</button>`:'<div class="empty">完成本人修改和非执行者复核后，再总结这次学会的方法。</div>';
 }
 $('#stage-content').innerHTML=html;renderTasks();renderHistory();bindForms();checkDeadline();
}
function renderTasks(){
 const filter=$('#task-filter').value;
 const rows=seed.tasks.filter(t=>filter==='all'||filter==='unfinished'?!t.scoped_complete||filter==='all':t.project===selected);
 $('#task-summary').innerHTML=`<span>总计 55 项</span><span>6项限定资料处理完成</span><span>17项部分完成</span><span>32项尚未完成／阻塞</span>`;
 $('#task-rows').innerHTML=rows.map(t=>`<tr><td>${t.id}</td><td><strong>${esc(t.section)}</strong><p>${esc(t.task)}</p><small class="muted">本轮：${esc(t.progress)}</small></td><td><span class="state-pill ${t.scoped_complete?'green':''}">${esc(t.status)}</span></td><td>${esc(t.owner)}</td><td>${t.project?`<button class="secondary" data-open-task="${t.project}">去该项目</button>`:'<span class="muted">团队总项</span>'}</td></tr>`).join('');
}
function renderHistory(){const s=state();$('#history-list').innerHTML=s.history.length?[...s.history].reverse().map(h=>`<div class="history-entry"><small>${esc(new Date(h.time).toLocaleString())} · ${esc(h.event)}</small><p>${esc(h.detail)}</p></div>`).join(''):'<div class="empty">还没有操作记录。说清目标并保存后，这里会记住你的上下文。</div>';}
function bindForms(){
 const bind=(id,event,fn)=>{const el=$(id);if(el)el.addEventListener(event,fn);};
 bind('#context-form','submit',async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));data.minutes=Number(data.minutes);if(data.deadline)data.deadline=new Date(data.deadline).toISOString();try{await act('context',data);}catch{}});
 bind('#criteria-form','submit',async e=>{e.preventDefault();try{await act('freeze',{criteria:[...new FormData(e.target).values()]});}catch{}});
 bind('#action-form','submit',async e=>{e.preventDefault();try{await act('start',Object.fromEntries(new FormData(e.target)));}catch{}});
 bind('#resume','click',()=>act('resume',{}).catch(()=>{}));
 bind('#begin-next','click',()=>act('next',{}).catch(()=>{}));
 bind('#submit-form','submit',async e=>{
  e.preventDefault();if(mode!=='local')return;const form=new FormData(e.target),file=form.get('file');if(!file||file.size>20*1024*1024)return notice('请提交20MB以内的一页/一个表。');
  const button=e.target.querySelector('button');button.disabled=true;
  try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});const result=await request('/api/upload',{filename:file.name,data});await act('submit',{upload:result.upload,explanation:form.get('explanation'),human_declaration:form.get('human_declaration')==='on'});}catch(err){notice(err.message);}finally{button.disabled=false;}
 });
 bind('#review-form','submit',async e=>{e.preventDefault();const f=new FormData(e.target);try{await act('review',{reviewer:f.get('reviewer'),checks:state().criteria.map((_,i)=>({passed:f.get('passed'+i)==='true',note:f.get('note'+i)}))});}catch{}});
}
function switchProject(id){if(busy)return notice('当前操作未结束，请稍候再切换项目。');selected=id;viewStage=null;upload=null;history.replaceState(null,'','#'+id);render();}
function switchTab(next){tab=next;document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!=='view-'+next);document.querySelectorAll('.nav').forEach(el=>el.classList.toggle('active',el.dataset.view===next));$('#breadcrumb').textContent='工作空间 / '+({workspace:'从这里下手',tasks:'55项任务',history:'进度与上下文'}[next]);}
document.addEventListener('click',e=>{const el=e.target.closest('[data-project],[data-stage],[data-view],[data-open-task]');if(!el)return;if(el.dataset.project)switchProject(el.dataset.project);if(el.dataset.stage){viewStage=el.dataset.stage;render();}if(el.dataset.view)switchTab(el.dataset.view);if(el.dataset.openTask){switchProject(el.dataset.openTask);switchTab('workspace');}});
$('#task-filter').addEventListener('change',renderTasks);
$('#help-button').onclick=()=>$('#help-dialog').showModal();$('#close-help').onclick=()=>$('#help-dialog').close();
$('#help-form').onsubmit=async e=>{e.preventDefault();try{await act('blocked',Object.fromEntries(new FormData(e.target)));$('#help-dialog').close();}catch{}};
$('#next-goal').onclick=()=>act('next',{}).catch(()=>{});
$('#model-button').onclick=async()=>{
 if(mode!=='local'||busy)return;busy=true;$('#model-button').disabled=true;$('#model-result').textContent='正在读取当前项目原文并真实调用模型；失败会显示，不会用人工卡替代。';
 try{const pid=selected;const r=await request('/api/model',{});states[pid]=r.state;render();}catch(e){$('#model-result').textContent='未通过：'+e.message;notice('诊断尚未通过。已有目标和材料不丢失；可以先核人工候选或记录困难。');}finally{busy=false;$('#model-button').disabled=false;}
};
$('#export').onclick=()=>{const blob=new Blob([JSON.stringify({project:project().name,scope:'用户进度记录，不是官方验收',state:state()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=project().name+'-本人进度.json';a.click();URL.revokeObjectURL(url);};
document.querySelectorAll('.file-link').forEach(a=>a.addEventListener('click',e=>{if(mode!=='local'){e.preventDefault();notice('预览不包含私密原作。在你的电脑打开 http://127.0.0.1:9010 才能下载材料。');}}));
let deadlineShown='';
function checkDeadline(){if(!selected)return;const s=state(),deadline=s.context.deadline;if(!deadline||s.stage==='accepted'||s.stage==='review')return;const left=(new Date(deadline).getTime()-Date.now())/1000;const key=selected+'|'+deadline;if(left<=600&&deadlineShown!==key){deadlineShown=key;notice((left>0?'距离截止不到10分钟：':'本次截止已到：')+'现在做到哪？卡住就保存现场、求助或缩小本次范围，不要死磕。');}}
setInterval(checkDeadline,15000);
async function init(){
 try{
  if(['127.0.0.1','localhost'].includes(location.hostname)){
   const r=await fetch('/api/data');if(!r.ok)throw Error('本机服务未就绪');const d=await r.json();seed=d.seed;states=d.states;token=d.token;mode='local';
  }else{const r=await fetch('data.json');seed=await r.json();try{states=JSON.parse(localStorage.getItem('shangan-workflow-v1')||'{}');}catch{states={};}}
  selected=seed.projects.some(p=>p.id===location.hash.slice(1))?location.hash.slice(1):seed.projects[0].id;
  $('#mode-tag').textContent=mode==='local'?'本机工作台 · 已连接':'交互预览 · 当前浏览器保存';$('#storage-mode').textContent=mode==='local'?'上下文保存于本机':'预览记录仅当前浏览器';render();
 }catch(e){notice('页面连接失败：'+e.message+'。已有记录未被覆盖，请启动本机服务后刷新。');}
}
init();

