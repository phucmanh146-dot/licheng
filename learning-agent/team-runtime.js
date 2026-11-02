'use strict';
function runtimeSteps(){
 const task=project.plan?.tasks.find(t=>t.task_id===$('runtime-task').value);
 const steps=task?.micro_steps||task?.steps.map((s,i)=>({step_id:'step:'+(i+1),action:s}))||[];
 $('runtime-action').replaceChildren(...steps.map(s=>{const o=el('option',s.action);o.value=s.step_id;return o;}));
}
async function runtimeView(){
 const id=project.project_id;
 const data=await request('/runtime?id='+encodeURIComponent(id));
 if(project.project_id!==id)return;
 if(data.project_version!==project.version){$('runtime-current').textContent='项目刚有变化，请刷新后核对当前步骤。';return;}
 const stages={MATERIAL_READY:'先补齐本轮材料',DIAGNOSING:'核对目标和资料依据',REPLAN:'处理剩余问题',PLAN_PREVIEW:'等待你确认计划',EXECUTING:'推进当前任务',WAITING_REVIEW:'等待新版复核',COMPLETE:'当前计划已验收'};
 $('runtime-state').textContent=(stages[data.state]||data.state)+' · 已验收 '+(data.counts.completed||0)+' · 待复核 '+(data.counts.pending_review||0);
 const box=$('runtime-current');box.replaceChildren();
 if(data.focus_stale)box.append(el('p',data.reason));
 if(data.current){
  const c=data.current;box.append(el('h3',c.title),el('p','任务状态：'+(labels[c.status]||c.status)),el('p','原位置：'+(c.locator||'见动作卡')),el('p','保存的动作：'+c.action));
  if(c.submission)box.append(el('p','已提交成果：'+c.submission.artifact_id+' v'+c.submission.artifact_version+'；按成果复核流程继续。'));
  const cp=c.context.checkpoint;
  if(cp)box.append(el('p','当时卡点：'+cp.note),el('p','回来先做：'+cp.next_action),el('p','返回条件：'+cp.condition.description));
  for(const a of c.context.previous_attempts.slice(-2))box.append(el('p','已试过：'+a.action+'；实际看到：'+a.observed));
 }else if(!data.focus_stale)box.append(el('p','选择并保存当前步骤，或在受阻时保存任务现场。'));
 const tasks=(project.plan?.tasks||[]).filter(t=>!['completed','pending_review'].includes(t.status)), previous=$('runtime-task').value;
 $('runtime-task').replaceChildren(...tasks.map(t=>{const o=el('option',t.title);o.value=t.task_id;return o;}));
 const selected=data.current?.task_id||previous;
 if(tasks.some(t=>t.task_id===selected))$('runtime-task').value=selected;
 runtimeSteps();if(data.current)$('runtime-action').value=data.current.action_id;
 $('runtime-focus-form').hidden=!tasks.length;
}
$('runtime-task').onchange=runtimeSteps;
$('runtime-focus-form').onsubmit=e=>{e.preventDefault();safe(()=>mutate('runtime-focus',{
 expected_plan_version:project.plan.plan_version,task_id:$('runtime-task').value,action_id:$('runtime-action').value
}));};
