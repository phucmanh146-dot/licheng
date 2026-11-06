/* 微信登录窗口 → 关键词预览 → 用户选取 → 框选 → 绑定任务。仅用户主动执行。 */
(function(){
'use strict';if(window.SYPMWeChatV4)return;
const Q=(s,r=document)=>r.querySelector(s);
const El=(t,c,v)=>{const n=document.createElement(t);if(c)n.className=c;if(v!==undefined)n.textContent=String(v);return n};
let currentSearch=null,lastCandidate=null,lastCrop=null,busy=false,selectedScope='group',selectedGroup='',selectedGroupId='',selectedHistoryMessage=null;
let selectedHistoryBatch=[];
function notice(t,bad=false){let x=Q('#pmaw-status');if(x){x.textContent=t;x.dataset.error=String(bad)}}
function setFlowStep(step){Q('.pmaw-flow')?.querySelectorAll('li').forEach((n,i)=>{n.classList.toggle('is-active',i+1===step);n.classList.toggle('is-done',i+1<step)})}
async function historyApi(path,data){if(!window.SYMultiSources?.api)throw Error('本机资料桥未加载；请确认本机读取服务正在运行。');return window.SYMultiSources.api('/api/sources/wechat',{path,method:'POST',data:data||{}})}
function account(){return window.SY&&typeof SY.getAcctData==='function'?SY.getAcctData():{tasks:[]}}
function save(data){if(window.SY&&typeof SY.saveAcctData==='function')SY.saveAcctData(data);else throw Error('原任务存储接口尚未加载，未保存微信证据。')}
function taskOptions(){
 const sel=Q('#pmaw-existing-task');if(!sel)return;
 const previous=sel.value,a=account(),tasks=Array.isArray(a.tasks)?a.tasks:[];
 sel.replaceChildren(new Option('新建任务（需要你确认）','new'));
 tasks.filter(t=>t&&!t.done&&!t.deleted).forEach(t=>sel.append(new Option(String(t.name||t.title||'未命名任务')+' · '+String(t.category||'未分类'),String(t.id))));
 sel.value=Array.from(sel.options).some(o=>o.value===previous)?previous:'new';updateNewTask();
}
function updateNewTask(){
 const sel=Q('#pmaw-existing-task'),fields=Q('#pmaw-new-task-fields');if(!sel||!fields)return;
 const creating=!sel.value||sel.value==='new';fields.hidden=!creating;
 const name=Q('#pmaw-taskname');if(name)name.required=creating;
 const estimate=Q('#pmaw-est-minutes');if(estimate)estimate.required=creating;
}
function candidates(result){
 const host=Q('#pmaw-results');if(!host)return;host.replaceChildren();
 const rows=Array.isArray(result&&result.candidates)?result.candidates:[];
 host.append(El('p','pmaw-note',String(result&&result.note||'当前微信窗口搜索返回 '+rows.length+' 条候选。仅展示接口真实返回的内容；请逐条核对后再关联。')));
 if(!rows.length){host.append(El('p','pmaw-note','没有可展示的候选消息。请检查关键词或当前微信窗口；不会把连接状态当作读取成功。'));return}
 rows.slice(0,100).forEach((item,index)=>{
  const row=El('article','pmaw-history-hit'),title=String(item.groupName||item.group||item.title||('候选消息 '+(index+1))),bodyText=String(item.text||item.content||item.message||item.snippet||'');
  row.append(El('div','pmaw-history-meta',title+(item.time?' · '+String(item.time):'')),El('p','pmaw-history-text',bodyText.slice(0,1200)));
  const btn=El('button','pmaw-light','选择并核对');btn.type='button';btn.onclick=()=>{
   selectedHistoryMessage={id:item.id||item.messageId||'',text:bodyText,group:title,time:item.time||'',sender:item.sender||item.senderName||''};
   selectedGroup=title;selectedGroupId=String(item.groupId||item.chatId||'');lastCandidate={label:title,scope:'window'};lastCrop=null;
   const box=Q('#pmaw-recognition'),ocr=Q('#pmaw-ocr');if(box)box.hidden=false;if(ocr)ocr.textContent=bodyText||'接口返回了候选，但没有可展示的正文。';
   const input=Q('#pmaw-taskname');if(input&&!input.value)input.value=bodyText.split(/\r?\n/).map(x=>x.trim()).find(Boolean)||'';
   taskOptions();setFlowStep(3);notice('已选择接口返回的真实候选。请核对原文并确认关联，不会自动创建任务。');row.classList.add('is-selected');
  };row.append(btn);host.append(row);
 });
}
function showGroupResults(result){const host=Q('#pmaw-results');host.replaceChildren();const groups=Array.isArray(result.groups)?result.groups:[];host.append(El('p','pmaw-note','本机历史群目录匹配 '+(result.total||groups.length)+' 个群。此目录不提供置顶标记；请核对群名后选择。'));groups.slice(0,200).forEach((g,i)=>{const name=String(g.name||'').trim();if(!name)return;const row=El('div','pmaw-hit'),num=El('span','pmaw-hit-number',String(i+1).padStart(2,'0')),info=El('span','pmaw-hit-name',name),btn=El('button','pmaw-light','选中此群');btn.type='button';btn.onclick=()=>{selectedGroup=name;selectedGroupId=String(g.id||'');selectedHistoryMessage=null;Q('#pmaw-message-query')?.focus();setFlowStep(2);notice('已选中群聊「'+name+'」。输入消息关键词后，搜索本机历史记录。');host.querySelectorAll('.pmaw-hit').forEach(x=>x.classList.remove('is-selected'));row.classList.add('is-selected');btn.textContent='已选中 ✓'};row.append(num,info,btn);host.append(row)});if(result.partial)host.append(El('p','pmaw-note','匹配结果超过本批显示上限；请缩小群名关键词。'))}
function showHistoryMessages(result,append=false){
 const host=Q('#pmaw-results');if(!append){host.replaceChildren();selectedHistoryBatch=[];}else host.querySelector('.pmaw-history-more')?.remove();
 const items=Array.isArray(result.items)?result.items:[];
 if(!append)host.append(El('p','pmaw-note','群聊「'+String(result.group||selectedGroup)+'」本机历史搜索结果：'+items.length+' 条。只显示匹配到的真实记录；图片/语音/视频等媒体消息可能需要另行识别。'));
 if(!append){
 const toolbar=El('div','pmaw-row');
 const selectAll=El('button','pmaw-light','全选本页消息');
 selectAll.type='button';selectAll.onclick=()=>host.querySelectorAll('input[data-pmaw-batch]').forEach(x=>x.checked=true);
 const clear=El('button','pmaw-light','取消勾选');
 clear.type='button';clear.onclick=()=>host.querySelectorAll('input[data-pmaw-batch]').forEach(x=>x.checked=false);
 const analyze=El('button','pmaw-light','批量 AI 分析');
 analyze.type='button';analyze.onclick=()=>{
  const selected=Array.from(host.querySelectorAll('input[data-pmaw-batch]:checked')).map(x=>selectedHistoryBatch[Number(x.dataset.pmawBatch)]).filter(Boolean);
  if(!selected.length)return notice('先勾选至少一条真实微信消息。',true);
  if(selected.length>20)return notice('每次最多分析20条消息，请分批操作。',true);
  const promptBox=Q('#pma-question'),ask=Q('#pma-ask');
  if(!promptBox||!ask)return notice('AI问答入口尚未加载，本次没有发送消息。',true);
  const corpus=selected.map(m=>'【群：'+selectedGroup+'；时间：'+(m.time||'未确认')+'；发送人：'+(m.sender||'未确认')+'】\\n'+String(m.text||'')).join('\\n\\n').slice(0,16000);
  promptBox.value='请分析以下本机真实读取的微信原文：按通知、资料、任务、风险分类；逐条保留来源、原始链接、明确DDL和下一步动作；与已有任务去重；生成候选任务供我确认，不要自动写入；结合原任务重要紧急程度、精力和实际耗时建议排期；无法确认的内容必须注明。\\n\\n'+corpus;
  promptBox.dispatchEvent(new Event('input',{bubbles:true}));ask.click();
  notice('已将勾选的 '+selected.length+' 条真实微信消息送入现有 AI 问答流程，请在回答区核对结果。');
 };
 toolbar.append(selectAll,clear,analyze);host.append(toolbar);
}
items.forEach((item,i)=>{const row=El('article','pmaw-history-hit'),meta=El('div','pmaw-history-meta',String(item.time||'')+' · '+String(item.sender||'未知发送者')),body=El('p','pmaw-history-text',String(item.text||'').slice(0,1200)),btn=El('button','pmaw-light','选择并识别任务');btn.type='button';btn.onclick=()=>{selectedHistoryMessage=item;lastCandidate={label:String(item.text||'').slice(0,180),scope:'history'};lastCrop=null;const box=Q('#pmaw-recognition');if(box)box.hidden=false;const ocr=Q('#pmaw-ocr');if(ocr)ocr.textContent=String(item.text||'');const taskName=Q('#pmaw-taskname');if(taskName&&!taskName.value){const lines=String(item.text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);taskName.value=(lines.find(x=>/提交|完成|讨论|汇报|截止|任务|制作|设计|PPT|DDL/i.test(x))||lines[0]||'').slice(0,70)}taskOptions();setFlowStep(3);notice('已选择一条本机历史消息。点击“AI 识别任务/链接”，核对后再关联任务。');row.classList.add('is-selected')};const c=El('input');c.type='checkbox';c.dataset.pmawBatch=String(selectedHistoryBatch.length);c.setAttribute('data-pmaw-batch','');c.setAttribute('aria-label','选择微信原文');selectedHistoryBatch.push(item);row.append(c,meta,body,btn);host.append(row)});
 if(!items.length&&!append)host.append(El('p','pmaw-note','没有匹配消息。可换关键词，或切换到微信窗口搜索。'));
 if(result.hasMore){const more=El('button','pmaw-history-more','继续读取更早消息 →');more.type='button';more.onclick=loadMoreHistory;host.append(more)}
}
async function loadMoreHistory(){
 if(busy||!selectedGroupId||!currentSearch)return;busy=true;const more=Q('.pmaw-history-more');if(more){more.disabled=true;more.textContent='正在读取…'}
 try{const keyword=Q('#pmaw-message-query')?.value.trim()||'',offset=Number(currentSearch.nextOffset||0);const h=await historyApi('/wechat/history',{groupId:selectedGroupId,keyword,offset,limit:50});currentSearch=Object.assign({},currentSearch,{nextOffset:h.nextOffset,hasMore:!!h.hasMore});showHistoryMessages(h,true);notice('已继续读取更早消息：本批 '+((h.items||[]).length)+' 条。')}
 catch(e){notice('读取更早消息失败：'+e.message,true);if(more){more.disabled=false;more.textContent='重试读取更早消息 →'}}
 finally{busy=false}
}
async function search(scope){
 const input=Q(scope==='group'?'#pmaw-group-query':'#pmaw-message-query'),keyword=input?.value.trim()||'';
 if(!keyword)return notice('先填'+(scope==='group'?'群聊':'群聊消息')+'关键词',true);
 if(busy)return;if(scope==='group'){selectedGroup='';selectedGroupId='';selectedHistoryMessage=null}busy=true;selectedScope=scope;setFlowStep(scope==='group'?1:2);
 try{
  if(scope==='group'){
   notice('正在通过本机只读历史目录检索群名…');
   try{const h=await historyApi('/wechat/history-groups',{query:keyword});if(Array.isArray(h.groups)&&h.groups.length){currentSearch={source:'wechat-history-directory',groups:h.groups,total:h.total};showGroupResults(h);notice('群名检索完成：找到 '+(h.total||h.groups.length)+' 个匹配群。选择群名后再搜索消息。');return}}
   catch(historyError){notice('历史目录暂不可用，改为搜索当前微信窗口：'+historyError.message)}
  }else if(selectedGroupId){
   notice('正在读取群聊「'+selectedGroup+'」的本机历史消息…');
   try{const h=await historyApi('/wechat/history',{groupId:selectedGroupId,keyword,offset:0,limit:50});showHistoryMessages(h);currentSearch={source:'wechat-history',groupId:selectedGroupId,items:h.items||[],hasMore:!!h.hasMore,nextOffset:Number(h.nextOffset||0)};notice('本机历史读取返回 '+((h.items||[]).length)+' 条匹配消息。请选中一条再识别和关联。');return}
   catch(historyError){notice('本机历史消息接口不可用，改用当前微信窗口搜索：'+historyError.message)}
  }
  const r=await historyApi('/wechat/search',{query:keyword});r.source='local-wechat-search';currentSearch=r;candidates(r);
  notice((r.note||'本机微信窗口搜索已返回。')+(r.candidates?.length?' 找到 '+r.candidates.length+' 条候选，请核对真实群名和消息。':'')+' 当前窗口搜索不等于完整历史数据库。');
 }catch(e){notice('微信搜索未完成：'+e.message+'。请确认本机桥接服务和微信窗口可用。',true)}
 finally{busy=false}
}
async function focus(){
 setFlowStep(3);if(busy)return;busy=true;const button=Q('#pmaw-focus');if(button)button.disabled=true;
 notice('正在切到微信并打开右上角浮窗；你点框选后才会截图…');
 try{if(!window.SYPMScreenSelect?.openDesktop)throw Error('浮窗入口尚未加载，请刷新工作台');const d=await SYPMScreenSelect.openDesktop();notice(d.note)}
 catch(e){notice(e.message,true)}finally{busy=false;if(button)button.disabled=false}
}
async function crop(){return focus()}
function catchCrop(detail){
 setFlowStep(3);lastCrop=detail;const box=Q('#pmaw-recognition');if(!box)return;
 box.hidden=false;
 const content=String(detail.content||'').trim(),msg=Q('#pmaw-ocr');
 msg.textContent=content||'本次 OCR 未读出可用的中文。原始截图仍关联在 AI 附件中，可点“AI根据截图识别”。';
 const label=Q('#pmaw-taskname');if(label&&!label.value&&content){
   const lines=content.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
   label.value=(lines.find(x=>/提交|完成|讨论|汇报|截止|任务|制作|设计|PPT|DDL/i.test(x))||lines[0]||'').slice(0,70);
 }
 taskOptions();box.scrollIntoView({behavior:'smooth',block:'center'});
 notice('框选图片已进入本地资料池。请核对识别文字、选择原任务或输入新任务名称，再按确认。')
}
function analyzeCrop(){
 const raw=selectedHistoryMessage?String(selectedHistoryMessage.text||''):String(lastCrop?.content||'');if(!raw.trim())return notice('先选择一条历史消息，或框选微信窗口内容。',true);
 const q=Q('#pma-question'),button=Q('#pma-ask');if(!q||!button)return notice('AI 问答入口暂未加载',true);
 const group=selectedGroup||Q('#pmaw-group-query')?.value.trim()||'（未知群聊）';
 const message=Q('#pmaw-message-query')?.value.trim()||'（未设）';
 q.value='只根据本次授权读取的微信消息或框选截图，识别对应任务、明确的DDL原话、责任人、消息中的链接和下一步。群聊：'+group+'；消息关键词：'+message+'。未知内容请标注“未确认”，不能编造截止日期。原文：\n'+raw.slice(0,5000);
 q.dispatchEvent(new Event('input',{bubbles:true}));
 button.click();notice('已向当前已连接的模型提交框选截图与任务识别请求，结果显示在上方的 Agent 回答区。')
}
function confirmTask(){
 const d=lastCrop,a=window.SY&&typeof window.SY.getAcctData==='function'?window.SY.getAcctData():null,rawText=selectedHistoryMessage?String(selectedHistoryMessage.text||''):String(d?.content||'');if(!rawText.trim()||(!selectedHistoryMessage&&!d?.file?.id))return notice('先选择一条历史消息或框选真实微信内容',true);
 if(!a)return notice('请先登录工作台，再关联微信任务证据。',true);
 const sel=Q('#pmaw-existing-task')?.value||'new';
 let task=null;
 const create=sel==='new';
 const name=(Q('#pmaw-taskname')?.value||'').trim().slice(0,130);
 if(create&&!name)return notice('新建任务必须先填写并确认任务名称，不能凭 OCR 自动创建。',true);
 if(!create){task=(Array.isArray(a.tasks)?a.tasks:[]).find(x=>String(x.id)===sel);if(!task)return notice('原任务已不存在，刷新任务列表后重选',true)}
 const estimate=Number(Q('#pmaw-est-minutes')?.value||30);
 const category=Q('#pmaw-category')?.value||'比赛';
 const dueDate=Q('#pmaw-due-date')?.value||null;
 if(create){
  const d0=new Date(),date=d0.getFullYear()+'-'+String(d0.getMonth()+1).padStart(2,'0')+'-'+String(d0.getDate()).padStart(2,'0');
  const tasks=Array.isArray(a.tasks)?a.tasks:[];
  task={id:'wxv4-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),
   name,category,estMinutes:estimate,firstTime:true,multiplier:1.3,
   plannedMinutes:estimate*1.3,weight:'mid',startMinutes:null,dueDate,dueTime:null,
   date,done:false,completedAt:null,order:tasks.filter(x=>x.date===date).length+1,
   createdAt:Date.now(),materials:[],aiScheduled:false};
  tasks.push(task);a.tasks=tasks;
 }
 const rawTextForRecord=rawText.slice(0,14000);
 const extractedLinks=(rawText.match(/(?:https?:\/\/|obsidian:\/\/)[^\s\])）<>"'，。；;]+/gi)||[]).map(x=>x.replace(/[),.，。；;]+$/,'')).filter((x,i,a)=>a.indexOf(x)===i).slice(0,20);
 const record={id:'wx-proof-'+Date.now().toString(36),
  taskId:String(task.id),taskName:String(task.name),groupQuery:(Q('#pmaw-group-query')?.value||'').trim(),
  messageQuery:(Q('#pmaw-message-query')?.value||'').trim(),
  selectedResult:lastCandidate?.label||'',
  text:rawTextForRecord,links:extractedLinks,fileId:d?.file?.id||null,proofId:selectedHistoryMessage?'history:'+String(selectedHistoryMessage.id||selectedHistoryMessage.time||Date.now()):'crop:'+String(d.file.id),historyMessageId:selectedHistoryMessage?.id||null,
  capturedAt:new Date().toISOString(),source:selectedHistoryMessage?'wechat-history':'windows-wechat-selected-region',
  ddlCandidate:(rawText.split(/\n/).find(x=>/DDL|截止|提交|deadline|明天|今晚/i.test(x))||'').slice(0,250),
  confirmedByUser:true};
 const prior=Array.isArray(a.wxTaskEvidence)?a.wxTaskEvidence:[];
 if(prior.some(x=>(x.proofId||('crop:'+String(x.fileId)))===record.proofId&&x.taskId===record.taskId))return notice('这条微信证据已经归入该任务，无须重复保存。');
 prior.unshift(record);a.wxTaskEvidence=prior.slice(0,180);
 if(extractedLinks.length){task.materials=Array.isArray(task.materials)?task.materials:[];extractedLinks.forEach(function(url){if(!task.materials.some(function(m){return (typeof m==='string'?m:m&&(m.url||m.href||m.link))===url}))task.materials.push({id:'wx-link-'+Date.now().toString(36)+'-'+task.materials.length,url:url,title:url,source:'wechat-message',readStatus:'pending',addedAt:Date.now()})});}
 window.SY.saveAcctData(a);taskOptions();
 Q('#pmaw-last-confirmed').textContent='已确认：'+task.name+' · 保存1条微信证据'+(extractedLinks.length?'，提取 '+extractedLinks.length+' 条链接并附加到任务资料':'')+'；DDL以实际截图和你手动填写为准。';
 setFlowStep(4);selectedHistoryMessage=null;notice('任务证据已关联到《'+task.name+'》。'+(create?'新任务已加入原有任务列表。':'没有更改该任务的原计划。'));
}

function updateNewTask(){
 const select=Q('#pmaw-existing-task'),fields=Q('#pmaw-new-task-fields');
 if(fields)fields.hidden=!!(select&&select.value&&select.value!=='new');
}
function taskOptions(){
 const select=Q('#pmaw-existing-task');
 if(!select||!window.SY||typeof window.SY.getAcctData!=='function')return;
 const current=select.value,acct=window.SY.getAcctData()||{};
 const tasks=(Array.isArray(acct.tasks)?acct.tasks:[]).slice().sort((a,b)=>{
  if(!!a.done!==!!b.done)return Number(!!a.done)-Number(!!b.done);
  return String(a.dueDate||a.date||'9999-12-31').localeCompare(String(b.dueDate||b.date||'9999-12-31'))||String(a.name||'').localeCompare(String(b.name||''));
 });
 select.replaceChildren();
 const add=(label,value)=>{const option=document.createElement('option');option.value=String(value);option.textContent=label;select.append(option);};
 add('\u65b0\u5efa\u4efb\u52a1\uff08\u6838\u5bf9\u540e\u52a0\u5165\u539f\u5217\u8868\uff09','new');
 tasks.forEach(t=>add(String(t.name||'\u672a\u547d\u540d\u4efb\u52a1')+' \u00b7 '+String(t.date||'\u672a\u6392\u671f')+(t.done?' \u00b7 \u5df2\u5b8c\u6210':''),t.id));
 select.value=tasks.some(t=>String(t.id)===current)?current:'new';
 updateNewTask();
}
function make(){
 const root=El('section','pmaw-mini');root.id='pmaw-mini';
 root.innerHTML=`<header class="pmaw-head"><div><strong>💬 微信任务收集</strong><p>只处理微信消息；识别后关联原任务。Obsidian、飞书和链接解析请前往独立的「资料中心」。</p></div><button type="button" id="pmaw-focus" class="pmaw-light">打开微信并框选 ↗</button></header><ol class="pmaw-flow" aria-label="微信任务处理流程"><li><b>1</b><span>找群</span></li><li><b>2</b><span>找消息</span></li><li><b>3</b><span>识别任务</span></li><li><b>4</b><span>关联确认</span></li></ol>
 <section class="pmaw-optional-search"><div class="pmaw-search-heading"><strong>搜索群名及群聊消息</strong><span>先查本机历史群目录；若不可用，再查当前微信窗口。置顶标记需按真实界面核对</span></div><div class="pmaw-filters"><label>群聊关键词<input id="pmaw-group-query" placeholder="例如：挑战杯、项目组"></label><button id="pmaw-search-groups">① 搜索群聊</button><label>群聊消息关键词<input id="pmaw-message-query" placeholder="先选群，再搜：DDL、PPT、老师反馈"></label><button id="pmaw-search-messages">② 搜索当前窗口消息</button></div>
 <div id="pmaw-results" class="pmaw-results"></div>
 <details id="pmaw-window-preview" class="pmaw-preview"><summary>查看微信窗口搜索画面（仅本机显示）</summary><img id="pmaw-search-image" alt="已登录微信窗口截图" hidden></details></section>
 <div class="pmaw-row"><button id="pmaw-crop" type="button" class="pmaw-main">手动框选微信内容（备用） →</button><span>切换群聊或打开微信文章时，浮窗跟随当前微信窗口；点确认后才识别。</span></div>
 <div id="pmaw-crop-slot"></div>
 <section id="pmaw-recognition" class="pmaw-recognition" hidden><h4>第 4 步 · 核对原文并关联任务</h4><pre id="pmaw-ocr"></pre>
 <div class="pmaw-form"><label>关联到哪个任务<select id="pmaw-existing-task"></select></label>
 <div id="pmaw-new-task-fields"><label>新任务名称（请核对）<input id="pmaw-taskname" placeholder="如：补比赛用户调研PPT"></label><label>所属类别<select id="pmaw-category"><option>比赛</option><option>运营</option><option>AI PM</option><option>考研</option><option>副业</option></select></label><label>预计分钟（请确认）<input type="number" id="pmaw-est-minutes" min="5" max="1200" value="30"></label><label>DDL（未确认就留空）<input type="date" id="pmaw-due-date"></label></div></div>
 <div class="pmaw-row"><button id="pmaw-analyze" type="button" class="pmaw-light">🤖 AI识别任务 / DDL / 链接</button><button id="pmaw-confirm" type="button" class="pmaw-main">确认关联任务 ✓</button></div>
 <p id="pmaw-last-confirmed" class="pmaw-note"></p></section>
 <p class="pmaw-status" id="pmaw-status" role="status">不扫描私聊数据库、不假装读取完整历史。关键词搜索基于当前微信窗口可见内容；AI识别后选择原有任务，只有你确认后才保存关联证据。</p>`;
 Q('#pmaw-focus',root).onclick=focus;
 Q('#pmaw-search-groups',root).onclick=()=>search('group');
 Q('#pmaw-search-messages',root).onclick=()=>search('message');
 Q('#pmaw-crop',root).onclick=crop;
 Q('#pmaw-analyze',root).onclick=analyzeCrop;
 Q('#pmaw-confirm',root).onclick=confirmTask;
 Q('#pmaw-existing-task',root).onchange=updateNewTask;
 root.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='pmaw-group-query'){e.preventDefault();search('group')}else if(e.key==='Enter'&&e.target.id==='pmaw-message-query'){e.preventDefault();search('message')}});
 return root;
}
function mount(){
 const target=Q('#wechatTaskMount');if(!target||Q('#pmaw-mini'))return;
 const mini=make();target.append(mini);
 const old=Q('#pma-wx-frame');
 if(old){Q('#pmaw-crop-slot',mini).append(old);old.open=false}
 taskOptions();
 Promise.all([historyApi('/status',{}),historyApi('/wechat/history-status',{retry:false})]).then(([x,h])=>{const parts=[];parts.push(x.available?'本机微信窗口可用':'本机微信窗口暂不可用');parts.push(h.phase==='directory_ready'||h.phase==='history_ready'?'历史群目录已就绪（'+h.groupCount+' 个群）':'历史目录状态：'+(h.error||h.phase||'待核验'));parts.push('目录不包含置顶标记；请按群名搜索并核对。');notice(parts.join(' · '),!x.available)}).catch(e=>notice('本机微信桥暂不可用：'+e.message+'。请确认本机服务已运行。',true));
}
document.addEventListener('sywx:crop-ready',e=>catchCrop(e.detail||{}));
new MutationObserver(()=>{if(Q('#wechatTaskMount')&&!Q('#pmaw-mini'))mount();else if(Q('#pmaw-mini')&&!Q('#pmaw-mini #pma-wx-frame')&&Q('#pma-wx-frame'))Q('#pmaw-crop-slot')?.append(Q('#pma-wx-frame'))}).observe(document.documentElement,{subtree:true,childList:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
// wechat-remote-direct-link: directly open the existing Knowledge view after the user's normal login.
if(location.hash.startsWith('#wechat-remote')){
 let done=false;
 const go=()=>{
  if(done||!window.SY?.currentAccountKey)return;
  if(!Q('#pmaw-mini')){
   window.SY.switchAppView?.('task-intake');
   return;
  }
  const mini=Q('#pmaw-mini');if(!mini)return;
  done=true;mini.scrollIntoView({behavior:'smooth',block:'start'});
  const input=Q('#pmaw-group-query');if(input)input.focus({preventScroll:true});
 };
 const timer=setInterval(()=>{if(done){clearInterval(timer);return}go()},1100);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go();
}
window.SYPMWeChatV4={mount,focus,search,crop,taskOptions,updateNewTask};
})();
