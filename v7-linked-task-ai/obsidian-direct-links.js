/* Local Obsidian full-text search; no vault upload and no global layout changes. */
(function(){
'use strict';
if(window.SYObsidianDirect)return;
const $=s=>document.querySelector(s);
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};
let results=[],page=0,lastQuery='',requestId=0;
function status(text,error=false){const n=$('#syd-status');if(n){n.textContent=text;n.dataset.error=String(error)}}
async function api(path,data){
 const r=await fetch(path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),cache:'no-store'});
 const obj=await r.json();if(!r.ok||obj.error)throw Error(obj.error||'HTTP '+r.status);return obj;
}
function link(label,url){
 try{const u=new URL(url);if(!['http:','https:','obsidian:'].includes(u.protocol)||u.username||u.password)return null}
 catch{return null}
 const a=el('a',label);a.href=url;
 if(!url.startsWith('obsidian:')){a.target='_blank';a.rel='noopener noreferrer'}
 return a;
}
function extracted(text){
 const values=String(text||'').match(/(?:https?:\/\/|obsidian:\/\/)[^\s<>\])）"'\x60]+/g)||[];
 return [...new Set(values.map(x=>x.replace(/[.,，。；;]+$/g,'')))].filter(x=>!/(?:BVx{3,}|example\.(?:com|org))/i.test(x));
}
function appendLinks(host,urls,id){
 let old=host.querySelector('[data-syd-links="'+id+'"]');
 const signature=JSON.stringify(urls);
 if(old?.dataset.signature===signature)return;
 old?.remove();if(!urls.length)return;
 const section=el('div');section.className='syd-links';section.dataset.sydLinks=id;section.dataset.signature=signature;
 section.append(el('strong','来源与教程链接（点击打开原文）'));
 urls.forEach((u,i)=>{const a=link((i+1)+'. '+u,u);if(a)section.append(a)});
 host.append(section);
}
async function read(path,importNow=false){
 status('正在读取笔记正文和原始链接…');
 try{
  const note=await api('/api/pm/tutorial-links',{path});
  if(importNow){
   const owner=window.SY?.currentAccountKey;
   if(!owner||!window.SYPMUpgrade?.addExternalMaterial)throw Error('请先登录工作台，再加入资料池。');
   window.SYPMUpgrade.addExternalMaterial({id:'obsidian:'+note.path,source:'obsidian',title:note.title,content:note.content,sourceRef:note.path,url:note.url,links:note.links,selected:true,importedAt:new Date().toISOString()});
   status('已加入蓝色资料池：'+note.title+'（'+note.chars+' 字）');return note;
  }
  if(!window.SYPMUpgrade?.showMaterial)throw Error('全文阅读组件尚未就绪，请稍后重试。');
  window.SYPMUpgrade.showMaterial(note);
  const dialog=$('#pma-reading-dialog');
  if(dialog){
   const tools=el('div');tools.className='syd-tools';
   const open=link('在 Obsidian 打开这篇笔记',note.url);if(open)tools.append(open);
   const add=el('button','加入蓝色资料池');add.type='button';add.onclick=()=>read(path,true);tools.append(add);dialog.append(tools);
   appendLinks(dialog,(note.links||[]).map(x=>x.url),'document');
   if(note.unresolved?.length){const warning=el('details');warning.append(el('summary',note.unresolved.length+' 个链接待补全'));note.unresolved.forEach(x=>warning.append(el('p',x.label+'：'+x.reason)));dialog.append(warning)}
  }
  status('已读取 '+note.chars+' 字，提取 '+note.links.length+' 个链接；外部链接的访问权限以原平台为准。');
  return note;
 }catch(e){status(e.message,true);throw e}
}
function render(){
 const box=$('#syd-results');if(!box)return;box.replaceChildren();
 if(!results.length){box.append(el('p','没有匹配文档，试试更短的关键词。'));return}
 const visible=results.slice(page*35,page*35+35);
 visible.forEach(row=>{
  const card=el('article');card.className='syd-note';
  const title=el('button',row.title);title.type='button';title.className='syd-title';title.onclick=()=>read(row.path).catch(()=>{});title.title='点击阅读笔记正文和教程链接';
  card.append(title,el('small',row.path));
  (row.snippets||[]).forEach(text=>card.append(el('p',text)));
  const controls=el('div');controls.className='syd-tools';
  const open=link('在 Obsidian 打开',row.url);if(open)controls.append(open);
  const add=el('button','加入资料池');add.type='button';add.onclick=()=>read(row.path,true).catch(()=>{});controls.append(add);card.append(controls);
  box.append(card);
 });
 if(results.length>35){
  const controls=el('div');controls.className='syd-tools';
  const previous=el('button','上一页');previous.disabled=page===0;previous.onclick=()=>{page--;render()};
  const next=el('button','下一页');next.disabled=(page+1)*35>=results.length;next.onclick=()=>{page++;render()};
  controls.append(previous,el('span',(page+1)+' / '+Math.ceil(results.length/35)),next);box.append(controls);
 }
}
async function search(query=''){
 const id=++requestId;lastQuery=query;status('正在搜索本机知识库正文…');
 try{
  const data=await api('/api/pm/tutorials?q='+encodeURIComponent(query));
  if(id!==requestId)return data;
  results=data.notes||[];page=0;render();
  status('已直连「'+data.name+'」：共 '+data.total+' 篇，'+(query?'关键词“'+query+'”命中 '+data.matched+' 篇。':'可按关键词搜索标题和正文。'));
  return data;
 }catch(e){if(id===requestId)status('本机连接失败：'+e.message,true);throw e}
}
function mount(){
 const notes=$('#pma-notes');if(!notes||$('#syd-direct'))return;
 const box=el('section');box.id='syd-direct';
 box.append(el('h3','搜索我的知识库与教程'));
 const form=el('form');form.className='syd-tools';
 const input=el('input');input.id='syd-query';input.placeholder='搜索正文：运营、脚本、工作流、Function Calling…';input.setAttribute('aria-label','搜索知识库文档正文');
 const submit=el('button','搜索相关内容');submit.type='submit';form.append(input,submit);
 form.onsubmit=e=>{e.preventDefault();search(input.value.trim()).catch(()=>{})};box.append(form);
 const filters=el('div');filters.className='syd-tools';
 for(const name of ['全部','运营','脚本','工作流','图文','Obsidian','产品经理','Function Calling']){
  const b=el('button',name);b.type='button';b.onclick=()=>{input.value=name==='全部'?'':name;search(input.value).catch(()=>{})};filters.append(b)
 }
 const st=el('p','正在连接本机知识库…');st.id='syd-status';st.setAttribute('role','status');
 const list=el('div');list.id='syd-results';box.append(filters,st,list);notes.before(box);
 search(lastQuery).catch(()=>{});
}
function enhanceLinks(){
 for(const selector of ['#pma-answer','#rescueAnswer']){
  const output=$(selector);if(!output)continue;
  appendLinks(output.parentElement,extracted(output.textContent),'answer');
 }
 const dialog=$('#pma-reading-dialog');
 if(dialog&&!dialog.querySelector('[data-syd-links="document"]')){
  const text=dialog.querySelector('.pma-reader-original pre')?.textContent||'';
  appendLinks(dialog,extracted(text),'fallback');
 }
}
let scheduled=false;
const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;mount();enhanceLinks()})};
new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
schedule();
window.SYObsidianDirect={search,read,extracted};
})();
