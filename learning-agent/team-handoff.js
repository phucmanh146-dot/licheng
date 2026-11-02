'use strict';

function handoffOptions(id, rows, label) {
 const select=$(id), before=select.value;
 select.replaceChildren(...rows.map(row=>{const option=el('option',label(row));option.value=row.id;return option;}));
 if(rows.some(row=>row.id===before))select.value=before;
}
function rescueChoices(){
 const task=project?.plan?.tasks.find(t=>t.task_id===$('rescue-task').value);
 handoffOptions('rescue-gap',(task?.gap_ids||[]).map(id=>({id})),x=>x.id);
 const steps=task?.micro_steps||task?.steps.map((text,i)=>({step_id:'step:'+(i+1),action:text}))||[];
 handoffOptions('rescue-action',steps.map(s=>({...s,id:s.step_id})),s=>s.action);
}
function handoffView(){
 $('b-run').disabled=!project.diagnosis||project.diagnosis_needs_refresh;
 const pending=(project.plan?.tasks||[]).filter(t=>t.status==='pending_review');
 $('review-export').disabled=false;
 const calls=$('a-review-call');calls.replaceChildren();
 for(const t of pending){const button=el('button','调用 A 复核：'+t.title);button.disabled=!project.dispatch_status.review_provider;button.onclick=()=>safe(()=>mutate('review-run',{task_id:t.task_id}));calls.append(button);}
 if(pending.length&&!project.dispatch_status.review_provider)calls.append(el('p','A 自动复核模块待接入；可导出交付包给 A，接收其实际复核结果。'));
 $('received-reviews').replaceChildren(...(project.artifact_reviews||[]).map(r=>el('p',`${r.packet.task_id} · ${r.packet.artifact_id} v${r.packet.artifact_version} · ${r.packet.note}（内容仍需核对）`)));
 const available=(project.plan?.tasks||[]).filter(t=>!['completed','pending_review'].includes(t.status));
 handoffOptions('rescue-task',available.map(t=>({...t,id:t.task_id})),t=>t.title);
 rescueChoices();$('rescue-start').disabled=!available.length||project.plan_stale;
 const results=$('linked-rescue-results');results.replaceChildren();
 for(const r of project.rescue_requests||[]){
  const card=el('article','');card.className='task';
  fact(card,'对应任务和动作',`${r.task_id} / ${r.gap_id} / ${r.action_id}`);
  fact(card,'解答对应版本',`诊断 v${r.diagnosis_version} / 计划 v${r.plan_version}`);
  fact(card,'卡点',r.note);fact(card,'求助状态',r.status);
  if(r.stale)card.append(el('p','这是旧诊断或旧计划上的解答，仅供核对，不自动改动当前任务。'));
  if(r.error)fact(card,'未完成原因',r.error);
  if(r.result){const detail=el('details','');detail.append(el('summary','查看解答与证据'),el('pre',JSON.stringify(r.result,null,2)));card.append(detail);}
  if(['queued','running'].includes(r.status)){const button=el('button','读取最新解答');button.onclick=()=>safe(()=>mutate('rescue-sync',{incident_id:r.incident_id}));card.append(button);}
  results.append(card);
 }
}
async function readHandoffFile(input, target){
 const file=input.files[0];if(!file)return;
 if(file.size>1000000)throw new Error('交付 JSON 请控制在 1 MB 以内');
 const text=await file.text();JSON.parse(text);$(target).value=text;
 $(target).closest('details').open=true;
 $('message').textContent='已读入文件，请检查后再保存';
}
$('a-file').onchange=()=>safe(()=>readHandoffFile($('a-file'),'diagnosis-json'));
$('a-review-file').onchange=()=>safe(()=>readHandoffFile($('a-review-file'),'a-review-json'));
$('handoff-check').onclick=()=>safe(async()=>{
 const text=$('diagnosis-json').value.trim();let diagnosis=project.diagnosis;
 if(text){try{diagnosis=JSON.parse(text);}catch{throw new Error('请交付完整 Diagnosis JSON；空白 Markdown 报告模板尚不能进入 B。');}}
 if(!diagnosis)throw new Error('先导入 A 的实际 Diagnosis，再检查交付');
 const report=await request('/handoff-check',{...context(),diagnosis});
 const box=$('handoff-check-result');box.replaceChildren(el('p',report.ready_for_B?'字段已具备，可交给 B；内容仍需核对':'A 的交付还需补齐'));
 for(const error of report.errors)box.append(el('p','待补：'+error));
 for(const warning of report.warnings)box.append(el('p','需核对：'+warning));
});
$('b-run').onclick=()=>safe(async()=>{$('b-run').disabled=true;try{await mutate('generate-b',{});}finally{if(project)handoffView();}});
$('review-export').onclick=()=>safe(async()=>{
 const binding=context();
 const packet=await request('/handoff?id='+encodeURIComponent(binding.project_id));
 if(project.project_id!==binding.project_id||project.version!==packet.project_version)throw new Error('导出期间项目或版本变化，请刷新后重新导出给 A');
 const url=URL.createObjectURL(new Blob([JSON.stringify(packet,null,2)],{type:'application/json;charset=utf-8'}));
 const link=el('a','');link.href=url;link.download='A-review-request-'+packet.project_id+'.json';link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
 $('message').textContent='已导出当前目标、本人任务、实际材料与待复核成果；请把这一版本交给 A';
});
$('a-review-form').onsubmit=e=>{e.preventDefault();safe(()=>mutate('review-receive',{review:JSON.parse($('a-review-json').value)}));};
$('rescue-task').onchange=rescueChoices;

