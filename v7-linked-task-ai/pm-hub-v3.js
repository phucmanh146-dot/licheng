/* 上岸鸭 V3｜优先解决问题的入口。全部使用现有真实后端，不制造假连接。 */
(function(){
'use strict';if(window.SYPMHubV3)return;
const $=(q,root=document)=>root.querySelector(q);
const tag=(el,cls,text)=>{const e=document.createElement(el);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
const status=(message,bad=false)=>{const e=$('#pmah-status');if(e){e.textContent=message;e.dataset.error=String(bad)}};
let apiState={},mountAccount='';
async function rpc(route,data){
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),65000);
 try{
  const response=await fetch(route,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:abort.signal,cache:'no-store'});
  const value=await response.json().catch(()=>({error:'服务未返回有效数据'}));
  if(!response.ok||value.error)throw Error(value.error||'请求失败');
  return value;
 }finally{clearTimeout(timer)}
}
function make(){
 const hub=tag('section','pmah-hub');hub.id='pma-hub-v3';
 hub.innerHTML=`<div class="pmah-top"><div><p class="pmah-kicker">SHANGANYA · AI PROBLEM SOLVER</p><h2>遇到困难，直接丢给 AI</h2><p class="pmah-desc">发问题 + 上传截图/视频/资料，结合你的知识库和目标给出可以照做的下一步。</p></div><div class="pmah-status"><span id="pmah-model-state">检查真实 API 中…</span><span id="pmah-vault-state">检查 Obsidian 中…</span></div></div>
 <div class="pmah-themes" role="group" aria-label="当前问题分类"><button data-theme="比赛">🏆 比赛</button><button data-theme="运营">📣 运营</button><button data-theme="AI课程">🤖 AI 课程</button><button data-theme="考研">📚 考研</button><button data-theme="其他">🧩 其他</button></div>
 <div class="pmah-question-slot"></div><label class="pmah-help"><input type="checkbox" id="pmah-include-tasks" checked> 结合我已有任务和进度回答（可关闭）</label>
 <div class="pmah-actions">
  <label class="pmah-upload" for="pmah-files">📎 上传图片 / PDF / Word / PPT / Excel / 视频<input id="pmah-files" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.pdf,.doc,.docx,.pptx,.xlsx,.xlsm,.md,.txt,.csv,.json,.mp4,.mov,.mkv,.webm,.srt,.vtt"></label>
  <button id="pmah-use-link" type="button">🔗 提供链接</button><button id="pmah-use-obsidian" type="button">📂 我的 Obsidian</button><button id="pmah-use-wechat" type="button">💬 微信框选</button>
 </div>
 <div class="pmah-files-status" id="pmah-files-status" aria-live="polite">拖拽文件到此处也可以上传。选择后会调用真实文件解析接口。</div>
 <div class="pmah-actions pmah-main-ask"><div class="pmah-send-slot"></div><span class="pmah-help">先上传附件，再提问；勾选资料池中的内容会一起参与回答。</span></div>
 <div class="pmah-answer-slot"></div>
 <div class="pmah-vault-mini"><div><strong>📚 本机 Obsidian 仓库</strong><p id="pmah-vault-path">正在读取真实仓库目录…</p></div><button id="pmah-open-vault">打开 Obsidian ↗</button><button id="pmah-explore-vault">打开仓库文件夹</button><button id="pmah-change-vault">选择其他仓库</button></div>
 <details class="pmah-vault-manual"><summary>找不到仓库？手动指定仓库目录</summary><div class="pmah-vault-pick"><input id="pmah-vault-entry" placeholder="D:\\obsidian\\我的知识库（包含 .obsidian）"><button id="pmah-save-vault">绑定此位置</button></div></details>
 <details class="pmah-transcribe"><summary>🎤 读取视频里的说话内容（按需开启）</summary><p>勾选后，没有启用转写 API 时使用本机语音模型；配置并启用 OpenAI 转写 API 后，音频会发送给服务商并可能计费。当前能否使用本机识别，以下方真实状态为准。</p><label><input id="pma-v3-transcribe" type="checkbox"> 对本次上传或链接视频进行语音识别</label><div class="pmah-transcriber-config"><input id="pmah-transcribe-key" type="password" autocomplete="new-password" placeholder="OpenAI 音频转写 API Key（仅在电脑本地填写）"><select id="pmah-transcribe-model"><option value="gpt-4o-mini-transcribe">gpt-4o-mini-transcribe</option><option value="gpt-4o-transcribe">gpt-4o-transcribe</option><option value="whisper-1">whisper-1</option></select><button id="pmah-enable-transcribe">启用音频转写配置</button></div><p id="pmah-transcribe-status">音频转写默认关闭。</p></details>
 <p id="pmah-status" role="status" class="pmah-foot-status">只根据你授权提供的资料回答；读不到的来源会明确说明。</p>`;
 hub.querySelectorAll('[data-theme]').forEach(btn=>btn.onclick=()=>{hub.querySelectorAll('[data-theme]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');const q=$('#pma-question');if(q){q.dataset.theme=btn.dataset.theme;q.placeholder='【'+btn.dataset.theme+'】我现在做到哪一步，目标是什么，卡住在哪里？可以上传截图、官方通知、课件或者视频。';q.focus()}});
 hub.addEventListener('dragover',event=>{if([...event.dataTransfer?.types||[]].includes('Files'))event.preventDefault()});
 hub.addEventListener('drop',event=>{if(!event.dataTransfer?.files?.length)return;event.preventDefault();attachFiles(event.dataTransfer.files)});
 $('#pmah-files',hub).onchange=e=>{attachFiles(e.target.files);e.target.value=''};
 $('#pmah-use-link',hub).onclick=()=>jump('#pma-url');
 $('#pmah-use-obsidian',hub).onclick=()=>jump('#pma-notes');
 $('#pmah-use-wechat',hub).onclick=()=>jump('#pma-wx-frame');
 $('#pmah-open-vault',hub).onclick=async()=>{
  try{const r=await rpc('/api/pm/vault-open',{});status('已请求打开电脑上的 Obsidian：'+r.name)}
  catch(e){status('无法打开 Obsidian：'+e.message,true)}
 };
 $('#pmah-explore-vault',hub).onclick=async()=>{
  try{const r=await rpc('/api/pm/vault-explorer',{});status('已请求在资源管理器打开：'+r.path)}
  catch(e){status('打开仓库文件夹失败：'+e.message,true)}
 };
 $('#pmah-change-vault',hub).onclick=async()=>{
  status('正在弹出 Windows 文件夹选择窗口…');
  try{const r=await rpc('/api/pm/vault-select',{interactive:true});if(r.cancelled)return status('已取消，没有更改仓库');status('已绑定本机仓库：'+r.path);await checkStatus();window.SYPMUpgrade?.refresh?.()}
  catch(e){status('文件夹选择器未打开：'+e.message+'。可以在下方输入真实仓库路径。',true)}
 };
 $('#pmah-save-vault',hub).onclick=async()=>{
  let path=$('#pmah-vault-entry').value.trim();if(!path)return status('请先输入 Obsidian 仓库路径',true);
  try{const r=await rpc('/api/pm/vault-select',{path});status('仓库已绑定：'+r.path);await checkStatus();window.SYPMUpgrade?.refresh?.()}
  catch(e){status('仓库绑定失败：'+e.message,true)}
 };
 $('#pmah-enable-transcribe',hub).onclick=async()=>{
  const key=$('#pmah-transcribe-key').value.trim();
  if(!key)return status('要启用付费音频转写，请先填写你自己的 OpenAI API Key。',true);
  status('正在把配置提交给你电脑的本机后端，不写入网页和账号数据…');
  try{
   const res=await rpc('/api/pm/transcribe-config',{key,model:$('#pmah-transcribe-model').value,enabled:true});
   $('#pmah-transcribe-key').value='';
   $('#pmah-transcribe-status').textContent='已配置：'+res.model+'。勾选本次视频转写后才会调用付费接口。';
   status('转写配置已保存至本机进程内存；尚未产生实际转写费用。')
  }catch(e){status('转写配置失败：'+e.message,true)}
 };
 return hub;
}
function jump(selector){
 const node=$(selector);
 if(!node)return status('没有找到对应模块，刷新页面后再试。',true);
 let parent=node.closest('details');while(parent){parent.open=true;parent=parent.parentElement?.closest('details')};
 if(node.tagName==='DETAILS')node.open=true;
 node.scrollIntoView({behavior:'smooth',block:'center'});
 if(node.tagName==='INPUT'||node.tagName==='TEXTAREA')node.focus({preventScroll:true});
}
function attachFiles(files){
 const original=$('#pma-file'),statusBar=$('#pmah-files-status');
 if(!original){status('原始文件上传组件没有加载，请刷新工作台。',true);return}
 const arr=[...files].filter(x=>x.size);
 if(!arr.length)return;
 const total=arr.reduce((n,x)=>n+x.size,0);
 if(statusBar)statusBar.textContent='正在交给本地真实解析接口：'+arr.map(x=>x.name).join('、')+'（'+(total/1048576).toFixed(1)+'MB）';
 try{
  const transferred=new DataTransfer();
  arr.forEach(f=>transferred.items.add(f));
  original.files=transferred.files;
  original.dispatchEvent(new Event('change',{bubbles:true}));
  setTimeout(()=>{if(statusBar)statusBar.textContent='附件导入结果请查看下方已关联文件；视频可交给 AI 看画面。'},1500);
 }catch(e){status('文件没有被接收：'+e.message,true)}
}
async function checkStatus(){
 try{
  const r=await rpc('/api/pm/status');
  apiState=r;
  const ai=r.ai||{};
  const vault=r.vaultConfig||{};
  const model=$('#pmah-model-state');if(model)model.textContent=ai.verified?'✅ 模型已验证：'+ai.model:ai.configured?'⚠ 模型已配置但尚未验证':'⚠ 还没有接通模型';
  const vstate=$('#pmah-vault-state');if(vstate)vstate.textContent=vault.connected?'✅ Obsidian：'+vault.name:'⚠ 未找到 Obsidian 仓库';
  const vpath=$('#pmah-vault-path');if(vpath)vpath.textContent=vault.path||'请先打开 Obsidian 或选择仓库文件夹';
  const audio=$('#pmah-transcribe-status');const speech=r.transcription||{};if(audio)audio.textContent=speech.apiConfigured?'已启用 API：'+speech.model+'；勾选后调用，可能计费。':speech.local?.available?'本机语音识别已就绪；无需 API Key，勾选后识别。':'本机语音识别未就绪；可配置转写 API。';
 }catch(e){status('本机 API 服务暂时不可用：'+e.message,true)}
}
function mount(){
 const root=$('#pma-root'),account=String(window.SY?.currentAccountKey||'');
 if(!root||!account||$('#pma-hub-v3'))return;
 const hub=make(),head=$('.pma-head',root);
 if(head)head.after(hub);else root.prepend(hub);
 const question=$('#pma-question'),ask=$('#pma-ask'),answer=$('#pma-answer'),extra=$('#pma-answer-extra'),message=$('#pma-message');
 if(question)hub.querySelector('.pmah-question-slot').append(question);
 if(ask)hub.querySelector('.pmah-send-slot').append(ask);
 if(answer)hub.querySelector('.pmah-answer-slot').append(answer);
 if(extra)hub.querySelector('.pmah-answer-slot').append(extra);
 if(message)hub.querySelector('.pmah-answer-slot').append(message);
 if(ask){ask.textContent='立即分析我的困难 →';ask.addEventListener('click',()=>{hub.querySelector('.pmah-answer-slot').scrollIntoView({behavior:'smooth',block:'center'})})}
 if(question){question.placeholder='描述你的卡点、目标和已尝试的方法。例如：我参加比赛要冲国奖，官方要求与目前PPT差在哪？';question.rows=5;}
 checkStatus();
}
new MutationObserver(changes=>{if(!$('#pma-hub-v3')&&$('#pma-root'))requestAnimationFrame(mount)}).observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
window.SYPMHubV3={mount,checkStatus};
})();