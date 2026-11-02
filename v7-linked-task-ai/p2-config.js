(function(){
'use strict';
const $=s=>document.querySelector(s);
let providers=[];
function updateTopDocs(providerId){
 const current=providers.find(x=>x.id===providerId),docs=$('#p2-top-docs');
 if(!docs)return;
 if(current&&current.docs){docs.href=current.docs;docs.hidden=false;docs.textContent='打开 '+(current.name||current.id)+' 官方文档 ↗';docs.title=current.docs;}
 else{docs.removeAttribute('href');docs.hidden=false;docs.textContent='该服务商暂无文档链接';docs.title='请通过服务商官网查找 API 文档';}
}
async function loadTopProviders(){
 const select=$('#p2-top-provider');if(!select)return;
 try{
  const list=await P2App.api('/api/ai-providers',undefined,15000);
  const publicHost=!['localhost','127.0.0.1','::1'].includes(location.hostname);
  providers=(list.providers||[]).filter(x=>x&&x.id&&!(publicHost&&/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/)/i.test(x.base||'')));
  select.replaceChildren();
  providers.forEach(x=>select.append(new Option(x.name||x.id,x.id)));
  const config=await P2App.api('/api/ai-config',undefined,15000).catch(()=>({}));
  const match=providers.find(x=>x.base&&x.base===config.base);
  select.value=match?.id||(providers.some(x=>x.id==='custom')?'custom':providers[0]?.id||'');
  updateTopDocs(select.value);
 }catch(e){select.replaceChildren(new Option('供应商 API 读取失败（点此配置）',''));select.title='未能从工作台 API 读取供应商列表；没有显示伪造的模型。';select.addEventListener('click',()=>open(),{once:true});const docs=$('#p2-top-docs');if(docs){docs.textContent='供应商列表读取失败';docs.removeAttribute('href');}const node=$('#p2-model-status');if(node)node.textContent='真实供应商列表读取失败：'+e.message+'。请打开“配置 / 测试 API”检查工作台 API。';}
}
let searchSettings={provider:'auto',defaultEnabled:true};
function message(text,bad=false){const node=$('#p2-config-status');if(node){node.textContent=text;node.classList.toggle('error',!!bad);}}
function modelMessage(text,bad=false){const node=$('#p2-model-list-status');if(node){node.textContent=text;node.classList.toggle('error',!!bad);}}
function applyProvider(){
 const select=$('#p2-provider'),current=providers.find(x=>x.id===select.value);
 if(!current)return;
 // Custom endpoints must be editable instead of silently retaining a different provider URL.
 $('#p2-base').value=current.id==='custom'?'':(current.base||'');
 $('#p2-protocol').value=current.protocol||'chat';
 const docs=$('#p2-api-docs');
 docs.hidden=!current.docs;
 if(current.docs)docs.href=current.docs;
 const list=$('#p2-model-list');list.replaceChildren(new Option('选择已读取的模型',''));list.hidden=true;
 modelMessage('模型列表会通过你填写的服务商 API 实时读取；不支持列表的代理可手动填模型 ID。');
}
async function open(preferredProvider){
 P2App.showDialog('#p2-config-dialog');
 message('正在读取当前模型连接状态…');
 try{
  const [list,config]=await Promise.all([P2App.api('/api/ai-providers',undefined,15000),P2App.api('/api/ai-config',undefined,15000)]);
  const publicHost=!['localhost','127.0.0.1','::1'].includes(location.hostname);
  providers=(list.providers||[]).filter(x=>x&&x.id&&!(publicHost&&/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/)/i.test(x.base||'')));
  const select=$('#p2-provider');select.replaceChildren();
  providers.forEach(x=>select.append(new Option(x.name||x.id,x.id)));
  const match=providers.find(x=>x.base&&x.base===config.base);
  select.value=match?match.id:(providers.some(x=>x.id==='custom')?'custom':providers[0]?.id||'');
  applyProvider();
  if(config.base)$('#p2-base').value=config.base;
  if(config.model)$('#p2-model').value=config.model;
  if(config.protocol)$('#p2-protocol').value=config.protocol;
  $('#p2-key').value='';
  await loadTeamConfig();
  await loadFeishuConfig();
  await loadSearchSettings();
  message(config.verified?'已验证模型真实响应：'+config.model:(config.configured?'已保存配置，但尚未验证模型真实响应。':'尚未连接模型。填写自己的 API Key 后读取模型并进行真实测试。'));
 }catch(e){message('读取模型配置失败：'+e.message,true);}
}

