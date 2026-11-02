'use strict';
const $ = id => document.getElementById(id);
let activeRoute = null, activeRun = null, pendingChange = null, completionTask = null, completionAction = null, pendingDay = null, running = false;
let routes = [], config = {};
let previewURL = null, previousHelpId = null;
const localDate = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'); };
function el(tag, text, cls) { const node = document.createElement(tag); if(text != null) node.textContent = text; if(cls) node.className = cls; return node; }
function clear(node) { node.replaceChildren(); }
function safeLink(url, title) { const a = el('a', title); try { const u = new URL(url); if(['https:','http:'].includes(u.protocol)) a.href = u.href; } catch {} a.target='_blank'; a.rel='noopener noreferrer'; return a; }
async function api(path, data) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(path, { method: data === undefined ? 'GET' : 'POST', headers: data === undefined ? {} : {'Content-Type':'application/json'}, body: data === undefined ? undefined : JSON.stringify(data), signal:controller.signal });
    const value = await response.json(); if(!response.ok) throw new Error(value.error || `接口错误 ${response.status}`); return value;
  } catch(error) { if(error.name === 'AbortError') throw new Error('请求超时，请稍后刷新查看执行记录。'); throw error; } finally { clearTimeout(timer); }
}
async function health() {
  try { const status = await api('/api/agent/health'); config = status.ai; $('connection').textContent = config.configured ? `后端已连接 · ${config.model}` : '后端已连接 · 待设置模型'; $('connection').classList.toggle('bad', !config.configured); }
  catch { $('connection').textContent = '后端未连接'; $('connection').classList.add('bad'); }
}
async function refreshState(selectId) {
  const state = await api('/api/agent/state'); routes = state.routes; clear($('saved-routes'));
  if(!routes.length) $('saved-routes').append(el('p','生成后自动保存在后端，刷新页面仍能继续。','hint'));
  for(const route of routes) { const button = el('button', `${route.title} · ${route.tasks.filter(x=>x.status==='done').length}/${route.tasks.length}`); button.type='button'; if(route.id === (selectId || activeRoute?.id)) button.className='selected'; button.onclick=()=>renderRoute(route); $('saved-routes').append(button); }
  if(selectId) { const found = routes.find(x=>x.id === selectId); if(found) renderRoute(found); }
  return state;
}
function sourceCards(parent, sources) {
  clear(parent);
  for(const source of sources || []) {
    const card=el('article',null,'source-card'); card.append(safeLink(source.url, `[${source.id}] ${source.title}`));
    const status = {fulltext:'已读取正文',snippet:'仅检索摘要',partial:'内容不完整',failed:'正文读取失败'}[source.readStatus] || '待读取';
    card.append(el('div',`${status} · ${new Date(source.retrievedAt).toLocaleString()} · ${new URL(source.url).hostname}`,'source-meta'));
    if(source.snippet) card.append(el('p',source.snippet)); parent.append(card);
  }
}
function renderRoute(route) {
  activeRoute=route; $('route-panel').hidden=false; $('empty-state').hidden=true; $('research-panel').hidden=true;
  $('route-title').textContent=route.title; $('route-meta').textContent=`已保存 · 版本 ${route.version} · ${route.tasks.filter(x=>x.status==='done').length}/${route.tasks.length} 已完成`;
  $('route-summary').textContent=route.summary; $('route-summary').hidden=Boolean(route.help); clear($('assumptions'));
  renderHelp(route);
  for(const assumption of route.assumptions || []) $('assumptions').append(el('div','假设：'+assumption,'assumption'));
  if(route.timeInsight) $('assumptions').append(el('div',`实际用时记录 ${route.timeInsight.samples} 次，实际 / 预计约 ${route.timeInsight.actualToEstimated} 倍。下一次选任务时可以据此留余量。`,'assumption'));
  if(route.diagnosis) $('assumptions').append(el('p',route.diagnosis,'summary-text'));
  clear($('conflicts'));
  if(route.conflicts?.length) { const box=el('div',null,'warning-box'); box.append(el('strong',`还有 ${route.unscheduledMinutes} 分钟排不进当前时间。`)); const list=el('ul'); for(const c of route.conflicts) list.append(el('li',`${c.title}：${c.reason}，剩余 ${c.minutes} 分钟`)); box.append(list,el('p','可以减少任务范围、增加可用时间，或调整目标截止日期。系统不会把超时任务当作完成。')); $('conflicts').append(box); }
  clear($('tasks'));
  route.tasks.forEach((task,index)=>{
    const card=el('article',null,'card task-card'+(task.status==='done'?' done':'')), top=el('div',null,'task-top'), title=el('div');
    title.append(el('span',`${task.phase || '实践阶段'} · 任务 ${String(index+1).padStart(2,'0')} · ${task.id}`,'task-index'),el('h3',task.title)); top.append(title,el('span',task.status==='done'?'已完成':`约 ${task.minutes} 分钟`,'tag')); card.append(top);
    const deliverable=el('p',null,'task-description'); deliverable.append(el('strong','留下什么：'),document.createTextNode(task.deliverable)); card.append(deliverable);
    const acceptance=el('p',null,'task-description'); acceptance.append(el('strong','如何验收：'),document.createTextNode(task.acceptance)); card.append(acceptance,el('div','现在先做：'+task.firstStep,'first-step'));
    if(task.actions?.length) { const list=el('ol',null,'micro-actions'); for(const action of task.actions) { const item=el('li'); item.append(el('strong',`${action.title} · ${action.minutes} 分钟`),el('p',action.instruction),el('p',`留下：${action.result} ｜ 验收：${action.check}`,'hint')); if(action.frameIndex) item.append(el('p',frameLabel(action,route),'hint')); if(action.onFailure) item.append(el('p','如果没有成功：'+action.onFailure,'failure-branch')); if(action.status==='done')item.append(el('span',`✓ 已完成${action.actualMinutes?' · 实际 '+action.actualMinutes+' 分钟':''}`,'tag')); else {const button=el('button','这一步完成了');button.type='button';button.onclick=()=>openCompletion(task,action);item.append(button);} list.append(item); } card.append(list); }
    const bottom=el('div',null,'task-bottom'), info=[]; if(task.dependsOn?.length) info.push('前置 '+task.dependsOn.join('、')); if(task.sourceIds?.length) info.push('来源 '+task.sourceIds.join('、')); if(task.sessions?.length) info.push(task.sessions[0].date+' 起'); bottom.append(el('span',info.join(' · ')));
    if(task.status !== 'done') { const button=el('button','整体任务验收'); button.onclick=()=>openCompletion(task,null); bottom.append(button); } else if(task.evidence) card.append(el('p','完成证据：'+task.evidence,'hint'));
    card.append(bottom); $('tasks').append(card);
  });
  clear($('calendar'));
  for(const day of route.days || []) { const card=el('article',null,'card day-card'), h=el('h3',day.date); h.append(el('span',`${day.used}/${day.capacity} 分钟`,'tag')); card.append(h); const list=el('ol'); for(const s of day.sessions) list.append(el('li',s.title+` · ${s.minutes} 分钟`)); if(!day.sessions.length) card.append(el('p','这一天留给其他安排。','hint')); card.append(list); $('calendar').append(card); }
  if(!route.days?.length) $('calendar').append(el('p','当前没有待执行的已排期任务。','hint'));
  sourceCards($('sources'),route.sources);
  renderDayChoices();
  $('tutorial-video').hidden=true; $('tutorial-video').removeAttribute('src'); $('download-video').hidden=true; $('video-status').textContent=''; $('make-video').disabled=false; $('undo').disabled=route.version<2;
  if(route.help) document.querySelector('[data-tab="tasks"]').click();
}
function frameLabel(item,route) { return item.frameIndex ? (route.mediaKind==='video'?`录屏第 ${item.timestamp} 秒 · 画面 ${item.frameIndex}`:`上传画面 ${item.frameIndex}`) : '根据你的描述'; }
function renderHelp(route) {
  const root=$('help-answer'); clear(root); root.hidden=!route.help; if(!route.help)return;
  const help=route.help; root.append(el('span','先解决眼前这个问题','eyebrow'),el('h3','先这样做'),el('p',help.answer,'direct-answer'));
  root.append(el('h4','目前能确认的现象'));const facts=el('ul');for(const fact of help.observed)facts.append(el('li',`${frameLabel(fact,route)}：${fact.text}`));root.append(facts);
  if(help.possibleCauses.length){root.append(el('h4','可能原因 · 还需验证'));const causes=el('ul');for(const cause of help.possibleCauses)causes.append(el('li',cause));root.append(causes);}
  root.append(el('p','解决标志：'+help.success,'first-step'));
  if(help.missingInfo.length){root.append(el('h4','请补充这些信息'));const missing=el('ul');for(const item of help.missingInfo)missing.append(el('li',item));root.append(missing);}
  if(route.frameCount)root.append(el('p',route.mediaKind==='video'?`本次只分析了 ${route.frameCount} 张采样画面，没有分析声音。`:`本次分析了 ${route.frameCount} 张上传画面。`,'hint'));
  if(!route.hasWebEvidence)root.append(el('p','本次未取得可用网络资料，解答依据是你的描述和已提供画面；未核实的原因请按步骤验证。','hint'));
  const followup=el('button','还没解决，继续补图追问');followup.type='button';followup.onclick=()=>openRescue(route);root.append(followup);
}
function renderEvents(run) { clear($('events')); for(const e of run.events) { const node=el('li',e.message); $('events').append(node); } $('events').scrollTop=$('events').scrollHeight; $('run-state').textContent={queued:'排队中',running:'执行中',completed:'已完成',failed:'需要处理',interrupted:'已中断'}[run.status] || run.status; }
function busy(value) { running=value; $('start').disabled=value; $('research').disabled=value; $('open-rescue').disabled=value; const rescue=$('mode').value==='rescue';$('start').textContent=value?(rescue?'正在分析问题并解答…':'正在检索与规划…'):(rescue?'分析图片 / 视频，给我解答 ↗':'检索资料，生成可执行路线 ↗'); }
function updateMode() { const rescue=$('mode').value==='rescue',competition=$('mode').value==='competition';$('competition-field').hidden=!competition;$('competition-name').disabled=!competition;$('competition-name').required=competition;$('planning-settings').hidden=rescue;$('daily').disabled=rescue;$('deadline').disabled=rescue;$('research').hidden=rescue;$('input-title').textContent=rescue?'告诉我，你卡在哪一步':'告诉我，你想走到哪里';if(!rescue){previousHelpId=null;showFollowup();}busy(running); }
function showFollowup(title='') { $('followup-context').hidden=!previousHelpId;$('clear-followup').hidden=!previousHelpId;$('followup-context').textContent=previousHelpId?'继续解答：'+title+'。会结合上次步骤和你这次补充的信息。':''; }
function clearMedia() { $('media').value='';$('video-focus').value='';showMedia(); }
function openRescue(previous=null) { if(running)return;$('mode').value='rescue';$('goal').value='';$('goal').placeholder=previous?'做到第几步仍没解决？实际出现了什么？可以附新截图或录屏。':'例如：点击运行后出现这个报错，我希望程序正常启动。请告诉我怎么处理。';$('level').value='';$('deadline').value='';$('urls').value='';clearMedia();previousHelpId=previous?.id||null;updateMode();showFollowup(previous?.title);$('goal').focus();$('goal-form').scrollIntoView({behavior:'smooth',block:'start'}); }
function showMedia() {
  if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;clear($('media-preview'));
  const file=$('media').files[0],isVideo=file?.type.startsWith('video/');$('video-focus-field').hidden=!isVideo;$('clear-media').hidden=!file;if(!file)return;
  if(file.size>100*1024*1024){$('media-preview').append(el('p','文件超过 100 MB，请截取短片段或关键截图。','error'));return;}
  if(!file.type.startsWith('image/')&&!isVideo){$('media-preview').append(el('p','请选择图片或视频。','error'));return;}
  previewURL=URL.createObjectURL(file);const media=document.createElement(isVideo?'video':'img');media.src=previewURL;
  if(isVideo){media.controls=true;media.preload='metadata';}else media.alt='本次待分析截图';
  $('media-preview').append(media,el('p',file.name+' · 待提交分析','hint'));
}
async function poll(identifier) {
  activeRun=identifier;
  try { const run=await api('/api/agent/run?id='+encodeURIComponent(identifier)); if(activeRun!==identifier) return; renderEvents(run);
    if(['queued','running'].includes(run.status)) return setTimeout(()=>poll(identifier),1500);
    busy(false);
    if(run.status==='completed') { if(run.result?.mode==='research-only') { $('research-panel').hidden=false; sourceCards($('research-sources'),run.result.sources); } else { await refreshState(run.result.id); if(run.result.help)$('help-answer').scrollIntoView({behavior:'smooth',block:'start'}); } }
    else { $('form-error').textContent=run.error || '执行未完成'; if(run.result?.sources) { $('research-panel').hidden=false; sourceCards($('research-sources'),run.result.sources); } }
  } catch(error) { busy(false); $('form-error').textContent=error.message+' 已提交的后台任务不会因此重复执行，刷新后可恢复。'; }
}
function once(node,event,timeout=15000) { return new Promise((resolve,reject)=>{ const timer=setTimeout(()=>{cleanup();reject(new Error('媒体读取超时，请换用短录屏或截图。'));},timeout); const success=()=>{cleanup();resolve();}, fail=()=>{cleanup();reject(new Error('浏览器无法解码该媒体，请转换为常见视频或图片格式。'));}; function cleanup(){clearTimeout(timer);node.removeEventListener(event,success);node.removeEventListener('error',fail);} node.addEventListener(event,success,{once:true});node.addEventListener('error',fail,{once:true}); }); }
function jpeg(media) { const canvas=document.createElement('canvas'); const width=media.videoWidth||media.naturalWidth, height=media.videoHeight||media.naturalHeight; if(!width||!height) throw new Error('画面尺寸无效'); const scale=Math.min(1,1100/width,900/height); canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);canvas.getContext('2d').drawImage(media,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.7); }
async function mediaFrames() {
  const file=$('media').files[0]; if(!file) return []; if(file.size>100*1024*1024) throw new Error('请使用小于 100 MB 的短录屏，或截取关键截图。');
  const objectURL=URL.createObjectURL(file);
  try { if(file.type.startsWith('image/')) { const img=new Image(); const ready=once(img,'load');img.src=objectURL;await ready;return [{timestamp:0,image:jpeg(img)}]; }
    if(!file.type.startsWith('video/')) throw new Error('请选择截图或视频文件。');
    const video=document.createElement('video');video.muted=true;video.preload='auto';const ready=once(video,'loadeddata');video.src=objectURL;await ready;
    if(!Number.isFinite(video.duration)||video.duration<=0) throw new Error('无法读取视频时长。');
    const end=Math.max(0,video.duration-Math.min(.01,video.duration*.01)), focus=$('video-focus').value.trim();let points;
    if(focus!==''){const second=Number(focus);if(!Number.isFinite(second)||second<0||second>=video.duration)throw new Error(`重点秒数需在 0 至 ${video.duration.toFixed(1)} 秒之间，且小于视频时长。`);points=[0,Math.max(0,second-.5),Math.min(end,second),Math.min(end,second+.5),video.duration/2,end];}
    else points=Array.from({length:6},(_,i)=>Math.min(end,video.duration*i/5));
    const frames=[];for(const point of [...new Set(points)].sort((a,b)=>a-b)) { if(Math.abs(video.currentTime-point)>.001){const seek=once(video,'seeked');video.currentTime=point;await seek;} frames.push({timestamp:Math.round(point*1000)/1000,image:jpeg(video)}); }
    video.removeAttribute('src');video.load();return frames;
  } finally { URL.revokeObjectURL(objectURL); }
}
async function start(researchOnly=false) {
  if(running||!$('goal-form').reportValidity())return;busy(true);$('form-error').textContent='';clear($('events'));$('events').append(el('li','准备输入与时间约束…'));
  try { const frames=researchOnly?[]:await mediaFrames(); const rescue=$('mode').value==='rescue';const input={goal:$('goal').value,level:$('level').value,mode:$('mode').value,competitionName:$('mode').value==='competition'?$('competition-name').value.trim():'',frames,researchOnly,
    mediaKind:frames.length?($('media').files[0].type.startsWith('video/')?'video':'image'):'',previousRouteId:rescue?previousHelpId:null,
    urls:$('urls').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),settings:{startDate:localDate(),dailyMinutes:rescue?60:Number($('daily').value),deadline:rescue?'':$('deadline').value||''}};
    const run=await api('/api/agent/run',input);poll(run.runId);
  } catch(error) {busy(false);$('form-error').textContent=error.message;}
}
$('goal-form').addEventListener('submit',event=>{event.preventDefault();start();});$('research').onclick=()=>start(true);
$('mode').onchange=()=>{if($('mode').value!=='competition')$('deadline').value='';updateMode();};
$('open-rescue').onclick=()=>openRescue();$('media').onchange=()=>{$('video-focus').value='';showMedia();};$('clear-media').onclick=clearMedia;$('clear-followup').onclick=()=>{previousHelpId=null;showFollowup();};
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>$(button.dataset.close).close());
document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b===button));document.querySelectorAll('.tab-panel').forEach(p=>p.hidden=p.id!==button.dataset.tab);});
document.querySelectorAll('[data-example]').forEach(button=>button.onclick=()=>{if(running)return;const pm=button.dataset.example==='pm';if(!pm){openRescue();return;}$('mode').value='learning';$('goal').value='我想成为 AI 产品经理，已经有一些产品基础，但不清楚 Agent 应该学什么。请用上岸鸭作为实战项目，给我一条能产出作品的学习路线。';$('deadline').value='';updateMode();$('goal').focus();});
$('open-config').onclick=()=>{$('ai-base').value=config.base||'';$('ai-model').value=config.model||'';$('ai-protocol').value=config.protocol||'chat';$('ai-key').value='';$('config-message').textContent='';$('config-dialog').showModal();};
$('config-form').onsubmit=async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;$('config-message').textContent='正在测试真实模型请求…';try{config=await api('/api/ai-config',{base:$('ai-base').value,model:$('ai-model').value,protocol:$('ai-protocol').value,key:$('ai-key').value,keepKey:true,verify:true});$('ai-key').value='';$('config-message').textContent='模型已返回真实响应，连接成功。';await health();}catch(error){$('config-message').textContent=error.message;}finally{button.disabled=false;}};
$('open-replan').onclick=()=>{if(!activeRoute)return;$('replan-daily').value=activeRoute.settings.dailyMinutes||90;$('unavailable').value=(activeRoute.settings.unavailableDates||[]).join(',');$('new-title').value='';$('change-reason').value='';$('new-deadline').value='';clear($('replan-preview'));$('apply-replan').disabled=true;$('replan-error').textContent='';pendingChange=null;$('replan-dialog').showModal();};
$('replan-form').addEventListener('input',()=>{pendingChange=null;$('apply-replan').disabled=true;});
$('replan-form').onsubmit=async event=>{event.preventDefault();const payload={routeId:activeRoute.id,version:activeRoute.version,requestId:crypto.randomUUID().replaceAll('-',''),reason:$('change-reason').value||'临时安排调整',settings:{dailyMinutes:Number($('replan-daily').value),startDate:localDate(),unavailableDates:$('unavailable').value.split(/[,，\s]+/).map(x=>x.trim()).filter(Boolean)}};if($('new-title').value.trim())payload.newTask={title:$('new-title').value,minutes:Number($('new-minutes').value),deadline:$('new-deadline').value};
  $('replan-error').textContent='';try {const preview=await api('/api/agent/replan',payload);pendingChange=payload;clear($('replan-preview'));$('replan-preview').append(el('strong',`${preview.lastChange.changes.length} 个任务的安排改变；${preview.conflicts.length} 个冲突。`));const list=el('ul');for(const change of preview.lastChange.changes)list.append(el('li',`${change.title} → ${change.after.map(x=>x.date+' '+x.minutes+'分钟').join('、')||'暂无可用时间'}`));$('replan-preview').append(list);if(preview.unscheduledMinutes)$('replan-preview').append(el('p',`时间缺口：${preview.unscheduledMinutes} 分钟，请调整范围或增加可用时间。`,'error'));$('apply-replan').disabled=false;}catch(error){$('replan-error').textContent=error.message;}};
