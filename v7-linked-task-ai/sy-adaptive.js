(function(){
'use strict'; if(window.SYAdaptive) return;
var dlg=null,activeTab='plan',draft=[],pending=[],timer=null,leisureUnplaced=0;
var today=function(){var d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(x){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x];});};
var acct=function(){return window.SY?String(SY.currentAccountKey||'guest'):'guest';};
var store=function(k){try{return JSON.parse(localStorage.getItem('sy_adaptive_v1:'+acct()+':'+k)||'null');}catch(_){return null;}};
var save=function(k,v){localStorage.setItem('sy_adaptive_v1:'+acct()+':'+k,JSON.stringify(v));};
var owner=function(){return window.SY&&SY.getAcctData?SY.getAcctData():{tasks:[]};};
var tasks=function(){return (owner().tasks||[]).filter(function(t){return !t.done&&!t.completedAt&& (!t.date||t.date<=today());});};
var getActive=function(){var a=owner(),id=(a.activeTimer||{}).taskId||a.priorityFocusTaskId;return (a.tasks||[]).find(function(t){return String(t.id)===String(id);})||tasks()[0]||null;};
var prefs=function(){return Object.assign({energy:3,morning:4,afternoon:3,evening:2,start:'09:00',end:'21:00',buffer:25,leisure:45},store('prefs')||{});};
function el(tag,cl,t){var x=document.createElement(tag);if(cl)x.className=cl;if(t!=null)x.textContent=t;return x;}
function status(s){var x=dlg&&dlg.querySelector('[data-status]');if(x)x.textContent=s;}
function open(tab){if(!window.SY){return;}if(dlg){dlg.close();dlg.remove();}dlg=el('dialog','sy-adaptive-dialog');dlg.innerHTML='<header><div><h2>上岸鸭 · 精力友好型学习规划</h2><p class="sy-subtitle">休息不被挤掉，困难随时能求助，突发情况可以重排</p></div><button class="sy-close" aria-label="关闭">×</button></header><nav class="sy-adaptive-tabs" role="tablist">'+[['plan','每日排程'],['calibration','熟练度估时'],['project','项目 / 视频'],['review','间隔复习'],['knowledge','知识与救援']].map(function(t){return '<button type="button" data-tab="'+t[0]+'">'+t[1]+'</button>';}).join('')+'</nav><main class="sy-adaptive-body"></main>';
dlg.querySelector('.sy-close').onclick=close;dlg.querySelectorAll('[data-tab]').forEach(function(b){b.onclick=function(){tabTo(b.dataset.tab);};});
dlg.addEventListener('cancel',function(e){e.preventDefault();close();});document.body.append(dlg);dlg.showModal();tabTo(tab||'plan');}
function close(){if(dlg){dlg.close();dlg.remove();dlg=null;}if(timer){clearInterval(timer);timer=null;}}
function panel(html){if(!dlg)return null;var p=dlg.querySelector('.sy-adaptive-body');p.innerHTML=html;return p;}
function tabTo(tab){activeTab=tab;if(!dlg)return;dlg.querySelectorAll('[data-tab]').forEach(function(b){b.setAttribute('aria-selected',b.dataset.tab===tab?'true':'false');});if(tab==='plan')showPlan();else if(tab==='calibration')showCalibration();else if(tab==='project')showProject();else if(tab==='review')showReview();else showKnowledge();}
function minTime(x){var a=String(x).split(':');return (Number(a[0])||0)*60+(Number(a[1])||0);}
function fmt(m){return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');}
function budget(p){return Math.max(0,Math.floor(Math.max(0,minTime(p.end)-minTime(p.start)-120)*Math.max(.42,Math.min(.8,(100-p.buffer)/100))*Math.min(1,(.55+p.energy*.09))));}
function personalEnergyLevel(part,p){
 var rows=store('energyHistory')||[],cutoff=Date.now()-14*86400000;
 var vals=rows.filter(function(r){
  var at=Number(r.at||r.timestamp||0),score=Number(r.score||r.energy);
  if(!at||at<cutoff||!Number.isFinite(score)||score<1||score>5)return false;
  var h=new Date(at).getHours();
  return part==='morning'?(h>=5&&h<12):part==='afternoon'?(h>=12&&h<18):(h>=18&&h<24);
 }).slice(-20).map(function(r){return Number(r.score||r.energy);}).sort(function(a,b){return a-b;});
 if(vals.length<3)return Number(p[part]||3);
 var mid=Math.floor(vals.length/2),m=vals.length%2?vals[mid]:(vals[mid-1]+vals[mid])/2;
 return Math.max(1,Math.min(5,Math.round((m*.7+Number(p[part]||3)*.3)*10)/10));
}
function createSchedule(){
 var p=prefs(),allowed=budget(p),remaining=allowed,from=minTime(p.start),end=minTime(p.end),slots=[],rows=[],paused=0;leisureUnplaced=0;
 var fixedItems=(store('fixed')||[]).filter(function(x){return x.day===today()}).map(function(x){return {from:minTime(x.start),to:minTime(x.end),title:x.title,kind:x.kind||'fixed'};}).filter(function(x){return x.to>x.from&&x.from<end&&x.to>from;}).sort(function(a,b){return a.from-b.from;});
 var leisure=Math.max(0,Math.min(180,Number(p.leisure||0))),leisureStart=Math.max(from,Math.min(end-leisure,Math.round((from+end)/2)));
 if(leisure>=10&&leisureStart>=from){
  var candidates=[leisureStart,Math.max(from,end-leisure),from];
  var spot=candidates.find(function(s){return s>=from&&s+leisure<=end&&!fixedItems.some(function(x){return s<x.to&&s+leisure>x.from;});});
  if(spot!==undefined)fixedItems.push({from:spot,to:spot+leisure,title:'自由躺平 · 玩手机 / 发呆 / 看剧（可调整）',kind:'leisure'});
  else{
   var cursor=from,gaps=[];
   fixedItems.slice().sort(function(a,b){return a.from-b.from;}).forEach(function(x){if(x.from>cursor)gaps.push({from:cursor,to:Math.min(end,x.from)});cursor=Math.max(cursor,x.to);});
   if(cursor<end)gaps.push({from:cursor,to:end});
   gaps.sort(function(a,b){return (b.to-b.from)-(a.to-a.from);});
   var leftLeisure=leisure,blocks=[];
   gaps.forEach(function(g){if(leftLeisure<=0)return;var avail=g.to-g.from,take=Math.min(leftLeisure,avail);if(take>=10||take===leftLeisure){blocks.push({from:g.from,to:g.from+take,title:'自由躺平 · 分段保护（可调整）',kind:'leisure'});leftLeisure-=take;}});
   fixedItems=fixedItems.concat(blocks);leisureUnplaced=leftLeisure;
  }
 }
 fixedItems.sort(function(a,b){return a.from-b.from;});
 var items=tasks().map(function(t){return {id:String(t.id),title:t.name||'未命名任务',left:Math.max(10,Math.min(900,Number(t.plannedMinutes||t.estMinutes||40))),energy:t.weight==='heavy'?4:t.weight==='medium'?3:2,priority: t.weight==='heavy'?2:1,due:t.date||today()};});
 var rev=(store('reviews')||[]).filter(function(r){return r.due<=today();}).map(function(r){return {id:'review:'+r.id,title:'复习 · '+r.title,left:Math.max(5,r.minutes||10),energy:2,priority:3,due:r.due};});
 items=items.concat(rev);
 var active=getActive();items.sort(function(a,b){if(active&&a.id===String(active.id))return -1;if(active&&b.id===String(active.id))return 1;return b.priority-a.priority||a.due.localeCompare(b.due);});
 for(var t=from;t<end&&remaining>0;){
   var busy=fixedItems.find(function(x){return t>=x.from&&t<x.to;});
   if(busy){var busyEnd=Math.min(end,busy.to);rows.push({from:t,to:busyEnd,kind:busy.kind,title:busy.title});t=busyEnd;paused=0;continue;}
   var nextFixed=fixedItems.filter(function(x){return x.from>t;}).reduce(function(v,x){return Math.min(v,x.from);},end);
   var fixed=t>=720&&t<780?780:t>=1080&&t<1140?1140:t;
   if(fixed!==t){rows.push({from:t,to:Math.min(fixed,end),kind:'rest',title:t<780?'午餐与休息':'晚餐与恢复'});t=fixed;paused=0;continue;}
   var nextBoundary=Math.min(nextFixed,t<720?720:t<1080?1080:end);
   var part=t<720?'morning':t<1080?'afternoon':'evening',level=personalEnergyLevel(part,p),len=Math.min(level<=2?25:45,remaining,nextBoundary-t);
   if(len<10){t=Math.max(t+1,nextBoundary);continue;}
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
['energy','morning','afternoon','evening','buffer','leisure','start','end'].forEach(function(k){var f=form.querySelector('[name="'+k+'"]');if(f)p[k]=k==='start'||k==='end'?f.value:Number(f.value);});
if(minTime(p.end)<=minTime(p.start)+180){status('可安排时段至少要有 3 小时。');return;}save('prefs',p);var next=createSchedule();draft=next.rows;pending=next.waiting;showPlan('已根据精力、休息及预留时间重新生成草案。');
}
function showPlan(msg){
var p=prefs(),last=store('plan');
if(!draft.length && last && last.at && last.at.slice(0,10)===today() && last.taskCount===tasks().length && Array.isArray(last.rows)){draft=last.rows;pending=last.waiting||[];}
var s=draft.length?{rows:draft,waiting:pending,allowed:budget(p),used:0}:createSchedule();
if(!draft.length){draft=s.rows;pending=s.waiting;}
var all=tasks(),total=all.reduce(function(a,t){return a+Number(t.plannedMinutes||t.estMinutes||40);},0);
var html='<section class="sy-adaptive-card"><h3>今天精力怎么样？先告诉上岸鸭</h3><form data-prefs class="sy-adaptive-grid">'+
 [['energy','整体精力','1|很疲惫,2|偏低,3|一般,4|不错,5|精力充沛'],['morning','上午状态','1|低,2|较低,3|一般,4|高,5|非常高'],['afternoon','下午状态','1|低,2|较低,3|一般,4|高,5|非常高'],['evening','晚上状态','1|低,2|较低,3|一般,4|高,5|非常高'],['start','开始时间',''],['end','结束时间',''],['buffer','突发缓冲比例','20|20%,25|25%,30|30%,35|35%,40|40%'],['leisure','自由躺平时间','15|15分钟,30|30分钟,45|45分钟,60|60分钟,90|90分钟,120|120分钟']].map(function(f){var v=p[f[0]];return '<label>'+f[1]+(f[2]?'<select name="'+f[0]+'">'+f[2].split(',').map(function(o){var z=o.split('|');return '<option value="'+z[0]+'" '+(String(v)===z[0]?'selected':'')+'>'+z[1]+'</option>';}).join('')+'</select>':'<input name="'+f[0]+'" type="time" value="'+esc(v)+'">')+'</label>';}).join('')+'</form>'+
 '<section class="sy-adaptive-card"><h3>先留出不能占用的时间</h3><p class="sy-muted">班会、上课、出行、朋友聚会等优先锁定；娱乐与发呆可在重排时弹性移动，但不会被任务吞掉。</p><div class="sy-adaptive-grid"><label>事件名称<input data-fixed-name placeholder="例如：班级会议 / 上课"></label><label>开始<input type="time" data-fixed-start value="14:00"></label><label>结束<input type="time" data-fixed-end value="15:00"></label></div><div class="sy-actions"><button type="button" data-addfixed>锁定这段时间</button></div><div data-fixed-list></div></section>'+
 '<div class="sy-actions"><button class="sy-adaptive-primary" data-generate>根据今天精力重新排程</button><button data-saveplan>保存当前计划</button><button data-newtask>突发任务来了 · 插入并重排</button></div><div class="sy-muted">原则：午餐和晚餐时段不安排学习；任务之间有休息；永远留出缓冲。最近 14 天每个时段至少 3 条精力自评后，系统会以个人历史中位数（70%）+你设置的时段偏好（30%）调整匹配；样本不足时沿用手动设置。计划草案不改动原始任务顺序与截止日期。</div></section>'+
 '<div class="sy-adaptive-grid two"><section class="sy-adaptive-card"><h3>今天的容量</h3><strong>'+s.allowed+' 分钟</strong><p class="sy-muted">待做任务估算 '+total+' 分钟 · 当前需要安排 '+all.length+' 项任务</p><div class="sy-bar"><span style="width:'+Math.min(100,Math.round(100*total/Math.max(1,s.allowed)))+'%"></span></div><p class="sy-muted">'+(total>s.allowed?'已超出舒适容量，系统会把做不完的任务列在下方。':'有余地，今天不必排满。')+'</p></section><section class="sy-adaptive-card"><h3>当前学习断点</h3><p>'+esc((getActive()||{}).name||'先在今日任务中选中一个任务')+'</p><div class="sy-actions"><button data-rescue>遇到困难 · 从知识库找办法</button><button data-notes>连接 Obsidian</button></div></section></div>'+
 '<section class="sy-adaptive-card"><h3>时间安排草案</h3>'+draft.map(function(r){var type=r.kind==='work'?'专注':r.kind==='rest'?'休息':'机动';return '<div class="sy-plan-row"><span>'+fmt(r.from)+'–'+fmt(r.to)+'</span><span>'+esc(r.title)+'</span><span class="sy-chip '+(r.kind==='work'?'':r.kind)+'">'+type+'</span></div>';}).join('')+'</section>'+
 '<section class="sy-adaptive-card"><h3>今天排不下的任务</h3><p class="sy-muted">'+(pending.length?pending.map(esc).join('、'):'目前没有需要顺延的任务。')+'</p><p class="sy-muted">只给出顺延建议，不自动改动截止日期，也不把未完成任务标记为完成。</p><p class="sy-muted">'+(leisureUnplaced?'仍有 '+leisureUnplaced+' 分钟自由休息未能放入无冲突空档；系统不会覆盖固定事项，请缩短任务或调整休息时段。':'自由休息已纳入时间轴；若与固定事项冲突，会拆成多个空档，不覆盖班会/上课。')+'</p></section><p data-status class="sy-status">'+esc(msg||'排程为建议稿，保存后仍可重新生成。')+'</p>';
var x=panel(html);var fixedHost=x.querySelector('[data-fixed-list]');var fixed=(store('fixed')||[]).filter(function(z){return z.day===today();});
 fixedHost.innerHTML=fixed.length?fixed.map(function(z){return '<p class="sy-muted">'+esc(z.start)+'–'+esc(z.end)+' · '+esc(z.title)+' <button type="button" data-removefixed="'+esc(z.id)+'">移除</button></p>';}).join(''):'<p class="sy-muted">暂无固定事项，班会和课程可在这里加。</p>';
 fixedHost.querySelectorAll('[data-removefixed]').forEach(function(b){b.onclick=function(){save('fixed',(store('fixed')||[]).filter(function(z){return String(z.id)!==b.dataset.removefixed;}));draft=[];showPlan('固定事项已移除，可重新生成排期。');};});
 x.querySelector('[data-addfixed]').onclick=function(){var name=x.querySelector('[data-fixed-name]').value.trim(),start=x.querySelector('[data-fixed-start]').value,end=x.querySelector('[data-fixed-end]').value;if(!name||minTime(end)<=minTime(start))return status('请填写事项名称，确保结束时间晚于开始时间。');var all=store('fixed')||[];all.push({id:String(Date.now()),day:today(),title:name,start:start,end:end,kind:'fixed'});save('fixed',all);draft=[];showPlan('已锁定 '+name+'，重新排程时不会占用这段时间。');};
 x.querySelector('[data-generate]').onclick=setPrefs;
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

function showCalibration(){
 var history=store('calibration')||[],allTasks=(owner().tasks||[]).slice();
 var kinds=[['learning','学习理解'],['research','资料检索'],['writing','写作脚本'],['video','视频制作'],['coding','编程调试'],['admin','沟通杂务']];
 var stages=['选题与目标','检索与核实','阅读与理解','方案与脚本','实操与编码','调试与返工','素材整理','剪辑与交付','沟通与杂务','复盘与总结'];
 var levels=[['first','第一次做'],['novice','做过但不熟'],['familiar','比较熟悉'],['proficient','熟练完成']];
 function med(vals){if(!vals.length)return null;var a=vals.map(Number).filter(function(n){return Number.isFinite(n)&&n>0;}).sort(function(x,y){return x-y;});if(!a.length)return null;var m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
 function matchRows(type,stage,level){return history.filter(function(r){return r.taskType===type&&r.stage===stage&&r.level===level&&Number(r.actualMinutes)>0;}).sort(function(a,b){return Number(a.completedAt||0)-Number(b.completedAt||0);});}
 function selected(){var x=dlg.querySelector('[data-cal-form]');return {name:x.querySelector('[name="taskName"]').value.trim(),type:x.querySelector('[name="taskType"]').value,stage:x.querySelector('[name="stage"]').value,level:x.querySelector('[name="level"]').value,estimate:Number(x.querySelector('[name="estimate"]').value)};}
 function recommend(){
  var f=selected(),rows=matchRows(f.type,f.stage,f.level),vals=rows.map(function(r){return r.actualMinutes;}),m=vals.length>=3?med(vals):null;
  var n=dlg.querySelector('[data-estimate-note]');if(n)n.textContent=m?'同类同熟练度已有 '+vals.length+' 条真实记录；建议以中位数 '+Math.round(m)+' 分钟为工作时长基线。':'同类同熟练度真实记录 '+vals.length+' 条；至少积累 3 条后才启用历史中位数，当前以你自己填写的时间为准。';
  var e=dlg.querySelector('[name="estimate"]');if(e&&m&&!e.dataset.touched)e.value=Math.round(m);
  var factor=f.level==='first'?1.3:1.2,base=(m&&!e.dataset.touched)?m:f.estimate;
  var b=dlg.querySelector('[data-buffer-note]');if(b)b.textContent='计划占用约 '+Math.ceil(Math.max(1,base||1)*factor)+' 分钟（工作时长基线 '+Math.max(1,Math.round(base||1))+' × '+factor+' 缓冲）。缓冲不是效率指标，实际数据积累后再校准。';
  var chart=dlg.querySelector('[data-cal-chart]');if(chart){var recent=rows.slice(-8),max=Math.max.apply(null,recent.map(function(r){return Number(r.actualMinutes)||0;}).concat([1]));chart.innerHTML=recent.length<2?'<p class="sy-muted">同类记录少于 2 次，暂不画趋势线；先记录真实完成时长。</p>':recent.map(function(r,i){var prev=i?Number(recent[i-1].actualMinutes):null,delta=prev?Math.round((prev-Number(r.actualMinutes))*100/prev):null;return '<div class="sycal-row"><span>'+esc(new Date(Number(r.completedAt)||Date.now()).toLocaleDateString())+'</span><span class="sycal-track"><i style="width:'+Math.max(4,Math.round(Number(r.actualMinutes)*100/max))+'%"></i></span><strong>'+Math.round(Number(r.actualMinutes))+'分</strong><em>'+(delta===null?'基线':delta>0?'较上次少 '+delta+'%':delta<0?'较上次多 '+Math.abs(delta)+'%':'与上次持平')+'</em></div>';}).join('');}
 }
 var html='<section class="sy-adaptive-card"><h3>先按你的真实水平估时</h3><p class="sy-muted">先问你是不是第一次做，再按任务环节和熟练度估时。没有足够历史数据时不伪造“新手/老手平均值”；真实记录达到 3 条后，才用同类任务的中位数校准。</p>'+
 '<form data-cal-form class="sy-adaptive-grid"><label>任务名称<input name="taskName" placeholder="例如：剪一条 60 秒口播视频" required></label>'+
 '<label>任务类型<select name="taskType">'+kinds.map(function(k){return '<option value="'+k[0]+'">'+k[1]+'</option>';}).join('')+'</select></label>'+
 '<label>具体环节<select name="stage">'+stages.map(function(s){return '<option>'+s+'</option>';}).join('')+'</select></label>'+
 '<label>你目前的熟练度<select name="level">'+levels.map(function(l){return '<option value="'+l[0]+'">'+l[1]+'</option>';}).join('')+'</select></label>'+
 '<label>你初步估计的工作时长（分钟）<input name="estimate" type="number" min="5" max="1440" value="40" required></label>'+
 '<label>任务负荷<select name="load"><option value="deep">需要集中思考</option><option value="medium">一般脑力</option><option value="light">低负荷杂务</option></select></label></form>'+
 '<p class="sy-muted" data-estimate-note></p><p class="sycal-buffer" data-buffer-note></p>'+
 '<div class="sy-actions"><button type="button" class="sy-adaptive-primary" data-cal-add>加入原任务清单</button><button type="button" data-cal-refresh>按真实历史重新估时</button></div>'+
 '<p class="sy-muted">加入清单前会再次确认。只新增一条任务，不会覆盖原有任务、截止日期或四象限数据；初次任务采用 1.3× 排程缓冲，已有经验任务采用 1.2×。</p></section>'+
 '<section class="sy-adaptive-card"><h3>完成后记录真实用时</h3><p class="sy-muted">这是校准数据的来源。只记录实际情况，不会自动把任务改成已完成。</p>'+
 '<div class="sy-adaptive-grid"><label>关联任务（可选）<select data-log-task><option value="">不关联现有任务 / 手动记录</option>'+allTasks.map(function(t){return '<option value="'+esc(t.id)+'">'+esc(t.name||t.title||'未命名任务')+'</option>';}).join('')+'</select></label>'+
 '<label>实际工作分钟数<input data-actual type="number" min="1" max="1440" value="35"></label>'+
 '<label>完成后精力<select data-energy-after><option value="1">1 · 很疲惫</option><option value="2">2 · 偏低</option><option value="3" selected>3 · 一般</option><option value="4">4 · 不错</option><option value="5">5 · 精力充沛</option></select></label>'+
 '<label>卡住/返工情况<input data-blocker placeholder="可选：查资料卡住 20 分钟"></label></div>'+
 '<div class="sy-actions"><button type="button" class="sy-adaptive-primary" data-cal-log>保存真实用时</button><button type="button" data-cal-stuck>记录卡壳并找一件低负荷任务</button></div><p data-status class="sy-status"></p></section>'+
 '<section class="sy-adaptive-card"><h3>同类任务的真实耗时变化</h3><p class="sy-muted">按当前表单中的类型、环节和熟练度分组；“较上次少/多”只比较相邻两次真实记录，不把它当成能力评价。</p><div data-cal-chart></div></section>'+
 '<section class="sy-adaptive-card"><h3>精力状态自评</h3><p class="sy-muted">这是你主动报告的主观状态，不是摄像头监测或医学诊断。记录用于以后判断什么时段更适合你。</p><div class="sy-adaptive-grid two"><label>此刻精力（1–5）<select data-energy-now><option value="1">1 · 很疲惫</option><option value="2">2 · 偏低</option><option value="3" selected>3 · 一般</option><option value="4">4 · 不错</option><option value="5">5 · 精力充沛</option></select></label><label>状态备注（选填）<input data-energy-note placeholder="例如：开会后脑子很累 / 睡眠不足"></label></div><div class="sy-actions"><button type="button" data-energy-save>记录当前精力</button></div></section>';
 var x=panel(html),form=x.querySelector('[data-cal-form]');
 form.querySelector('[name="estimate"]').addEventListener('input',function(){this.dataset.touched='1';recommend();});
 form.querySelectorAll('select').forEach(function(n){n.addEventListener('change',function(){if(n.name==='level'||n.name==='stage'||n.name==='taskType'){var e=form.querySelector('[name="estimate"]');if(!e.dataset.touched)e.value='40';delete e.dataset.touched;}recommend();});});
 recommend();
 x.querySelector('[data-cal-refresh]').onclick=function(){delete form.querySelector('[name="estimate"]').dataset.touched;recommend();};
 x.querySelector('[data-cal-add]').onclick=function(){
  var f=selected(),load=form.querySelector('[name="load"]').value;
  if(!f.name)return status('请先填写任务名称。');if(!Number.isFinite(f.estimate)||f.estimate<5||f.estimate>1440)return status('工作时长请填 5–1440 分钟。');
  var hist=matchRows(f.type,f.stage,f.level),m=hist.length>=3?med(hist.map(function(r){return r.actualMinutes;})):null,base=Math.round(m||f.estimate),factor=f.level==='first'?1.3:1.2,planned=Math.ceil(base*factor);
  if(!confirm('确认新增任务：'+f.name+'？\n工作时长基线：'+base+' 分钟\n排程占用：约 '+planned+' 分钟（含 '+factor+'× 缓冲）。'))return;
  var a=owner();a.tasks=a.tasks||[];var maxOrder=a.tasks.reduce(function(v,t){return Math.max(v,Number(t.order||0));},0),stamp=Date.now();
  a.tasks.push({id:'sy-cal-'+stamp,name:f.name,category:f.type,taskType:f.type,taskStage:f.stage,skillLevel:f.level,firstTime:f.level==='first',estMinutes:base,plannedMinutes:planned,estimatedWorkMinutes:base,planningBufferMultiplier:factor,weight:load==='light'?'light':load==='deep'?'heavy':'medium',startMinutes:null,date:today(),done:false,completedAt:null,order:maxOrder+1,createdAt:stamp,estimateSource:m?'同类真实记录中位数':'本人初估',estimateSampleCount:hist.length});
  SY.saveAcctData(a);draft=[];pending=[];status('已新增到原任务清单；估时来源：'+(m?'同类 '+hist.length+' 条真实记录':'你的初估')+'。');var s=x.querySelector('[data-status]');if(s)s.textContent='已新增到原任务清单；请回到每日排程查看。';
 };
 x.querySelector('[data-cal-log]').onclick=function(){
  var f=selected(),taskId=x.querySelector('[data-log-task]').value,task=(owner().tasks||[]).find(function(t){return String(t.id)===String(taskId);}),actual=Number(x.querySelector('[data-actual]').value);
  if(!Number.isFinite(actual)||actual<1||actual>1440)return status('实际时长请填 1–1440 分钟。');
  var rows=store('calibration')||[],record={id:'cal-'+Date.now(),taskId:task?String(task.id):'',taskName:task?(task.name||task.title||f.name):f.name||'手动记录',taskType:(task&&task.taskType)||f.type,stage:(task&&task.taskStage)||f.stage,level:(task&&task.skillLevel)||f.level,estimatedWorkMinutes:Number((task&&task.estimatedWorkMinutes)||f.estimate)||null,actualMinutes:actual,energyAfter:Number(x.querySelector('[data-energy-after]').value),blocker:x.querySelector('[data-blocker]').value.trim(),completedAt:Date.now()};
  rows.push(record);history.push(record);save('calibration',rows.slice(-500));var s=x.querySelector('[data-status]');if(s)s.textContent='真实用时已记录。原任务状态未改变；历史校准记录已保存到当前账号浏览器。';recommend();
 };
 x.querySelector('[data-cal-stuck]').onclick=function(){
  var issue=prompt('你卡在什么地方？请用一句话描述。');if(!issue||!issue.trim())return;
  var blockers=store('blockers')||[];blockers.push({id:'block-'+Date.now(),taskId:(getActive()||{}).id||'',taskName:(getActive()||{}).name||'',issue:issue.trim(),at:Date.now()});save('blockers',blockers.slice(-200));
  var light=(owner().tasks||[]).filter(function(t){if(t.done||t.completedAt)return false;var text=String(t.category||'')+' '+String(t.name||t.title||'')+' '+String(t.weight||'');return t.weight==='light'||/整理|归档|回复|收集|核对|预约|杂务|清单/.test(text);}).slice(0,5);
  alert('已记录卡点。先暂停当前高负荷任务，建议切换到一个低负荷、可在 5–15 分钟完成的小任务；之后再把卡点带回知识救援。\n\n'+(light.length?'可选任务：\n'+light.map(function(t){return '• '+(t.name||t.title);}).join('\n'):'当前没有明确标记为低负荷的任务。可去“快速收集”添加一个简单杂务。'));
 };
 x.querySelector('[data-energy-save]').onclick=function(){var rows=store('energyHistory')||[];rows.push({id:'energy-'+Date.now(),at:Date.now(),date:today(),score:Number(x.querySelector('[data-energy-now]').value),note:x.querySelector('[data-energy-note]').value.trim(),source:'用户主动自评',taskName:(getActive()||{}).name||''});save('energyHistory',rows.slice(-500));status('已记录当前精力；这是自评数据，不代表自动监测。');};
}

function rescue(q){var t=getActive();close();if(window.SYRescue&&SYRescue.open){SYRescue.open({task:t||{name:'当前学习任务'},question:q||'我正在做“'+(t?t.name:'学习任务')+'”，卡在某一步。请先查我授权的笔记并给出一个可验证的下一步。',useNotes:!!(window.SYKnowledge&&SYKnowledge.getStatus&&SYKnowledge.getStatus().count)});}else alert('救援模块尚未加载，请回到任务页面重试。');}
function showKnowledge(){
var t=getActive();var html='<section class="sy-adaptive-card"><h3>关联当前任务的个人知识库</h3><p class="sy-muted">当前任务：'+esc((t||{}).name||'尚未选中任务')+'。这里调用原项目已有的 Obsidian 检索与链接读取，不伪造连接状态。</p><label>想查的知识点<input data-knowledge-q placeholder="例如：MCP 配置 / 视频剪辑 / AI 产品经理能力"></label><div class="sy-actions"><button class="sy-adaptive-primary" data-ksearch>检索我授权的笔记</button><button data-kconnect>管理 Obsidian</button><button data-link>导入网页 / B站 / 飞书链接</button><button data-krescue>让 AI 带着当前任务帮我</button></div><div data-results></div></section><p data-status class="sy-status">检索结果来自真实知识库，不会把未连接状态显示为已连接。</p>';
var x=panel(html);x.querySelector('[data-kconnect]').onclick=function(){close();if(window.SYKnowledge)SYKnowledge.open();};
x.querySelector('[data-link]').onclick=function(){close();if(window.SYHub)SYHub.open();};
x.querySelector('[data-krescue]').onclick=function(){var q=x.querySelector('[data-knowledge-q]').value.trim();rescue(q?'我在“'+(t?t.name:'学习任务')+'”中遇到问题：'+q+'。请结合我的授权知识库提供可验证的一步。':'');};
x.querySelector('[data-ksearch]').onclick=async function(){var q=x.querySelector('[data-knowledge-q]').value.trim();if(!q)return status('请先输入检索词。');if(!window.SYKnowledge){status('知识库模块未加载。');return;}var btn=x.querySelector('[data-ksearch]');btn.disabled=true;status('正在检索你授权的本机笔记…');try{var r=await SYKnowledge.search(q),host=x.querySelector('[data-results]');host.replaceChildren();if(!r||!r.length){status('未找到匹配的笔记，检查 Obsidian 是否已经连接。');return;}r.slice(0,15).forEach(function(n){var box=el('div','sy-source'),strong=el('strong','',n.title||n.path||'笔记'),para=el('p','sy-muted',String(n.text||'').slice(0,400));box.append(strong,para);if(n.url&&/^obsidian:\/\/open\?/.test(n.url)){var a=el('a','', '在 Obsidian 中打开 ↗');a.href=n.url;box.append(a);}host.append(box);});status('匹配 '+r.length+' 篇笔记，点击笔记可打开原文。');}catch(e){status('真实检索失败：'+(e.message||e));}finally{btn.disabled=false;}};
}
function mount(){if(!window.SY||!document.querySelector('.app-main-topbar'))return;document.querySelectorAll('.sy-adaptive-launch,#sy-adaptive-summary').forEach(function(n){n.remove();});
 var legacy=document.querySelector('[data-comfort-entry]');if(legacy)legacy.remove();
 var daily=document.getElementById('view-daily');if(!daily)return;
 var container=daily;
 if(!daily.querySelector('[data-comfort-entry]')){
  var entry=el('button','sy-comfort-daily-button','☕ 舒适排期 · 给休息留时间');entry.setAttribute('data-comfort-entry','');entry.type='button';entry.setAttribute('aria-label','打开今日舒适排期');entry.onclick=function(){open('plan')};
  daily.insertBefore(entry,daily.firstChild);
 }

}
window.SYAdaptive={open:open,replan:function(){draft=[];pending=[];open('plan');},version:'1.0'};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();document.addEventListener('sy:ready',mount);
})();