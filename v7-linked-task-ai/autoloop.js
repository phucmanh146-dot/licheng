/* 上岸鸭 Autoloop：事件接管、零消耗挂起、断点恢复与缓冲重排。 */
(function (root) {
  'use strict';
  if (!root || root.SYAutoloop) return;
  const DAY_MIN = 1440, START_MIN = 8 * 60, END_MIN = 23 * 60 + 45, GAP = 10;
  let owner = '', lastState = null, banner = null, observer = null, importBusy = false;
  const pad = n => String(n).padStart(2, '0');
  const keyDate = d => d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
  const addDays = (key, n) => { const d = new Date(key + 'T12:00:00'); d.setDate(d.getDate()+n); return keyDate(d); };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const account = () => String(root.SY && root.SY.currentAccountKey || 'default').slice(0,160);
  const nowDate = () => root.SY && typeof root.SY.todayKey === 'function' ? root.SY.todayKey() : keyDate(new Date());
  const minuteOf = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s||'')); if(!m)return null; const h=+m[1],v=+m[2]; return h===24&&v===0?1440:(h<24&&v<60?h*60+v:null); };
  const clock = n => n===1440?'24:00':pad(Math.floor(n/60))+':'+pad(n%60);
  function makeId(seed) {
    let h=2166136261; for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619);}
    return 'aloop-'+(h>>>0).toString(16);
  }
  function newId(){return root.crypto&&crypto.randomUUID?crypto.randomUUID():makeId(String(Date.now())+Math.random());}
  function parseDate(text) {
    let m=String(text||'').match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if(m)return m[1]+'-'+pad(+m[2])+'-'+pad(+m[3]);
    m=String(text||'').match(/(\d{1,2})月(\d{1,2})日?/);
    if(m)return new Date().getFullYear()+'-'+pad(+m[1])+'-'+pad(+m[2]);
    if(/明天|明日/.test(text||''))return addDays(nowDate(),1);
    return nowDate();
  }
  function parseSchedule(text) {
    const lines=String(text||'').replace(/\r/g,'').split('\n').map(s=>s.trim()).filter(Boolean), rows=[];
    const re=/(\d{1,2}:\d{2})\s*[-–—~至到]\s*(\d{1,2}:\d{2})\s*(.*)/;
    const headerDateLine=lines.find(line=>!re.test(line)&&line.length<40&&/^(?:\u65e5\u671f[:\uff1a]?\s*)?(?:20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}\u6708\d{1,2}\u65e5?)$/.test(line));
    const globalDate=headerDateLine?parseDate(headerDateLine):nowDate();
    for(const line of lines){
      const m=re.exec(line);
      if(!m)continue;
      const start=minuteOf(m[1]),end=minuteOf(m[2]);
      if(start==null||end==null||end<=start)continue;
      let title=m[3].replace(/^[-—:：、\s]+/,'').trim();
      title=title.replace(/^[•·*]+\s*/,'').trim();
      if(!title)title='固定安排';
      const datePrefix=line.slice(0,m.index);
      const hasOwnDate=/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})|(\d{1,2})月(\d{1,2})日?/.test(datePrefix);
      rows.push({title:title.slice(0,180),date:hasOwnDate?parseDate(datePrefix):globalDate,startMinutes:start,endMinutes:end,minutes:end-start,
        sourceLine:line,kind:/(开会|会议|班会|讨论|上课|课程|听课|培训|考试|答辩|面试|通勤|固定|必须|直播|睡觉|休息)/.test(title)?'fixed':'scheduled'});
    }
    // A short wrapped line directly below a timed block is usually the continuation of that item.
    for(let i=0;i<lines.length;i++){
      if(re.test(lines[i]))continue;
      const prev=rows[rows.length-1];
      if(prev && lines[i].length<=28 && !/(\d{1,2}:\d{2})/.test(lines[i]) && !/^(?:[-*•·]|\d+[.、])/.test(lines[i])){
        if(prev.sourceLine===lines[i-1] || lines[i-1]===prev.sourceLine)prev.title=(prev.title+' '+lines[i]).slice(0,180);
      }
    }
    return rows;
  }
  function snapshot(a) {
    return {tasks:(a.tasks||[]).map(t=>Object.assign({},t)),activeTimer:a.activeTimer||null,
      activeTaskId:(a.activeTimer&&a.activeTimer.taskId)||a.priorityFocusTaskId||a._autoloopLastActiveTaskId||null,
      priorityFocusTaskId:a.priorityFocusTaskId||null,dailyHours:a.dailyHours||{},capturedAt:new Date().toISOString()};
  }
  async function api(path,data) {
    if(!root.SY||typeof root.SY.backendCall!=='function')return {ok:false,offline:true};
    return root.SY.backendCall(path,data,12000);
  }
  function localLedger(event) {
    try {
      const k='sy_autoloop_ledger_'+account(),old=JSON.parse(localStorage.getItem(k)||'[]');
      if(!old.some(x=>x.eventId===event.eventId))old.push(event);
      localStorage.setItem(k,JSON.stringify(old.slice(-200)));
    } catch (_) {}
  }
  async function append(type,payload,eventId) {
    const event={accountId:account(),eventId:eventId||newId(),eventType:type,payload:payload||{}};
    const result=await api('/api/autoloop/event',event);
    if(result.ok)return result.data;
    localLedger(event);return {ok:false,localOnly:true};
  }
  async function checkpoint(a,taskId) {
    const data={accountId:account(),taskId:taskId||'daily-plan',snapshot:snapshot(a)};
    try {const r=await api('/api/autoloop/checkpoint',data);if(r.ok)return r.data;}catch(_){}
    try{localStorage.setItem('sy_autoloop_checkpoint_'+account(),JSON.stringify(data.snapshot));}catch(_){}
    return {ok:false,localOnly:true};
  }
  function toast(message) {
    if(root.SYMini&&typeof root.SYMini.notice==='function')root.SYMini.notice(message);
    else {let n=document.getElementById('aloop-toast');if(!n){n=document.createElement('div');n.id='aloop-toast';n.className='aloop-toast';document.body.appendChild(n);}n.textContent=message;n.hidden=false;clearTimeout(n._timer);n._timer=setTimeout(()=>n.hidden=true,4500);}
  }
  function overlaps(a,b){return a.start<b.end && a.end>b.start;}
  function priority(t){return (t.urgent?0:1)+(t.important?0:2);}
  function reflow(a,fromDate,nowMinutesOverride) {
    const start=fromDate||nowDate(), placed=new Set(), warnings=[];
    const currentMinute=Number.isFinite(nowMinutesOverride)?nowMinutesOverride:(new Date().getHours()*60+new Date().getMinutes());
    const intakeCutoff=15*60;
    for(let offset=0;offset<3;offset++){
      const day=addDays(start,offset), fixed=(a.tasks||[]).filter(t=>!t.done&&t.date===day&&Number.isFinite(t.startMinutes)&&(t.fixedBlock===true||t.taskType==='fixed'||t.category==='固定事务'))
        .map(t=>({id:t.id,start:t.startMinutes,end:Number(t.endMinutes||t.startMinutes+(Number(t.plannedMinutes||t.estMinutes)||15))})).sort((x,y)=>x.start-y.start);
      const ddlSoon=(t)=>!!t.dueDate&&t.dueDate>=start&&t.dueDate<=addDays(start,2);
      const movable=(a.tasks||[]).filter(t=>!t.done&&!placed.has(t.id)&&!(t.fixedBlock===true||t.taskType==='fixed'||t.category==='固定事务')&&(t.date<=day||ddlSoon(t))&&(!t.dueDate||t.dueDate>=day))
        .sort((x,y)=>(x.dueDate||'9999-12-31').localeCompare(y.dueDate||'9999-12-31')||priority(x)-priority(y)||Number(x.order||0)-Number(y.order||0));
      const dailyCap=Math.max(30,Math.floor((Number(a.dailyHours&&a.dailyHours[day])||4)*60*.8));
      let used=fixed.reduce((sum,x)=>sum+Math.max(0,x.end-x.start),0), occupied=fixed.slice();
      for(const task of movable){
        const cutoffAt=new Date(day+'T15:00:00').getTime();
        const newlyAddedAfterCutoff=day===nowDate()&&currentMinute>=intakeCutoff&&Number(task.createdAt||0)>=cutoffAt;
        if(newlyAddedAfterCutoff&&task.dueDate!==day&&!task.urgent){
          task.date=addDays(day,1);task.startMinutes=null;task.scheduleStatus='needs-arrangement';
          task.scheduleReason='15:00 ???????????????????';
          warnings.push(task.name+'?15:00 ???????');
          continue;
        }
        const duration=Math.max(5,Math.min(480,Number(task.plannedMinutes||task.estMinutes)||25));
        if(used+duration>dailyCap){task.scheduleStatus='needs-arrangement';task.scheduleReason='保留20%缓冲后，今日容量不足';warnings.push(task.name);continue;}
        let candidate=day===nowDate()?Math.max(START_MIN,Math.ceil((currentMinute+10)/5)*5):START_MIN;
        if(Number.isFinite(task.startMinutes)&&task.date===day)candidate=Math.max(candidate,task.startMinutes);
        let found=null;
        const parsedDeadline=task.dueTime!=null?minuteOf(task.dueTime):null;
        const deadlineLimit=task.dueDate===day&&parsedDeadline!=null?Math.min(END_MIN,parsedDeadline):END_MIN;
        while(candidate+duration<=deadlineLimit){
          const segment={start:candidate,end:candidate+duration};
          const conflict=occupied.filter(x=>overlaps(segment,x)).sort((x,y)=>x.end-y.end)[0];
          if(!conflict){found=candidate;break;}
          candidate=Math.ceil((conflict.end+GAP)/5)*5;
        }
        if(found==null){task.scheduleStatus='needs-arrangement';task.scheduleReason='三天内没有足够空档，未覆盖固定安排';warnings.push(task.name);continue;}
        task.date=day;task.startMinutes=found;task.plannedMinutes=duration;task.aiScheduled=true;task.scheduleSource='autoloop-buffer';task.scheduleStatus='scheduled';
        task.scheduleReason='自动避开固定安排，并保留缓冲时间';delete task.endDate;delete task.endMinutes;
        occupied.push({id:task.id,start:found,end:found+duration});occupied.sort((x,y)=>x.start-y.start);used+=duration;placed.add(task.id);
      }
    }
    return {moved:placed.size,warnings};
  }
  function addFixedEvents(a,rows) {
    a.tasks=a.tasks||[];a.categories=a.categories||[];
    if(!a.categories.some(c=>c.name==='固定事务'))a.categories.push({id:root.SY.uid(),name:'固定事务',color:'#6689a7'});
    const added=[];
    rows.forEach(row=>{
      const exists=a.tasks.some(t=>!t.done&&t.date===row.date&&t.startMinutes===row.startMinutes&&Number(t.endMinutes||t.startMinutes+(t.plannedMinutes||t.estMinutes||0))===row.endMinutes&&t.name===row.title);
      if(exists)return;
      const locked=row.kind==='fixed';
      const task={id:root.SY.uid(),name:row.title,category:locked?'固定事务':'学习',taskType:locked?'fixed':'learning',date:row.date,startMinutes:row.startMinutes,
        endMinutes:row.endMinutes,estMinutes:row.minutes,plannedMinutes:row.minutes,firstTime:false,multiplier:1,done:false,
        createdAt:Date.now(),order:a.tasks.length+1,important:locked,urgent:locked,dueDate:locked?row.date:null,dueTime:locked?clock(row.endMinutes===1440?1439:row.endMinutes):null,
        fixedBlock:locked,aiScheduled:!locked,scheduleSource:'autoloop-import',scheduleStatus:locked?'locked':'scheduled'};
      a.tasks.push(task);added.push(task);
    });
    return added;
  }
  function mountBanner() {
    if(banner&&banner.isConnected)return banner;
    banner=document.createElement('aside');banner.id='sy-autoloop-banner';banner.hidden=true;
    banner.innerHTML='<div class="aloop-copy"><small>上岸鸭 · 自动接管</small><strong data-aloop-title></strong><p data-aloop-detail></p></div><div class="aloop-actions"><button type="button" data-aloop="resume">接着原任务</button><button type="button" data-aloop="dismiss">知道了</button></div>';
    document.body.appendChild(banner);
    banner.addEventListener('click',async ev=>{
      const b=ev.target.closest('[data-aloop]');if(!b)return;
      if(b.dataset.aloop==='resume'){await resumeOriginal();banner.hidden=true;}
      else banner.hidden=true;
    });
    return banner;
  }
  function showBanner(title,detail) {
    const n=mountBanner();n.querySelector('[data-aloop-title]').textContent=title;n.querySelector('[data-aloop-detail]').textContent=detail;n.hidden=false;
  }
  async function resumeOriginal() {
    const a=root.SY.getAcctData(),eventId=newId();
    const response=await api('/api/autoloop/resume',{accountId:account(),taskId:'daily-plan',eventId,interruptionEventId:a._autoloopLastInterruptionId,note:'用户返回原任务现场'});
    let saved=response.ok&&response.data?response.data.snapshot:null;
    try{const local=JSON.parse(localStorage.getItem('sy_autoloop_interrupt_snapshot_'+account())||'null');if(local)saved=local;}catch(_){}
    if(saved&&Array.isArray(saved.tasks)){
      a.tasks=a.tasks||[];const ids=new Set(a.tasks.map(t=>t.id));
      saved.tasks.forEach(t=>{if(t&&t.id&&!ids.has(t.id)){a.tasks.push(t);ids.add(t.id);}});
      if(!a.dailyHours||!Object.keys(a.dailyHours).length)a.dailyHours=saved.dailyHours||{};
      if(!a.activeTimer&&saved.activeTimer)a.activeTimer=Object.assign({},saved.activeTimer,{runningSince:null});
      const restoreId=saved.activeTaskId||saved.priorityFocusTaskId;
      if(restoreId&&ids.has(restoreId))a.priorityFocusTaskId=restoreId;
      root.SY.saveAcctData(a);
    }
    const id=a._autoloopLastActiveTaskId||(saved&&(saved.activeTaskId||saved.priorityFocusTaskId))||a.priorityFocusTaskId;
    if(id&&(a.tasks||[]).some(t=>t.id===id&&!t.done)){a.priorityFocusTaskId=id;root.SY.saveAcctData(a);if(root.SY.openTaskModal)root.SY.openTaskModal(id);}
    await append('interruption.resumed',{interruptionEventId:a._autoloopLastInterruptionId,taskId:id||''},eventId);
    try{localStorage.removeItem('sy_autoloop_interrupt_snapshot_'+account());}catch(_){}
    if(a.activeTimer&&id&&a.activeTimer.taskId===id&&!a.activeTimer.runningSince&&typeof root.SY.resumeTimerSession==='function')root.SY.resumeTimerSession();
    toast('已恢复原任务现场；新的固定安排仍然保留。');
  }
  async function importSchedule(text,source) {
    if(importBusy)return {ok:false,busy:true};importBusy=true;
    try {
      const rows=parseSchedule(text);
      if(!rows.length)return {ok:false,needsTime:true};
      let a=root.SY.getAcctData();
      if(a.activeTimer&&a.activeTimer.runningSince&&typeof root.SY.pauseTimerSession==='function')root.SY.pauseTimerSession();
      a=root.SY.getAcctData();
      const before=snapshot(a),active=a.activeTimer&&a.activeTimer.taskId;
      a._autoloopLastActiveTaskId=active||a.priorityFocusTaskId||'';
      const signature=rows.map(x=>[x.date,x.startMinutes,x.endMinutes,x.title].join('|')).join('\n');
      const eventId=makeId('schedule-import|'+account()+'|'+signature);
      const first=rows[0],payload={eventId,kind:'schedule-import',title:first.title,date:first.date,start:clock(first.startMinutes),
        end:clock(first.endMinutes),count:rows.length,source:String(source||'upload').slice(0,80),summary:rows.slice(0,8).map(x=>x.date+' '+clock(x.startMinutes)+'-'+clock(x.endMinutes)+' '+x.title)};
      try{localStorage.setItem('sy_autoloop_interrupt_snapshot_'+account(),JSON.stringify(before));}catch(_){}
      const persisted=await api('/api/autoloop/interrupt',{accountId:account(),taskId:'daily-plan',eventId,payload,snapshot:before});
      if(!persisted.ok) {
        localLedger({accountId:account(),eventId,eventType:'interruption.created',payload,snapshot:before,taskId:'daily-plan'});
      }
      a._autoloopLastInterruptionId=eventId;
      const added=addFixedEvents(a,rows),plan=reflow(a,first.date);
      const fixedByDay={};
      (a.tasks||[]).filter(t=>!t.done&&(t.fixedBlock===true||t.taskType==='fixed'||t.category==='固定事务')&&Number.isFinite(t.startMinutes)&&t.date>=first.date&&t.date<=addDays(first.date,2)).forEach(t=>{(fixedByDay[t.date]||(fixedByDay[t.date]=[])).push({name:t.name,start:t.startMinutes,end:Number(t.endMinutes||t.startMinutes+(t.plannedMinutes||t.estMinutes||0))});});
      Object.keys(fixedByDay).forEach(day=>{const list=fixedByDay[day].sort((x,y)=>x.start-y.start);for(let i=1;i<list.length;i++)if(list[i].start<list[i-1].end)plan.warnings.push('固定安排冲突：'+list[i-1].name+' / '+list[i].name);});
      root.SY.saveAcctData(a);
      await append('schedule.imported',{eventId,count:added.length,source:String(source||'upload'),dates:rows.map(x=>x.date)});
      await append('schedule.replanned',{eventId,moved:plan.moved,needsArrangement:plan.warnings.slice(0,20),bufferPercent:20});
      showBanner('已接管 '+added.length+' 个时间安排', '原计划已保存；课程/会议保持锁定，学习任务可弹性移动，并预留20%缓冲。'+(plan.warnings.length?' 有 '+plan.warnings.length+' 项容量不足或固定时间冲突，已保留并标记，不会静默覆盖。':'')+' 等你有空时，一键接着原任务。');
      return {ok:true,added:added.length,moved:plan.moved,warnings:plan.warnings};
    } finally {importBusy=false;}
  }
  async function interrupt(text,source) {
    const result=await importSchedule(text,source||'temporary-event');
    if(result.needsTime)toast('没有识别到明确的开始—结束时间。把课程/会议通知原文或截图上传即可，不用手动拆成任务。');
    return result;
  }
  function stripTimedLines(text) {
    const lines=String(text||'').replace(/\r/g,'').split('\n'),out=[];
    const re=/(\d{1,2}:\d{2})\s*[-–—~至到]\s*(\d{1,2}:\d{2})/;
    let previousTimed=false;
    lines.forEach((line,index)=>{
      const s=line.trim();if(!s)return;
      if(re.test(s)){previousTimed=true;return;}
      if(previousTimed&&s.length<=28&&!/^(?:[-*•·]|\d+[.、])/.test(s)){previousTimed=false;return;}
      previousTimed=false;
      if(index<3&&s.length<60&&/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})|(\d{1,2})月(\d{1,2})日?/.test(s))return;
      out.push(s);
    });
    return out.join('\n').trim();
  }
  async function runUntimedIntake(text,originalText,fromDate) {
    const source=String(text||'').trim();if(!source)return {added:0,warnings:[]};
    const body=document.getElementById('tiBody'),box=body&&body.querySelector('#tiText'),extract=body&&body.querySelector('[data-ti="extract"]');
    if(!box||!extract)return {added:0,warnings:[]};
    const before=root.SY.getAcctData(),beforeIds=new Set((before.tasks||[]).map(t=>t.id));
    box.value=source;box.dispatchEvent(new Event('input',{bubbles:true}));extract.click();
    await new Promise(resolve=>setTimeout(resolve,70));
    const next=document.getElementById('tiBody'),schedule=next&&next.querySelector('[data-ti="schedule"]');
    if(schedule)schedule.click();
    await new Promise(resolve=>setTimeout(resolve,80));
    const a=root.SY.getAcctData();let added=0;
    (a.tasks||[]).forEach(t=>{if(!beforeIds.has(t.id)){added++;t.aiScheduled=true;t.scheduleSource='autoloop-intake';}});
    const plan=reflow(a,fromDate||nowDate());root.SY.saveAcctData(a);await checkpoint(a,'daily-plan');
    if(added)await append('schedule.replanned',{source:'quick-intake',added,moved:plan.moved,needsArrangement:plan.warnings.slice(0,20),bufferPercent:20});
    const restore=document.querySelector('#tiBody #tiText');if(restore){restore.value=String(originalText||'');restore.dispatchEvent(new Event('input',{bubbles:true}));}
    return {added,warnings:plan.warnings};
  }
  function attachCapture() {
    const body=document.getElementById('tiBody');if(!body)return;
    const actions=body.querySelector('.ti-actions');if(!actions)return;
    const existing=actions.querySelector('[data-aloop-import]');
    const status=body.querySelector('#tiStatus');
    if(existing){existing.disabled=!!(status&&/正在读取/.test(status.textContent||''));return;}
    const b=document.createElement('button');b.type='button';b.className='aloop-import-btn';b.dataset.aloopImport='1';b.textContent='自动识别并接管排期';
    actions.insertBefore(b,actions.firstChild);
    const text=body.querySelector('#tiText');
    if(text){
      const hint=document.createElement('p');hint.className='aloop-detect-hint';hint.dataset.aloopHint='1';
      const update=()=>{const rows=parseSchedule(text.value);hint.textContent=rows.length?'已识别 '+rows.length+' 个固定时段；其余任务会进入弹性排期。':'上传截图/文档/粘贴通知后，自动识别课程、会议和时间段。';};
      text.addEventListener('input',update);update();if(!body.querySelector('[data-aloop-hint]'))text.after(hint);
    }
    b.addEventListener('click',async()=>{
      const status=body.querySelector('#tiStatus');
      if(status&&/正在读取/.test(status.textContent||'')){toast('正在读取你上传的图片或文档，读取完成后再点一次即可；不用重新上传。');return;}
      const raw=(body.querySelector('#tiText')||{}).value||'';
      const rows=parseSchedule(raw);
      if(rows.length){
        const remainder=stripTimedLines(raw),result=await interrupt(raw,'快速收集/上传资料');
        if(!result.ok)return;
        const flexible=await runUntimedIntake(remainder,raw,rows[0].date);
        showBanner('已接管 '+result.added+' 个时间块'+(flexible.added?'，另识别 '+flexible.added+' 项任务':''), '固定课程/会议不会被挪动；普通学习任务在未来三天弹性安排，预留20%缓冲和任务间隔。'+(result.warnings.length+flexible.warnings.length?' 有 '+(result.warnings.length+flexible.warnings.length)+' 项放不进安全窗口，已保留在待安排区，不覆盖硬截止。':'无需你逐项检查，系统已保存新的排期。'));
        return;
      }
      const added=await runUntimedIntake(raw,raw,nowDate());
      if(added.added)showBanner('已识别并排好 '+added.added+' 项任务','原有固定安排保持不变；排期自动预留缓冲，DDL 三天内的任务优先安排。'+(added.warnings.length?' 另有 '+added.warnings.length+' 项留在待安排区。':''));
      else toast('没有识别到可收集的任务。上传清晰截图/文档或粘贴通知原文即可。');
    });
  }
  function observeCapture() {
    if(observer)observer.disconnect();
    observer=new MutationObserver(()=>attachCapture());
    const target=document.getElementById('tiOverlay')||document.body;
    observer.observe(target,{childList:true,subtree:true,characterData:true});
    attachCapture();
  }
  async function syncLocalLedger() {
    const acct=account(),ledgerKey='sy_autoloop_ledger_'+acct,checkpointKey='sy_autoloop_checkpoint_'+acct;
    try {
      const raw=localStorage.getItem(checkpointKey);
      if(raw){const saved=await api('/api/autoloop/checkpoint',{accountId:acct,taskId:'daily-plan',snapshot:JSON.parse(raw)});if(saved.ok)localStorage.removeItem(checkpointKey);}
    } catch(_) {}
    try {
      const events=JSON.parse(localStorage.getItem(ledgerKey)||'[]'),remaining=[];
      for(const event of events.slice(-50)){
        const sent=event.eventType==='interruption.created'&&event.snapshot
          ?await api('/api/autoloop/interrupt',{accountId:acct,taskId:event.taskId||'daily-plan',eventId:event.eventId,payload:event.payload||{},snapshot:event.snapshot})
          :await api('/api/autoloop/event',event);
        if(!sent.ok)remaining.push(event);
      }
      localStorage.setItem(ledgerKey,JSON.stringify(remaining));
    } catch(_) {}
  }
  async function restoreState() {
    const acct=account();if(owner!==acct){owner=acct;lastState=null;}
    let r=await api('/api/autoloop/state?accountId='+encodeURIComponent(acct));
    if(!r.ok||!r.data){
      try{const local=JSON.parse(localStorage.getItem('sy_autoloop_ledger_'+acct)||'[]');const pending=local.filter(e=>e.eventType==='interruption.created');if(pending.length){const p=pending[pending.length-1].payload||{};showBanner('有一项本地保存的中断现场', (p.title||p.summary||'临时安排')+' 已保存在本机，网络恢复后会自动同步。');}}catch(_){}
      return;
    }
    await syncLocalLedger();
    r=await api('/api/autoloop/state?accountId='+encodeURIComponent(acct));
    if(!r.ok||!r.data)return;
    lastState=r.data;
    const pending=r.data.pendingInterruptions||[];
    if(pending.length){const p=pending[pending.length-1].payload||{},a=root.SY.getAcctData();
      if(p.eventId&&a._autoloopLastInterruptionId!==p.eventId){a._autoloopLastInterruptionId=p.eventId;}
      if(!a._autoloopLastActiveTaskId&&r.data.checkpoint&&r.data.checkpoint.snapshot)a._autoloopLastActiveTaskId=r.data.checkpoint.snapshot.activeTaskId||r.data.checkpoint.snapshot.priorityFocusTaskId||'';
      root.SY.saveAcctData(a);
      showBanner('有一项已保存的中断现场', (p.title||p.summary||'临时安排')+' 已保存。无需重新回忆进度，点一下即可接着原任务。');}
  }
  function install() {
    if(!root.SY||typeof root.SY.getAcctData!=='function')return false;
    observeCapture();
    const originalOpen=root.SY.openQuickCapture;
    if(typeof originalOpen==='function'&&!originalOpen._autoloopWrapped){
      const wrapped=function(){const result=originalOpen.apply(this,arguments);setTimeout(attachCapture,60);return result;};
      wrapped._autoloopWrapped=true;root.SY.openQuickCapture=wrapped;
    }
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)restoreState();});
    restoreState();
    return true;
  }
  root.SYAutoloop={parseSchedule,importSchedule,interrupt,checkpoint,reflow,restore:restoreState};
  if(!install()){document.addEventListener('sy:ready',install);let n=0,t=setInterval(()=>{if(install()||++n>100)clearInterval(t);},100);}
})(typeof window!=='undefined'?window:null);
