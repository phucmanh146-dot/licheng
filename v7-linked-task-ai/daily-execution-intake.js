(function(root){
'use strict';
if(root.SYDailyExecutionIntake)return;
var dlg=null,openedFor='';
function acct(){return root.SY&&SY.getAcctData?SY.getAcctData():null}
function save(a){if(root.SY&&SY.saveAcctData)SY.saveAcctData(a)}
function tasks(a){return a&&Array.isArray(a.tasks)?a.tasks:[]}
function day(){return root.SY&&SY.todayKey?SY.todayKey():new Date().toISOString().slice(0,10)}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
var voiceRecognition=null,voiceTarget=null;
function startVoice(field,button){var R=root.SpeechRecognition||root.webkitSpeechRecognition;if(!R){notify('当前浏览器不支持语音识别，请直接输入文字。');return;}if(voiceRecognition){try{voiceRecognition.stop()}catch(e){}return;}var box=dlg&&dlg.querySelector('[name="'+field+'"]');if(!box)return;voiceTarget=box;voiceRecognition=new R();voiceRecognition.lang='zh-CN';voiceRecognition.continuous=true;voiceRecognition.interimResults=false;voiceRecognition.onresult=function(ev){var out=[];for(var i=ev.resultIndex;i<ev.results.length;i++){if(ev.results[i].isFinal)out.push(ev.results[i][0].transcript)}if(out.length){box.value+=(box.value?'\n':'')+out.join('');}};voiceRecognition.onerror=function(ev){notify('语音识别未成功：'+ev.error+'。可以继续手动填写。')};voiceRecognition.onend=function(){if(button)button.textContent='🎙 语音输入';voiceRecognition=null;voiceTarget=null;};try{voiceRecognition.start();if(button)button.textContent='■ 停止语音';}catch(e){notify('无法启动语音输入，请检查浏览器麦克风权限。');}}
function done(t){return !!(t.done||t.completedAt||t.completed)}
function priority(t){var n=String(t.name||''),p=String(t.project||'');if(/Work Building/.test(n+' '+p))return 0;if(/千雪/.test(n+' '+p))return 1;if(/PRA/.test(n+' '+p))return 2;if(/Agent 大赛 PPT/.test(n+' '+p))return 3;return 4}
function parents(a){return tasks(a).filter(function(t){return !t.parentTaskId&&!done(t)&&(/Work Building|千雪|PRA|Agent 大赛 PPT/.test(String(t.name||'')+' '+String(t.project||'')))}).sort(function(x,y){return priority(x)-priority(y)||String(x.dueDate||'9999').localeCompare(String(y.dueDate||'9999'))})}
function childTasks(a,p){return tasks(a).filter(function(t){return String(t.parentTaskId||'')===String(p.id)&&String(t.importKey||'').indexOf('ddlv3_')===0}).sort(function(x,y){return String(x.date).localeCompare(String(y.date))||Number(x.milestoneStepIndex)-Number(y.milestoneStepIndex)})}
function openTask(id){
 if(root.SY&&SY.switchAppView)SY.switchAppView('daily');
 setTimeout(function(){
  var nodes=Array.prototype.slice.call(document.querySelectorAll('[data-task-id], [data-id]'));
  var row=nodes.find(function(n){return String(n.getAttribute('data-task-id')||n.getAttribute('data-id')||'')===String(id)});
  if(row){row.scrollIntoView({behavior:'smooth',block:'center'});var start=row.querySelector('.app-task-start-btn,[data-start-id],.timeline-block-start');if(start){start.click();return}}
  if(root.SY&&typeof SY.openTaskModal==='function')SY.openTaskModal(id);
 },280);
}
function renderPriority(a){
 var list=parents(a);
 if(!list.length)return '<div class="sdei-empty">当前没有找到这四条主线的未完成父任务。请检查任务是否已归档或完成。</div>';
 return list.map(function(p){
  var kids=childTasks(a,p),completed=kids.filter(done).length,remaining=kids.filter(function(t){return !done(t)}),next=remaining[0],status=p.currentStage||p.ddlPlanStatus||'已建立任务，等待今天确认执行';
  var d=p.dueDate?'截止 '+p.dueDate:'固定开始 '+(p.date||'日期待确认');
  return '<article class="sdei-priority"><header><div><small>P'+priority(p)+' · '+esc(p.project||p.category||'任务主线')+'</small><h3>'+esc(p.name)+'</h3></div><b>'+esc(d)+'</b></header><p>'+esc(status)+'</p>'+(p.progressNote?'<p class="sdei-progress-note">'+esc(p.progressNote)+'</p>':'')+'<div class="sdei-meter"><span>'+completed+'/'+kids.length+' 个拆解步骤完成</span><span>剩余 '+remaining.length+' 项</span></div>'+(kids.length?kids.slice(0,6).map(function(t){return '<div class="sdei-child"><span>'+esc(t.date)+' · '+esc(t.name.replace(p.name+'｜',''))+'</span><em>'+(done(t)?'已完成':t.inProgress||t.executionStatus==='IN_PROGRESS'?'进行中':t.scheduleStatus||'待安排')+'</em></div>'}).join(''):'<div class="sdei-child">拆解步骤正在生成</div>')+'<footer><span>下一步：'+esc(next?next.name.replace(p.name+'｜',''):p.currentStage||'最终验收与提交')+'</span><button type="button" data-open-task="'+esc(next?next.id:p.id)+'">打开任务并开始</button></footer></article>';
 }).join('');
}
function open(){
 var a=acct();if(!a)return;
 var today=day();openedFor=today;
 a.dailyIntakeByDate=a.dailyIntakeByDate||{};
 if(!a.dailyIntakeByDate[today])a.dailyIntakeByDate[today]={promptShownAt:Date.now()};
 else if(!a.dailyIntakeByDate[today].promptShownAt)a.dailyIntakeByDate[today].promptShownAt=Date.now();
 save(a);
 var rec=a.dailyIntakeByDate[today]||{};
 dlg=document.createElement('dialog');dlg.className='sdei-dialog';
 dlg.innerHTML='<div class="sdei-shell"><header><div><small>上岸鸭 · 今日先确认，再开工</small><h2>今天有哪些必须完成的事？</h2><p>先核对真实截止、交付物和上传要求。固定课程不挤占；剩余时间优先推进千雪 AI 与 PRA。</p></div><button type="button" data-close>×</button></header><section class="sdei-priorities"><h3>当前必须推进的主线</h3>'+renderPriority(a)+'</section><form data-intake><label>今天的固定时间事务（课程/会议/实训营开课时刻）<textarea name="fixed" rows="2" placeholder="语音说出或填写：例如 14:00-15:30 实训营上课；固定事务不会被普通任务挤占">'+esc(rec.fixedSchedule||'')+'</textarea><button type="button" class="sdei-voice" data-voice="fixed">🎙 语音填写固定时间</button></label><label>今天新增的硬截止任务与交付要求<textarea name="tasks" rows="4" placeholder="每项一行：任务名称 | 截止日期 | 截止时刻 | 交付物 | 是否上传 | 官方链接 | 当前进度"></textarea><button type="button" class="sdei-voice" data-voice="tasks">🎙 语音填写截止任务</button></label><div class="sdei-grid"><label>今天可投入任务的小时数<input name="hours" type="number" min="0" max="24" step="0.5" value="'+esc(rec.availableHours||'')+'" placeholder="不含固定课程与休息"></label><label>今天精力状态<select name="energy"><option value="">稍后在精力面板确认</option><option value="high">较好，可以做深度任务</option><option value="mid">一般，按短工作段安排</option><option value="low">较低，先拆成小步骤</option></select></label></div><label>昨天未完成/卡住的事情与当前断点<textarea name="blockers" rows="2" placeholder="写清做到哪一步、卡在哪里、还差什么">'+esc(rec.blockers||'')+'</textarea></label><label>随手收集的灵感（每行一条，先记下来，不打断当前主线）<textarea name="ideas" rows="3" placeholder="想到什么先说/写下来；系统会放在硬截止和固定事务之后，只利用空闲时段">'+esc(rec.ideasText||'')+'</textarea><button type="button" class="sdei-voice" data-voice="ideas">🎙 语音收集灵感</button></label><p class="sdei-hint">截止日期、准确时刻、交付物、是否上传和资料来源必须分开记录。未核实的字段保留“待确认”，不会猜测。只输入文本也可以先保存，之后补链接。</p><footer><button type="button" data-close>稍后填写</button><button type="submit">保存今日事实并生成排期</button></footer></form></div>';
 document.body.append(dlg);dlg.showModal();
 dlg.querySelectorAll('[data-close]').forEach(function(b){b.onclick=close});
 dlg.querySelectorAll('[data-voice]').forEach(function(b){b.onclick=function(){startVoice(b.dataset.voice,b)}});
 dlg.querySelectorAll('[data-open-task]').forEach(function(b){b.onclick=function(){var id=b.dataset.openTask;close();openTask(id)}});
 dlg.querySelector('[data-intake]').onsubmit=function(e){e.preventDefault();saveIntake(dlg.querySelector('form'),a)};
}
function close(){if(voiceRecognition){try{voiceRecognition.stop()}catch(e){}voiceRecognition=null;voiceTarget=null;}if(dlg){dlg.close();dlg.remove();dlg=null}}
function saveIntake(form,a){
 var today=day(),fixed=form.elements.fixed.value.trim(),raw=form.elements.tasks.value.trim(),blockers=form.elements.blockers.value.trim(),ideasRaw=(form.elements.ideas&&form.elements.ideas.value||'').trim(),hours=form.elements.hours.value===''?null:Number(form.elements.hours.value),energy=form.elements.energy.value;
 a.dailyIntakeByDate=a.dailyIntakeByDate||{};
 var rec=a.dailyIntakeByDate[today]||{};rec.fixedSchedule=fixed;rec.tasksText=raw;rec.blockers=blockers;rec.ideasText=ideasRaw;rec.availableHours=hours;rec.energy=energy;rec.confirmedAt=Date.now();a.dailyIntakeByDate[today]=rec;
 if(hours!==null&&Number.isFinite(hours)&&hours>=0&&hours<=24){a.dailyHours=a.dailyHours||{};a.dailyHours[today]=hours}
 var added=0;
 raw.split(/\r?\n/).map(function(s){return s.trim()}).filter(Boolean).forEach(function(line){
  var parts=line.split('|').map(function(s){return s.trim()});if(parts.length<2||!parts[0])return;
  var name=parts[0],due=/^\d{4}-\d{2}-\d{2}$/.test(parts[1])?parts[1]:'',dueTime=/^([01]\d|2[0-3]):[0-5]\d$/.test(parts[2]||'')?parts[2]:'';
  var t=tasks(a).find(function(x){return x.name===name&&!x.parentTaskId&&!done(x)});
  if(!t){var max=tasks(a).reduce(function(m,x){return Math.max(m,Number(x.order)||0)},0);t={id:root.SY&&SY.uid?SY.uid():'intake_'+Date.now()+'_'+added,name:name,category:'今日新增交付',project:'每日任务确认',date:today,dueDate:due,dueTime:dueTime,estMinutes:30,plannedMinutes:30,startMinutes:null,done:false,completedAt:null,order:max+1,createdAt:Date.now(),important:true,urgent:!!due,hardDeadline:!!due,steps:['打开并读取原始资料，核对官方要求与准确截止时刻','拆解并完成核心交付内容，记录实际进度与卡点','整理最终交付文件/链接，按验收标准检查完整性','按官方入口完成上传/提交，保存真实提交凭证'],sourceReadStatus:parts[5]&&/^https?:\/\//i.test(parts[5])?'待读取正文':'无资料链接',sourceLabel:'用户在每日开工确认中填写',importKey:'daily_intake_'+today+'_'+added};tasks(a).push(t);added++}
  if(due)t.dueDate=due;if(dueTime)t.dueTime=dueTime;
  t.deliverable=parts[3]||t.deliverable||'';t.uploadRequired=/^(是|需要|yes)$/i.test(parts[4]||'')?true:/^(否|不需要|no)$/i.test(parts[4]||'')?false:null;t.submissionUrl=parts[5]||t.submissionUrl||'';t.progressNote=parts[6]||t.progressNote||'';if(/^https?:\/\//i.test(t.submissionUrl)){t.sourceUrl=t.submissionUrl;t.materials=Array.isArray(t.materials)?t.materials:[];if(!t.materials.some(function(m){return m.url===t.submissionUrl}))t.materials.push({id:'intake-link-'+Date.now(),url:t.submissionUrl,title:'任务原始资料 / 提交入口',source:'每日任务确认',description:'原始链接已绑定到该任务；正文读取状态需在资料中心核验。',addedAt:Date.now()});}t.sourceLabel='用户当日确认；来源/上传要求以实际提供内容为准';
 });
 var ideasAdded=0;ideasRaw.split(/\r?\n/).map(function(s){return s.trim()}).filter(Boolean).forEach(function(line){if(tasks(a).some(function(t){return t.ideaInbox&&String(t.ideaText||t.name||'').trim()===line&&!t.done}))return;var max=tasks(a).reduce(function(m,t){return Math.max(m,Number(t.order)||0)},0);var idea={id:root.SY&&SY.uid?SY.uid():'idea_'+Date.now()+'_'+ideasAdded,name:line,ideaText:line,ideaInbox:true,category:'灵感收集',project:'灵感收集箱',date:today,dueDate:'',dueTime:'',estMinutes:15,plannedMinutes:15,startMinutes:null,done:false,completedAt:null,important:false,urgent:false,weight:'light',scheduleStatus:'等待空闲时段',sourceLabel:'用户每日开工时随手收集',importKey:'idea_inbox_'+today+'_'+ideasAdded,createdAt:Date.now(),order:max+1};tasks(a).push(idea);ideasAdded++;});
 var fixedAdded=0;fixed.split(/\r?\n/).map(function(s){return s.trim()}).filter(Boolean).forEach(function(line){var m=line.match(/([01]?\d|2[0-3]):([0-5]\d)\s*(?:-|—|至|到)\s*([01]?\d|2[0-3]):([0-5]\d)/);if(!m)return;var start=Number(m[1])*60+Number(m[2]),end=Number(m[3])*60+Number(m[4]);if(end<=start)return;var key=today+'|'+start+'|'+end+'|'+line;if(tasks(a).some(function(t){return t.fixedScheduleKey===key}))return;var max=tasks(a).reduce(function(n,t){return Math.max(n,Number(t.order)||0)},0);tasks(a).push({id:root.SY&&SY.uid?SY.uid():'fixed_'+Date.now()+'_'+fixedAdded,name:line.replace(m[0],'').trim()||'固定时间事务',category:'固定事务',project:'每日固定时间',date:today,startMinutes:start,estMinutes:end-start,plannedMinutes:end-start,done:false,completedAt:null,important:true,urgent:false,isFixedTime:true,fixedScheduleKey:key,scheduleSource:'daily-intake-voice-or-text',sourceLabel:'用户当日确认的固定时间；排程不可挪动',order:max+1,createdAt:Date.now()});fixedAdded++;});
 if(root.SYDdlBreakdown&&SYDdlBreakdown.plan)SYDdlBreakdown.plan(a);
 save(a);
 var plan=null;if(hours!==null&&hours>0&&root.SY&&typeof SY.planDay==='function'){try{plan=SY.planDay(today,{release:true,report:true})}catch(e){}}
 if(root.SY&&SY.refreshCurrentView)SY.refreshCurrentView();if(root.SYDdlGuard&&SYDdlGuard.refresh)SYDdlGuard.refresh();
 close();notify('已保存今天的固定事务、截止要求和进度。新增 '+added+' 项截止任务、确认 '+fixedAdded+' 段固定时段、收集 '+ideasAdded+' 条灵感。'+(plan?'已按硬截止优先重新排期；灵感只在剩余空档中参与排程，未排入的仍保留在任务池。':'未提供可用小时数，先保存事实；灵感已收进箱，等待空闲时段。'));
}
function notify(s){var n=document.createElement('div');n.className='sdei-toast';n.textContent=s;document.body.append(n);setTimeout(function(){n.remove()},6500)}
function captureIdea(){var value=prompt('想到什么先记下来，一行一条。系统先放进灵感收集箱，不打断当前主线：');if(!value)return;var a=acct();if(!a)return;var lines=value.split(/\r?\n/).map(function(s){return s.trim()}).filter(Boolean),added=0;lines.forEach(function(line){if(tasks(a).some(function(t){return t.ideaInbox&&String(t.ideaText||t.name||'').trim()===line&&!done(t)}))return;var max=tasks(a).reduce(function(m,t){return Math.max(m,Number(t.order)||0)},0);tasks(a).push({id:root.SY&&SY.uid?SY.uid():'idea_'+Date.now()+'_'+added,name:line,ideaText:line,ideaInbox:true,category:'灵感收集',project:'灵感收集箱',date:day(),dueDate:'',estMinutes:15,plannedMinutes:15,startMinutes:null,done:false,completedAt:null,important:false,urgent:false,weight:'light',scheduleStatus:'等待空闲时段',sourceLabel:'随时收集的灵感',importKey:'idea_capture_'+Date.now()+'_'+added,createdAt:Date.now(),order:max+1});added++;});save(a);var hours=a.dailyHours&&a.dailyHours[day()];if(hours&&root.SY&&SY.planDay){try{SY.planDay(day(),{release:true,report:true})}catch(e){}}if(root.SY&&SY.refreshCurrentView)SY.refreshCurrentView();notify('已收集 '+added+' 条灵感；硬截止任务优先，灵感只利用排程后的空闲时段。');}
function mount(){var page=document.getElementById('view-daily');if(!page||document.getElementById('sdei-open'))return;var b=document.createElement('button');b.id='sdei-open';b.type='button';b.className='sdei-entry';b.textContent='☀️ 今日任务确认｜截止、交付物与开工';b.onclick=open;var idea=document.createElement('button');idea.id='sdei-idea-capture';idea.type='button';idea.className='sdei-idea-entry';idea.textContent='✦ 随手收集灵感｜先记下来，空闲时再排';idea.onclick=captureIdea;var ddl=document.getElementById('sy-ddl-guard');if(ddl&&ddl.parentNode===page){ddl.after(b);b.after(idea)}else{page.insertBefore(idea,page.firstChild);page.insertBefore(b,idea)}}
function boot(){
 var home=document.getElementById('appHome');if(!home||home.hidden||!acct())return;mount();
 var a=acct(),today=day(),rec=a.dailyIntakeByDate&&a.dailyIntakeByDate[today];if(rec&&rec.confirmedAt)return;if(openedFor===today||document.querySelector('.sdei-dialog'))return;
 if(document.querySelector('.sy-douyin-morning-review,.sdpm-dialog'))return;
 open();
}
var tries=0,timer=setInterval(function(){tries++;if(root.SY&&acct()&&document.getElementById('appHome')&&!document.getElementById('appHome').hidden&&!document.querySelector('.sy-douyin-morning-review')){clearInterval(timer);boot()}else if(tries>120)clearInterval(timer)},1000);
document.addEventListener('sy:ready',boot);document.addEventListener('visibilitychange',function(){if(!document.hidden)boot()});window.addEventListener('focus',boot);
root.SYDailyExecutionIntake={open:open,mount:mount,boot:boot};
})(window);