async function loadSearchSettings(){
 const status=$('#p2-search-config-status');
 try{
  const cfg=await P2App.api('/api/search-config',undefined,12000);
  searchSettings={provider:cfg.provider||'auto',defaultEnabled:cfg.defaultEnabled!==false};
  $('#p2-search-provider').value=searchSettings.provider;
  $('#p2-search-default').checked=searchSettings.defaultEnabled;
  if(status)status.textContent='当前优先引擎：'+({auto:'自动切换（DuckDuckGo → Bing）',duckduckgo:'DuckDuckGo',bing:'Bing'}[searchSettings.provider]||searchSettings.provider)+'。'+(searchSettings.defaultEnabled?'新问题默认勾选联网搜索。':'新问题默认不勾选联网搜索。');
 }catch(e){if(status){status.textContent='读取搜索配置失败：'+e.message;status.classList.add('error');}}
}
async function saveSearchSettings(){
 const button=$('#p2-search-save'),status=$('#p2-search-config-status');
 button.disabled=true;if(status){status.classList.remove('error');status.textContent='正在保存联网搜索设置…';}
 try{
  const cfg=await P2App.api('/api/search-config',{provider:$('#p2-search-provider').value,defaultEnabled:$('#p2-search-default').checked},15000);
  searchSettings={provider:cfg.provider||'auto',defaultEnabled:cfg.defaultEnabled!==false};
  const toggle=$('#p2-search');
  if(toggle&&toggle.dataset.userTouched!=='1')toggle.checked=searchSettings.defaultEnabled;
  if(status)status.textContent='已保存。搜索引擎：'+({auto:'自动切换',duckduckgo:'DuckDuckGo',bing:'Bing'}[searchSettings.provider]||searchSettings.provider)+'；'+(searchSettings.defaultEnabled?'新问题默认开启联网搜索。':'新问题默认关闭联网搜索。');
 }catch(e){if(status){status.textContent='保存失败：'+e.message;status.classList.add('error');}}
 finally{button.disabled=false;}
}
async function testSearchSettings(){
 const button=$('#p2-search-test'),status=$('#p2-search-config-status');
 button.disabled=true;if(status){status.classList.remove('error');status.textContent='正在通过所选引擎实际搜索公开网页…';}
 try{
  const result=await P2App.api('/api/search',{q:'OpenAI API 官方文档',n:3,provider:$('#p2-search-provider').value},40000);
  if(!Array.isArray(result.results)||!result.results.length)throw Error('搜索接口未返回可用来源。');
  if(status)status.textContent='测试成功：'+result.provider+' 返回 '+result.results.length+' 条来源。搜索摘要不等于已读取全文，请核对原文。';
 }catch(e){if(status){status.textContent='测试失败：'+e.message+'。可以切换到“自动切换”再测一次。';status.classList.add('error');}}
 finally{button.disabled=false;}
}
function initSearchDefault(){
 const toggle=$('#p2-search');if(!toggle)return;
 P2App.api('/api/search-config',undefined,12000).then(cfg=>{
  searchSettings={provider:cfg.provider||'auto',defaultEnabled:cfg.defaultEnabled!==false};
  if(toggle.dataset.userTouched!=='1')toggle.checked=searchSettings.defaultEnabled;
 }).catch(()=>{});
}