function rescueMediaEvent(node,event){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>finish(new Error('媒体读取超时，请换用短录屏或截图。')),15000);function finish(error){clearTimeout(timer);node.removeEventListener(event,ready);node.removeEventListener('error',failed);error?reject(error):resolve();}function ready(){finish();}function failed(){finish(new Error('无法解码媒体，请换用常见图片或视频格式。'));}node.addEventListener(event,ready,{once:true});node.addEventListener('error',failed,{once:true});});}
function rescueJpeg(media){
 const width=media.videoWidth||media.naturalWidth,height=media.videoHeight||media.naturalHeight;
 if(!width||!height)throw new Error('画面尺寸无效');
 const scale=Math.min(1,1100/width,900/height),canvas=document.createElement('canvas');canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);canvas.getContext('2d').drawImage(media,0,0,canvas.width,canvas.height);
 for(const quality of [.7,.5,.3]){const image=canvas.toDataURL('image/jpeg',quality);if(image.length<=600000)return image;}
 throw new Error('画面仍超过上限，请截取较小范围');
}
async function rescueMediaFrames(file){
 if(!file)return [];
 if(file.size>100*1024*1024)throw new Error('请选择小于 100 MB 的截图或短录屏');
 const url=URL.createObjectURL(file);let video;
 try{
  if(file.type.startsWith('image/')){const img=new Image(),ready=rescueMediaEvent(img,'load');img.src=url;await ready;return [{timestamp:0,image:rescueJpeg(img)}];}
  if(!file.type.startsWith('video/'))throw new Error('请选择图片或短录屏');
  video=document.createElement('video');video.muted=true;video.preload='auto';const ready=rescueMediaEvent(video,'loadeddata');video.src=url;await ready;
  if(!Number.isFinite(video.duration)||video.duration<=0||video.duration>1800)throw new Error('请截取 30 分钟以内的录屏片段');
  const end=Math.max(0,video.duration-Math.min(.01,video.duration*.01)),points=[0,video.duration/2,end],frames=[];
  for(const point of [...new Set(points)]){if(Math.abs(video.currentTime-point)>.001){const seek=rescueMediaEvent(video,'seeked');video.currentTime=point;await seek;}frames.push({timestamp:Math.round(point*1000)/1000,image:rescueJpeg(video)});}
  return frames;
 }finally{if(video){video.removeAttribute('src');video.load();}URL.revokeObjectURL(url);}
}
$('linked-rescue-form').onsubmit=e=>{e.preventDefault();safe(async()=>{
 const binding={...context(),expected_plan_version:project.plan.plan_version,task_id:$('rescue-task').value,gap_id:$('rescue-gap').value,action_id:$('rescue-action').value,note:$('rescue-note').value};
 $('rescue-start').disabled=true;
 try{const file=$('rescue-media').files[0],frames=await rescueMediaFrames(file);if(project.project_id!==binding.project_id||project.version!==binding.expected_version||$('rescue-task').value!==binding.task_id||$('rescue-gap').value!==binding.gap_id||$('rescue-action').value!==binding.action_id)throw new Error('媒体读取期间任务或版本变化，请重新选择后提交');await mutate('rescue-start',{...binding,frames,mediaKind:frames.length?(file.type.startsWith('video/')?'video':'image'):''});}
 finally{if(project)handoffView();}
});};
