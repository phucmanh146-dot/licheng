(function(){
'use strict'; if(window.SYAdaptive) return;
var dlg=null,activeTab='plan',draft=[],pending=[],timer=null;
var today=function(){var d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(x){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x];});};
var acct=function(){return window.SY?String(SY.currentAccountKey||'guest'):'guest';};
var store=function(k){try{return JSON.parse(localStorage.getItem('sy_adaptive_v1:'+acct()+':'+k)||'null');}catch(_){return null;}};
var save=function(k,v){localStorage.setItem('sy_adaptive_v1:'+acct()+':'+k,JSON.stringify(v));};
var owner=function(){return window.SY&&SY.getAcctData?SY.getAcctData():{tasks:[]};};
var tasks=function(){return (owner().tasks||[]).filter(function(t){return !t.done&&!t.completedAt&& (!t.date||t.date<=today());});};
var getActive=function(){var a=owner(),id=(a.activeTimer||{}).taskId||a.priorityFocusTaskId;return (a.tasks||[]).find(function(t){return String(t.id)===String(id);})||tasks()[0]||null;};
var prefs=function(){return Object.assign({energy:3,morning:4,afternoon:3,evening:2,start:'09:00',end:'21:00',buffer:25},store('prefs')||{});};
function el(tag,cl,t){var x=document.createElement(tag);if(cl)x.className=cl;if(t!=null)x.textContent=t;return x;}
function status(s){var x=dlg&&dlg.querySelector('[data-status]');if(x)x.textContent=s;}
function open(tab){if(!window.SY){return;}if(dlg){dlg.close();dlg.remove();}dlg=el('dialog','sy-adaptive-dialog');dlg.innerHTML='<header><div><h2>上岸鸭 · 精力友好型学习规划</h2><p class="sy-subtitle">休息不被挤掉，困难随时能求助，突发情况可以重排</p></div><button class="sy-close" aria-label="关闭">×</button></header><nav class="sy-adaptive-tabs" role="tablist">'+[['plan','每日排程'],['project','项目 / 视频'],['review','间隔复习'],['knowledge','知识与救援']].map(function(t){return '<button type="button" data-tab="'+t[0]+'">'+t[1]+'</button>';}).join('')+'</nav><main class="sy-adaptive-body"></main>';
dlg.querySelector('.sy-close').onclick=close;dlg.querySelectorAll('[data-tab]').forEach(function(b){b.onclick=function(){tabTo(b.dataset.tab);};});
dlg.addEventListener('cancel',function(e){e.preventDefault();close();});document.body.append(dlg);dlg.showModal();tabTo(tab||'plan');}
function close(){if(dlg){dlg.close();dlg.remove();dlg=null;}if(timer){clearInterval(timer);timer=null;}}
function panel(html){if(!dlg)return null;var p=dlg.querySelector('.sy-adaptive-body');p.innerHTML=html;return p;}
function tabTo(tab){activeTab=tab;if(!dlg)return;dlg.querySelectorAll('[data-tab]').forEach(function(b){b.setAttribute('aria-selected',b.dataset.tab===tab?'true':'false');});if(tab==='plan')showPlan();else if(tab==='project')showProject();else if(tab==='review')showReview();else showKnowledge();}
function minTime(x){var a=String(x).split(':');return (Number(a[0])||0)*60+(Number(a[1])||0);}
function fmt(m){return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');}
function budget(p){return Math.max(0,Math.floor(Math.max(0,minTime(p.end)-minTime(p.start)-120)*Math.max(.42,Math.min(.8,(100-p.buffer)/100))*Math.min(1,(.55+p.energy*.09))));}
function createSchedule(){
 var p=prefs(),allowed=budget(p),remaining=allowed,from=minTime(p.start),end=minTime(p.end),slots=[],rows=[],paused=0;
 var items=tasks().map(function(t){return {id:String(t.id),title:t.name||'未命名任务',left:Math.max(10,Math.min(900,Number(t.plannedMinutes||t.estMinutes||40))),energy:t.weight==='heavy'?4:2,priority: t.weight==='heavy'?2:1,due:t.date||today()};});
 var rev=(store('reviews')||[]).filter(function(r){return r.due<=today();}).map(function(r){return {id:'review:'+r.id,title:'复习 · '+r.title,left:Math.max(5,r.minutes||10),energy:2,priority:3,due:r.due};});
 items=items.concat(rev);
 var active=getActive();items.sort(function(a,b){if(active&&a.id===String(active.id))return -1;if(active&&b.id===String(active.id))return 1;return b.priority-a.priority||a.due.localeCompare(b.due);});
 for(var t=from;t<end&&remaining>0;){
   var fixed=t>=720&&t<780?780:t>=1080&&t<1140?1140:t;
   if(fixed!==t){rows.push({from:t,to:Math.min(fixed,end),kind:'rest',title:t<780?'午餐与休息':'晚餐与恢复'});t=fixed;paused=0;continue;}
   var nextBoundary=t<720?720:t<1080?1080:end;
   var part=t<720?'morning':t<1080?'afternoon':'evening',level=Number(p[part]||3),len=Math.min(level<=2?25:45,remaining,nextBoundary-t);
   if(len<10){t+=Math.max(10,Math.min(20,nextBoundary-t));continue;}
   var eligible=items.filter(function(x){return x.left>0;});
   if(!eligible.length)break;
   eligible.sort(function(a,b){return Math.abs(level-a.energy)-Math.abs(level-b.energy)||b.priority-a.priority;});
   var a=eligible[0],duration=Math.min(len,a.left);
   rows.push({from:t,to:t+duration,kind:'work',title:a.title,id:a.id});a.left-=duration;remaining-=duration;t+=duration;paused+=duration;
   if(paused>=40&&t+10<nextBoundary){rows.push({from:t,to:t+10,kind:'rest',title:'起身 / 喝水 / 远眺（可跳过）'});t+=10;paused=0;}
 }
 var waiting=items.filter(function(x){return x.left>0;}).map(function(x){return x.title+'（剩余'+x.left+'分钟）';});
 if(end>t){var res=Math.min(end-t,Math.max(0,Math.round((minTime(p.end)-from)*p.buffer/100)));if(res>=10)rows.push({from:t,to:t+res,kind:'buffer',title:'保留给突发情况，不提前填满'});}
 return {rows:rows,waiting:waiting,allowed:allowed,used:allowed-remaining,day:today()};
}
function setPrefs(){
var p=prefs(),form=dlg.querySelector('[data-prefs]');if(!form)return;
['energy','morning','afternoon','evening','buffer','start','end'].forEach(function(k){var f=form.querySelector('[name="'+k+'"]');if(f)p[k]=k==='start'||k==='end'?f.value:Number(f.value);});
if(minTime(p.end)<=minTime(p.start)+180){status('可安排时段至少要有 3 小时。');return;}save('prefs',p);var next=createSchedule();draft=next.rows;pending=next.waiting;showPlan('已根据精力、休息及预留时间重新生成草案。');
}
function showPlan(msg){
var p=prefs(),last=store('plan');
if(!draft.length && last && last.at && last.at.slice(0,10)===today() && last.taskCount===tasks().length && Array.isArray(last.rows)){draft=last.rows;pending=last.waiting||[];}
var s=draft.length?{rows:draft,waiting:pending,allowed:budget(p),used:0}:createSchedule();
if(!draft.length){draft=s.rows;pending=s.waiting;}
var all=tasks(),total=all.reduce(function(a,t){return a+Number(t.plannedMinutes||t.estMinutes||40);},0);
var html='<section class="sy-adaptive-card"><h3>今天精力怎么样？先告诉上岸鸭</h3><form data-prefs class="sy-adaptive-grid">'+
 [['energy','整体精力','1|很疲惫,2|偏低,3|一般,4|不错,5|精力充沛'],['morning','上午状态','1|低,2|较低,3|一般,4|高,5|非常高'],['afternoon','下午状态','1|低,2|较低,3|一般,4|高,5|非常高'],['evening','晚上状态','1|低,2|较低,3|一般,4|高,5|非常高'],['start','开始时间',''],['end','结束时间',''],['buffer','突发缓冲比例','20|20%,25|25%,30|30%,35|35%,40|40%']].map(function(f){var v=p[f[0]];return '<label>'+f[1]+(f[2]?'<select name="'+f[0]+'">'+f[2].split(',').map(function(o){var z=o.split('|');return '<option value="'+z[0]+'" '+(String(v)===z[0]?'selected':'')+'>'+z[1]+'</option>';}).join('')+'</select>':'<input name="'+f[0]+'" type="time" value="'+esc(v)+'">')+'</label>';}).join('')+'</form>'+
 '<div class="sy-actions"><button class="sy-adaptive-primary" data-generate>根据今天精力重新排程</button><button data-saveplan>保存当前计划</button><button data-newtask>突发任务来了 · 插入并重排</button></div><div class="sy-muted">原则：午餐和晚餐时段不安排学习；任务之间有休息；永远留出缓冲。计划草案不改动原始任务顺序与截止日期。</div></section>'+
 '<div class="sy-adaptive-grid two"><section class="sy-adaptive-card"><h3>今天的容量</h3><strong>'+s.allowed+' 分钟</strong><p class="sy-muted">待做任务估算 '+total+' 分钟 · 当前需要安排 '+all.length+' 项任务</p><div class="sy-bar"><span style="width:'+Math.min(100,Math.round(100*total/Math.max(1,s.allowed)))+'%"></span></div><p class="sy-muted">'+(total>s.allowed?'已超出舒适容量，系统会把做不完的任务列在下方。':'有余地，今天不必排满。')+'</p></section><section class="sy-adaptive-card"><h3>当前学习断点</h3><p>'+esc((getActive()||{}).name||'先在今日任务中选中一个任务')+'</p><div class="sy-actions"><button data-rescue>遇到困难 · 从知识库找办法</button><button data-notes>连接 Obsidian</button></div></section></div>'+
 '<section class="sy-adaptive-card"><h3>时间安排草案</h3>'+draft.map(function(r){var type=r.kind==='work'?'专注':r.kind==='rest'?'休息':'机动';return '<div class="sy-plan-row"><span>'+fmt(r.from)+'–'+fmt(r.to)+'</span><span>'+esc(r.title)+'</span><span class="sy-chip '+(r.kind==='work'?'':r.kind)+'">'+type+'</span></div>';}).join('')+'</section>'+
 '<section class="sy-adaptive-card"><h3>今天排不下的任务</h3><p class="sy-muted">'+(pending.length?pending.map(esc).join('、'):'目前没有需要顺延的任务。')+'</p><p class="sy-muted">只给出顺延建议，不自动改动截止日期，也不把未完成任务标记为完成。</p></section><p data-status class="sy-status">'+esc(msg||'排程为建议稿，保存后仍可重新生成。')+'</p>';
var x=panel(html);x.querySelector('[data-generate]').onclick=setPrefs;
x.querySelector('[data-saveplan]').onclick=function(){save('plan',{at:new Date().toISOString(),rows:draft,waiting:pending,taskCount:tasks().length});status('计划已经独立保存到当前账号，不覆盖任务和截止日期。');};
x.querySelector('[data-rescue]').onclick=function(){rescue();};x.querySelector('[data-notes]').onclick=function(){close();if(window.SYKnowledge)SYKnowledge.open();};
x.querySelector('[data-newtask]').onclick=addUrgent;
}
function addUrgent(){
var name=prompt('突发任务是什么？例如：导师临时让整理会议纪要');if(!name||!name.trim())return;
var mins=Number(prompt('预计需要多少分钟？','30'));if(!Number.isFinite(mins)||mins<5||mins>600){status('请输入 5 至 600 分钟。');return;}
if(!confirm('确认将这条突发任务添加到原有任务清单，并重新生成今天的时间草案？'))return;
var a=owner();a.tasks=a.tasks||[];var maxOrder=a.tasks.reduce(function(m,t){return Math.max(m,Number(t.order||0));},0);
a.tasks.push({id:'sy-adaptive-'+Date.now(),name:name.trim(),category:'其他',estMinutes:mins,plannedMinutes:mins,firstTime:false,multiplier:1,startMinutes:null,date:today(),done:false,completedAt:null,order:maxOrder+1,createdAt:Date.now(),weight:'heavy'});
SY.saveAcctData(a);var next=createSchedule();draft=next.rows;pending=next.waiting;showPlan('突发任务已加入原清单；未改动其他任务，新的剩余计划已计算。');
}
function showProject(){
var stages=[['选题与目标','策划',30,'明确受众、主题、视频目标与核心信息'],['资料检索与核实','策划',60,'筛选可信来源并提取信息'],['分镜与脚本','脚本',90,'结构大纲、口播稿、镜头分镜'],['口播练习','拍摄',30,'对照脚本练习，不追求一次完成'],['录制与素材整理','拍摄',75,'录制、补镜头、素材命名'],['剪辑与字幕','后期',150,'粗剪、节奏、字幕、音画核对'],['封面与发布复盘','发布',60,'封面、标题、发布校验与数据复盘']];
var html='<section class="sy-adaptive-card"><h3>大项目 → 阶段 → 小任务 → 时间块</h3><p class="sy-muted">不要把“做一个视频”写成一条 8 小时任务。每个阶段可分多天完成，休息和缓冲会自动保留。</p><label>项目名称<input data-project-name placeholder="例如：AI 产品经理 · 竞赛攻略口播视频" value="制作一条 AI 学习经验视频"></label><div class="sy-actions"><button class="sy-adaptive-primary" data-add-project>把下列阶段加入原任务清单</button></div></section><section class="sy-adaptive-card"><h3>视频项目分级模板</h3>'+stages.map(function(s,i){return '<div class="sy-progress"><strong>'+(i+1)+'. '+s[1]+' / '+s[0]+' · '+s[2]+' 分钟</strong><p>'+s[3]+'</p></div>';}).join('')+'</section><p class="sy-status" data-status>共 '+stages.reduce(function(a,x){return a+x[2];},0)+' 分钟工作量；不会强行在一天做完。</p>';
var x=panel(html);x.querySelector('[data-add-project]').onclick=function(){var nm=x.querySelector('[data-project-name]').value.trim();if(!nm)return status('请填写项目名称。');if(!confirm('将 '+stages.length+' 个视频制作步骤加入你当前账号的原任务清单？'))return;var a=owner();a.tasks=a.tasks||[];var offset=a.tasks.reduce(function(v,t){return Math.max(v,Number(t.order||0));},0);var stamp=Date.now();stages.forEach(function(s,i){a.tasks.push({id:'sy-video-'+stamp+'-'+i,name:nm+' / '+s[1]+' / '+s[0],category:'其他',estMinutes:s[2],plannedMinutes:s[2],firstTime:false,multiplier:1,startMinutes:null,date:today(),done:false,completedAt:null,order:offset+i+1,createdAt:stamp+i,weight: i===0||i===3?'light':'heavy',noteFramework:'视频项目：'+nm+'；子阶段：'+s[1]+'；验收：'+s[3]});});SY.saveAcctData(a);draft=[];pending=[];status('已加入原任务清单。点击“每日排程”查看哪些适合今天完成。');};}
function showReview(){
var data=store('reviews')||[];var due=data.filter(function(r){return r.due<=today();});
var html='<section class="sy-adaptive-card"><h3>把知识点变成主动回忆</h3><div class="sy-adaptive-grid two"><label>知识点标题<input data-rt placeholder="例如：MCP 服务端与客户端的区别"></label><label>预计复习时间（分钟）<input data-rm type="number" min="5" max="60" value="10"></label></div><div class="sy-actions"><button class="sy-adaptive-primary" data-add-review>加入复习计划</button></div><p class="sy-muted">初始复习参考 1、3、7、14、30 天；这不是精确的“遗忘曲线公式”。复习时主动回忆并根据实际掌握情况调整下一次间隔。</p></section><section class="sy-adaptive-card"><h3>今天该回忆的知识点 · '+due.length+'</h3>'+(due.length?due.map(function(r){return '<div class="sy-plan-row"><span>'+esc(r.due)+'</span><span>'+esc(r.title)+'</span><span><button data-review="'+esc(r.id)+'">评分</button></span></div>';}).join(''):'<p class="sy-muted">今天没有到期的知识点，可以新建一个。</p>')+'</section><section class="sy-adaptive-card"><h3>后续复习</h3>'+(data.filter(function(r){return r.due>today();}).slice(0,20).map(function(r){return '<div class="sy-plan-row"><span>'+esc(r.due)+'</span><span>'+esc(r.title)+'</span><span class="sy-chip">待复习</span></div>';}).join('')||'<p class="sy-muted">暂无</p>')+'</section><p data-status class="sy-status"></p>';
var x=panel(html);x.querySelector('[data-add-review]').onclick=function(){var name=x.querySelector('[data-rt]').value.trim(),m=Number(x.querySelector('[data-rm]').value);if(!name||!Number.isFinite(m)||m<5||m>60)return status('请输入知识点标题和 5–60 分钟的时间。');data.push({id:'r-'+Date.now(),title:name,minutes:m,step:0,due:today(),history:[]});save('reviews',data);draft=[];showReview();};x.querySelectorAll('[data-review]').forEach(function(btn){btn.onclick=function(){var r=data.find(function(z){return z.id===btn.dataset.review;});if(!r)return;var grade=prompt('回忆效果：0 = 没想起来；1 = 有点困难；2 = 基本正确；3 = 很熟练','2');if(!['0','1','2','3'].includes(String(grade)))return;var g=Number(grade);r.step=g===0?0:Math.min(4,r.step+(g>=2?1:0));var base=[1,3,7,14,30][r.step];var delta=g===0?1:g===1?Math.max(1,Math.round(base*.6)):g===3?Math.round(base*1.5):base;var date=new Date();date.setDate(date.getDate()+delta);r.due=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');r.history.push({date:today(),grade:g});save('reviews',data);draft=[];showReview();};});}
function rescue(q){var t=getActive();close();if(window.SYRescue&&SYRescue.open){SYRescue.open({task:t||{name:'当前学习任务'},question:q||'我正在做“'+(t?t.name:'学习任务')+'”，卡在某一步。请先查我授权的笔记并给出一个可验证的下一步。',useNotes:!!(window.SYKnowledge&&SYKnowledge.getStatus&&SYKnowledge.getStatus().count)});}else alert('救援模块尚未加载，请回到任务页面重试。');}
function showKnowledge(){
var t=getActive();var html='<section class="sy-adaptive-card"><h3>关联当前任务的个人知识库</h3><p class="sy-muted">当前任务：'+esc((t||{}).name||'尚未选中任务')+'。这里调用原项目已有的 Obsidian 检索与链接读取，不伪造连接状态。</p><label>想查的知识点<input data-knowledge-q placeholder="例如：MCP 配置 / 视频剪辑 / AI 产品经理能力"></label><div class="sy-actions"><button class="sy-adaptive-primary" data-ksearch>检索我授权的笔记</button><button data-kconnect>管理 Obsidian</button><button data-link>导入网页 / B站 / 飞书链接</button><button data-krescue>让 AI 带着当前任务帮我</button></div><div data-results></div></section><p data-status class="sy-status">检索结果来自真实知识库，不会把未连接状态显示为已连接。</p>';
var x=panel(html);x.querySelector('[data-kconnect]').onclick=function(){close();if(window.SYKnowledge)SYKnowledge.open();};
x.querySelector('[data-link]').onclick=function(){close();if(window.SYHub)SYHub.open();};
x.querySelector('[data-krescue]').onclick=function(){var q=x.querySelector('[data-knowledge-q]').value.trim();rescue(q?'我在“'+(t?t.name:'学习任务')+'”中遇到问题：'+q+'。请结合我的授权知识库提供可验证的一步。':'');};
x.querySelector('[data-ksearch]').onclick=async function(){var q=x.querySelector('[data-knowledge-q]').value.trim();if(!q)return status('请先输入检索词。');if(!window.SYKnowledge){status('知识库模块未加载。');return;}var btn=x.querySelector('[data-ksearch]');btn.disabled=true;status('正在检索你授权的本机笔记…');try{var r=await SYKnowledge.search(q),host=x.querySelector('[data-results]');host.replaceChildren();if(!r||!r.length){status('未找到匹配的笔记，检查 Obsidian 是否已经连接。');return;}r.slice(0,15).forEach(function(n){var box=el('div','sy-source'),strong=el('strong','',n.title||n.path||'笔记'),para=el('p','sy-muted',String(n.text||'').slice(0,400));box.append(strong,para);if(n.url&&/^obsidian:\/\/open\?/.test(n.url)){var a=el('a','', '在 Obsidian 中打开 ↗');a.href=n.url;box.append(a);}host.append(box);});status('匹配 '+r.length+' 篇笔记，点击笔记可打开原文。');}catch(e){status('真实检索失败：'+(e.message||e));}finally{btn.disabled=false;}};
}
function mount(){if(!window.SY||!document.querySelector('.app-main-topbar'))return;var target=document.querySelector('.app-topbar-right');if(target&&!target.querySelector('.sy-adaptive-launch')){var btn=el('button','btn btn-sm sy-adaptive-launch','智能排程 · 休息与复习');btn.type='button';btn.onclick=function(){open('plan');};target.prepend(btn);}
var main=document.querySelector('.app-main'),summary=document.getElementById('sy-adaptive-summary');if(!summary&&main){summary=el('section','sy-adaptive-summary');summary.id='sy-adaptive-summary';summary.innerHTML='<div><strong>☀️ 今天别排太满，给自己留点余地</strong><p>先看精力，再安排学习与休息；卡住可检索知识库，突发任务自动重排剩余计划。</p></div>';var b=el('button','','生成今日舒适排程 →');b.type='button';b.onclick=function(){open('plan');};summary.append(b);var bar=main.querySelector('.app-main-topbar');if(bar)bar.after(summary);else main.prepend(summary);}
}
window.SYAdaptive={open:open,replan:function(){draft=[];pending=[];open('plan');},version:'1.0'};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();document.addEventListener('sy:ready',mount);
})();