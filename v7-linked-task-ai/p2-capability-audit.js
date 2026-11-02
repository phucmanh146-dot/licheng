(function(){
'use strict';
const $=s=>document.querySelector(s);
const endpoints=[
 {id:'ai',label:'AI 主模型',url:'/api/p2/status',read:d=>{const a=d.ai||{};return {ok:!!a.verified,text:a.verified?'已验证 · '+(a.model||'模型'):a.configured?'已配置但未验证 · '+(a.model||'模型'):'未配置 API Key / 模型',detail:a.lastError||''};}},
 {id:'feishu',label:'飞书官方 API',url:'/api/public-feishu-status',read:d=>({ok:!!d.configured,text:d.configured?'应用凭证已配置':'未配置应用凭证',detail:d.configured?'仍需测试目标 Wiki 的实际读取权限':'需要 FEISHU_APP_ID / FEISHU_APP_SECRET 与对应只读权限'})},
 {id:'cloudvault',label:'公网会话知识库',url:'/api/vault',read:d=>({ok:!!d.connected&&Number(d.count)>0,text:(d.connected?'服务可响应':'服务未连接')+' · '+Number(d.count||0)+' 篇',detail:'这是公网会话目录，不等于你电脑上的 D:\\obsidian\\韩奕知识复盘'})},
 {id:'wechat',label:'本机微信桥接',url:'/api/pm/wx/status',read:d=>({ok:!!(d.connected||d.ok&&d.ready),text:(d.connected||d.ready)?'桥接已响应':'尚未确认微信连接',detail:d.note||d.error||'需要本机桥接在线并获得用户授权'})},
 {id:'health',label:'多模态与读取服务',url:'/api/health',read:d=>{const c=d.capabilities||{};return {ok:!!d.ok,text:['链接解析 '+(c.extract?'可用':'未启用'),'视频 '+(c.video?'已声明支持':'未启用'),'图片 '+(c.imageImport?'已声明支持':'未启用')].join(' · '),detail:'能力标记不等于每种文件都已通过端到端测试。'};}}
];
function localVault(){
 try{if(typeof window.P2LocalVaultStatus==='function')return window.P2LocalVaultStatus();}catch(_){}
 try{const host=window.parent&&window.parent!==window?window.parent:window;const kb=host.SYKnowledge;if(kb&&typeof kb.getStatus==='function'){const s=kb.getStatus();if(s&&s.connected)return {connected:true,name:s.vaultName||kb.vaultName||'韩奕知识复盘',count:Number(s.count||0),source:'workbench'};}}catch(_){}
 return {connected:false,name:'韩奕知识复盘',count:0,source:'not-authorized'};
}
function ensurePanel(){
 if($('#p2-capability-audit'))return;
 const header=$('.p2-topbar');if(!header)return;
 const panel=document.createElement('details');panel.id='p2-capability-audit';panel.className='p2-capability-audit';
 const summary=document.createElement('summary');summary.textContent='项目连接诊断：AI · 模型目录 · 飞书 · Obsidian · 微信';panel.append(summary);
 const intro=document.createElement('p');intro.className='p2-capability-intro';intro.textContent='按原有工作台做增量检查，不修改任务和历史数据。诊断结果来自当前实际接口；“能力支持”不代表端到端已通过。';panel.append(intro);
 const actions=document.createElement('div');actions.className='p2-capability-actions';
 const check=document.createElement('button');check.type='button';check.textContent='检查全部连接';
 const models=document.createElement('button');models.type='button';models.textContent='测试公开模型目录';
 const config=document.createElement('button');config.type='button';config.textContent='打开 API 配置';
 const continueOld=document.createElement('button');continueOld.type='button';continueOld.textContent='载入历史需求，继续优化';
 actions.append(check,models,config,continueOld);panel.append(actions);
 const grid=document.createElement('div');grid.className='p2-capability-grid';grid.setAttribute('aria-live','polite');grid.textContent='点击“检查全部连接”读取实时状态。';panel.append(grid);
 const note=document.createElement('p');note.className='p2-capability-note';note.textContent='隐私边界：不会读取浏览器密码或 Cookie；不会自动修改任务、发送微信消息或上传整个 Obsidian 库。';panel.append(note);
 header.insertAdjacentElement('afterend',panel);
 check.addEventListener('click',async()=>{
  check.disabled=true;grid.replaceChildren();
  const local=localVault();
  addCard(grid,'本机 Obsidian',local.connected?'ok':'warn',local.connected?'已连接 · '+local.name+' · '+local.count+' 篇':'当前 AI 页面尚未确认本机 Vault 授权',local.connected?'本机授权状态；提问时仍只检索相关笔记。':'点击“选择本机 Obsidian 文件夹”或通过原工作台知识库入口连接。');
  for(const ep of endpoints){
   const card=addCard(grid,ep.label,'wait','正在检查…','');
   try{const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),8000);let res;try{res=await fetch(ep.url,{cache:'no-store',signal:ctrl.signal,credentials:'same-origin'});}finally{clearTimeout(timer);}
    const data=await res.json().catch(()=>({error:'接口没有返回有效 JSON'}));
    if(!res.ok||data.error)throw Error(data.error||('HTTP '+res.status));
    const result=ep.read(data);paintCard(card,result.ok?'ok':'warn',result.text,result.detail);
   }catch(e){paintCard(card,'bad','检查失败 · '+e.message,'该项尚未验证；请按提示修复后重试。');}
  }
  check.disabled=false;
 });
 models.addEventListener('click',async()=>{
  models.disabled=true;const card=addCard(grid,'公开模型目录','wait','正在请求目录…','目录发现不代表账号拥有调用权限。');
  try{const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),15000);let res;try{res=await fetch('/api/model-discovery?limit=20',{cache:'no-store',signal:ctrl.signal,credentials:'same-origin'});}finally{clearTimeout(timer);}
   const data=await res.json().catch(()=>({error:'接口没有返回有效 JSON'}));if(!res.ok||data.error)throw Error(data.error||('HTTP '+res.status));
   const rows=Array.isArray(data.models)?data.models:Array.isArray(data.results)?data.results:Array.isArray(data.items)?data.items:[];
   paintCard(card,rows.length?'ok':'warn',rows.length?'已发现 '+rows.length+' 个目录条目':'接口响应成功，但没有返回模型条目',String(data.note||data.source||'请继续通过服务商官方 API 测试账号可调用性。'));
   if(rows.length){const list=document.createElement('ul');list.className='p2-capability-model-list';rows.slice(0,20).forEach(x=>{const li=document.createElement('li');li.textContent=[x.name||x.id||x.model||'未命名',x.provider||x.source||''].filter(Boolean).join(' · ');list.append(li);});card.append(list);}
  }catch(e){paintCard(card,'bad','模型目录读取失败 · '+e.message,'这不代表模型不存在；需修复目录服务或使用服务商官方模型列表。');}
  models.disabled=false;
 });
 config.addEventListener('click',()=>{const b=$('#p2-open-config');if(b)b.click();else grid.textContent='未找到现有 API 配置入口，请检查页面脚本是否加载。';});
 continueOld.addEventListener('click',()=>{
  const box=$('#p2-text'),ctx=$('#p2-task-context');
  if(!box)return;
  const wiki='https://tcnb3a3fuvtb.feishu.cn/wiki/YD6HwHCS5iXlgmkpLOoccnvon7b';
  box.value='请继续优化我现有的上岸鸭 v7 学习工作台，不要另起炉灶。请先读取并分析这个飞书 Wiki 的目录、子页面和正文：'+wiki+'。再基于当前仓库代码和已有页面，按“已实现 / 部分实现 / 未配置 / 测试失败”核对历史需求，并优先修复真实阻塞点。\n\n必须保留原首页布局、已有交互、任务清单、截止日期、重要/紧急分类、历史数据和现有 /data 持久化内容；不重复创建任务、不覆盖原任务、不把未读取内容说成已读取。\n\n按顺序核对：1) AI 多轮对话与各服务商官方 API、Key 配置、模型目录发现、账号实际可调用性、失败重试与主模型回退；2) 普通网页、飞书 Wiki 目录/子页、B站/YouTube/其他链接正文或字幕读取；3) 本机 Obsidian「韩奕知识复盘」真实搜索、原文来源与 obsidian:// 跳转，普通问答不依赖知识库；4) 已登录微信的本机桥接、真实群搜索与可见消息读取，清楚区分局部画面和完整历史；5) Word/PDF/表格/图片/音频/视频上传、OCR/字幕/抽帧、通俗讲解视频、思维导图；6) 将结果关联原任务，列出失败接口、根因、修复、验证结果和下一步。不要只增加说明按钮或静态 UI。先做只读检查，再增量修改并运行测试。';
  if(ctx)ctx.value='项目：上岸鸭 v7 学习工作台。目标：在原有版本上修复真实连接并整合历史需求。保留原任务、截止日期、重要/紧急清单、历史数据、页面交互与 /data。优先：AI 官方 API/模型发现与回退；指定飞书 Wiki 及目录子页读取；本机 Obsidian 韩奕知识复盘；授权微信桥接；通用链接、文档、图片、视频、语音解析；回答转思维导图和通俗讲解视频。每项需给出真实状态与可复现验证，不得假装成功。';
  const search=$('#p2-search'),deep=$('#p2-deep');if(search)search.checked=true;if(deep)deep.checked=true;
  box.dispatchEvent(new Event('input',{bubbles:true}));box.focus();statusNote('已载入历史需求和指定飞书 Wiki。发送后会按当前接口能力尝试读取；尚未验证的内容不会自动标记完成。');
 });

}
function statusNote(text){const n=$('#p2-status');if(n)n.textContent=text;}
function addCard(host,label,state,text,detail){
 const card=document.createElement('section');card.className='p2-capability-card';
 const h=document.createElement('strong');h.textContent=label;const status=document.createElement('span');status.className='p2-capability-state '+state;status.textContent=text;
 const p=document.createElement('p');p.textContent=detail||'';card.append(h,status,p);host.append(card);return card;
}
function paintCard(card,state,text,detail){const s=card.querySelector('.p2-capability-state'),p=card.querySelector('p');if(s){s.className='p2-capability-state '+state;s.textContent=text;}if(p)p.textContent=detail||'';}
function style(){
 if($('#p2-capability-audit-style'))return;
 const css=document.createElement('style');css.id='p2-capability-audit-style';css.textContent=`
.p2-capability-audit{margin:0 18px 10px;padding:10px 12px;border:1px solid var(--p2-border,#d7e3dc);border-radius:12px;background:var(--p2-panel,#f7faf8);color:var(--p2-text,#1c332c);font-size:13px}
.p2-capability-audit>summary{cursor:pointer;font-weight:700}.p2-capability-intro,.p2-capability-note{margin:8px 0;color:var(--p2-muted,#64776e);line-height:1.5}
.p2-capability-actions{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.p2-capability-actions button{border:1px solid #cbd9d1;border-radius:8px;background:#fff;padding:7px 10px;cursor:pointer;color:#21483a}.p2-capability-actions button:disabled{opacity:.55;cursor:wait}
.p2-capability-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-top:8px}.p2-capability-card{border:1px solid #dce6e0;border-radius:9px;padding:10px;background:#fff;min-width:0}.p2-capability-card strong{display:block;margin-bottom:7px}.p2-capability-state{display:block;font-weight:600;overflow-wrap:anywhere}.p2-capability-state.ok{color:#26734d}.p2-capability-state.warn{color:#9a6718}.p2-capability-state.bad{color:#b43c38}.p2-capability-state.wait{color:#64776e}.p2-capability-card p{margin:6px 0 0;color:#65776e;line-height:1.45;overflow-wrap:anywhere}.p2-capability-model-list{margin:8px 0 0;padding-left:20px;max-height:180px;overflow:auto}.p2-capability-model-list li{overflow-wrap:anywhere;margin:4px 0}
@media(max-width:640px){.p2-capability-audit{margin:0 8px 8px}.p2-capability-actions button{flex:1}}
`;document.head.append(css);
}
style();if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensurePanel,{once:true});else ensurePanel();
})();