async function loadModels(){
 const btn=$('#p2-load-models'),base=$('#p2-base').value.trim(),key=$('#p2-key').value.trim(),protocol=$('#p2-protocol').value;
 if(!base){modelMessage('请先选择服务商或填写 API 地址。',true);return;}
 btn.disabled=true;modelMessage('正在通过真实 API 读取模型列表…');
 try{
  const r=await P2App.api('/api/ai-models',{base,key,protocol,keepKey:!key},45000);
  const models=Array.isArray(r.models)?r.models:[];
  const select=$('#p2-model-list');select.replaceChildren(new Option('选择已读取的模型',''));
  models.forEach(m=>select.append(new Option(m.name&&m.name!==m.id?m.name+' · '+m.id:m.id,m.id)));
  if(!models.length){select.hidden=true;modelMessage('服务商没有返回模型列表。请打开官方文档，手动填写准确的模型 ID 后再测试。',true);return;}
  select.hidden=false;
  modelMessage('已从服务商实时读取 '+models.length+' 个模型；选择后会填入模型 ID。');
  const current=$('#p2-model').value.trim();
  if(current&&models.some(m=>m.id===current))select.value=current;
  else select.selectedIndex=0;
 }catch(e){
  modelMessage('读取失败：'+e.message+'。请核对 API 地址、Key、接口类型和服务商模型权限；也可按官方文档手动填写模型 ID。',true);
 }finally{btn.disabled=false;}
}
async function discoverModels(){
 const button=$('#p2-discovery-fetch'),select=$('#p2-discovery-results'),status=$('#p2-discovery-status');
 const q=$('#p2-discovery-query').value.trim(),provider=$('#p2-discovery-provider').value.trim();
 button.disabled=true;status.classList.remove('error');status.textContent='正在抓取公开模型目录；首次请求可能需要十几秒…';
 try{
  const params=new URLSearchParams({q,provider,limit:'300'});
  const r=await P2App.api('/api/model-discovery?'+params.toString(),undefined,50000);
  const models=Array.isArray(r.models)?r.models:[];
  select.replaceChildren();
  models.forEach(m=>{
   const caps=Array.isArray(m.capabilities)&&m.capabilities.length?' · '+m.capabilities.join('/'):'';
   const ctx=m.context?' · '+Number(m.context).toLocaleString()+' tokens':'';
   select.append(new Option((m.provider||'未知厂商')+' · '+m.name+' ['+m.id+']'+caps+ctx,m.id));
  });
  if(!models.length)select.append(new Option('没有匹配结果',''));
  const src=(r.sources||[]).map(s=>s.name+': '+(s.ok?'抓取 '+s.count+' 条':'失败')).join('；');
  status.textContent='目录结果 '+Number(r.count||0)+' 条，本次显示 '+models.length+' 条。'+src+'。'+(r.errors&&r.errors.length?' 部分来源异常：'+r.errors.join('；'):'')+' 仅为目录发现，不代表已接通。';
 }catch(e){select.replaceChildren(new Option('抓取失败：请查看状态',''));status.textContent='模型目录抓取失败：'+e.message+'。没有用预设名称补位。';status.classList.add('error');}
 finally{button.disabled=false;}
}
async function verify(){
 const btn=$('#p2-test-model'),base=$('#p2-base').value.trim(),model=$('#p2-model').value.trim(),key=$('#p2-key').value.trim(),protocol=$('#p2-protocol').value;
 if(!base||!model){message('请填写 API 地址和准确的模型 ID。可先点击“读取可用模型列表”。',true);return;}
 btn.disabled=true;message('正在进行真实 API 测试；服务商可能按其规则计费…');
 try{
  const r=await P2App.api('/api/pm/config',{base,model,key,protocol,keepKey:!key},105000);
  $('#p2-key').value='';
  message(r.verified?'模型已真实连通并通过测试：'+r.model:'未确认模型已连通，请查看错误信息。',!r.verified);
  await P2App.checkStatus();
 }catch(e){message('API 测试失败：'+e.message,true);}
 finally{btn.disabled=false;}
}

