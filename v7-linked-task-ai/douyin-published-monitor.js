(function(root){
'use strict';
if(root.SYDouyinPublishedMonitor&&root.SYDouyinPublishedMonitor.version==='2026-10-31-unified-v1')return;
var dialog=null,VERSION='2026-10-31-unified-v1';
var LEGACY=[
 {title:'飞书《醒图项目学习宝典》',url:'https://my.feishu.cn/wiki/SKIHwV6sLiNE6ZkI9m4cP7K0nwd',type:'私有资料',status:'需要飞书登录；本轮只确认链接，未读取正文',note:'历史项目资料入口。醒图项目已停止，只归档，不自动生成运营任务。'},
 {title:'微信群：醒图变现营❶群',url:'',type:'微信群线索',status:'历史检索曾发现约98条相关记录；不是全量导出',note:'需要本机授权只读桥接或用户导出的聊天记录才能逐条读取。'},
 {title:'微信群：醒图训练营14组',url:'',type:'微信群线索',status:'已确认群名；本轮没有可验证的完整消息正文',note:'不能把群名或搜索摘要当作已读取的教程内容。'},
 {title:'历史双账号运营方案（完整归档）',url:'',type:'历史执行方案',status:'已停止 / 仅供追溯，不得自动恢复',note:'旧账号A方向：AI造型/换装；账号B方向：基础/精细调色（ODD/OOC/OCD术语关系待核实）。旧流程：新号静置约24小时、养号3–5天、同赛道浏览15–20分钟且每日2–3次、自然互动；报白→找爆款参考→剪辑→发布→数据回填。旧视频规格曾要求约30–35秒、9:16、真人口播＋真实手机动态录屏；不接受伪造手机录屏或把HeyGen演示当真实操作。活动旧规则曾要求口播，3天内播放≥500奖励10元。2026-10-23至10-31历史记录主要是选题/脚本/分镜/标题，未找到真实录屏、成片或发布凭证。以上全部是已停止项目的历史记录，不是当前任务。'},
 {title:'作品集中的抖音账号线索：p060316',url:'',type:'账号线索',status:'未核实归属、主页和当前是否运营',note:'仅在旧作品集联系方式中出现，不能据此认定为当前运营账号。'}
];
var OFFICIAL=[
 {title:'抖音社区自律公约',url:'https://trust.douyin.com/',note:'平台倡导原创、优质、真实表达；禁止虚假流量、自动化刷量和侵犯知识产权。'},
 {title:'抖音发布能力使用规范',url:'https://partner.open-douyin.com/docs/resource/zh-CN/dop/operation-standard/platform-capabilities/useclue',note:'第三方发布能力需申请并遵循开放范围；发布内容须有原创度和内容价值。'},
 {title:'发布内容至抖音',url:'https://developer.open-douyin.com/capacity-center-page/capacity-detail/7180322911280955447',note:'发布/分享能力的开放范围、申请流程与支持内容类型。'}
];
function acct(){try{return root.SY&&SY.getAcctData?SY.getAcctData():null}catch(e){return null}}
function save(a){try{if(root.SY&&SY.saveAcctData){SY.saveAcctData(a);return true}}catch(e){}return false}
function tasks(a){return a&&Array.isArray(a.tasks)?a.tasks:[]}
function day(){if(root.SY&&SY.todayKey)return SY.todayKey();var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function uid(){return root.SY&&SY.uid?SY.uid():'dy_'+Date.now()+'_'+Math.random().toString(36).slice(2,8)}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function master(a){return tasks(a).find(function(t){return String(t.importKey||'')==='daily_master_douyin_accounts'||String(t.id||'')==='daily_master_douyin_accounts'})}
function ensureMaster(a){
 var t=master(a);if(t)return t;
 var n=tasks(a).reduce(function(m,x){return Math.max(m,Number(x.order)||0)},0);
 t={id:'daily_master_douyin_accounts',importKey:'daily_master_douyin_accounts',name:'抖音账号运营｜每日先确认主题与交付',category:'运营实战',project:'抖音账号运营',recurring:'daily',date:day(),dueDate:'',estMinutes:45,plannedMinutes:45,startMinutes:null,aiScheduled:false,done:false,completedAt:null,important:true,urgent:false,order:n+1,createdAt:Date.now(),sourceLabel:'每日运营：先核验上次真实执行，再确认当天账号、主题和交付方式。',steps:[]};
 tasks(a).push(t);return t;
}
function data(a){a.douyinOpsByDate=a.douyinOpsByDate||{};return a.douyinOpsByDate[day()]||{}}
function statusLabel(s){return({saved_link:'仅保存链接',needs_auth:'需要授权/登录',manual_read:'已记录人工读取正文',failed:'读取失败',published:'已发布并有作品链接',pending:'待核验'})[s]||s||'待核验'}
function sourceCards(rows,archived){
 return rows.map(function(x){return '<article class="sdpm-source"><div><b>'+esc(x.title)+'</b><small>'+esc(x.type||'历史资料')+' · '+esc(x.status||'待核验')+'</small><p>'+esc(x.note||'')+'</p></div>'+(x.url?'<a href="'+esc(x.url)+'" target="_blank" rel="noopener">打开来源 ↗</a>':'<span class="sdpm-muted">无可验证链接</span>')+'</article>'}).join('');
}
function openSourceDialog(){
 var a=acct();if(!a)return;
 dialog=document.createElement('dialog');dialog.className='sdpm-dialog';
 dialog.innerHTML='<div class="sdpm-shell"><header><div><small>资料中心 · 运营资料收集</small><h2>添加一条运营资料</h2><p>粘贴来源链接，并记录你实际读到的正文要点。只有填写了正文摘要，才会标记为“已记录人工读取”。</p></div><button type="button" data-close>×</button></header><label>资料名称<input data-title placeholder="资料标题 / 视频标题 / 群文件名称"></label><label>来源链接<input data-url type="url" placeholder="粘贴飞书、网页、视频或作品链接"></label><label>读取到的正文要点<textarea data-summary rows="4" placeholder="写下实际打开后看到的内容；如果打不开，写明错误和卡点"></textarea></label><div class="sdpm-actions"><button type="button" data-close>取消</button><button type="button" data-add-material>保存资料记录</button></div></div>';
 document.body.append(dialog);dialog.showModal();
 dialog.querySelectorAll('[data-close]').forEach(function(b){b.onclick=close});
 dialog.querySelector('[data-add-material]').onclick=function(){
  var title=dialog.querySelector('[data-title]').value.trim(),url=dialog.querySelector('[data-url]').value.trim(),summary=dialog.querySelector('[data-summary]').value.trim();
  if(!title&&!url){notify('至少填写资料名称或链接。');return}
  a.douyinMaterialLibrary=Array.isArray(a.douyinMaterialLibrary)?a.douyinMaterialLibrary:[];
  a.douyinMaterialLibrary.push({id:uid(),title:title||url,url:url,summary:summary,status:summary?'manual_read':'saved_link',createdAt:Date.now(),source:'用户添加'});
  save(a);close();render();notify(summary?'已保存资料和人工读取摘要。':'已保存链接；正文仍未读取。');
 };
}
function open(){
 var a=acct();if(!a)return;var t=ensureMaster(a),rec=data(a),posts=Array.isArray(t.publishedPostLinks)?t.publishedPostLinks:[];
 save(a);
 dialog=document.createElement('dialog');dialog.className='sdpm-dialog';
 dialog.innerHTML='<div class="sdpm-shell"><header><div><small>上岸鸭 · 抖音运营闭环</small><h2>先核验上次，再安排今天</h2><p>醒图旧项目仅保留历史资料，不会自动恢复。当前账号和内容方向尚未核实，必须先确认再生成任务。</p></div><button type="button" data-close>×</button></header>'+
 '<section class="sdpm-account"><h3>① 今天的运营目标</h3><label>运营账号<select data-account><option value="">待确认账号</option><option value="A">账号1</option><option value="B">账号2</option><option value="AB">两个账号</option><option value="other">其他账号</option></select></label><label>账号主页链接<input data-profile placeholder="真实主页链接；没有就先留空"></label><label>今天的内容主题<input data-topic placeholder="先写一个明确主题，不沿用旧醒图主题"></label><label>目标受众 / 要解决的问题<input data-audience placeholder="这条内容给谁看，解决什么问题？"></label><label>今天要交付什么<select data-deliverable><option value="短视频成片">短视频成片</option><option value="图文作品">图文作品</option><option value="选题与脚本">选题与脚本</option><option value="账号分析报告">账号分析报告</option><option value="其他">其他（在备注填写）</option></select></label><label>截止日期（选填）<input data-due type="date"></label><label>截止时刻（选填）<input data-time type="time"></label><label>关联资料链接（每行一个）<textarea data-links rows="2" placeholder="粘贴你今天实际要用的教程、网页、视频、文件链接"></textarea></label><label>补充要求 / 当前卡点<textarea data-note rows="2" placeholder="例如：需要真人口播、需要录屏、素材在哪里、当前做到哪一步"></textarea></label><div class="sdpm-actions"><button type="button" data-save-plan>保存主题并拆成今天的执行任务</button></div><p class="sdpm-note">保存后会把资料核验、脚本、制作、发布前检查和发布回填拆成独立任务，接回原任务池。未填写主题不会创建虚假的“已开工”记录。</p></section>'+
 '<section class="sdpm-account"><h3>② 发布后真实数据回填</h3><label>所属账号<select data-post-account><option value="A">账号1</option><option value="B">账号2</option><option value="other">其他</option></select></label><label>作品链接<input data-post-url type="url" placeholder="必须是实际发布后的作品链接"></label><div class="sdpm-grid"><label>播放量<input data-views type="number" min="0" placeholder="真实后台数值"></label><label>点赞<input data-likes type="number" min="0"></label><label>评论<input data-comments type="number" min="0"></label><label>收藏<input data-favs type="number" min="0"></label><label>分享<input data-shares type="number" min="0"></label><label>完播率（%）<input data-finish type="number" min="0" max="100" step="0.1"></label></div><label>数据截图位置 / 证据说明<input data-proof placeholder="例如：抖音创作者中心截图文件名或本机路径"></label><div class="sdpm-actions"><button type="button" data-save-post>保存发布与数据记录</button></div><p class="sdpm-note">没有作品链接时不会标记已发布；没有后台截图/凭证时会标记“数据待核验”。系统不会伪造播放量、完播率或发布状态。</p></section></div>';
 document.body.append(dialog);dialog.showModal();
 var set=function(sel,v){var el=dialog.querySelector(sel);if(el&&v!==undefined&&v!==null)el.value=v};
 set('[data-account]',rec.account||'');set('[data-profile]',rec.profile||'');set('[data-topic]',rec.topic||'');set('[data-audience]',rec.audience||'');set('[data-deliverable]',rec.deliverable||'短视频成片');set('[data-due]',rec.dueDate||'');set('[data-time]',rec.dueTime||'');set('[data-links]',(rec.materialLinks||[]).join('\n'));set('[data-note]',rec.note||'');
 dialog.querySelectorAll('[data-close]').forEach(function(b){b.onclick=close});
 dialog.querySelector('[data-save-plan]').onclick=function(){savePlan(a,t)};
 dialog.querySelector('[data-save-post]').onclick=function(){savePost(a,t)};
}
function savePlan(a,t){
 var read=function(s){return dialog.querySelector(s).value.trim()};
 var account=read('[data-account]'),topic=read('[data-topic]'),audience=read('[data-audience]'),deliverable=read('[data-deliverable]');
 if(!account||!topic){notify('先选定账号并写清今天的内容主题，再生成执行任务。');return}
 var due=read('[data-due]'),time=read('[data-time]'),links=read('[data-links]').split(/\r?\n/).map(function(x){return x.trim()}).filter(Boolean),note=read('[data-note]'),profile=read('[data-profile]');
 var a0=acct()||a,dayKey=day();a0.douyinOpsByDate=a0.douyinOpsByDate||{};
 var rec={date:dayKey,account:account,profile:profile,topic:topic,audience:audience,deliverable:deliverable,dueDate:due,dueTime:time,materialLinks:links,note:note,status:'topic_confirmed',confirmedAt:Date.now(),steps:[]};
 var defs=[
  ['materials','资料读取与选题核验',25,'逐条打开关联资料，记录正文、来源和读取状态；确认选题有真实依据。'],
  ['script','脚本、标题与分镜',30,'形成开头、核心信息、口播/画面、结尾动作和标题；逐项核对事实。'],
  ['production','拍摄/录屏与剪辑',60,'使用本人有权使用的素材完成实际拍摄/录屏与剪辑，保存可打开的成片文件。'],
  ['review','发布前质量与合规核验',15,'核对画面清晰、信息准确、原创性、版权、标题与内容一致；由用户本人确认发布。'],
  ['publish','发布、链接与数据回填',15,'本人完成平台发布；保存真实作品链接、后台数据截图和复盘结论。']
 ];
 var made=[];
 defs.forEach(function(d,i){
  var key='douyin_'+dayKey.replace(/-/g,'')+'_'+d[0],existing=tasks(a0).find(function(x){return x.importKey===key});
  if(!existing){
   var n=tasks(a0).reduce(function(m,x){return Math.max(m,Number(x.order)||0)},0);
   existing={id:uid(),importKey:key,parentTaskId:String(t.id),name:'抖音运营｜'+d[1]+'｜'+topic,category:'运营实战',project:'抖音账号运营',date:dayKey,dueDate:due,dueTime:time,estMinutes:d[2],plannedMinutes:d[2],startMinutes:null,aiScheduled:false,done:false,completedAt:null,important:true,urgent:!!due,hardDeadline:!!due,order:n+1,createdAt:Date.now(),sourceLabel:'今日抖音运营中心；主题由用户确认',sourceUrl:links[0]||'',materialLinks:links,deliverable:d[3],noteFramework:note,steps:[{id:key+'_step',text:d[3],done:false}]};
   tasks(a0).push(existing);
  }else{existing.name='抖音运营｜'+d[1]+'｜'+topic;existing.dueDate=due;existing.dueTime=time;existing.materialLinks=links;existing.sourceUrl=links[0]||'';existing.deliverable=d[3];existing.noteFramework=note;}
  made.push(String(existing.id));rec.steps.push({key:d[0],taskId:String(existing.id),title:d[1],minutes:d[2],done:!!existing.done});
 });
 rec.taskIds=made;a0.douyinOpsByDate[dayKey]=rec;
 t.accountAProfile=account==='A'||account==='AB'?profile:(t.accountAProfile||'');t.accountBProfile=account==='B'||account==='AB'?profile:(t.accountBProfile||'');
 t.lastOpsTopic=topic;t.lastOpsConfirmedAt=Date.now();t.lastOpsStatus='topic_confirmed';t.lastOpsEvidence='今日主题、账号和交付要求已由用户确认；执行结果尚待记录。';
 save(a0);
 if(root.SY&&typeof SY.planDay==='function'&&a0.dailyHours&&a0.dailyHours[dayKey]!==undefined){try{SY.planDay(dayKey,{release:true,report:true})}catch(e){}}
 if(root.SY&&SY.refreshCurrentView)SY.refreshCurrentView();
 close();render();notify('已生成5个独立执行步骤并写回原任务池；请检查今天的排期和空闲时间。');
}
function savePost(a,t){
 var read=function(s){return dialog.querySelector(s).value.trim()};
 var url=read('[data-post-url]'),account=read('[data-post-account]'),proof=read('[data-proof]');
 if(!url){notify('没有真实作品链接，不能标记已发布。');return}
 var a0=acct()||a,task=master(a0);if(!task)return;
 task.publishedPostLinks=Array.isArray(task.publishedPostLinks)?task.publishedPostLinks:[];
 var p={account:account,url:url,views:read('[data-views]'),likes:read('[data-likes]'),comments:read('[data-comments]'),favorites:read('[data-favs]'),shares:read('[data-shares]'),finishRate:read('[data-finish]'),proof:proof,recordedAt:Date.now(),dataVerified:!!proof,status:proof?'published_data_recorded':'published_link_recorded_data_pending'};
 task.publishedPostLinks.push(p);task.publishedPostLinks=task.publishedPostLinks.slice(-100);
 task.lastPublishedAt=Date.now();task.lastPublishedUrl=url;task.lastOpsStatus=proof?'published_data_recorded':'published_link_recorded_data_pending';
 task.lastOpsEvidence=proof||'已登记用户提供的公开作品链接；后台数据凭证待补。';
 save(a0);close();render();notify(proof?'已保存作品链接和数据凭证。':'已保存作品链接；后台数据仍待核验。');
}
function render(){
 var a=acct(),page=document.getElementById('view-daily');if(!a||!page)return;
 var t=ensureMaster(a),rec=data(a),box=document.getElementById('sdpm-center');
 if(!box){box=document.createElement('section');box.id='sdpm-center';box.className='sdpm-center';var anchor=document.getElementById('dac-panel')||document.getElementById('sdei-open');if(anchor&&anchor.parentNode===page)anchor.after(box);else page.insertBefore(box,page.firstChild)}
 var old=LEGACY.concat((a.douyinMaterialLibrary||[]).map(function(x){return{title:x.title,url:x.url,type:'用户上传/补充资料',status:statusLabel(x.status),note:x.summary||'尚未记录正文摘要。'}}));
 var posts=Array.isArray(t.publishedPostLinks)?t.publishedPostLinks.slice(-5).reverse():[];
 var todayStatus=rec.topic?'已确认主题：'+rec.topic:'当前内容方向待确认';
 var tasksToday=(rec.taskIds||[]).map(function(id){return tasks(a).find(function(x){return String(x.id)===String(id)})}).filter(Boolean);
 var completed=tasksToday.filter(function(x){return !!(x.done||x.completedAt)}).length;
 box.innerHTML='<header class="sdpm-center-head"><div><small>DOUYIN OPERATIONS · ONE TASK LOOP</small><h3>抖音账号运营中心</h3><p>历史资料归档、今日主题确认、资料读取、内容制作、发布回填和DDL提醒统一在这里。</p></div><span class="sdpm-state">'+(rec.topic?'今日已确认':'方向待确认')+'</span></header>'+
 '<div class="sdpm-overview"><div><small>今天的主题</small><b>'+esc(todayStatus)+'</b></div><div><small>今日拆解步骤</small><b>'+tasksToday.length+' 项 · '+completed+' 项完成</b></div><div><small>最近发布</small><b>'+(posts.length?esc(posts[0].account)+' · '+esc(new Date(posts[0].recordedAt).toLocaleDateString()):'暂无可核实记录')+'</b></div></div>'+
 '<div class="sdpm-center-actions"><button type="button" data-action="today">＋ 确认今天主题并生成任务</button><button type="button" data-action="material">＋ 添加运营资料</button><button type="button" data-action="export">导出运营台账</button></div>'+
 '<details class="sdpm-fold" open><summary>01 · 历史上传资料与聊天线索（醒图项目已停止，仅归档）</summary><div class="sdpm-source-list">'+sourceCards(old,true)+'</div><p class="sdpm-note">已检索到的历史线索不等于全部资料已下载。飞书文档本轮跳转登录页；微信群消息正文没有可验证的全量导出，因此保留“需授权/未读取”，不编造摘要。</p></details>'+
 '<details class="sdpm-fold"><summary>02 · 官方平台资料与发布规则</summary><div class="sdpm-source-list">'+sourceCards(OFFICIAL,false)+'</div><p class="sdpm-note">工作台不会通过自动化脚本刷浏览、关注、点赞、评论或抓取私密数据。发布操作由账号本人确认。</p></details>'+
 '<details class="sdpm-fold" open><summary>03 · 今天的运营执行进度</summary><div class="sdpm-task-list">'+(tasksToday.length?tasksToday.map(function(x){return '<article><div><b>'+esc(x.name)+'</b><small>'+esc(x.estMinutes||x.plannedMinutes||0)+' 分钟 · '+(x.done||x.completedAt?'已完成':x.executionStatus==='IN_PROGRESS'?'进行中':'待执行')+'</small></div><span>'+(x.done||x.completedAt?'✓':'○')+'</span></article>'}).join(''):'<p class="sdpm-empty">还没有今天的主题和执行任务。先确认账号与内容方向，系统再拆任务。</p>')+'</div></details>'+
 '<details class="sdpm-fold"><summary>04 · 最近发布作品与数据回填</summary><div class="sdpm-post-list">'+(posts.length?posts.map(function(p){return '<article><div><b>'+esc(p.account||'账号待确认')+'</b><small>'+esc(p.url||'无作品链接')+'</small><p>播放 '+esc(p.views||'待录入')+' · 点赞 '+esc(p.likes||'待录入')+' · 收藏 '+esc(p.favorites||'待录入')+' · '+(p.dataVerified?'有凭证':'数据待核验')+'</p></div>'+(p.url?'<a href="'+esc(p.url)+'" target="_blank" rel="noopener">打开作品 ↗</a>':'')+'</article>'}).join(''):'<p class="sdpm-empty">尚无已核实的发布链接。发布后在“今日内容与发布记录”中回填。</p>')+'</div><button type="button" data-action="today">打开发布回填</button></details>'+
 '<p class="sdpm-foot">真实状态说明：账号主页和作品链接需用户提供或从已授权公开页面验证；飞书/微信私有内容需授权；抖音后台指标需创作者中心真实数据凭证。未读取、未发布、未提交均保持原状态。</p>';
 box.onclick=function(e){var b=e.target.closest('button[data-action]');if(!b)return;if(b.dataset.action==='today')open();if(b.dataset.action==='material')openSourceDialog();if(b.dataset.action==='export')exportData(a,t)};
 save(a);
}
function exportData(a,t){
 var payload={exportedAt:new Date().toISOString(),daily:a.douyinOpsByDate||{},materials:a.douyinMaterialLibrary||[],published:t.publishedPostLinks||[],accountClues:{accountAProfile:t.accountAProfile||'',accountBProfile:t.accountBProfile||''},legacy:LEGACY};
 var blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='douyin-ops-ledger-'+day()+'.json';link.click();setTimeout(function(){URL.revokeObjectURL(url)},1000);notify('已导出当前运营台账 JSON。');
}
function close(){if(dialog){dialog.close();dialog.remove();dialog=null}}
function notify(s){var n=document.createElement('div');n.className='sdpm-toast';n.textContent=s;document.body.append(n);setTimeout(function(){n.remove()},5500)}
function mount(){
 var page=document.getElementById('view-daily');if(!page)return;render();
 if(!document.getElementById('sdpm-open')){var b=document.createElement('button');b.id='sdpm-open';b.type='button';b.className='sdpm-entry';b.textContent='🎬 抖音运营｜确认主题、执行与发布回填';b.onclick=open;var box=document.getElementById('sdpm-center');if(box)box.parentNode.insertBefore(b,box);else page.insertBefore(b,page.firstChild)}
}
function boot(){var home=document.getElementById('appHome');if(!home||home.hidden||!acct())return;mount()}
var tries=0,timer=setInterval(function(){tries++;if(root.SY&&acct()&&document.getElementById('appHome')&&!document.getElementById('appHome').hidden){clearInterval(timer);boot()}else if(tries>120)clearInterval(timer)},800);
document.addEventListener('sy:ready',boot);document.addEventListener('visibilitychange',function(){if(!document.hidden)boot()});root.addEventListener('focus',boot);
root.SYDouyinPublishedMonitor={version:VERSION,open:open,mount:mount,render:render,ensureTasks:function(){var a=acct();if(!a)return false;ensureMaster(a);save(a);return true}};
})(window);