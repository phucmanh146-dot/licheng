(function(root){
'use strict';
if(root.SYDeliveryGapReview)return;
var host=null,lastResult=null,selectedId='';
var $=function(s,r){return (r||host||document).querySelector(s)};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var acct=function(){try{return root.SY&&SY.getAcctData?SY.getAcctData():null}catch(e){return null}};
var save=function(a){try{if(root.SY&&SY.saveAcctData){SY.saveAcctData(a);return true}}catch(e){}return false};
var tasks=function(a){return a&&Array.isArray(a.tasks)?a.tasks:[]};
var done=function(t){return !!(t&&(t.done||t.completed||t.completedAt||t.status==='已交付'))};
var name=function(t){return String(t&&(t.name||t.title||t.text)||'未命名任务')};
var due=function(t){return String(t&&(t.dueDate||t.deadlineDate||t.due)||'')};
var fmt=function(n){return Number.isFinite(Number(n))&&Number(n)>0?Math.round(Number(n))+'分钟':'待估算'};
var currentTask=function(){var a=acct(),ts=tasks(a);return ts.find(function(t){return String(t.id)===String(selectedId)})||null};
var miniRubric=[
 ['固定事务不被挤占','课程/会议等固定时段锁定，排期不能覆盖','待核验','product-acceptance.md：要求列明；当前状态段未明确证明'],
 ['DDL前三天强制推进','每项硬截止有提前启动日、具体开始时段与冲突提示','部分实现','product-acceptance.md：硬截止排序部分实现；真实容量排期尚未完整'],
 ['计划任务防搁置','已决定做的计划任务必须获得具体开始时间；容量不足要暴露','未实现','product-acceptance.md：列为未实现/待补强'],
 ['任务拆解与验收','每项任务拆成子任务，含耗时、产出、验收标准','未实现','product-acceptance.md：动态子任务生成未实现'],
 ['个人耗时学习','依据同任务/同类真实耗时更新估时，不用固定缩短比例','未实现','product-acceptance.md：真实耗时学习未实现'],
 ['精力适配与休息','结合用户主动反馈调整强度，保留休息/发呆/缓冲','未实现','product-acceptance.md：精力曲线采集未实现'],
 ['90分钟止损与断点','卡住时记录已做、尝试、卡点、恢复第一步，再切换任务','部分实现','product-acceptance.md：卡点记录与90分钟计时已实现；自动闭环需复测'],
 ['跨日保留与顺延','未完成任务次日仍存在；重新计算剩余工作量，不挤占固定事项','未实现','product-acceptance.md：跨日自动重排未实现'],
 ['并行约束','仅允许无依赖且认知负荷兼容的任务并行','未实现','product-acceptance.md：并行约束引擎未实现'],
 ['正式交付闭环','记录文件/链接、上传要求、官方入口、真实提交凭证','未实现','product-acceptance.md：真实上传凭证未实现'],
 ['小程序可发布/可体验','真机体验、二维码/体验码、后台版本与审核/发布时间证据','待核验','ddl-fact-check-2026-11-01.md：project.config appid=touristappid；未见审核/发布证据']
];
var miniCurrent='来自本机 DDL执行教练Demo/docs/product-acceptance.md 与 docs/ddl-fact-check-2026-11-01.md 的已核验快照：\n已实现：五个 Tab、两项目独立页、本地任务持久化、进度更新、卡点记录、90分钟计时、TRAE第一课验收清单。\n部分实现：硬截止排序、未来任务排序、止损提示；尚未证明是真实日历容量下的完整自动排期。\n未实现：动态子任务生成、精力曲线采集、真实耗时学习、跨日自动重排、并行约束引擎、飞书同步、真实上传凭证、微信云端多设备同步。\n发布证据缺口：project.config.json 中 appid=touristappid；当前证据不能证明已审核、已发布或真机体验二维码可用。\n注意：上述为文档快照，不代表已读取当前微信后台或已完成最新真机回归。';
var campCriteria='TRAE训练营作品验收（按已读取的官方训练营材料）：\n1. 产品想法：名称、目标用户、具体问题、核心价值。\n2. PRD：用户场景、核心流程、页面清单、功能规则、异常状态、验收条件。\n3. Demo：公开链接可直接打开，至少一个页面可实际操作。\n4. 真实体验：至少1位朋友体验，保留日期、原话和具体问题。\n5. 迭代：反馈→修改→复测记录（质量门禁）。\n6. 课堂作业帖：官方版块、指定标题/标签、介绍、Demo链接、2-3张截图、朋友反馈原话。\n结营材料（按2026-11-01读取的官方帖子）：至少3张主要页面截图、3张TRAE完整开发截图、3个真实Session ID、可扫码体验二维码、微信后台版本管理截图（审核/发布时间至少为10/27或之后）。\n日期边界：11/04是历史台账中的交付目标；官方帖子首帖未核实到11/04具体截止时刻。第一课截止10/28 19:00已过，不得伪装按时提交。\n官方来源：https://forum.trae.cn/t/topic/463231；提交版块：https://forum.trae.cn/c/44-category/44';
function evidence(t,a){
 var ts=tasks(a),kids=ts.filter(function(x){return String(x.parentTaskId||'')===String(t.id)}),logs=(a.durationLog||[]).filter(function(x){return String(x.taskId||'')===String(t.id)&&Number(x.actualMinutes)>0}),cp=(a.taskCheckpoints||[]).filter(function(x){return String(x.taskId||'')===String(t.id)}).slice(-1)[0],materials=Array.isArray(t.materials)?t.materials:[];
 var lines=['任务ID：'+t.id,'任务：'+name(t),'项目：'+(t.project||t.category||'未分类'),'状态：'+(done(t)?'完成标记（仍需交付证据核验）':(t.status||a.taskStatusById&&a.taskStatusById[String(t.id)]||'未完成')),'计划日期：'+(t.date||'未设置'),'截止：'+(due(t)||'未设置')+' '+(t.dueTime||''),'完成进度字段：'+(t.progress!==undefined?t.progress+'%':'未记录'),'交付物要求：'+(t.deliverable||'未填写'),'上传要求：'+(t.uploadRequired===true?'需要':t.uploadRequired===false?'不需要':'待确认'),'提交入口：'+(t.submissionUrl||'未记录'),'提交状态：'+(t.submissionStatus||'未记录'),'现有子任务：'+kids.length+(kids.length?'（'+kids.filter(done).length+'项完成）':''),'历史计时记录：'+logs.length+'条；合计 '+logs.reduce(function(s,x){return s+Number(x.actualMinutes||0)},0)+'分钟','关联资料：'+materials.length+'条（链接存在不等于正文已读取）','最近断点：'+(cp?[cp.progress,cp.blocker,cp.nextStep].filter(Boolean).join('；'):'暂无记录'),'已有备注/进度说明：'+(t.progressNote||t.note||t.notes||'未记录')];
 if(/TRAE|小程序|DDL执行教练/.test(name(t)+' '+String(t.project||'')))lines.push('本机小程序产品现状核验快照（文档来源：DDL执行教练Demo/docs/product-acceptance.md、docs/ddl-fact-check-2026-11-01.md）：',miniCurrent);
 return lines.join('\\n');
}
function targets(a){return tasks(a).filter(function(t){return !t.deleted&&!t.containerOnly&&!done(t)&&(due(t)||t.hardDeadline||/千雪|Agent|PRA|TRAE|DDL执行教练|小程序/.test(name(t)+' '+(t.project||'')))}).sort(function(x,y){var dx=due(x)||'9999',dy=due(y)||'9999';return dx.localeCompare(dy)||name(x).localeCompare(name(y))})}
function defaultCriteria(t){
 var s=name(t)+' '+String(t.project||'');
 if(/TRAE|小程序|DDL执行教练/.test(s))return campCriteria+'\n\n产品自身功能验收标准（本机 product-acceptance.md）：\n'+miniRubric.map(function(x,i){return (i+1)+'. '+x[0]+'：'+x[1]+'。文档状态：'+x[2]+'；依据：'+x[3]+'。'}).join('\n');
 return '请粘贴该任务的官方规则/评分标准/验收要求。当前任务记录中的交付物描述仅作为用户台账，不自动等同官方规则。\n\n已有交付物描述：'+(t.deliverable||'待补充')+'\n现有步骤：'+(Array.isArray(t.steps)?t.steps.map(function(x){return typeof x==='string'?x:(x.name||x.title||x.text||'')}).join('；'):'未提供');
}
function status(msg,bad){var n=$('#dgr-status');if(n){n.textContent=msg||'';n.classList.toggle('bad',!!bad)}}
function render(){
 var a=acct();if(!a||!host)return;
 var list=targets(a),sel=$('#dgr-task');
 if(!selectedId||!list.some(function(t){return String(t.id)===String(selectedId)}))selectedId=list.length?String(list[0].id):'';
 if(sel){var prev=selectedId;sel.innerHTML=list.map(function(t){return '<option value="'+esc(t.id)+'">'+esc(name(t))+' · '+esc(due(t)||'无截止日')+'</option>'}).join('')||'<option value="">当前账户没有可分析的未完成交付任务</option>';sel.value=prev}
 var t=currentTask();var ev=$('#dgr-evidence'),cr=$('#dgr-criteria');
 if(t&&ev&&!ev.dataset.edited){ev.value=evidence(t,a)}
 if(t&&cr&&!cr.dataset.edited){cr.value=defaultCriteria(t)}
 var sum=$('#dgr-current-summary');
 if(sum){sum.innerHTML=t?'<b>'+esc(name(t))+'</b><span>截止 '+esc(due(t)||'未设置')+' · '+esc(done(t)?'已标记完成，待凭证核验':(t.status||'未完成'))+'</span><p>当前证据按原任务 ID 读取；没有的字段显示“未记录”，不会推定为已完成。</p>':'<p>当前账户没有找到可分析的交付任务。请先在任务清单建立任务。</p>'}
 var result=$('#dgr-result');if(result&&lastResult)renderResult(lastResult);
}
function mount(){
 if(host&&host.isConnected)return;
 var page=document.getElementById('view-daily');if(!page)return;
 host=document.createElement('section');host.id='sy-delivery-gap-review';host.className='dgr-card';
 host.innerHTML='<div class="dgr-head"><div><small>DELIVERY GAP ANALYSIS · EVIDENCE FIRST</small><h3>AI交付差距分析</h3><p>不是看“计划完成了多少”，而是对照合格标准，检查真实产出、质量证据、上传和回执还缺什么。</p></div><span class="dgr-tag">每日动态复核</span></div><div class="dgr-flow"><span>官方标准</span><i>→</i><span>当前证据</span><i>→</i><span>差距</span><i>→</i><span>倒排子任务</span><i>→</i><span>验收提交</span></div><div class="dgr-current" id="dgr-current-summary"></div><label class="dgr-label">选择要验收的任务<select id="dgr-task"></select></label><div class="dgr-two"><label class="dgr-label">合格标准 / 官方要求<textarea id="dgr-criteria" rows="8" placeholder="粘贴官方任务书、评分标准、验收要求或老师通知"></textarea></label><label class="dgr-label">当前现状 / 已有证据<textarea id="dgr-evidence" rows="8" placeholder="系统会先带入任务台账；补充真实文件、截图、录屏、测试结果、提交凭证和剩余卡点"></textarea></label></div><div class="dgr-actions"><button type="button" class="primary" id="dgr-analyze">✦ AI对照验收并拆解差距</button><button type="button" id="dgr-reset">重新读取任务事实</button></div><div id="dgr-status" class="dgr-status" role="status">先读取原任务事实。AI分析会调用工作台真实模型接口；未连接时明确报错，不用假分析冒充。</div><div id="dgr-result" class="dgr-result"></div>';
 page.insertBefore(host,page.firstChild);
 host.addEventListener('change',function(e){if(e.target.id==='dgr-task'){selectedId=e.target.value;lastResult=null;var ev=$('#dgr-evidence'),cr=$('#dgr-criteria');ev.dataset.edited='';cr.dataset.edited='';render();$('#dgr-result').innerHTML=''}});
 host.addEventListener('input',function(e){if(e.target.id==='dgr-evidence'||e.target.id==='dgr-criteria')e.target.dataset.edited='1'});
 host.addEventListener('click',handle);
 render();
}
function parseJSON(s){s=String(s||'').trim().replace(/^\uFEFF/,'').replace(/^\`\`\`(?:json)?/i,'').replace(/\`\`\`$/,'').trim();var a=s.indexOf('{'),b=s.lastIndexOf('}');if(a>=0&&b>a){try{return JSON.parse(s.slice(a,b+1))}catch(e){}}return null}
function promptFor(t,criteria,ev){
 return '你是严谨的产品交付验收官和项目执行教练。请只基于以下“合格标准”和“当前证据”做差距分析，不得编造已完成状态、官方要求、文件、测试、上传或回执。\n规则：1) 每项结论标记 PASS/PARTIAL/MISSING/UNKNOWN；UNKNOWN表示证据不足，不等于未做。2) 区分内容完成、质量验收、正式上传/提交、提交凭证。3) 截止日期前倒排，每个子任务给具体产出、验收条件、分钟估时和前置依赖；时间不足时明确风险，不压缩成虚假工时。4) 固定事务不可挤占；未确认的截止时刻/入口标记待核实。5) 只建议，不要声称已执行或自动创建。6) 优先顺序按硬截止、差距风险、依赖、最小可验证产出。7) 若官方标准缺失，先生成需要补齐的核验任务。\n只返回JSON，不要Markdown围栏，结构：{\"overall\":\"...\",\"risk\":\"high|medium|low|unknown\",\"summary\":\"...\",\"gaps\":[{\"criterion\":\"...\",\"status\":\"PASS|PARTIAL|MISSING|UNKNOWN\",\"currentEvidence\":\"...\",\"missing\":\"...\",\"nextAction\":\"...\"}],\"steps\":[{\"title\":\"...\",\"output\":\"...\",\"acceptance\":\"...\",\"minutes\":30,\"dependency\":\"...\",\"priority\":1}],\"deadlineRisks\":[\"...\"],\"questions\":[\"...\"]}.\n\n任务：'+name(t)+'\n任务记录：'+evidence(t,acct())+'\n\n合格标准：\n'+criteria+'\n\n当前现状与证据：\n'+ev;
}
async function analyze(){
 var a=acct(),t=currentTask();if(!a||!t)return status('未找到原任务，请先登录并选择任务。',true);
 var criteria=$('#dgr-criteria').value.trim(),ev=$('#dgr-evidence').value.trim();if(!criteria)return status('先补充官方合格标准；没有标准就无法判断作品是否合格。',true);if(!ev)return status('先补充当前真实产出和证据，不能用空白数据计算完成度。',true);
 var btn=$('#dgr-analyze');btn.disabled=true;btn.textContent='AI正在对照标准…';status('正在调用工作台真实 AI 接口 /api/p2/ask。原任务不会被修改。');
 try{var res=await fetch('/api/p2/ask',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:promptFor(t,criteria,ev),history:[],fileIds:[],urls:[],deep:true,search:false,transcribeVideo:false,videoAnalysis:false,taskContext:'仅使用用户主动提供的交付标准和任务事实。不得推断私人背景、情绪或健康。'})});var data=await res.json().catch(function(){return{error:'服务端未返回有效JSON'}});if(!res.ok||data.error)throw new Error(data.error||('HTTP '+res.status));var raw=String(data.reply||'');var obj=parseJSON(raw);if(!obj)throw new Error('模型已返回文本，但没有按要求返回可解析的结构化差距清单。原文保留在结果区，不会自动生成任务。');lastResult={data:obj,raw:raw,model:data.model||'真实模型（名称未返回）',at:Date.now(),taskId:String(t.id),taskName:name(t)};renderResult(lastResult);status('已收到真实模型分析。请先核对每条差距；目前没有创建子任务、修改原任务或标记提交。');}
 catch(e){status('AI真实分析失败：'+e.message+'。请检查AI连接诊断；不会用规则猜测冒充模型结论。',true)}
 finally{btn.disabled=false;btn.textContent='✦ AI对照验收并拆解差距'}
}
function renderResult(r){
 var box=$('#dgr-result');if(!box||!r)return;var d=r.data||{},g=Array.isArray(d.gaps)?d.gaps:[],steps=Array.isArray(d.steps)?d.steps:[];
 var statusText={PASS:'有证据通过',PARTIAL:'部分完成',MISSING:'明确缺失',UNKNOWN:'证据不足'},statusClass={PASS:'pass',PARTIAL:'partial',MISSING:'missing',UNKNOWN:'unknown'};
 box.innerHTML='<div class="dgr-result-head"><div><small>真实模型：'+esc(r.model)+' · '+new Date(r.at).toLocaleString()+'</small><h4>差距结论：'+esc(d.overall||d.risk||'待确认')+'</h4><p>'+esc(d.summary||'')+'</p></div><span class="dgr-risk '+esc(d.risk||'unknown')+'">'+esc(d.risk||'风险待确认')+'</span></div><h5>一、现状与合格标准的差距</h5>'+(g.length?g.map(function(x){return '<article class="dgr-gap"><div><b>'+esc(x.criterion||'未命名标准')+'</b><span class="dgr-state '+(statusClass[x.status]||'unknown')+'">'+esc(statusText[x.status]||'状态待确认')+'</span></div><p><strong>当前证据：</strong>'+esc(x.currentEvidence||'未提供')+'</p><p><strong>还缺：</strong>'+esc(x.missing||'待核实')+'</p><p><strong>下一步：</strong>'+esc(x.nextAction||'待拆解')+'</p></article>'}).join(''):'<p>模型未提供结构化差距项，请查看原始回复。</p>')+'<h5>二、按截止日期倒排的最小子任务</h5>'+(steps.length?'<div class="dgr-steps">'+steps.map(function(x,i){return '<article class="dgr-step"><span>'+(i+1)+'</span><div><b>'+esc(x.title||'待命名')+'</b><p>'+esc(x.output||'')+'</p><p><strong>验收：</strong>'+esc(x.acceptance||'待补充')+'</p><small>'+esc(fmt(x.minutes))+' · 前置：'+esc(x.dependency||'无明确依赖')+'</small></div></article>'}).join('')+'</div>':'<p>暂无可创建的子任务。</p>')+'<h5>三、截止风险与待确认信息</h5><ul>'+(Array.isArray(d.deadlineRisks)?d.deadlineRisks:[]).concat(Array.isArray(d.questions)?d.questions:[]).map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul><div class="dgr-actions"><button type="button" class="primary" id="dgr-create" '+(!steps.length?'disabled':'')+'>确认后创建 '+steps.length+' 项子任务</button><button type="button" id="dgr-copy">复制本次分析</button></div><p class="dgr-foot">创建前请检查日期、时长和验收项。创建只新增子任务，不修改父任务截止日期/完成状态；不自动提交作品。</p>';
}
function createSteps(){
 var a=acct(),t=currentTask(),steps=lastResult&&lastResult.data&&lastResult.data.steps||[];if(!a||!t||!steps.length)return;
 var existing=tasks(a).filter(function(x){return String(x.parentTaskId||'')===String(t.id)&&String(x.importKey||'').indexOf('dgr_'+String(t.id)+'_')===0});if(existing.length&&!confirm('该任务已有 '+existing.length+' 项由差距分析创建的子任务。继续会新增本轮 '+steps.length+' 项，不会覆盖旧任务。继续吗？'))return;
 var day=root.SY&&SY.todayKey?SY.todayKey():new Date().toISOString().slice(0,10),dueDate=due(t),added=0,max=tasks(a).reduce(function(m,x){return Math.max(m,Number(x.order)||0)},0);
 steps.forEach(function(s,i){var mins=Math.max(5,Math.min(480,Number(s.minutes)||30)),d=day;if(dueDate&&/^\d{4}-\d{2}-\d{2}$/.test(dueDate)){var dueObj=new Date(dueDate+'T00:00:00'),todayObj=new Date(day+'T00:00:00'),gap=Math.max(0,Math.round((dueObj-todayObj)/86400000));d=gap>0?new Date(todayObj.getTime()+Math.round(gap*(i+1)/(steps.length+1))*86400000).toISOString().slice(0,10):day;}
 var id=root.SY&&SY.uid?SY.uid():'dgr_'+Date.now()+'_'+i;tasks(a).push({id:id,name:name(t)+'｜'+String(s.title||'交付子任务'),project:t.project||t.category||'交付拆解',category:t.category||t.category||t.project||'交付子任务',parentTaskId:String(t.id),date:d,dueDate:dueDate,dueTime:'',estMinutes:mins,plannedMinutes:mins,remainingMinutes:mins,startMinutes:null,aiScheduled:false,done:false,completed:false,completedAt:null,important:true,urgent:!!dueDate,hardDeadline:!!dueDate,deliverable:String(s.output||''),acceptanceCriteria:String(s.acceptance||''),dependencyNote:String(s.dependency||''),status:'未开始',scheduleStatus:'待安排',sourceLabel:'AI交付差距分析；用户确认创建',importKey:'dgr_'+String(t.id)+'_'+Date.now()+'_'+i,createdAt:Date.now(),order:max+1+i});added++;});
 save(a);if(root.SY&&SY.planDay){try{if(a.dailyHours&&a.dailyHours[day]!==undefined)SY.planDay(day,{release:true,report:true})}catch(e){}}
 if(root.SY&&SY.refreshCurrentView)SY.refreshCurrentView();status('已创建 '+added+' 项子任务并保留父任务原截止日期。若今天可用时长未设置，子任务先保留在任务池，不会假装已排入具体时段。');render();
}
function handle(e){if(e.target.closest('#dgr-analyze')){analyze();return}if(e.target.closest('#dgr-reset')){var ev=$('#dgr-evidence'),cr=$('#dgr-criteria');ev.dataset.edited='';cr.dataset.edited='';render();status('已重新读取当前任务台账。');return}if(e.target.closest('#dgr-create')){if(confirm('确认把本次AI拆解作为新的子任务写入上岸鸭原任务池？不会标记完成，也不会提交作品。'))createSteps();return}if(e.target.closest('#dgr-copy')&&lastResult){var txt=JSON.stringify(lastResult.data,null,2);if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(function(){status('已复制本次结构化分析。')}).catch(function(){status('浏览器不允许自动复制，请选中结果手动复制。',true)});return}}
function boot(){mount();render()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
document.addEventListener('sy:ready',boot);document.addEventListener('visibilitychange',function(){if(!document.hidden)render()});
root.SYDeliveryGapReview={refresh:render,analyze:analyze,selectedTask:currentTask};
})(window);
