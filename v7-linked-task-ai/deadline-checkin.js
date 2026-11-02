(function (root) {
  'use strict';
  var host=null,active=null,activeAccount='',KEY='sy_deadline_checkins_v1';
  function dueAt(t){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(t.dueDate||''))return Infinity;
    var date=t.dueDate.split('-').map(Number),time=/^(\d{2}):(\d{2})$/.exec(t.dueTime||'23:59');
    if(!time||+time[1]>23||+time[2]>59)return Infinity;
    var d=new Date(date[0],date[1]-1,date[2],+time[1],+time[2]);
    return d.getFullYear()===date[0]&&d.getMonth()===date[1]-1&&d.getDate()===date[2]?d.getTime():Infinity;
  }
  function history(){try{var data=JSON.parse(localStorage.getItem(KEY)||'{}');return data&&typeof data==='object'&&!Array.isArray(data)?data:{};}catch(_){return {};}}
  function signature(t){return String(root.SY.currentAccountKey)+':'+t.id+':'+t.dueDate+':'+(t.dueTime||'23:59');}
  function record(action,progress){if(!active||activeAccount!==String(root.SY.currentAccountKey))return;var h=history();h[signature(active)]={at:Date.now(),action:action,progress:progress||'',until:action==='later'?Date.now()+120000:0};try{localStorage.setItem(KEY,JSON.stringify(h));}catch(_){} }
  function eligible(tasks,now,h){return (tasks||[]).filter(function(t){var at=dueAt(t),entry=h[signature(t)];return !t.done&&at-now<=600000&&now-at<86400000&&(!entry||entry.action==='later'&&now>=entry.until);}).sort(function(a,b){return dueAt(a)-dueAt(b);});}
  function hide(){if(host)host.hidden=true;active=null;}
  function mount(){
    if(host&&host.isConnected)return;
    host=document.createElement('aside');host.className='sy-deadline-banner';host.setAttribute('aria-label','截止前进度提醒');
    host.innerHTML='<header><span>上岸鸭 · 进度提醒</span><button data-deadline="later" aria-label="两分钟后再提醒">稍后</button></header><strong data-deadline-title></strong><p data-deadline-copy role="status"></p><label>现在做到哪里了？<input data-deadline-progress maxlength="500" placeholder="例如：正文已写完，还差检查和提交"></label><div class="sy-deadline-actions"><button data-deadline="working">正在收尾</button><button data-deadline="stuck">遇到困难 · 联网帮我</button><button data-deadline="distracted">走神了</button><button data-deadline="entertainment">被娱乐带走</button><button data-deadline="tired">有点累</button><button data-deadline="open">查看任务</button></div><small>保持网页打开可及时提醒；休眠或关闭期间无法弹出，重新打开后补查。</small>';
    document.body.append(host);
    host.addEventListener('click',function(e){
      var button=e.target.closest('[data-deadline]');if(!button||!active)return;
      if(activeAccount!==String(root.SY.currentAccountKey)){hide();check();return;}
      var task=active,action=button.dataset.deadline,progress=host.querySelector('[data-deadline-progress]').value;
      if(action==='open'){if(root.SY.openTaskModal)root.SY.openTaskModal(task.id);return;}
      record(action,progress);hide();
      if(action==='stuck'&&root.SYRescue)root.SYRescue.open({task:task,question:progress?'目前进度：'+progress+'。请帮我解决剩余问题。':''});
      else if(['distracted','entertainment','tired','working'].includes(action)){
        var message=root.SYCompanion?root.SYCompanion.respond(action==='working'?'focus':action,{taskName:task.name,taskId:task.id,quiet:true}):'回到「'+task.name+'」，先完成眼前的一小步。';
        if(root.SYFocus&&root.SYFocus.feedback)root.SYFocus.feedback(message);
        var tip=document.createElement('div');tip.className='fq-toast';tip.textContent=message;document.body.append(tip);setTimeout(function(){tip.remove();},6000);
      }
      setTimeout(check,300);
    });
  }
  function check(){
    if(!root.SY||document.hidden)return;
    var app=document.getElementById('appHome');if(!app||app.hidden){hide();return;}
    if(active&&activeAccount!==String(root.SY.currentAccountKey))hide();
    var tasks=root.SY.getAcctData().tasks||[],all=eligible(tasks,Date.now(),history());
    if(active&&!all.some(function(t){return signature(t)===signature(active);})){hide();}
    if(!all.length)return;
    var task=all[0],same=active&&signature(active)===signature(task);mount();active=task;activeAccount=String(root.SY.currentAccountKey);
    var dialogs=document.querySelectorAll('dialog[open]'),parent=dialogs.length?dialogs[dialogs.length-1]:document.body;
    if(host.parentElement!==parent)parent.append(host);
    host.hidden=false;host.querySelector('[data-deadline-title]').textContent=task.name;
    var remaining=Math.ceil((dueAt(task)-Date.now())/60000);
    host.querySelector('[data-deadline-copy]').textContent=(remaining>0?'还有 '+remaining+' 分钟截止。':'已经到截止时间了。')+'你现在是什么状态？'+(all.length>1?' 另有 '+(all.length-1)+' 项待确认。':'');
    if(!same)host.querySelector('[data-deadline-progress]').value='';
  }
  root.SYDeadline={dueAt:dueAt,eligible:eligible,check:check};
  if(typeof document!=='undefined'){setInterval(check,15000);setTimeout(check,2000);document.addEventListener('visibilitychange',check);window.addEventListener('focus',check);window.addEventListener('storage',check);}
})(typeof window==='undefined'?globalThis:window);
