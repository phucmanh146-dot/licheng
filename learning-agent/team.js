'use strict';
const $=id=>document.getElementById(id);
const recoverySessionId=(()=>{try{let v=sessionStorage.getItem('sy-team-session-id');if(!v){v=(crypto.randomUUID?crypto.randomUUID():('session-'+Date.now()+'-'+Math.random().toString(36).slice(2)));sessionStorage.setItem('sy-team-session-id',v);}return v;}catch{return 'session-'+Date.now();}})();
let project=null, action=null, periodProject=null;
const labels={candidate:'待选择',scheduled:'已排期',in_progress:'进行中',pending_review:'待验收',completed:'已验收',blocked:'卡住'};
function el(tag,text){const node=document.createElement(tag);node.textContent=text;return node;}
function showJSON(id,value){const d=el('details','');d.append(el('summary','查看完整交接数据'),el('pre',JSON.stringify(value,null,2)));$(id).append(d);}
function fact(box,label,value){const p=el('p','');p.append(el('strong',label+'：'),document.createTextNode(value||'待补充'));box.append(p);}
function artifactLabel(ref){if(!ref)return '未绑定材料版本';const row=project.diagnosis?.artifact_versions?.find(x=>x.artifact_id===ref.artifact_id&&x.artifact_version===ref.artifact_version);return `${row?.title||ref.artifact_id} · v${ref.artifact_version}`;}
function sourceView(box,refs){
 const list=el('ul','');list.className='evidence-sources';
 const kinds={official:'官方要求',user_material:'用户材料',reference:'参考案例',suggestion:'建议'};
 for(const id of refs){const s=project.diagnosis.sources.find(x=>x.source_id===id);const row=el('li',s?`${kinds[s.kind]} · ${s.title}`:'待核对来源 '+id);if(s?.url&&/^https?:\/\//i.test(s.url)){const a=el('a',' 打开原文 ↗');a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';row.append(a);}list.append(row);}
 if(!refs.length)list.append(el('li','尚未提供来源，结论待核验'));
 box.append(list);
}
function gapView(box,g){
 fact(box,'现状',g.current_evidence);fact(box,'当前材料',artifactLabel(g.current_artifact));
 fact(box,'现状位置',g.current_locator);fact(box,'目标',g.target_result);fact(box,'目标位置',g.target_locator);
 fact(box,'差距原因',g.reason);fact(box,'为什么适用',g.applicability);fact(box,'怎样验证',g.verification_method);
 fact(box,'需要的能力',g.required_capabilities.join('、')||'待确认');fact(box,'优先原因',g.priority_reason);
 fact(box,'核验状态',g.verification_status);sourceView(box,g.source_refs);
}
function guidanceView(box,t){
 if(typeof resourceView==='function')resourceView(box,t.resource_options||[]);
 if(!t.micro_steps?.length){const warning=el('p','待 B 补充精细指导：材料版本、操作位置、具体动作、原因、输出、自检与卡点处理。');warning.className='warning-box';box.append(warning);const steps=el('ol','');for(const step of t.steps)steps.append(el('li',step));box.append(steps);return;}
 box.append(el('p','以下为 B 提交的精细指导；格式校验不代表内容正确，请核对来源与实际成果。'));
 const steps=el('ol','');steps.className='micro-actions';
 for(const s of t.micro_steps){const row=el('li','');row.append(el('h4',s.action));fact(row,'输入版本',artifactLabel(s.input_version));fact(row,'操作位置',s.target_locator);fact(row,'这样做的原因',s.reason);fact(row,'预期改变',s.expected_change);fact(row,'这一步交付',s.output);fact(row,'自检方法',s.self_check);fact(row,'卡住时下一步',s.failure_next);fact(row,'能力依据',s.capability_basis);sourceView(row,s.source_refs||t.source_refs);steps.append(row);}
 box.append(steps);
}
function diagnosisView(){
 const box=$('diagnosis');box.replaceChildren();const d=project.diagnosis;if(!d){box.append(el('p','等待 A 的诊断'));return;}
 box.append(el('p','诊断版本 '+d.diagnosis_version),el('p',project.artifact_storage_required?'材料已保存并读取；引文与实际原文位置核对。语义判断仍需实际试做及人工确认。':'材料位置与版本由 A 提供；总控校验引用关系，尚未自动读取文件核实。'));
 for(const g of d.gaps){const card=el('article','');card.className='gap-card';card.append(el('h3',g.gap_id+' · '+g.target_result));gapView(card,g);box.append(card);}
 for(const note of d.understanding_checks||[])fact(box,'本人理解核对候选（待成员确认）',typeof note==='string'?note:JSON.stringify(note));
 for(const u of d.unknowns)box.append(el('p','待确认：'+(typeof u==='string'?u:JSON.stringify(u))));showJSON('diagnosis',d);
 if(typeof traceView==='function')traceView(box,d.model_trace);
}
function proposalView(){
 const box=$('proposal');box.replaceChildren();const p=project.proposal;if(!p){box.append(el('p',project.plan?'已采用计划 v'+project.plan.plan_version+'，任务见下方。':'等待 B 的计划'));return;}
 box.append(el('p',p.reason),el('p',`新增 ${p.diff.added.length} 项 · 修改 ${p.diff.changed.length} 项 · 移除 ${p.diff.removed.length} 项`));
 const fine=p.plan.tasks.filter(t=>t.micro_steps?.length).length;box.append(el('p',`精细指导已提供 ${fine}/${p.plan.tasks.length} 项；这不是获奖评分或完成比例。`));
 for(const t of p.plan.tasks){const card=el('article','');card.className='task';card.append(el('h3',t.title),el('p','交付：'+t.deliverable),el('p','验收：'+t.acceptance_criteria.join('；')),el('p','预计 '+t.estimate_minutes_range.join('–')+' 分钟 / 截止：'+t.deadline));guidanceView(card,t);box.append(card);}
 for(const note of p.plan.unscheduled)box.append(el('p','未排入日程：'+(typeof note==='string'?note:JSON.stringify(note))));showJSON('proposal',p);
 for(const note of p.plan.assumptions)box.append(el('p',note));
}

async function request(path,data){const response=await fetch('/api/agent/team'+path,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});const value=await response.json();if(!response.ok)throw new Error(value.error||'服务不可用');return value;}
function context(){return {project_id:project.project_id,expected_version:project.version};}
async function load(id){project=await request('?id='+encodeURIComponent(id));localStorage.setItem('team-project',id);render();}
async function refresh(){const state=await request('');$('projects').replaceChildren(...state.projects.map(p=>{const option=el('option',p.goal);option.value=p.project_id;return option;}));const id=project?.project_id||new URLSearchParams(location.search).get('project_id')||localStorage.getItem('team-project');const found=state.projects.find(p=>p.project_id===id)||state.projects[0];if(found){$('projects').value=found.project_id;await load(found.project_id);} $('message').textContent='已读取后端最新状态';}
async function mutate(path,data){const selected=project.project_id;const p=await request('/'+path,{...context(),...data});if(project.project_id!==selected){$('message').textContent='已保存到原项目；当前项目选择保留';return;}if(path==='undo-plan')periodProject=null;await load(p.project_id);$('message').textContent='已保存 · 版本 '+project.version;}
async function safe(fn){try{await fn();}catch(e){$('message').textContent=e.message;}}
function render(){
 window.dispatchEvent(new CustomEvent('research-project-changed',{detail:{id:project.project_id}}));
 $('project').hidden=false;$('heading').textContent=project.goal;
 $('meta').textContent=`${project.mode==='demo'?'Demo · 示例数据':'真实项目 · 竞赛与科研'} / 版本 ${project.version} / 连接与格式通过须继续核对内容和真实效果`;
 $('demo').hidden=project.mode!=='demo'||!!project.diagnosis;
 $('stale').textContent=project.plan_stale?'诊断已更新，现有计划已过期。请 B 更新后再执行。':'';
 diagnosisView();proposalView();periodView();dispatchView();
 $('apply').disabled=!project.proposal;
 $('tasks').replaceChildren();
 for(const t of project.plan?.tasks||[]){
  const box=el('article','');box.className='task';box.dataset.taskId=t.task_id;box.append(el('h3',t.title+' · '+labels[t.status]),el('p','负责人：'+t.owner_ids.join('、')+' / 差距：'+t.gap_ids.join('、')),el('p','产物：'+t.deliverable),el('p','验收：'+t.acceptance_criteria.join('；')),el('p','预计：'+t.estimate_minutes_range.join('–')+' 分钟 / 截止：'+t.deadline));
  guidanceView(box,t);
  if(t.external_dependencies?.length)fact(box,'等待确认 / 外部前置',t.external_dependencies.join('；'));
  const basis=el('details','');basis.append(el('summary','查看这项任务的差距依据'));for(const id of t.gap_ids){const g=project.diagnosis.gaps.find(x=>x.gap_id===id);if(g){basis.append(el('h4',g.gap_id));gapView(basis,g);}}box.append(basis);
  if(t.submission){fact(box,'已提交成果',t.submission.artifact_id+' · v'+t.submission.artifact_version);fact(box,'成果证据',t.submission.evidence);fact(box,'实际投入',t.submission.actual_minutes+' 分钟');}
  if(t.review){fact(box,'人工验收意见',t.review.note);for(const r of t.review.criterion_results||[])fact(box,'已核对 '+r.criterion,r.evidence);}
  if(t.external_review){const packet=t.external_review.packet;fact(box,'A 的成果复核',packet.note);for(const r of packet.criterion_results)fact(box,(r.passed?'通过：':'未通过：')+r.criterion,r.evidence);for(const g of packet.gap_results)fact(box,'差距复核 '+g.gap_id+' · '+g.status,g.evidence+(g.remaining_issue?'；仍需：'+g.remaining_issue:''));if(typeof traceView==='function')traceView(box,packet.model_trace);}
  const details=el('details','');details.append(el('summary','查看完整任务、来源与证据'),el('pre',JSON.stringify(t,null,2)));box.append(details);
  const needsAReview=project.artifact_storage_required&&!['trial','learn','practice','retest'].includes(t.kind);
  const received=t.external_review, packet=received?.packet;
  const currentAReview=packet&&packet.plan_version===project.plan.plan_version&&packet.diagnosis_version===project.diagnosis.diagnosis_version&&packet.task_id===t.task_id&&packet.artifact_id===t.submission?.artifact_id&&packet.artifact_version===t.submission?.artifact_version&&(project.artifact_reviews||[]).some(r=>r.review_id===received.review_id&&r.source==='A_handoff');
  const canConfirmA=currentAReview&&packet.criterion_results.every(r=>r.passed===true);
  if(t.status==='pending_review'&&needsAReview&&!canConfirmA)fact(box,'验收前一步',currentAReview?'A 复核仍有条件未通过，请先查看证据并退回修改。':'先调用 A 或接收其对当前计划、新版成果的实际复核，再人工确认。');
  const choices=t.status==='pending_review'?[['approve','验收通过'],['reject','退回修改']]:t.status==='completed'?[]:t.status==='in_progress'?[['submit','提交成果'],['block','遇到卡点']]:[['start','开始任务'],['block','遇到卡点']];
  choices.push(['change','临时安排反馈']);if(!t.locked)choices.push(['lock','锁定任务']);
  for(const [kind,label]of choices){const button=el('button',label);button.disabled=project.plan_stale||(kind==='approve'&&needsAReview&&!canConfirmA);button.onclick=()=>openFeedback(t,kind,label);box.append(button);}
  if(t.status==='completed'&&t.external_review&&t.external_review.packet.diagnosis_version===project.diagnosis.diagnosis_version&&t.external_review.packet.plan_version===project.plan.plan_version&&!project.applied_review_ids?.includes(t.external_review.review_id)){const button=el('button','确认复核后更新剩余计划');button.onclick=()=>safe(()=>mutate('advance-review',{review_id:t.external_review.review_id}));box.append(button);}
  $('tasks').append(box);
 }
 if(!project.plan)$('tasks').append(el('p','采用计划后显示任务。'));
 $('feedback').replaceChildren(...project.feedback.map(f=>el('p',`${f.task_id} · ${f.action} · ${f.note}${f.evidence?' / 证据：'+f.evidence:''}`)));
 $('history').replaceChildren(...(project.history||[]).map(h=>el('p',`v${h.version} · ${h.action} · ${h.created}`)));
 if(typeof handoffView==='function')handoffView();
 if(typeof inputView==='function')inputView();
 if(typeof recoveryView==='function')recoveryView();
 if(typeof runtimeView==='function')runtimeView().catch(e=>{$('runtime-current').textContent=e.message;});
 if(typeof interventionView==='function')interventionView().catch(e=>{$('intervention-message').textContent=e.message;});
}
function openFeedback(task,kind,label){
 action={task_id:task.task_id,action:kind,expected_plan_version:project.plan.plan_version,expected_version:project.version};$('feedback-form').reset();$('feedback-title').textContent=label+' · '+task.title;$('submit-fields').hidden=kind!=='submit';$('review-fields').hidden=!['approve','reject'].includes(kind);
 $('executor-ids').value=task.owner_ids.join(',');
 const executors=task.submission?.executor_ids||task.owner_ids;
 const eligible=project.diagnosis.member_profiles.filter(m=>!project.artifact_storage_required||['trial','learn','practice','retest'].includes(task.kind)||!executors.includes(m.member_id));
 $('reviewer').replaceChildren(...eligible.map(m=>{const option=el('option',m.name||m.member_id);option.value=m.member_id;return option;}));
 const box=$('review-criteria');box.replaceChildren();box.hidden=kind!=='approve';
 if(kind==='approve'){box.append(el('p','对照已提交成果逐条核对，填写实际看到的证据。此处记录人工验收，不是模型自动复核。'));for(const [i,criterion] of task.acceptance_criteria.entries()){const row=el('div','');row.className='criterion-row';row.dataset.criterion=criterion;const label=el('label','');const check=document.createElement('input');check.type='checkbox';check.className='criterion-pass';check.setAttribute('aria-label','通过：'+criterion);label.append(check,document.createTextNode(criterion));const evidence=document.createElement('textarea');evidence.className='criterion-evidence';evidence.rows=2;evidence.id='criterion-evidence-'+i;const evidenceLabel=el('label','核对证据');evidenceLabel.htmlFor=evidence.id;row.append(label,evidenceLabel,evidence);box.append(row);}}
 $('dialog-error').textContent='';$('feedback-dialog').showModal();
}
$('create').onsubmit=e=>{e.preventDefault();safe(async()=>{project=await request('/create',{goal:$('goal').value,mode:$('mode').value});await refresh();});};
$('projects').onchange=()=>safe(()=>load($('projects').value));$('refresh').onclick=()=>safe(refresh);
$('recover-intent-btn').onclick=()=>safe(async()=>{
 const intent=$('recover-intent').value.trim();if(intent.length<3)throw new Error('请描述至少3个字的旧任务意图');
 const box=$('recover-results');box.replaceChildren(el('p','正在查找已有项目，不会新建项目或自动执行任务…'));
 const result=await request('/recover',{intent,sessionId:recoverySessionId});box.replaceChildren(el('p',result.note||'识别完成'));
 async function confirmCandidate(candidate){
  const linked=await request('/recover-confirm',{project_id:candidate.project_id,expected_version:candidate.version,
   session_id:recoverySessionId,confirmed:true,intent});
  await load(linked.project.project_id);$('message').textContent='已确认并载入旧项目；请核对保存的位置和下一步。任务尚未自动开始。';
 }
 if(result.project){
  box.append(el('p','候选项目：'+result.project.goal+' · 阶段：'+(result.project.dispatch_status?.stage||'待核对')+' · '+result.match_method));
  const open=el('button','确认这个项目并打开');open.type='button';open.onclick=()=>safe(()=>confirmCandidate(result.project));box.append(open);
 }else{
  for(const candidate of (result.matches||[])){
   const row=el('div','');row.append(el('p',candidate.goal+' · '+candidate.stage+' · v'+candidate.version));
   const choose=el('button','选择并关联到本会话');choose.type='button';choose.onclick=()=>safe(async()=>{
    await confirmCandidate(candidate);
   });row.append(choose);box.append(row);
  }
 }
});
$('demo').onclick=()=>safe(()=>mutate('demo',{}));$('apply').onclick=()=>safe(()=>mutate('apply',{proposal_id:project.proposal.id}));
$('diagnosis-form').onsubmit=e=>{e.preventDefault();safe(()=>mutate('diagnosis',{diagnosis:JSON.parse($('diagnosis-json').value)}));};
$('plan-form').onsubmit=e=>{e.preventDefault();safe(()=>mutate('propose',{plan:JSON.parse($('plan-json').value),reason:$('reason').value}));};
function dispatchView(){
 const d=project.dispatch_status, box=$('dispatch-status');box.replaceChildren();if(!d)return;
 box.append(el('h3',d.active?'正在调用 '+d.last_run.stage:d.label),el('p',`A：${d.providers.A?'已接入':'待接入'} / B：${d.providers.B?'已接入':'待接入'}${project.mode==='demo'?'（示例适配器）':''}`));
 box.append(el('p',`进行中 ${d.counts.in_progress} · 卡住 ${d.counts.blocked} · 待验收 ${d.counts.pending_review} · 已验收 ${d.counts.completed}`));
 if(d.last_run.status==='failed')box.append(el('p',d.last_run.message+'（'+d.last_run.error_code+'）'));
 if(d.interrupted)box.append(el('p','上次运行因服务重启中断；可从已保存的阶段继续。'));
 for(const q of d.questions)box.append(el('p','待确认：'+(typeof q==='string'?q:JSON.stringify(q))));
 $('dispatch-run').disabled=!d.can_dispatch;$('dispatch-run').textContent=d.active?'正在运行，请稍后刷新':`继续总调度${['A','B'].includes(d.stage)?'：交给 '+d.stage:''}`;
 $('brief-history').replaceChildren(...(project.brief_history||[]).map(x=>el('p','已补充：'+x.content)));
}
$('dispatch-run').onclick=()=>safe(async()=>{const id=project.project_id;$('dispatch-run').disabled=true;$('message').textContent='正在运行总调度，计划生成后需要你确认';try{await request('/dispatch',context());}finally{await load(id);}if(project.dispatch?.status==='succeeded')$('message').textContent='计划已生成，请核对后采用';else $('message').textContent=project.dispatch?.message||'请查看总调度状态';});
$('brief-form').onsubmit=e=>{e.preventDefault();safe(async()=>{await mutate('brief',{content:$('brief-content').value});$('brief-content').value='';});};
$('cancel').onclick=()=>$('feedback-dialog').close();
$('feedback-form').onsubmit=async e=>{e.preventDefault();try{const review=action.action==='approve'?{criterion_results:[...$('review-criteria').querySelectorAll('.criterion-row')].map(row=>({criterion:row.dataset.criterion,passed:row.querySelector('.criterion-pass').checked,evidence:row.querySelector('.criterion-evidence').value}))}:{};await mutate('feedback',{...action,...review,...(action.action==='submit'?{executor_ids:$('executor-ids').value.split(/[,，]/).map(x=>x.trim()).filter(Boolean)}:{}),note:$('note').value,artifact_id:$('artifact-id').value,artifact_version:Number($('artifact-version').value),actual_minutes:Number($('minutes').value),evidence:$('evidence').value,reviewer_id:$('reviewer').value});$('feedback-dialog').close();}catch(error){$('dialog-error').textContent=error.message;}};

function localDay(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function periodTasks(){const member=$('period-member').value;const saved=(project.proposal?.plan||project.plan)?.replanning_context||{};$('period-tasks').replaceChildren();for(const t of project.plan?.tasks||[]){if(!t.owner_ids.includes(member)||t.owner_ids.length!==1||['completed','pending_review'].includes(t.status))continue;const row=el('div','');const check=document.createElement('input');check.type='checkbox';check.value=t.task_id;check.className='period-choice';check.checked=(saved.selected_task_ids||[]).includes(t.task_id);const label=el('label','');label.append(check,document.createTextNode(' '+t.title+' · '+labels[t.status]));const remaining=document.createElement('input');remaining.type='number';remaining.min='1';remaining.max='100000';remaining.placeholder='剩余分钟';remaining.setAttribute('aria-label',t.title+'剩余分钟');remaining.dataset.remaining=t.task_id;remaining.value=saved.remaining_minutes?.[t.task_id]??(t.status==='in_progress'?'':t.estimate_minutes_range[1]);row.append(label,remaining);$('period-tasks').append(row);}}
function windowLines(rows){return (rows||[]).map(x=>`${x.date} ${x.start} ${x.end}`).join('\n');}
function periodView(){const enabled=!!project.plan&&!project.plan_stale;$('period-preview').disabled=!enabled;$('period-panel').hidden=!project.plan;
 if(periodProject!==project.project_id){periodProject=project.project_id;const c=project.plan?.replanning_context||{};$('period-member').replaceChildren(...(project.diagnosis?.member_profiles||[]).map(m=>{const o=el('option',m.name||m.member_id);o.value=m.member_id;return o;}));if(c.member_id)$('period-member').value=c.member_id;$('period-start').value=c.period_start||localDay();$('period-end').value=c.period_end||'';$('period-windows').value=windowLines(c.windows);$('period-busy').value=windowLines(c.busy);$('full-dates').value=(c.full_dates||[]).join(',');$('daily-limit').value=c.daily_limit??60;$('period-buffer').value=c.buffer_minutes??10;$('period-chunk').value=c.chunk_minutes??25;$('allow-split').checked=c.allow_split===true;}
 // Members may arrive after the project is first created.
 if(!$('period-member').options.length&&project.diagnosis?.member_profiles.length){periodProject=null;return periodView();}
 periodTasks();$('undo-period').disabled=!project.undo_plan||project.undo_at_version!==project.version;
 const proposal=project.proposal, plan=proposal?.plan||project.plan, summary=plan?.schedule_summary;
 $('apply-period').disabled=!proposal||!proposal.plan.schedule_summary;
 const box=$('period-result');box.replaceChildren();if(!summary)return;
 box.append(el('h3',proposal?'时间调整预览（尚未采用）':'已采用的周期安排'),el('p',`本轮待安排 ${summary.needed_minutes} 分钟 / 可用 ${summary.available_minutes} 分钟 / 未排入 ${summary.unallocated_minutes} 分钟`),el('p',summary.fits?'按当前估时与空档，所选任务能排入周期；实际完成仍需验收。':'当前条件下不能全部排入，请处理下面的时间缺口或阻塞。'));
 for(const d of summary.daily)box.append(el('p',`${d.date}：可新安排 ${d.available_minutes} 分钟，保留 ${d.preserved_minutes} 分钟${d.full?' · 已排满':''}`));
 for(const x of summary.unallocated)box.append(el('p',`${x.task_id} 尚有 ${x.minutes} 分钟：${x.reason}`));
 for(const x of summary.options)box.append(el('p','可选处理：'+x));
 for(const x of summary.assumptions)box.append(el('p',x));
 const spans=(title,blocks)=>{box.append(el('h3',title));for(const b of blocks.filter(b=>b.member_id===summary.member_id))box.append(el('p',`${b.task_id} · ${b.start} → ${b.end}${b.locked?' · 锁定':''}`));};
 if(proposal){box.append(el('p','调整原因：'+proposal.reason));spans('原安排',proposal.diff.time_blocks_before);spans('新安排',proposal.diff.time_blocks_after);}else spans('当前日程',plan.time_blocks);
}
function parseWindows(id){return $(id).value.split(/\n/).map(x=>x.trim()).filter(Boolean).map(line=>{const bits=line.split(/\s+/);if(bits.length!==3)throw new Error('每行填写：日期 开始时刻 结束时刻');return {date:bits[0],start:bits[1],end:bits[2]};});}
$('period-member').onchange=periodTasks;
$('today-full').onclick=()=>{const dates=new Set($('full-dates').value.split(/[,，\s]+/).filter(Boolean));dates.add(localDay());$('full-dates').value=[...dates].join(',');};
$('period-form').onsubmit=async e=>{e.preventDefault();$('period-error').textContent='';try{const selected=[...document.querySelectorAll('.period-choice:checked')].map(x=>x.value);const remaining={};for(const input of document.querySelectorAll('[data-remaining]'))if(selected.includes(input.dataset.remaining)&&input.value)remaining[input.dataset.remaining]=Number(input.value);
 await mutate('period-replan',{expected_plan_version:project.plan.plan_version,reason:$('period-reason').value,constraints:{member_id:$('period-member').value,period_start:$('period-start').value,period_end:$('period-end').value,windows:parseWindows('period-windows'),busy:parseWindows('period-busy'),full_dates:$('full-dates').value.split(/[,，\s]+/).filter(Boolean),daily_limit:Number($('daily-limit').value),buffer_minutes:Number($('period-buffer').value),chunk_minutes:Number($('period-chunk').value),allow_split:$('allow-split').checked,selected_task_ids:selected,remaining_minutes:remaining}});
 }catch(error){$('period-error').textContent=error.message;}};
$('apply-period').onclick=()=>safe(()=>mutate('apply',{proposal_id:project.proposal.id}));$('undo-period').onclick=()=>safe(()=>mutate('undo-plan',{}));
safe(refresh);
