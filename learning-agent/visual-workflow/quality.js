'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let seed,states,token,pid='XX',busy=false;
const project=()=>seed.projects.find(p=>p.id===pid),state=()=>states[pid],quality=()=>state().quality||{phase:'goal',history:[]};
function note(s){$('#notice').hidden=!s;$('#notice').textContent=s;}
const field=(n,t,v='')=>`<label>${t}<textarea name="${n}" required>${esc(v)}</textarea></label>`;
const file=(n='file',t='上传实际产物（20MB以内）')=>`<label>${t}<input name="${n}" type="file" required></label>`;
const link=u=>u?`<a href="/api/submission?project=${pid}&id=${encodeURIComponent(u.id)}">下载 ${esc(u.filename)}</a>`:'';
async function post(path,data){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Workflow-Token':token},body:JSON.stringify({project:pid,expected_revision:state().revision,...data})});const d=await r.json();if(!r.ok)throw Error(d.error||'未完成');return d;}
async function upload(f,name='file'){const f1=f.get(name);if(!f1||f1.size>20*1024*1024)throw Error('请交20MB以内的一个页面或表格');const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(f1);});return(await post('/api/upload',{filename:f1.name,data})).upload;}
async function event(name,payload){const d=await post('/api/event',{event:name,payload});states[pid]=d.state;render();}
function form(id,fn){const el=$(id);if(el)el.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;const btn=e.target.querySelector('button[type=submit],button:not([type])');if(btn)btn.disabled=true;try{await fn(new FormData(e.target));note('已保存；上下文和原55项验收不会被模拟通过覆盖。');}catch(err){note(err.message);}finally{busy=false;if(btn)btn.disabled=false;}};}
function render(){
 const p=project(),q=quality(),phase=q.phase,plan=q.plan;
 $('#project').innerHTML=seed.projects.map(p=>`<option value="${p.id}" ${p.id===pid?'selected':''}>${esc(p.name)}</option>`).join('');
 $('#flow').innerHTML=['共同确认目标','有依据的差距','按能力试做','本人修改V2','同标准比较','另一处迁移'].map((s,i)=>`<div class="flow-node"><span>${i+1}</span><b>${s}</b></div>`).join('');
 let h='';
 if(phase==='goal')h=`<h2>先理解你想达到什么，再一起确定标准</h2><p class="muted">“想做到好水平”可以作为起点。暂不要求你先会专业术语或自己列学习大纲。</p><form id="define">${field('goal','你希望这份作品变成什么样？',q.goal||'我想把当前作品做到能经得起追问的水平，但不知道从哪里改。')}<label>先讨论哪一个真实缺口？<select name="gap_index">${p.gaps.map((g,i)=>`<option value="${i}">${esc(g)}</option>`).join('')}</select></label>${field('self_report','这个环节你现在能做到哪？不会也可以直接说',q.self_report||'我知道想改好，但不知道具体方法，也不知道先学哪一点。')}<label>原始材料条件<select name="material_status"><option value="unknown">还需要确认有哪些材料</option><option value="available">当前作品及该步骤所需材料可提供</option><option value="missing">缺原始凭证/访谈/接口等前置</option></select></label><div class="split"><label>本人执行者姓名/稳定代号<input name="executor" value="${esc(q.executor||'')}" required></label><label>今天可用分钟<input name="minutes" type="number" min="1" max="720" value="20" required></label></div><button class="primary">复述我的目标，并给出可比较的标准</button></form>`;
 else if(phase==='confirm')h=`<h2>我理解你的目标是：${esc(q.goal)}</h2><div class="hint">当前优先差距：${esc(p.gaps[q.gap_index])}<br>原件位置：${esc(p.locations)}<br>这里只是有原件位置的人工候选，仍需你确认是否切中自己的问题。</div><p>较弱：只有结论、数字或“做过”的陈述。较强：能说明依据在哪、如何支持判断、还有什么不能确定。下面请确认/修正这一轮标准。</p><form id="confirm">${p.criteria.map((c,i)=>field('criterion'+i,'完成判据 '+(i+1),c)).join('')}${file('file','上传这轮真实V1；没有作品时可交本人现状说明，不能当科研成果')}<button class="primary">确认目标、V1和判据，再安排我的第一步</button></form><button class="quiet" id="redefine">理解不对，我要更正目标</button>`;
 else if(['trial','learn','execute','resource','help'].includes(phase)){
  h=`<span class="source-badge">${({trial:'能力尚未知，先试一行',learn:'只补上次出错的方法',execute:'应用到作品，提交真实V2',resource:'先补材料前置',help:'停止重复死磕，升级求助'})[phase]}</span><h2>${esc(plan.skill)}</h2><div class="hint"><b>为什么这样做</b><p>${esc(plan.explanation)}</p><b>补当前差距：</b>${esc(plan.gap)}</div><p><b>这次行动：</b>${esc(plan.action)}</p><p><b>最小产物：</b>${esc(plan.output)}；约${plan.estimate_minutes}分钟</p><p class="muted">卡住后：${esc(plan.failure_next)}</p>`;
  if(phase==='resource')h+=`<form id="resource">${field('note','缺哪份材料、问谁、已经得到什么回复？')}<label class="criteria-item"><input type="checkbox" name="available">材料已经实际取得，可以继续</label><button class="primary">保存求助记录</button></form>`;
  else if(phase==='help')h+=`<form id="resume">${field('note','求助后得到的具体回复/新的方法依据')}${field('action','依据回复调整成哪一个更小的动作？',plan.action)}<button class="primary">保留原标准，按新帮助再试</button></form>`;
  else h+=`<form id="artifact">${file()}${field('explanation','你做了什么、为什么这样做、哪一点仍不明白？')}<button class="primary">${phase==='execute'?'提交V2，按原标准比较':'提交这一行试做，检查当前方法'}</button></form><form id="help">${field('note','仍做不动？说明当前卡点与已试的方法')}<button class="secondary">保存现场并升级求助</button></form>`;
 }else if(phase==='trial_review'||phase==='transfer_review'){
  const item=phase==='trial_review'?q.pending_trial:q.pending_transfer;
  h=`<h2>${phase==='trial_review'?'检查这一行是否会做，不推断整体能力':'检查另一处是否能独立应用同一方法'}</h2><p>执行者：${esc(q.executor)}；${link(item.upload)}</p><p>${esc(item.explanation)}</p><form id="simple-review"><label>非执行者姓名/代号<input name="reviewer" required></label><label>实际结果<select name="passed"><option value="false">未通过</option><option value="true">通过</option></select></label>${field('note','核对了哪里，具体哪里对/错，依据是什么？')}<button class="primary">保存复核与下一步分流</button></form>`;
 }else if(phase==='content_review')h=`<h2>对照同一标准，比较V1与V2</h2><p>${link(q.v1)}　${link(q.pending_v2.upload)}</p><form id="compare"><label>非执行者姓名/代号<input name="reviewer" required></label>${q.criteria.map((c,i)=>`<div class="review-row"><b>${esc(c)}</b>${field('before'+i,'V1具体哪里没达到')}${field('after'+i,'V2哪里改变了，有什么依据')}<label>本项结果<select name="result${i}"><option value="unknown">未知，证据不够</option><option value="fail">未通过</option><option value="pass">通过</option></select></label>${field('note'+i,'比较结论与理由')}</div>`).join('')}<button class="primary">保存比较，只安排未通过项</button></form>`;
 else if(phase==='transfer')h=`<h2>这处成果改善了，再看看方法是否学会</h2><p>换另一处真实材料，减少提示试做。不能重复上传V1/V2。不会时只补当前方法，已通过的成果不推倒重来。</p><form id="transfer">${file()}${field('location','这次换了哪一处材料/位置？')}${field('explanation','用自己的话解释：你如何应用同一方法，为什么这样做？')}<button class="primary">提交另一处迁移试做</button></form>`;
 else h=`<h2 class="success">本轮成果改善与当前方法迁移，均有复核记录</h2><p>这只覆盖当前项目、判据与方法；不等于整体科研能力提升，更不等于省一或85分。</p><p>下一轮保留本轮技能证据；更换目标或原稿后重新确认适用性，不把旧记录直接当新任务已掌握。</p><button class="primary" id="redefine">保留历史，确认下一轮目标</button>`;
 $('#content').innerHTML='<section class="panel">'+h+'</section>';
 $('#log').innerHTML=q.history.map(x=>`<div class="history-entry"><small>${esc(x.time)}</small><p>${esc(x.detail)}</p></div>`).join('')||'<p class="muted">尚未确认目标。真实能力、提交和复核没有预填。</p>';
 if($('#redefine'))$('#redefine').onclick=()=>{const copy={...q,phase:'goal'};states[pid]={...state(),quality:copy};render();};
 form('#define',f=>event('q_define',{...Object.fromEntries(f),minutes:Number(f.get('minutes')),gap_index:Number(f.get('gap_index'))}));
 form('#confirm',async f=>event('q_confirm',{criteria:p.criteria.map((_,i)=>f.get('criterion'+i)),upload:await upload(f)}));
 form('#resource',f=>event('q_resource',{note:f.get('note'),available:f.get('available')==='on'}));
 form('#resume',f=>event('q_resume_help',Object.fromEntries(f)));
 form('#help',f=>event('q_help',{note:f.get('note')}));
 form('#artifact',async f=>event(phase==='execute'?'q_v2_submit':'q_trial_submit',{upload:await upload(f),explanation:f.get('explanation')}));
 form('#simple-review',f=>event(phase==='trial_review'?'q_trial_review':'q_transfer_review',{reviewer:f.get('reviewer'),passed:f.get('passed')==='true',note:f.get('note')}));
 form('#compare',f=>event('q_content_review',{reviewer:f.get('reviewer'),note:'逐项比较见checks',checks:q.criteria.map((_,i)=>({before:f.get('before'+i),after:f.get('after'+i),result:f.get('result'+i),note:f.get('note'+i)}))}));
 form('#transfer',async f=>event('q_transfer_submit',{upload:await upload(f),location:f.get('location'),explanation:f.get('explanation')}));
}
$('#project').onchange=e=>{if(busy){e.target.value=pid;return;}pid=e.target.value;history.replaceState(null,'','#'+pid);render();};
fetch('/api/data').then(r=>r.json()).then(d=>{seed=d.seed;states=d.states;token=d.token;if(seed.projects.some(p=>p.id===location.hash.slice(1)))pid=location.hash.slice(1);render();}).catch(()=>note('请启动本机工作台。本页不以静态演示冒充真实上传复核。'));

