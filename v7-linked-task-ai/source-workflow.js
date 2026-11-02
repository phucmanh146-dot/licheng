/* Extends the original source dialog; existing tasks and account data stay in their own stores. */
(function(){
'use strict';
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
let dialog=null,owner='',data={rows:[],draft:'',paste:''},busy=false,paused=false,previousFocus=null;
const account=()=>String(window.SY?.currentAccountKey||'guest');
const key=()=> 'shanganya_source_workflow_v1:'+owner;
function load(){if(owner===account())return;if(owner){paused=true;busy=false}owner=account();try{data=JSON.parse(localStorage.getItem(key())||'null')||{rows:[],draft:'',paste:''}}catch(_){data={rows:[],draft:'',paste:''}}if(!Array.isArray(data.rows))data.rows=[]}
function status(text,bad){const n=dialog?.querySelector('[data-sw-status]');if(n){n.textContent=text;n.classList.toggle('error',!!bad)}}
function save(){try{localStorage.setItem(key(),JSON.stringify(data));return true}catch(_){status('浏览器空间不足：本批内容尚未保存，请先下载完整核对包。',true);return false}}
function button(text,fn,primary){const b=E('button',text,primary?'primary':'');b.type='button';b.onclick=fn;return b}
function anchor(text,url){let u;try{u=new URL(url);if(!['http:','https:','obsidian:'].includes(u.protocol)||u.username||u.password)return E('span','无效链接')}catch(_){return E('span','无效链接')}const a=E('a',text,'syv7-link');a.href=u.href;if(u.protocol!=='obsidian:'){a.target='_blank';a.rel='noopener noreferrer'}return a}
async function api(path,payload){const requestOwner=owner;const r=await SY.backendCall(path,payload,100000);if(requestOwner!==owner||requestOwner!==account())throw Object.assign(Error('账号已切换，本次结果没有写入新账号。'),{accountChanged:true});if(!r.ok)throw Error((r.error||'服务未返回结果')+(r.data?.how?' '+r.data.how:''));return r.data}
function auditRows(rows){let sections=0,summarized=0,reviewed=0,steps=0,done=0,unread=0,partial=0;for(const r of rows){if(!r.doc){unread++;continue}if(r.readFailed)unread++;if(r.doc.partial)partial++;for(const s of r.doc.sections||[]){sections++;if(s.result)summarized++;if(s.reviewed)reviewed++;for(const item of s.result?.steps||[]){steps++;if(item.done)done++}}}return {sources:rows.length,unread,partial,sections,summarized,reviewed,steps,done}}
function reportRows(rows){const a=auditRows(rows),lines=['# 上岸鸭 · 资料总结与逐步核对包','','生成时间：'+new Date().toLocaleString(),'','## 覆盖检查','已导入来源 '+a.sources+'；未读到正文 '+a.unread+'；原站内容不完整 '+a.partial+'。','已总结 '+a.summarized+'/'+a.sections+' 段；人工核对 '+a.reviewed+'/'+a.sections+' 段；执行 '+a.done+'/'+a.steps+' 步。','覆盖全部已取得的分段，不等于原站全文或网站所有子页。',''];rows.forEach((r,i)=>{lines.push('## 来源 '+(i+1)+'：'+(r.doc?.title||r.name||r.url||'资料'),'','原始地址：'+(r.url||'用户主动导入'),'','建议分类：'+(r.category||r.categorySuggestion||inferCategory(r))+(r.categoryConfirmed?'（已人工确认）':'（待人工确认）'),'');if(r.doc?.documents?.length){lines.push('### 飞书目录子页分类预览','',...r.doc.documents.map(child=>{const id=String(child.url||child.title||'');const state=r.subcategories?.[id];return '- '+(child.title||'未命名子页')+'：'+(state?.category||inferCategory({name:child.title,url:child.url||''}))+(state?.confirmed?'（已人工调整）':'（待核对正文）')+'；'+(child.url||'无链接')}),'')}if(!r.doc){lines.push('读取失败 / 待处理：'+(r.error||'尚未读取'),'');if(r.relatedSearch?.results?.length)lines.push('### 联网补充来源（不是原文）',...r.relatedSearch.results.map(x=>'- '+x.title+'：'+x.url+'\n  '+(x.snippet||'')),'');return}if(r.error)lines.push('最新读取状态：'+r.error,'');if(r.doc.partial)lines.push('注意：原文不完整。'+(r.doc.note||''),'');if(r.doc.sourceKind==='public_summary')lines.push('内容类型：仅公开标题和摘要，尚未取得正文。','');const search=r.relatedSearch||r.doc.relatedSearch;if(search?.results?.length)lines.push('### 联网补充来源（不是原文）',...search.results.map(x=>'- '+x.title+'：'+x.url+'\n  '+(x.snippet||'')),'');for(const s of r.doc.sections){lines.push('### '+s.title+' · 原文字符 '+(s.start+1)+'–'+s.end,'','人工核对：'+(s.reviewed?'已核对':'待核对'),'');if(s.result){lines.push('#### 本段总结',s.result.summary,'','#### 知识点',...s.result.points.map(x=>'- '+x),'','#### 一步一步执行');s.result.steps.forEach((x,j)=>lines.push('- ['+(x.done?'x':' ')+'] 第'+(j+1)+'步：'+x.action,'  交付物：'+x.deliverable,'  验收：'+x.check));lines.push('','#### 待确认',...(s.result.uncertainties.length?s.result.uncertainties:['本段未额外列出待确认点，仍需人工核对。']),'','生成模型：'+s.result.model,'')}else lines.push('本段尚未总结：'+(s.error||'待处理'),'');lines.push('#### 对照原文','',s.text,'')}lines.push('### 本篇发现的原始链接','',...(r.doc.links||[]).map(x=>'- '+x),'')});return lines.join('\n')}
function progress(){const host=dialog?.querySelector('[data-sw-progress]');if(!host)return;const a=auditRows(data.rows);host.replaceChildren();host.append(E('strong','遗漏检查 / 进度监督'),E('p','来源 '+a.sources+' · 待读取 '+a.unread+' · 原文不完整 '+a.partial),E('p','已总结 '+a.summarized+'/'+a.sections+' 段 · 已人工核对 '+a.reviewed+'/'+a.sections+' 段 · 已执行 '+a.done+'/'+a.steps+' 步'));const meter=E('progress');meter.max=a.sections||1;meter.value=a.summarized;meter.setAttribute('aria-label','已取得原文的总结覆盖率');host.append(meter,E('small','“全部完成”需要读到正文、逐段总结并人工核对；读取失败和被原站截断的资料始终单独列出。'))}
function markBusy(value){busy=value;dialog?.querySelectorAll('[data-sw-run]').forEach(b=>b.disabled=value);const pause=dialog?.querySelector('[data-sw-pause]');if(pause)pause.disabled=!value}
const FEISHU_CATEGORIES=[
{value:'01 Agent原理与架构',terms:['agent架构','agent原理','智能体架构','智能体原理','工作流','rag','检索增强','记忆机制','上下文','多智能体','规划与执行']},
{value:'02 Skill与MCP',terms:['skill','mcp','工具调用','tool calling','插件','连接器','connector','function calling','工具协议']},
{value:'03 提示词与模板',terms:['提示词','prompt','系统提示','system prompt','提示词模板','prompt模板','提示词工程']},
{value:'04 AI学习与课程',terms:['课程','教程','task1','task 1','datawhale','学习路线','学习计划','gpu','入门学习','教学','课件']},
{value:'05 AI编程与项目交付',terms:['编程','代码','github','api接口','api接入','部署','debug','报错','开发','代码仓库','工程化','上线']},
{value:'06 竞赛求职与成长',terms:['大挑','竞赛','比赛','校招','实习','面试','求职','offer','简历','就业','成长复盘']},
{value:'07 我的Agent项目',terms:['上岸鸭','shanganya','我的agent项目','产品需求','prd','项目复盘','项目功能','本项目']},
{value:'08 待阅读与待验证',terms:[]}
];
function inferCategory(r){
 const text=String(r.doc?.title||r.name||r.url||'')+'\\n'+String(r.doc?.text||'').slice(0,16000);
 const normalized=text.toLowerCase();
 let best=FEISHU_CATEGORIES[7],bestScore=0;
 for(const cat of FEISHU_CATEGORIES.slice(0,7)){
  let score=0;
  for(const term of cat.terms){const needle=term.toLowerCase();if(normalized.includes(needle))score+=needle.length>=5?2:1;}
  if(score>bestScore){best=cat;bestScore=score;}
 }
 return best.value;
}
function categoryPanel(card,r){
 if(!r.categorySuggestion){r.categorySuggestion=inferCategory(r);save()}
 const chosen=r.category||r.categorySuggestion;
 const box=E('section',undefined,'syv7-category-panel');
 box.append(E('p','分类建议（仅在网页内标记，不会移动、删除或覆盖飞书原文）','syv7-muted'));
 const label=E('label','归属类别：');
 const select=E('select');select.setAttribute('aria-label','资料归属类别');
 select.style.cssText='max-width:100%;padding:7px 9px;border:1px solid #bbb;border-radius:8px;background:transparent;color:inherit;margin:4px 0 8px';
 FEISHU_CATEGORIES.forEach(cat=>{const option=E('option',cat.value);option.value=cat.value;select.append(option)});
 select.value=chosen;
 select.onchange=()=>{r.category=select.value;r.categoryConfirmed=true;save();status('已保存网页内分类标记：'+r.category+'。飞书原文件未移动或修改。')};
 label.append(select);box.append(label);
 box.append(E('small','系统初步建议：'+r.categorySuggestion+(r.categoryConfirmed?' · 已人工确认/调整':' · 待人工确认'),'syv7-muted'));
 if(Array.isArray(r.doc?.documents)&&r.doc.documents.length){
  if(!r.subcategories)r.subcategories={};
  const directory=E('details',undefined,'syv7-feishu-directory');
  directory.append(E('summary','飞书目录子页分类预览（'+r.doc.documents.length+' 篇；按标题初分，不修改原文）'));
  r.doc.documents.forEach(child=>{
   const row=E('div',undefined,'syv7-feishu-child');
   const title=String(child.title||'未命名子页');
   const id=String(child.url||title);
   const suggestion=inferCategory({name:title,url:child.url||''});
   if(!r.subcategories[id])r.subcategories[id]={category:suggestion,suggestion,confirmed:false};
   const state=r.subcategories[id];
   row.append(E('p',title+' · '+(Number(child.chars)||0)+' 字','syv7-muted'));
   if(child.url)row.append(anchor('打开子页 ↗',child.url));
   const childSelect=E('select');childSelect.setAttribute('aria-label',title+'的分类');
   childSelect.style.cssText='max-width:100%;padding:6px;border:1px solid #bbb;border-radius:8px;background:transparent;color:inherit;margin:4px 0 8px';
   FEISHU_CATEGORIES.forEach(cat=>{const option=E('option',cat.value);option.value=cat.value;childSelect.append(option)});
   childSelect.value=state.category;
   childSelect.onchange=()=>{state.category=childSelect.value;state.confirmed=true;save();status('已保存子页分类：'+title+' → '+state.category+'。未移动或修改飞书原文。')};
   row.append(childSelect,E('small','标题建议：'+state.suggestion+(state.confirmed?' · 已人工调整':' · 请对照正文确认'),'syv7-muted'));
   directory.append(row);
  });
  box.append(directory);
 }
 card.append(box);
}
function relatedPanel(card,r){const d=r.doc,search=r.relatedSearch||d?.relatedSearch;if(d?.sourceKind==='public_summary')card.append(E('p','仅取得公开标题和摘要，正文仍待补齐。','syv7-failure'));if(d?.note)card.append(E('p',d.note,'syv7-muted'));if(d?.linkedSources?.length){const box=E('details');box.append(E('summary','分享页关联的文档（尚未读取）'));d.linkedSources.forEach(x=>box.append(anchor('打开关联文档核对 ↗',x.url)));card.append(box)}if(search?.results?.length){const box=E('details');box.open=true;box.append(E('summary','联网检索 · '+search.results.length+' 条补充来源'),E('p','以下是相关网页摘要，不是原链接正文，也不计入原文完成率。','syv7-muted'));search.results.forEach(x=>{const row=E('section');row.append(anchor(x.title||x.url,x.url),E('p',x.snippet||''));box.append(row)});card.append(box)}else if(search?.note)card.append(E('p',search.note,'syv7-muted'));if(r.researchError||d?.researchError)card.append(E('p',r.researchError||d.researchError,'syv7-muted'));if(r.url&&(!d||d.partial)){const b=button(search?'重新联网检索':'联网检索相关内容',()=>researchUrls([r.url]));b.disabled=busy;card.append(b)}}
async function researchUrls(urls){load();await runQueue([...new Set(urls)],async (url,acct)=>{let row=data.rows.find(r=>r.url===url)||{url};try{const result=await api('/api/source/research',{url,title:row.doc?.title||''});if(acct!==owner||acct!==account())return;row.relatedSearch=result;row.researchError='';put(row)}catch(e){if(acct!==owner||acct!==account())return;row.researchError='联网检索未完成：'+e.message;put(row);throw e}})}
function draw(){const host=dialog?.querySelector('[data-sw-results]');if(!host)return;host.replaceChildren();progress();for(const r of data.rows){const card=E('article',undefined,'syv7-result');card.append(E('h3',r.doc?.title||r.name||r.url||'待处理资料'));if(r.url)card.append(anchor('打开原始来源 ↗',r.url));categoryPanel(card,r);if(r.error)card.append(E('p',r.error,'syv7-failure'));relatedPanel(card,r);if(!r.doc){const retry=button('重试读取',()=>readUrls([r.url]));retry.disabled=busy||!r.url;card.append(retry);host.append(card);continue}const d=r.doc;card.append(E('p',d.chars+' 字 · '+d.sections.length+' 段'+(d.partial?' · 原站返回内容不完整':' · 已取得的文字全部分段'),'syv7-muted'));
const original=E('details');original.append(E('summary',d.sourceKind==='public_summary'?'已取得的公开摘要':'目录与已取得原文'));if(d.outline?.length){const ol=E('ol');d.outline.forEach(x=>ol.append(E('li',x.title)));original.append(ol)}original.append(E('pre',d.text));card.append(original);
for(const s of d.sections){const section=E('details',undefined,'sw-section');section.open=!!s.result;section.append(E('summary',(s.result?'已总结 · ':'待总结 · ')+s.title+'（'+(s.start+1)+'–'+s.end+' 字符）'));if(s.error)section.append(E('p',s.error,'syv7-failure'));if(s.result){section.append(E('p',s.result.summary));const points=E('ul');s.result.points.forEach(x=>points.append(E('li',x)));section.append(points);const ol=E('ol',undefined,'sw-steps');s.result.steps.forEach(step=>{const li=E('li'),label=E('label'),check=E('input');check.type='checkbox';check.checked=!!step.done;check.onchange=()=>{step.done=check.checked;save();progress()};label.append(check,document.createTextNode(' '+step.action));li.append(label,E('p','交付物：'+step.deliverable),E('p','验收方法：'+step.check));ol.append(li)});section.append(ol);if(s.result.uncertainties.length)section.append(E('p','待确认：'+s.result.uncertainties.join('；')));section.append(E('small','本段调用配置：'+s.result.model+'；请对照原文核验。'));const label=E('label'),check=E('input');check.type='checkbox';check.checked=!!s.reviewed;check.onchange=()=>{s.reviewed=check.checked;save();progress()};label.append(check,document.createTextNode(' 我已对照本段原文检查知识点、步骤和遗漏'));section.append(label)}const raw=E('details');raw.append(E('summary','对照本段原文'),E('pre',s.text));section.append(raw);const run=button(s.result?'重新总结本段（替换旧结果）':'只总结这一段',()=>summarizeSections([[r,s]]));run.disabled=busy;section.append(run);card.append(section)}
if(d.links?.length){const links=E('details');links.append(E('summary','本篇含 '+d.links.length+' 个链接（子页尚未自动读取）'));d.links.forEach(u=>links.append(anchor(u,u)));const queue=button('将这些链接全部加入读取队列',()=>readUrls(d.links));queue.disabled=busy;links.append(queue);card.append(links)}host.append(card)}}
async function runQueue(items,fn){if(busy)return;const acct=owner;paused=false;markBusy(true);let done=0,failed=0;try{for(const item of items){if(paused||acct!==account())break;status('正在处理 '+(done+failed+1)+' / '+items.length+'，可以在本段结束后暂停。');try{await fn(item,acct);done++}catch(e){failed++;if(item&&typeof item==='object')item.error=e.message}if(acct!==account())return;save();draw();markBusy(true)}}finally{if(acct===account()){markBusy(false);draw();status((paused?'已暂停。':'本批处理结束。')+' 成功 '+done+'，失败 '+failed+'；'+(items.length-done-failed)+' 项尚未处理。可继续处理未完成项。',failed>0)}}}
function put(record){const i=data.rows.findIndex(r=>record.url?r.url===record.url:(record.doc?(r.doc?.id===record.doc.id||(!r.doc&&r.name===record.name)):(!r.doc&&r.name===record.name)));if(i<0)data.rows.push(record);else{const prior=data.rows[i];if(record.doc&&prior.doc?.id===record.doc.id)record.doc=prior.doc;else if(!record.doc&&prior.doc){record.doc=prior.doc;record.error='本次重读失败，已保留上次原文与总结：'+record.error;record.readFailed=true}data.rows[i]=record}save();draw()}
async function readUrls(urls){load();const unique=[...new Set(urls)].filter(Boolean);await runQueue(unique,async (url,acct)=>{const row={url};try{row.doc=await SYSourceIO.prepareLink(url);if(acct!==owner||acct!==account())return;put(row)}catch(e){if(acct!==owner||acct!==account())return;row.error=e.message;put(row);throw e}})}
async function summarizeSections(pairs){await runQueue(pairs,async pair=>{const [r,s]=pair;try{const result=await api('/api/source/summarize',{title:r.doc.title,sectionTitle:s.title,sectionId:s.id,text:s.text});if(owner!==account())return;s.result=result;s.reviewed=false;s.error=''}catch(e){s.error=e.message;throw e}})}
function summarizeAll(){const pairs=[];for(const r of data.rows)for(const s of r.doc?.sections||[])if(!s.result)pairs.push([r,s]);if(!pairs.length)return status('当前没有待总结段。先读取资料，或在单段里重新总结。');summarizeSections(pairs)}
async function pasted(){if(busy)return;const text=dialog.querySelector('[data-sw-paste]').value;if(!text.trim())return status('先粘贴文章正文或聊天记录。',true);const title=dialog.querySelector('[data-sw-title]').value.trim()||'粘贴的原文 / 聊天记录';await runQueue([text],async (original,acct)=>{const doc=await api('/api/source/prepare',{title,text:original});if(acct!==owner||acct!==account())return;put({name:title,doc})})}
async function uploaded(files){await runQueue([...files],async (file,acct)=>{const row={name:file.name};try{const document=await SYSourceIO.readFile(file);if(acct!==owner||acct!==account())return;row.doc=await api('/api/source/prepare',{document});if(acct!==owner||acct!==account())return;put(row)}catch(e){if(acct!==owner||acct!==account())return;row.error=e.message;put(row);throw e}})}
function download(){const text=reportRows(data.rows),url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'})),a=E('a');a.href=url;a.download='上岸鸭-原文总结步骤与遗漏核对.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);status('已请求下载，包含失败项、全部已读取原文、总结、步骤和进度。')}
function close(){if(!dialog)return;const d=dialog;dialog=null;d.close();d.remove();if(previousFocus?.isConnected)previousFocus.focus()}
function manual(){open();const box=dialog.querySelector('[data-sw-manual]');box.open=true;box.querySelector('textarea').focus();box.scrollIntoView({block:'start',behavior:'smooth'})}
function open(value){load();close();previousFocus=document.activeElement;if(typeof value==='string'){data.draft=value;save()}dialog=E('dialog',undefined,'syv7-dialog sw-dialog');dialog.setAttribute('aria-label','资料导入、总结与逐步核对');const header=E('header'),intro=E('div');intro.append(E('span','上岸鸭 / 原工作台资料区','syv7-eyebrow'),E('h2','读进去，讲清楚，一步步做完'),E('p','1 导入 → 2 核对原文 → 3 逐段总结 → 4 执行与验收 → 5 保存知识库'));header.append(intro,button('×',close));const p=E('section',undefined,'syv7-panel');dialog.append(header,p);
const links=E('label','粘贴链接或分享文字（逐条处理，失败项保留）'),input=E('textarea');input.rows=3;input.value=data.draft||'';input.placeholder='飞书、微信文章、B站、YouTube、普通网页、obsidian://open…';input.oninput=()=>{data.draft=input.value;save()};links.append(input);p.append(links);
const actions=E('div',undefined,'syv7-row'),read=button('1 读取全部链接',()=>{const urls=SYSourceIO.normalizeLinks(input.value);if(!urls.length)return status('未识别到有效链接。可用下面的“粘贴原文”。',true);readUrls(urls)},true);read.dataset.swRun='';const paste=button('手机 / 微信：粘贴正文',()=>{const box=p.querySelector('[data-sw-manual]');box.open=true;box.querySelector('textarea').focus()});const pause=button('本段结束后暂停',()=>{paused=true;status('将在当前请求结束后暂停，结果会保留。')});pause.dataset.swPause='';pause.disabled=!busy;const web=button('联网检索链接相关内容',()=>{const urls=SYSourceIO.normalizeLinks(input.value);if(!urls.length)return status('先粘贴一个公开链接。',true);researchUrls(urls)});web.dataset.swRun='';actions.append(read,web,paste,pause);p.append(actions);
const manualBox=E('details');manualBox.dataset.swManual='';manualBox.append(E('summary','粘贴文章正文 / 聊天记录，无需拖书签'),E('p','① 在微信或原网页复制可见文字；② 粘贴到这里，保留发言人和时间；③ 点击导入；④ 核对后逐段总结。截图可用下方上传。'));const title=E('input');title.dataset.swTitle='';title.placeholder='给这份资料起名（如：运营群自我介绍）';const text=E('textarea');text.dataset.swPaste='';text.rows=6;text.value=data.paste||'';text.placeholder='将你选择的聊天记录、文章或会议文字粘贴到这里';text.oninput=()=>{data.paste=text.value;save()};const importText=button('导入这份原文',pasted);importText.dataset.swRun='';manualBox.append(title,text,importText);p.append(manualBox);
const file=E('input');file.type='file';file.multiple=true;file.accept='.md,.txt,.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.gif,.bmp,.csv,.json,.html,.htm,.srt,.vtt';file.onchange=()=>{uploaded(file.files);file.value=''};const drop=button('上传 Word / PDF / 图片 / 字幕（也可拖入）',()=>file.click());drop.dataset.swRun='';drop.ondragover=e=>e.preventDefault();drop.ondrop=e=>{e.preventDefault();uploaded(e.dataTransfer.files)};p.append(drop,file);
const warning=E('p','资料读取与AI总结分开：公开链接先尝试读取，正文不足时补充联网检索；摘要与相关网页会单独标注。AI总结才需要配置模型。','syv7-muted');p.append(warning);
const statusBox=E('p',undefined,'syv7-status');statusBox.dataset.swStatus='';statusBox.setAttribute('role','status');const audit=E('aside',undefined,'sw-audit');audit.dataset.swProgress='';p.append(statusBox,audit);
const tools=E('div',undefined,'syv7-row'),all=button('3 总结全部未完成段',summarizeAll,true);all.dataset.swRun='';tools.append(all,button('下载完整核对包',download),button('存入 Obsidian（先预览）',async()=>{if(!SYKnowledge.getStatus().connected&&/^(127\.0\.0\.1|localhost)$/.test(location.hostname)&&window.SYConnectLocalVault)await SYConnectLocalVault();const report=reportRows(data.rows);SYKnowledge.saveRescue({title:'资料总结与逐步核对',routeText:report})}),button('连接 / 搜索 Obsidian',()=>{close();SYKnowledge.open()}),button('查看实际 AI 模型与连接',()=>{close();SYHub.open(null,'connect')}));p.append(E('p','总结时会把当前分段发送给你配置的 AI。每段显示模型名称、原文、步骤、交付物与验收方法；完整性仍需人工核对。','syv7-muted'),tools);const results=E('div');results.dataset.swResults='';p.append(results);
document.body.append(dialog);dialog.addEventListener('cancel',e=>{e.preventDefault();close()});dialog.addEventListener('paste',e=>{if(e.clipboardData?.files.length){e.preventDefault();uploaded(e.clipboardData.files)}});dialog.showModal();draw();markBusy(busy)}
window.SYSourceWorkflow={open,manual,close,audit:()=>auditRows(data.rows),report:()=>reportRows(data.rows),classify:inferCategory,categories:FEISHU_CATEGORIES.map(x=>x.value),version:'1.2-feishu-categories'};
})();
