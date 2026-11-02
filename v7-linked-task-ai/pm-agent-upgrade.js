/* 上岸鸭：Obsidian 双击、真 API Agent、链接与多模态资料分析；不替换已有模块 */
(function(){
'use strict';if(window.SYPMUpgrade)return;
const $=(sel,root=document)=>root.querySelector(sel);
const E=(tag,cl,txt)=>{const node=document.createElement(tag);if(cl)node.className=cl;if(txt!==undefined)node.textContent=String(txt);return node};
let state={account:'',vault:null,providers:[],attachments:[],busy:false};
function owner(){return String(window.SY?.currentAccountKey||'')}
function load(){return window.SY?.getAcctData?.()||{}}
function materials(){let list=load().pmMaterialPool;return Array.isArray(list)?list:[]}
function save(list){if(!owner()){notice('先登录你的上岸鸭账号，才能保存资料',true);return false}let a=load();a.pmMaterialPool=list.slice(0,120);window.SY.saveAcctData(a);renderPool();return true}
function add(row){const list=materials(),i=list.findIndex(x=>x.id===row.id);if(i>=0)list[i]=row;else list.unshift(row);save(list);return true}
function showMaterial(row){
 const old=$('#pma-reading-dialog');if(old)old.remove();
 const dialog=E('dialog','pma-reader');dialog.id='pma-reading-dialog';
 const heading=E('header','pma-reader-head'),title=E('h2','',row.title||'资料原文');
 const exit=E('button','pma-link','关闭 ×');exit.onclick=()=>dialog.close();heading.append(title,exit);dialog.append(heading);
 const wrap=E('div','pma-reading-layout'),toc=E('nav','pma-reading-toc'),body=E('div','pma-reading-body');
 const sections=Array.isArray(row.outline)?row.outline:[];
 if(sections.length){
  toc.append(E('strong','','分级目录 · '+sections.length+' 节'));
  sections.slice(0,600).forEach((sec,i)=>{
   const level=Math.min(8,Math.max(1,Number(sec.level)||1));
   const anchor=E('button','pma-toc-level',''+sec.title);
   anchor.style.paddingLeft=(8+(level-1)*14)+'px';anchor.type='button';
   const section=E('section','pma-reader-section');section.id='pma-reader-'+i;
   const h=E('h3','',''+sec.title);section.append(h);
   if(sec.content)section.append(E('pre','pma-reader-text',sec.content));
   body.append(section);anchor.onclick=()=>section.scrollIntoView({block:'start',behavior:'smooth'});toc.append(anchor);
  });
 }else toc.append(E('p','','来源未提供可验证的分级标题，直接展示完整正文。'));
 const full=E('details','pma-reader-original'),sum=E('summary','','展开原始全文（不再压缩为摘要）');
 full.append(sum,E('pre','pma-reader-text',String(row.content||'')));
 full.open=!sections.length;body.append(full);
 wrap.append(toc,body);dialog.append(wrap);
 document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());
 if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');
}
function notice(msg,err=false){const x=$('#pma-message');if(x){x.textContent=msg;x.dataset.error=String(err)}}
function busy(v){state.busy=v;document.querySelectorAll('#pma-root button[data-working]').forEach(x=>x.disabled=v)}
async function api(path,data){
const options={method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},cache:'no-store'};
if(data!==undefined)options.body=JSON.stringify(data);
const c=new AbortController();const tid=setTimeout(()=>c.abort(),180000);options.signal=c.signal;
try{const r=await fetch(path,options);let obj=await r.json().catch(()=>({error:'服务器返回非JSON内容'}));if(!r.ok||obj?.error)throw Error(obj.error||'HTTP '+r.status);return obj}
finally{clearTimeout(tid)}
}
function getSelected(){let a=materials().filter(x=>x.selected!==false);let w=load().wxMaterialPool;if(Array.isArray(w))a=a.concat(w.filter(x=>x.selected!==false));return a.map(x=>({id:x.id,title:x.title,source:x.source,uploadId:x.uploadId,content:String(x.content||x.text||'').slice(0,20000)}))}
function renderPool(){
const root=$('#pma-root');if(!root)return;const host=$('#pma-pool'),pool=materials();host.replaceChildren();$('#pma-pool-n').textContent=pool.length+' 份';
if(!pool.length){host.append(E('p','pma-help','双击笔记、导入链接或文件后会出现在这里。'));return}
pool.slice(0,40).forEach(row=>{
const item=E('div','pma-material'),check=E('input');check.type='checkbox';check.checked=row.selected!==false;check.title='参与 AI 问答';check.onchange=()=>{let m=materials();let found=m.find(x=>x.id===row.id);if(found)found.selected=check.checked;save(m)};
const span=E('div'),name=E('strong','',row.title),desc=E('small','', (row.source||'资料')+' · '+String(row.content||'').slice(0,100));span.append(name,desc);
const remove=E('button','pma-link','移除');remove.type='button';remove.onclick=()=>save(materials().filter(x=>x.id!==row.id));const view=E('button','pma-link','分层阅读 / 全文');view.type='button';view.onclick=()=>showMaterial(row);item.append(check,span,view,remove);host.append(item)
})}
function renderNotes(){
const target=$('#pma-notes');if(!target)return;target.replaceChildren();const v=state.vault;
if(!v||!v.connected){target.append(E('p','pma-help',v?.error||'还没有连到本机知识库；请确认本机服务正在运行。'));return}
$('#pma-vault-status').textContent='已识别：'+v.name+' · '+v.count+' 篇 · '+(v.source==='last-opened'?'最近打开':'最近修改');
let launch=$('#pma-launch-obsidian');
 if(launch){launch.href='obsidian://open?vault='+encodeURIComponent(v.name)}
 const list=v.notes||[];
list.slice(0,25).forEach(n=>{
const button=E('button','pma-note');button.type='button';button.title='双击，把笔记正文加入蓝色资料池';button.dataset.working='1';
button.append(E('span','pma-note-icon','📄'),E('span','pma-note-name',n.title),E('small','',n.path));
button.ondblclick=async()=>{if(state.busy)return;busy(true);notice('正在读取《'+n.title+'》真实正文…');try{let d=await api('/api/pm/note',{path:n.path});add({id:'obsidian:'+d.path,source:'obsidian',title:d.title,content:d.content,selected:true,importedAt:new Date().toISOString(),sourceRef:d.path});notice('已加入资料池：'+d.title+'（'+d.chars+'字）');$('#pma-pool-zone').scrollIntoView({behavior:'smooth',block:'center'})}catch(e){notice('导入失败：'+e.message,true)}finally{busy(false)}};
target.append(button)})
}
function options(r){const p=r.providers||[];state.providers=p;const select=$('#pma-provider');select.replaceChildren();for(let o of p){if(!o.base)continue;const opt=E('option','',o.name||o.id);opt.value=o.id;select.append(opt)}let current=r.ai||{},found=p.find(x=>x.base===current.base);if(found)select.value=found.id;changeProvider(false);if(current.base)$('#pma-base').value=current.base;if(current.model)$('#pma-model').value=current.model;if(current.protocol)$('#pma-protocol').value=current.protocol;$('#pma-ai-status').textContent=current.verified?'模型已通过真实请求验证（'+current.model+'）':current.configured?'已配置但尚未验证（'+current.model+'）':'尚未连接真实 AI 模型'}
function changeProvider(clear=true){
const p=state.providers.find(x=>x.id===$('#pma-provider').value);if(!p)return;
$('#pma-base').value=p.base||'';$('#pma-protocol').value=p.protocol||'chat';
if(clear){$('#pma-model').value='';$('#pma-key').value=''}
let a=$('#pma-keylink');a.href=p.docs||'https://platform.openai.com/api-keys';a.textContent='打开服务商官方说明 / 申请 API Key ↗';
}
async function refresh(){
if(state.busy)return;busy(true);notice('正在核实本机服务和 Obsidian 知识库…');
try{let d=await api('/api/pm/status');state.vault=d.vault;renderNotes();options(d);notice('已检查本机状态。双击笔记即可导入真实正文。')}
catch(e){state.vault={connected:false,error:e.message};renderNotes();$('#pma-ai-status').textContent='本机后端未连接';notice('本机服务没有响应：'+e.message,true)}finally{busy(false)}
}
async function connectModel(){
if(state.busy)return;let base=$('#pma-base').value.trim(),model=$('#pma-model').value.trim(),key=$('#pma-key').value.trim(),protocol=$('#pma-protocol').value;
if(!base||!model)return notice('先选择服务商并填写真实模型 ID',true);
busy(true);notice('正在由本机后端向模型服务商发送真实测试请求，可能产生少量 API 费用…');
try{let d=await api('/api/pm/config',{base,model,key,protocol,keepKey:!key});$('#pma-ai-status').textContent=d.verified?'已真实连接：'+d.model:'尚未验证';notice(d.verified?'模型返回成功，已接通：'+d.model:'连接未通过，不能使用该模型');$('#pma-key').value=''}
catch(e){notice('API 测试失败：'+e.message,true);$('#pma-ai-status').textContent='测试失败 · 没有冒充成功'}
finally{busy(false)}
}
async function importLink(){
if(state.busy)return;let raw=$('#pma-url').value.trim(),url=window.SYSourceIO?(SYSourceIO.normalizeLinks(raw)[0]||''):raw;if(!url)return notice('先粘贴公开网页或飞书分享链接',true);
busy(true);notice('正在尝试读取真实网页正文，不会用虚假内容填充…');
try{let r=await api('/api/pm/url',{url});add({id:'url:'+url,source:'web',title:r.title,content:r.content,outline:r.outline||[],uploadId:r.uploadId,sourceRef:url,selected:true});notice(r.uploadId?r.note:('已取得 '+r.chars+' 字、'+(r.outline||[]).length+' 个标题层级节点。'+(r.note||'')+(r.truncated?'（来源返回内容已截断）':'')))}
catch(e){notice('链接无法读取：'+e.message+'；若页面要求登录，请上传文件或截图。',true)}finally{busy(false)}
}
async function upload(files){
if(!files?.length)return;busy(true);
try{
for(const f of files){
if(f.size>220*1024*1024){notice(f.name+' 超过220MB，请裁剪视频后上传',true);continue}
notice('正在上传并读取：'+f.name+' （'+Math.round(f.size/1048576*10)/10+'MB）');
const res=await fetch('/api/pm/file',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Upload-Name':encodeURIComponent(f.name)},body:f});
const payload=await res.json().catch(()=>({error:'上传响应格式错误'}));if(!res.ok||!payload.ok)throw Error(payload.error||'上传失败');
const doc=payload.file;state.attachments.push(doc);if(state.attachments.length>8)state.attachments.shift();
if(doc.kind==='document'&&doc.content)add({id:'file:'+doc.id,source:'file',title:doc.name,content:doc.content,outline:doc.outline||[],selected:true,importedAt:new Date().toISOString()});
notice('已处理：'+doc.name+'。'+(doc.note||''));renderAttachments();
}
}catch(e){notice('文件处理失败：'+e.message,true)}finally{busy(false)}
}
function renderAttachments(){let box=$('#pma-attachments');box.replaceChildren();for(let d of state.attachments){let item=E('span','pma-file-chip',d.name+' · '+(d.kind==='video'?'视频':d.kind==='image'?'图片':'文档'));let close=E('button','','×');close.title='从本次提问移除';close.onclick=()=>{state.attachments=state.attachments.filter(x=>x.id!==d.id);renderAttachments()};item.append(close);box.append(item)}}
function liveAccountContext(){
 if(!document.querySelector('#pmah-include-tasks')?.checked)return '';
 const a=load();
 const tasks=Array.isArray(a.tasks)?a.tasks:[];
 const rows=tasks.slice(0,30).map(x=>({
  task:String(x.name||x.title||'').slice(0,120),
  category:String(x.category||'').slice(0,50),
  date:String(x.date||'').slice(0,24),
  due:String(x.dueDate||'').slice(0,24),
  done:!!x.done,
  estimate:Number(x.estMinutes||x.plannedMinutes||0)
 })).filter(x=>x.task);
 const goals=[a.mainGoal,a.goal,a.currentGoal,a.longTermGoal].filter(x=>typeof x==='string'&&x.trim());
 return JSON.stringify({goals:goals.slice(0,4),tasks:rows},null,2).slice(0,8400)
}
function pastConversation(){
 const a=load();return(Array.isArray(a.pmAgentHistory)?a.pmAgentHistory:[]).slice(-4)
   .map(x=>'用户问题：'+String(x.question||'').slice(0,400)+'；上次建议：'+String(x.reply||'').slice(0,600));
}
function saveConversation(question,reply){
 const a=load(),items=Array.isArray(a.pmAgentHistory)?a.pmAgentHistory.slice(-7):[];
 items.push({at:new Date().toISOString(),question:question.slice(0,850),reply:reply.slice(0,1400)});
 a.pmAgentHistory=items;window.SY?.saveAcctData?.(a);
}
async function ask(){
if(state.busy)return;const q=$('#pma-question').value.trim();if(!q)return notice('先描述你遇到的卡点，越具体越容易解决',true);
busy(true);notice(document.querySelector('#pma-v3-transcribe')?.checked?'正在提取视频画面、识别语音，再交给 AI 分析；较长视频需要更多时间…':'正在根据选中的真实材料调用 AI；视频将按采样画面处理…');const output=$('#pma-answer');output.textContent='正在等待模型实际响应…';
try{
const ans=await api('/api/pm/ask',{question:q,materials:getSelected(),uploads:state.attachments.map(x=>x.id),transcribeVideo:!!document.querySelector('#pma-v3-transcribe')?.checked,accountContext:liveAccountContext(),conversationHistory:pastConversation()});
output.textContent=ans.reply;saveConversation(q,ans.reply);$('#pma-answer-extra').textContent='真实模型：'+ans.model+' · 附件画面：'+ans.frames+' 帧 · '+(ans.mediaNotes||[]).join('；')+' · '+(ans.transcripts||[]).map(x=>'语音转写 '+x.name+'：'+x.status).join('；')+' · '+(ans.generatedBy==='verified-workflow-fallback'?'模型偏题，已改用已验证操作指南':'模型原始回答');
notice('模型已经返回答案。可核对资料来源与附件处理说明。')
}catch(e){output.textContent='';$('#pma-answer-extra').textContent='';notice('AI 分析失败：'+e.message,true)}finally{busy(false)}
}
function make(){
const root=E('section','pma-root');root.id='pma-root';
root.innerHTML=`<header class="pma-head"><div><p>KNOWLEDGE → MATERIALS → AGENT</p><h2>📚 知识资料与 AI 卡点助手</h2><span>Obsidian 双击导入 · 真模型连接 · 文档/图片/视频/链接解析</span></div><button class="pma-ghost" id="pma-refresh" data-working>刷新真实连接状态</button></header>
<section class="pma-section"><div class="pma-section-title"><h3>① 我的 Obsidian 知识库</h3><span id="pma-vault-status">等待检查</span></div><p class="pma-help">打开你在 Obsidian 中使用的知识库。<b>在 Obsidian 软件中打开或双击笔记</b>，正文会自动进入蓝色资料池（下面的笔记列表也可双击导入）；无需重新挑选文件夹。</p><div class="pma-actions"><a id="pma-launch-obsidian" class="pma-ghost" href="obsidian://choose-vault">打开 Obsidian ↗</a><span class="pma-help">在 Obsidian 软件里打开 / 双击笔记，会自动加入下方蓝色资料池。</span></div><div id="pma-notes" class="pma-note-list"></div></section>
<section class="pma-section"><h3>② 读入卡点资料</h3><div class="pma-url"><input id="pma-url" placeholder="粘贴网页 / 飞书 / 课程链接"><button class="pma-primary" id="pma-url-btn" data-working>读取链接原文</button></div><label class="pma-upload">上传 PDF / Word / PPT / Excel / 图片 / MP4 / MOV / 文字 / 字幕<input id="pma-file" type="file" accept=".pdf,.doc,.docx,.pptx,.pptm,.xlsx,.xlsm,.md,.txt,.csv,.json,.srt,.vtt,.png,.jpg,.jpeg,.webp,.gif,.bmp,.mp4,.mov,.mkv,.webm" multiple></label><div id="pma-attachments" class="pma-attachments"></div><p class="pma-help">只处理你主动选择的文件。文档/视频单份限220MB；Office压缩包会检查解压体积，超限需拆分。超大扫描件建议先OCR或按章节拆分。视频提取关键帧交给支持视觉的模型，暂不自动识别视频里的语音。</p></section>
<section class="pma-vault" id="pma-pool-zone"><div class="pma-section-title"><h3>③ 蓝色资料池</h3><span id="pma-pool-n">0 份</span></div><div id="pma-pool"></div><p class="pma-help">勾选哪些资料交给 Agent；微信资料池已勾选的内容也会一起作为参考。</p></section>
<section class="pma-section"><div class="pma-section-title"><h3>④ 真实 AI 模型连接</h3><span id="pma-ai-status">尚未测试</span></div><div class="pma-fields"><label>服务商<select id="pma-provider"></select></label><label>模型 ID<input id="pma-model" placeholder="填写该服务商真实模型 ID"></label><label>API 基础地址<input id="pma-base" spellcheck="false"></label><label>API Key<input id="pma-key" type="password" autocomplete="new-password" placeholder="只在本机填写，不保存浏览器"></label><label>接口类型<select id="pma-protocol"><option value="chat">OpenAI 兼容 Chat</option><option value="anthropic">Anthropic Claude</option><option value="responses">OpenAI Responses</option></select></label></div><div class="pma-actions"><button id="pma-connect" class="pma-primary" data-working>测试真实连接并启用</button><a id="pma-keylink" href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">打开服务商官方说明 ↗</a></div><p class="pma-help">填写自己的 Key，测试时会真正发起一次推理请求（可能计费）。密钥仅在本机后端进程内存保留；重启需要重新配置，网页不存储完整密钥。</p></section>
<section class="pma-section"><h3>⑤ 卡住了？把问题交给 Agent</h3><textarea id="pma-question" rows="4" placeholder="上传当前作品、目标要求和优秀样品后，写：请对照三类材料，找出真正的创新机制差距，并给我一个可验证的下一步。"></textarea><div class="pma-actions"><button id="pma-ask" class="pma-primary" data-working>根据资料分析 · 生成定制步骤</button><button id="pma-innovation" type="button">样品 → 目标 → 创新差距诊断</button></div><p id="pma-message" role="status">等待读取实际知识库和模型状态。</p><pre id="pma-answer" class="pma-answer"></pre><p id="pma-answer-extra" class="pma-help"></p></section>`;
$('#pma-refresh',root).onclick=refresh;$('#pma-provider',root).onchange=()=>changeProvider();$('#pma-connect',root).onclick=connectModel;$('#pma-url-btn',root).onclick=importLink;$('#pma-file',root).onchange=e=>{upload([...e.target.files]);e.target.value=''};$('#pma-ask',root).onclick=ask;$('#pma-innovation',root).onclick=()=>{const q=$('#pma-question');q.value='请启动“样品—目标差距与创新性诊断”：先区分我的当前项目、目标/赛事要求、优秀样品/竞品和过程证据；逐项说明当前做到什么、目标缺什么、样品的可迁移机制是什么、哪些不能照搬；给出证据等级与来源定位，提出一个最优先创新假设，并为我的资源条件定制第一步、产物、验收标准和失败替代路径。没有证据的内容标记待验证，不要编造或保证获奖。';ask();};
const forms=[...root.querySelectorAll('.pma-section')];
 const modelBox=forms.find(x=>!!x.querySelector('#pma-connect'));
 if(modelBox){const details=E('details','pma-model-details');const summary=E('summary','','⚙ 模型设置（仅首次配置；已连接可直接提问）');modelBox.parentNode.insertBefore(details,modelBox);details.append(summary,modelBox)}
 return root
}
function mount(){
const body=$('#knowledgeBody'),account=owner();if(!body||!account){$('#pma-root')?.remove();state.account='';return}
if(state.account!==account){$('#pma-root')?.remove();state.account=account;state.attachments=[];state.vault=null}
if($('#pma-root'))return;state.obsidianSeq=null;
const root=make(),wechat=$('#sywx-root',body),toolbar=$('.sykv-toolbar',body);
if(wechat)wechat.insertAdjacentElement('afterend',root);else if(toolbar)toolbar.insertAdjacentElement('afterend',root);else body.prepend(root);
renderPool();refresh();
}
let scheduled=false;
function rerender(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;mount()})}
new MutationObserver(changes=>{if(changes.some(c=>!(c.target.closest&&c.target.closest('#pma-root'))))rerender()}).observe(document.documentElement,{subtree:true,childList:true});
document.addEventListener('sy:data',rerender);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',rerender);else rerender();
let obsidianPolling=false;
 async function pollObsidianOpen(){
  if(obsidianPolling||!$('#pma-root')||!owner())return;
  obsidianPolling=true;
  try{
   const after=state.obsidianSeq===null?0:state.obsidianSeq;
   const received=await api('/api/pm/events?after='+after);
   if(state.obsidianSeq===null){state.obsidianSeq=received.latest||0;return}
   state.obsidianSeq=Math.max(state.obsidianSeq,received.latest||0);
   for(const event of received.events||[]){
     if(!event.path)continue;
     try{
      const d=await api('/api/pm/note',{path:event.path});
      add({id:'obsidian:'+d.path,source:'obsidian',title:d.title,content:d.content,selected:true,
        importedAt:new Date().toISOString(),sourceRef:d.path});
      notice('Obsidian 软件已打开笔记，正文自动加入蓝色资料池：'+d.title+'（'+d.chars+'字）');
     }catch(err){notice('Obsidian 同步失败：'+err.message,true)}
   }
  }catch(err){}finally{obsidianPolling=false}
 }
 setInterval(pollObsidianOpen,1500);
 // Marketing buttons are re-rendered after initial event binding; ensure they still open the real login.
 document.addEventListener('click',event=>{
   const trigger=event.target.closest?.('[data-open-login]');
   if(!trigger)return;
   const layer=$('#loginOverlay');
   if(layer && layer.hidden){layer.hidden=false;document.body.style.overflow='hidden';layer.querySelector('.tab-btn')?.focus()}
 },true);
 window.SYPMUpgrade={getMaterials:materials,getSelected:getSelected,refresh:refresh,
   showMaterial,addExternalMaterial:add,addExternalAttachment:d=>{state.attachments.push(d);renderAttachments()}};
})();