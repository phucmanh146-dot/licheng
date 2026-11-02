/* Source citations: original text stays beside its cited material; no guessed summaries. */
(function(){
'use strict';if(window.SYPMMaterialsV4)return;
const Q=(q,r=document)=>r.querySelector(q),E=(t,c,v)=>{const e=document.createElement(t);if(c)e.className=c;if(v!==undefined)e.textContent=String(v);return e};
function cleanPreview(text){
 const cleaned=String(text||'').split(/\r?\n/).filter(line=>!/\bfile:\/\/\//i.test(line))
   .join(' ').replace(/%[0-9A-F]{2}(?:%[0-9A-F]{2}){4,}/gi,'[已隐藏很长的编码路径]').replace(/\s+/g,' ').trim();
 return cleaned.slice(0,210)+(cleaned.length>210?'…':'')
}
function linksOf(text,source){
 const list=[source,...(String(text||'').match(/https?:\/\/[^\s\])）>}，。]+/g)||[])];
 const used=new Set(),links=[];
 for(const s of list){
  try{const u=new URL(s);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||used.has(u.href))continue;
   used.add(u.href);links.push(u.href);if(links.length>=12)break
  }catch(_){}
 }return links;
}
function addLinks(parent,links){
 if(!links.length)return;
 const div=E('div','pmas-source-links');div.append(E('strong','','引用中的原始链接'));
 links.forEach(url=>{
  const a=E('a','',url.length>100?url.slice(0,96)+'…':url);a.href=url;a.target='_blank';a.rel='noopener noreferrer';
  div.append(a)
 });parent.append(div)
}
async function post(url,data){
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const d=await r.json().catch(()=>({error:'服务器未返回有效数据'}));
 if(!r.ok||d.error)throw Error(d.error||('HTTP '+r.status));return d
}
function promptWithMaterial(row){
 const q=Q('#pma-question');if(!q)return;
 const prefix='请完整参考我勾选的《'+row.title+'》原文，不要只看摘要。先按一级/二级/三级标题还原知识框架；'
 +'再用通俗的语言讲清核心概念、应用场景、目前还没弄懂的部分，最后给出3个可执行的下一步。引用具体原句或段落时注明资料标题。';
 q.value=prefix;q.dispatchEvent(new Event('input',{bubbles:true}));
 q.scrollIntoView({behavior:'smooth',block:'center'});q.focus({preventScroll:true});
}
function enhancePool(){
 const root=Q('#pma-pool'),rows=window.SYPMUpgrade?.getMaterials?.()||[];
 if(!root||!rows.length)return;
 [...root.querySelectorAll('.pma-material')].forEach((card,i)=>{
  const row=rows[i];if(!row||card.dataset.pmasDone===row.id)return;
  card.dataset.pmasDone=row.id;
  const summary=Q('small',card);if(summary)
    summary.textContent=(row.source==='obsidian'?'Obsidian 笔记':row.source==='web'?'网页原文':row.source==='wechat-screen'?'微信框选证据':'文件引用')
     +' · 已提取 '+String(row.content||'').length+' 字 · '+cleanPreview(row.content);
  const details=E('details','pmas-inline-original');
  const title=E('summary','','查看被引用的完整原文 / '+String(row.content||'').length+' 字');details.append(title);
  const pre=E('pre','pmas-raw',row.content||'（来源没有返回可用正文）');
  details.append(pre);
  addLinks(details,linksOf(row.content,row.sourceRef));
  const localRefs=String(row.content||'').match(/file:\/\/\/[\w\d%/\\._\-]+/g)||[];
  if(localRefs.length){
   const box=E('details','pmas-local-refs');box.append(E('summary','','原笔记中的本地文件路径（不自动打开）'));
   localRefs.slice(0,8).forEach(path=>{let label=path;try{label=decodeURIComponent(path)}catch(_){}box.append(E('code','',label))});
   details.append(box)
  }
  const actions=E('div','pmas-actions');
  const summarize=E('button','','根据这份原文总结 →');summarize.onclick=()=>promptWithMaterial(row);
  actions.append(summarize);
  if(row.source==='obsidian'&&row.sourceRef){
   const open=E('button','','定位原文件夹');
   open.onclick=async()=>{try{
    const d=await post('/api/pm/vault-reveal-note',{path:row.sourceRef});
    open.textContent='已打开：'+d.path.split('\\').pop()
   }catch(err){open.textContent='定位失败：'+err.message}};
   actions.append(open)
  }
  details.append(actions);
  card.append(details)
 })
}
function enhanceKnowledgeSearch(){
 document.querySelectorAll('.sykv-result').forEach(card=>{
  if(card.dataset.pmasSearchDone)return;
  card.dataset.pmasSearchDone='1';
  const pre=Q('.sykv-snippet',card),h=Q('h3',card),path=Q('.sykv-path',card);
  if(!pre)return;
  const original=pre.textContent||'';
  pre.textContent=cleanPreview(original);
  const wrapper=E('details','pmas-search-source');
  wrapper.append(E('summary','','展开此处提取的原文片段（保留所有引用路径）'),E('pre','pmas-raw',original));
  const action=E('button','pmas-import','导入对应原笔记全文到引用资料区');
  action.onclick=async()=>{
   action.disabled=true;action.textContent='正在读取真实来源…';
   try{
    const data=await post('/api/pm/note',{path:String(path?.textContent||'').trim()});
    window.SYPMUpgrade?.addExternalMaterial?.({id:'obsidian:'+data.path,title:data.title,source:'obsidian',sourceRef:data.path,content:data.content,selected:true,importedAt:new Date().toISOString()});
    wrapper.append(E('p','pmas-note','已把 '+data.chars+' 字真实 Markdown 原文放入下方引用资料池。'));
    action.textContent='已导入笔记全文 ✓';
   }catch(err){wrapper.append(E('p','pmas-note','当前结果可能是浏览器手动导入的资料：'+err.message+'。目前只能引用已显示的片段。'));action.textContent='无法定位仓库原文';}
  };
  wrapper.append(action);card.append(wrapper)
 })
}
let scheduled=false;
function update(){
 if(scheduled)return;scheduled=true;
 requestAnimationFrame(()=>{scheduled=false;enhancePool();enhanceKnowledgeSearch()})
}
new MutationObserver(changes=>{
 if(changes.some(x=>x.addedNodes?.length>0&&!(x.target.closest?.('.pmas-inline-original')||x.target.closest?.('.pmas-search-source'))))update()
}).observe(document.documentElement,{subtree:true,childList:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',update);else update();
window.SYPMMaterialsV4={refresh:update};
})();