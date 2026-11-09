(function(root){
'use strict';
if(!root||!root.SY||!root.SYAutoloop)return;
const api=root.SYAutoloop,DAY=86400000,MIN=60000,$=s=>document.querySelector(s);
const now=()=>new Date(),key=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const today=()=>root.SY.todayKey?root.SY.todayKey():key(now()),acct=()=>root.SY.getAcctData(),save=a=>root.SY.saveAcctData(a);
const id=()=>root.crypto&&root.crypto.randomUUID?root.crypto.randomUUID():'aloop-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pool=t=>t.workflowPool||'scheduled',due=t=>String(t.dueDate||t.deadlineDate||t.deadline||'').slice(0,10);
const isDone=t=>!!(t&&(t.done||t.completed||t.completedAt||['completed','passed'].includes(String(t.status||'').toLowerCase())));
const mins=t=>Math.max(5,Number(t.remainingWorkMinutes||t.remainingMinutes||t.plannedMinutes||t.estMinutes||t.estimatedMinutes)||25);
const fixed=t=>t.fixedBlock===true||t.taskType==='fixed'||t.hardCommitment===true||t.nonDisplaceable===true||t.category==='\u56fa\u5b9a\u4e8b\u52a1';
const manualLocked=t=>Number.isFinite(t.startMinutes)&&t.aiScheduled!==true&&!fixed(t);
const end=t=>Number.isFinite(t.endMinutes)?t.endMinutes:Number(t.startMinutes||0)+mins(t);
const dateAdd=(s,n)=>{const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return key(d);};
function ensure(a){a.tasks=Array.isArray(a.tasks)?a.tasks:[];a._autoloopDdlReviewKeys=a._autoloopDdlReviewKeys||{};return a;}
function emit(type,payload){const e={accountId:String(root.SY.currentAccountKey||'default'),eventId:id(),eventType:type,payload:payload||{}};try{api._append&&api._append(type,payload,e.eventId);}catch(_){}try{const k='sy_autoloop_ledger_'+e.accountId,x=JSON.parse(localStorage.getItem(k)||'[]');x.push(e);localStorage.setItem(k,JSON.stringify(x.slice(-300)));}catch(_){}return e.eventId;}
function move(a,t,to,reason){const from=pool(t);t.workflowPool=to;t.poolReason=reason||'';t.poolUpdatedAt=Date.now();
if(to==='buffer'){if(from!=='buffer')t.bufferedAt=Date.now();t.bufferReason=reason||'';t.bufferExpiresAt=t.bufferExpiresAt||new Date(new Date().setHours(23,59,59,999)).getTime();t.scheduleStatus='buffered';t.startMinutes=null;delete t.endMinutes;}
else if(to==='pending'){t.pendingSince=Date.now();t.triageDueAt=t.pendingSince+DAY;t.scheduleStatus='needs-arrangement';t.startMinutes=null;delete t.endMinutes;}
else if(to==='trash'){t.trashedAt=Date.now();t.trashExpiresAt=t.trashedAt+DAY;t.scheduleStatus='discarded';t.startMinutes=null;delete t.endMinutes;}
else{t.workflowPool='scheduled';t.scheduleStatus='needs-arrangement';delete t.bufferExpiresAt;delete t.trashedAt;delete t.trashExpiresAt;delete t.pendingSince;delete t.triageDueAt;}
emit('task.pool.changed',{taskId:t.id,from,to,reason});}
function cleanupTrash(a,at){const ts=at||Date.now(),removed=[];a.tasks=a.tasks.filter(t=>{if(pool(t)!=='trash')return true;const expiry=Number(t.trashExpiresAt||Number(t.trashedAt||0)+DAY);if(expiry&&expiry<=ts){removed.push(t.id);return false;}return true;});if(removed.length)emit('trash.expired',{taskIds:removed});return removed;}
function dialog(title,body,buttons){let m=$('#sy-autoloop-rules-modal');if(!m){m=document.createElement('div');m.id='sy-autoloop-rules-modal';m.className='aloop-modal';m.innerHTML='<div class="aloop-modal-card" role="dialog" aria-modal="true"><button class="aloop-modal-close" type="button">×</button><h3></h3><div class="aloop-modal-body"></div><div class="aloop-modal-actions"></div></div>';document.body.append(m);}
m.querySelector('h3').textContent=title;m.querySelector('.aloop-modal-body').innerHTML=body;const a=m.querySelector('.aloop-modal-actions');a.replaceChildren();
buttons.forEach(b=>{const x=document.createElement('button');x.type='button';x.className='aloop-choice '+(b.primary?'primary':'');x.textContent=b.label;x.onclick=()=>{m.hidden=true;b.run&&b.run();};a.append(x);});
m.querySelector('.aloop-modal-close').onclick=()=>m.hidden=true;m.hidden=false;return m;}
const label=t=>String(t.name||t.title||'\u672a\u547d\u540d\u4efb\u52a1');
const list=ts=>'<ul class="aloop-task-list">'+ts.map(t=>'<li><b>'+esc(label(t))+'</b><small>'+esc(due(t)||'\u672a\u8bbeDDL')+' · '+mins(t)+' \u5206\u949f</small></li>').join('')+'</ul>';
function important(t){if(t.mustKeep===true||t.coreGoal===true||t.urgent===true||t.important===true||t.priority==='high'||t.importance==='high')return true;
if(t.mustKeep===false||t.coreGoal===false||t.important===false||t.importance==='low'||t.priority==='low')return false;
const n=label(t);if(/TRAE.{0,8}(\u8bad\u7ec3\u8425|\u8bfe\u7a0b|\u539f\u578b)|\u7ba1\u7406\u4f1a\u8ba1|\u8003\u7814|Agent.{0,8}(\u5927\u8d5b|PPT|\u667a\u80fd\u4f53)|\u6bd4\u8d5b.{0,8}\u4ea4\u4ed8/.test(n))return true;return null;}
function quadrant(t){const imp=important(t);if(imp===null)return 'unknown-important';return (mins(t)>60||(Array.isArray(t.subtasks)&&t.subtasks.length>3)?'long':'short')+'-'+(imp?'important':'unimportant');}
function capacity(a,day,excludeIds){const hours=Number(a.dailyHours&&a.dailyHours[day]),cap=Number.isFinite(hours)&&hours>0?Math.floor(hours*60*.8):0,excluded=excludeIds instanceof Set?excludeIds:new Set(excludeIds||[]);const used=a.tasks.filter(t=>!isDone(t)&&pool(t)==='scheduled'&&t.date===day&&Number.isFinite(t.startMinutes)&&!excluded.has(String(t.id))).reduce((n,t)=>n+Math.max(0,end(t)-t.startMinutes),0);return Math.max(0,cap-used);}
function reviewPhase(at,ddl){const time=at||now(),minute=time.getHours()*60+time.getMinutes();if(minute<900)return '';const day=key(time);if(day===dateAdd(ddl,-3))return 'D-3';if(day===dateAdd(ddl,-2))return 'D-2';return '';}
function latestScheduleDay(t,ddl){const q=quadrant(t);return q==='long-important'||q==='unknown-important'?dateAdd(ddl,-3):dateAdd(ddl,-2);}
function needsReview(t,ddl){if(isDone(t)||fixed(t)||manualLocked(t)||pool(t)==='trash'||t.ddlReviewResolved)return false;const scheduled=pool(t)==='scheduled'&&Number.isFinite(t.startMinutes)&&t.scheduleStatus==='scheduled';return !scheduled||String(t.date||'')>latestScheduleDay(t,ddl);}
function batchFor(a,ddl){const d3=dateAdd(ddl,-3),d2=dateAdd(ddl,-2),tasks=a.tasks.filter(t=>!isDone(t)&&pool(t)!=='trash'&&due(t)===ddl&&needsReview(t,ddl));
const manualLate=a.tasks.filter(t=>!isDone(t)&&due(t)===ddl&&manualLocked(t)&&String(t.date||'')>latestScheduleDay(t,ddl));
const groups={'long-important':[],'unknown-important':[],'short-important':[],'long-unimportant':[],'short-unimportant':[]};tasks.forEach(t=>groups[quadrant(t)].push(t));
const demand=tasks.reduce((n,t)=>n+mins(t),0),ids=new Set(tasks.map(t=>String(t.id))),available=capacity(a,d3,ids)+capacity(a,d2,ids);return {ddl,d3,d2,tasks,manualLate,groups,demand,available,deficit:Math.max(0,demand-available),overload:demand>available};}
function chooseDiscard(a,tasks,done,reason){const xs=tasks.filter(t=>pool(t)!=='trash');let i=0;function next(){if(i>=xs.length){done&&done();return;}const t=xs[i++];dialog('\u4eba\u5de5\u786e\u8ba4\u820d\u5f03\uff08'+i+'/'+xs.length+'\uff09','\u662f\u5426\u820d\u5f03\u300a'+esc(label(t))+'\u300b\uff1f\u4fdd\u7559\u5c31\u7ee7\u7eed\u6392\u671f\uff1b\u53ea\u6709\u4f60\u786e\u8ba4\u540e\u624d\u8fdb\u5783\u573e\u6876\u3002',[
{label:'\u4fdd\u7559\uff0c\u770b\u4e0b\u4e00\u9879',run:()=>{t.discardCandidate=false;t.discardReviewedAt=Date.now();save(a);next();}},{label:'\u786e\u8ba4\u820d\u5f03\uff0824\u5c0f\u65f6\u53ef\u6062\u590d\uff09',primary:true,run:()=>{move(a,t,'trash',reason||'human-approved-discard');save(a);emit('task.trashed',{taskId:t.id,expiresAt:t.trashExpiresAt});next();}}]);}next();}
function distribute(a,b){
 const g=b.groups,lateScan=today()===b.d2,firstDay=lateScan?b.d2:b.d3;
 const all=[...g['long-important'],...g['unknown-important'],...g['short-important'],...g['long-unimportant'],...g['short-unimportant']];
 all.forEach(t=>{
  if(pool(t)!=='scheduled')move(a,t,'scheduled','DDL review reintegrated from task pool');
  t.ddlReviewAt=Date.now();t.ddlReviewPending=true;t.ddlQuadrant=quadrant(t);
  t.urgent=important(t)===true;t.important=important(t)!==false;
  t.startMinutes=null;delete t.endMinutes;t.aiScheduled=true;t.scheduleStatus='needs-arrangement';
  if(t.ddlQuadrant==='long-important'||t.ddlQuadrant==='unknown-important'){
   t.date=firstDay;t.startMinutes=null;t.scheduleNotBefore=firstDay;t.latestScheduleDate=firstDay;t.schedulePriority='high';
  }else if(t.ddlQuadrant==='short-important'){
   t.date=firstDay;t.startMinutes=null;t.scheduleNotBefore=firstDay;t.latestScheduleDate=b.d2;t.schedulePriority='high';
  }else if(t.ddlQuadrant==='long-unimportant'){
   t.date=b.d2;t.startMinutes=null;t.scheduleNotBefore=b.d2;t.latestScheduleDate=b.d2;t.schedulePriority='below-high';
  }else{
   t.date=b.d2;t.startMinutes=null;t.scheduleNotBefore=b.d2;t.latestScheduleDate=b.d2;t.schedulePriority='lowest';t.discardCandidate=true;
  }
 });
 const p1=api.reflow(a,firstDay);
 if(!lateScan){
  g['short-important'].forEach(t=>{if(pool(t)==='scheduled'&&(!Number.isFinite(t.startMinutes)||t.scheduleStatus==='needs-arrangement')){t.date=b.d2;t.startMinutes=null;t.scheduleNotBefore=b.d2;t.scheduleStatus='needs-arrangement';}});
 }
 const p2=lateScan?{moved:0,warnings:[]}:api.reflow(a,b.d2);
 const unresolved=all.filter(t=>pool(t)!=='trash'&&(!Number.isFinite(t.startMinutes)||t.scheduleStatus==='needs-arrangement'));
 unresolved.forEach(t=>{move(a,t,'pending',t.ddlQuadrant==='long-important'?'D-3 mandatory high-priority task still does not fit':'D-2 final capacity still insufficient');t.latestScheduleDate=b.d2;});
 all.forEach(t=>{if(pool(t)==='scheduled'&&Number.isFinite(t.startMinutes)&&t.scheduleStatus==='scheduled'){t.ddlReviewPending=false;}});
 save(a);emit('ddl.review.distributed',{ddl:b.ddl,lateScan,d3Moved:p1.moved,d2Moved:p2.moved,unresolved:unresolved.map(t=>t.id)});
 return {p1,p2,unresolved,lateScan};
}
function dueReview(a,at){const time=at||now(),day=key(time);if(time.getHours()*60+time.getMinutes()<900)return [];
const ddls=[...new Set(a.tasks.filter(t=>!isDone(t)&&due(t)).map(due))].sort(),batches=ddls.map(d=>batchFor(a,d)).filter(b=>reviewPhase(time,b.ddl)&&b.tasks.length&&!a._autoloopDdlReviewKeys['d3:'+b.ddl]);
if(!batches.length)return [];const b=batches[0];a._autoloopDdlReviewKeys['d3:'+b.ddl]=Date.now();if(reviewPhase(time,b.ddl)==='D-2')a._autoloopDdlReviewKeys['d2:'+b.ddl]=Date.now();
b.tasks.forEach(t=>{t.ddlReviewPending=true;});save(a);emit('ddl.review.opened',{ddl:b.ddl,date:day,phase:reviewPhase(time,b.ddl),overload:b.overload,demand:b.demand,available:b.available,manualLate:b.manualLate.map(t=>t.id)});
const result=distribute(a,b);
if(result.unresolved.length||b.manualLate.length){const manual=b.manualLate.length?'<h4>手动锁定且排期晚于保护窗口（未自动挪动）</h4>'+list(b.manualLate):'';const unresolved=result.unresolved.length?'<h4>容量不足、仍待安排</h4>'+list(result.unresolved):'';dialog('DDL '+reviewPhase(time,b.ddl)+' 自动排期结果',manual+unresolved,[{label:'打开任务池',primary:true,run:showPools},{label:'逐项确认舍弃未安排任务',run:()=>chooseDiscard(a,result.unresolved,()=>save(a),'DDL review human-approved discard')}]);}
else toast('DDL '+reviewPhase(time,b.ddl)+' 核查完成：'+b.tasks.length+'项任务已自动排入时间表；低优先级任务仅作候选，未自动舍弃。');
return b.tasks;}
function checkDdlSecondDay(a,at){
 const time=at||now(),day=key(time);if(time.getHours()*60+time.getMinutes()<900)return [];
 const ddls=[...new Set(a.tasks.filter(t=>!isDone(t)&&t.ddlReviewPending&&due(t)).map(due))].filter(d=>day===dateAdd(d,-2)&&!a._autoloopDdlReviewKeys['d2:'+d]);
 if(!ddls.length)return [];
 const allUnresolved=[],manualLate=[];
 ddls.forEach(ddl=>{
  const xs=a.tasks.filter(t=>!isDone(t)&&due(t)===ddl&&t.ddlReviewPending&&pool(t)!=='trash'&&needsReview(t,ddl));
  const locked=a.tasks.filter(t=>!isDone(t)&&due(t)===ddl&&manualLocked(t)&&String(t.date||'')>day);
  a._autoloopDdlReviewKeys['d2:'+ddl]=Date.now();
  xs.forEach(t=>{if(pool(t)!=='scheduled')move(a,t,'scheduled','D-2 final scheduling attempt');t.date=day;t.startMinutes=null;delete t.endMinutes;t.aiScheduled=true;t.scheduleNotBefore=day;t.latestScheduleDate=day;t.schedulePriority=important(t)===true?'high':'below-high';t.scheduleStatus='needs-arrangement';});
  const r=xs.length?api.reflow(a,day):{moved:0,warnings:[]};
  const still=xs.filter(t=>pool(t)!=='trash'&&(!Number.isFinite(t.startMinutes)||t.scheduleStatus==='needs-arrangement'));
  still.forEach(t=>move(a,t,'pending','D-2 final capacity still insufficient'));
  allUnresolved.push(...still);manualLate.push(...locked);
  emit('ddl.review.second_reflow',{ddl,moved:r.moved,warnings:r.warnings,stillUnscheduled:still.map(t=>t.id)});
 });
 save(a);
 if(allUnresolved.length||manualLate.length){const html=(manualLate.length?'<h4>手动锁定且无法自动调整</h4>'+list(manualLate):'')+(allUnresolved.length?'<h4>D-2仍然排不下，不会静默推到D-1</h4>'+list(allUnresolved):'');dialog('D-2最后排布结果',html,[{label:'打开待安排池',primary:true,run:showPools},{label:'逐项确认舍弃未安排任务',run:()=>chooseDiscard(a,allUnresolved,()=>save(a),'D-2 human-approved discard')}]);}
 else toast('D-2最后排布完成：所有需要推进的任务已安排；未删除任何任务。');
 return allUnresolved;
}
function syncPending(a){const changed=[];a.tasks.forEach(t=>{if(isDone(t)||pool(t)!=='scheduled'||fixed(t))return;if(t.scheduleStatus==='needs-arrangement'&&!Number.isFinite(t.startMinutes)){t.workflowPool='pending';t.pendingSince=Number(t.pendingSince)||Date.now();t.triageDueAt=t.pendingSince+DAY;changed.push(t.id);}});if(changed.length)emit('task.pending.entered',{taskIds:changed});return changed;}
function pendingSla(a,at){const ts=at||Date.now(),day=key(new Date(ts)),xs=a.tasks.filter(t=>!isDone(t)&&pool(t)==='pending'&&Number(t.pendingSince||t.createdAt||ts)+DAY<=ts&&!t._pendingSlaNoticeAt);if(!xs.length)return [];
const ddlProtected=xs.filter(t=>due(t)&&dayDiffSafe(day,due(t))<=2),ordinary=xs.filter(t=>!ddlProtected.includes(t));
xs.forEach(t=>t._pendingSlaNoticeAt=ts);save(a);emit('task.pending.sla_breached',{taskIds:xs.map(t=>t.id),ddlProtected:ddlProtected.map(t=>t.id)});
const runOrdinary=()=>{if(!ordinary.length)return;ordinary.forEach(t=>{move(a,t,'scheduled','24h pending SLA reschedule');t.date=t.date||today();});const r=api.reflow(a,today());save(a);emit('task.pending.rescheduled',{moved:r.moved,warnings:r.warnings});};
if(ddlProtected.length)dialog('临近DDL的待安排任务','以下任务距离截止不超过两天，不能通过24小时SLA自动推迟或覆盖最后排布窗口。请先裁剪范围、释放时间或人工决定。'+list(ddlProtected),[{label:'打开待安排池',primary:true,run:showPools},{label:'只重新安排其他普通任务',run:runOrdinary}]);
else dialog('待安排超过24小时','以下普通任务需要重新排布或人工确认舍弃。'+list(ordinary),[{label:'重新排布',primary:true,run:runOrdinary},{label:'逐项确认舍弃',run:()=>chooseDiscard(a,ordinary,()=>save(a),'24h pending SLA human discard')}]);
return xs;}
function dayDiffSafe(a,b){const x=new Date(a+'T12:00:00'),y=new Date(b+'T12:00:00');return Math.round((y-x)/DAY);}
function bufferLoad(a){return a.tasks.filter(t=>!t.done&&pool(t)==='buffer').reduce((n,t)=>n+mins(t),0);}
function bufferCapacity(a){if(Number.isFinite(a.bufferCapacityMinutes)&&a.bufferCapacityMinutes>=0)return a.bufferCapacityMinutes;return Math.floor((Number(a.dailyHours&&a.dailyHours[today()])||4)*60*.2);}
function enforceBufferCapacity(a){const load=bufferLoad(a),cap=bufferCapacity(a);if(load<=cap)return false;if(a._autoloopBufferOverloadAt&&Date.now()-a._autoloopBufferOverloadAt<MIN*10)return true;a._autoloopBufferOverloadAt=Date.now();save(a);emit('buffer.capacity.exceeded',{load,capacity:cap});
dialog('\u7f13\u51b2\u7bb1\u5bb9\u91cf\u8d85\u9650','\u5f53\u524d '+load+'\u5206\u949f\uff0c\u4e0a\u9650 '+cap+'\u5206\u949f\u3002\u7f13\u51b2\u7bb1\u4efb\u52a1\u4e0d\u4f1a\u81ea\u52a8\u6eda\u5230\u660e\u5929\uff0c\u8bf7\u88c1\u526a\u3001\u6709\u9650\u987a\u5ef6\u6216\u4eba\u5de5\u820d\u5f03\u3002'+list(a.tasks.filter(t=>pool(t)==='buffer'&&!t.done)),[{label:'\u6253\u5f00\u4efb\u52a1\u6c60',primary:true,run:showPools},{label:'\u7a0d\u540e\u5904\u7406'}]);return true;}
function showPools(){const a=ensure(acct());cleanupTrash(a);save(a);showPoolButton();const groups=[['\u5f85\u5b89\u6392\u6c60','pending'],['\u7f13\u51b2\u7bb1','buffer'],['\u5783\u573e\u6876\uff0824\u5c0f\u65f6\u53ef\u6062\u590d\uff09','trash']];
const html=groups.map(([name,k])=>{const xs=a.tasks.filter(t=>pool(t)===k);return '<section class="aloop-pool"><h4>'+name+' ('+xs.length+')</h4>'+(xs.length?xs.map(t=>'<article><div><b>'+esc(label(t))+'</b><small>'+esc(t.poolReason||'')+' · '+mins(t)+' min</small></div><div class="aloop-pool-actions">'+(k==='trash'?'<button data-pool-action="restore" data-id="'+esc(t.id)+'">\u6062\u590d</button>':'<button data-pool-action="schedule" data-id="'+esc(t.id)+'">\u91cd\u65b0\u6392\u671f</button>'+(k==='buffer'?'<button data-pool-action="trim" data-id="'+esc(t.id)+'">\u88c1\u526a</button><button data-pool-action="defer" data-id="'+esc(t.id)+'">\u987a\u5ef6</button>':'')+'<button data-pool-action="discard" data-id="'+esc(t.id)+'">\u820d\u5f03</button>')+'</div></article>').join(''):'<p class="aloop-muted">\u6682\u65e0\u4efb\u52a1</p>')+'</section>';}).join('');
const m=dialog('\u4efb\u52a1\u6c60\u7ba1\u7406',html,[{label:'\u5173\u95ed'}]);m.querySelectorAll('[data-pool-action]').forEach(b=>b.onclick=()=>{const t=a.tasks.find(x=>String(x.id)===b.dataset.id);if(!t)return;const act=b.dataset.poolAction;
if(act==='restore'){move(a,t,'pending','\u4ece\u5783\u573e\u6876\u6062\u590d');t._pendingSlaNoticeAt=null;}
if(act==='schedule'){move(a,t,'scheduled','\u7528\u6237\u786e\u8ba4\u91cd\u65b0\u6392\u671f');t.date=t.date||today();t.latestScheduleDate=due(t)||undefined;const r=api.reflow(a,today());emit('pool.task.rescheduled',{taskId:t.id,moved:r.moved,warnings:r.warnings});}
if(act==='trim'){const n=Number(prompt('\u88c1\u526a\u540e\u9884\u8ba1\u5206\u949f',String(Math.max(5,Math.round(mins(t)*.7)))));if(Number.isFinite(n)&&n>=5&&n<mins(t)){t.plannedMinutes=n;t.estMinutes=n;t.remainingMinutes=n;t.scopeTrimmedAt=Date.now();}}
if(act==='defer'){const max=Number(a.bufferMaxDeferrals||2),count=Number(t.bufferDeferrals||0);if(count>=max){toast('\u5df2\u8fbe\u5230\u6700\u5927\u987a\u5ef6\u6b21\u6570\uff0c\u8bf7\u88c1\u526a\u3001\u6392\u671f\u6216\u820d\u5f03\u3002');return;}t.bufferDeferrals=count+1;t.bufferExpiresAt=Date.now()+DAY;t.bufferReason='\u7528\u6237\u786e\u8ba4\u987a\u5ef6 '+count+'/'+max;}
if(act==='discard'){confirmDiscard(a,t,'\u7528\u6237\u786e\u8ba4\u820d\u5f03');return;}save(a);showPools();});}
function confirmDiscard(a,t,reason){dialog('\u786e\u8ba4\u820d\u5f03\uff1f','\u300a'+esc(label(t))+'\u300b\u8fdb\u5165\u5783\u573e\u6876\uff0c24\u5c0f\u65f6\u5185\u53ef\u6062\u590d\uff0c\u8d85\u65f6\u672a\u6062\u590d\u624d\u4f1a\u6c38\u4e45\u6e05\u9664\u3002',[{label:'\u53d6\u6d88'},{label:'\u6211\u786e\u8ba4\u820d\u5f03',primary:true,run:()=>{move(a,t,'trash',reason);save(a);emit('task.trashed',{taskId:t.id,expiresAt:t.trashExpiresAt});}}]);}
function nextTask(a,day,minute,exclude){return a.tasks.filter(t=>!t.done&&pool(t)==='scheduled'&&String(t.id)!==String(exclude)&&Number.isFinite(t.startMinutes)&&(t.date>day||(t.date===day&&t.startMinutes>=minute))).sort((x,y)=>String(x.date).localeCompare(String(y.date))||x.startMinutes-y.startMinutes)[0]||null;}
function fixedAt(a,at){const day=key(at),m=at.getHours()*60+at.getMinutes();return a.tasks.filter(t=>!t.done&&pool(t)==='scheduled'&&t.date===day&&Number.isFinite(t.startMinutes)&&t.startMinutes<=m&&end(t)>m&&!(a.activeTimer&&String(a.activeTimer.taskId)===String(t.id))).sort((x,y)=>x.startMinutes-y.startMinutes)[0]||null;}
function classifyInterruption(a,at){if(a.activeTimer&&a.activeTimer.taskId)return {kind:'pomodoro',task:a.tasks.find(t=>String(t.id)===String(a.activeTimer.taskId))||null,checkpointRequired:true};const displaced=fixedAt(a,at);return {kind:'preplanned-slot',task:displaced,checkpointRequired:false};}
function taskCheckpoint(t,timer){return {taskId:t.id,progress:t.progress||t.progressPercent||0,completedSteps:Array.isArray(t.completedSteps)?t.completedSteps.slice():[],currentStep:t.currentStep||'',executionNote:t.executionNote||'',actionId:t.activeActionId||t.actionId||'',materials:(t.materials||[]).map(x=>typeof x==='string'?x:{id:x&&x.id,version:x&&(x.version||x.versionId),sha:x&&(x.sha256||x.contentHash)}),nextAction:t.nextAction||t.nextStep||'',timer:Object.assign({},timer),savedAt:Date.now(),wasRunning:!!timer.runningSince};}
async function persistInterruption(a,s){const snap=api._snapshot?api._snapshot(a):{tasks:a.tasks,dailyHours:a.dailyHours,activeTimer:a.activeTimer,activeTaskId:a.priorityFocusTaskId};snap.interruption=s;try{localStorage.setItem('sy_autoloop_interrupt_snapshot_'+String(root.SY.currentAccountKey||'default'),JSON.stringify(snap));}catch(_){}try{api._checkpoint&&await api._checkpoint(a,'daily-plan');}catch(_){}try{const r=await fetch('/api/autoloop/interrupt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accountId:String(root.SY.currentAccountKey||'default'),taskId:'daily-plan',eventId:s.id,payload:{kind:s.kind,source:s.source,taskId:s.suddenTaskId,interruptedTaskId:s.interruptedTaskId||null,displacedTaskId:s.displacedTaskId||null},snapshot:snap})});if(!r.ok)emit('interruption.local_fallback',{eventId:s.id,status:r.status});}catch(_){emit('interruption.local_fallback',{eventId:s.id});}}
function clearSuddenTimer(a,s){if(a.activeTimer&&String(a.activeTimer.taskId)===String(s.suddenTaskId)){if(a.activeTimer.runningSince){a.activeTimer.accumulatedMs=(Number(a.activeTimer.accumulatedMs)||0)+(Date.now()-a.activeTimer.runningSince);a.activeTimer.runningSince=null;}a.activeTimer=null;}const t=a.tasks.find(x=>String(x.id)===String(s.suddenTaskId));if(t){t.completionClaimed=true;t.completionClaimedAt=Date.now();t.scheduleStatus='awaiting-evidence';t.executionNote=(t.executionNote||'')+'\n\u7528\u6237\u58f0\u660e\u5df2\u5904\u7406\u7a81\u53d1\u4e8b\u9879\uff0c\u5f85\u8bc1\u636e\u9a8c\u6536\u3002';}}
function promptAfterReturn(s){const a=ensure(acct());clearSuddenTimer(a,s);const displaced=a.tasks.find(t=>String(t.id)===String(s.displacedTaskId)),interrupted=a.tasks.find(t=>String(t.id)===String(s.interruptedTaskId)),target=s.kind==='pomodoro'?interrupted:displaced,next=nextTask(a,s.day,s.occupiedEnd||s.atMinute||0,s.suddenTaskId);
dialog(s.kind==='pomodoro'?'\u756a\u8304\u949f\u4e2d\u65ad\u540e\u7684\u6392\u671f\u786e\u8ba4':'\u5df2\u9884\u6392\u56fa\u5b9a\u65f6\u6bb5\u3001\u4f46\u5c1a\u672a\u542f\u52a8\u7684\u4efb\u52a1\u88ab\u6324\u5360',
'\u7a81\u53d1\u4efb\u52a1\u5df2\u58f0\u660e\u5904\u7406\u5b8c\u6210\uff08\u4ecd\u9700\u8bc1\u636e\u9a8c\u6536\uff09\u3002\u4e0b\u4e00\u4e2a\u4efb\u52a1\uff1a\u300a'+esc(next?label(next):'\u6682\u65e0\u540e\u7eed\u4efb\u52a1')+'\u300b\u3002\u5b83\u662f\u5426\u7d27\u6025\u91cd\u8981\uff1f'+(s.kind==='pomodoro'?'\u539f\u4efb\u52a1\u5df2\u542f\u52a8\uff0c\u65ad\u70b9\u5df2\u4fdd\u5b58\u3002':'\u539f\u56fa\u5b9a\u65f6\u6bb5\u4efb\u52a1\u5c1a\u672a\u542f\u52a8\uff0c\u6ca1\u6709\u6267\u884c\u65ad\u70b9\u3002'),[
{label:'\u4e0b\u4e00\u4e2a\u4efb\u52a1\u7d27\u6025\u91cd\u8981\uff1a\u4fdd\u6301\u540e\u7eed\u987a\u5e8f',primary:true,run:()=>{if(target){if(s.kind==='pomodoro')target.checkpoint=s.checkpoint;move(a,target,'buffer',s.kind==='pomodoro'?'\u756a\u8304\u949f\u4e2d\u65ad\u4efb\u52a1':'\u88ab\u7a81\u53d1\u6324\u5360\u7684\u672a\u5f00\u59cb\u56fa\u5b9a\u65f6\u6bb5\u4efb\u52a1');}a._autoloopInterruption=null;save(a);emit('interruption.branch.important',{kind:s.kind,nextTaskId:next&&next.id,targetTaskId:target&&target.id});enforceBufferCapacity(a);}},
{label:'\u4e0b\u4e00\u4e2a\u4e0d\u7d27\u6025\uff1a\u5148\u6062\u590d\u539f\u4efb\u52a1',run:()=>{if(next&&!fixed(next)&&important(next)!==true&&!next.mustKeep&&!next.coreGoal)move(a,next,'buffer','\u4e0b\u4e00\u4e2a\u975e\u56fa\u5b9a\u3001\u975e\u6838\u5fc3\u4efb\u52a1\u4e3a\u6062\u590d\u539f\u4efb\u52a1\u8ba9\u4f4d');if(target){move(a,target,'scheduled','\u4f18\u5148\u6062\u590d\u88ab\u6253\u65ad/\u6324\u5360\u4efb\u52a1');target.date=today();target.startMinutes=Math.max(480,s.occupiedEnd||s.atMinute||now().getHours()*60);target.scheduleStatus='scheduled';target.schedulePriority='resume-first';target.latestScheduleDate=due(target)||undefined;a.priorityFocusTaskId=target.id;}
if(s.kind==='pomodoro'&&target&&s.checkpoint&&s.checkpoint.timer)a.activeTimer=Object.assign({},s.checkpoint.timer,{runningSince:null});else a.activeTimer=null;
const r=api.reflow(a,today());a._autoloopInterruption=null;save(a);
if(s.kind==='pomodoro'&&target&&a.activeTimer&&String(a.activeTimer.taskId)===String(target.id)&&root.SY.resumeTimerSession)root.SY.resumeTimerSession();
else if(s.kind==='preplanned-slot'&&target&&root.SY.startTaskTimer)root.SY.startTaskTimer(target.id,'countdown');
emit('interruption.branch.resume-first',{kind:s.kind,nextTaskId:next&&next.id,targetTaskId:target&&target.id,moved:r.moved,warnings:r.warnings});enforceBufferCapacity(a);}}
]);}
function urgencyFrom(s){if(/(\u53ef\u6682\u7f13|\u4e0d\u7d27\u6025|\u7a0d\u540e\u5904\u7406|\u660e\u5929\u518d|\u6709\u7a7a\u518d)/.test(s))return 'deferrable';if(/(\u9a6c\u4e0a|\u7acb\u523b|\u73b0\u5728\u5c31|\u5373\u523b|\u5fc5\u987b\u7acb\u5373|\u7d27\u6025\u5904\u7406)/.test(s))return 'immediate';return '';}
async function handleSudden(text,source,urgency){let a=ensure(acct());const at=now(),level=urgency||urgencyFrom(text);if(!level){dialog('\u5148\u5224\u65ad\u7a81\u53d1\u7b49\u7ea7','\u300a'+esc(String(text).slice(0,180))+'\u300b\u662f\u5426\u5fc5\u987b\u73b0\u5728\u7acb\u5373\u5904\u7406\uff1f',[
{label:'\u53ef\u6682\u7f13\uff1a\u653e\u7f13\u51b2\u7bb1\uff0c\u539f\u8ba1\u5212\u4e0d\u53d8',primary:true,run:()=>handleSudden(text,source,'deferrable')},{label:'\u5373\u523b\u5fc5\u987b\u5904\u7406',run:()=>handleSudden(text,source,'immediate')}]);return {ok:true,awaitingUrgency:true};}
const t={id:id(),name:String(text).slice(0,160),title:String(text).slice(0,160),date:key(at),createdAt:Date.now(),plannedMinutes:25,estMinutes:25,done:false,important:level==='immediate',urgent:level==='immediate',source:source||'sudden-task',taskType:'sudden',workflowPool:level==='deferrable'?'buffer':'scheduled',scheduleStatus:level==='deferrable'?'buffered':'in-progress',dueDate:null};
if(level==='deferrable'){move(a,t,'buffer','\u7528\u6237\u786e\u8ba4\u53ef\u6682\u7f13\u7a81\u53d1');a.tasks.push(t);save(a);emit('sudden.deferrable',{taskId:t.id,source});enforceBufferCapacity(a);return {ok:true,kind:'deferrable',taskId:t.id};}
let s,cp=null;const interruptionClass=classifyInterruption(a,at);
if(interruptionClass.kind==='pomodoro'){const timer=Object.assign({},a.activeTimer),running=a.tasks.find(x=>String(x.id)===String(timer.taskId)),runningId=running&&running.id;if(running)cp=taskCheckpoint(running,timer);if(root.SY.pauseTimerSession)root.SY.pauseTimerSession();const fresh=ensure(acct());Object.keys(a).forEach(k=>delete a[k]);Object.assign(a,fresh);const runningAfterPause=a.tasks.find(x=>String(x.id)===String(runningId));s={id:id(),kind:'pomodoro',day:key(at),interruptedTaskId:runningId,atMinute:at.getHours()*60+at.getMinutes(),occupiedEnd:running?end(running):at.getHours()*60+at.getMinutes()+25,startedAt:Date.now(),source,checkpoint:cp};if(runningAfterPause){runningAfterPause.checkpoint=cp;runningAfterPause.interruptionStatus='paused-at-checkpoint';}}
else{const displaced=interruptionClass.task;s={id:id(),kind:'preplanned-slot',day:key(at),displacedTaskId:displaced&&displaced.id,atMinute:at.getHours()*60+at.getMinutes(),occupiedEnd:displaced?end(displaced):at.getHours()*60+at.getMinutes()+25,startedAt:Date.now(),source,checkpoint:null};if(displaced)move(a,displaced,'buffer','\u7a81\u53d1\u5360\u7528\u5df2\u9884\u6392\u56fa\u5b9a\u65f6\u6bb5\uff1b\u4efb\u52a1\u672a\u5f00\u59cb\uff0c\u65e0\u6267\u884c\u65ad\u70b9');}
a.tasks.push(t);s.suddenTaskId=t.id;a._autoloopInterruption=s;a.priorityFocusTaskId=t.id;t.startMinutes=s.atMinute;t.endMinutes=Math.min(1440,s.atMinute+25);t.scheduleStatus='in-progress';t.workflowPool='scheduled';save(a);emit('sudden.immediate',{taskId:t.id,kind:s.kind,displacedTaskId:s.displacedTaskId||null,interruptedTaskId:s.interruptedTaskId||null,source});await persistInterruption(a,s);if(root.SY.startTaskTimer)root.SY.startTaskTimer(t.id,'countdown');
dialog('\u7a81\u53d1\u4efb\u52a1\u5df2\u63a5\u7ba1',(s.kind==='pomodoro'?'\u539f\u756a\u8304\u949f\u5df2\u6682\u505c\uff0c\u6267\u884c\u65ad\u70b9\u5df2\u4fdd\u5b58\u3002':'\u539f\u56fa\u5b9a\u65f6\u6bb5\u4efb\u52a1\u672a\u542f\u52a8\uff0c\u5df2\u79fb\u5165\u7f13\u51b2\u7bb1\uff0c\u6ca1\u6709\u4f2a\u9020\u65ad\u70b9\u3002')+'\u73b0\u5728\u5148\u6267\u884c\u7a81\u53d1\u4efb\u52a1\u3002\u5904\u7406\u5b8c\u6210\u540e\u56de\u6765\u9009\u62e9\u540e\u7eed\u5206\u652f\u3002',[
{label:'\u6211\u5df2\u5904\u7406\u5b8c\u6210\uff0c\u8fd4\u56de\u6392\u671f',primary:true,run:()=>promptAfterReturn(s)},{label:'\u4fdd\u7559\u4e2d\u65ad\u73b0\u573a',run:()=>dialog('\u4e2d\u65ad\u73b0\u573a\u5df2\u4fdd\u5b58','\u539f\u4efb\u52a1\u3001\u8ba1\u65f6\u548c\u65ad\u70b9\u5df2\u4fdd\u5b58\uff0c\u65e0\u9700\u91cd\u65b0\u4e0a\u4f20\u3002',[{label:'\u77e5\u9053\u4e86'}])}]);return {ok:true,kind:s.kind,taskId:t.id};}

function applyAgentAction(action){
 const a=ensure(acct()),kind=String(action&&action.type||'');
 if(!action||typeof action!=='object')throw new Error('Invalid Agent proposal');
 if(kind==='replan'){
  const day=String(action.date||today());
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new Error('Invalid schedule date');
  const result=api.reflow(a,day);save(a);emit('agent.proposal.applied',{type:kind,date:day,moved:result.moved,warnings:result.warnings});
  return {ok:true,type:kind,result};
 }
 if(kind==='create_task'){
  const title=String(action.title||'').trim().slice(0,160);if(!title)throw new Error('Task title is required');
  const dueDate=String(action.dueDate||'').trim();if(dueDate&&!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))throw new Error('Invalid due date');
  const duration=Math.max(5,Math.min(480,Number(action.plannedMinutes)||25));
  const task={id:root.SY.uid?root.SY.uid():id(),name:title,category:'Agent',date:today(),dueDate:dueDate||null,estMinutes:duration,plannedMinutes:duration,startMinutes:null,done:false,important:!!action.important,urgent:false,workflowPool:'scheduled',scheduleStatus:'needs-arrangement',createdAt:Date.now(),source:'agent-approved-proposal',scheduleReason:String(action.reason||'Agent proposal approved').slice(0,300)};
  a.tasks.push(task);const result=api.reflow(a,today());save(a);emit('agent.proposal.applied',{type:kind,taskId:task.id,moved:result.moved});
  return {ok:true,type:kind,taskId:task.id,result};
 }
 const task=a.tasks.find(t=>String(t.id)===String(action.taskId||''));if(!task)throw new Error('Task not found in current account');
 if(kind==='set_next_step'){
  const next=String(action.nextStep||'').trim().slice(0,1200);if(!next)throw new Error('Next step is empty');
  task.nextStep=next;task.nextAction=next;task.agentNextStepAt=Date.now();save(a);emit('agent.proposal.applied',{type:kind,taskId:task.id,nextStep:next});return {ok:true,type:kind,taskId:task.id};
 }
 if(kind==='move_to_buffer'){
  if(fixed(task)||important(task)===true||task.mustKeep===true||task.coreGoal===true)throw new Error('Fixed commitments and protected core goals cannot be moved to the buffer by an Agent proposal');
  move(a,task,'buffer',String(action.reason||'Agent proposal approved').slice(0,300));save(a);enforceBufferCapacity(a);emit('agent.proposal.applied',{type:kind,taskId:task.id});return {ok:true,type:kind,taskId:task.id};
 }
 if(kind==='mark_awaiting_evidence'){
  task.scheduleStatus='awaiting-evidence';task.awaitingEvidenceAt=Date.now();task.evidenceReviewStatus='pending';save(a);emit('agent.proposal.applied',{type:kind,taskId:task.id});return {ok:true,type:kind,taskId:task.id};
 }
 throw new Error('Unsupported Agent proposal type');
}
function contextForAI(){const a=ensure(acct()),p={pending:0,buffer:0,trash:0};a.tasks.forEach(t=>{if(!t.done&&p[pool(t)]!==undefined)p[pool(t)]++;});const tasks=a.tasks.filter(t=>!t.done&&pool(t)!=='trash').slice(0,80).map(t=>({id:t.id,name:label(t),date:t.date||null,deadline:due(t)||null,startMinutes:Number.isFinite(t.startMinutes)?t.startMinutes:null,minutes:mins(t),status:t.scheduleStatus||'unspecified',pool:pool(t),fixed:fixed(t),important:important(t),urgent:!!t.urgent,checkpoint:!!t.checkpoint}));return {rulesVersion:3,priorityOrder:['core-must-keep','immediate-sudden','ordinary-high','long-low','short-low'],ddlReview:'D-3 15:00; ask human before discard; D-2 final arrangement day',pools:p,tasks,activeTimer:a.activeTimer||null,activeTaskId:a.priorityFocusTaskId||null,interruption:a._autoloopInterruption||null,interruptionBranches:{pomodoro:'pause timer and save execution checkpoint',preplannedSlot:'move not-started fixed block to buffer without checkpoint'},constraints:['deferrable sudden tasks never change the original schedule','pending tasks require a decision within 24 hours','trash is manually approved and restorable for 24 hours','buffer tasks never auto-roll to next day','20% daily buffer and 10-minute task transition','fixed commitments and sleep/school deadlines are protected','unknown importance is protected until user confirms'],coreGoals:['\u7ba1\u7406\u4f1a\u8ba1','\u8003\u7814','TRAE\u8bad\u7ec3\u8425\u8bfe\u7a0b','TRAE\u539f\u578b','Agent\u5927\u8d5bPPT','Agent\u667a\u80fd\u4f53']};}
function toast(s){if(root.SYMini&&root.SYMini.notice)root.SYMini.notice(s);else api.toast&&api.toast(s);}
function tick(){if(!root.SY||typeof root.SY.getAcctData!=='function')return;const a=ensure(acct()),removed=cleanupTrash(a),pending=syncPending(a);if(removed.length||pending.length)save(a);dueReview(a);checkDdlSecondDay(a);pendingSla(a);enforceBufferCapacity(a);
const expired=a.tasks.filter(t=>!t.done&&pool(t)==='buffer'&&Number(t.bufferExpiresAt||0)>0&&Number(t.bufferExpiresAt)<=Date.now()&&!t._bufferExpiryNoticeAt);if(expired.length){expired.forEach(t=>t._bufferExpiryNoticeAt=Date.now());save(a);emit('buffer.window.expired',{taskIds:expired.map(t=>t.id)});dialog('\u7f13\u51b2\u7a97\u53e3\u5df2\u7ed3\u675f','\u7f13\u51b2\u4efb\u52a1\u4e0d\u4f1a\u81ea\u52a8\u6eda\u5230\u660e\u5929\uff0c\u8bf7\u5b8c\u6210\u3001\u88c1\u526a\u3001\u6709\u9650\u987a\u5ef6\u6216\u4eba\u5de5\u820d\u5f03\u3002'+list(expired),[{label:'\u7acb\u5373\u5904\u7406',primary:true,run:showPools}]);}}
function showPoolButton(){if($('#sy-autoloop-pool-button'))return;const b=document.createElement('button');b.id='sy-autoloop-pool-button';b.className='aloop-pool-fab';b.textContent='\u4efb\u52a1\u6c60';b.onclick=showPools;document.body.append(b);}
function install(){if(!root.SY||typeof root.SY.getAcctData!=='function')return false;showPoolButton();tick();if(!root._syAutoloopRulesTimer)root._syAutoloopRulesTimer=setInterval(tick,30000);return true;}
api.rulesV2={handleSudden,showPools,cleanupTrash,dueReview,checkDdlSecondDay,pendingSla,bufferLoad,bufferCapacity,enforceBufferCapacity,applyAgentAction,contextForAI,showPoolButton,__test:{important,fixed,manualLocked,isDone,quadrant,capacity,batchFor,needsReview,latestScheduleDay,reviewPhase,fixedAt,classifyInterruption,dateAdd,bufferLoad,bufferCapacity,distribute,due,mins}};
root.SYAutoloopRules=api.rulesV2;
if(!install()){document.addEventListener('sy:ready',install);let n=0,t=setInterval(()=>{if(install()||++n>100)clearInterval(t);},100);}
})(typeof window!=='undefined'?window:null);