const teamRoles=[
 {id:'reasoning',label:'深度推理'},
 {id:'research',label:'联网研究与证据综合'},
 {id:'vision',label:'图片与视频画面理解'},
 {id:'coding',label:'代码分析与修复'}
];
async function loadTeamConfig(){
 try{
  const data=await P2App.api('/api/ai-team-config',undefined,15000);
  teamRoles.forEach(role=>{
   const row=data.roles?.[role.id]||{};
   $('#p2-role-'+role.id+'-base').value=row.base||'';
   $('#p2-role-'+role.id+'-model').value=row.model||'';
   $('#p2-role-'+role.id+'-protocol').value=row.protocol||'chat';
   $('#p2-role-'+role.id+'-key').value='';
   const status=document.querySelector('[data-role-status="'+role.id+'"]');
   if(status)status.textContent=row.configured?'已验证独立模型：'+row.model+'（密钥不回显）':'未配置独立模型，任务将回退到主模型';
  });
  const status=$('#p2-team-status');
  if(status)status.textContent='主模型 + '+teamRoles.filter(x=>data.roles?.[x.id]?.configured).length+' 个已验证的独立角色。当前服务重启后需要重新配置。';
 }catch(e){const status=$('#p2-team-status');if(status)status.textContent='读取模型团队状态失败：'+e.message;}
}
async function loadFeishuConfig(){
 const status=$('#p2-feishu-status');
 try{
  const r=await P2App.api('/api/public-feishu-status',undefined,12000);
  if(status)status.textContent=r.configured?'飞书应用凭证已保存在当前会话；文档权限尚需实际读取测试。':'尚未连接飞书。填写应用 ID / App Secret 后保存。';
 }catch(e){if(status)status.textContent='无法读取飞书连接状态：'+e.message;}
}
async function saveFeishuCredentials(){
 const button=$('#p2-feishu-save'),appId=$('#p2-feishu-app-id').value.trim(),appSecret=$('#p2-feishu-app-secret').value.trim(),status=$('#p2-feishu-status');
 if(!appId||!appSecret){if(status)status.textContent='请同时填写飞书应用 ID 和 App Secret。';status?.classList.add('error');return false;}
 button.disabled=true;status?.classList.remove('error');if(status)status.textContent='正在保存到当前账号的服务会话…';
 try{
  const r=await P2App.api('/api/public-feishu-config',{appId,appSecret},20000);
  $('#p2-feishu-app-secret').value='';
  if(status)status.textContent=r.note||'凭证已保存。请使用真实 Wiki 链接测试文档权限。';
  return true;
 }catch(e){if(status)status.textContent='飞书凭证保存失败：'+e.message;status?.classList.add('error');return false;}
 finally{button.disabled=false;}
}
async function readFeishuDesktop(){
 const button=$('#p2-feishu-desktop-read'),url=$('#p2-feishu-test-url').value.trim(),status=$('#p2-feishu-status');
 let parsed;try{parsed=new URL(url);if(parsed.protocol!=='https:'||!['feishu.cn','larksuite.com'].some(host=>parsed.hostname===host||parsed.hostname.endsWith('.'+host))||!['wiki','docx'].includes(parsed.pathname.split('/')[1]))throw Error('请填写完整的飞书 Wiki / 云文档链接。');}catch(e){if(status)status.textContent='链接无效：'+e.message;status?.classList.add('error');return;}
 button.disabled=true;status?.classList.remove('error');if(status)status.textContent='正在调用电脑本机桥接服务；浏览器将打开飞书页面并复制可见正文，请暂时不要操作键鼠…';
 try{
  let response;try{response=await fetch('http://127.0.0.1:8877/api/feishu/desktop-read',{method:'POST',mode:'cors',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:parsed.href}),cache:'no-store',signal:AbortSignal.timeout(50000)});}catch(e){throw Error('未能访问本机飞书读取桥接服务。请确认电脑上的上岸鸭本机服务正在运行（127.0.0.1:8877），并允许浏览器访问本机服务。详情：'+e.message);}
  const r=await response.json().catch(()=>({error:'本机服务未返回有效 JSON'}));if(!response.ok||!r.ok||r.readStatus!=='fulltext'||!String(r.text||'').trim())throw Error(r.error||'没有读取到文档正文。');
  await P2App.attachText(r.title||'飞书文档',r.text);
  if(status)status.textContent='读取成功：'+(r.title||'飞书文档')+'；正文 '+Number(r.chars||r.text.length)+' 字，已作为附件加入当前 AI 对话。返回输入框提出问题后发送即可。';
 }catch(e){if(status)status.textContent='飞书读取失败：'+e.message;status?.classList.add('error');}
 finally{button.disabled=false;}
}

