(function(){
  'use strict';
  var interval=null,host=null,lastKey='',dismissedUntil=0;
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function today(){return window.SY&&typeof SY.todayKey==='function'?SY.todayKey():new Date().toISOString().slice(0,10);}
  function dueRank(t){return (t.dueDate||'9999-12-31')+'T'+(t.dueTime||'23:59');}
  function dueAt(t){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(t.dueDate||''))return Infinity;
    var parts=t.dueDate.split('-').map(Number),time=/^(\d{1,2}):(\d{2})$/.exec(t.dueTime||'');
    var date=new Date(parts[0],parts[1]-1,parts[2]);
    if(date.getFullYear()!==parts[0]||date.getMonth()!==parts[1]-1||date.getDate()!==parts[2]||(t.dueTime&&!time))return Infinity;
    if(time&&(Number(time[1])>23||Number(time[2])>59))return Infinity;
    return new Date(parts[0],parts[1]-1,parts[2]+(time?0:1),time?Number(time[1]):0,time?Number(time[2]):0).getTime();
  }
  function pending(a){return (a.tasks||[]).filter(function(t){return !t.done;});}
  function pick(a){
    var active=a.activeTimer&&a.activeTimer.taskId,all=pending(a);
    if(active){
      var current=all.find(function(t){return t.id===active;});
      if(current)return {task:current,reason:'你正在做这件事，其他任务先放到等待区。',active:true};
    }
    // “设为当前主线”要跨过下一次 5 分钟检查继续生效；任务完成后自动回到优先级排序。
    var pinned=a.priorityFocusTaskId&&all.find(function(t){return t.id===a.priorityFocusTaskId;});
    if(pinned)return {task:pinned,reason:'这是你刚刚固定的主线，其他任务先留在等待区。',active:false,pinned:true};
    all.sort(function(x,y){return Number(!!y.urgent)-Number(!!x.urgent)||Number(!!y.important)-Number(!!x.important)||dueRank(x).localeCompare(dueRank(y))||Number(x.order||0)-Number(y.order||0);});
    return all.length?{task:all[0],reason:'先把这一件做出一个可见结果，其他任务等它完成或暂停。',active:false}:null;
  }
  function overdue(a){return pending(a).filter(function(t){return dueAt(t)<=Date.now()+30*60000;}).sort(function(x,y){return dueAt(x)-dueAt(y);})[0];}
  function mount(){if(host&&host.isConnected)return host;host=document.createElement('aside');host.className='pg-banner';host.hidden=true;host.innerHTML='<small>主线提醒 · 每 5 分钟</small><strong data-pg-title></strong><p data-pg-copy></p><div class="pg-actions"><button class="pg-main" data-pg="focus">设为当前主线</button><button data-pg="open">打开任务</button><button data-pg="later">稍后提醒</button></div>';document.body.appendChild(host);host.addEventListener('click',function(ev){var b=ev.target.closest('[data-pg]');if(!b)return;var a=window.SY&&SY.getAcctData(),id=host.dataset.task;var t=(a.tasks||[]).find(function(x){return x.id===id;});if(b.dataset.pg==='focus'&&t){a.priorityFocusTaskId=t.id;SY.saveAcctData(a);hide();show('主线已固定：'+t.name,'接下来只推进这一件。其他任务会留在等待区。',t,false);}else if(b.dataset.pg==='open'&&t){hide();if(typeof SY.openTaskModal==='function')SY.openTaskModal(t.id);}else if(b.dataset.pg==='later'){dismissedUntil=Date.now()+300000;hide();}});return host;}
  function show(title,copy,t,alert){var n=mount();n.dataset.task=t.id;n.classList.toggle('pg-alert',!!alert);n.classList.toggle('pg-danger',dueAt(t)<=Date.now());n.querySelector('[data-pg-title]').textContent=title;n.querySelector('[data-pg-copy]').textContent=copy;n.hidden=false;lastKey=t.id+':'+(t.dueDate||'');}
  function hide(){if(host)host.hidden=true;}
  function check(){
    if(window.SYDeadline){hide();return;}
    var app=document.getElementById('appHome');
    if(!window.SY||Date.now()<dismissedUntil||document.hidden||!app||app.hidden||document.querySelector('dialog[open],#tiOverlay,#fqShell:not([hidden])')){hide();return;}
    var a=SY.getAcctData(),tasks=pending(a);
    if(!tasks.length){hide();return;}
    var late=overdue(a),chosen=pick(a);
    if(!chosen)return;
    if(late){var isLate=dueAt(late)<=Date.now();show((isLate?'这件已到截止时间：':'这件即将截止：')+late.name,(isLate?'检查是否已经提交；未完成的话，优先确认下一步。':'距离截止不到 30 分钟，请确认是否需要调整当前安排。')+' 当前任务不会自动切换。',late,true);return;}
    var other=tasks.filter(function(t){return t.id!==chosen.task.id;}).length;
    var deservesSingleTaskReminder=!!(chosen.task.important||chosen.task.urgent||chosen.task.dueDate);
    if(other>0||deservesSingleTaskReminder)show('现在只做：'+chosen.task.name,chosen.reason+(other?' 还有 '+other+' 件待办，先别同时展开。':' 这件事有优先级标记，完成后再处理下一件。'),chosen.task,!!chosen.task.urgent);
    else hide();
  }
  function install(){if(!window.SY)return false;mount();clearInterval(interval);interval=setInterval(check,5*60000);setTimeout(check,1200);return true;}
  if(!install()){document.addEventListener('sy:ready',install);var tries=0,t=setInterval(function(){if(install()||++tries>100)clearInterval(t);},100);}
})();
