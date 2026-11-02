/* Room to think: an illustrated front door, connected to the existing workspace. */
(function () {
  'use strict';
  const S = window.SY;
  if (!S) return;
  const esc = value => S.escapeHtml(String(value == null ? '' : value));
  const $ = id => document.getElementById(id);
  let atHome = true, pendingEntry = null;
  const features = [
    { key: 'daily', name: '每日清单', subtitle: '航线打印室', text: '选出重要的事，给今天排一条走得通的路。', action: '打开我的计划', color: 'mint', number: '01' },
    { key: 'pomodoro', name: '专注陪伴', subtitle: '专注驾驶舱', text: '从五分钟开始。遇到卡点，随时停下来求助。', action: '开始一段专注', color: 'apricot', number: '02' },
    { key: 'knowledge', name: '知识与路线', subtitle: '潮汐标本馆', text: '把资料变成学习路线，把收获留成知识小票。', action: '打开我的知识库', color: 'lilac', number: '03' },
    { key: 'stats', name: '进度与复盘', subtitle: '航行黑匣子', text: '看看时间花在哪里，找到自己的节奏。', action: '查看真实进度', color: 'blue', number: '04' },
    { key: 'habits', name: '习惯养成', subtitle: '上岸护照', text: '不用一下改变很多，先留下一次小小的坚持。', action: '打卡今天的小事', color: 'rose', number: '05' },
    { key: 'peers', name: '学习伙伴', subtitle: '同行者港口', text: '写好一张同航邀请卡，约熟悉的人一起向前。', action: '写一张邀请卡', color: 'yellow', number: '06' }
  ];
  const shapes = {
    daily: '<rect x="25" y="20" width="62" height="65" rx="15" fill="#5e9e93"/><rect x="22" y="13" width="62" height="65" rx="15" fill="#d8f6e7"/><rect x="33" y="25" width="39" height="7" rx="3.5" fill="#579585"/><path d="m33 44 4 4 7-9m-11 21 4 4 7-9" fill="none" stroke="#478779" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M51 44h19M51 60h13" stroke="#96c4b4" stroke-width="5" stroke-linecap="round"/><circle cx="82" cy="76" r="16" fill="#f9c46e"/><path d="M82 69v14m-7-7h14" stroke="#76551b" stroke-width="3" stroke-linecap="round"/>',
    pomodoro: '<circle cx="59" cy="55" r="34" fill="#be7554"/><circle cx="54" cy="49" r="34" fill="#ffd3aa"/><circle cx="54" cy="49" r="26" fill="#fff0d8"/><rect x="43" y="8" width="23" height="9" rx="4" fill="#79a99a"/><path d="M54 29v20l13 8" fill="none" stroke="#b86c45" stroke-width="5" stroke-linecap="round"/><circle cx="54" cy="49" r="5" fill="#e79763"/><path d="m83 22 7 7" stroke="#f5c890" stroke-width="8" stroke-linecap="round"/><circle cx="80" cy="80" r="13" fill="#e8b976"/><path d="m77 73 10 7-10 7Z" fill="#fff5df"/>',
    knowledge: '<path d="M19 26 58 15 91 31 53 44Z" fill="#e6dcff"/><path d="M19 26v49l34 19V44Z" fill="#b1a1d1"/><path d="M53 44 91 31v47L53 94Z" fill="#806da4"/><path d="m31 47 12 6m-12 9 12 6" stroke="#f3ebff" stroke-width="4" stroke-linecap="round"/><path d="m67 29 12-4-13-7-12 4Z" fill="#f4c877"/><path d="M74 43v26l-7-3-6 8V48" fill="#d7c29c"/><circle cx="90" cy="16" r="7" fill="#ddb6dd"/>',
    stats: '<rect x="17" y="24" width="76" height="64" rx="16" fill="#537eb1"/><rect x="14" y="17" width="76" height="64" rx="16" fill="#d0e5ff"/><rect x="25" y="29" width="54" height="39" rx="9" fill="#7fa9d2"/><path d="m31 59 12-14 11 6 18-17" fill="none" stroke="#edf6ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="72" cy="34" r="4" fill="#ffcf7e"/><rect x="42" y="83" width="24" height="7" rx="3" fill="#9abedf"/><path d="M34 91h40" stroke="#d1e7ed" stroke-width="5" stroke-linecap="round"/>',
    habits: '<rect x="26" y="17" width="57" height="75" rx="10" fill="#a66879"/><rect x="20" y="12" width="57" height="75" rx="10" fill="#e8b7bd"/><path d="M32 12v75" stroke="#c78998" stroke-width="3"/><circle cx="53" cy="47" r="18" fill="#ffe7d9"/><path d="m44 48 6 6 12-14" stroke="#af7981" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M44 74h20" stroke="#fff0df" stroke-width="4" stroke-linecap="round"/><path d="m80 22 8-5 8 5v18l-8-5-8 5Z" fill="#e3c982"/>',
    peers: '<ellipse cx="55" cy="86" rx="39" ry="10" fill="#ae925c" opacity=".35"/><circle cx="38" cy="34" r="17" fill="#dcb886"/><path d="M13 80v-9c0-31 49-31 49 0v9" fill="#f6dc9f"/><circle cx="75" cy="38" r="15" fill="#97b7af"/><path d="M55 82v-9c0-27 42-27 42 0v9" fill="#cce6d6"/><circle cx="36" cy="32" r="2" fill="#866647"/><circle cx="45" cy="32" r="2" fill="#866647"/><path d="M70 38h10" stroke="#547e75" stroke-width="3" stroke-linecap="round"/><path d="m53 17 4-8 4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6Z" fill="#e7b95d"/>',
    inbox: '<path d="m18 39 37-20 37 20v41L55 97 18 80Z" fill="#749db6"/><path d="m18 39 37 17 37-17-37-20Z" fill="#d0e5eb"/><path d="m28 39 27 12 27-12" fill="none" stroke="#9dbcca" stroke-width="7"/><path d="M55 56v41" stroke="#557b92" stroke-width="3"/><path d="M38 11h35v28L55 48 38 39Z" fill="#fff0cb"/><path d="m45 28 7 6 12-13" stroke="#86a98a" stroke-width="4" fill="none" stroke-linecap="round"/>',
    profile: '<rect x="16" y="23" width="82" height="64" rx="15" fill="#8b84aa"/><rect x="12" y="16" width="82" height="64" rx="15" fill="#d9d6ee"/><circle cx="36" cy="37" r="10" fill="#afa0c6"/><path d="M22 64c0-23 29-23 29 0Z" fill="#b5abcf"/><path d="M61 35h20M61 47h14M61 59h18" stroke="#8e91b3" stroke-width="5" stroke-linecap="round"/><circle cx="83" cy="77" r="13" fill="#e7c489"/><path d="m77 77 4 4 8-9" stroke="#8a6d43" stroke-width="3" fill="none" stroke-linecap="round"/>',
    quadrant: '<rect x="17" y="17" width="33" height="33" rx="10" fill="#e4a088"/><rect x="57" y="17" width="33" height="33" rx="10" fill="#a4c9b9"/><rect x="17" y="57" width="33" height="33" rx="10" fill="#b5abcf"/><rect x="57" y="57" width="33" height="33" rx="10" fill="#e4ce96"/><path d="M33 26v14m-7-7h14" stroke="#fff2df" stroke-width="3" stroke-linecap="round"/>',
    deadlines: '<circle cx="54" cy="54" r="38" fill="#7a9f8e"/><circle cx="51" cy="48" r="34" fill="#c8e5ce"/><circle cx="51" cy="48" r="23" fill="none" stroke="#8eb8a0" stroke-width="2"/><path d="M51 14v68M17 48h68" stroke="#a1c6ae" stroke-width="2"/><path d="M51 48 75 24A34 34 0 0 1 85 48Z" fill="#71a796"/><circle cx="65" cy="36" r="5" fill="#fff3b0"/><circle cx="35" cy="62" r="4" fill="#f2bd82"/>',
    home: '<path d="M18 47 55 15 93 47v7H18Z" fill="#e6b775"/><path d="M27 51h56v38H27Z" fill="#f6e3b5"/><rect x="47" y="62" width="17" height="27" rx="7" fill="#8bab9a"/><rect x="31" y="56" width="11" height="13" rx="3" fill="#b9cec2"/><path d="M22 90h67" stroke="#ac9266" stroke-width="5" stroke-linecap="round"/>'
  };
  function artIcon(key) {
    return '<svg class="ha-icon" viewBox="0 0 110 110" fill="none" aria-hidden="true"><ellipse cx="57" cy="97" rx="32" ry="7" fill="#071c25" opacity=".12"/>' + (shapes[key] || shapes.home) + '</svg>';
  }
  const slides = [
    { product: '滴答清单', word: '记录', kicker: '把事情记清楚', color: 'mint', icon: 'daily', logo: './assets/dida-official.png', source: 'https://www.dida365.com/', title: '先记下来，脑袋轻一点。', footer: '任务、日历和提醒，放进同一个位置。' },
    { product: '番茄 ToDo', word: '专注', kicker: '给注意力一个边界', color: 'apricot', icon: 'pomodoro', logo: './assets/tomatodo-official.jpg', source: 'https://apps.apple.com/cn/app/id1242689729', title: '留一段时间，只做这一件。', footer: '让一段专注，有开始，也有休息。' },
    { product: '上岸鸭', word: '执行', kicker: '陪你把下一步做出来', color: 'lilac', icon: 'knowledge', title: '从“想做”，走到“做成”。', items: ['选任务、排时间，再拆成可完成的小关。', '记下卡点，做完后留下复盘与知识。'], footer: '使用重心：计划 → 专注 → 关卡 → 复盘' }
  ];
  function screenDemo(index) {
    if(index===0)return '<div class="ha-demo-list" aria-hidden="true"><div><i>✓</i><span>整理今天的资料</span><small>已完成</small></div><div><i></i><span>推进最重要的一件事</span><small>今天</small></div><div><i></i><span>留一点时间给自己</span><small>稍后</small></div></div>';
    if(index===1)return '<div class="ha-demo-focus" aria-hidden="true"><div class="ha-focus-dial"><span>25:00<small>这一刻，只做一件事</small></span></div><div class="ha-focus-chips"><span>专注</span><i>→</i><span>休息</span><i>→</i><span>再出发</span></div></div>';
    return '<div class="ha-demo-voyage" aria-hidden="true"><div class="ha-voyage-station is-done"><b>✓</b><span>收好计划</span></div><i></i><div class="ha-voyage-station is-current"><b>02</b><span>走完这一关</span></div><i></i><div class="ha-voyage-station"><b>03</b><span>留下收获</span></div></div>';
  }
  function cards(prefix, publicPage) {
    return '<section class="ha-features" id="'+prefix+'Features" aria-labelledby="'+prefix+'FeatureTitle"><div class="ha-section-title"><div><p class="ha-eyebrow">YOUR LITTLE WORKSHOP</p><h2 id="'+prefix+'FeatureTitle">想从哪件事开始？</h2></div><p>六个入口，各有分工。<br>选一个，就能开始。</p></div><div class="ha-feature-grid">'+features.map(f=>'<button type="button" class="ha-feature ha-'+f.color+'" data-ha-go="'+f.key+'"'+(publicPage?' data-ha-public':'')+'><span class="ha-feature-top">'+artIcon(f.key)+'<span class="ha-feature-number">'+f.number+'</span></span><span class="ha-feature-name">'+f.name+'</span><span class="ha-feature-metaphor">'+f.subtitle+'</span><span class="ha-feature-description">'+f.text+'</span><span class="ha-feature-action">'+f.action+'<span aria-hidden="true">↗</span></span></button>').join('')+'</div></section>';
  }
  function comparison(prefix) {
    return '<section class="ha-comparison" aria-labelledby="'+prefix+'CompareTitle"><div class="ha-editorial"><p class="ha-eyebrow">A LITTLE DIFFERENCE</p><h2 id="'+prefix+'CompareTitle">记录，专注，<br><em>然后，真的出发。</em></h2><p class="ha-editorial-body">都是自律工具，陪你的方式各不相同。<br>拨动屏幕，看看三种使用重心。</p><div class="ha-process"><span>把事记下来</span><i>→</i><span>留出时间</span><i>→</i><span>走完下一步</span></div><p class="ha-comparison-note">按常见使用重心介绍，非完整功能对照。</p></div><div class="ha-monitor-scene"><span class="ha-scene-orbit" aria-hidden="true"></span><span class="ha-scene-sphere" aria-hidden="true"></span><div class="ha-monitor"><div class="ha-monitor-top"><span><i></i> 三种陪伴方式</span><span>SHANGAN STUDIO</span></div><div class="ha-screen" id="'+prefix+'Screen" aria-live="polite"></div><div class="ha-screen-tabs" role="tablist" aria-label="比较工具的使用重心">'+slides.map((s,i)=>'<button type="button" role="tab" id="'+prefix+'Tab'+i+'" aria-controls="'+prefix+'Screen" data-ha-slide="'+i+'" aria-selected="'+(i===2)+'" tabindex="'+(i===2?'0':'-1')+'">'+s.word+'<span>'+s.product+'</span></button>').join('')+'</div></div><div class="ha-monitor-stand" aria-hidden="true"></div><div class="ha-screen-controls"><button type="button" data-ha-prev aria-label="上一张介绍">←</button><span data-ha-position>03 / 03</span><button type="button" data-ha-next aria-label="下一张介绍">→</button><button type="button" data-ha-auto aria-pressed="false">自动轮播</button></div></div></section>';
  }
  const carouselStates=[];
  function initComparison(scope,prefix){
    const panel=scope.querySelector('#'+prefix+'Screen');if(!panel)return;
    let selected=2,auto=!window.matchMedia('(prefers-reduced-motion: reduce)').matches,timer=null,hovered=false,focused=false;
    function render(index,direction){
      selected=(index+3)%3;const s=slides[selected];
      panel.className='ha-screen ha-'+s.color;
      panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',prefix+'Tab'+selected);panel.tabIndex=0;
      const logo=s.logo?'<a class="ha-brand-link" href="'+s.source+'" target="_blank" rel="noopener noreferrer" aria-label="'+s.product+'官方页面"><img class="ha-brand-logo" src="'+s.logo+'" alt="'+s.product+'标志"></a>':artIcon(s.icon);
      panel.innerHTML=DOMPurify.sanitize('<div class="ha-slide-sheet"><div class="ha-slide-brand">'+logo+'<span>'+s.product+'<small>'+s.kicker+'</small></span><b>'+s.word+'</b></div><h3>'+s.title+'</h3>'+screenDemo(selected)+'<p class="ha-slide-footer">'+s.footer+'<small>功能示意</small></p></div><div class="ha-screen-progress" aria-hidden="true"></div>');
      scope.querySelectorAll('[data-ha-slide]').forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===selected));tab.tabIndex=i===selected?0:-1;});
      scope.querySelector('[data-ha-position]').textContent='0'+(selected+1)+' / 03';
      panel.style.setProperty('--ha-turn',direction===-1?'-1':'1');
      panel.classList.toggle('is-playing',auto);panel.classList.remove('ha-screen-turn');void panel.offsetWidth;panel.classList.add('ha-screen-turn');
    }
    function stop(){clearInterval(timer);timer=null;}
    function start(){stop();if(!auto||document.hidden||hovered||focused)return;timer=setInterval(()=>{const visible=prefix==='public' ? !$('marketingView').hidden : !$('appHome').hidden&&atHome;if(visible&&!document.hidden)render(selected+1,1);},6500);}
    function setAuto(value){auto=value;const btn=scope.querySelector('[data-ha-auto]');btn.textContent=auto?'暂停轮播':'自动轮播';btn.setAttribute('aria-pressed',String(auto));panel.setAttribute('aria-live',auto?'off':'polite');start();}
    function turn(direction){render(selected+direction,direction);start();}
    scope.querySelectorAll('[data-ha-slide]').forEach((tab,i)=>{tab.onclick=()=>{render(i,i<selected?-1:1);start();};tab.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();render(event.key==='Home'?0:event.key==='End'?2:selected+(event.key==='ArrowRight'?1:-1),event.key==='ArrowLeft'?-1:1);scope.querySelectorAll('[data-ha-slide]')[selected].focus();}};});
    scope.querySelector('[data-ha-prev]').onclick=()=>turn(-1);
    scope.querySelector('[data-ha-next]').onclick=()=>turn(1);
    scope.querySelector('[data-ha-auto]').onclick=()=>setAuto(!auto);
    const monitor=scope.querySelector('.ha-monitor'),top=monitor.querySelector('.ha-monitor-top');
    const flip=document.createElement('div');flip.className='ha-screen-flip';flip.innerHTML='<button type="button" aria-label="电视上一页">‹</button><button type="button" aria-label="电视下一页">›</button>';
    flip.children[0].onclick=()=>turn(-1);flip.children[1].onclick=()=>turn(1);top.append(flip);
    let touchX=null;panel.addEventListener('touchstart',e=>{touchX=e.touches[0].clientX;},{passive:true});panel.addEventListener('touchend',e=>{if(touchX!==null&&Math.abs(e.changedTouches[0].clientX-touchX)>45)turn(e.changedTouches[0].clientX<touchX?1:-1);touchX=null;},{passive:true});
    panel.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();turn(e.key==='ArrowLeft'?-1:1);}});
    monitor.addEventListener('mouseenter',()=>{hovered=true;stop();});monitor.addEventListener('mouseleave',()=>{hovered=false;start();});monitor.addEventListener('focusin',()=>{focused=true;stop();});monitor.addEventListener('focusout',event=>{if(!monitor.contains(event.relatedTarget)){focused=false;start();}});
    carouselStates.push({stop,start});render(2);setAuto(auto);
  }
  function setHome(value){
    atHome=value;const daily=$('view-daily');if(!daily)return;
    daily.classList.toggle('ha-home-active',value);$('lcHero').hidden=!value;
    ['homeTipCard','syDailyReceipt','dailyTabs','dailySub'].forEach(id=>{if($(id))$(id).hidden=value;});
    const home=$('haHomeNav');if(home)home.classList.toggle('active',value&&!daily.hidden);
    const normal=document.querySelector('.app-nav-item[data-view="daily"]');if(normal&&value)normal.classList.remove('active');
  }
  function go(key){
    document.body.classList.remove('ha-nav-open');const menu=$('haNavToggle');if(menu)menu.setAttribute('aria-expanded','false');
    if(key==='home'){S.switchAppView('daily');setHome(true);document.querySelector('.app-main').scrollTop=0;return;}
    if(key==='peers'){document.dispatchEvent(new CustomEvent('sy:peers'));return;}
    if(key==='capture'){S.openQuickCapture();return;}
    S.switchAppView(key);
    if(key==='daily'){S.activeDailyTab='list';document.querySelectorAll('.daily-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab==='list'));S.renderDailyTab();}
    setHome(false);
  }
  function decorateSidebar(){
    const names={daily:'每日清单',quadrant:'轻重缓急',deadlines:'截止雷达',inbox:'已完成',pomodoro:'专注陪伴',habits:'习惯养成',stats:'进度复盘',knowledge:'知识与路线',profile:'我的资料'};
    document.querySelectorAll('.app-nav-item').forEach(btn=>{const key=btn.dataset.view;if(!names[key])return;const icon=btn.querySelector('.app-nav-icon');if(icon)icon.innerHTML=DOMPurify.sanitize(artIcon(key));const label=btn.querySelector('span:last-child');if(label)label.textContent=names[key];btn.title=names[key];});
    const nav=$('appNav')||document.querySelector('.app-nav');
    if(nav&&!$('haHomeNav')){const home=document.createElement('button');home.id='haHomeNav';home.type='button';home.className='ha-home-nav';home.innerHTML=DOMPurify.sanitize(artIcon('home')+'<span>工作台首页</span>');home.onclick=()=>go('home');nav.prepend(home);}
    const capture=$('quickCaptureBtn');if(capture)capture.innerHTML=DOMPurify.sanitize(artIcon('inbox')+'<span>随手收集</span><kbd>Ctrl K</kbd>');
    const top=document.querySelector('#appHome .app-main-topbar');
    if(top&&!$('haNavToggle')){const toggle=document.createElement('button');toggle.id='haNavToggle';toggle.type='button';toggle.setAttribute('aria-label','展开功能导航');toggle.setAttribute('aria-expanded','false');toggle.innerHTML=DOMPurify.sanitize('<span aria-hidden="true">☰</span> 导航');toggle.onclick=()=>{const open=document.body.classList.toggle('ha-nav-open');toggle.setAttribute('aria-expanded',String(open));};top.prepend(toggle);const backdrop=document.createElement('button');backdrop.type='button';backdrop.className='ha-nav-backdrop';backdrop.setAttribute('aria-label','收起导航');backdrop.onclick=()=>{document.body.classList.remove('ha-nav-open');toggle.setAttribute('aria-expanded','false');toggle.focus();};$('appHome').appendChild(backdrop);}
    document.querySelector('.app-sidebar').setAttribute('aria-label','功能导航');
  }
  function buildWorkspaceHome(){
    const hero=$('lcHero');if(!hero||$('haWorkspaceHome'))return;
    const section=document.createElement('div');section.id='haWorkspaceHome';
    section.innerHTML=DOMPurify.sanitize('<header class="ha-home-intro"><div><p class="ha-eyebrow">SHANGAN · PERSONAL WORKSHOP</p><h1>今天，往岸边<span>再走一点。</span></h1><p>把计划、专注和每一次小小的进步，放在这里。</p></div><button class="ha-capture-link" type="button" data-ha-go="capture">＋ 先记下一件事</button></header>'+cards('workspace',false)+comparison('workspace'));
    hero.prepend(section);initComparison(section,'workspace');
  }
  function buildMarketing(){
    const main=document.querySelector('#marketingView > main');if(!main)return;
    main.innerHTML=DOMPurify.sanitize('<section class="ha-public-hero" id="top"><div class="ha-public-intro"><p class="ha-eyebrow">上岸鸭 · 个人行动工作室 · 离线版</p><h1>让想做的事，<br><em>慢慢有了回响。</em></h1><p>清单有位置，专注有陪伴。<br>从下一步开始，把计划走成自己的路。</p><div class="ha-public-actions"><button type="button" data-open-login class="ha-primary">进入我的空间 <span>↗</span></button><a href="#features">先看看能做什么 ↓</a></div></div>'+comparison('public')+'</section><div id="features">'+cards('public',true)+'</div><section class="ha-workflow"><p class="ha-eyebrow">SMALL STEPS, REAL PROGRESS</p><h2>一次只处理一件事。</h2><div><article><b>01</b><h3>收好一个念头</h3><p>随手记录，补上类别和截止日期。</p></article><article><b>02</b><h3>走完一小段路</h3><p>排进清单、开始专注，卡住时求助。</p></article><article><b>03</b><h3>留下自己的收获</h3><p>复盘真实用时，把方法收成知识小票。</p></article></div><button type="button" data-open-login class="ha-primary">从我的第一件事开始 ↗</button></section>');
    initComparison(main,'public');
    const nav=document.querySelector('#marketingView .nav-right');if(nav){const link=nav.querySelector('.nav-link');if(link)link.textContent='探索功能';}
    const footer=document.querySelector('#marketingView .site-footer');if(footer)footer.innerHTML=DOMPurify.sanitize('<div class="ha-footer"><strong>上岸鸭</strong><span>把很远的目标，过成今天的一小步。</span><a href="#top">回到顶部 ↑</a></div>');
  }
  const switchView=S.switchAppView;
  S.switchAppView=function(view){const out=switchView.apply(this,arguments);setHome(false);document.body.classList.remove('ha-nav-open');if($('haNavToggle'))$('haNavToggle').setAttribute('aria-expanded','false');return out;};
  const renderConsole=S.renderConsoleHero;
  S.renderConsoleHero=function(){const out=renderConsole.apply(this,arguments);buildWorkspaceHome();setHome(atHome);return out;};
  const enter=S.enterApp;
  S.enterApp=function(){const out=enter.apply(this,arguments);setHome(true);if(pendingEntry){const target=pendingEntry;pendingEntry=null;go(target);}return out;};
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-ha-go]');if(!button)return;
    if(button.hasAttribute('data-ha-public')&&$('appHome').hidden){pendingEntry=button.dataset.haGo;const login=document.querySelector('#marketingView [data-open-login]');if(login)login.click();}
    else go(button.dataset.haGo);
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('ha-nav-open')){document.body.classList.remove('ha-nav-open');$('haNavToggle').setAttribute('aria-expanded','false');$('haNavToggle').focus();}});
  document.addEventListener('visibilitychange',()=>carouselStates.forEach(x=>document.hidden?x.stop():x.start()));
  window.addEventListener('pagehide',()=>carouselStates.forEach(x=>x.stop()));
  document.body.classList.add('ha-art');buildMarketing();buildWorkspaceHome();decorateSidebar();setHome(true);
  window.SYHome={go,artIcon};
})();
