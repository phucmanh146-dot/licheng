(function(){
'use strict';
function E(tag,cls,value){const node=document.createElement(tag);if(cls)node.className=cls;if(value!==undefined)node.textContent=String(value);return node;}
function renderThreads(list,active,select,remove,rename){
 const host=document.querySelector('#p2-history');host.replaceChildren();
 for(const t of list){
  const row=E('div','p2-thread'+(active===t.id?' active':''));
  const go=E('button','',t.title||'新对话');go.onclick=()=>select(t.id);
  const more=E('button','','⋯');more.title='点击删除；Shift+点击重命名';more.onclick=e=>e.shiftKey?rename(t.id):remove(t.id);
  row.append(go,more);host.append(row);
 }
}
function renderAttachments(files,urls,removeFile,removeUrl){
 const docs=document.querySelector('#p2-attachments'),links=document.querySelector('#p2-urls');
 docs.replaceChildren();links.replaceChildren();
 for(const file of files){const chip=E('div','p2-chip');chip.dataset.loading=String(file.loading);
  if(file.preview){const img=E('img');img.src=file.preview;img.alt='图片预览';chip.append(img);}
  chip.append(E('span','p2-chip-label',(file.loading?'上传中：':'')+file.name));
  const remove=E('button','','×');remove.title='移除';remove.onclick=()=>removeFile(file);chip.append(remove);docs.append(chip);
 }
 for(const url of urls){const chip=E('div','p2-chip'),label=E('span','p2-chip-label','🔗 '+url);label.title=url;
  const remove=E('button','','×');remove.onclick=()=>removeUrl(url);chip.append(label,remove);links.append(chip);
 }
}
function rich(root,text){
 let fence=false,pre=null,list=null;
 for(const line of String(text||'').split('\n')){
  const trimmed=line.trim();
  if(trimmed.startsWith('```')){if(!fence){pre=E('pre');root.append(pre);}fence=!fence;list=null;continue;}
  if(fence){pre.append(document.createTextNode(line+'\n'));continue;}
  if(!trimmed){root.append(E('div','p2-gap'));list=null;continue;}
  const heading=/^(#{1,5})\s+(.*)$/.exec(trimmed);
  if(heading){root.append(E(heading[1].length<3?'h3':'h4','',heading[2]));list=null;continue;}
  const item=/^(?:[-*]|\d+[.)])\s+(.+)$/.exec(trimmed);
  if(item){if(!list){list=E('ul');root.append(list);}list.append(E('li','',item[1]));continue;}
  list=null;root.append(E('p','',line));
 }
}
function sources(root,docs,err){
 if(!(docs||[]).length&&!err)return;
 const details=E('details','p2-search-sources');details.open=!!err;
 details.append(E('summary','',(docs||[]).length+' 条联网来源'+(err?'（部分搜索受限）':'')));
 if(err)details.append(E('p','p2-meta',err));
 for(const item of docs||[]){
  let u;try{u=new URL(item.url);if(!['https:','http:'].includes(u.protocol))continue;}catch(e){continue;}
  const row=E('div','p2-source'),num=E('span','p2-source-num','['+item.id+']'),body=E('div','p2-source-content');
  const link=E('a','',item.title||u.hostname);link.href=u.href;link.target='_blank';link.rel='noopener noreferrer';
  body.append(link,E('p','',(item.excerpt?'读取了部分正文':'只有搜索摘要')+' · '+u.hostname));
  row.append(num,body);details.append(row);
 }
 root.append(details);
}
function documentSources(root,docs){
 const actual=(docs||[]).filter(x=>x&&x.url&&x.status==='read');
 const failed=(docs||[]).filter(x=>x&&x.status!=='read'&&x.status!=='sampled-frames');
 if(!actual.length&&!failed.length)return;
 const section=E('details','p2-search-sources');section.open=actual.length>0;
 section.append(E('summary','',actual.length+' 条实际读取的文档来源'+(failed.length?' · '+failed.length+' 条未读到正文':'')));
 for(const item of actual){
  let u;try{u=new URL(item.url);if(!['https:','http:'].includes(u.protocol))continue;}catch(e){continue;}
  const row=E('div','p2-source'),body=E('div','p2-source-content'),link=E('a','',item.title||u.hostname);
  link.href=u.href;link.target='_blank';link.rel='noopener noreferrer';
  const state=item.readStatus==='snapshot'?'上次读取的本地快照（非实时）':item.readStatus==='visible-copy'?'已登录浏览器可见正文':'实际读取';
  body.append(link,E('p','p2-meta',state+' · '+Number(item.readChars||0)+' 字 · 点击回到飞书原文'+(item.partial?' · 部分读取':'')));
  row.append(E('span','p2-source-num','↗'),body);section.append(row);
 }
 for(const item of failed) section.append(E('p','p2-meta','未读到正文：'+(item.title||item.url||'未知链接')));
 root.append(section);
}
function renderMessages(thread){
 const host=document.querySelector('#p2-messages'),welcome=document.querySelector('#p2-welcome');
 host.replaceChildren();const messages=thread?.messages||[];welcome.hidden=messages.length>0;
 for(const msg of messages){
  const row=E('article','p2-message '+msg.role),bubble=E('div','p2-bubble');
  if(msg.role==='assistant'){
   row.append(E('div','p2-avatar','✦'));
   bubble.append(E('div','p2-meta','上岸鸭 P2 · '+(msg.model||'AI')+(msg.mode?' · '+msg.mode:'')));
   const body=E('div','p2-rich');rich(body,msg.content);bubble.append(body);
   sources(bubble,msg.sources||[],msg.searchError);
   documentSources(bubble,msg.sourceDocuments||[]);
   const answerActions=E('div','p2-answer-actions');if(window.P2MindMap)answerActions.append(window.P2MindMap.createButton(msg.content||''));if(window.P2VideoPresenter)answerActions.append(window.P2VideoPresenter.createButton(msg.content||''));if(window.P2HeyGenVideo)answerActions.append(window.P2HeyGenVideo.createButton(msg.content||''));if(answerActions.childNodes.length)bubble.append(answerActions);
   if((msg.media||[]).some(x=>x.warning))bubble.append(E('p','p2-meta','提醒：当前模型可能不支持图像视觉输入，仅根据可读取文字回答。'));
  }else{
   if(msg.files?.length){const head=E('div','p2-msg-files');msg.files.forEach(f=>head.append(E('span','','📎 '+f)));bubble.append(head);}
   bubble.append(E('div','',msg.content));
  }
  row.append(bubble);host.append(row);
 }
 const scroll=document.querySelector('#p2-timeline');requestAnimationFrame(()=>scroll.scrollTop=scroll.scrollHeight);
}
window.P2View={renderThreads,renderAttachments,renderMessages};
})();
