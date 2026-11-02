(function(){
'use strict';if(window.SYWechatPrivate)return;
var base='/api/wechat-private',token='',dialog=null,items=[];
function el(tag,cls,txt){var n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;}
function button(t,fn){var b=el('button','sywp-btn',t);b.type='button';b.onclick=fn;return b;}
function msg(t){t=String(t||'').replace(/此功能需要连接访客自己的本机客户端。请在本机打开上岸鸭后使用。/g,'当前账号尚未完成微信授权，未读取任何聊天内容。').replace(/请[^。；\n]*(?:客户端|打开微信|微信主窗口|微信前台)[^。；\n]*[。]?/g,'微信会话当前不可读取，本次未取得消息。');var n=dialog&&dialog.querySelector('[data-wp-status]');if(n)n.textContent=t;}
async function api(url,data){
var native=(location.hostname==='127.0.0.1'||location.hostname==='localhost')&&['8877','8892'].includes(location.port);
var localOnly=url==='/groups'||url==='/import'||url.indexOf('/messages')===0||url.indexOf('/wechat/')===0;
if(localOnly&&!native)throw Error('公网工作台尚未完成安全本机配对，不能直接读取你电脑的微信。请在本机打开上岸鸭工作台；本次未读取聊天内容。');
var path=base+url,options={method:data===undefined?'GET':'POST',cache:'no-store'};
if(data!==undefined){options.headers={'Content-Type':'application/json'};options.body=JSON.stringify(data);}
var r=await fetch(path,options);var d=await r.json();if(r.status===401&&window.SYCloudAuth)SYCloudAuth.open().catch(()=>{});if(!r.ok||d.error)throw Error(d.error||('服务错误 '+r.status));return d;}

async function groups(){var r=await api('/groups'),s=dialog.querySelector('[data-wp-groups]'),old=s.value;s.replaceChildren(new Option('全部关注群',''));r.groups.forEach(function(g){s.append(new Option(g,g));});if(r.groups.includes(old))s.value=old;await search();}
async function search(){
var q=dialog.querySelector('[data-wp-query]')?.value.trim()||'',g=dialog.querySelector('[data-wp-groups]')?.value||'',groupQuery=dialog.querySelector('[data-wp-group-query]')?.value.trim()||'';
try{var r=await api('/messages?q='+encodeURIComponent(q)+'&group='+encodeURIComponent(g));items=r.items||[];render();}catch(e){msg('已归档微信消息未能读取：'+e.message);items=[];render();}
if(!q&&!groupQuery){msg('尚未执行关键词检索；已归档消息 '+items.length+' 条。');return;}
var term=q||groupQuery,checks=[];
msg('正在实际搜索微信和 Obsidian 正文…');
checks.push((async()=>{try{
var result=await SY.backendCall('/api/pm/tutorials?q='+encodeURIComponent(term),undefined,20000);
if(!result.ok)throw Error(result.error||'笔记检索失败');
var notes=result.data||{},host=dialog.querySelector('[data-wp-notes]');host.replaceChildren(el('h3','','Obsidian 正文匹配'));
host.append(el('p','', '已检索「'+(notes.name||'知识库')+'」'+notes.total+' 篇，匹配 '+notes.matched+' 篇。'));
(notes.notes||[]).forEach(function(note){var row=el('article','sywp-item');row.append(el('strong','',note.title),el('p','sywp-text',(note.snippets||[]).join(' … ')),button('在网页读取原笔记',async function(){try{var result=await SY.backendCall('/api/pm/tutorial-links',{path:note.path},20000);if(!result.ok)throw Error(result.error||'正文读取失败');var output=el('pre','sywp-text',result.data.content||result.data.text||'');row.append(output);msg('已读取 Obsidian 原文 '+output.textContent.length+' 字符 · '+new Date().toLocaleTimeString());}catch(e){msg(e.message)}}));host.append(row)});
}catch(e){dialog.querySelector('[data-wp-notes]').textContent='Obsidian 检索失败：'+e.message;}})());
checks.push(historySearch());
await Promise.all(checks);
}
async function historyState(retry=false,attempt=0){
try{var d=await api('/wechat/history-status',{retry});if(d.phase==='initializing'&&attempt<12){await new Promise(function(resolve){setTimeout(resolve,700);});return historyState(false,attempt+1);}var box=dialog.querySelector('[data-wp-history-status]');
box.textContent=d.phase==='initializing'?'正在验证微信授权与历史访问权限…':d.phase==='history_ready'?'历史原文已真实读取 · '+new Date(d.checkedAt*1000).toLocaleTimeString():d.phase==='directory_ready'?'已读取 '+d.groupCount+' 个真实群目录；历史正文待检索。':'尚未取得历史记录：'+(d.error||'授权状态待验证');
return d;
}catch(e){var box=dialog.querySelector('[data-wp-history-status]');if(box)box.textContent='历史读取尚未可用：'+e.message;return {phase:'unavailable',error:e.message};}}
async function readHistory(group,offset=0,append=false){
msg('正在读取所选群的真实历史原文…');
try{var q=dialog.querySelector('[data-wp-query]').value.trim(),d=await api('/wechat/history',{groupId:group.id,keyword:q,offset,limit:50});
items=append?items.concat(d.items||[]):d.items||[];render();
var next=dialog.querySelector('[data-wp-history-next]');next.replaceChildren();if(d.hasMore)next.append(button('继续检索更早的记录',()=>readHistory(group,d.nextOffset,true)));
msg('历史检索已完成：本页检查 '+d.scanned+' 条，当前显示 '+items.length+' 条匹配原文 · '+new Date(d.checkedAt*1000).toLocaleTimeString()+'。'+d.scope);
await historyState();
}catch(e){msg('历史读取失败，本次未取得结果：'+e.message);}}
async function historySearch(){
var state=await historyState();if(!['directory_ready','history_ready'].includes(state.phase))return msg('历史记录尚未可读：'+(state.error||'授权与数据正在验证，可稍后重试')+'。Obsidian 结果单独显示。');
try{var query=dialog.querySelector('[data-wp-group-query]').value.trim(),d=await api('/wechat/history-groups',{query}),host=dialog.querySelector('[data-wp-sessions]');host.replaceChildren(el('h3','','匹配的真实微信群'));
host.append(el('p','',d.total+' 个群名匹配'+(d.partial?'，当前显示前200个，请缩小关键词':'')+'；点击群名读取历史正文。'));
(d.groups||[]).forEach(g=>host.append(button(g.name,()=>readHistory(g))));
if(d.groups?.length===1)await readHistory(d.groups[0]);
else msg(d.groups?.length?'已取得真实群目录，请选择目标群读取历史正文。':'没有匹配群名，本次没有取得历史正文。');
}catch(e){msg('历史群目录读取失败：'+e.message);}}
function open(){if(dialog){dialog.showModal();return;}dialog=el('dialog','sywp-dialog');
var header=el('div','sywp-head');header.append(el('div','','💬 上岸鸭 · 微信历史与知识库'),button('关闭',function(){dialog.close();}));dialog.append(header,el('p','sywp-caption','检索已授权的群聊与历史消息，按原文和时间显示结果。'));
var pick=el('div','sywp-row'),name=el('input');name.dataset.wpGroupQuery='';name.placeholder='输入微信群关键词，搜索后核对准确群名';pick.append(name,button('关注此群',async function(){try{if(!name.value.trim())return msg('先填写准确群名');await api('/groups',{name:name.value.trim()});name.value='';await groups();}catch(e){msg(e.message);}}),button('从微信当前会话选择',async function(){try{var r=await api('/wechat/preview',{});showPreview(r);msg('已读取真实微信画面。请根据截图填写准确群名，再关注此群。');}catch(e){msg(e.message);}}));pick.append(button('搜索微信历史与 Obsidian',search));dialog.append(pick);
var historyPanel=el('div','sywp-row'),historyStatus=el('p','','正在验证微信历史读取权限…');historyStatus.dataset.wpHistoryStatus='';historyPanel.append(historyStatus,button('验证历史访问权限',()=>historyState(true)));dialog.append(historyPanel);var next=el('div','sywp-row');next.dataset.wpHistoryNext='';dialog.append(next);
var sessions=el('div','sywp-sessions');sessions.dataset.wpSessions='';dialog.append(sessions);
var bar=el('div','sywp-row'),sel=el('select');sel.dataset.wpGroups='';sel.append(new Option('全部关注群',''));var q=el('input');q.dataset.wpQuery='';q.placeholder='搜索关键词：资料、副业、文案、视频、链接、DDL';bar.append(sel,q,button('搜索微信历史与 Obsidian',search),button('读取选中群当前画面',async function(){if(!sel.value)return msg('请选中一个已授权群');try{msg('正在读取微信当前画面，请稍候…');var r=await api('/wechat/preview',{});showPreview(r);msg('已读取真实微信画面；请核对目标群名、截图和识别文字，确认后归档。');}catch(e){msg('真实微信读取失败：'+e.message);}}));bar.append(button('用原微信窗口搜索 / 截图框选',function(){dialog.close();if(window.SY&&SY.switchAppView)SY.switchAppView('knowledge');setTimeout(function(){var target=document.getElementById('pmaw-mini');if(target)target.scrollIntoView({behavior:'smooth',block:'start'});else if(window.SYPMWeChatV4&&SYPMWeChatV4.focus)SYPMWeChatV4.focus();},700);}));dialog.append(bar);
var details=el('details','sywp-detail'),sum=el('summary','','也可以粘贴从微信复制的消息（无需额外安装）'),area=el('textarea');area.placeholder='每行一条消息。选择群后导入，原文保存在当前授权资料空间。';details.append(sum,area,button('导入文本',async function(){if(!sel.value)return msg('先选择一个群');var lines=area.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!lines.length)return;try{var r=await api('/import',{group:sel.value,messages:lines.map(text=>({text:text}))});area.value='';await search();msg('已将 '+r.added+' 条新消息保存到当前授权资料空间。');}catch(e){msg(e.message);}}));dialog.append(details);
var notes=el('section');notes.dataset.wpNotes='';dialog.append(notes);var list=el('section','sywp-list');dialog.append(list,el('p','sywp-status','正在验证微信会话和历史记录读取状态…'));dialog.lastChild.dataset.wpStatus='';document.body.append(dialog);for(var old of dialog.querySelectorAll('button'))if(['从微信当前会话选择','读取选中群当前画面','用原微信窗口搜索 / 截图框选'].includes(old.textContent))old.remove();dialog.showModal();historyState();
}
function showPreview(r,onPick){
var dest=dialog.querySelector('[data-wp-sessions]');dest.replaceChildren();dest.style.cssText='display:block;max-height:65vh;overflow:auto';
if(r.preview){var image=el('img','sywp-live-preview');image.src=r.preview;image.alt='本次实际读取的微信窗口截图';image.style.cssText='display:block;max-width:100%;max-height:440px;object-fit:contain';dest.append(image);}
if(r.candidates){r.candidates.forEach(function(c){dest.append(button(c.label,async function(){try{await api('/wechat/open',{id:c.id});if(onPick)onPick(c.label);var view=await api('/wechat/preview',{});showPreview(view);msg('已读取所选结果的当前画面 '+(view.rows||[]).length+' 行 · '+new Date().toLocaleTimeString()+'。这是 OCR 原文，请核对，不代表全部历史。');}catch(e){msg(e.message);}}));});if(!r.candidates.length)dest.append(el('p','','当前画面未识别到匹配群名，请核对截图或换关键词。'));}
if(r.rows){var a=el('textarea');a.value=r.rows.map(function(x){return x.text;}).join('\n');a.placeholder='当前微信画面 OCR 原文，可删除无关内容或修正错字';a.style.cssText='width:100%;min-height:180px';dest.append(el('p','','以下为当前画面的识别文字，不是全部历史消息。核对后再保存。'),a,button('核对后保存到选中群',async function(){var sel=dialog.querySelector('[data-wp-groups]');if(!sel.value)return msg('先填写准确群名并关注，再从下拉列表选中该群。');if(!a.value.trim())return msg('没有需要保存的文字。');if(!confirm('请确认这段识别文字来自“'+sel.value+'”，并已修正错字。保存到当前授权资料空间？'))return;try{var result=await api('/import',{group:sel.value,messages:[{text:a.value.trim()}]});await search();msg('已保存 '+result.added+' 条真实画面资料；重复内容不会重复保存。');}catch(e){msg(e.message);}}));}
}
function render(){var dest=dialog.querySelector('.sywp-list');dest.replaceChildren();if(!items.length){dest.append(el('p','sywp-caption','还没有采集到匹配消息。历史消息尚未同步；只有实际读取后，才会出现历史搜索结果。'));return;}
var batch=el('div','sywp-row');
batch.append(el('span','sywp-caption','勾选多条微信原文，批量交给 AI 整理任务和资料。'),
button('全选当前结果',function(){dest.querySelectorAll('input[data-sywp-batch-index]').forEach(function(x){x.checked=true;});}),
button('清空选择',function(){dest.querySelectorAll('input[data-sywp-batch-index]').forEach(function(x){x.checked=false;});}),
button('批量 AI 分析所选消息',function(){
var chosen=Array.from(dest.querySelectorAll('input[data-sywp-batch-index]:checked')).map(function(x){return items[Number(x.dataset.sywpBatchIndex)];}).filter(Boolean);
if(!chosen.length)return msg('请先勾选至少一条真实微信消息。');
if(chosen.length>20)return msg('一批最多分析 20 条消息，请分批处理。');
if(!window.SYRescue||!SYRescue.open)return msg('原 AI 卡点救援未加载，未发送任何消息。');
var raw=chosen.map(function(m){return '['+[m.group,m.time,m.sender].filter(Boolean).join(' | ')+']\n'+m.text;}).join('\n\n').slice(0,16000);
dialog.close();SYRescue.open({question:'请根据以下微信原文完成：1)按通知、学习资料、方法、任务、风险分类；2)提取可执行步骤、验收标准、原始链接和来源；3)与原任务比对去重；4)只记录原文明确的日期，不猜截止时间；5)区分事实与推断，最后给出待我确认的任务草稿：\n\n'+raw,useNotes:true});
}));dest.append(batch);
items.forEach(function(m,index){var c=el('article','sywp-item'),top=el('div','sywp-meta');var pick=el('input');pick.type='checkbox';pick.dataset.sywpBatchIndex=String(index);pick.setAttribute('aria-label','select message for batch analysis');top.append(pick,el('strong','',m.group),el('span','',m.time||''),el('span','',m.tag));c.append(top,el('p','sywp-text',m.text));var actions=el('div','sywp-row');
actions.append(button('加入今日任务',function(){if(!window.SY||!SY.getAcctData||!SY.saveAcctData)return msg('原任务系统尚未登录。');var title=prompt('确认这是你的任务，并修改标题：',m.text.slice(0,85));if(!title||!title.trim())return;var date=new Date(),day=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');var a=SY.getAcctData();a.tasks=a.tasks||[];var id='sy-wx-'+m.id;if(a.tasks.some(x=>x.id===id))return msg('这条消息已加过任务，不重复创建。');if(!confirm('添加任务「'+title+'」到今天的原任务清单？'))return;a.tasks.push({id:id,name:title.trim(),date:day,category:'其他',done:false,completedAt:null,estMinutes:30,plannedMinutes:30,startMinutes:null,firstTime:false,multiplier:1,weight:'light',createdAt:Date.now(),order:a.tasks.reduce((v,t)=>Math.max(v,Number(t.order||0)),0)+1,noteFramework:'来自微信 '+m.group+'；原消息：'+m.text.slice(0,1400)});SY.saveAcctData(a);msg('已保存到原任务清单。默认估时30分钟，需要按你的历史耗时校正。');}));
actions.append(button('AI总结 / 识别任务',function(){if(window.SYRescue&&SYRescue.open){dialog.close();SYRescue.open({question:'请从下面微信消息中识别任务、资料或副业机会；只提取原文明确的信息，标记不确定的时间，给我一个下一步：\n'+m.text,useNotes:true});}else msg('原 AI 救援尚未加载，请确认模型连接。');}));
var links=m.text.match(/https?:\/\/[^\s<>"'，。）》]+/g)||[];if(links.length)actions.append(button('读取原链接',function(){if(window.SYHub){dialog.close();SYHub.open(links.join('\n'),'sources');}else msg('原资料读取入口还未加载。');}));c.append(actions);dest.append(c);});}
function mount(){var host=document.querySelector('.app-topbar-right');if(host&&!host.querySelector('[data-sywp-launch]')){var b=button('💬 微信重要群与副业资料',open);b.classList.add('sywp-launch');b.dataset.sywpLaunch='';host.prepend(b);}}
document.addEventListener('sywx:crop-ready',async function(ev){if(!token||!dialog)return;var d=ev.detail||{},txt=String(d.content||'').trim(),sel=dialog.querySelector('[data-wp-groups]');if(!txt||!sel||!sel.value)return;if(!confirm('将刚才主动框选并识别的文字归档到关注群「'+sel.value+'」吗？请确认群名及内容无误。'))return;try{var r=await api('/import',{group:sel.value,messages:[{text:txt}]});if(!dialog.open)dialog.showModal();await search();msg('已保存这次框选的 '+r.added+' 条新资料。');}catch(e){msg('框选内容归档失败：'+e.message);}});
document.addEventListener('cloud:account-changed',()=>{if(dialog?.open){items=[];render();historyState();}});
window.SYWechatPrivate={open:open};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();document.addEventListener('sy:ready',mount);
})();