(function(){
'use strict';
const $=(s)=>document.querySelector(s),$$=(s)=>[...document.querySelectorAll(s)];
const STORAGE='shanganya_p2_chat_history_v1';
let threads=[],activeId='',files=[],urls=[],uploading=0,sending=false,videoIntent=false,browserVault=null;
function status(t,bad=false){const n=$('#p2-status');n.textContent=t||'';n.classList.toggle('error',!!bad);}
function uid(){return 'p2-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);}
function current(){return threads.find(t=>t.id===activeId);}
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify({threads:threads.slice(0,50),activeId}));}catch(e){status('本地浏览器无法保存对话：请检查磁盘剩余空间。',true);}}
function draw(){P2View.renderThreads(threads,activeId,selectChat,deleteChat,renameChat);P2View.renderMessages(current());drawAttachments();}
function drawAttachments(){P2View.renderAttachments(files,urls,removeFile,removeUrl);}
function removeFile(file){if(file.preview)URL.revokeObjectURL(file.preview);files=files.filter(x=>x!==file);drawAttachments();}
function removeUrl(url){urls=urls.filter(x=>x!==url);drawAttachments();}
function clearMedia(){files.forEach(f=>{if(f.preview)URL.revokeObjectURL(f.preview);});files=[];urls=[];videoIntent=false;drawAttachments();}
function newChat(){if(sending)return status('先等待这一轮回答结束。',true);clearMedia();const t={id:uid(),title:'新对话',messages:[],createdAt:Date.now()};threads.unshift(t);activeId=t.id;persist();draw();$('#p2-text').focus();return t;}
function selectChat(id){if(sending)return status('先等待当前回答结束。',true);if(!threads.some(t=>t.id===id))return;clearMedia();activeId=id;persist();draw();$('#p2-side').classList.remove('open');}
function deleteChat(id){if(sending)return;if(!confirm('删除此对话的本机历史记录？'))return;threads=threads.filter(x=>x.id!==id);if(activeId===id)activeId=threads[0]?.id||'';if(!activeId){newChat();return;}persist();draw();}
function renameChat(id){const t=threads.find(x=>x.id===id);if(!t)return;const title=prompt('重命名对话',t.title);if(!title?.trim())return;t.title=title.trim().slice(0,70);persist();draw();}
function restore(){try{const data=JSON.parse(localStorage.getItem(STORAGE)||'{}');threads=Array.isArray(data.threads)?data.threads.filter(x=>x&&Array.isArray(x.messages)).slice(0,50):[];activeId=data.activeId||'';}catch(e){}if(!threads.length){newChat();return;}if(!threads.some(t=>t.id===activeId))activeId=threads[0].id;draw();}
async function jsonApi(url,data,timeout=155000){const ctrl=new AbortController(),tm=setTimeout(()=>ctrl.abort(),timeout);try{const r=await fetch(url,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:ctrl.signal,cache:'no-store'});const j=await r.json().catch(()=>({error:'接口未返回有效 JSON'}));if(!r.ok||j.error)throw Error(j.error||'HTTP '+r.status);return j;}finally{clearTimeout(tm);}}
function getLocalVaultBridge(){
 try{const host=window.parent&&window.parent!==window?window.parent:window;if(host.SY&&typeof host.SY.backendCall==='function')return host.SY.backendCall.bind(host.SY);}catch(_){}
 return null;
}
function getParentKnowledge(){
 try{const host=window.parent&&window.parent!==window?window.parent:window;if(host.SYKnowledge&&typeof host.SYKnowledge.search==='function')return host.SYKnowledge;}catch(_){}
 return null;
}
function obsidianDeepLink(vault,path){return 'obsidian://open?'+new URLSearchParams({vault:String(vault||'韩奕知识复盘'),file:String(path||'')}).toString();}
function queryTokens(query){
 const raw=String(query||'').toLowerCase(),chunks=raw.match(/[a-z0-9_+.-]{2,}|[\\u3400-\\u9fff]{2,}/g)||[],out=[];
 chunks.forEach(part=>{if(/[\\u3400-\\u9fff]/.test(part)&&part.length>2){for(let i=0;i<part.length-1;i++){const t=part.slice(i,i+2);if(!out.includes(t))out.push(t);}}else if(!out.includes(part))out.push(part);});
 return out.filter(t=>!['这个','那个','怎么','如何','可以','我们','你们','一下','帮我','请你','进行','然后','什么','哪些','已经','希望','需要','问题'].includes(t)).slice(0,24);
}
function showObsidianResults(notes,vault){
 const resultBox=$('#p2-obsidian-results');if(!resultBox)return;
 resultBox.replaceChildren();resultBox.hidden=!notes.length;
 notes.forEach(note=>{const a=document.createElement('a');a.href=note.url||obsidianDeepLink(vault,note.path);a.textContent='↗ '+(note.title||note.path)+' · '+note.path;a.className='p2-obsidian-result-link';resultBox.appendChild(a);});
}
async function readBrowserVault(query){
 if(!browserVault)throw Error('还没有选择本机 Obsidian 文件夹，请点击“选择本机 Obsidian 文件夹”。');
 const words=queryTokens(query);
 const ranked=browserVault.files.map(note=>{const hay=(note.path+'\\n'+note.text).toLowerCase();let score=0,first=-1,hits=0;words.forEach(w=>{const at=hay.indexOf(w);if(at>=0){hits++;score+=note.path.toLowerCase().includes(w)?12:2;if(first<0)first=at;}});return {...note,score,first,hits};}).filter(n=>n.score>0).sort((a,b)=>b.score-a.score||b.hits-a.hits).slice(0,3);
 showObsidianResults(ranked,browserVault.name);
 const context=ranked.map(n=>'【本机 Obsidian 来源：'+n.title+'】\\n相对路径：'+n.path+'\\n原笔记跳转：'+obsidianDeepLink(browserVault.name,n.path)+'\\n匹配正文：\\n'+n.text.slice(Math.max(0,n.first-260),Math.max(0,n.first-260)+3000)).join('\\n\\n').slice(0,9000);
 const statusNode=$('#p2-obsidian-status');if(statusNode){statusNode.textContent='已真实读取本机文件夹「'+browserVault.name+'」：'+browserVault.files.length+' 篇 Markdown 笔记，命中 '+ranked.length+' 篇。'+(browserVault.truncated?'注意：达到扫描上限，未读取部分不会出现在结果中。':'');statusNode.classList.remove('error');}
 return {context,count:ranked.length,name:browserVault.name,total:browserVault.files.length};
}
async function retrieveObsidianContext(query){
 const statusNode=$('#p2-obsidian-status'),set=(text,bad=false)=>{if(statusNode){statusNode.textContent=text;statusNode.classList.toggle('error',!!bad);}};
 if(browserVault)return readBrowserVault(query);
 const parentKB=getParentKnowledge();
 if(parentKB){try{const state=parentKB.getStatus();if(state&&state.connected){set('正在检索工作台已连接的本机知识库…');const rows=await parentKB.search(query);const notes=(rows||[]).slice(0,3);showObsidianResults(notes,state.vaultName||parentKB.vaultName||'韩奕知识复盘');const context=notes.map(n=>'【本机 Obsidian 来源：'+n.title+'】\\n相对路径：'+n.path+'\\n原笔记跳转：'+(n.url||obsidianDeepLink(state.vaultName||parentKB.vaultName,n.path))+'\\n匹配正文：\\n'+(n.text||'').slice(0,3000)).join('\\n\\n').slice(0,9000);set('已从工作台连接的知识库检索 '+notes.length+' 篇相关笔记。');return {context,count:notes.length,name:state.vaultName||parentKB.vaultName,total:state.count||notes.length};}}catch(e){set('工作台知识库检索失败：'+e.message+'；尝试读取已授权的本机文件夹。',true);}}
 const backend=getLocalVaultBridge();
 if(!backend)throw Error('当前浏览器没有本机服务桥接。请先点击“选择本机 Obsidian 文件夹”，授权读取你电脑上的 Vault；网页不会假装已连接。');
 set('正在通过本机服务读取 Obsidian…');
 const response=await backend('/api/vault-list',{limit:500,with_text:true},30000);
 if(!response||!response.ok)throw Error(response&&response.error||'本机服务未返回成功状态');
 const data=response.data||{};if(!data.connected)throw Error(data.note||'本机服务没有识别到 Obsidian Vault');
 const words=queryTokens(query),source=Array.isArray(data.files)?data.files:[];
 const ranked=source.map(row=>{const path=String(row.path||''),body=String(row.text||''),title=path.split(/[\\\\/]/).pop().replace(/\\.md$/i,'');const hay=(path+'\\n'+body).toLowerCase();let score=0,hits=0,first=-1;words.forEach(w=>{const at=hay.indexOf(w);if(at>=0){hits++;score+=path.toLowerCase().includes(w)?12:2;if(first<0)first=at;}});return {path,body,title,score,hits,first};}).filter(n=>n.score>0).sort((a,b)=>b.score-a.score||b.hits-a.hits).slice(0,3);
 showObsidianResults(ranked.map(n=>({title:n.title,path:n.path,url:obsidianDeepLink(data.name,n.path)})),data.name);
 const context=ranked.map(n=>'【本机 Obsidian 来源：'+n.title+'】\\n相对路径：'+n.path+'\\n原笔记跳转：'+obsidianDeepLink(data.name,n.path)+'\\n匹配正文：\\n'+n.body.slice(Math.max(0,n.first-260),Math.max(0,n.first-260)+3000)).join('\\n\\n').slice(0,9000);
 set('已通过本机服务读取「'+data.name+'」：共检索 '+source.length+' 篇，命中 '+ranked.length+' 篇。');
 return {context,count:ranked.length,name:data.name,total:source.length};
}
async function checkObsidianConnection(){
 const button=$('#p2-obsidian-connect'),statusNode=$('#p2-obsidian-status');if(button)button.disabled=true;
 const set=(t,bad=false)=>{if(statusNode){statusNode.textContent=t;statusNode.classList.toggle('error',bad);}};
 try{
  const parentKB=getParentKnowledge();
  if(parentKB){try{const state=parentKB.getStatus();if(state&&state.connected){set('工作台已连接本机知识库「'+(state.vaultName||parentKB.vaultName||'Obsidian')+'」：'+state.count+' 篇资料。');if($('#p2-use-obsidian'))$('#p2-use-obsidian').checked=true;return;}}catch(_){}}
  const backend=getLocalVaultBridge();
  if(backend){const response=await backend('/api/vault-list',{limit:500,with_text:false},20000);if(response&&response.ok&&(response.data||{}).connected){const data=response.data;set('本机 Obsidian 已连接：'+(data.name||'韩奕知识复盘')+'；发现 '+Number(data.total||data.count||(data.files||[]).length||0)+' 篇笔记。');if($('#p2-use-obsidian'))$('#p2-use-obsidian').checked=true;return;}}
  if(parentKB&&typeof parentKB.open==='function'){set('请在工作台弹出的知识库窗口中点击“连接 Obsidian”，选择本机 Vault 文件夹。');parentKB.open();return;}
  if(typeof window.showDirectoryPicker!=='function')throw Error('当前浏览器不支持直接选择本机文件夹。请用最新版 Chrome/Edge 打开 HTTPS 工作台。');
  set('请选择本机 Obsidian Vault 文件夹；只读取 Markdown，不上传整个目录。');
  const handle=await window.showDirectoryPicker({id:'shanganya-obsidian-vault',mode:'read'});
  const found=[];let visited=0,truncated=false;
  async function walk(dir,prefix,depth){if(depth>16){truncated=true;return;}for await(const entry of dir.values()){if(++visited>10000||found.length>=500){truncated=true;return;}if(entry.name.startsWith('.'))continue;const path=prefix+entry.name;if(entry.kind==='directory'){await walk(entry,path+'/',depth+1);continue;}if(!/\.md$/i.test(entry.name))continue;try{const file=await entry.getFile();if(file.size>5*1024*1024)continue;found.push({path,text:await file.text(),title:entry.name.replace(/\.md$/i,'')});}catch(_){}}}
  await walk(handle,'',0);if(!found.length)throw Error('已选择「'+handle.name+'」，但没有读到可读取的 Markdown 笔记。');
  browserVault={name:handle.name,files:found,truncated};
  set('已真实读取本机文件夹「'+handle.name+'」：'+found.length+' 篇 Markdown 笔记。'+(truncated?'已达到 500 篇/扫描上限，未读取部分不会进入搜索。':'')+' 笔记仅保留在当前页面内存中。');
  if($('#p2-use-obsidian'))$('#p2-use-obsidian').checked=true;
 }catch(e){if(e.name==='AbortError')set('已取消文件夹授权，未读取任何笔记。',true);else{set('Obsidian 尚未连接：'+e.message+'。普通 AI 问答仍可继续。',true);}}
 finally{if(button)button.disabled=false;}
}
async function checkStatus(){try{const r=await jsonApi('/api/p2/status',undefined,16000),ai=r.ai||{},roles=r.modelTeam?.roles||{},active=Object.values(roles).filter(x=>x.configured).length,suffix=active?' · '+active+'个专家模型':'';$('#p2-model-status').textContent=(ai.verified?'● 已验证：'+ai.model:ai.configured?'○ 模型尚未验证：'+ai.model:'● 尚未连接模型，请配置 API')+suffix;$('#p2-model-status').style.color=ai.verified?'#377951':'#a66a32';}catch(e){$('#p2-model-status').textContent='● 本机后端不可用：'+e.message;$('#p2-model-status').style.color='#b85247';}}
async function uploadFile(file){if(!file.size)return;if(file.size>220*1024*1024)return status(file.name+' 超过220MB限制。',true);const entry={name:file.name,type:file.type||'',id:null,loading:true,preview:file.type.startsWith('image/')?URL.createObjectURL(file):null};files.push(entry);drawAttachments();uploading++;status('正在读取真实文件：'+file.name);
try{const ctrl=new AbortController(),tm=setTimeout(()=>ctrl.abort(),100000);let r;try{r=await fetch('/api/pm/file',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Upload-Name':encodeURIComponent(file.name)},body:file,signal:ctrl.signal});}finally{clearTimeout(tm);}const data=await r.json().catch(()=>({error:'接口没有返回文件结果'}));if(!r.ok||!data.ok)throw Error(data.error||'HTTP '+r.status);entry.id=data.file?.id;entry.loading=false;if(!entry.id)throw Error('没有取得文件ID');status('文件已上传，解析状态待确认：'+file.name+(data.file?.content?'（已提取文字 '+data.file.content.length+' 字）':'（尚未验证图像/视频内容）'));}
catch(e){removeFile(entry);status('文件上传失败：'+file.name+' · '+e.message,true);}finally{uploading--;drawAttachments();}}
async function uploadBatch(batch){for(const file of [...batch])await uploadFile(file);}
function questionLinks(question){const found=question.match(/https?:\/\/[^\s<>\]\uFF09\u3002\uFF0C\uFF1B]+/g)||[];const result=[...urls];for(let value of found){value=value.replace(/[).,;!?]+$/,'');try{const u=new URL(value);if(!u.username&&!u.password&&!result.includes(u.href))result.push(u.href);}catch{}}if(result.length>20)throw Error('本次包含超过20个链接，请按群聊或关键词分批提交；已明确提示，不会静默跳过链接。');return result;}
$('#p2-search').addEventListener('change',()=>{$('#p2-search').dataset.userTouched='1';});
$('#p2-text').addEventListener('paste',e=>{const pasted=[...(e.clipboardData?.items||[])].filter(x=>x.kind==='file').map(x=>x.getAsFile()).filter(Boolean);if(pasted.length){e.preventDefault();uploadBatch(pasted);}});
async function send(){if(sending)return;const textarea=$('#p2-text'),question=textarea.value.trim();if(!question)return status('请输入问题。',true);if(uploading)return status('附件还在上传，请等文件处理完成。',true);const wechat=window.P2WechatAI?.getPendingContext?.()||null;let requestUrls;let taskContext=($('#p2-task-context')?.value||'').trim().slice(0,5000);if($('#p2-use-obsidian')?.checked){try{const kb=await retrieveObsidianContext(question+' '+taskContext);if(kb.context)taskContext=(taskContext+'\n\n【用户已授权关联的 Obsidian 知识库相关笔记】\n'+kb.context).slice(0,13500);}catch(e){const sn=$('#p2-obsidian-status');if(sn){sn.textContent='本轮知识库读取失败：'+e.message+'。已跳过本机笔记，普通 AI 问答继续。';sn.classList.add('error');}}}try{requestUrls=questionLinks(question+'\n'+taskContext);if(wechat){requestUrls=[...new Set([...requestUrls,...(Array.isArray(wechat.urls)?wechat.urls:[])])];if(requestUrls.length>20)throw Error('本轮合并后超过20个链接，请缩小微信消息范围或分批分析；不会静默跳过链接。');}}catch(e){return status(e.message,true);}const thread=current()||newChat();const ready=files.filter(x=>x.id);const history=thread.messages.slice(-12).map(m=>({role:m.role,content:m.content})).filter(x=>['user','assistant'].includes(x.role));const user={role:'user',content:question+(wechat?'\n\n【已关联微信原始数据：'+wechat.group+'，'+wechat.messages.length+'条】':''),files:ready.map(x=>x.name)};const payload={question,history,fileIds:ready.map(x=>x.id),urls:requestUrls,deep:$('#p2-deep').checked,search:$('#p2-search').checked,transcribeVideo:!!$('#p2-transcribe')?.checked,videoAnalysis:videoIntent||ready.some(x=>/\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(x.name))||requestUrls.some(x=>/(youtube\.com|youtu\.be|bilibili\.com|b23\.tv|douyin\.com|vimeo\.com)/i.test(x)),taskContext:taskContext.slice(0,14000),wechatAnalysis:!!wechat,wechatGroup:wechat?.group||'',wechatMessages:wechat?.messages||[],wechatPrompt:wechat?.prompt||''};sending=true;$('#p2-send').disabled=true;$('#p2-send').textContent='…';status(payload.search?'联网搜索真实来源，正在深入分析…':'正在等待模型实际回答…');
thread.messages.push(user);persist();draw();
try{const r=await jsonApi('/api/p2/ask',payload,180000);thread.messages.push({role:'assistant',content:r.reply,model:r.model,modelRole:r.modelRole||'general',modelFallback:!!r.modelFallback,mode:r.mode,sources:r.sources||[],sourceDocuments:r.sourceDocuments||[],searchError:r.searchError||'',media:r.media||[],transcripts:r.transcripts||[]});if(thread.title==='新对话')thread.title=question.slice(0,28);threads=[thread,...threads.filter(x=>x.id!==thread.id)].slice(0,50);window.P2WechatAI?.clearPendingContext?.();textarea.value='';videoIntent=false;clearMedia();persist();draw();const failed=(r.sourceDocuments||[]).filter(x=>x.status&&!['read','sampled-frames'].includes(x.status));const videoNotes=(r.sourceDocuments||[]).filter(x=>x.status==='sampled-frames').map(x=>x.note||'已读取采样画面');const speech=(r.transcripts||[]).map(x=>'语音：'+x.status+(x.note?'，'+x.note:''));const mediaFailures=(r.media||[]).filter(x=>['image','video','video-link'].includes(x.type)&&!(Number(x.frames)>0)).map(x=>(x.name||x.type)+' 未提取到有效画面，不能视为已解析'+(x.warning?'：'+x.warning:''));status('模型已实际回答。角色：'+({general:'主模型',reasoning:'深度推理',research:'联网研究',vision:'视觉理解',coding:'代码分析'}[r.modelRole||'general']||'主模型')+(r.modelFallback?'（专家模型失败，已回退主模型）':'')+'。'+(r.usedWechat?'已关联微信原始消息 '+r.wechatMessageCount+' 条。':'')+[...videoNotes,...speech,...mediaFailures].join('；')+(r.searchError?' 搜索受限：'+r.searchError:'')+(failed.length?' '+failed.length+' 条提交的链接未读到正文，请打开原文或上传文档。':''),failed.length>0||mediaFailures.length>0);}catch(e){thread.messages=thread.messages.filter(m=>m!==user);persist();draw();status('本次回答失败：'+e.message+'。问题和附件仍保留，可重试。',true);}finally{sending=false;$('#p2-send').disabled=false;$('#p2-send').textContent='↑';}}
function showDialog(id){const d=$(id);if(d&&!d.open)d.showModal();}
function addUrl(){const input=$('#p2-link-input'),raw=input.value.trim();try{const normalized=window.SYSourceIO?.normalizeLinks(raw)?.[0]||raw;const u=new URL(normalized);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('地址不合法');if(urls.includes(u.href))return $('#p2-link-status').textContent='这条链接已经加入';if(urls.length>=20)return $('#p2-link-status').textContent='一次最多20个网页链接；更多链接请分批提交';urls.push(u.href);drawAttachments();input.value='';$('#p2-link-dialog').close();status('链接已加入，发送时会实际读取网页正文。');}catch(e){$('#p2-link-status').textContent='请输入完整有效的 https:// 网址';}}
$('#p2-new').onclick=newChat;$('#p2-open-side').onclick=()=>$('#p2-side').classList.toggle('open');$('#p2-close-side').onclick=()=>$('#p2-side').classList.remove('open');
$('#p2-obsidian-connect').onclick=checkObsidianConnection;$('#p2-form').onsubmit=e=>{e.preventDefault();send();};$('#p2-files').onchange=e=>{uploadBatch(e.target.files);e.target.value='';};$('#p2-add-url').onclick=()=>showDialog('#p2-link-dialog');$('#p2-confirm-link').onclick=addUrl;
$('#p2-video-analyze').onclick=()=>{const hasVideo=files.some(x=>/\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(x.name));if(hasVideo){videoIntent=true;const box=$('#p2-text');if(!box.value.trim())box.value='请对本轮上传的视频进行结构化解析：按视频顺序概括场景变化、人物/物体动作、画面中的文字和关键细节；区分直接观察与推测，并说明抽帧、清晰度或未转写语音造成的限制。不要编造时间戳或声称听过未转写的音频。';box.dispatchEvent(new Event('input',{bubbles:true}));box.focus();status('已切换为视频解析提问。确认问题后点击发送；勾选“同时转写语音”才会尝试音频转写。');return;}$('#p2-video-files').click();};
$('#p2-video-files').onchange=async e=>{const batch=[...e.target.files];e.target.value='';if(!batch.length)return;videoIntent=true;await uploadBatch(batch);const box=$('#p2-text');if(!box.value.trim())box.value='请对本轮上传的视频进行结构化解析：按视频顺序概括场景变化、人物/物体动作、画面中的文字和关键细节；区分直接观察与推测，并说明抽帧、清晰度或未转写语音造成的限制。不要编造时间戳或声称听过未转写的音频。';box.dispatchEvent(new Event('input',{bubbles:true}));box.focus();};
$('#p2-text').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send();}};
$('#p2-text').oninput=e=>{e.target.style.height='auto';e.target.style.height=Math.min(170,Math.max(60,e.target.scrollHeight))+'px';};
$('.p2-prompts button').forEach(button=>button.onclick=()=>{const box=$('#p2-text');box.value=button.dataset.q||'';if(button.dataset.web)$('#p2-search').checked=true;if(button.dataset.video)$('#p2-video-files').click();box.focus();});
$('#p2-form').ondragover=e=>{if([...e.dataTransfer?.types||[]].includes('Files'))e.preventDefault();};$('#p2-form').ondrop=e=>{if(e.dataTransfer?.files?.length){e.preventDefault();uploadBatch(e.dataTransfer.files);}};
async function attachText(name,text){const safeName=(String(name||'飞书文档').replace(/[\\/:*?"<>|]/g,'_').slice(0,90)||'飞书文档')+'.txt';await uploadFile(new File([String(text||'')],safeName,{type:'text/plain;charset=utf-8'}));if(!files.some(x=>x.name===safeName&&x.id))throw Error('文档正文已读取，但上传为对话附件失败。');const box=$('#p2-text');if(!box.value.trim())box.value='请基于刚读取的飞书文档，先梳理内容目录、关键问题，再按优先级给出可执行的修改方案。';box.dispatchEvent(new Event('input',{bubbles:true}));}
window.P2LocalVaultStatus=function(){
 if(browserVault)return {connected:true,name:browserVault.name,count:browserVault.files.length,truncated:!!browserVault.truncated,source:'browser-folder-picker'};
 try{const kb=getParentKnowledge();if(kb&&typeof kb.getStatus==='function'){const state=kb.getStatus();if(state&&state.connected)return {connected:true,name:state.vaultName||kb.vaultName||'韩奕知识复盘',count:Number(state.count||0),source:'workbench-knowledge-bridge'};}}catch(_){}
 return {connected:false,name:'韩奕知识复盘',count:0,source:'not-authorized'};
};
window.P2App={api:jsonApi,checkStatus,showDialog,attachText};
restore();
(function consumeRescueHandoff(){
 try{
  const raw=sessionStorage.getItem('shanganya_p2_rescue_handoff_v1');
  if(!raw)return;
  sessionStorage.removeItem('shanganya_p2_rescue_handoff_v1');
  const handoff=JSON.parse(raw);
  const box=$('#p2-text'),context=$('#p2-task-context');
  if(!box)return;
  if(handoff.question)box.value=handoff.question;
  if(context&&handoff.taskContext)context.value=handoff.taskContext.slice(0,5000);
  box.dispatchEvent(new Event('input',{bubbles:true}));
  box.focus();
  status('已从卡点救援站带入问题'+(handoff.taskName?'和任务「'+handoff.taskName+'」':'')+'。请检查材料后点击发送；不会自动改动原任务。');
 }catch(e){status('卡点问题转交失败：'+e.message,true);}
})();
checkStatus();
})();

