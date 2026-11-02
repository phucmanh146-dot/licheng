/* 上岸鸭：微信资料助手，独立增加到原知识库。不访问微信私有数据库。 */
(function(){
'use strict';
if(window.SYWeChatUpgrade)return;
const find=(q,p=document)=>p.querySelector(q),esc=v=>String(v==null?'':v);
const el=(t,c,x)=>{let n=document.createElement(t);if(c)n.className=c;if(x!==undefined)n.textContent=x;return n};
let cache=[],account='',token='',busy=false;
let form={};
function active(){return window.SY&&window.SY.currentAccountKey?String(window.SY.currentAccountKey):''}
function store(){return window.SY?.getAcctData?.()||{}}
function items(){return Array.isArray(store().wxMaterialPool)?store().wxMaterialPool:[]}
function save(arr){if(!active())return notify('请先登录再保存',true);const s=store();s.wxMaterialPool=arr.slice(0,1000);window.SY.saveAcctData(s);document.dispatchEvent(new Event('sywx:materials-changed'));drawPool();return true}
function notify(s,bad=false){const e=find('#sywx-status');if(e){e.textContent=s;e.dataset.error=String(bad)}}
function idFor(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return 'wx_'+(h>>>0).toString(36)}
function norm(r={},fallback='未指定群聊',ref='主动导入'){
const content=esc(r.content||r.text||r.message||r['内容']||r['消息内容']).trim().slice(0,20000);if(!content)return null;
const groupName=esc(r.groupName||r.group||r['群聊']||fallback).slice(0,120);
const sender=esc(r.sender||r.author||r['发送人']||'未标记').slice(0,80);
const time=esc(r.time||r.timestamp||r['时间']||'').slice(0,80);
return{id:idFor(groupName+'|'+sender+'|'+time+'|'+content),source:'wechat',title:groupName+' · '+sender,content,groupName,sender,time,selected:true,sourceRef:ref,importedAt:new Date().toISOString()}
}
function parseText(t,name){
try{if(name.endsWith('.json')){let v=JSON.parse(t);return(Array.isArray(v)?v:Array.isArray(v.messages)?v.messages:[v]).slice(0,1000).map(r=>norm(typeof r==='string'?{content:r}:r,find('#sywx-group')?.value,name)).filter(Boolean)}
if(name.endsWith('.csv')){let lines=t.trim().split(/\r?\n/),cols=lines.shift().split(','),idx=cols.findIndex(x=>/内容|content|text|message/.test(x));if(idx>=0)return lines.map(line=>{let a=line.split(','),o={content:a[idx],groupName:a[cols.findIndex(x=>/群聊|group/.test(x))],sender:a[cols.findIndex(x=>/发送人|sender/.test(x))],time:a[cols.findIndex(x=>/时间|time/.test(x))]};return norm(o,find('#sywx-group')?.value,name)}).filter(Boolean)}
return [norm({content:t},find('#sywx-group')?.value,name)].filter(Boolean)}
catch(e){notify('资料解析失败：'+e.message,true);return []}
}
function filters(){return{group:find('#sywx-group')?.value.trim().toLowerCase()||'',keys:(find('#sywx-keyword')?.value.trim().toLowerCase()||'').split(/[\s,，]+/).filter(Boolean),days:Number(find('#sywx-days')?.value||0)}}
function hits(){const f=filters();return cache.filter(x=>{if(f.group&&!x.groupName.toLowerCase().includes(f.group))return false;const s=(x.content+' '+x.title+' '+x.sender).toLowerCase();if(!f.keys.every(k=>s.includes(k)))return false;if(f.days&&x.time){let v=Date.parse(x.time);if(Number.isFinite(v)&&v<Date.now()-f.days*864e5)return false}return true})}
function drawHits(){let host=find('#sywx-results');if(!host)return;host.replaceChildren();const h=hits();find('#sywx-count').textContent=h.length+' 条真实导入的资料';if(!h.length){host.append(el('p','sywx-muted','没有匹配内容，先粘贴或导入资料。'));return}h.slice(0,150).forEach(x=>{let label=el('label','sywx-item'),check=el('input');check.type='checkbox';check.checked=true;check.className='sywx-pick';check.value=x.id;let right=el('span');right.append(el('strong','',x.title),el('small','',x.time||x.sourceRef),el('span','sywx-excerpt',x.content.slice(0,250)));label.append(check,right);host.append(label)})}
function drawPool(){let host=find('#sywx-pool');if(!host)return;host.replaceChildren();let arr=items();find('#sywx-pool-count').textContent=arr.length+' 份资料';if(!arr.length){host.append(el('p','sywx-muted','暂时没有选中的资料'));return}arr.slice().reverse().forEach(x=>{let row=el('div','sywx-item'),check=el('input');check.type='checkbox';check.checked=x.selected!==false;check.onchange=()=>{let a=items(),m=a.find(v=>v.id===x.id);if(m)m.selected=check.checked;save(a)};let name=el('span','',x.title+' · '+x.content.slice(0,70)),del=el('button','sywx-light','移除');del.type='button';del.onclick=()=>save(items().filter(v=>v.id!==x.id));row.append(check,name,del);host.append(row)})}
function receive(arr){cache=arr.slice(0,1000);drawHits();notify('已读取 '+cache.length+' 条资料，请筛选后加入资料池。')}
async function bridge(endpoint,params){let r=await fetch('http://127.0.0.1:8898'+endpoint,{method:endpoint==='/health'?'GET':'POST',headers:{'X-SYWX-Token':token,'Content-Type':'application/json'},body:endpoint==='/health'?undefined:JSON.stringify(params),signal:AbortSignal.timeout(12000)});let j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'桥接不可用');return j}
function contextual(){let all=items().filter(x=>x.selected!==false);if(!all.length)return '';return '你是AI产品经理，请依据以下真实导入的资料回答问题。先给出当前问题，再给出产品优化、技术方案、下一步任务；引用资料来源，不编造未出现的事实。\n\n'+all.map((x,i)=>'【资料'+(i+1)+'：'+x.title+'】\n来源：'+x.sourceRef+'；时间：'+x.time+'\n'+x.content).join('\n\n')}
function mount(){const host=find('#knowledgeBody');let who=active();if(!host||!who){find('#sywx-root')?.remove();account='';return}if(who!==account){account=who;cache=[];find('#sywx-root')?.remove()}if(find('#sywx-root'))return;
const root=el('section','sywx-root');root.id='sywx-root';
root.innerHTML=`<div class="sywx-heading"><div><p>MESSAGE TO MATERIAL · WECHAT</p><h2>💬 微信资料助手</h2><span>群聊资料 → 检索 → 蓝色资料池 → AI 分析</span></div><span class="sywx-neutral">需用户授权</span></div>
<div class="sywx-fields"><label>群聊名称<input id="sywx-group" placeholder="例如：AI产品大赛群"></label><label>关键词<input id="sywx-keyword" placeholder="修改建议 / 比赛 / feishu"></label><label>时间范围<select id="sywx-days"><option value="0">全部时间</option><option value="7">最近7天</option><option value="30">最近30天</option></select></label></div>
<details class="sywx-details" open><summary>① 从微信获取资料</summary><p>当前支持你授权复制或导出的聊天文本及本机资料桥接；不能直接声称已读取微信历史群聊。</p><label class="sywx-uploader">选择已导出的 TXT / MD / CSV / JSON 文件<input id="sywx-file" type="file" accept=".txt,.md,.csv,.json" multiple></label><textarea id="sywx-paste" rows="4" placeholder="也可以粘贴你复制的聊天内容"></textarea><div class="sywx-actions"><button type="button" class="sywx-main" id="sywx-import">读取粘贴内容</button></div>
<details><summary>连接 Windows 本机已授权资料</summary><p>请先运行本机资料桥接程序，指定导出资料目录，再输入终端显示的配对口令。</p><input id="sywx-token" type="password" placeholder="配对口令"><button type="button" class="sywx-light" id="sywx-connect">测试真实连接</button><button type="button" class="sywx-light" id="sywx-search">搜索本机已授权资料</button></details></details>
<div class="sywx-panel"><div class="sywx-heading"><h3>② 选择相关消息</h3><span id="sywx-count">0 条资料</span></div><div id="sywx-results"></div><div class="sywx-actions"><button id="sywx-add" class="sywx-main">将勾选消息加入资料池 ↓</button><p id="sywx-status" aria-live="polite">只读取你主动提供的内容。</p></div></div>
<div class="sywx-vault"><div class="sywx-heading"><h3>③ 蓝色资料池</h3><span id="sywx-pool-count"></span></div><div id="sywx-pool"></div><div class="sywx-actions"><button id="sywx-context" class="sywx-main">复制 AI 分析上下文</button><button id="sywx-export" class="sywx-light">备份资料</button></div></div>`;
let toolbar=find('.sykv-toolbar',host);toolbar?toolbar.insertAdjacentElement('afterend',root):host.prepend(root);
find('#sywx-import').onclick=()=>{let t=find('#sywx-paste').value;if(!t.trim())return notify('请先粘贴内容',true);receive(parseText(t,'用户粘贴'))};
find('#sywx-file').onchange=async e=>{let rows=[];for(let f of e.target.files){if(f.size>5e6){notify(f.name+'超过5MB',true);continue}rows.push(...parseText(await f.text(),f.name.toLowerCase()))}receive(rows);e.target.value=''};
['sywx-group','sywx-keyword','sywx-days'].forEach(i=>{find('#'+i).addEventListener('input',drawHits);find('#'+i).addEventListener('change',drawHits)});
find('#sywx-connect').onclick=async()=>{token=find('#sywx-token').value;try{let j=await bridge('/health');notify('本机授权资料桥接已真实连接，发现 '+j.count+' 条。')}catch(e){notify('连接失败：'+e.message,true)}};
find('#sywx-search').onclick=async()=>{token=find('#sywx-token').value;try{let f=filters(),j=await bridge('/search',{groupName:f.group,keywords:f.keys.join(' '),days:f.days});receive(j.messages.map(x=>norm(x,x.groupName,'Windows 本机授权资料')).filter(Boolean));notify('真实检索完成，匹配 '+j.count+' 条')}catch(e){notify('检索失败：'+e.message,true)}};
find('#sywx-add').onclick=()=>{let ids=[...document.querySelectorAll('#sywx-results .sywx-pick:checked')].map(x=>x.value),arr=items(),n=0;for(let x of cache){if(ids.includes(x.id)&&!arr.some(y=>y.id===x.id)){arr.push(x);n++}}if(save(arr))notify('已加入 '+n+' 条资料，其他账号数据未改动。')};
find('#sywx-context').onclick=async()=>{let t=contextual();if(!t)return notify('资料池还没有选中资料',true);try{await navigator.clipboard.writeText(t);notify('已复制资料上下文，可用于 AI 产品分析。')}catch(e){let a=el('textarea');a.value=t;find('#sywx-status').after(a);a.select();notify('请手动复制下方文本。',true)}};
find('#sywx-export').onclick=()=>{let b=new Blob([JSON.stringify(items(),null,2)],{type:'application/json'}),a=el('a');a.href=URL.createObjectURL(b);a.download='上岸鸭_微信资料备份.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),30000)};
drawPool();drawHits();
}
let queued=false;function run(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mount()})}
new MutationObserver(ms=>{if(ms.some(m=>!m.target.closest||!m.target.closest('#sywx-root')))run()}).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('sy:data',run);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
window.SYWeChatUpgrade={getSelected:()=>items().filter(x=>x.selected!==false),getContext:contextual};
})();