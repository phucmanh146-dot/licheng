(function(){
  'use strict';
  var KEY='shanganya_focus_quest_v1';
  var state={view:'setup',goal:'',links:'',outline:'',files:[],searchResults:[],searching:false,levels:[],path:[],current:0,stream:null,startedAt:0,baselineEnd:0,nextCheck:0,interval:5,signal:'warming',samples:[],lastFrame:null,lastSeenAt:0,timer:null,analyser:null,earned:0};
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function save(){try{localStorage.setItem(KEY,JSON.stringify({account:window.SY?String(SY.currentAccountKey):'',goal:state.goal,links:state.links,outline:state.outline,levels:state.levels,path:state.path,current:state.current,earned:state.earned}));}catch(e){}}
  function load(){try{var x=JSON.parse(localStorage.getItem(KEY)||'null');if(x)Object.assign(state,x);}catch(e){}}
  function lines(text){return String(text||'').split(/\r?\n/).map(function(x){return x.replace(/^\s*(?:[-*•]|\d+[.、)])\s*/,'').trim();}).filter(function(x){return x.length>2;});}
  function linkItems(){return SYSourceIO.normalizeLinks(state.links);}
  function materialSteps(text){
    var rows=lines(text).map(function(x){return x.replace(/^#+\s*/,'').replace(/\s+/g,' ').trim();}).filter(function(x){return x.length>8&&!/^https?:\/\//i.test(x);}),seen={};
    var action=/(打开|阅读|理解|记录|创建|安装|配置|运行|检查|验证|测试|输入|导入|导出|提交|发布|练习|复习|整理|选择|点击|完成|下载|保存|准备|观察|提取|总结|确认)/;
    rows=rows.filter(function(x){if(seen[x]||!action.test(x))return false;seen[x]=1;return true;});
    if(rows.length<3) rows=lines(text).filter(function(x){return x.length>14&&!/^https?:\/\//i.test(x)&&!seen[x];}).slice(0,6);
    if(!rows.length)return [];
    return rows.slice(0,8).map(function(x){return x.length>180?x.slice(0,177)+'…':x;});
  }
  function sourceText(url){try{return /(?:youtube\.com|youtu\.be|bilibili\.com|b23\.tv|douyin\.com|vimeo\.com)/i.test(new URL(url).hostname);}catch(e){return false;}}
  function normalize(raw,prefix){return raw.slice(0,300).map(function(t,i){var n=typeof t==='string'?{title:t}:t;return {id:(prefix||Date.now())+'-'+i,title:n.title,proof:n.proof||'完成本节内容，留下一个可检查的结果',loaded:!!n.loaded,kind:n.kind||'heading',startTime:n.startTime,sourceUrl:n.sourceUrl||'',originUrl:n.originUrl||'',blockId:n.blockId||'',material:n.material||'',children:normalize(n.children||[],(prefix||Date.now())+'-'+i),done:!!n.done,minutes:n.minutes||5};});}
  function visibleLevels(){var list=state.levels;(state.path||[]).forEach(function(i){list=list[i]&&list[i].children||[];});return list;}
  function currentLevel(){return visibleLevels()[state.current]||{};}
  function parentLevels(){var list=state.levels,parents=[];(state.path||[]).forEach(function(i){if(list[i]){parents.push(list[i]);list=list[i].children||[];}});return parents;}
  function levelsFrom(raw){state.applied=false;state.levels=normalize(raw);state.path=[];state.current=0;state.view='map';save();render();}
  function outlineNodes(text,structured){return window.SYRouteOutline?SYRouteOutline.parse(text,structured):lines(text);}
  function structuredNodes(text,structured){if(Array.isArray(structured)&&structured.length)return outlineNodes(text,structured);if(/^(?:#{1,6}\s|\s*\d+[.、)]\s|\s*[-*•]\s|第[一二三四五六七八九十百\d]+(?:节|课|章))/m.test(text))return outlineNodes(text);return [];}
  async function makeLevels(){
    if(state.building)return;
    if(state.readingFiles){toast('文件仍在读取，请等文字提取完成。');return;} if(!state.goal.trim()){toast('先写下这一趟要完成的成果。');return;}
    var epoch=state.routeEpoch=(state.routeEpoch||0)+1,account=String(SY.currentAccountKey),goal=state.goal,urls=linkItems().slice(0,12),material=state.outline.trim(),notes=[],tree=structuredNodes(material);
    function current(){return epoch===state.routeEpoch&&account===String(SY.currentAccountKey);}
    state.building=true;state.sourceError='';render();
    try {
      var health=await SY.backendCall('/api/health',null,7000);
      if(!current())return;
      if(!health.ok && urls.length)throw new Error(health.error); if(!health.ok)health={ok:true,data:{capabilities:{ai:false}}};
      if(!urls.length&&!material){
        var search=await SY.backendCall('/api/search',{q:goal,n:4},30000);
        if(!current())return;
        if(!search.ok)throw new Error(search.error);
        state.searchResults=search.data.results||[];urls=state.searchResults.map(function(x){return x.url;}).slice(0,3);
        material=state.searchResults.map(function(x){return '搜索摘要：'+(x.title||'网页来源')+'\n'+(x.snippet||'');}).join('\n\n');
      }
      var read=await Promise.all(urls.map(async function(url){
        var r=await SY.backendCall('/api/extract',{url:url},100000);
        return r.ok&&r.data&&!r.data.thin?{url:url,text:r.data.text,title:r.data.title,outline:r.data.outline,complete:r.data.outlineComplete!==false,video:sourceText(url),transcript:r.data.transcript,note:r.data.note}:{url:url,error:r.error||(r.data&&r.data.note)||'正文未能读取'};
      }));
      if(!current())return;
      read.forEach(function(r){if(r.text){notes.push('来源：'+r.title+' '+r.url+'\n'+r.text.slice(0,10000));var nodes=structuredNodes(r.text,r.outline);if(nodes.length)tree=tree.concat(nodes);}});
      if(notes.length)material+='\n'+notes.join('\n\n');
      var unread=read.filter(function(r){return r.error;});var partial=read.some(function(r){return r.complete===false;});
      if(!material.trim())throw new Error('没有读到可用材料。请上传正文、字幕或粘贴步骤，再生成关卡。');
      if(!state.outline.trim()&&!read.some(function(r){return r.text;}))throw new Error(unread.map(function(r){return r.error;}).join('；')||'没有读取到正文，请导入原文后生成关卡。');
      var steps=tree,usedAI=false;
      if(!steps.length&&health.data.capabilities.ai){
        var answer=await SY.backendCall('/api/ask-ai',{mode:'steps',search:false,question:'目标：'+goal+'。只依据提供的材料按原文顺序拆关，不要把全部课程压缩成几个泛泛步骤，不把链接当关卡。每关写明原文中的一个动作及验收结果。',context:material.slice(0,16000)},90000);
        if(!current())return;
        if(answer.ok)steps=(answer.data.steps||[]).filter(function(s){return typeof s==='string'&&s.trim();});
        usedAI=steps.length>0;
      }
      if(!steps.length)steps=materialSteps(material);
      if(!steps.length)throw new Error('资料已读取，但没有识别出可执行步骤。请补充目录、字幕或步骤文字。');
      var videoNotes=read.filter(function(r){return r.video&&!r.transcript;}).map(function(r){return r.title+'：'+(r.note||'视频没有公开字幕');});
      state.sourceNotice=(tree.length?'已保留原目录顺序：一节课是一关，点开后继续做里面的小关。':usedAI?'已根据读到的正文由 AI 拆解。':'已按读取到的资料整理为可核对路线。')+(videoNotes.length?' '+videoNotes.join('；')+'。':'')+(partial?' 目录被截断，请补充剩余章节。':'')+(unread.length?' 未读到正文：'+unread.map(function(r){return r.url+'（'+r.error+'）';}).join('；'):'');
      levelsFrom(steps);toast(state.sourceNotice);
    }catch(e){if(current()){state.sourceError=e.message||'这次未能生成关卡。';toast(state.sourceError);}}
    finally{if(epoch===state.routeEpoch){state.building=false;render();}}
  }
  function applyRoute(){
    if(!window.SY||!state.taskId){toast('请从具体任务的工具舱进入，才能把航线关联到任务。');return;}
    if(state.account!==String(SY.currentAccountKey)){toast('账号已切换，请重新打开这项任务。');return;}
    var a=SY.getAcctData(),task=(a.tasks||[]).find(function(t){return t.id===state.taskId;});if(!task)return;
    if((task.steps||[]).length&&!window.confirm('将当前预览的航线应用到这项任务？原来的关卡列表会被替换，任务本身和笔记保留。'))return;
    task.steps=state.levels.map(function(l){return {id:l.id,text:l.title,done:l.done,children:l.children};});
    state.applied=true;task.focusQuest={goal:state.goal,links:state.links,outline:state.outline,levels:state.levels,path:state.path,current:state.current};
    SY.saveAcctData(a);if(SY.refreshCurrentView)SY.refreshCurrentView();toast('航线已保存到这项任务，通关会同步勾选对应步骤。');
  }
  function sourceChips(){var xs=linkItems().map(function(x){try{return new URL(x).hostname;}catch(e){return x;}}).concat(state.files.map(function(f){return f.name;}));return xs.map(function(x){return '<span class="fq-chip">'+esc(x)+'</span>';}).join('');}
  function searchResultsHtml(){if(state.searching)return '<p class="fq-privacy">正在检索公开网页来源…</p>';if(!state.searchResults.length)return '';return '<section class="fq-search-results"><h3>检索到的来源</h3>'+state.searchResults.map(function(r,i){return '<article><b>'+(i+1)+'. '+esc(r.title||'网页资料')+'</b><p>'+esc(r.snippet||'')+'</p><a href="'+esc(r.url)+'" target="_blank" rel="noopener">打开来源 ↗</a></article>';}).join('')+'</section>';}
  function setupHtml(){return '<div class="fq-grid"><label class="fq-field wide">这次想通关什么？<input id="fqGoal" maxlength="180" value="'+esc(state.goal)+'" placeholder="例如：看完课程第 3 章并做出能运行的登录页面"></label><label class="fq-field wide">飞书文档 / 网页 / 视频链接<textarea id="fqLinks" rows="3" placeholder="每行或空格分隔，可放飞书、B站、YouTube 等链接">'+esc(state.links)+'</textarea><span class="fq-help">先读取你给的文档、网页和公开字幕；没有 AI 也会先整理出可核对路线。</span></label><label class="fq-field wide">拖入文档、图片或字幕 · 也可从磁盘选择<input id="fqFiles" type="file" multiple accept=".txt,.md,.csv,.json,.srt,.vtt,.html,.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.gif,.bmp"><span class="fq-help">支持 Word、PDF、图片、Markdown 和字幕；每份最多 5 MB。图片在本机识别文字。</span></label><label class="fq-field wide">步骤、目录或字幕要点<textarea id="fqOutline" rows="7" placeholder="保留课程顺序和缩进，例如：\n第一节课：安装工具\n  1. 下载编辑器\n  2. 配置模型\n第二节课：创建项目">'+esc(state.outline)+'</textarea></label></div><div class="fq-source-list">'+sourceChips()+'</div><div class="fq-actions"><button class="fq-btn" data-fq="search">🔎 全网检索</button><button class="fq-btn primary" data-fq="build">读取资料并排好路线</button><button class="fq-btn" data-fq="restore">恢复上次路线</button></div>'+(state.sourceError?'<p class="fq-setup-error" role="alert">'+esc(state.sourceError)+'</p>':'')+searchResultsHtml()+'<p class="fq-privacy">飞书按原文标题读取。微信、视频如需登录或没有字幕，可打开原文后手动摘取或导入文件。</p>';}
  function mapHtml(){var parents=parentLevels(),list=visibleLevels(),done=list.filter(function(x){return x.done;}).length;return '<div class="fq-route-page"><nav class="fq-breadcrumb" aria-label="课程层级"><button data-fq="root">全部课程</button>'+parents.map(function(p,i){return '<span>›</span><button data-fq="parent" data-depth="'+(i+1)+'">'+esc(p.title)+'</button>';}).join('')+'</nav><header class="fq-route-intro"><div><small>一节课 · 一座岛</small><h2>'+esc(parents.length?parents[parents.length-1].title:state.goal||'完成这次学习任务')+'</h2><p>'+ (parents.length?'按本节的小目录，一项一项往前走。':'先选一节课；只展开眼前这一节的内容。')+'</p></div><span class="fq-route-total"><b>'+done+'</b> / '+list.length+' 已完成</span></header>'+(!parents.length&&state.sourceNotice?'<p class="fq-source-notice">'+esc(state.sourceNotice)+'</p>':'')+'<div class="fq-map">'+list.map(function(l,i){var children=l.children||[];return '<article class="fq-level '+(l.done?'done':'')+'"><span class="fq-num">'+(l.done?'✓':String(i+1).padStart(2,'0'))+'</span><div><h3>'+esc(l.title)+'</h3><p>'+(children.length?children.filter(function(c){return c.done;}).length+' / '+children.length+' 个小关已完成':l.sourceUrl?'已找到课程链接 · 读取后展开本节目录':'只做这一小节 · 完成后留下学习成果')+'</p></div><button class="fq-btn '+(i===state.current&&!l.done?'primary':'')+'" data-fq="'+(children.length?'branch':l.sourceUrl&&!l.loaded?'read-course':'play')+'" data-i="'+i+'">'+(children.length?'展开小关 →':l.sourceUrl&&!l.loaded?'读取这一课 ↗':l.done?'回看':'进入这关 →')+'</button></article>';}).join('')+'</div><div class="fq-actions">'+(parents.length?'<button class="fq-btn" data-fq="up">← 返回上级目录</button>':'')+'<button class="fq-btn" data-fq="setup">重新整理来源</button></div></div>';}
  function fmt(ms){var s=Math.max(0,Math.floor(ms/1000)),m=Math.floor(s/60);return String(m).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
  function statusCopy(){if(state.signal==='focus')return ['你确认：正在顺利推进','保持这段节奏，约 30 分钟后再做状态签到。','focus'];if((state.signal==='risk'||state.signal==='distracted'||state.signal==='entertainment'))return ['你选择：需要调整节奏','先从一小步重新开始，5 分钟后再确认。','risk'];if(state.signal==='stuck')return ['进入 Bug 救援','把问题交给联网救援，先做一个可验证的小动作。','stuck'];return ['先做眼前 5 分钟','由你确认状态，不通过亮度、动作或表情判断专注。',''];}
  function playHtml(){var l=currentLevel(),s=statusCopy(),elapsed=state.startedAt?Date.now()-state.startedAt:0,base=Math.min(100,elapsed/300000*100);return '<div class="fq-play"><div><div class="fq-camera"><video id="fqVideo" autoplay muted playsinline></video><div class="fq-cam-empty" id="fqCamEmpty">开启摄像头后，只在本机检查“是否持续在画面中”。</div></div><div class="fq-actions"><button class="fq-btn" data-fq="camera">'+(state.stream?'关闭摄像头':'开启摄像头监测')+'</button></div><p class="fq-privacy">不会做人脸识别，不分析身份、表情或情绪。摄像头信号只是辅助，状态签到优先。</p></div><div><small>第 '+(state.current+1)+' / '+visibleLevels().length+' 关</small><h2>'+esc(l.title||'当前关卡')+'</h2><p>通关凭证：'+esc(l.proof||'留下一个可检查的结果')+'</p><div class="fq-status '+s[2]+'"><h3>'+s[0]+'</h3><p>'+s[1]+'</p><div class="fq-clock" id="fqClock">'+fmt(elapsed)+'</div><div class="fq-meter"><i id="fqMeter" style="width:'+base+'%"></i></div><small id="fqNext">'+(state.startedAt?'下一次关怀：'+Math.max(0,Math.ceil((state.nextCheck-Date.now())/60000))+' 分钟后':'点击开始，让系统先了解前 5 分钟状态')+'</small></div><div class="fq-actions"><button class="fq-btn primary" data-fq="start">'+(state.startedAt?'继续进行':'开始这一关')+'</button><button class="fq-btn coral" data-fq="finish">完成这关</button></div><div class="fq-checks"><button data-fq="state" data-state="focus">🟢 正在顺利推进</button><button data-fq="state" data-state="stuck">🐞 遇到 Bug / 卡住</button><button data-fq="state" data-state="distracted">🌫 有点走神</button><button data-fq="state" data-state="entertainment">📱 刷娱乐停不下来</button><button data-fq="state" data-state="break">☕ 需要休息一下</button></div></div></div>';}
  function rewardHtml(){var l=currentLevel();return '<div class="fq-reward"><strong>🎉 +'+Math.max(5,l.minutes||5)+' XP</strong><h2>这一关已经过了</h2><p>不是“还差很多”，而是你已经留下了一个真实进展。</p><div class="fq-actions" style="justify-content:center"><button class="fq-btn primary" data-fq="next">进入下一关</button><button class="fq-btn" data-fq="map">回到关卡地图</button></div></div>';}
  function render(){var shell=document.getElementById('fqShell');if(!shell)return;var title=state.view==='setup'?'把难任务变成一关一关':state.view==='map'?'今天的闯关地图':state.view==='reward'?'通关结算':'专注陪跑中';shell.querySelector('[data-fq-title]').textContent=title;shell.querySelector('.fq-body').innerHTML=state.view==='setup'?setupHtml():state.view==='map'?mapHtml():state.view==='reward'?rewardHtml():playHtml();attachVideo();
    shell.querySelectorAll('.fq-search-results a').forEach(function(a,i){try{var url=new URL(state.searchResults[i].url);if(/^https?:$/.test(url.protocol)){a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';}}catch(e){}});
    if(state.view==='setup'){var b=shell.querySelector('[data-fq="build"]');b.disabled=!!state.building;b.textContent=state.building?'正在读取资料并排路线…':'读取资料并排好路线';var manual=document.createElement('button');manual.className='fq-btn';manual.textContent='按我填写的步骤生成';manual.disabled=!!state.building;manual.onclick=function(){state.goal=document.getElementById('fqGoal').value;state.outline=document.getElementById('fqOutline').value;state.links=document.getElementById('fqLinks').value;var rows=outlineNodes(state.outline);if(!rows.length){toast('请先在步骤框中一行写一个动作。');return;}levelsFrom(rows);};b.parentNode.appendChild(manual);}
    if(state.view==='map'&&state.taskId){var apply=document.createElement('button');apply.className='fq-btn primary';apply.textContent='将这条航线保存到当前任务';apply.onclick=applyRoute;shell.querySelector('.fq-actions').appendChild(apply);}
    if(state.view==='setup'){
      var previews=document.createElement('div');previews.className='sy-import-previews';(state.files||[]).filter(function(f){return /^image\//.test(f.type);}).forEach(function(f){var img=document.createElement('img');img.src=URL.createObjectURL(f);img.alt=f.name;img.onload=function(){URL.revokeObjectURL(img.src);};previews.append(img);});shell.querySelector('.fq-source-list').after(previews);
      var input=shell.querySelector('#fqFiles'),drop=input.closest('label'); drop.classList.add('sy-file-drop');
      drop.addEventListener('dragover',function(e){e.preventDefault();drop.classList.add('is-over');});
      drop.addEventListener('dragleave',function(){drop.classList.remove('is-over');});
      drop.addEventListener('drop',function(e){e.preventDefault();drop.classList.remove('is-over'); if(e.dataTransfer.files.length)readFiles({files:e.dataTransfer.files});else{var links=SYSourceIO.normalizeLinks(e.dataTransfer.getData('text/uri-list')||e.dataTransfer.getData('text/plain'));if(links.length){collectSetup();state.links+=(state.links?'\n':'')+links.join('\n');render();}}});
      var captures=document.createElement('button');captures.className='fq-btn';captures.textContent='手动摘取网页 / 微信';captures.onclick=SYSourceIO.manualCapture;shell.querySelector('.fq-actions').append(captures);
      var shot=document.createElement('button');shot.className='fq-btn';shot.textContent='🖥 截屏识别文字';shot.title='把微信或网页内容显示在屏幕上，点这里截屏并在本机识别文字';shot.onclick=screenCapture;shell.querySelector('.fq-actions').append(shot);
      var linkbox=document.createElement('div');linkbox.className='sy-source-links';SYSourceIO.showLinks(linkbox,state.links);shell.querySelector('#fqLinks').after(linkbox);
    }
    if(state.view==='map'){
      var exportBtn=document.createElement('button');exportBtn.className='fq-btn';exportBtn.textContent='按目录分类存入 Obsidian';exportBtn.onclick=function(){if(window.SYKnowledge)SYKnowledge.saveRoute({title:state.goal,levels:state.levels,links:linkItems()});};shell.querySelector('.fq-actions').append(exportBtn);
    }
    if(state.view==='play'){
      var sources=document.createElement('div');sources.className='sy-source-links';SYSourceIO.showLinks(sources,currentLevel().originUrl||currentLevel().sourceUrl||state.links);shell.querySelector('.fq-status').before(sources);
    }
    var empty=shell.querySelector('#fqCamEmpty');if(empty)empty.textContent='摄像头仅供本机自览。状态由你签到确认。';var cameraBtn=shell.querySelector('[data-fq="camera"]');if(cameraBtn)cameraBtn.textContent=state.stream?'关闭摄像头':'开启本机自览';
    if(state.view==='play'&&currentLevel().material){var detail=document.createElement('details'),summary=document.createElement('summary'),excerpt=document.createElement('div');summary.textContent='查看这一小节的原文';excerpt.className='fq-material';excerpt.textContent=currentLevel().material;detail.append(summary,excerpt);shell.querySelector('.fq-status').before(detail);}
  }
  function toast(t){var n=document.createElement('div');n.className='fq-toast';n.textContent=t;document.body.appendChild(n);setTimeout(function(){n.remove();},3500);}
  function open(){if(state.account&&state.account!==String(SY.currentAccountKey)){openForTask(null);return;}document.getElementById('fqShell').hidden=false;render();}
  function openForTask(task){close();state.building=false;state.searching=false;state.account=window.SY?String(SY.currentAccountKey):'';state.taskId=task&&task.id;state.earned=0;var name=task&&task.name||'',urls=SYSourceIO.normalizeLinks(name+'\n'+(task&&task.materials||[]).map(function(m){return m.url||m.sourceUrl||'';}).join('\n'));state.goal=name||'按课程目录，一节一节完成学习';state.links=urls.join('\n');state.outline='';state.files=[];state.sourceNotice='';state.sourceError='';state.searchResults=[];state.levels=[];state.path=[];state.current=0;state.view='setup';state.applied=false;if(task&&task.focusQuest){Object.assign(state,JSON.parse(JSON.stringify(task.focusQuest)));state.applied=true;state.view='map';}open();}
  function close(){state.routeEpoch=(state.routeEpoch||0)+1;state.building=false;document.getElementById('fqShell').hidden=true;if(state.stream){state.stream.getTracks().forEach(function(t){t.stop();});state.stream=null;}clearInterval(state.analyser);state.analyser=null;clearInterval(state.timer);state.timer=null;state.startedAt=0;}
  function attachVideo(){var v=document.getElementById('fqVideo'),empty=document.getElementById('fqCamEmpty');if(v&&state.stream){v.srcObject=state.stream;v.play().catch(function(){});if(empty)empty.hidden=true;}}
  async function camera(){if(state.stream){state.stream.getTracks().forEach(function(t){t.stop();});state.stream=null;state.signal='warming';render();return;}try{state.stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:480},height:{ideal:360},facingMode:'user'},audio:false});attachVideo();beginSampling();render();}catch(e){toast('摄像头未开启，也可以用状态签到继续闯关。');}}
  function beginSampling(){if(state.analyser)clearInterval(state.analyser);state.analyser=setInterval(sampleFrame,5000);}
  function sampleFrame(){/* Camera preview only. Attention is reported by the user. */}
  function evaluate(){if(!state.startedAt||document.hidden||document.getElementById('fqShell').hidden)return;if(Date.now()>=state.nextCheck){state.nextCheck=Date.now()+state.interval*60000;if(window.SYCompanion)SYCompanion.open({taskName:state.goal});else toast('来一次状态签到：请选顺利、卡住、分心或休息。');}}
  function start(){if(!state.startedAt){state.startedAt=Date.now();state.baselineEnd=Date.now()+300000;state.nextCheck=state.baselineEnd;state.signal='warming';state.interval=5;}if(!state.timer)state.timer=setInterval(function(){evaluate();updateLive();},1000);render();}
  function updateLive(){var clock=document.getElementById('fqClock'),meter=document.getElementById('fqMeter'),next=document.getElementById('fqNext');if(clock&&state.startedAt)clock.textContent=fmt(Date.now()-state.startedAt);if(meter&&state.startedAt)meter.style.width=Math.min(100,(Date.now()-state.startedAt)/300000*100)+'%';if(next&&state.startedAt)next.textContent='下一次关怀：'+Math.max(0,Math.ceil((state.nextCheck-Date.now())/60000))+' 分钟后';}
  function setSignal(v){if(v==='break'){state.signal='risk';state.interval=5;toast('先休息，不扣进度。回来时只需要做 5 分钟。');}else{state.signal=v;state.interval=v==='focus'?30:5;toast(v==='stuck'?'打开联网救援，先解决眼前这一小步。':v==='focus'?'很好，减少打扰，30 分钟后再结算。':'收到，5 分钟后轻轻回来确认。');}state.nextCheck=Date.now()+state.interval*60000;render();if(window.SYCompanion)SYCompanion.respond(v,{taskName:state.goal,quiet:true});if(v==='stuck'&&window.SYRescue){var task=window.SY&&(SY.getAcctData().tasks||[]).find(function(t){return t.id===state.taskId;});window.SYRescue.open({task:task||{name:state.goal+' · '+(currentLevel().title||'当前关卡')},onResume:function(){setSignal('focus');}});}}
  function finish(){var l=currentLevel();if(!l.id||l.done)return;l.done=true;parentLevels().reverse().forEach(function(p){p.done=p.children.every(function(c){return c.done;});});state.earned+=Math.max(5,l.minutes||5);state.startedAt=0;state.samples=[];state.lastFrame=null;if(state.timer){clearInterval(state.timer);state.timer=null;}state.view='reward';save();syncProgress();render();}
  function syncProgress(){if(state.applied&&window.SY&&state.taskId&&state.account===String(SY.currentAccountKey)){var a=SY.getAcctData(),task=(a.tasks||[]).find(function(t){return t.id===state.taskId;});if(task&&task.focusQuest){task.steps=state.levels.map(function(l){return {id:l.id,text:l.title,done:l.done,children:l.children};});task.focusQuest.levels=state.levels;task.focusQuest.current=state.current;task.focusQuest.path=state.path;SY.saveAcctData(a);if(SY.refreshCurrentView)SY.refreshCurrentView();}}}
  function next(){var list=visibleLevels(),n=list.findIndex(function(x,i){return i>state.current&&!x.done;});if(n<0)n=list.findIndex(function(x){return !x.done;});if(n<0){state.view='map';toast(state.path.length?'这一节的小关全部完成，返回上级选择下一节。':'整条路线已通关！今天的进展已经被保存。');}else{state.current=n;if((list[n].children||[]).length){state.path.push(n);state.current=0;state.view='map';}else state.view='play';state.signal='warming';}save();render();}
  async function readCourse(i){var node=visibleLevels()[i],epoch=state.routeEpoch,account=String(SY.currentAccountKey);if(!node||!node.sourceUrl||state.building)return;state.building=true;toast('正在读取这一节课的目录…');try{var r=await SY.backendCall('/api/extract',{url:node.sourceUrl},100000);if(epoch!==state.routeEpoch||account!==String(SY.currentAccountKey))return;if(!r.ok||!r.data||r.data.thin)throw new Error(r.error||(r.data&&r.data.note)||'这一课没有读到正文，请在来源页导出或复制本节目录。');var children=structuredNodes(r.data.text,r.data.outline);if(!children.length)children=materialSteps(r.data.text);if(!children.length)throw new Error('正文已读取，但没有找到目录或动作步骤，请粘贴本节目录。');node.children=normalize(children,node.id);node.loaded=true;node.material=r.data.text;state.path.push(i);state.current=0;state.view='map';save();syncProgress();render();}catch(error){toast(error.message);}finally{state.building=false;}}
  function restoreRoute(){try{var prior=JSON.parse(localStorage.getItem(KEY)||'null');if(!prior||!prior.levels||!prior.levels.length){toast('还没有保存的路线。');return;}if(prior.account&&prior.account!==String(SY.currentAccountKey)){toast('上次路线属于另一个账号，请从当前任务打开。');return;}Object.assign(state,prior);state.applied=false;state.view='map';render();toast('已恢复上次预览；原任务的清单和标记保持不变。');}catch(_){toast('上次路线无法读取，原任务仍保留。');}}
  function collectSetup(){state.goal=(document.getElementById('fqGoal')||{}).value||state.goal;state.links=(document.getElementById('fqLinks')||{}).value||'';state.outline=(document.getElementById('fqOutline')||{}).value||'';}
  async function screenCapture(){
    toast('正在截屏并在本机识别文字…');
    var r=await window.SY.backendCall('/api/screen-ocr',{},120000);
    if(!r.ok){toast(r.error||'截屏识别没有成功。');return;}
    var text=((r.data||{}).text||'').trim();
    if(!text){toast('这一屏没有识别到文字。把微信或网页内容显示在屏幕上再试一次。');return;}
    collectSetup();
    state.outline=(state.outline?state.outline+'\n\n':'')+text;
    render();
    toast('已识别 '+text.length+' 字，先核对再点「读取资料并排好路线」。');
  }
  async function readFiles(input){
    collectSetup(); if(state.readingFiles)return;
    var epoch=state.routeEpoch,account=String(SY.currentAccountKey),files=Array.from(input.files||[]),texts=[],errors=[];
    state.readingFiles=true;toast('正在读取文件，图片会在本机识别文字…');
    try{for(var f of files){try{var doc=await SYSourceIO.readFile(f);texts.push(SYSourceIO.toMarkdown(doc));}catch(err){errors.push(f.name+'：'+err.message);}}}
    finally{state.readingFiles=false;}
    if(epoch!==state.routeEpoch||account!==String(SY.currentAccountKey))return;
    collectSetup();state.files=state.files.concat(files);
    if(texts.length){state.outline+=(state.outline?'\n\n':'')+texts.join('\n\n').slice(0,80000);toast('已读取 '+texts.length+' 份资料。核对目录后生成关卡。');}
    state.sourceError=errors.join('；');render();
  }
  async function searchWeb(){collectSetup();if(!state.goal.trim()){toast('先写下想通关的目标。');return;}var epoch=state.routeEpoch,account=String(SY.currentAccountKey);function current(){return epoch===state.routeEpoch&&account===String(SY.currentAccountKey);}state.searching=true;state.searchResults=[];render();try{var r=await window.SY.backendCall('/api/search',{q:state.goal+' '+state.outline.slice(0,140),n:8},30000);if(!current())return;if(!r.ok)throw new Error(r.error||'搜索失败');state.searchResults=r.data.results||[];if(!state.searchResults.length)toast('暂时没有搜到结果，换个更具体的目标再试。');}catch(err){if(current())toast(err.message);}finally{if(current()){state.searching=false;render();}}}
  function bind(){document.body.insertAdjacentHTML('beforeend','<button class="fq-launch" id="fqLaunch">🎮 闯关陪跑</button><section class="fq-shell" id="fqShell" hidden><div class="fq-card" role="dialog" aria-modal="true"><header class="fq-head"><div><p>FOCUS QUEST · 本机陪跑</p><h2 data-fq-title></h2></div><button class="fq-close" data-fq="close" aria-label="关闭">×</button></header><main class="fq-body"></main></div></section>');document.getElementById('fqLaunch').onclick=open;document.addEventListener('click',function(e){var b=e.target.closest('[data-fq]');if(!b)return;var a=b.dataset.fq;if(a==='close')close();else if(a==='search')searchWeb();else if(a==='build'){state.goal=(document.getElementById('fqGoal')||{}).value||'';state.links=(document.getElementById('fqLinks')||{}).value||'';state.outline=(document.getElementById('fqOutline')||{}).value||'';makeLevels();}else if(a==='restore'){restoreRoute();}else if(a==='setup'){state.view='setup';render();}else if(a==='map'){state.view='map';render();}else if(a==='root'){state.path=[];state.current=0;state.view='map';render();}else if(a==='parent'){state.path=state.path.slice(0,Number(b.dataset.depth));state.current=0;state.view='map';render();}else if(a==='up'){state.path.pop();state.current=0;state.view='map';render();}else if(a==='branch'){state.path.push(Number(b.dataset.i));state.current=0;state.view='map';render();}else if(a==='read-course'){readCourse(Number(b.dataset.i));}else if(a==='play'){state.current=Number(b.dataset.i)||0;state.view='play';state.startedAt=0;state.signal='warming';render();}else if(a==='camera')camera();else if(a==='start')start();else if(a==='state')setSignal(b.dataset.state);else if(a==='finish')finish();else if(a==='next')next();});document.addEventListener('change',function(e){if(e.target.id==='fqFiles')readFiles(e.target);});window.FocusQuest={open:open,openForTask:function(task){state.goal=task&&task.name||'';state.links='';state.outline='';state.searchResults=[];state.view='setup';open();}};}
  document.addEventListener('paste',function(e){var shell=document.getElementById('fqShell');if(!shell||shell.hidden||state.view!=='setup'||!e.clipboardData||!e.clipboardData.files.length)return;e.preventDefault();readFiles({files:e.clipboardData.files});});
  function connectExistingQuest(){
    if(!window.SY)return;
    var originalOpen=SY.openQuest,originalRender=SY.renderQuest;
    SY.openQuest=function(id,forceEdit){var task=(SY.getAcctData().tasks||[]).find(function(t){return t.id===id;});if(task&&(task.focusQuest||/^https?:\/\/\S+/.test(task.name||''))){if(SY.closeQuest)SY.closeQuest();openForTask(task);if(forceEdit){state.view='setup';render();}return;}return originalOpen.apply(this,arguments);};
    SY.renderQuest=function(){var answer=originalRender.apply(this,arguments),body=document.getElementById('questBody'),task=SY.questTask&&SY.questTask();if(body&&task&&!body.querySelector('.fq-from-outline')){var button=document.createElement('button');button.type='button';button.className='fq-btn fq-from-outline';button.textContent='按资料目录重排 · 课程 → 小关';button.onclick=function(){SY.closeQuest();openForTask(task);};body.appendChild(button);}return answer;};
  }
  function ready(){bind();window.FocusQuest.openForTask=openForTask;window.FocusQuest.openOutline=function(nodes,goal,taskId){close();state.account=String(SY.currentAccountKey);state.files=[];state.goal=goal||'我的课程路线';state.links='';state.outline='';state.sourceError='';state.earned=0;state.taskId=taskId||null;state.links='';state.outline='';state.sourceNotice='按原文目录展开，课程里的每一项都有自己的小关。';levelsFrom(nodes);open();};connectExistingQuest();}
  load();if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();