async function testFeishuRead(){
 const button=$('#p2-feishu-test'),url=$('#p2-feishu-test-url').value.trim(),status=$('#p2-feishu-status');
 let parsed;
 try{parsed=new URL(url);if(parsed.protocol!=='https:' || !['feishu.cn','larksuite.com'].some(host=>parsed.hostname===host||parsed.hostname.endsWith('.'+host)) || !['wiki','docx'].includes(parsed.pathname.split('/')[1]))throw Error('请填完整的飞书 Wiki 或新版文档 HTTPS 链接。');}
 catch(e){if(status)status.textContent='测试链接无效：'+e.message;status?.classList.add('error');return;}
 if($('#p2-feishu-app-id').value.trim()||$('#p2-feishu-app-secret').value.trim()){
  if(!await saveFeishuCredentials())return;
 }else{
  const state=await P2App.api('/api/public-feishu-status',undefined,12000).catch(()=>({configured:false}));
  if(!state.configured){if(status)status.textContent='请先填写并保存飞书应用 ID 和 App Secret。';status?.classList.add('error');return;}
 }
 button.disabled=true;status?.classList.remove('error');if(status)status.textContent='正在调用飞书官方 API 读取正文与子目录；请稍候…';
 try{
  const r=await P2App.api('/api/sources/read',{url:parsed.href},120000);
  if(r.readStatus!=='fulltext'||!String(r.text||'').trim())throw Error(r.note||'接口没有返回完整正文。');
  const docs=Number(r.documentCount||1),chars=Number(r.chars||String(r.text||'').length);
  if(status)status.textContent='读取测试成功：'+(r.title||'飞书文档')+'；正文 '+chars+' 字；'+docs+' 篇文档。'+(r.partial?'注意：目录读取达到上限或存在部分失败，请查看 AI 回复中的警告。':'');
  await loadFeishuConfig();
 }catch(e){if(status)status.textContent='真实读取测试失败：'+e.message+'。请检查应用权限、知识库成员和文档协作者设置。';status?.classList.add('error');}
 finally{button.disabled=false;}
}
async function clearFeishuCredentials(){
 const button=$('#p2-feishu-clear'),status=$('#p2-feishu-status');button.disabled=true;
 try{
  await P2App.api('/api/public-feishu-config',{clear:true},15000);
  $('#p2-feishu-app-id').value='';$('#p2-feishu-app-secret').value='';
  if(status)status.textContent='已断开当前会话的飞书连接；不会修改飞书文档本身。';
  status?.classList.remove('error');
 }catch(e){if(status)status.textContent='断开失败：'+e.message;status?.classList.add('error');}
 finally{button.disabled=false;}
}

