'use strict';
// This panel uses the existing project/version helpers; no second client store.
const recoveryLabels={paused:'现场已保存',waiting:'等待条件',ready:'可以返回',resumed:'已返回执行',superseded:'旧现场已保留'};
function recoveryTasks(){return (project?.plan?.tasks||[]).filter(t=>!['completed','pending_review'].includes(t.status));}
function recoverySelect(id,rows,label,value){
 const node=$(id),selected=node.value;node.replaceChildren();
 for(const row of rows){const o=el('option',label(row));o.value=value(row);node.append(o);}
 if([...node.options].some(o=>o.value===selected))node.value=selected;
}
function recoverySteps(){
 const t=recoveryTasks().find(t=>t.task_id===$('recovery-task').value);
 recoverySelect('recovery-action',t?(t.micro_steps||t.steps.map((action,i)=>({step_id:'step:'+(i+1),action}))):[],s=>s.action,s=>s.step_id);
 const s=(t?.micro_steps||[]).find(s=>s.step_id===$('recovery-action').value);
 $('recovery-location').placeholder=s?.target_locator||'例如：报告第2节，或刚才打开的材料位置';
 $('recovery-next').placeholder=s?.action||'回来后具体从哪一步继续';
}
function recoveryPayload(){return {task_id:$('recovery-task').value,action_id:$('recovery-action').value,expected_plan_version:project.plan.plan_version};}
function recoveryCardButton(card,label,fn,disabled=false){const b=el('button',label);b.type='button';b.disabled=disabled;b.onclick=()=>safe(fn);card.append(b);}
function recoveryView(){
 const records=project.recovery||{},s=project.recovery_summary||{};
 const members=[...new Map([...(project.member_task_briefs||[]),...(project.diagnosis?.member_profiles||[])].map(m=>[m.member_id,m])).values()];
 recoverySelect('recovery-member',members,m=>m.name||m.member_id,m=>m.member_id);
 recoverySelect('recovery-task',recoveryTasks(),t=>t.title,t=>t.task_id);
 recoverySelect('promise-task',[{task_id:'',title:'新请求：先记录，待诊断后生成任务'},...(project.plan?.tasks||[])],t=>t.title,t=>t.task_id);
 recoverySelect('recovery-return-task',[{task_id:'',title:'本人确认后返回'},...recoveryTasks()],t=>t.title,t=>t.task_id);
 recoverySteps();
 $('recovery-stats').textContent=`现场待处理 ${s.open||0} · 等条件 ${s.waiting||0} · 已返回 ${s.resumed||0} · 已记录尝试 ${s.attempts||0}`;
 $('recovery-form').querySelectorAll('button').forEach(b=>b.disabled=!project.plan||project.plan_stale);
 $('recovery-attempt-save').disabled=!project.plan||project.plan_stale;
 const promises=$('promise-records');promises.replaceChildren();
 for(const c of records.commitments||[]){
  const card=el('article','');card.className='task';
  fact(card,'答应的交付',c.deliverable);fact(card,'答应谁',c.promised_to);fact(card,'来源',c.source);
  fact(card,'当前关联',c.task_id?(project.plan?.tasks.find(t=>t.task_id===c.task_id)?.title||'原任务 '+c.task_id):'新请求，待诊断与具体任务确认');
  recoveryCardButton(card,'编辑或绑定已有任务',async()=>{
   $('promise-edit-id').value=c.commitment_id;$('promise-task').value=c.task_id||'';$('recovery-member').value=c.member_id;
   $('promise-edit-status').textContent='正在编辑已保存的承诺；保存后更新原记录';
   $('promise-deliverable').value=c.deliverable;$('promise-to').value=c.promised_to;$('promise-source').value=c.source;
   $('promise-importance').value=c.importance;$('promise-minutes').value=c.estimate_minutes;
   $('promise-deadline').value=c.deadline?new Date(new Date(c.deadline).getTime()-new Date(c.deadline).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
   $('promise-form').closest('details').open=true;$('promise-form').scrollIntoView({behavior:'smooth'});
  });
  if(!c.task_id)recoveryCardButton(card,'交给A重新核对，保留原计划',async()=>{
   await mutate('brief',{content:'新增待确认请求：'+JSON.stringify(c)});
  });
  promises.append(card);
 }
 const box=$('recovery-cards');box.replaceChildren();
 for(const c of [...(records.checkpoints||[])].reverse()){
  const card=el('article','');card.className='task';
  const stale=s.stale_ids?.includes(c.checkpoint_id);
  const t=project.plan?.tasks.find(t=>t.task_id===c.task_id);
  card.append(el('h3',`${t?.title||c.task_id} · ${recoveryLabels[c.status]}${stale?' · 需要按新版重新核对':''}`));
  fact(card,'暂停原因',c.note);fact(card,'已完成',c.done_note);fact(card,'现场位置',c.location);
  fact(card,'回来后第一步',c.next_action);fact(card,'返回条件',c.condition.description);
  if(c.check_after)fact(card,'下次检查',new Date(c.check_after).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}));
  if(c.ready_evidence)fact(card,'条件确认依据',c.ready_evidence);
  if(['paused','waiting','ready'].includes(c.status)){
   if(c.condition.kind==='external'&&c.status==='waiting')recoveryCardButton(card,'确认外部条件已满足',async()=>{
    const evidence=prompt('实际看到了什么，能确认条件已经满足？');if(!evidence?.trim())return;
    await mutate('recovery-condition',{checkpoint_id:c.checkpoint_id,expected_plan_version:project.plan.plan_version,evidence,confirmed:true});
   },!!stale);
   recoveryCardButton(card,'返回原任务',async()=>{
    await mutate('recovery-resume',{checkpoint_id:c.checkpoint_id,expected_plan_version:project.plan.plan_version,note:'本人核对现场与条件后返回'});
    document.querySelector(`[data-task-id="${CSS.escape(c.task_id)}"]`)?.scrollIntoView({behavior:'smooth',block:'start'});
   },!!stale||c.status==='waiting');
  }
  box.append(card);
 }
 const attempts=$('recovery-attempts');attempts.replaceChildren();
 for(const a of [...(records.attempts||[])].reverse().slice(0,12)){
  const card=el('article','');card.className='task';fact(card,'实际尝试',a.action);fact(card,'观察结果',a.observed);
  fact(card,'本人报告',({failed:'未解决',succeeded:'这次尝试成功，成果仍待验收',unknown:'仍不确定'})[a.reported_outcome]);
  fact(card,'用时',a.actual_minutes+' 分钟');attempts.append(card);
 }
 $('recovery-agenda-result').replaceChildren(el('p','选择本人和当前可用分钟，重新计算候选顺序。'));
}
$('recovery-task').onchange=()=>{recoverySteps();for(const id of ['recovery-note','recovery-done','recovery-location','recovery-next'])$(id).value='';};
$('recovery-action').onchange=recoverySteps;
$('recovery-form').onsubmit=e=>{e.preventDefault();safe(async()=>{
 const kind=$('recovery-condition-kind').value;
 const condition={kind,description:$('recovery-condition').value||'本人确认后返回'};
 if(kind==='task_accepted')condition.task_id=$('recovery-return-task').value;
 const local=$('recovery-check-after').value;
 await mutate('recovery-pause',{...recoveryPayload(),reason:$('recovery-reason').value,
  note:$('recovery-note').value,done_note:$('recovery-done').value,location:$('recovery-location').value,
  next_action:$('recovery-next').value,condition,check_after:local?new Date(local).toISOString():null});
});};
$('recovery-attempt-save').onclick=()=>safe(async()=>{
 await mutate('recovery-attempt',{...recoveryPayload(),action:$('attempt-action').value,observed:$('attempt-observed').value,
  reported_outcome:$('attempt-outcome').value,actual_minutes:Number($('attempt-minutes').value)});
 $('attempt-action').value='';$('attempt-observed').value='';
});
$('recovery-checkin-save').onclick=()=>safe(()=>mutate('recovery-checkin',{member_id:$('recovery-member').value,state:$('recovery-state').value,note:$('recovery-state-note').value}));
$('promise-form').onsubmit=e=>{e.preventDefault();safe(async()=>{
 const d=$('promise-deadline').value;
 await mutate('recovery-commitment',{commitment_id:$('promise-edit-id').value||null,member_id:$('recovery-member').value,task_id:$('promise-task').value||null,
  deliverable:$('promise-deliverable').value,promised_to:$('promise-to').value,source:$('promise-source').value,
  importance:Number($('promise-importance').value),estimate_minutes:Number($('promise-minutes').value),deadline:d?new Date(d).toISOString():null});
 $('promise-edit-id').value='';
 $('promise-edit-status').textContent='';$('promise-form').reset();
});};
$('promise-new').onclick=()=>{$('promise-edit-id').value='';$('promise-edit-status').textContent='';$('promise-form').reset();};
$('recovery-agenda-run').onclick=()=>safe(async()=>{
 const id=project.project_id,version=project.version;
 const q=new URLSearchParams({id,member_id:$('recovery-member').value,minutes:$('recovery-minutes').value});
 const result=await request('/recovery-agenda?'+q);
 if(project.project_id!==id||project.version!==version)return;
 const box=$('recovery-agenda-result');box.replaceChildren();
 if(result.next){fact(box,'建议先推进',result.next.title);fact(box,'原因',result.next.rank_reason);fact(box,'下一动作',result.next.next_action);fact(box,'建议先投入',result.next.suggested_first_minutes+' 分钟');fact(box,'帮助方式',result.next.help_mode);}
 else box.append(el('p','当前没有可直接推进的候选，先核对下方阻塞或未绑定请求。'));
 fact(box,'本次可用时间的初筛缺口',result.capacity_shortfall_minutes+' 分钟；精确时段请用下方B周期排程');
 for(const r of result.waiting)box.append(el('p',`${r.title}：${r.reasons.join('；')}${r.check_due?'；到约定检查时间了，请核对条件':''}`));
 for(const c of result.unbound_commitments)box.append(el('p',`新请求待诊断：${c.deliverable}；答应${c.promised_to}；来源${c.source}`));
 box.append(el('p',result.scope));
});
$('recovery-export').onclick=()=>safe(async()=>{
 const id=project.project_id,value=await request('/recovery-export?id='+encodeURIComponent(id));
 const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
 const a=el('a','');a.href=url;a.download='shanganya-recovery-'+id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
