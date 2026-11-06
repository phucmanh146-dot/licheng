(function(){
'use strict';
const $=(s)=>document.querySelector(s),$$=(s)=>[...document.querySelectorAll(s)];
const STORAGE='shanganya_p2_chat_history_v1';
let threads=[],activeId='',files=[],urls=[],uploading=0,pendingThreads=new Set(),videoIntent=false;
function status(t,bad=false){const n=$('#p2-status');n.textContent=t||'';n.classList.toggle('error',!!bad);}
function uid(){return 'p2-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);}
function current(){return threads.find(t=>t.id===activeId);}
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify({threads:threads.slice(0,50),activeId}));}catch(e){status('本地浏览器无法保存对话：请检查磁盘剩余空间。',true);}}
function draw(){P2View.renderThreads(threads,activeId,selectChat,deleteChat,renameChat);P2View.renderMessages(current());drawAttachments();syncComposer();}
function accountIdForAgent(){let sy=window.SY;try{if(!sy&&window.parent&&window.parent!==window)sy=window.parent.SY;}catch(_){}return String(sy&&sy.currentAccountKey||'default');}
async function runAgentNow(){
 const textarea=$('#p2-text'),question=textarea.value.trim(),active=current();
 if(active&&pendingThreads.has(active.id))return status('\u5f53\u524d\u5bf9\u8bdd\u7684 Agent \u6b63\u5728\u6267\u884c\uff0c\u8bf7\u7b49\u5f85\u6216\u5207\u6362\u5230\u5176\u4ed6\u5bf9\u8bdd\u3002',true);
 if(!question)return status('\u5148\u63cf\u8ff0\u8981\u4ea4\u7ed9 Agent \u6267\u884c\u7684\u76ee\u6807\u6216\u95ee\u9898\u3002',true);
 if(uploading)return status('\u9644\u4ef6\u4ecd\u5728\u4e0a\u4f20\uff0c\u5b8c\u6210\u540e\u518d\u542f\u52a8 Agent\u3002',true);
 const agentContext=await liveAgentContext(),thread=current()||newChat(),requestId=uid(),accountId=accountIdForAgent();
 const agentFileIds=files.filter(x=>x&&x.id&&!x.loading).map(x=>x.id).slice(0,8);let agentUrls;try{agentUrls=questionLinks(question);}catch(e){return status(e.message,true);}const selectedWorkbenchTaskId=$('#p2-task-context')?.value||'';
 let agentTaskId=thread.agentTaskId||'',recoveryNote='';
 if(!agentTaskId){
  try{
   const prior=await jsonApi('/api/agent/tasks?accountId='+encodeURIComponent(accountId),undefined,15000);
   if((prior.tasks||[]).length){
    const recovered=await jsonApi('/api/agent/recover-intent',{intent:question,accountId,sessionId:thread.id},60000);
    if(recovered.task&&recovered.task.id){agentTaskId=recovered.task.id;thread.agentTaskId=agentTaskId;recoveryNote='Recovered previous Agent task: '+(recovered.task.title||agentTaskId);}
   }
  }catch(_){}
 }
 const user={role:'user',content:question+'\n\n[\u5df2\u4ea4\u7ed9\u6267\u884c Agent]',files:files.filter(x=>x&&x.id&&!x.loading).map(x=>x.name)};
 pendingThreads.add(thread.id);thread.pendingRequestId=requestId;thread.messages.push(user);
 const pendingMessage={role:'assistant',content:'Agent \u6b63\u5728\u6062\u590d\u5386\u53f2\u4e0a\u4e0b\u6587\u3001\u8bfb\u53d6\u672c\u8f6e\u9644\u4ef6\u4e0e\u8d44\u6599\u3001\u6267\u884c\u5141\u8bb8\u7684\u5de5\u5177\u5e76\u4fdd\u5b58\u68c0\u67e5\u70b9\u3002\u4f60\u53ef\u4ee5\u5207\u6362\u5176\u4ed6\u5bf9\u8bdd\uff0c\u7ed3\u679c\u4f1a\u4fdd\u7559\u5728\u5f53\u524d\u4efb\u52a1\u3002',pending:true,requestId};
 thread.messages.push(pendingMessage);if(thread.title==='New chat')thread.title=question.slice(0,28);
 persist();syncComposer();draw();status('Agent \u5df2\u542f\u52a8\uff1a\u6b63\u5728\u8bfb\u53d6\u4e0a\u4e0b\u6587\u3001\u5904\u7406\u8d44\u6599\u5e76\u4fdd\u5b58\u6267\u884c\u73b0\u573a\u3002');
 try{
  const payload={question,taskId:agentTaskId,createTask:!agentTaskId,taskTitle:question.slice(0,80),sessionId:thread.id,accountId,fileIds:agentFileIds,urls:agentUrls,workbenchContext:{liveAgentContext:agentContext,selectedWorkbenchTaskId,attachedFiles:files.filter(x=>x&&x.id).map(x=>({id:x.id,name:x.name,type:x.type})).slice(0,8)}};
  const r=await jsonApi('/api/agent/run',payload,180000);
  if(r.taskId)thread.agentTaskId=r.taskId;
  const toolSummary=(r.toolCalls||[]).map(x=>(x.ok?'[OK] ':'[FAILED] ')+x.tool+(x.error?': '+x.error:'')).join('\n');
  const content=[recoveryNote,r.answer||'Agent \u672a\u8fd4\u56de\u6700\u7ec8\u7ed3\u679c\u3002',r.nextStep?'\u4e0b\u4e00\u6b65\uff1a'+r.nextStep:'',r.blocker?'\u963b\u585e\uff1a'+r.blocker:'',toolSummary?'\u5b9e\u9645\u6267\u884c\u7684\u5de5\u5177\uff1a'+toolSummary:'\u672c\u8f6e\u4e0d\u9700\u8c03\u7528\u5916\u90e8\u5de5\u5177','Agent \u4efb\u52a1 ID\uff1a'+(r.taskId||'\u672a\u521b\u5efa')].filter(Boolean).join('\n\n');
  const pos=thread.messages.indexOf(pendingMessage),answer={role:'assistant',content,agentRun:true,taskId:r.taskId,toolCalls:r.toolCalls||[],blocker:r.blocker||'',nextStep:r.nextStep||'',workbenchActions:Array.isArray(r.workbenchActions)?r.workbenchActions:[]};
  if(pos>=0)thread.messages.splice(pos,1,answer);else thread.messages.push(answer);
  thread.pendingRequestId=null;persist();if(activeId===thread.id){textarea.value='';draw();status(r.blocker?'Agent \u5df2\u8bb0\u5f55\u963b\u585e\u70b9\uff0c\u5904\u7406\u540e\u53ef\u4ece\u68c0\u67e5\u70b9\u7ee7\u7eed\u3002':'Agent \u672c\u8f6e\u6267\u884c\u7ed3\u675f\uff0c\u7ed3\u679c\u548c\u68c0\u67e5\u70b9\u5df2\u4fdd\u5b58\u3002');}else{draw();status('Agent \u5df2\u5b8c\u6210\u672c\u8f6e\uff0c\u7ed3\u679c\u5df2\u4fdd\u5b58\u5230\u5bf9\u5e94\u5bf9\u8bdd\u3002');}
 }catch(e){
  const pos=thread.messages.indexOf(pendingMessage);if(pos>=0)thread.messages.splice(pos,1,{role:'assistant',content:'Agent \u6267\u884c\u5931\u8d25\uff1a'+e.message+'\n\n\u539f\u59cb\u8bf7\u6c42\u5df2\u4fdd\u7559\uff0c\u6392\u9664\u963b\u585e\u540e\u53ef\u7ee7\u7eed\u91cd\u8bd5\u3002',error:true,agentRun:true});
  thread.pendingRequestId=null;persist();if(activeId===thread.id){draw();status('Agent \u6267\u884c\u5931\u8d25\uff1a'+e.message,true);}else{draw();status('\u5176\u4ed6\u5bf9\u8bdd\u4e2d\u7684 Agent \u6267\u884c\u5931\u8d25\uff1a'+e.message,true);}
 }finally{pendingThreads.delete(thread.id);if(thread.pendingRequestId===requestId)thread.pendingRequestId=null;persist();syncComposer();}
}

