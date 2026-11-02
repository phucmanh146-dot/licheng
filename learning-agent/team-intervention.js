'use strict';
const interventionPanel=document.createElement('section');
interventionPanel.className='card';
interventionPanel.id='intervention-panel';
interventionPanel.innerHTML='<h2>按现在的状态继续这一小步</h2><p>由你选择状态。先保存文件位置和下一动作；休息、返回或求助都不代表作品通过。</p><p id="intervention-message" role="status"></p><div id="intervention-entry"></div><div id="intervention-records"></div><h3>三人流程证据覆盖分</h3><p>每角色20分，记录是否齐全；不是成员能力、作品质量或赛事评分。</p><div id="intervention-score"></div>';
document.getElementById('project').append(interventionPanel);
let interventionTimer=null, interventionGeneration=0;
function interventionButton(label,fn){const id=project.project_id,version=project.version;const b=el('button',label);b.type='button';b.onclick=()=>safe(()=>{if(project.project_id!==id||project.version!==version)throw new Error('项目或版本已变化，请刷新后重试');return fn();});return b;}
async function interventionView(){
 const generation=++interventionGeneration, id=project.project_id;
 const [data,scores]=await Promise.all([request('/interventions?id='+encodeURIComponent(id)),request('/evidence-score?id='+encodeURIComponent(id))]);
 if(generation!==interventionGeneration||project.project_id!==id)return;
 if(data.project_version!==project.version||scores.project_version!==project.version){$('intervention-message').textContent='记录刚有变化，请刷新当前项目。';return;}
 clearTimeout(interventionTimer);
 interventionTimer=null;
 const entry=$('intervention-entry');entry.replaceChildren();
 $('intervention-message').textContent='终止检查：'+(data.terminal.blockers.join('；')||'流程记录齐全，内容质量仍待核对');
 const tasks=(project.plan?.tasks||[]).filter(t=>!['completed','pending_review'].includes(t.status));
 if(!tasks.length)entry.append(el('p','先导入真实材料、完成A诊断并采用B行动计划；没有动作时不生成假现场。'));
 for(const t of tasks){
  const box=el('details','');box.append(el('summary',t.title));
  const steps=el('select','');steps.setAttribute('aria-label','选择当前微动作');
  for(const s of t.micro_steps||[]){const o=el('option',s.action);o.value=s.step_id;steps.append(o);}
  const member=el('select','');member.setAttribute('aria-label','任务负责人');
  for(const m of t.owner_ids){const o=el('option',m);o.value=m;member.append(o);}
  const note=el('textarea','');note.placeholder='现在具体卡在哪里，或为什么想暂停？';note.maxLength=2500;note.setAttribute('aria-label','当前卡点');
  const estimate=el('input','');estimate.type='number';estimate.min='1';estimate.max='5';estimate.value='5';estimate.setAttribute('aria-label','首动作预计分钟，实际用时另记');
  box.append(el('p','选择已采用的微动作；若它超过5分钟，请先让B拆小。'),steps,member,note,estimate);
  for(const [state,label] of [['confused','看不懂'],['distracted','枯燥走神'],['tired','有点累'],['cannot_today','今天做不动'],['blocked','遇到困难']]){
   const button=interventionButton(label,()=>mutate('intervention-checkin',{expected_plan_version:project.plan.plan_version,task_id:t.task_id,action_id:steps.value,member_id:member.value,state,note:note.value,first_step_minutes:Number(estimate.value)}));
   button.disabled=!t.micro_steps?.length;box.append(button);
  }
  entry.append(box);
 }
 const records=$('intervention-records');records.replaceChildren();
 for(const r of data.interventions.slice().reverse()){
  const box=el('article','');box.className='task';
  box.append(el('h3',r.location+' · '+r.status),el('p','下一步：'+r.next_action),el('p','交付：'+r.output),el('p',r.support));
  if(r.stale){box.append(el('p','原版本已变化；请核对最新动作，旧记录仅供回查。'));records.append(box);continue;}
  const common={expected_plan_version:project.plan.plan_version,intervention_id:r.id};
  if(['resting','ended_today'].includes(r.status)){
   box.append(interventionButton('确认原位置，继续',()=>mutate('intervention-respond',{...common,choice:'continue',confirmed:true})));
   if(r.status==='resting'){
    const until=Date.parse(r.rest_until), delay=Math.max(0,until-Date.now());
    box.append(el('p',delay?'休息至 '+new Date(until).toLocaleTimeString():'休息时间到了，请选择继续、延长或结束。'));
    box.append(interventionButton('再休息5分钟',()=>mutate('intervention-respond',{...common,choice:'extend'})));
    if(delay>0&&!interventionTimer)interventionTimer=setTimeout(()=>{interventionTimer=null;safe(interventionView);},Math.min(delay,2147483647));
   }
   box.append(interventionButton('今天结束',()=>mutate('intervention-respond',{...common,choice:'end'})));
  }
  if(r.status==='active'){
   const note=el('textarea','');note.placeholder='实际做了什么、看到什么？';note.setAttribute('aria-label','实际尝试');
   const mins=el('input','');mins.type='number';mins.min='0';mins.max='1440';mins.value='0';mins.setAttribute('aria-label','实际分钟');
   box.append(note,mins,interventionButton('尚无产物，记录并换策略',()=>mutate('intervention-feedback',{...common,outcome:'no_output',note:note.value,actual_minutes:Number(mins.value)})));
   const artifacts=el('select','');artifacts.setAttribute('aria-label','本次执行产物');
   const eligible=project.stored_artifacts.filter(a=>['submission','capability'].includes(a.purpose)&&!r.known_artifacts.some(k=>k[0]===a.artifact_id&&k[1]===a.artifact_version));
   eligible.forEach((a,i)=>{const o=el('option',a.title+' v'+a.artifact_version);o.value=i;artifacts.append(o);});
   const location=el('select','');location.setAttribute('aria-label','产物原文位置');let units=[];
   const fill=async()=>{const a=eligible[Number(artifacts.value)];if(!a)return;const doc=await request('/artifact?id='+encodeURIComponent(id)+'&artifact_id='+encodeURIComponent(a.artifact_id)+'&artifact_version='+a.artifact_version);units=doc.units;location.replaceChildren(...units.map((u,i)=>{const o=el('option',u.locator+' '+u.text.slice(0,75));o.value=i;return o;}));};
   artifacts.onchange=()=>safe(fill);
   if(eligible.length)await fill();
   if(generation!==interventionGeneration||project.project_id!==id)return;
   const submit=interventionButton('登记小产物，转原成果复核',()=>{const a=eligible[Number(artifacts.value)],u=units[Number(location.value)];return mutate('intervention-feedback',{...common,outcome:'output',note:note.value,actual_minutes:Number(mins.value),evidence_refs:[{artifact_id:a.artifact_id,artifact_version:a.artifact_version,locator:u.locator,quote:u.text}]});});
   submit.disabled=!eligible.length;box.append(el('p','请先在材料入口上传本次小产物，选择“提交成果”或“能力试做”。'),artifacts,location,submit);
  }
  if(r.status==='needs_help'){
   box.append(el('p','已连续两轮无产物，停止重复建议；请拆小、求助或结束本轮。'));
   const helped=el('textarea','');helped.placeholder='新帮助或新策略具体是什么？';helped.setAttribute('aria-label','新帮助记录');
   box.append(helped,interventionButton('已获得新帮助，确认后重试',()=>mutate('intervention-respond',{...common,choice:'after_help',confirmed:true,note:helped.value})),
    interventionButton('今天结束',()=>mutate('intervention-respond',{...common,choice:'end'})));
  }
  const help=el('details','');help.append(el('summary','求助卡（未自动发送）'),el('pre',JSON.stringify(r.help_card,null,2)));box.append(help);
  if(r.status==='output_pending_review')box.append(el('p','有小产物，尚未通过作品验收。请继续使用原成果提交、A复核和人工确认流程。'));
  records.append(box);
 }
 if(generation!==interventionGeneration||project.project_id!==id)return;
 const scoreBox=$('intervention-score');scoreBox.replaceChildren();
 for(const role of scores.roles){const b=el('details','');b.append(el('summary',role.role+'：'+role.points+'/'+role.max));for(const c of role.criteria)b.append(el('p',c.label+' '+c.points+'/'+c.max+' · '+c.comment));scoreBox.append(b);}
}