async function loadRoleModels(role){
 const base=$('#p2-role-'+role+'-base').value.trim();
 const key=$('#p2-role-'+role+'-key').value.trim();
 const protocol=$('#p2-role-'+role+'-protocol').value;
 const button=document.querySelector('[data-role-load="'+role+'"]');
 const select=document.querySelector('[data-role-model-list="'+role+'"]');
 const status=document.querySelector('[data-role-status="'+role+'"]');
 if(!base){if(status)status.textContent='请先填写这个角色的 API 地址';return;}
 button.disabled=true;
 if(status)status.textContent='正在通过真实 API 读取模型列表…';
 try{
  const r=await P2App.api('/api/ai-models',{base,key,protocol,keepKey:!key},45000);
  const models=Array.isArray(r.models)?r.models:[];
  select.replaceChildren(new Option('选择模型',''));
  models.forEach(m=>select.append(new Option(m.name&&m.name!==m.id?m.name+' · '+m.id:m.id,m.id)));
  select.hidden=!models.length;
  if(status)status.textContent=models.length?'已实时读取 '+models.length+' 个模型；选中后填写模型 ID。':'服务商没有返回模型，请手动填写准确的模型 ID。';
 }catch(e){if(status)status.textContent='读取失败：'+e.message;}
 finally{button.disabled=false;}
}
async function saveTeam(){
 const button=$('#p2-save-team');
 const roles={};
 teamRoles.forEach(role=>{
  const base=$('#p2-role-'+role.id+'-base').value.trim();
  const model=$('#p2-role-'+role.id+'-model').value.trim();
  if(base||model)roles[role.id]={base,model,key:$('#p2-role-'+role.id+'-key').value.trim(),protocol:$('#p2-role-'+role.id+'-protocol').value};
 });
 if(!Object.keys(roles).length){$('#p2-team-status').textContent='请至少填写一个角色的 API 地址和模型 ID；留空的角色使用主模型。';return;}
 button.disabled=true;
 $('#p2-team-status').classList.remove('error');
 $('#p2-team-status').textContent='正在逐个真实测试模型 API；请稍候…';
 try{
  const r=await P2App.api('/api/ai-team-config',{roles},180000);
  teamRoles.forEach(role=>{
   const result=(r.results||[]).find(x=>x.id===role.id);
   if(result){
    const status=document.querySelector('[data-role-status="'+role.id+'"]');
    if(status)status.textContent=result.ok?'已验证：'+result.model:'连接失败：'+result.error;
   }
   $('#p2-role-'+role.id+'-key').value='';
  });
  const results=r.results||[],ok=results.filter(x=>x.ok).length,failed=results.filter(x=>!x.ok).length;
  $('#p2-team-status').textContent='测试完成：'+ok+' 个角色连接成功，'+failed+' 个失败。失败角色会继续使用之前可用的配置或主模型。';
  $('#p2-team-status').classList.toggle('error',failed>0);
  await P2App.checkStatus();
 }catch(e){$('#p2-team-status').textContent='模型团队保存失败：'+e.message;$('#p2-team-status').classList.add('error');}
 finally{button.disabled=false;}
}
async function clearTeam(){
 const button=$('#p2-clear-team');button.disabled=true;
 try{
  await P2App.api('/api/ai-team-config',{clear:true},15000);
  teamRoles.forEach(role=>{
   $('#p2-role-'+role.id+'-base').value='';
   $('#p2-role-'+role.id+'-model').value='';
   $('#p2-role-'+role.id+'-key').value='';
   const status=document.querySelector('[data-role-status="'+role.id+'"]');
   if(status)status.textContent='未配置独立模型，任务将回退到主模型';
  });
  $('#p2-team-status').textContent='独立模型配置已清除；主模型和网页其他设置未更改。';
  $('#p2-team-status').classList.remove('error');
 }catch(e){$('#p2-team-status').textContent='清除失败：'+e.message;$('#p2-team-status').classList.add('error');}
 finally{button.disabled=false;}
}

$('#p2-open-config').addEventListener('click',()=>open($('#p2-top-provider')?.value||undefined));
$('#p2-search-save').addEventListener('click',saveSearchSettings);
$('#p2-search-test').addEventListener('click',testSearchSettings);
initSearchDefault();
if(new URLSearchParams(location.search).get('openConfig')==='1')open();
$('#p2-top-provider').addEventListener('change',e=>{const id=e.target.value;updateTopDocs(id);if(providers.some(x=>x.id===id)){const modal=$('#p2-provider');modal.value=id;applyProvider();}});
$('#p2-provider').addEventListener('change',applyProvider);
loadTopProviders();
$('#p2-load-models').addEventListener('click',loadModels);
 $('#p2-discovery-fetch').addEventListener('click',discoverModels);
 $('#p2-discovery-results').addEventListener('change',e=>{if(e.target.value){$('#p2-model').value=e.target.value;modelMessage('已填入目录中的模型 ID；这不是连接成功。请按官方文档配置 API 地址/Key，并点击“实际测试并连接”。');}});
$('#p2-model-list').addEventListener('change',e=>{if(e.target.value)$('#p2-model').value=e.target.value;});
$('#p2-test-model').addEventListener('click',verify);
$('#p2-save-team').addEventListener('click',saveTeam);
$('#p2-clear-team').addEventListener('click',clearTeam);
document.querySelectorAll('[data-role-load]').forEach(button=>button.addEventListener('click',()=>loadRoleModels(button.dataset.roleLoad)));
document.querySelectorAll('[data-role-model-list]').forEach(select=>select.addEventListener('change',()=>{
 if(select.value)$('#p2-role-'+select.dataset.roleModelList+'-model').value=select.value;
}));
$('#p2-feishu-desktop-read').addEventListener('click',readFeishuDesktop);
$('#p2-feishu-save').addEventListener('click',saveFeishuCredentials);
$('#p2-feishu-test').addEventListener('click',testFeishuRead);
$('#p2-feishu-clear').addEventListener('click',clearFeishuCredentials);
})();