window.P2AgentActionHandler=async function(action){
 let sy=window.SY;try{if(!sy&&window.parent&&window.parent!==window)sy=window.parent.SY;}catch(_){}
 let rules=window.SYAutoloopRules;try{if(!rules&&window.parent&&window.parent!==window)rules=window.parent.SYAutoloopRules;}catch(_){}
 if(!sy||!rules||!rules.applyAgentAction)throw new Error('????? Agent ????????');
 const risky=['replan','create_task','move_to_buffer','mark_awaiting_evidence'].includes(action.type);
 if(risky&&!window.confirm('?????? Agent ????\\n\\n'+(action.title||action.nextStep||action.reason||action.type)))throw new Error('???????');
 const result=rules.applyAgentAction(action);
 try{if(sy.renderListView)sy.renderListView();if(sy.renderDailyView)sy.renderDailyView();}catch(_){}
 return result;
};
function syncComposer(){const thread=current(),pending=!!(thread&&pendingThreads.has(thread.id)),btn=$('#p2-send'),agent=$('#p2-agent-run');if(btn){btn.disabled=pending||uploading>0;btn.textContent=pending?'\u23f3':'\u2191';}if(agent){agent.disabled=pending||uploading>0;agent.textContent=pending?'Agent \u6267\u884c\u4e2d\u2026':'Agent \u6267\u884c';}if(pending)status('Agent \u6b63\u5728\u5904\u7406\u8fd9\u6761\u5bf9\u8bdd\u3002\u4f60\u53ef\u4ee5\u5207\u6362\u5230\u5176\u4ed6\u5bf9\u8bdd\u6216\u5148\u505a\u4e0b\u4e00\u9879\uff1b\u7ed3\u679c\u4f1a\u4fdd\u7559\u5728\u8fd9\u91cc\u3002');}
function drawAttachments(){P2View.renderAttachments(files,urls,removeFile,removeUrl);}
function removeFile(file){if(file.preview)URL.revokeObjectURL(file.preview);files=files.filter(x=>x!==file);drawAttachments();}
function removeUrl(url){urls=urls.filter(x=>x!==url);drawAttachments();}
function clearMedia(){files.forEach(f=>{if(f.preview)URL.revokeObjectURL(f.preview);});files=[];urls=[];videoIntent=false;drawAttachments();}
function newChat(){clearMedia();const t={id:uid(),title:'新对话',messages:[],createdAt:Date.now()};threads.unshift(t);activeId=t.id;persist();draw();$('#p2-text').focus();status('已新建对话。其他对话中的 AI 可以继续后台处理，不需要等待。');return t;}
function selectChat(id){if(!threads.some(t=>t.id===id))return;clearMedia();activeId=id;const t=current();if(t&&t.unreadResult){t.unreadResult=false;t.title=String(t.title||'').replace(/^DONE:\s*/, '');persist();}persist();draw();$('#p2-side').classList.remove('open');}
function deleteChat(id){if(pendingThreads.has(id))return status('这条对话的 AI 仍在处理，暂不能删除；可以先切换到其他任务。',true);if(!confirm('删除此对话的本机历史记录？'))return;threads=threads.filter(x=>x.id!==id);if(activeId===id)activeId=threads[0]?.id||'';if(!activeId){newChat();return;}persist();draw();}
function renameChat(id){const t=threads.find(x=>x.id===id);if(!t)return;const title=prompt('重命名对话',t.title);if(!title?.trim())return;t.title=title.trim().slice(0,70);persist();draw();}
function restore(){try{const data=JSON.parse(localStorage.getItem(STORAGE)||'{}');threads=Array.isArray(data.threads)?data.threads.filter(x=>x&&Array.isArray(x.messages)).slice(0,50):[];activeId=data.activeId||'';}catch(e){}threads.forEach(function(t){t.messages=t.messages.map(function(m){if(m&&m.pending)return{role:'assistant',content:'上次页面关闭或刷新时，中断了正在等待的 AI 请求。原问题仍保留；请回到输入框重新发送。',error:true};return m;});t.pendingRequestId=null;});if(!threads.length){newChat();return;}if(!threads.some(t=>t.id===activeId))activeId=threads[0].id;draw();}
async function jsonApi(url,data,timeout=155000){const ctrl=new AbortController(),tm=setTimeout(()=>ctrl.abort(),timeout);try{const r=await fetch(url,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:ctrl.signal,cache:'no-store'});const j=await r.json().catch(()=>({error:'接口未返回有效 JSON'}));if(!r.ok||j.error)throw Error(j.error||'HTTP '+r.status);return j;}finally{clearTimeout(tm);}}
async function checkStatus(){try{const r=await jsonApi('/api/p2/status',undefined,16000),ai=r.ai||{},roles=r.modelTeam?.roles||{},active=Object.values(roles).filter(x=>x.configured).length,suffix=active?' · '+active+'个专家模型':'';$('#p2-model-status').textContent=(ai.verified?'● 已验证：'+ai.model:ai.configured?'○ 模型尚未验证：'+ai.model:'● 尚未连接模型，请配置 API')+suffix;$('#p2-model-status').style.color=ai.verified?'#377951':'#a66a32';}catch(e){$('#p2-model-status').textContent='● 本机后端不可用：'+e.message;$('#p2-model-status').style.color='#b85247';}}
async function uploadFile(file){if(!file.size)return;if(file.size>220*1024*1024)return status(file.name+' 超过220MB限制。',true);const entry={name:file.name,type:file.type||'',id:null,loading:true,preview:file.type.startsWith('image/')?URL.createObjectURL(file):null};files.push(entry);drawAttachments();uploading++;status('正在读取真实文件：'+file.name);
try{const ctrl=new AbortController(),tm=setTimeout(()=>ctrl.abort(),100000);let r;try{r=await fetch('/api/pm/file',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Upload-Name':encodeURIComponent(file.name)},body:file,signal:ctrl.signal});}finally{clearTimeout(tm);}const data=await r.json().catch(()=>({error:'接口没有返回文件结果'}));if(!r.ok||!data.ok)throw Error(data.error||'HTTP '+r.status);entry.id=data.file?.id;entry.loading=false;if(!entry.id)throw Error('没有取得文件ID');status('文件已上传，解析状态待确认：'+file.name+(data.file?.content?'（已提取文字 '+data.file.content.length+' 字）':'（尚未验证图像/视频内容）'));}
catch(e){removeFile(entry);status('文件上传失败：'+file.name+' · '+e.message,true);}finally{uploading--;drawAttachments();}}
async function uploadBatch(batch){for(const file of [...batch])await uploadFile(file);}
async function liveAgentContext(){let rules=window.SYAutoloopRules,loop=window.SYAutoloop;try{if(window.parent&&window.parent!==window){rules=rules||window.parent.SYAutoloopRules;loop=loop||window.parent.SYAutoloop;}}catch(_){}let state=null,durable=null;try{state=rules&&rules.contextForAI?rules.contextForAI():null;}catch(_){}try{durable=loop&&loop.getAgentContext?await loop.getAgentContext():null;}catch(_){}return [state?'[Live workbench Agent state] '+JSON.stringify(state):'',durable?'[Cross-session durable events and checkpoints] '+JSON.stringify(durable):''].filter(Boolean).join(String.fromCharCode(10,10));}
function questionLinks(question){const found=question.match(/https?:\/\/[^\s<>\]\uFF09\u3002\uFF0C\uFF1B]+/g)||[];const result=[...urls];for(let value of found){value=value.replace(/[).,;!?]+$/,'');try{const u=new URL(value);if(!u.username&&!u.password&&!result.includes(u.href))result.push(u.href);}catch{}}if(result.length>20)throw Error('本次包含超过20个链接，请按群聊或关键词分批提交；已明确提示，不会静默跳过链接。');return result;}
$('#p2-text').addEventListener('paste',e=>{const pasted=[...(e.clipboardData?.items||[])].filter(x=>x.kind==='file').map(x=>x.getAsFile()).filter(Boolean);if(pasted.length){e.preventDefault();uploadBatch(pasted);}});
async function send(){const textarea=$('#p2-text'),question=textarea.value.trim();const active=current();if(active&&pendingThreads.has(active.id))return status('当前对话仍在生成。你可以新建/切换对话处理下一项，不必等待。');if(!question)return status('请输入问题。',true);if(uploading)return status('附件还在上传，请等文件处理完成。',true);const wechat=window.P2WechatAI?.getPendingContext?.()||null;let requestUrls;try{requestUrls=questionLinks(question+'\n'+($('#p2-task-context')?.value||''));if(wechat){requestUrls=[...new Set([...requestUrls,...(Array.isArray(wechat.urls)?wechat.urls:[])])];if(requestUrls.length>20)throw Error('本轮合并后超过20个链接，请缩小微信消息范围或分批分析；不会静默跳过链接。');}}catch(e){return status(e.message,true);}const agentContext=await liveAgentContext();const thread=current()||newChat();const ready=files.filter(x=>x.id);const history=thread.messages.slice(-12).map(m=>({role:m.role,content:m.content})).filter(x=>['user','assistant'].includes(x.role));const user={role:'user',content:question+(wechat?'\n\n【已关联微信原始数据：'+wechat.group+'，'+wechat.messages.length+'条】':''),files:ready.map(x=>x.name)};const payload={question,history,fileIds:ready.map(x=>x.id),urls:requestUrls,deep:$('#p2-deep').checked,search:$('#p2-search').checked,transcribeVideo:!!$('#p2-transcribe')?.checked,videoAnalysis:videoIntent||ready.some(x=>/\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(x.name))||requestUrls.some(x=>/(youtube\.com|youtu\.be|bilibili\.com|b23\.tv|douyin\.com|vimeo\.com)/i.test(x)),taskContext:[($('#p2-task-context')?.value||'').trim(),agentContext].filter(Boolean).join(String.fromCharCode(10,10)).slice(0,12000),wechatAnalysis:!!wechat,wechatGroup:wechat?.group||'',wechatMessages:wechat?.messages||[],wechatPrompt:wechat?.prompt||''};const requestId=uid();pendingThreads.add(thread.id);thread.pendingRequestId=requestId;thread.messages.push(user);const pendingMessage={role:'assistant',content:'⏳ AI 正在处理这条任务。你可以切换到其他对话或先做下一项；结果完成后会保留在这里。',pending:true,requestId};thread.messages.push(pendingMessage);if(thread.title==='新对话')thread.title=question.slice(0,28);persist();window.P2WechatAI?.clearPendingContext?.();syncComposer();draw();
try{const r=await jsonApi('/api/p2/ask',payload,180000);const pos=thread.messages.indexOf(pendingMessage);const answer={role:'assistant',content:r.reply,model:r.model,modelRole:r.modelRole||'general',modelFallback:!!r.modelFallback,mode:r.mode,sources:r.sources||[],sourceDocuments:r.sourceDocuments||[],searchError:r.searchError||'',media:r.media||[],transcripts:r.transcripts||[]};if(pos>=0)thread.messages.splice(pos,1,answer);else thread.messages.push(answer);thread.pendingRequestId=null;if(activeId!==thread.id){thread.unreadResult=true;thread.title='DONE: '+String(thread.title||question.slice(0,28)).replace(/^DONE:\s*/,'');}persist();if(activeId===thread.id){textarea.value='';videoIntent=false;clearMedia();draw();const failed=(r.sourceDocuments||[]).filter(x=>x.status&&!['read','sampled-frames'].includes(x.status));const videoNotes=(r.sourceDocuments||[]).filter(x=>x.status==='sampled-frames').map(x=>x.note||'已读取采样画面');const speech=(r.transcripts||[]).map(x=>'语音：'+x.status+(x.note?'，'+x.note:''));const mediaFailures=(r.media||[]).filter(x=>['image','video','video-link'].includes(x.type)&&!(Number(x.frames)>0)).map(x=>(x.name||x.type)+' 未提取到有效画面，不能视为已解析'+(x.warning?'：'+x.warning:''));status('模型已实际回答。角色：'+({general:'主模型',reasoning:'深度推理',research:'联网研究',vision:'视觉理解',coding:'代码分析'}[r.modelRole||'general']||'主模型')+(r.modelFallback?'（专家模型失败，已回退主模型）':'')+'。'+(r.usedWechat?'已关联微信原始消息 '+r.wechatMessageCount+' 条。':'')+[...videoNotes,...speech,...mediaFailures].join('；')+(r.searchError?' 搜索受限：'+r.searchError:'')+(failed.length?' '+failed.length+' 条提交的链接未读到正文，请打开原文或上传文档。':''),failed.length>0||mediaFailures.length>0);}else{draw();status('AI 已完成上一项任务的回答。已保存到带 ✓ 的对话中，你可以继续当前任务。');}}catch(e){const pos=thread.messages.indexOf(pendingMessage);if(pos>=0)thread.messages.splice(pos,1,{role:'assistant',content:'本次回答失败：'+e.message+'。原问题已保留在本对话中，可回到这里重试。',error:true});thread.pendingRequestId=null;persist();if(activeId===thread.id){draw();textarea.value=question;status('本次回答失败：'+e.message+'。问题已保留，可重试。',true);}else{draw();status('上一项 AI 处理失败；原问题已保留在对应对话中。',true);}}finally{pendingThreads.delete(thread.id);if(thread.pendingRequestId===requestId)thread.pendingRequestId=null;persist();syncComposer();}}
function showDialog(id){const d=$(id);if(d&&!d.open)d.showModal();}
function addUrl(){const input=$('#p2-link-input'),raw=input.value.trim();try{const normalized=window.SYSourceIO?.normalizeLinks(raw)?.[0]||raw;const u=new URL(normalized);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('地址不合法');if(urls.includes(u.href))return $('#p2-link-status').textContent='这条链接已经加入';if(urls.length>=20)return $('#p2-link-status').textContent='一次最多20个网页链接；更多链接请分批提交';urls.push(u.href);drawAttachments();input.value='';$('#p2-link-dialog').close();status('链接已加入，发送时会实际读取网页正文。');}catch(e){$('#p2-link-status').textContent='请输入完整有效的 https:// 网址';}}
$('#p2-new').onclick=newChat;$('#p2-open-side').onclick=()=>$('#p2-side').classList.toggle('open');$('#p2-close-side').onclick=()=>$('#p2-side').classList.remove('open');
$('#p2-form').onsubmit=e=>{e.preventDefault();send();};const agentRunButton=$('#p2-agent-run');if(agentRunButton)agentRunButton.onclick=runAgentNow;$('#p2-files').onchange=e=>{uploadBatch(e.target.files);e.target.value='';};$('#p2-add-url').onclick=()=>showDialog('#p2-link-dialog');$('#p2-confirm-link').onclick=addUrl;
function askObsidianLink(){
 return new Promise(resolve=>{
  const d=document.createElement('dialog');d.className='p2-dialog';d.setAttribute('aria-labelledby','p2-obsidian-link-title');
  const title=document.createElement('h2');title.id='p2-obsidian-link-title';title.textContent='添加 Obsidian 笔记';
  const intro=document.createElement('p');intro.textContent='粘贴 Obsidian 分享链接。只有成功读取到笔记正文后，内容才会加入当前 AI 对话；不会仅凭链接假装读取成功。';
  const label=document.createElement('label');label.textContent='Obsidian 笔记链接';
  const input=document.createElement('input');input.type='text';input.autocomplete='off';input.spellcheck=false;input.placeholder='obsidian://open?vault=…&file=…';input.setAttribute('aria-label','Obsidian 笔记链接');label.append(input);
  const note=document.createElement('p');note.className='p2-small';note.textContent='如果没有分享链接，可取消后从工作台知识库选择笔记，或上传 Markdown 文件。';
  const actions=document.createElement('div');actions.className='p2-dialog-actions';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';
  const confirm=document.createElement('button');confirm.type='button';confirm.className='p2-send';confirm.textContent='读取并加入对话';
  actions.append(cancel,confirm);d.append(title,intro,label,note,actions);document.body.append(d);
  let settled=false;
  function finish(value){if(settled)return;settled=true;try{d.close()}catch(_){}d.remove();resolve(value);}
  cancel.addEventListener('click',()=>finish(''));
  confirm.addEventListener('click',()=>finish(input.value.trim()));
  d.addEventListener('cancel',event=>{event.preventDefault();finish('');});
  input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();finish(input.value.trim());}});
  d.addEventListener('close',()=>finish(''));
  d.showModal();requestAnimationFrame(()=>input.focus());
 });
}
async function readObsidianIntoChat(){
 const raw=await askObsidianLink();
 if(!raw||!raw.trim()){status('未提供 Obsidian 笔记链接；没有读取任何内容。');return;}
 let io=window.SYSourceIO;
 try{if(window.parent&&window.parent!==window&&window.parent.SYSourceIO)io=window.parent.SYSourceIO;}catch(e){}
 if(!io||typeof io.prepareLink!=='function')return status('Obsidian 读取组件不可用。可从原工作台知识库打开笔记，或上传 Markdown 文件。',true);
 status('正在读取 Obsidian 笔记正文…');
 Promise.resolve(io.prepareLink(raw.trim())).then(async doc=>{
   const body=typeof io.toMarkdown==='function'?io.toMarkdown(doc):String(doc.text||doc.content||'');
   if(!body.trim())throw Error('已打开链接，但没有取得笔记正文。');
   await window.P2App.attachText(doc.title||doc.name||'Obsidian 笔记',body);
   status('已取得 Obsidian 笔记正文并加入本轮附件；请确认问题后发送。');
 }).catch(e=>status('Obsidian 读取失败：'+(e&&e.message||e)+'。没有把链接冒充成正文。',true));
}
function openSourceShortcut(target){
 if(target==='feishu'){const b=$('#p2-feishu-quick-read');if(b)b.click();return;}
 if(target==='obsidian'){readObsidianIntoChat();return;}
 if(target==='wechat'){const b=$('#p2-wechat-open');if(b)b.click();return;}
 const examples={
  '公众号':'https://mp.weixin.qq.com/…',
  '视频号':'粘贴你可访问的视频号分享链接',
  '小红书':'https://www.xiaohongshu.com/…',
  '抖音':'https://www.douyin.com/…',
  'B站':'https://www.bilibili.com/video/…',
  'YouTube':'https://www.youtube.com/watch?v=…',
  '网页':'https://…'
 };
 const input=$('#p2-link-input'),hint=$('#p2-link-hint');
 if(input)input.placeholder=examples[target]||'https://…';
 if(hint)hint.textContent='来源：'+target+'。粘贴分享链接后，系统会尝试读取公开可访问的正文、字幕或视频信息；需要登录或平台限制导致读取失败时会如实提示。';
 showDialog('#p2-link-dialog');
 if(input)input.focus();
}
$$('.p2-source-shortcut').forEach(b=>b.addEventListener('click',()=>openSourceShortcut(b.dataset.sourceTarget||'网页')));
$('#p2-feishu-quick-read').onclick=()=>{const input=$('#p2-feishu-test-url');if(input&&!input.value.trim())input.value='https://tcnb3a3fuvtb.feishu.cn/wiki/YD6HwHCS5iXlgmkpLOoccnvon7b';const cfg=$('#p2-open-config');if(cfg)cfg.click();const settings=$('#p2-feishu-settings');if(settings)settings.open=true;const read=$('#p2-feishu-desktop-read');if(read){status('正在读取指定飞书文档；只有读到真实正文后才会加入当前 AI 对话…');read.click();}else{status('请在配置 / 测试 API 中打开飞书设置并检查读取桥接。',true);}};
$('#p2-video-analyze').onclick=()=>{const hasVideo=files.some(x=>/\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(x.name));if(hasVideo){videoIntent=true;const box=$('#p2-text');if(!box.value.trim())box.value='请对本轮上传的视频进行结构化解析：按视频顺序概括场景变化、人物/物体动作、画面中的文字和关键细节；区分直接观察与推测，并说明抽帧、清晰度或未转写语音造成的限制。不要编造时间戳或声称听过未转写的音频。';box.dispatchEvent(new Event('input',{bubbles:true}));box.focus();status('已切换为视频解析提问。确认问题后点击发送；勾选“同时转写语音”才会尝试音频转写。');return;}$('#p2-video-files').click();};
$('#p2-video-files').onchange=async e=>{const batch=[...e.target.files];e.target.value='';if(!batch.length)return;videoIntent=true;await uploadBatch(batch);const box=$('#p2-text');if(!box.value.trim())box.value='请对本轮上传的视频进行结构化解析：按视频顺序概括场景变化、人物/物体动作、画面中的文字和关键细节；区分直接观察与推测，并说明抽帧、清晰度或未转写语音造成的限制。不要编造时间戳或声称听过未转写的音频。';box.dispatchEvent(new Event('input',{bubbles:true}));box.focus();};
$('#p2-text').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send();}};
$('#p2-text').oninput=e=>{e.target.style.height='auto';e.target.style.height=Math.min(170,Math.max(60,e.target.scrollHeight))+'px';};
$('.p2-prompts button').forEach(button=>button.onclick=()=>{const box=$('#p2-text');box.value=button.dataset.q||'';if(button.dataset.web)$('#p2-search').checked=true;if(button.dataset.video){$('#p2-video-files').click();}box.focus();});
$('#p2-form').ondragover=e=>{if([...e.dataTransfer?.types||[]].includes('Files'))e.preventDefault();};$('#p2-form').ondrop=e=>{if(e.dataTransfer?.files?.length){e.preventDefault();uploadBatch(e.dataTransfer.files);}};
async function attachText(name,text){const safeName=(String(name||'飞书文档').replace(/[\\/:*?"<>|]/g,'_').slice(0,90)||'飞书文档')+'.txt';await uploadFile(new File([String(text||'')],safeName,{type:'text/plain;charset=utf-8'}));if(!files.some(x=>x.name===safeName&&x.id))throw Error('文档正文已读取，但上传为对话附件失败。');const box=$('#p2-text');if(!box.value.trim())box.value='请基于刚读取的飞书文档，先梳理内容目录、关键问题，再按优先级给出可执行的修改方案。';box.dispatchEvent(new Event('input',{bubbles:true}));}
window.P2App={api:jsonApi,checkStatus,showDialog,attachText};restore();checkStatus();
})();

