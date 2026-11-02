(function () {
  'use strict';
  var mode='text',drafts=[],recognition=null,listening=false,inputText='',statusText='',lastSource=null,epoch=0,owner='',loading=false,previewFiles=[];
  function e(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function dateKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function today(){return dateKey(new Date());}
  function validDate(s){var p=String(s).split('-').map(Number);return dateKey(new Date(p[0],p[1]-1,p[2]))===s;}
  function number(s){if(/^\d+$/.test(s))return Number(s);var digits='零一二三四五六七八九';s=s.replace(/两/g,'二');if(s==='十')return 10;if(s.includes('十')){var p=s.split('十');return (p[0]?digits.indexOf(p[0]):1)*10+(p[1]?digits.indexOf(p[1]):0);}return digits.indexOf(s);}
  function deadline(s){
    var date=null,time=null,m,d=new Date();
    if(/后天/.test(s))d.setDate(d.getDate()+2);else if(/明天|明日/.test(s))d.setDate(d.getDate()+1);
    if(/后天|明天|明日|今天|今日|今晚/.test(s))date=dateKey(d);
    m=s.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/);
    if(m)date=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
    else {m=s.match(/(\d{1,2})月(\d{1,2})日?/);if(m)date=new Date().getFullYear()+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0');else {m=s.match(/(\d{1,2})号/);if(m)date=today().slice(0,8)+m[1].padStart(2,'0');}}
    m=s.match(/(凌晨|早上|上午|中午|下午|晚上|今晚)?\s*([零一二两三四五六七八九十\d]{1,3})(?:点|[:：])([零一二三四五六七八九十\d]{1,3}|半)?/);
    if(m){var h=number(m[2]),minute=m[3]==='半'?30:m[3]?number(m[3]):0;if(/中午|下午|晚上|今晚/.test(m[1]||'')&&h<12)h+=12;if(/凌晨|上午|早上/.test(m[1]||'')&&h===12)h=0;if(h>=0&&h<24&&minute>=0&&minute<60)time=String(h).padStart(2,'0')+':'+String(minute).padStart(2,'0');}
    if(date&&!validDate(date))date=null;return {date:date,time:time};
  }
  function remember(){var box=document.getElementById('tiText');if(box)inputText=box.value;}
  function shell(){epoch++;var account=String(SY.currentAccountKey);if(owner!==account){inputText='';drafts=[];lastSource=null;previewFiles=[];statusText='';owner=account;}loading=false;var old=document.getElementById('tiOverlay');if(old)old.remove();document.body.insertAdjacentHTML('beforeend','<section class="ti-overlay" id="tiOverlay"><div class="ti-card" role="dialog" aria-modal="true" aria-label="快速收集"><header class="ti-head"><div><p>QUICK HARBOR · 今日任务入口</p><h2>先收进来，再专心做一件</h2><span class="ti-head-note">把外部资料带进来，原链接仍然保留，打开时回到对应客户端或浏览器。</span></div><button class="ti-close" data-ti="close" aria-label="关闭">×</button></header><nav class="ti-mode"><button data-ti-mode="voice">🎙 语音收集</button><button data-ti-mode="wechat">💬 微信复制导入</button><button data-ti-mode="text">✎ 手动粘贴</button></nav><section class="ti-integrations" aria-label="外部连接"><article class="ti-connector ti-connector-wechat"><div class="ti-connector-icon">💬</div><div><h3>微信</h3><p>唤起本机微信，复制聊天、群公告或公众号内容回来。</p></div><button data-ti="wechat-open">打开微信客户端</button></article><article class="ti-connector ti-connector-feishu"><div class="ti-connector-icon">▣</div><div><h3>飞书 / 微信 / 网页链接</h3><p>粘贴分享文字，读取正文和标题目录，再拆成小关。</p></div><input id="tiFeishuUrl" type="text" inputmode="url" placeholder="粘贴飞书、微信、B站、YouTube 或其他链接" autocomplete="url"><div class="ti-connector-actions"><button data-ti="feishu-read">读取正文</button><button data-ti="feishu-open" class="ti-link-button">↗ 浏览器打开</button></div></article><article class="ti-connector ti-connector-obsidian"><div class="ti-connector-icon">⌁</div><div><h3>Obsidian</h3><p>像打开分享链接一样，直接跳转到 Obsidian；也可连接文件夹读取笔记。</p></div><div class="ti-connector-actions"><button data-ti="obsidian-open">打开 Obsidian ↗</button><button data-ti="knowledge">读取知识库</button><button data-ti="knowledge-ai" class="ti-ai-entry">连接 + AI</button></div></article></section><div id="tiBody"></div></div></section>');render();}
  function panel(){return '<div class="ti-panel">'+(mode==='voice'?'<div class="ti-mic"><div><button data-ti="mic" aria-label="'+(listening?'停止识别':'开始语音识别')+'">'+(listening?'■':'●')+'</button><p>'+(listening?'正在听，请说出任务和截止时间':'点一下，说出今天要做的事')+'</p></div></div>':'')+'<textarea id="tiText" rows="5" placeholder="例如：非常重要，今天晚上八点交作业；复习第三章二十分钟。一行一项也可以。">'+e(inputText)+'</textarea>'+(mode==='wechat'?'<p class="ti-note">点击“打开微信客户端”后，在微信里复制群公告、聊天文字或公众号内容，再回到这里粘贴。网页不能绕过微信权限自动读取私聊或群聊。</p>':'')+'<div class="ti-drop" data-ti-drop tabindex="0" role="button" aria-label="拖入或选择文档和图片">拖入微信文件、Word、PDF、图片或字幕，也可点击从磁盘选择<input id="tiDocs" type="file" multiple accept=".txt,.md,.csv,.json,.srt,.vtt,.html,.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.gif,.bmp" hidden></div><p class="ti-note">会识别你明确说出的重要程度和日期。没说清楚的截止时间留给你补充。</p></div>';}
  function preview(x,i){return '<article class="ti-draft" data-ti-row="'+i+'"><label class="ti-pick"><input type="checkbox" data-ti-field="selected" data-i="'+i+'" '+(x.selected?'checked':'')+'>收集这项</label><label class="ti-edit-title">任务<input data-ti-field="name" data-i="'+i+'" maxlength="180" value="'+e(x.name)+'"></label><div class="ti-edit-grid"><label>截止日期 · 可留空<input type="date" data-ti-field="dueDate" data-i="'+i+'" value="'+e(x.dueDate||'')+'"></label><label>截止时间<input type="time" data-ti-field="dueTime" data-i="'+i+'" value="'+e(x.dueTime||'')+'"></label><label>预计分钟<input type="number" min="5" max="240" data-ti-field="minutes" data-i="'+i+'" value="'+x.minutes+'"></label><label>分类 · 可以自己改<input data-ti-field="category" data-i="'+i+'" maxlength="30" value="'+e(x.category)+'"></label></div><div class="ti-flags"><label><input type="checkbox" data-ti-field="important" data-i="'+i+'" '+(x.important?'checked':'')+'>重要</label><label><input type="checkbox" data-ti-field="urgent" data-i="'+i+'" '+(x.urgent?'checked':'')+'>紧急</label><span>'+(!x.dueDate?'截止日期待补充':!x.dueTime?'当天结束前':'已明确截止时间')+'</span></div></article>';}
  function render(){var body=document.getElementById('tiBody');if(!body)return;document.querySelectorAll('[data-ti-mode]').forEach(function(b){b.classList.toggle('is-on',b.dataset.tiMode===mode);});body.innerHTML=panel()+'<div class="ti-actions"><button data-ti="source-route">按资料目录闯关</button><button data-ti="manual-capture">手动摘取文章</button><button data-ti="extract">识别任务</button><button class="primary" data-ti="schedule">确认收集并排程</button></div><div class="ti-status" id="tiStatus" role="status">'+e(statusText)+'</div><div class="ti-preview">'+drafts.map(preview).join('')+'</div>';var tray=document.createElement('div');tray.className='sy-import-previews';previewFiles.forEach(function(file){var img=document.createElement('img');img.src=URL.createObjectURL(file);img.alt=file.name;img.onload=function(){URL.revokeObjectURL(img.src);};tray.append(img);});body.querySelector('.ti-drop').after(tray);}
  function parse(text){
    var parts=String(text||'').replace(/\r\n?/g,'\n').replace(/[。；;]/g,'\n').split('\n').map(function(s){return s.replace(/^\s*(?:[-*•]|\d+[.、)])\s*/,'').trim();}).filter(function(s){return s.length>2;}),seen={},a=SY.getAcctData(),cat=(a.categories||[]).find(function(c){return /学习|作业/.test(c.name);});
    return parts.filter(function(s){if(seen[s])return false;seen[s]=true;return true;}).slice(0,20).map(function(s){var m=s.match(/([一二两三四五六七八九十\d]+)\s*分钟/),dl=deadline(s);return {name:s.slice(0,180),minutes:m?Math.max(5,Math.min(240,number(m[1]))):25,dueDate:dl.date,dueTime:dl.time,important:/(重要|优先|必须|务必)/.test(s)&&!/(不重要|不太重要|非重要)/.test(s),urgent:/(紧急|尽快|马上)/.test(s)&&!/(不紧急|不急)/.test(s),selected:true,category:cat?cat.name:'学习'};});
  }
  function extract(){remember();drafts=parse(inputText);statusText=drafts.length?'识别到 '+drafts.length+' 项。先核对截止时间和重要程度，取消不需要的项目。':'还没识别出任务，试试一行写一项。';render();}
  function setStatus(s){statusText=s;var n=document.getElementById('tiStatus');if(n)n.textContent=s;}
  function schedule(){
    if(!drafts.length){extract();return;}var picks=drafts.filter(function(x){return x.selected;});
    if(!picks.length){setStatus('当前没有勾选任务，不会添加任何项目。');return;}
    if(picks.some(function(x){return !x.name.trim()||!x.category.trim()||(x.dueTime&&!x.dueDate)||(x.dueDate&&!validDate(x.dueDate));})){setStatus('请补全任务名和分类；只有时刻的项目还需要填写日期。');return;}
    var S=window.SY,a=S.getAcctData(),date=today(),now=new Date(),cursor=Math.ceil((now.getHours()*60+now.getMinutes()+10)/15)*15,unscheduled=0;
    a.tasks=a.tasks||[];a.categories=a.categories||[];
    picks.sort(function(x,y){return Number(y.urgent)-Number(x.urgent)||Number(y.important)-Number(x.important)||((x.dueDate||'9999')+' '+(x.dueTime||'23:59')).localeCompare((y.dueDate||'9999')+' '+(y.dueTime||'23:59'));});
    var occupied=a.tasks.filter(function(x){return !x.done&&x.date===date&&Number.isFinite(x.startMinutes);}).map(function(x){return [x.startMinutes,x.startMinutes+(x.plannedMinutes||x.estMinutes||25)];}).sort(function(x,y){return x[0]-y[0];}),added=[];
    picks.forEach(function(x){
      var dur=Math.max(5,Math.min(240,Number(x.minutes)||25)),start=cursor,limit=1440;
      occupied.forEach(function(o){if(start<o[1]&&start+dur>o[0])start=Math.ceil((o[1]+10)/15)*15;});
      if(x.dueDate&&x.dueDate<date)limit=0;else if(x.dueDate===date&&x.dueTime){var p=x.dueTime.split(':').map(Number);limit=p[0]*60+p[1];}
      if(start+dur>limit){start=null;unscheduled++;}else cursor=start+dur+10;
      var category=x.category.trim();if(!a.categories.some(function(c){return c.name===category;}))a.categories.push({id:S.uid(),name:category,color:'#83b9a2'});
      var task={id:S.uid(),name:x.name.trim(),category:category,date:date,startMinutes:start,estMinutes:dur,plannedMinutes:dur,firstTime:false,multiplier:1,done:false,createdAt:Date.now(),order:a.tasks.length+1,important:x.important,urgent:x.urgent,dueDate:x.dueDate||null,dueTime:x.dueTime||null,taskType:/作业|提交|考试/.test(x.name)?'assignment':'learning',scheduleSource:'quick-intake',scheduleStatus:start===null?'needs-arrangement':'scheduled',priorityScore:(x.urgent?100:0)+(x.important?25:0)};
      a.tasks.push(task);added.push(task);
    });
    if(!a.priorityFocusTaskId||!a.tasks.some(function(t){return t.id===a.priorityFocusTaskId&&!t.done;}))a.priorityFocusTaskId=added[0].id;
    S.saveAcctData(a);if(S.renderSidebarCategoryList)S.renderSidebarCategoryList();if(S.refreshCurrentView)S.refreshCurrentView();
    drafts=[];inputText='';statusText='已收集 '+added.length+' 项。'+(unscheduled?unscheduled+' 项在今天或截止前排不下，已保存在待办中，尚未安排时间。':'已避开现有日程排好。')+' 当前主线保留，每次专心做一件。';render();
  }
  function mic(){var R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R){setStatus('当前浏览器不支持语音识别，请直接输入或粘贴文字。');return;}remember();if(recognition&&listening){recognition.stop();return;}var prefix=inputText;recognition=new R();recognition.lang='zh-CN';recognition.continuous=true;recognition.interimResults=true;recognition.onstart=function(){listening=true;render();};recognition.onresult=function(ev){var text='';for(var i=0;i<ev.results.length;i++)text+=ev.results[i][0].transcript;inputText=prefix+(prefix?'\n':'')+text;var box=document.getElementById('tiText');if(box)box.value=inputText;};recognition.onerror=function(ev){setStatus('语音识别未成功：'+ev.error+'，可以直接输入。');};recognition.onend=function(){remember();listening=false;render();};try{recognition.start();}catch(err){setStatus('无法启动语音识别，请直接输入。');}}
  async function readQuickFile(file){var data=await SYSourceIO.readFile(file);lastSource=data;return SYSourceIO.toMarkdown(data);}
  async function loadQuickFiles(files){
    remember();if(loading)return;loading=true;var job=epoch,account=String(SY.currentAccountKey),accepted=0,errors=[],texts=[];previewFiles=previewFiles.concat(Array.from(files||[]).filter(function(f){return /^image\//.test(f.type);}));
    setStatus('正在读取文件；图片在本机识别文字…');
    for(var file of Array.from(files||[])){try{texts.push(await readQuickFile(file));accepted++;}catch(err){errors.push(file.name+'：'+err.message);}}
    if(job!==epoch||account!==String(SY.currentAccountKey))return;loading=false;remember();if(texts.length)inputText+=(inputText?'\n\n':'')+texts.join('\n\n');
    render();setStatus((accepted?'已读取 '+accepted+' 个文件，可按目录闯关或识别任务。':'没有读到可用文字。')+(errors.length?' '+errors.join('；'):''));
  }
  function openWechat(){var link=document.createElement('a');link.href='weixin://';link.rel='noopener';document.body.appendChild(link);link.click();link.remove();setStatus('已尝试唤起微信客户端。请在微信里主动复制聊天或公众号内容，再回到这里粘贴；网页不会自动爬取私聊和群聊。');}
  function feishuUrl(){var input=document.getElementById('tiFeishuUrl');return SYSourceIO.normalizeLinks(input&&input.value||'')[0]||'';}
  function openFeishu(){var url=feishuUrl();if(!url){setStatus('请先粘贴分享链接。');return;}if(url.startsWith('obsidian://')){var a=document.createElement('a');a.href=url;a.click();}else window.open(url,'_blank','noopener,noreferrer');}
  async function readFeishu(){
    remember();var urls=SYSourceIO.normalizeLinks((document.getElementById('tiFeishuUrl')||{}).value||'');
    if(!urls.length){setStatus('请先粘贴分享链接。');return;}
    if(loading)return;loading=true;var job=epoch,account=String(SY.currentAccountKey),texts=[],errors=[];
    try { for(var url of urls.slice(0,12)) {
      if(job!==epoch||account!==String(SY.currentAccountKey))return;
      setStatus('正在读取第 '+(texts.length+errors.length+1)+' / '+Math.min(12,urls.length)+' 个链接…');
      try {var data=await SYSourceIO.readLink(url);lastSource=data;texts.push(SYSourceIO.toMarkdown(data));}
      catch(err){errors.push(url+'：'+err.message);}
    }
    if(job!==epoch||account!==String(SY.currentAccountKey))return;
    remember();if(texts.length)inputText+=(inputText?'\n\n':'')+texts.join('\n\n');mode='text';
    statusText='已读取 '+texts.length+' 份正文。'+(errors.length?' 未完成：'+errors.join('；'):'核对下方目录后即可闯关。')+(urls.length>12?' 本批最多 12 条，其余请下一批读取。':'');render();
    } finally {if(job===epoch)loading=false;}
  }
  function sourceRoute(){remember();var nodes=SYRouteOutline.parse(inputText);if(!nodes.length){setStatus('先读取链接、拖入文件，或粘贴目录。');return;}FocusQuest.openOutline(nodes,lastSource&&lastSource.title||'我的资料目录');document.getElementById('tiOverlay').remove();}
  function openObsidian(){var a=document.createElement('a');a.href='obsidian://choose-vault';a.click();setStatus('已请求系统打开 Obsidian。若要打开某篇笔记，可在链接框粘贴该笔记的 Obsidian 链接。');}
  function openKnowledge(){remember();if(window.SYKnowledge)SYKnowledge.open();else setStatus('知识库功能还没加载完成，请刷新页面。');}
  function openKnowledgeAI(){remember();if(window.SYRescue)SYRescue.open({taskName:'快速收集的任务',useNotes:true});else if(window.SYKnowledge)SYKnowledge.open();else setStatus('知识库功能还没加载完成，请刷新页面。');}
  document.addEventListener('click',function(ev){
    if(ev.target&&ev.target.id==='tiDocs')return;
    var b=ev.target.closest('[data-ti],[data-ti-mode],[data-ti-drop]');if(!b)return;
    if(b.dataset.tiMode){remember();if(recognition&&listening)recognition.stop();mode=b.dataset.tiMode;render();return;}
    var a=b.dataset.ti;
    if(a==='close'){epoch++;loading=false;remember();if(recognition)recognition.stop();document.getElementById('tiOverlay').remove();}
    else if(a==='mic')mic();else if(a==='extract')extract();else if(a==='schedule')schedule();
    else if(a==='source-route')sourceRoute();else if(a==='manual-capture')SYSourceIO.manualCapture();else if(a==='obsidian-open')openObsidian();else if(a==='wechat-open')openWechat();else if(a==='feishu-read')readFeishu();else if(a==='feishu-open')openFeishu();else if(a==='knowledge')openKnowledge();else if(a==='knowledge-ai')openKnowledgeAI();
    else if(b.dataset.tiDrop!==undefined){var input=document.getElementById('tiDocs');if(input)input.click();}
  });
  document.addEventListener('input',function(ev){var t=ev.target;if(t.id==='tiText'){inputText=t.value;return;}if(t.dataset.tiField){var d=drafts[Number(t.dataset.i)];if(d)d[t.dataset.tiField]=t.type==='checkbox'?t.checked:t.type==='number'?Number(t.value):t.value;}});
  document.addEventListener('change',function(ev){
    if(ev.target.id==='tiFile'&&ev.target.files[0])ev.target.files[0].text().then(function(txt){inputText=txt;render();});
    if(ev.target.id==='tiDocs'){loadQuickFiles(ev.target.files);ev.target.value='';}
  });
  document.addEventListener('dragover',function(ev){var drop=ev.target.closest&&ev.target.closest('[data-ti-drop]');if(!drop)return;ev.preventDefault();drop.classList.add('is-over');});
  document.addEventListener('dragleave',function(ev){var drop=ev.target.closest&&ev.target.closest('[data-ti-drop]');if(drop)drop.classList.remove('is-over');});
  document.addEventListener('drop',function(ev){var drop=ev.target.closest&&ev.target.closest('[data-ti-drop]');if(!drop)return;ev.preventDefault();drop.classList.remove('is-over');if(ev.dataTransfer.files.length)loadQuickFiles(ev.dataTransfer.files);else{var links=SYSourceIO.normalizeLinks(ev.dataTransfer.getData('text/uri-list')||ev.dataTransfer.getData('text/plain'));if(links.length){document.getElementById('tiFeishuUrl').value=links.join('\n');setStatus('链接已填入。点击读取正文，或直接打开原文。');}}});
  document.addEventListener('paste',function(ev){if(!document.getElementById('tiOverlay')||ev.target.closest('dialog')||!ev.clipboardData||!ev.clipboardData.files.length)return;ev.preventDefault();loadQuickFiles(ev.clipboardData.files);});
  document.addEventListener('keydown',function(ev){if(ev.target.matches('[data-ti-drop]')&&(ev.key==='Enter'||ev.key===' ')){ev.preventDefault();document.getElementById('tiDocs').click();}});
  function install(){if(!window.SY)return false;window.SY.openQuickCapture=shell;return true;}if(!install()){document.addEventListener('sy:ready',install);var n=0,t=setInterval(function(){if(install()||++n>100)clearInterval(t);},100);}
})();