$('apply-replan').onclick=async()=>{if(!pendingChange)return;$('apply-replan').disabled=true;try{const updated=await api('/api/agent/replan',{...pendingChange,apply:true});$('replan-dialog').close();await refreshState(updated.id);}catch(error){$('replan-error').textContent=error.message;$('apply-replan').disabled=false;}};
$('undo').onclick=async()=>{if(!activeRoute)return;try{const result=await api('/api/agent/undo',{routeId:activeRoute.id,version:activeRoute.version});await refreshState(result.id);}catch(error){$('form-error').textContent=error.message;}};
$('complete-form').onsubmit=async event=>{event.preventDefault();if(!completionTask)return;try{const updated=await api(completionAction?'/api/agent/action':'/api/agent/complete',{routeId:activeRoute.id,version:activeRoute.version,taskId:completionTask.id,actionId:completionAction?.id,evidence:$('completion-evidence').value,actualMinutes:Number($('completion-actual').value)});$('complete-dialog').close();await refreshState(updated.id);}catch(error){$('complete-error').textContent=error.message;}};
$('make-video').onclick=async()=>{if(!activeRoute)return;const identifier=activeRoute.id;$('make-video').disabled=true;$('video-status').textContent='后端正在生成 MP4 字幕讲解，通常需要几秒到一分钟…';try{const result=await api('/api/agent/tutorial',{routeId:identifier});if(activeRoute.id!==identifier)return;$('tutorial-video').src=result.url;$('tutorial-video').hidden=false;$('download-video').href=result.url;$('download-video').hidden=false;$('video-status').textContent=`已生成 ${result.stepCount}/${result.totalSteps} 个动作的 MP4 字幕讲解，可播放或下载。`+(result.stepCount<result.totalSteps?'本次先讲前 8 步，其余操作可在任务卡查看。':'');}catch(error){$('video-status').textContent=error.message;}finally{$('make-video').disabled=false;}};
function openCompletion(task,action) { completionTask=task;completionAction=action;$('completion-criteria').textContent=action?`${action.title}：${action.check}`:task.acceptance;$('completion-evidence').value='';$('completion-actual').value=action?.minutes||task.minutes;$('complete-error').textContent='';$('complete-dialog').showModal(); }
function renderDayChoices() { clear($('day-choices'));pendingDay=null;$('save-day').disabled=true;$('day-error').textContent='';if(!$('day-date').value)$('day-date').value=localDate();const saved=activeRoute.dailyPlans?.[$('day-date').value];for(const task of activeRoute.tasks.filter(t=>t.status!=='done')) { const label=el('label',null,'day-choice'),input=document.createElement('input');input.type='checkbox';input.value=task.id;input.checked=saved?.selectedTaskIds.includes(task.id)||false;label.append(input,el('span',`${task.title} · ${task.actions?task.actions.filter(a=>a.status!=='done').reduce((n,a)=>n+a.minutes,0):task.minutes} 分钟`));$('day-choices').append(label); }if(saved){$('day-windows').value=saved.windows.map(w=>w.start+'-'+w.end).join('\n');$('day-buffer').value=saved.bufferMinutes;renderDay(saved,true);}else clear($('day-result')); }
function renderDay(plan,saved=false) { const root=$('day-result');clear(root);root.append(el('h3',`${plan.date} · ${saved?'已采用':'预览'}日程`),el('p',`已安排 ${plan.usedMinutes} 分钟 / 可用 ${plan.availableMinutes} 分钟；另留 ${plan.bufferMinutes} 分钟机动。`,'hint'));if(plan.conflicts.length){const box=el('div',null,'warning-box');for(const conflict of plan.conflicts)box.append(el('div',`${conflict.title||conflict.taskId}：${conflict.reason}`));root.append(box);}const wrapper=el('div',null,'table-wrap'),table=el('table',null,'day-table'),head=el('thead'),hr=el('tr');for(const h of ['时间','具体做什么','成果与完成标志'])hr.append(el('th',h));head.append(hr);table.append(head);const body=el('tbody');for(const row of plan.rows){const tr=el('tr'),action=el('td');action.append(el('strong',row.title),el('p',row.instruction));const outcome=el('td');outcome.append(el('p',row.result),el('p','验收：'+row.check,'hint'));tr.append(el('td',row.start+'–'+row.end),action,outcome);body.append(tr);}table.append(body);wrapper.append(table);root.append(wrapper,el('p','完成后，在「逐步行动」记录每一步的实际用时和成果；卡住时可带着截图再次求助。','hint')); }
$('day-date').onchange=()=>{if(activeRoute)renderDayChoices();};
$('day-form').addEventListener('input',()=>{pendingDay=null;$('save-day').disabled=true;});
$('day-form').onsubmit=async event=>{event.preventDefault();if(!activeRoute)return;$('day-error').textContent='';try{const windows=$('day-windows').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(x=>{const parts=x.split(/\s*[-–—]\s*/);if(parts.length!==2)throw new Error('时间段请写成 19:00-20:00，每行一段。');return {start:parts[0],end:parts[1]};});const payload={routeId:activeRoute.id,version:activeRoute.version,date:$('day-date').value,windows,bufferMinutes:Number($('day-buffer').value),selectedTaskIds:[...$('day-choices').querySelectorAll('input:checked')].map(x=>x.value)};const plan=await api('/api/agent/day',payload);renderDay(plan);pendingDay=payload;$('save-day').disabled=plan.rows.length===0;}catch(error){$('day-error').textContent=error.message;}};
$('save-day').onclick=async()=>{if(!pendingDay)return;$('save-day').disabled=true;try{await api('/api/agent/day',{...pendingDay,apply:true});await refreshState(activeRoute.id);}catch(error){$('day-error').textContent=error.message;$('save-day').disabled=false;}};
(async()=>{await health();try{const state=await refreshState();if(routes.length){renderRoute(routes[0]);if(routes[0].help){$('mode').value='rescue';$('goal').value='';$('goal').placeholder='描述你卡住的地方，或点击已保存解答中的“继续补图追问”。';$('deadline').value='';updateMode();}}const running=state.runs.find(r=>['queued','running'].includes(r.status));if(running){busy(true);poll(running.id);}else if(state.runs[0]){const last=await api('/api/agent/run?id='+state.runs[0].id);renderEvents(last);}}catch(error){$('form-error').textContent=error.message;}})();
