
(function(){
  "use strict";

  // ---- 营销页：滚动揭示 + 数字滚动计数（参照 tikhub 的交互感，仅用于 #marketingView）----
  (function initMarketingMotion(){
    var revealEls = Array.prototype.slice.call(document.querySelectorAll('#marketingView .reveal'));
    if(!revealEls.length) return;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduceMotion || typeof IntersectionObserver !== 'function'){
      revealEls.forEach(function(el){ el.classList.add('is-visible'); });
    } else {
      var io = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if(entry.isIntersecting){
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
      revealEls.forEach(function(el){ io.observe(el); });
    }

    // 数字滚动计数：只对带 data-count-to 的真实数字生效，data-static 的原样显示不参与计数
    var counters = Array.prototype.slice.call(document.querySelectorAll('#marketingView [data-count-to]'));
    if(!counters.length || reduceMotion) return;
    function animateCount(el){
      var target = parseFloat(el.getAttribute('data-count-to'));
      var suffix = el.getAttribute('data-suffix') || '';
      if(!isFinite(target)) return;
      var dur = 1100, start = null;
      function step(ts){
        if(start === null) start = ts;
        var p = Math.min(1, (ts - start) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        var val = Math.round(target * eased);
        el.textContent = val + suffix;
        if(p < 1) requestAnimationFrame(step);
        else el.textContent = target + suffix;
      }
      requestAnimationFrame(step);
    }
    if(typeof IntersectionObserver === 'function'){
      var cio = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if(entry.isIntersecting){
            animateCount(entry.target);
            cio.unobserve(entry.target);
          }
        });
      }, { threshold: 0.6 });
      counters.forEach(function(el){ cio.observe(el); });
    } else {
      counters.forEach(animateCount);
    }
  })();

  // ---- 营销页立体化：hero 截图卡跟随鼠标做 3D 倾斜（+ 阴影偏移 + 屏幕反光），
  // 手法跟登录后导航台的 initConsoleParallax 完全一致，只是选择器换成营销页自己的元素、
  // 反光颜色换成"静潮"主题的薄荷绿。只在精确指针（桌面鼠标）且没开"减少动态效果"时生效，
  // .hero-preview-card 不是可点击元素、也没有可点击的子元素，纯装饰，跟点击稳定性无关。----
  (function initHeroPreviewTilt(){
    var wrap = document.querySelector('.hero-preview');
    var card = wrap ? wrap.querySelector('.hero-preview-card') : null;
    if(!wrap || !card) return;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var finePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    if(reduceMotion || !finePointer) return;
    var raf = null;
    wrap.addEventListener('mousemove', function(e){
      var rect = wrap.getBoundingClientRect();
      var px = (e.clientX - rect.left) / rect.width;
      var py = (e.clientY - rect.top) / rect.height;
      var rx = (0.5 - py) * 8;
      var ry = (px - 0.5) * 8;
      if(raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function(){
        card.style.transform = 'rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg) translateY(-6px)';
        card.style.setProperty('--hp-shadow-x', (ry * 1.8).toFixed(1) + 'px');
        card.style.setProperty('--hp-shadow-y', (20 - rx * 1.4).toFixed(1) + 'px');
        card.style.setProperty('--hp-glare-x', (50 + ry * 3.4).toFixed(1) + '%');
        card.style.setProperty('--hp-glare-y', (20 - rx * 2.8).toFixed(1) + '%');
      });
    });
    wrap.addEventListener('mouseleave', function(){
      if(raf) cancelAnimationFrame(raf);
      card.style.transform = '';
      card.style.removeProperty('--hp-shadow-x');
      card.style.removeProperty('--hp-shadow-y');
      card.style.removeProperty('--hp-glare-x');
      card.style.removeProperty('--hp-glare-y');
    });
  })();

  // ---- 营销页立体化：hero 背景层跟随整个 hero 区域做很小幅度的反向视差位移，
  // 制造"背景更远"的深度错觉——跟 initHeroBgParallax（导航台版）同一套手法。
  // pointer-events:none 的纯装饰层，跟任何可点击元素都不共享包围盒。----
  (function initMktHeroBgParallax(){
    var hero = document.querySelector('.hero');
    var bg = hero ? hero.querySelector('.hero-bg') : null;
    if(!hero || !bg) return;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var finePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    if(reduceMotion || !finePointer) return;
    var raf = null;
    hero.addEventListener('mousemove', function(e){
      var rect = hero.getBoundingClientRect();
      var px = (e.clientX - rect.left) / rect.width;
      var py = (e.clientY - rect.top) / rect.height;
      var dx = (0.5 - px) * 8;
      var dy = (0.5 - py) * 8;
      if(raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function(){
        bg.style.transform = 'translate(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px)';
      });
    });
    hero.addEventListener('mouseleave', function(){
      if(raf) cancelAnimationFrame(raf);
      bg.style.transform = '';
    });
  })();

  // ---- 营销页立体化：四张真实截图卡改走跟 roadmap 卡环一样的"CSS animation 自转 + 反向
  // 抵消"，不再需要 JS 跟手倾斜——旧的 initMktShotCardsTilt（mousemove 里手写 rx/ry 再拼
  // transform 字符串塞进 inline style）已删；CSS animation 的优先级本来就高于普通 inline
  // style，留着这段 JS 也只是白白挂 mousemove 监听器、实际视觉效果会被环的自转盖掉，纯浪费。

  // ---- orbit expand/collapse ----
  var pivot = document.getElementById('orbitPivot');
  var ring = document.getElementById('orbitRing');
  if(pivot && ring){
    pivot.addEventListener('click', function(){
      var expanded = ring.classList.toggle('expanded');
      pivot.classList.toggle('is-open', expanded);
      pivot.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    });
  }

  // ---- accordion (single-open) ----
  var accItems = Array.prototype.slice.call(document.querySelectorAll('.acc-item'));
  accItems.forEach(function(item){
    var trigger = item.querySelector('.acc-trigger');
    var panel = item.querySelector('.acc-panel');
    trigger.addEventListener('click', function(){
      var wasOpen = item.classList.contains('open');
      accItems.forEach(function(other){
        other.classList.remove('open');
        other.querySelector('.acc-trigger').setAttribute('aria-expanded', 'false');
        other.querySelector('.acc-panel').style.maxHeight = null;
      });
      if(!wasOpen){
        item.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        panel.style.maxHeight = panel.scrollHeight + 'px';
      }
    });
  });
  window.addEventListener('resize', function(){
    var openItem = document.querySelector('.acc-item.open');
    if(openItem){
      var p = openItem.querySelector('.acc-panel');
      p.style.maxHeight = p.scrollHeight + 'px';
    }
  });

  // ---- app home（登录成功后进入的真实首页：收集箱 + 每日清单，是真数据不是摆设） ----
  // 数据只存在当前浏览器的 localStorage 里，按登录账号（手机号，或抖音演示账号）分开存放；
  // 这仍然是纯前端演示，不是真实后端同步——换设备或清了浏览器数据会清空，
  // 对应 PRD 第十一节里如实说明过的技术边界。
  var marketingView = document.getElementById('marketingView');
  var appHome = document.getElementById('appHome');
  var appGreetingName = document.getElementById('appGreetingName');
  var appDateLine = document.getElementById('appDateLine');
  var appCoinCount = document.getElementById('appCoinCount');

  function maskPhone(p){
    if(!/^1\d{10}$/.test(p || '')) return '';
    return p.slice(0, 3) + '****' + p.slice(7);
  }

  // ===== 任务数据：localStorage，按账号分区 =====
  var APP_DATA_KEY = 'shangan_ya_app_data_v1';
  // 下面这份 TASK_CATEGORIES/CATEGORY_COLORS 现在只当"老账号迁移种子"用——类别本身已经改成
  // 存在每个账号自己的 acct.categories 里、可以自己增删改了（见 getAcctData()）。这份老的全局
  // 列表只在两个地方还有用：①老账号第一次跑到 categories 字段缺失的分支时，原样把这份当种子搬进去，
  // 保证"我自己一直用的这几个类别不会变"；②categoryColor() 兜底极端情况（历史任务上存的类别名，
  // 现在账号的类别列表里已经找不到了）。新账号不会用这份，会拿到下面更通用的 DEFAULT_TASK_CATEGORIES。
  var TASK_CATEGORIES = ['学习AI产品经理', '运营实战', '考研准备', '副业作业', '其他'];
  // 清单按类别分组时，每个类别一个固定颜色的小圆点，纯装饰用来快速区分类别（参照用户给的
  // 参考图里"分类小图标"的意思），不是数据可视化图表，所以不需要跑 dataviz 的配色校验脚本，
  // 5 个颜色互相之间够区分、跟界面里已经有语义的强调色(--accent橙/--link青/--urgent红)错开就行。
  var CATEGORY_COLORS = {
    '学习AI产品经理': '#4C8DFF',
    '运营实战': '#E0708A',
    '考研准备': '#8B6FE0',
    '副业作业': '#C9A227',
    '其他': '#8B98A0'
  };
  // 全新账号（这个功能上线以后才第一次登录、之前从没存过数据的账号）拿到的默认类别——
  // 用更通用的生活场景命名，不会是"学习AI产品经理"这种只为一个人量身定做的类别。
  // 「健康」特意没有用跟下面调色板里同色号的颜色（比如 #D97FB0）——不然一个全新账号只要
  // 手动加一个自定义类别，颜色就有很大概率跟内置的「健康」撞色，两个类别的圆点看着像同一个。
  // 精力曲线：黄金专注期/平缓期/灵感期——默认给三段常见的例子，账号自己在"我的"页可以改时间段、
  // 改文案、增删；纯新增的可选字段，不影响、不读取任何已有账号数据。
  var DEFAULT_ENERGY_PERIODS = [
    { id: 'ep_gold', emoji: '🌅', name: '黄金专注期', startMin: 8 * 60, endMin: 10 * 60, suggestion: '适合啃难题——数学难题、专业课背诵这类最耗脑力的任务' },
    { id: 'ep_steady', emoji: '🌤', name: '平缓期', startMin: 15 * 60, endMin: 17 * 60, suggestion: '适合整理笔记、刷题这类不用太烧脑的任务' },
    { id: 'ep_spark', emoji: '🌙', name: '灵感期', startMin: 19 * 60, endMin: 21 * 60, suggestion: '适合写作文、复盘总结这类需要想法的任务' }
  ];
  var DEFAULT_TASK_CATEGORIES = [
    { name: '工作', color: '#4C8DFF' },
    { name: '学习', color: '#8B6FE0' },
    { name: '生活', color: '#4FA377' },
    { name: '健康', color: '#E8916A' },
    { name: '其他', color: '#8B98A0' }
  ];
  // 用户自己在"管理类别"里加新类别时，按顺序从这份调色板里挑一个颜色，不用用户自己选颜色——
  // 跟上面 CATEGORY_COLORS 边上的注释同理，纯装饰用，不需要过色盲校验。10个够绕好几圈了。
  var CATEGORY_COLOR_PALETTE = ['#4C8DFF','#E0708A','#8B6FE0','#C9A227','#4FA377','#D97FB0','#5FA8D9','#B0793D','#7A8CC4','#8B98A0'];
  function pickNextCategoryColor(existingList){
    return CATEGORY_COLOR_PALETTE[(existingList || []).length % CATEGORY_COLOR_PALETTE.length];
  }
  // categoryColor() 全文一直是"传类别名字、查颜色"的用法，call site 很多（列表小圆点/黑匣子/
  // 打印小票……），类别改成按账号存之后没必要把这些 call site 全部改成"传 acct 进来"——
  // 用一个缓存，每次 getAcctData() 都会刷新成当前账号最新的类别列表，够用了。
  var acctCategoriesCache = null;
  function refreshCategoriesCache(list){ acctCategoriesCache = list || []; }
  function categoryColor(cat){
    var found = (acctCategoriesCache || []).find(function(c){ return c.name === cat; });
    if(found) return found.color;
    // 兜底：任务/记录上存的类别名，如果在当前账号的类别列表里已经找不到了（比如类别被删除后，
    // 历史数据还留着旧名字），先试试老版本的全局配色表，实在没有就用灰色——保证任何情况下都能
    // 显示出一个颜色，不会因为找不到类别而报错或者显示空白。
    return CATEGORY_COLORS[cat] || '#8B98A0';
  }
  var currentAccountKey = 'guest';
  var currentDisplayName = '同学'; // 登录时 enterApp() 会覆盖成真实昵称——"我的"页面头像旁的名字从这里取，不用再回去解析问候语文本
  // 日视图时间轴：可视范围 06:00–24:00，每小时 52px（跟 CSS 里的 .timeline-hour-label / .timeline-grid-row 保持一致）。
  var TIMELINE_START_MIN = 360;
  var TIMELINE_END_MIN = 1440;
  var TIMELINE_HOUR_PX = 52;

  function loadAllAppData(){
    try{ return JSON.parse(window.localStorage.getItem(APP_DATA_KEY) || '{}'); }
    catch(e){ return {}; }
  }
  function saveAllAppData(all){
    try{ window.localStorage.setItem(APP_DATA_KEY, JSON.stringify(all)); }
    catch(e){ /* 本地存储不可用时静默降级，不影响演示的其余部分 */ }
  }
  // 习惯模块：预置几个空的分类框架（没有预置具体习惯内容），用固定 id 而不是 uid()——
  // 这样在第一次真正保存之前，每次 getAcctData() 重新生成默认值时 id 还是一样的，不会因为
  // 还没写盘就跟模块里记着的"当前选中分类"对不上号。
  var DEFAULT_HABIT_CATEGORIES = [
    { id: 'hc_grow', name: '学习成长' },
    { id: 'hc_health', name: '健康作息' },
    { id: 'hc_work', name: '工作效率' },
    { id: 'hc_life', name: '生活习惯' }
  ];
  function getAcctData(){
    var all = loadAllAppData();
    var isNewAcct = !all[currentAccountKey]; // 这个账号之前从没存过任何数据——真正的新账号，不是"字段缺失的老账号"
    var d = all[currentAccountKey] || {};
    if(!d.tasks) d.tasks = [];
    if(!d.dailyHours) d.dailyHours = {};
    if(typeof d.coins !== 'number') d.coins = 20;
    // 历史累计金币：只增不减（花掉不影响），给"金币商城"结算用；老账号第一次跑到这里时，
    // 从当前余额起算——不瞎编一个更大的历史值，也不会让老账号一上来就比新账号"吃亏"。
    if(typeof d.lifetimeCoins !== 'number') d.lifetimeCoins = d.coins;
    if(!d.ownedAvatars) d.ownedAvatars = ['duck_plain']; // 素色鸭永远免费拥有
    if(!d.equippedAvatar) d.equippedAvatar = 'duck_plain';
    if(!d.ownedAccents) d.ownedAccents = ['tide']; // 静潮青＝当前默认强调色，免费拥有
    if(!d.equippedAccent) d.equippedAccent = 'tide';
    if(typeof d.freezeCards !== 'number') d.freezeCards = 0; // 免打卡卡库存
    if(!d.badgeUnlocks) d.badgeUnlocks = {}; // { 勋章id: 解锁时间戳 }——首次达标时才写入，之后不会因为数据变化又消失
    if(!d.durationLog) d.durationLog = []; // 番茄钟：每次真正结束后，按类别记一条真实用时
    if(d.activeTimer === undefined) d.activeTimer = null; // 番茄钟：当前计时中的任务（全局最多一个）
    if(!d.habitCategories) d.habitCategories = DEFAULT_HABIT_CATEGORIES.map(function(c){ return { id: c.id, name: c.name }; });
    if(!d.habits) d.habits = []; // {id, name, categoryId, mode, createdAt}
    if(!d.habitCheckins) d.habitCheckins = []; // {id, habitId, dateKey, points, loggedAt}——一天一条，撤销只能撤"今天"这条
    if(d.examDate === undefined) d.examDate = null; // 顶部倒计时用的考试日期，YYYY-MM-DD，没设置过就是 null，不瞎编天数
    if(typeof d.bio !== 'string') d.bio = ''; // 个人简介/爱好，纯本地字段——现在没有别的真实用户能看到，只是先存好
    // 任务类别：老账号（这个功能上线前就已经登录过、存过数据的账号）第一次跑到这个字段缺失的
    // 分支时，原样把它们当时用的那份固定类别+配色当种子搬进来，保证"我自己的类别不会变"；
    // 全新账号（第一次调用 getAcctData 时 all[currentAccountKey] 完全不存在）直接给一套更
    // 通用的默认类别，不会看到这是为另一个人量身定做的类别。
    if(!d.categories){
      d.categories = isNewAcct
        ? DEFAULT_TASK_CATEGORIES.map(function(c){ return { name: c.name, color: c.color }; })
        : TASK_CATEGORIES.map(function(name){ return { name: name, color: CATEGORY_COLORS[name] || '#8B98A0' }; });
    }
    // 精力曲线 + 排期间隔：都是纯新增字段，老账号第一次跑到这里时按默认值补上，不会覆盖、也不会
    // 影响之前已经存在的 tasks/durationLog/habits 等任何数据。
    if(!d.energyPeriods) d.energyPeriods = DEFAULT_ENERGY_PERIODS.map(function(p){ return { id: p.id, emoji: p.emoji, name: p.name, startMin: p.startMin, endMin: p.endMin, suggestion: p.suggestion }; });
    if(typeof d.taskGapMinutes !== 'number') d.taskGapMinutes = 12; // "AI计划生成"自动排任务之间留的缓冲分钟数；手动排的时间不受影响
    refreshCategoriesCache(d.categories);
    return d;
  }
  function saveAcctData(d){
    var all = loadAllAppData();
    all[currentAccountKey] = d;
    saveAllAppData(all);
  }

  function pad2(n){ return (n < 10 ? '0' : '') + n; }
  function fmtDateKey(d){ return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function todayKey(){ return fmtDateKey(new Date()); }
  function parseDateKey(k){ var p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addDaysKey(k, n){ var d = parseDateKey(k); d.setDate(d.getDate() + n); return fmtDateKey(d); }
  function mondayOf(k){ var d = parseDateKey(k); var offset = (d.getDay() + 6) % 7; return addDaysKey(k, -offset); }
  var WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  function fmtDayLabel(k){
    var d = parseDateKey(k);
    var s = (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + WEEKDAY_NAMES[d.getDay()];
    if(k === todayKey()) s += '（今天）';
    return s;
  }
  // 按类别分组的列表里塞进日期用的短格式——不带星期，给同一行里其他信息(时间/预计时长)留地方。
  function fmtShortDayLabel(k){
    var d = parseDateKey(k);
    return k === todayKey() ? '今天' : ((d.getMonth() + 1) + '月' + d.getDate() + '日');
  }
  function fmtDuration(mins){
    mins = Math.max(0, Math.round(mins));
    if(mins < 60) return mins + '分钟';
    var h = Math.floor(mins / 60), m = mins % 60;
    return m ? (h + '小时' + m + '分钟') : (h + '小时');
  }
  // ---- 时间轴用到的时间换算：分钟数（从 0:00 起算） <-> "HH:MM" ----
  function fmtClock(mins){
    mins = ((Math.round(mins) % 1440) + 1440) % 1440;
    return pad2(Math.floor(mins / 60)) + ':' + pad2(mins % 60);
  }
  function parseClockToMinutes(str){
    if(!str) return null;
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(str).trim());
    if(!m) return null;
    var h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
    if(h < 0 || h > 23 || mi < 0 || mi > 59) return null;
    return h * 60 + mi;
  }
  function minutesSinceMidnight(d){ return d.getHours() * 60 + d.getMinutes(); }

  // ==================== 后端连接 ====================
  // 发布在 claude.ai 上的那个版本，浏览器规则一律禁止它发出对外请求——所以联网的功能在那儿
  // 用不了，这不是代码没写，是那个环境不许。把这套东西部署到 Vercel（或你自己的任何域名）之后，
  // 下面这些自动活过来：卡壳问真 AI、贴链接自动拆关卡、全网搜索、AI 看画面判断专注。
  //
  // 后端地址和口令单独存在自己的 localStorage 键里，不进账号数据——
  // 你攒的任务、金币、用时记录、勋章一个字节都不受影响。
  var BACKEND_KEY = 'shangan_ya_backend_v1';
  var backendState = { checked: false, ok: false, caps: null, err: '', base: '', warn: '', tokenRequired: false };

  function backendCfg(){
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(BACKEND_KEY) || '{}') || {}; } catch(e){}
    var sameOrigin = /^https?:$/i.test(location.protocol) ? location.origin : 'http://127.0.0.1:8877';
    var localPage = /^https?:$/.test(location.protocol) && /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
    return {base:(localPage ? sameOrigin : (saved.base || sameOrigin || '')).replace(/\/$/,''),token:localPage ? '' : (saved.token || ''),manual:!localPage && !!saved.base};
  }
  function saveBackendCfg(base, token){
    try {
      localStorage.setItem(BACKEND_KEY, JSON.stringify({ base: (base || '').trim(), token: (token || '').trim() }));
    } catch(e){}
    backendState = { checked: false, ok: false, caps: null, err: '', base: '', warn: '', tokenRequired: false };
  }
  function backendOn(cap){
    if(!backendState.ok || !backendState.caps) return false;
    return cap ? !!backendState.caps[cap] : true;
  }
  // 所有对后端的请求都走这里：永远不抛异常，永远回一个能直接拿去显示的东西。
  // 后端连不上的时候每个功能都要有自己的退路，不能让页面卡住或者白屏。
  async function backendCall(path, data, timeout) {
    var cfg = backendCfg();
    if(!cfg.base) return {ok:false,offline:true,error:'请用“启动闯关陪跑.cmd”打开，才能使用联网检索。'};
    var controller = new AbortController(), timer = setTimeout(function(){ controller.abort(); }, timeout || 30000);
    try {
      var headers = {'Content-Type':'application/json'};
      if(cfg.token) headers.Authorization = 'Bearer ' + cfg.token;
      var response = await fetch(cfg.base + path, {method:data == null ? 'GET' : 'POST',headers:headers,body:data == null ? undefined : JSON.stringify(data),signal:controller.signal});
      var payload = await response.json().catch(function(){ return {}; });
      if(!response.ok) return {ok:false,data:payload,code:payload.code,error:payload.error || ('服务返回 ' + response.status)};
      return {ok:true,data:payload};
    } catch(e){ return {ok:false,offline:true,error:e.name === 'AbortError' ? '联网请求超时' : ('联网服务未启动：' + e.message)}; }
    finally { clearTimeout(timer); }
  }
  async function backendProbe(force){
    if(backendState.checked && !force) return backendState;
    var cfg = backendCfg();
    backendState = { checked: true, ok: false, caps: null, err: '', base: cfg.base, warn: '', tokenRequired: false };
    if(!cfg.base){ backendState.err = '没填后端地址'; return backendState; }
    var r = await backendCall('/api/health', null, 12000);
    if(r.ok && r.data && r.data.ok){
      backendState.ok = true;
      backendState.caps = r.data.capabilities || {};
      backendState.tokenRequired = !!r.data.tokenRequired;
      backendState.models = r.data.models || {};
      backendState.warn = r.data.warn || '';
      backendState.hint = r.data.hint || '';
    } else {
      backendState.err = r.error || '后端没应答';
    }
    return backendState;
  }
  // 打开页面之后悄悄探一次，不挡任何东西；探不到就安安静静走本地那套
  setTimeout(function(){ backendProbe().catch(function(){}); }, 600);

  // ==================== 直接问 Claude（不用部署、不用密钥）====================
  // 发布在 claude.ai 上的这个版本虽然发不出对外请求，但可以直接把问题递给 Claude 本人。
  // 这条路的好处：不用部署、不用申请密钥、不花你自己的模型额度（算在你 Claude 账号里）。
  // 代价说清楚：它上不了网，只能靠自己已有的知识回答，给不了"我刚查到的最新资料"。
  // 所以顺序是——有自己的后端就用后端（能带着网上查到的资料答），没有就走这条，两条都没有才退回本地规则。
  var sampleNS = undefined; // undefined=还没探过 / null=这个环境没有 / 对象=可用
  async function getSample(){ sampleNS=null; return null; }
  function sampleOn(){ return !!sampleNS; }
  // 问一句，拿一段文字回来。任何一步出问题都回 null，让调用方走自己的退路。
  async function askClaude(prompt){
    var s = await getSample();
    if(!s) return null;
    try {
      var out = await s(prompt, { modelTier: 'default' });
      return (out && out.text) ? out.text : null;
    } catch(e){ return null; }
  }
  // 要一个 JSON 数组回来（拆关卡用）。模型偶尔会给不出合法 JSON，那就当没拿到。
  async function askClaudeJson(prompt){
    var s = await getSample();
    if(!s) return null;
    try {
      var out = await s.json(prompt, { modelTier: 'default' });
      return out || null;
    } catch(e){ return null; }
  }
  // 把 sample 那边的错误码翻成人话。不认识的码一律当"临时故障"，让人自己再点。
  function sampleErrText(e){
    var c = (e && e.code) || '';
    if(c === 'not_granted') return '你没允许这个页面用 Claude';
    if(c === 'rate_limited') return '问得太密了，或者你的额度到顶了，歇一会儿再点';
    if(c === 'session_expired') return '登录过期了，刷新一下页面';
    if(c === 'images_unavailable') return '你这个环境不支持发图片';
    if(c === 'image_rejected') return '这张图它不收';
    if(c === 'invalid_json') return '它答得不成格式，再点一次';
    if(c === 'refused') return '它不肯判这张';
    if(c === 'cancelled') return '中断了';
    return '临时没答上来' + (c ? ('（' + c + '）') : '');
  }

  // ——「让 Claude 看一眼画面」——
  // sample 这条路能带图片，所以摄像头判断也不再非要一台后端了。
  // 但有两条硬约束，决定这条路必须做成"手动点一次看一次"，而不是像后端那样定时轮询：
  //   1) 平台明确说 sample 不许从定时器里调；
  //   2) 它花的是你自己 Claude 账号的额度——定时每 90 秒一张，一个番茄钟就十几次，太贵。
  // 后端那条路花的是你自己的 key，便宜，所以后端在的时候照旧保持自动。
  var sampleVisionCap = undefined; // undefined=没探过 / null=不能发图 / 对象=可以
  async function getSampleVision(){
    if(sampleVisionCap !== undefined) return sampleVisionCap;
    var s = await getSample();
    if(!s || typeof s.limits !== 'function'){ sampleVisionCap = null; return null; }
    try {
      var lim = await s.limits();
      sampleVisionCap = (lim && lim.images) ? lim.images : null;
    } catch(e){ sampleVisionCap = null; }
    return sampleVisionCap;
  }
  function sampleVisionOn(){ return !!sampleVisionCap; }
  var CAMVISION_PROMPT =
    '这是一张学习桌前的摄像头画面，只有 320 像素宽、画质压得很低。' +
    '判断画面里的人当下是什么状态，只回一个 JSON 对象，形如 ' +
    '{"state":"focused","note":"一句中文说明"}。' +
    'state 只能是这五个之一：' +
    'focused（人在画面里、朝着屏幕，像在做事）；' +
    'phone（低头看手机，或手里拿着手机）；' +
    'away（画面里没有人，只剩背景）；' +
    'slouch（趴在桌上、明显靠后发呆、闭眼）；' +
    'unsure（太暗太糊或者遮挡太多，判不了）。' +
    '判不准就老实给 unsure，不要硬猜。note 控制在 20 字以内。';
  // 开局悄悄探一次。探完如果当前正开着用得上它的界面，顺手刷一下让按钮出来。
  setTimeout(function(){
    getSample().then(function(ns){
      if(!ns) return;
      try {
        if(questOverlay && !questOverlay.hidden && questDraft) renderQuest();
        var pv = document.getElementById('view-profile');
        if(pv && !pv.hidden) renderProfileView();
      } catch(e){}
      // 顺带问一句"这个环境能不能发图片"。能，摄像头那块才会多出「看一眼」按钮。
      // limits() 是本地的，不花额度也不弹窗，所以这里探是安全的。
      getSampleVision().then(function(cap){
        if(!cap) return;
        try {
          var vp = document.getElementById('view-pomodoro');
          if(vp && !vp.hidden) renderPomodoroView();
        } catch(e){}
      });
    });
  }, 900);
  function roundUpMinutes(mins, step){ step = step || 5; return Math.ceil(mins / step) * step; }
  function uid(){ return 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  function updateCoinDisplay(){
    if(appCoinCount) appCoinCount.textContent = getAcctData().coins;
  }

  // 给某一天的任务在时间轴上排位置：有开始时间、且跟已经排上的任务不冲突的，正常按时间显示；
  // 没有时间、或者跟别的任务时间冲突的，自动落进"待安排"——不占时间轴，等着手动排或者用"AI计划生成"。
  // 已完成的任务永远算排好了——活儿已经干完了，不存在"排不下"的问题。
  // 返回值形状特意保持跟旧版 computeDayBuckets 一致（mainTasks/bufferTasks/hours/budgetMin/usedMin），
  // 这样周/月/列表视图几乎不用改，只是"排得进/排不进"的判断标准从"预算够不够"换成了"时间冲不冲突"。
  function computeDayTimeline(dateKey){
    var acct = getAcctData();
    var hours = acct.dailyHours[dateKey];
    var dayTasks = acct.tasks
      .filter(function(t){ return t.date === dateKey; })
      .sort(function(a, b){ return a.order - b.order; });
    if(hours === undefined){
      return { hours: undefined, budgetMin: 0, usedMin: 0, mainTasks: dayTasks, bufferTasks: [] };
    }
    var budgetMin = hours * 60;

    var withTime = dayTasks.filter(function(t){ return typeof t.startMinutes === 'number'; });
    var withoutTime = dayTasks.filter(function(t){ return typeof t.startMinutes !== 'number'; });
    withTime.sort(function(a, b){ return a.startMinutes - b.startMinutes; });

    var placed = [], mainTasks = [], bufferTasks = [], usedMin = 0;
    withTime.forEach(function(t){
      var start = t.startMinutes, end = start + t.plannedMinutes;
      var conflict = !t.done && placed.some(function(p){ return start < p.end && p.start < end; });
      if(t.done || !conflict){
        placed.push({ start: start, end: end });
        mainTasks.push(t);
        usedMin += t.plannedMinutes;
      } else {
        bufferTasks.push(t);
      }
    });
    // 没有时间的任务一律进"待安排"——包括已完成的：完成了但从没排过时间轴，时间轴上没地方画它，
    // 所以照样归待安排显示（下面 renderDayView 会把已完成的待安排任务单独摆在最后，不带序号/冲突标记）。
    withoutTime.forEach(function(t){ bufferTasks.push(t); });
    mainTasks.sort(function(a, b){
      var am = typeof a.startMinutes === 'number' ? a.startMinutes : 99999;
      var bm = typeof b.startMinutes === 'number' ? b.startMinutes : 99999;
      if(am !== bm) return am - bm;
      return a.order - b.order;
    });
    return { hours: hours, budgetMin: budgetMin, usedMin: usedMin, mainTasks: mainTasks, bufferTasks: bufferTasks };
  }

  // 添加任务时，时间输入框默认给一个"接着排"的建议时间——当天已经排上的任务里最晚的结束时间之后；
  // 这一天还没有任何已排任务时，今天默认从"现在"开始，其他日期默认从这一天的默认起点（8:00）开始。
  function computeNextFreeSlot(dateKey){
    var t = computeDayTimeline(dateKey);
    var latestEnd = null;
    t.mainTasks.forEach(function(task){
      if(typeof task.startMinutes === 'number'){
        var end = task.startMinutes + task.plannedMinutes;
        if(latestEnd === null || end > latestEnd) latestEnd = end;
      }
    });
    if(latestEnd !== null) return Math.min(latestEnd, 1425);
    var isToday = dateKey === todayKey();
    var base = isToday ? roundUpMinutes(minutesSinceMidnight(new Date()), 5) : 480;
    return Math.max(TIMELINE_START_MIN, Math.min(base, 1425));
  }

  // ---------- 弹性时间块：纯新增，不改任何已有字段/函数（见样式区那段大注释）。这里只放
  // 数据相关的两个小工具——"用途"标签表 + 找空档的算法；弹窗开关/提交这些 UI 逻辑放在
  // 跟 quickCapture 挨着的地方（那边全是"侧边栏小弹窗"的写法，放一起方便对照）。----------
  var FLEX_PURPOSES = [
    { key: 'review', emoji: '📚', label: '复盘资料' },
    { key: 'chat', emoji: '💬', label: '追赶消息' },
    { key: 'adhoc', emoji: '🧩', label: '临时事务' },
    { key: 'other', emoji: '🌿', label: '其他' }
  ];
  function flexDurationOptionsHtml(current){
    var opts = [10, 15, 20, 30];
    if(opts.indexOf(current) === -1) opts.push(current);
    opts.sort(function(a, b){ return a - b; });
    return opts.map(function(v){
      return '<option value="' + v + '"' + (v === current ? ' selected' : '') + '>' + v + ' 分钟</option>';
    }).join('');
  }
  // 在某一天里找一段够放下 desiredMinutes 的空档，思路跟 repackDay() 找空位一样：已排的任务
  // 当"占用"，按 taskGapMinutes 在两边留间隔。这里只是"建议"一个时间，不会自己写数据，
  // 用户确认前随时可以在弹窗里改；今天已经排得很满、找不到够长的空档时返回 null，交给用户手动填。
  function suggestFlexSlot(dateKey, desiredMinutes){
    var acct = getAcctData();
    var timeline = computeDayTimeline(dateKey);
    var occupied = timeline.mainTasks
      .filter(function(t){ return typeof t.startMinutes === 'number'; })
      .map(function(t){ return { start: t.startMinutes, end: t.startMinutes + t.plannedMinutes }; })
      .sort(function(a, b){ return a.start - b.start; });
    var gapMin = Math.max(0, Number(acct.taskGapMinutes) || 0);
    var isToday = dateKey === todayKey();
    var cursor = isToday ? Math.max(TIMELINE_START_MIN, roundUpMinutes(minutesSinceMidnight(new Date()), 5)) : TIMELINE_START_MIN;
    var dayEnd = 1425;
    for(var i = 0; i < occupied.length; i++){
      var gapEnd = occupied[i].start - gapMin;
      if(gapEnd - cursor >= desiredMinutes) return { startMinutes: cursor, plannedMinutes: desiredMinutes };
      cursor = Math.max(cursor, occupied[i].end + gapMin);
    }
    if(dayEnd - cursor >= desiredMinutes) return { startMinutes: cursor, plannedMinutes: desiredMinutes };
    return null;
  }

  // 任务卡片第三层"动态状态条"：根据真实的当前时间 vs 任务的开始/结束时间算出来，不是摆设数据。
  function taskStatusInfo(t, nowMin, isToday){
    if(t.done) return { label: '已完成', pct: 100, cls: 'is-done' };
    if(typeof t.startMinutes !== 'number') return { label: '待安排 · 还没有排时间', pct: 0, cls: '' };
    var start = t.startMinutes, end = start + t.plannedMinutes;
    if(!isToday) return { label: '计划 ' + fmtClock(start) + ' 开始', pct: 0, cls: '' };
    if(nowMin < start){
      var until = start - nowMin;
      return { label: until <= 30 ? ('快到了 · ' + until + '分钟后开始') : ('待开始 · ' + fmtClock(start)), pct: 0, cls: '' };
    }
    if(nowMin >= end) return { label: '已错过 · 原计划' + fmtClock(start), pct: 100, cls: 'is-overdue' };
    var pct = Math.max(0, Math.min(100, Math.round(((nowMin - start) / Math.max(1, t.plannedMinutes)) * 100)));
    return { label: '进行中 · 剩' + (end - nowMin) + '分钟', pct: pct, cls: 'is-live' };
  }

  // ---- 番茄钟：计时状态、暂停/继续/结束、真实用时记录 ----
  // acct.activeTimer 形状：{ taskId, mode:'countdown'|'stopwatch', accumulatedMs, runningSince, targetMinutes }
  // runningSince 为 null 表示"临时离开"暂停中——不计入用时；有值就是正在跑，从这个时间戳继续往上累加。
  // 全局同一时间只允许一个任务在计时：已经有别的任务在跑，会先提示去番茄钟页处理，不静默打断、也不允许同时开两个。
  var pomodoroTickHandle = null;
  var pomodoroConfirmingStop = false;
  // 停止计时之后，先问"是否完成"，再多一步"这次用时对不对"——是因为忘记停计时/中途被打断这种情况，
  // 时间轴本身量出来的数字会离谱地偏大，不能默认它一定对；pomodoroPendingCompleted 记住上一步选的
  // 完成状态，等这一步也确认完了，两个值一起传给 finishTimerSession。
  var pomodoroConfirmingDuration = false;
  var pomodoroPendingCompleted = false;
  var timerModePendingTaskId = null;
  // 航行模式的轻提示——过半时提醒一次（按 taskId 记一次性状态，新开一次计时就重置）；
  // 5分钟整点位不再是被动提示，升级成了下面的交互式卡壳检查点（checkinBucket 记到第几个5分钟了）。
  var pomoVoyagePrompts = { taskId: null, shownHalf: false, checkinBucket: 0 };
  // 卡壳检查点当前状态：null 表示没有弹出；否则 { stage: 'ask'|'describe'|'suggest'|'figmaWait', note }。
  // 三分支交互——顺利就继续/卡壳给建议/还是卡住就跳Figma理思路或先搁置——详见 openPomoCheckin 附近。
  var pomoCheckin = null;
  // 30分钟沙漏：纯前端视觉小组件，不写进 acct 数据、不影响真实计时和数据档案——
  // 只是"开始任务时摆一个沙漏在旁边"的陪伴视觉，taskId 变了（换了个任务）就自动重新满上；
  // 页面刷新也会重新满上，这是有意的（沙漏本来就不是需要跨会话精确记账的东西）。
  var pomoHourglass = { taskId: null, anchor: null };
  var HOURGLASS_MS = 30 * 60000;
  // 摄像头守望：可选开启，纯前端启发式——只拿摄像头原始画面跟上一帧比"有没有明显变化"，
  // 判断不了"是不是在看手机"这种真正的视线/内容识别，只能大致感觉"画面是不是很久没动静了"，
  // 所以文案上刻意说清楚这一点，不冒充真的人脸识别。画面全程只在本机内存里处理（画成很小的
  // 离屏 canvas 取平均像素差），不上传、不落盘、不写进 acct 任何字段——纯运行时状态，
  // 关闭/离开这个页面/刷新页面都会（或者应该）把摄像头彻底关掉，跟沙漏是同一类"陪伴小组件"。
  var camWatch = {
    enabled: false, stream: null, videoEl: null, canvasEl: null, ctx: null, timer: null,
    taskId: null, lastFrame: null, quietStreakMs: 0, lastSampleAt: 0, lastPromptAt: 0, error: '',
    totalSamples: 0, quietSamples: 0, // 专注时段统计用的累计计数，纯运行时，停止时读一次就清零
    // ---- AI 看画面那条线。aiOn 默认 false：画面离开这台设备这件事，必须你自己点头才行 ----
    aiOn: false, aiBusy: false, aiLastAt: 0, aiLast: '', aiNote: '', aiVia: '', aiOverrideState: '', aiOverrideUntil: 0,
    voiceOn: true, voiceLastAt: 0, voiceCount: 0, autoAiOn: true, autoAiUsed: 0,
    // ---- 盯梢模式用的运行时状态，全都不写进账号数据 ----
    base: null,            // 开头十几秒记下来的"你自己的正常坐姿"基准：{ skin, cx, cy, n }
    calibMs: 0,            // 已经校准了多久
    state: 'calib',        // calib / ok / away / down / turn
    badStreakMs: 0,        // 连续判定为"走神"的累计时长（回到ok就清零）
    alertLevel: 0,         // 已经升到第几级：0没有 / 1顶部硬提示 / 2全屏拦截 / 3记一次失守
    caughtCount: 0,        // 这一段里被抓到几次（升到2级算一次）
    nagCount: 0,           // 一级硬提示弹了几次
    okMs: 0,               // 校准完成之后，累计"真的在状态"的时长
    badMs: 0,              // 累计溜号时长（人不见了/低头/转头）
    vow: '',               // 这次的军令状原话
    strict: 'hard'         // soft 温和 / normal 严格 / hard 军令状(默认最严)
  };
  // 停摄像头的时候（点"完成航点"就会停，比记录用时更早）先把这次的专注汇总存在这里，
  // 等 finishTimerSession() 写用时记录时再取出来挂上去——不这么接一下，计数器早就清零了。
  var lastFocusSummary = null;
  var CAMWATCH_SAMPLE_MS = 2000; // 每2秒取一帧算差异，够用又不太费性能
  var CAMWATCH_QUIET_THRESHOLD_MS = 3 * 60000; // 连续3分钟画面几乎没变化，才提醒一次
  var CAMWATCH_PROMPT_COOLDOWN_MS = 5 * 60000; // 提醒之间至少隔5分钟，不连环打扰
  var CAMWATCH_DIFF_THRESHOLD = 2.2; // 逐像素平均亮度差（0~255）——人坐镜头前呼吸/眨眼/轻微晃动通常都超过这个量级
  var CAMWATCH_MIN_SAMPLES_TO_RECORD = 10; // 至少攒够10个样本(约20秒)才记一条专注时段汇总，太短的没有参考意义
  // ---- 盯梢模式参数 ----
  // 校准：刚开始的这段时间只看不判，把"你坐在那儿看屏幕"的样子记成基准。判断全部是跟这个
  // 基准比的相对变化，不是写死的绝对阈值——所以肤色深浅、房间明暗、背景里有没有木头家具
  // 都不影响，换个人也不用重新调。
  var CAMFOCUS_CALIB_MS = 12000;        // 前12秒（6个样本）用来认识你的正常坐姿
  var CAMFOCUS_AWAY_RATIO = 0.35;       // 肤色块缩到基准的35%以下 = 脸基本不在画面里了
  var CAMFOCUS_DOWN_DY = 0.11;          // 重心比基准往下挪超过画面高度的11% = 低头
  var CAMFOCUS_DOWN_RATIO = 0.82;       // 低头时脸的可见面积也会变小，两个条件一起才算数，避免误判
  var CAMFOCUS_TURN_DX = 0.17;          // 重心横向挪超过17% = 转头/离开座位方向
  var CAMFOCUS_BASE_ADAPT = 0.03;       // 状态正常时基准每次只挪3%，慢慢跟上你换姿势/天色变暗，但不会把走神也吸收进去
  // 三级加压的时间门槛（严格档的基准值，其它档按倍数缩放）
  var CAMFOCUS_L1_MS = 20000;           // 20秒：顶部硬提示 + 震动
  var CAMFOCUS_L2_MS = 55000;           // 55秒：全屏拦截，必须点一下才能出去
  var CAMFOCUS_L3_MS = 110000;          // 近2分钟：记一次失守
  var CAMFOCUS_STRICT_SCALE = { soft: 2.2, normal: 1, hard: 0.55 };
  // AI 看画面：默认 90 秒一张。再密就是拿你的额度和流量换一点点精度，不值。
  var CAMVISION_INTERVAL_MS = 90000;
  var CAMVISION_LABEL = {
    focused: 'AI 看了：在状态',
    phone:   'AI 看了：你在看手机',
    away:    'AI 看了：人不在画面里',
    slouch:  'AI 看了：趴着/在发呆',
    unsure:  'AI 看了：这张看不清，不下结论'
  }; // 军令状档所有门槛缩到一半多一点，逼得最紧
  function timerElapsedMs(at){
    if(!at) return 0;
    return at.accumulatedMs + (at.runningSince ? (Date.now() - at.runningSince) : 0);
  }
  function fmtStopwatch(ms){
    var totalSec = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = totalSec % 60;
    return h > 0 ? (h + ':' + pad2(m) + ':' + pad2(s)) : (pad2(m) + ':' + pad2(s));
  }
  // 同一类别攒够 3 条真实记录才给预估——数据太少不冒充"学会了你的节奏"。
  // 预估 = 该类别目前所有记录的平均值，以后每多一条真实记录都会重新算，不是只看最早 3 次。
  function categoryDurationStats(acct, category){
    var records = acct.durationLog.filter(function(r){ return r.category === category; });
    if(records.length < 3) return null;
    var sum = records.reduce(function(a, r){ return a + r.actualMinutes; }, 0);
    return { count: records.length, avgMinutes: Math.max(1, Math.round(sum / records.length)) };
  }
  function startTaskTimer(taskId, mode){
    var acct = getAcctData();
    var t = acct.tasks.find(function(x){ return x.id === taskId; });
    if(!t || t.done) return;
    acct.activeTimer = { taskId: taskId, mode: mode, accumulatedMs: 0, runningSince: Date.now(), targetMinutes: t.plannedMinutes };
    saveAcctData(acct);
    pomoVoyagePrompts = { taskId: taskId, shownHalf: false, checkinBucket: 0 };
    pomoCheckin = null;
    pomoHourglass = { taskId: taskId, anchor: Date.now() }; // 新任务开始，沙漏重新满上
    switchAppView('pomodoro');
  }
  // 任务卡片 / 时间轴块上"开始"按钮的统一入口。
  function handleStartClick(taskId){
    var acct = getAcctData();
    var t = acct.tasks.find(function(x){ return x.id === taskId; });
    if(!t || t.done) return;
    if(acct.activeTimer && acct.activeTimer.taskId !== taskId){
      var other = acct.tasks.find(function(x){ return x.id === acct.activeTimer.taskId; });
      var otherName = other ? other.name : '另一个任务';
      if(window.confirm('《' + otherName + '》还在计时中，一次只能计时一个任务。要不要先去处理它（继续/暂停/结束）？')){
        switchAppView('pomodoro');
      }
      return;
    }
    if(acct.activeTimer && acct.activeTimer.taskId === taskId){
      if(!acct.activeTimer.runningSince){ acct.activeTimer.runningSince = Date.now(); saveAcctData(acct); }
      switchAppView('pomodoro');
      return;
    }
    openTimerModeChoice(taskId);
  }
  function pauseTimerSession(){
    var acct = getAcctData();
    var at = acct.activeTimer;
    if(!at || !at.runningSince) return;
    at.accumulatedMs += (Date.now() - at.runningSince);
    at.runningSince = null;
    saveAcctData(acct);
    switchAppView('daily');
  }
  function resumeTimerSession(){
    var acct = getAcctData();
    var at = acct.activeTimer;
    if(!at || at.runningSince) return;
    at.runningSince = Date.now();
    saveAcctData(acct);
    renderPomodoroView();
  }
  // 真正结束：先把时间定住（跟临时离开同样的累加方式），再问"是否已完成"——
  // 是：跟手动打勾同一套逻辑（标记完成+发金币）；否：只记这次真实用了多久，任务还留在未完成里。
  // 不管是与否，这次用时都会记进数据档案；同类别攒够 3 条后，新建同类别任务时就能给出预估。
  // overrideMinutes：走完"这次用时对不对"确认步骤之后传进来的数字——用户选了"不对，我改一下"
  // 才会有值；正常"没问题"走这个参数就是 undefined，还是用计时器自己量出来的时间，不受影响。
  function finishTimerSession(completed, overrideMinutes){
    var acct = getAcctData();
    var at = acct.activeTimer;
    if(!at) return;
    var t = acct.tasks.find(function(x){ return x.id === at.taskId; });
    var elapsedMin = (typeof overrideMinutes === 'number' && !isNaN(overrideMinutes) && overrideMinutes >= 0)
      ? Math.round(overrideMinutes)
      : Math.max(0, Math.round(timerElapsedMs(at) / 60000));
    var newlyBadges = [];
    if(t){
      var sameCatCount = acct.durationLog.filter(function(r){ return r.category === t.category; }).length;
      var dRec = {
        id: uid(), taskId: t.id, taskName: t.name, category: t.category, dateKey: t.date,
        plannedMinutes: t.plannedMinutes, actualMinutes: elapsedMin, completed: !!completed,
        seq: sameCatCount + 1, loggedAt: Date.now(),
        // 判断"有没有按时"要拿原始预估比：plannedMinutes 已经乘过 1.3 缓冲了，再拿它当基准
        // 等于把标准放宽两次。startHour 是这段从几点开始的——精力时段要按开始的钟点归档，
        // 不是结束的钟点（一段跨小时的计时，算在它开始那个钟点才对得上"那会儿状态好不好"）。
        estMinutes: t.estMinutes,
        startHour: new Date(Date.now() - elapsedMin * 60000).getHours()
      };
      // 这一段如果开过摄像头盯梢，顺手把"真正专注了多久"挂在同一条记录上——纯新增字段，
      // 以前的记录一个都不动；读的地方都按"可能没有"来写。有了它，这条记录才同时回答了
      // "这件事花了多久"和"这段时间里我到底有多少是真在做"。
      if(lastFocusSummary && lastFocusSummary.taskId === t.id && (Date.now() - lastFocusSummary.at) < 10 * 60000){
        dRec.focusedMinutes = Math.round(lastFocusSummary.okMs / 60000 * 10) / 10;
        dRec.distractedMinutes = Math.round(lastFocusSummary.badMs / 60000 * 10) / 10;
        dRec.focusRate = lastFocusSummary.focusRate;
        dRec.distractCount = lastFocusSummary.caughtCount + lastFocusSummary.nagCount;
      }
      acct.durationLog.push(dRec);
      t.actualMinutes = elapsedMin;
      if(completed){
        t.done = true; t.completedAt = Date.now();
        acct.coins = (acct.coins || 0) + 2;
        acct.lifetimeCoins = (acct.lifetimeCoins || 0) + 2;
      }
      // 不管这次算不算完成，真实用时都进了数据档案——专注时长类勋章按这份档案算，跟"完成"与否无关。
      newlyBadges = checkAndRecordBadgeUnlocks(acct);
    }
    acct.activeTimer = null;
    saveAcctData(acct);
    updateCoinDisplay();
    pomodoroConfirmingStop = false;
    switchAppView('daily');
    toastNewBadges(newlyBadges);
  }

  // ---- 卡壳检查点：每5分钟一个整点位弹一次交互式检查，三条分支 ----
  // 建议是纯规则关键词匹配，不接任何外部AI接口——这是公开可读的静态页面，硬编码API key会被任何
  // 打开源码/开发者工具的人直接看到，直接从浏览器调第三方AI接口大概率也会被目标网站的CORS策略
  // 挡掉；所以老老实实做成"内置简化建议"，界面上明确写出来不是真实AI分析，跟"设计中"的好友PK/
  // 排行榜是同一种不虚构能力的态度。关键词匹配不到才用兜底建议，不代表真的理解了用户的情况。
  var STUCK_HINT_RULES = [
    { test: /不知道|没思路|无从下手|不会做|不会写|想不出|不懂|从哪|怎么开始|懵/, tips: [
      '先别想整个任务，只花2分钟写下"第一小步要做什么"，哪怕这一步很小很具体。',
      '找一个最接近的例子或模板照着改，通常比从空白开始容易很多。',
      '把卡点写成一句具体的话（而不是"不会做"），写的过程本身经常就会冒出思路。'
    ] },
    { test: /分心|走神|玩手机|不想动|懒得|摸鱼|刷/, tips: [
      '先把手机放到够不着的地方，逼自己专注5分钟，时间到了再选择继续还是先停。',
      '把当前这一步拆成一个15分钟能做完的小任务——小任务更容易让人愿意开始。',
      '起来喝口水、走两步再回来，通常比硬耗在原地更容易重新进入状态。'
    ] },
    { test: /太难|做不完|超纲|看不懂|卡了很久|卡很久|好难|搞不定/, tips: [
      '先跳过这个卡点，做任务里更容易的部分，回头再啃难的，避免一直卡死在同一处。',
      '这一步如果要花20分钟以上还没眉目，说明还能再往下拆一层，拆到能马上动手为止。',
      '这次先做到"能交差"的程度就行，不用一次到位，回头还能再打磨。'
    ] },
    { test: /找不到|没有资料|打不开|报错|环境|网不好|资料不够|设备/, tips: [
      '先记下具体缺的是什么（资料/工具/环境），换成任务里不依赖它的部分先做。',
      '实在找不到就先用手头能找到的替代资料顶上，标记一下"回头换成更好的资料"再继续。'
    ] },
    { test: /累|烦|心态|压力大|坚持不下去|没状态|不想干/, tips: [
      '状态不好硬做效率也不高，不如先休息5-10分钟，喝水或走动一下再回来。',
      '把这次目标调低一点——比如只求"做一点"而不是"做完"，别对自己太狠。'
    ] }
  ];
  var STUCK_HINT_FALLBACK = [
    '试着把这一步拆成更小的小步骤，先完成最小的那一个就好。',
    '如果卡点很具体，先跳过去做任务里其他部分，回头再来处理它。',
    '给自己一个小目标：接下来10分钟只做一件很小的事，做完就算数。'
  ];
  function classifyStuckHint(text){
    var s = (text || '').trim();
    for(var i = 0; i < STUCK_HINT_RULES.length; i++){
      if(STUCK_HINT_RULES[i].test.test(s)) return STUCK_HINT_RULES[i].tips;
    }
    return STUCK_HINT_FALLBACK;
  }
  // 接上后端之后，卡壳这里问的是真的大模型。
  // 如果后端还配了搜索，先去网上查一圈，把查到的东西一起喂给模型——"卡在哪了，连全网找答案"。
  // 任何一步失败都只是少一块，上面那套关键词规则照常显示，不会变成一个转圈转不出来的死界面。
  async function askStuckAI(note){
    var t = null;
    try {
      var acct = getAcctData();
      var at = acct.activeTimer;
      if(at && at.taskId) t = (acct.tasks || []).find(function(x){ return x.id === at.taskId; });
    } catch(e){}
    var q = (t ? ('我正在做的任务是《' + t.name + '》（类别：' + t.category + '）。') : '') +
            '我现在卡住了，情况是：' + (note || '（没说具体情况）');

    var ctx = '';
    if(backendOn('search') || backendOn('searchFallback')){
      var sr = await backendCall('/api/search', { q: (t ? t.name + ' ' : '') + (note || '').slice(0, 60), n: 4 }, 20000);
      if(sr.ok && sr.data && (sr.data.results || []).length){
        ctx = sr.data.results.map(function(x, i){
          return (i + 1) + '. ' + x.title + '（' + x.url + '）\n' + (x.snippet || '');
        }).join('\n');
        if(!pomoCheckin) return;
        pomoCheckin.aiSearched = true;
      }
    }
    var r = backendOn('ai')
      ? await backendCall('/api/ask-ai', { mode: 'stuck', question: q, context: ctx || undefined }, 50000)
      : { ok: false, offline: true };
    if(!pomoCheckin || pomoCheckin.stage !== 'suggest') return; // 人已经点走了，别再改界面
    if(r.ok && r.data && r.data.reply){
      pomoCheckin.aiState = '';
      pomoCheckin.ai = r.data.reply;
      pomoCheckin.aiVia = 'backend';
      renderPomodoroView();
      return;
    }
    // 没有自己的后端（或者后端这次没成）→ 直接问 Claude 本人。不用部署、不用密钥。
    var direct = await askClaude(
      STUCK_PROMPT_HEAD + '\n\n' + q +
      (ctx ? ('\n\n【参考资料】\n' + ctx) : '')
    );
    if(!pomoCheckin || pomoCheckin.stage !== 'suggest') return;
    pomoCheckin.aiState = '';
    if(direct){
      pomoCheckin.ai = direct;
      pomoCheckin.aiVia = 'claude';
      if(!ctx) pomoCheckin.aiSearched = false;
    } else {
      pomoCheckin.aiErr = r.error || '没拿到回答';
      pomoCheckin.aiSearched = false;
    }
    renderPomodoroView();
  }
  // 直接问 Claude 时用的人设。跟后端那套口径保持一致：只给一个此刻就能动手的下一步。
  var STUCK_PROMPT_HEAD =
    '你是学习/任务规划教练。学生卡住了，先判断卡的是哪一类：概念没懂 / 报错解决不了 / 不知道从哪下手 / 单纯在分心。' +
    '然后只给一个能在 10 分钟内做完的、具体到动作的下一步，不要给一长串方案，不要说"你可以试试"这种废话。' +
    '中文回答，180 字以内，直接给内容，不要寒暄。';
  // 弹出检查点前先把时钟冻住——跟"完成航点"确认前的定住手法一样，不会边问边跳数字；
  // 如果这一刻恰好已经不在跑了（比如刚好被别处停掉），直接不弹。
  // 检查点分两步走：先「汇报成果」（这段你过了哪几关 / 现在做到哪了），再问「顺不顺利」。
  // 汇报这一步是你要的那句「准吗」——它先把它以为的进度摆出来，你说不准就当场改，
  // 而不是等到最后结算才发现这一小时记的全是错的。
  function openPomoCheckin(kind){
    var acct = getAcctData();
    var at = acct.activeTimer;
    if(!at || !at.runningSince) return;
    at.accumulatedMs += (Date.now() - at.runningSince);
    at.runningSince = null;
    saveAcctData(acct);
    var t = (acct.tasks || []).find(function(x){ return x.id === at.taskId; });
    var doneNow = getTaskSteps(t).filter(function(s){ return s.done; }).length;
    pomoCheckin = {
      stage: 'report',
      note: '',
      kind: kind || 'tick',              // tick=整 5 分钟那次 / half=过半那次
      doneAtOpen: doneNow,               // 开这次检查点时已过的关数
      doneBefore: pomoVoyagePrompts.lastDoneCount || 0, // 上次检查点时已过的关数
      progress: ''
    };
    pomoVoyagePrompts.lastDoneCount = doneNow;
    // 人可能压根没看屏幕（这正是你要语音的原因）。摄像头盯梢开着且语音没关的时候，
    // 检查点也喊一声——不额外弄一套开关，跟着那个走。
    if(camWatch.enabled && camWatch.voiceOn){
      try {
        var S = window.speechSynthesis;
        if(S && typeof window.SpeechSynthesisUtterance === 'function'){
          var u = new window.SpeechSynthesisUtterance('检查一下，现在做到哪了');
          u.lang = 'zh-CN';
          if(!CAMVOICE_ZH) CAMVOICE_ZH = pickZhVoice();
          if(CAMVOICE_ZH) u.voice = CAMVOICE_ZH;
          S.cancel(); S.speak(u);
        }
      } catch(e){}
    }
    renderPomodoroView();
  }
  // 「不准」之后：点哪一关，就表示你<b>正在做</b>那一关——它前面的全算过了，它和它后面的算没过。
  // 这是最少点击的改法，也是唯一不会出现"中间跳着过"这种怪状态的改法。
  function setCurrentStep(idx){
    var acct = getAcctData();
    var at = acct.activeTimer;
    if(!at) return;
    var t = (acct.tasks || []).find(function(x){ return x.id === at.taskId; });
    var steps = getTaskSteps(t);
    if(!steps.length) return;
    steps.forEach(function(s, i){ s.done = (i < idx); });
    saveAcctData(acct);
    if(pomoCheckin){
      pomoCheckin.doneAtOpen = idx;
      pomoVoyagePrompts.lastDoneCount = idx;
    }
  }
  // 没拆过关的任务，汇报的是一句话。只往任务上<b>追加</b>一个新字段，一个字都不动已有数据。
  function logPomoProgress(text){
    text = String(text || '').trim();
    if(!text) return;
    var acct = getAcctData();
    var at = acct.activeTimer;
    if(!at) return;
    var t = (acct.tasks || []).find(function(x){ return x.id === at.taskId; });
    if(!t) return;
    if(!Array.isArray(t.progressLog)) t.progressLog = []; // 懒初始化，老任务上本来没有这个字段
    t.progressLog.push({ at: Date.now(), text: text.slice(0, 200) });
    if(t.progressLog.length > 40) t.progressLog = t.progressLog.slice(-40);
    saveAcctData(acct);
  }
  // 恢复计时——复用 resumeTimerSession（解冻时钟+停留在番茄钟页），跟手动点"继续"是同一套逻辑。
  // reschedule=true 时顺手触发一次现有的"AI计划生成"，把"待安排"里还没排时间的任务往后顺一遍，
  // 呼应营销页说的"不用手动重排"——只在真的经历了卡壳/搁置分支时才触发，单纯"挺顺利"不触发，
  // 避免每5分钟都无谓地重排一次待安排队列。
  function closePomoCheckin(reschedule){
    pomoCheckin = null;
    resumeTimerSession();
    if(reschedule){
      var acct = getAcctData();
      var at = acct.activeTimer;
      var t = at && acct.tasks.find(function(x){ return x.id === at.taskId; });
      if(t) repackDay(t.date);
    }
  }
  // 先搁置：退回"待安排"（清空 startMinutes，跟其他"清空变回待安排"的地方用同一个空值写法），
  // 排到待安排队尾（复用 reorderBufferTask，不重新发明排序逻辑），停掉这条计时，
  // 再触发"AI计划生成"把其他待安排任务顺一遍。任务本身、其他任务、收集箱都不动。
  function deferPomoCheckinTask(){
    var acct = getAcctData();
    var at = acct.activeTimer;
    if(!at) return;
    var t = acct.tasks.find(function(x){ return x.id === at.taskId; });
    var dateKey = t ? t.date : todayKey();
    if(t){ t.startMinutes = null; delete t.aiScheduled; }
    acct.activeTimer = null;
    saveAcctData(acct);
    if(t) reorderBufferTask(t.id, 9999);
    repackDay(dateKey, t && t.id);
    pomoCheckin = null;
    switchAppView('daily');
    lcVoyagePrompt('已搁置，稍后再安排');
  }
  function renderPomoCheckinBody(body, t){
    var stage = pomoCheckin.stage;
    var html = '';
    var ckCat = (pomoCheckin.kind === 'half') ? '🧭 过半检查点' : '🧭 5 分钟检查点';
    // ——第一步：成果汇报 + 「准吗」——
    if(stage === 'report'){
      var rSteps = getTaskSteps(t);
      // ⚠️ 这里千万不能叫 body——函数参数 body 是外面传进来的 DOM 容器，
      // 叫重了会把它盖成字符串，最后 body.innerHTML = html 直接炸。
      var rBody = '';
      if(rSteps.length){
        var gained = Math.max(0, (pomoCheckin.doneAtOpen || 0) - (pomoCheckin.doneBefore || 0));
        var justDone = rSteps.slice(pomoCheckin.doneBefore || 0, pomoCheckin.doneAtOpen || 0);
        var curIdx = currentStepIndex(rSteps);
        rBody = '<p class="ck-report-head">' + (gained
            ? ('这一段你过了 <b>' + gained + '</b> 关：')
            : '这一段<b>一关都没过</b>。') + '</p>' +
          (justDone.length ? ('<ul class="ck-done-list">' + justDone.map(function(s){
            return '<li>✅ ' + escapeHtml(s.text) + '</li>'; }).join('') + '</ul>') : '') +
          '<p class="ck-report-now">' + (curIdx >= rSteps.length
            ? ('🏁 ' + rSteps.length + ' 关全过了')
            : ('现在卡在第 <b>' + (curIdx + 1) + '/' + rSteps.length + '</b> 关：' + escapeHtml(rSteps[curIdx].text))) + '</p>' +
          '<p class="pomo-stage-sub">准吗？不准就当场改——别等最后结算才发现这一小时记的全是错的。</p>' +
          '<div class="firsttime-choice">' +
          '<button class="firsttime-btn" type="button" id="ckReportOkBtn"><b>✅ 准，往下走</b><span>记的没错</span></button>' +
          '<button class="firsttime-btn" type="button" id="ckReportFixBtn"><b>✏️ 不准，我改一下</b><span>点一下你真正在做的那一关</span></button>' +
          '</div>';
      } else {
        rBody = '<p class="ck-report-head">这条任务没拆过关，所以我不知道你做到哪了。</p>' +
          '<label class="field">现在做到哪了？一句话就行<div class="input-row input-row-area">' +
          '<textarea id="ckProgressInput" rows="2" maxlength="200" placeholder="比如：读完第一节，正在抄公式 / 环境装好了，卡在跑不通">' +
          escapeHtml(pomoCheckin.progress || '') + '</textarea></div></label>' +
          '<p class="pomo-stage-sub">记下来，结束的时候你就知道这一小时到底干了什么。不想写就直接跳过。</p>' +
          '<div class="pomo-actions">' +
          '<button class="btn btn-ghost" type="button" id="ckProgressSkipBtn">跳过</button>' +
          '<button class="btn btn-primary" type="button" id="ckProgressSaveBtn">记下来，往下走</button>' +
          '</div>';
      }
      html = '<div class="pomo-wrap"><div class="pomo-stage is-form">' +
        '<span class="pomo-stage-cat">' + ckCat + '</span>' +
        '<div class="pomo-stage-name">《' + escapeHtml(t.name) + '》</div>' +
        rBody + '</div></div>';
    } else if(stage === 'fixsteps'){
      var fSteps = getTaskSteps(t);
      var fCur = currentStepIndex(fSteps);
      html = '<div class="pomo-wrap">' +
        '<button class="pomo-back" type="button" id="ckFixBackBtn">← 算了，不改了</button>' +
        '<div class="pomo-stage is-form">' +
        '<p class="pomo-confirm-q">你现在<b>正在做</b>哪一关？</p>' +
        '<p class="pomo-stage-sub">点一下——它前面的算过了，它和它后面的算没过。</p>' +
        '<ul class="ck-fix-list">' + fSteps.map(function(s, i){
          return '<li><button type="button" data-fixstep="' + i + '"' + (i === fCur ? ' class="is-cur"' : '') + '>' +
            '<span class="n">' + (i + 1) + '</span><span class="t">' + escapeHtml(s.text) + '</span>' +
            (i === fCur ? '<span class="cur">现在</span>' : '') + '</button></li>';
        }).join('') +
        '<li><button type="button" data-fixstep="' + fSteps.length + '"' + (fCur >= fSteps.length ? ' class="is-cur"' : '') + '>' +
          '<span class="n">🏁</span><span class="t">全都过了</span></button></li>' +
        '</ul></div></div>';
    } else if(stage === 'ask'){
      html = '<div class="pomo-wrap"><div class="pomo-stage">' +
        '<span class="pomo-stage-cat">' + ckCat + '</span>' +
        '<div class="pomo-stage-name">《' + escapeHtml(t.name) + '》现在怎么样？</div>' +
        '<p class="pomo-stage-sub">时钟已经暂停，选完接着算</p>' +
        '<div class="firsttime-choice">' +
        '<button class="firsttime-btn" type="button" id="checkinFineBtn"><b>👍 挺顺利，继续走</b><span>没卡壳，回去接着做</span></button>' +
        '<button class="firsttime-btn" type="button" id="checkinStuckBtn"><b>⚓ 有点卡壳</b><span>说说卡在哪儿，一起想办法</span></button>' +
        '</div></div></div>';
    } else if(stage === 'describe'){
      html = '<div class="pomo-wrap">' +
        '<button class="pomo-back" type="button" id="checkinBackBtn">← 其实还好，继续做</button>' +
        '<div class="pomo-stage is-form">' +
        '<p class="pomo-confirm-q">⚓ 卡在哪儿了？说说当下的情况</p>' +
        '<label class="field">用自己的话说说（选填）<div class="input-row input-row-area">' +
        '<textarea id="checkinNoteInput" rows="3" maxlength="200" placeholder="比如：不知道从哪下手、找不到资料、有点分心走神……">' + escapeHtml(pomoCheckin.note || '') + '</textarea>' +
        '</div></label>' +
        '<div class="pomo-actions"><button class="btn btn-primary" type="button" id="checkinSuggestBtn">获取建议</button></div>' +
        '</div></div>';
    } else if(stage === 'suggest'){
      var tips = classifyStuckHint(pomoCheckin.note);
      // 接上后端之后这里换成真的大模型：pomoCheckin.ai 是已经回来的答案，aiState 是过程状态。
      // 后端连不上、报错、超时——任何一种情况都退回下面这套关键词规则，不会把人晾在那儿。
      var aiBlock = '';
      if(pomoCheckin.aiState === 'loading'){
        aiBlock = '<p class="pomo-confirm-q">🦆 正在问 AI…</p><p class="demo-note">连的是你自己那台后端</p>';
      } else if(pomoCheckin.ai){
        // 答案是从哪条路来的，一定要写清楚——两条路的能力不一样，不能让人以为都查过网
        var viaNote = (pomoCheckin.aiVia === 'backend')
          ? ('真实大模型回答 · 走你自己部署的后端' + (pomoCheckin.aiSearched ? '，并且查了网上的资料' : ''))
          : '直接问的 Claude · 不经过任何服务器，但它<b>上不了网</b>，答的是它已有的知识';
        aiBlock = '<p class="pomo-confirm-q">🤖 AI 给的下一步</p>' +
          '<p class="checkin-ai-answer">' + escapeHtml(pomoCheckin.ai) + '</p>' +
          '<p class="demo-note">' + viaNote + '</p>';
      } else if(pomoCheckin.aiErr){
        aiBlock = '<p class="demo-note">问 AI 没成功（' + escapeHtml(pomoCheckin.aiErr) + '），下面是本地的规则建议</p>';
      }
      html = '<div class="pomo-wrap">' +
        '<button class="pomo-back" type="button" id="checkinBackBtn2">← 换个说法</button>' +
        '<div class="pomo-stage is-form">' +
        aiBlock +
        '<p class="pomo-confirm-q">🦆 上岸鸭的建议</p>' +
        '<ul class="checkin-tip-list">' + tips.map(function(tip){ return '<li>' + escapeHtml(tip) + '</li>'; }).join('') + '</ul>' +
        '<p class="demo-note">' + (pomoCheckin.ai ? '这几条是本地的规则建议，跟上面那段 AI 回答是两回事' : '内置的简化建议 · 按关键词规则匹配，不是真实 AI 分析') + '</p>' +
        '<div class="firsttime-choice">' +
        '<button class="firsttime-btn" type="button" id="checkinResolvedBtn"><b>✅ 有办法了，继续做</b><span>接着计时，待安排里的任务会自动往后顺一下</span></button>' +
        '<button class="firsttime-btn" type="button" id="checkinFigmaBtn"><b>🎨 打开 Figma 理理思路</b><span>去新标签页画一画、理清楚再回来</span></button>' +
        '<button class="firsttime-btn" type="button" id="checkinDeferBtn"><b>⏸ 先搁置这条任务</b><span>退回"待安排"，其他任务自动往后顺一下</span></button>' +
        '</div></div></div>';
    } else {
      html = '<div class="pomo-wrap"><div class="pomo-stage is-form">' +
        '<p class="pomo-confirm-q">🎨 已经在新标签页打开 Figma</p>' +
        '<p class="pomo-stage-sub" style="text-align:left;">理清楚思路之后回来，接着做或者先搁置都行</p>' +
        '<div class="firsttime-choice">' +
        '<button class="firsttime-btn" type="button" id="checkinResolvedBtn2"><b>✅ 整理好了，继续做</b><span>接着计时，待安排里的任务会自动往后顺一下</span></button>' +
        '<button class="firsttime-btn" type="button" id="checkinDeferBtn2"><b>⏸ 先搁置这条任务</b><span>退回"待安排"，其他任务自动往后顺一下</span></button>' +
        '</div></div></div>';
    }
    body.innerHTML = DOMPurify.sanitize(html);
    // ——成果汇报那一步——
    var ckOk = document.getElementById('ckReportOkBtn');
    if(ckOk) ckOk.addEventListener('click', function(){ pomoCheckin.stage = 'ask'; renderPomodoroView(); });
    var ckFix = document.getElementById('ckReportFixBtn');
    if(ckFix) ckFix.addEventListener('click', function(){ pomoCheckin.stage = 'fixsteps'; renderPomodoroView(); });
    var ckSkip = document.getElementById('ckProgressSkipBtn');
    if(ckSkip) ckSkip.addEventListener('click', function(){ pomoCheckin.stage = 'ask'; renderPomodoroView(); });
    var ckSave = document.getElementById('ckProgressSaveBtn');
    if(ckSave) ckSave.addEventListener('click', function(){
      var el = document.getElementById('ckProgressInput');
      var v = el ? el.value : '';
      pomoCheckin.progress = v;
      logPomoProgress(v);
      pomoCheckin.stage = 'ask';
      renderPomodoroView();
    });
    var ckFixBack = document.getElementById('ckFixBackBtn');
    if(ckFixBack) ckFixBack.addEventListener('click', function(){ pomoCheckin.stage = 'report'; renderPomodoroView(); });
    Array.prototype.slice.call(document.querySelectorAll('[data-fixstep]')).forEach(function(b){
      b.addEventListener('click', function(){
        setCurrentStep(Number(b.getAttribute('data-fixstep')) || 0);
        pomoCheckin.stage = 'report';
        // 改完之后这一段的"过了几关"要按改后的重算，不然还显示旧的
        pomoCheckin.doneBefore = Math.min(pomoCheckin.doneBefore || 0, pomoCheckin.doneAtOpen || 0);
        renderPomodoroView();
      });
    });
    var fineBtn = document.getElementById('checkinFineBtn');
    if(fineBtn) fineBtn.addEventListener('click', function(){ closePomoCheckin(false); });
    var stuckBtn = document.getElementById('checkinStuckBtn');
    if(stuckBtn) stuckBtn.addEventListener('click', function(){ pomoCheckin.stage = 'describe'; renderPomodoroView(); });
    var backBtn = document.getElementById('checkinBackBtn');
    if(backBtn) backBtn.addEventListener('click', function(){ closePomoCheckin(false); });
    var suggestBtn = document.getElementById('checkinSuggestBtn');
    if(suggestBtn) suggestBtn.addEventListener('click', function(){
      var input = document.getElementById('checkinNoteInput');
      pomoCheckin.note = input ? input.value : '';
      pomoCheckin.stage = 'suggest';
      pomoCheckin.ai = ''; pomoCheckin.aiErr = ''; pomoCheckin.aiSearched = false;
      // 有后端走后端，没后端就直接问 Claude——两条路都没有才只剩本地规则
      var canAsk = backendOn('ai') || sampleOn();
      pomoCheckin.aiState = canAsk ? 'loading' : '';
      renderPomodoroView();
      if(canAsk) askStuckAI(pomoCheckin.note);
    });
    var backBtn2 = document.getElementById('checkinBackBtn2');
    if(backBtn2) backBtn2.addEventListener('click', function(){ pomoCheckin.stage = 'describe'; renderPomodoroView(); });
    var resolvedBtn = document.getElementById('checkinResolvedBtn');
    if(resolvedBtn) resolvedBtn.addEventListener('click', function(){ closePomoCheckin(true); });
    var figmaBtn = document.getElementById('checkinFigmaBtn');
    if(figmaBtn) figmaBtn.addEventListener('click', function(){
      try{ window.SYMini.notice('小工具不能打开外部设计网站，可在本机整理灵感和任务。'); }catch(err){}
      pomoCheckin.stage = 'figmaWait';
      renderPomodoroView();
    });
    var deferBtn = document.getElementById('checkinDeferBtn');
    if(deferBtn) deferBtn.addEventListener('click', deferPomoCheckinTask);
    var resolvedBtn2 = document.getElementById('checkinResolvedBtn2');
    if(resolvedBtn2) resolvedBtn2.addEventListener('click', function(){ closePomoCheckin(true); });
    var deferBtn2 = document.getElementById('checkinDeferBtn2');
    if(deferBtn2) deferBtn2.addEventListener('click', deferPomoCheckinTask);
  }

  // 找出"今天"之前、还没做完、当时排不上时间轴的任务——今天要重新确认是否还重要。
  function findRolloverCandidates(){
    var acct = getAcctData();
    var today = todayKey();
    var dates = {};
    acct.tasks.forEach(function(t){ if(t.date < today) dates[t.date] = true; });
    var out = [];
    Object.keys(dates).sort().forEach(function(dk){
      if(acct.dailyHours[dk] === undefined) return;
      var buckets = computeDayTimeline(dk);
      buckets.bufferTasks.forEach(function(t){ if(!t.done) out.push(t); });
    });
    return out;
  }

  function enterApp(displayName, acctKey){
    if(!marketingView || !appHome) return;
    currentAccountKey = acctKey || 'guest';
    currentDisplayName = displayName || '同学';
    marketingView.hidden = true;
    appHome.hidden = false;
    document.body.style.overflow = '';
    if(appGreetingName) appGreetingName.textContent = 'Hi，' + (displayName || '同学');
    if(appDateLine){
      var d = new Date();
      appDateLine.textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + WEEKDAY_NAMES[d.getDay()];
    }
    activeDailyTab = 'day';
    dayViewDate = todayKey();
    monthAnchor = null;
    dayStripAnchor = null;
    dayStripExpanded = false;
    dailyTabBtns.forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-tab') === 'day'); });
    updateCoinDisplay();
    applyAccentTheme();
    renderSidebarCategoryList();
    renderExamCountdown();
    renderTipCard();
    switchAppView('daily');
    window.scrollTo(0, 0);
  }
  function exitApp(){
    if(!marketingView || !appHome) return;
    appHome.hidden = true;
    marketingView.hidden = false;
    window.scrollTo(0, 0);
  }
  var exitAppBtn = document.getElementById('exitAppBtn');
  if(exitAppBtn) exitAppBtn.addEventListener('click', exitApp);

  // ===== 左侧导航：6个板块切换 =====
  var appNavItems = Array.prototype.slice.call(document.querySelectorAll('.app-nav-item'));
  var appViews = Array.prototype.slice.call(document.querySelectorAll('.app-view'));
  var appMainEl = document.querySelector('.app-main');
  function switchAppView(key){
    appNavItems.forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-view') === key); });
    appViews.forEach(function(v){ v.hidden = (v.getAttribute('data-view') !== key); });
    // 切换到一个新板块时，如果之前在别的板块里往下滚动过，需要把滚动位置归零——
    // 否则新板块会直接顶着上次的滚动高度显示，可能让头部内容（比如"我的"页顶部的头像/简介行）
    // 一进来就被滚出屏幕外。真正带滚动条的是 .app-main（.app-home 整体是 100vh+overflow:hidden，
    // window 本身并不滚动），所以重置的是它的 scrollTop，不是 window.scrollTo。
    // refreshCurrentView()（原地刷新，不算"切换"）不受影响，不会跳回顶部。
    if(appMainEl) appMainEl.scrollTop = 0;
    stopPomodoroTicker();
    // 摄像头守望是番茄钟页面自己的陪伴小组件，只在真的还停留在这个页面时才有意义——
    // 切去别的板块（哪怕计时本身还在后台继续走）就该把摄像头彻底关掉，不能悄悄留在后台跑。
    if(key !== 'pomodoro') stopCamWatch();
    // 航行模式（侧边栏变暗）是番茄钟页面自己的视觉状态：离开这个页面就该恢复，哪怕计时其实还在后台继续走。
    // 切回番茄钟页时 renderPomodoroView() 会按当时是否在跑重新点亮，所以这里无条件先摘掉不会漏状态。
    document.body.classList.remove('is-voyage-mode');
    if(key === 'inbox') renderInbox();
    if(key === 'daily') renderDailyTab();
    if(key === 'pomodoro') renderPomodoroView();
    if(key === 'habits') renderHabitsView();
    if(key === 'stats') renderStatsView();
    if(key === 'quadrant') renderQuadrantView();
    if(key === 'knowledge') renderKnowledgeView();
    if(key === 'deadlines') renderDeadlinesView();
    if(key === 'profile') renderProfileView();
    if(key === 'shop') renderShopView();
  }
  function refreshCurrentView(){
    var active = null;
    appViews.forEach(function(v){ if(!v.hidden) active = v; });
    var key = active ? active.getAttribute('data-view') : 'daily';
    if(key === 'inbox') renderInbox();
    else if(key === 'pomodoro') renderPomodoroView();
    else if(key === 'habits') renderHabitsView();
    else if(key === 'stats') renderStatsView();
    else if(key === 'quadrant') renderQuadrantView();
    else if(key === 'knowledge') renderKnowledgeView();
    else if(key === 'deadlines') renderDeadlinesView();
    else if(key === 'profile') renderProfileView();
    else if(key === 'shop') renderShopView();
    else renderDailyTab();
    renderCategoryReceiptIfOpen();
  }
  appNavItems.forEach(function(btn){
    btn.addEventListener('click', function(){ switchAppView(btn.getAttribute('data-view')); });
  });

  // ===== 每日清单：列表 / 日 / 3日 / 周 / 月 =====
  var dailyTabBtns = Array.prototype.slice.call(document.querySelectorAll('.daily-tab'));
  var activeDailyTab = 'day';
  var dayViewDate = todayKey();
  var monthAnchor = null;
  // 日视图顶部的周/月折叠日期条：默认收起显示一周，点击展开显示整月（不是拖拽手势）。
  var dayStripAnchor = null;
  var dayStripExpanded = false;

  dailyTabBtns.forEach(function(btn){
    btn.addEventListener('click', function(){
      activeDailyTab = btn.getAttribute('data-tab');
      dailyTabBtns.forEach(function(b){ b.classList.toggle('active', b === btn); });
      renderDailyTab();
    });
  });

  function renderDailyTab(){
    var sub = document.getElementById('dailySub');
    if(!sub) return;
    if(activeDailyTab === 'day') renderDayView(sub);
    else if(activeDailyTab === '3day') renderMultiDayView(sub, 3);
    else if(activeDailyTab === 'week') renderMultiDayView(sub, 7);
    else if(activeDailyTab === 'month') renderMonthView(sub);
    else renderListView(sub);
    renderConsoleHero();
  }

  // ==================== 上岸导航台 LANDING CONSOLE：首页导航仪 ====================
  // 只读现有数据渲染，不新增任何存储字段，不改任何已有任务/计时逻辑——
  // 纯粹是"日"视图之上的一层可视化入口 + 状态读数。
  function lcCoreTasksHtml(tasks){
    if(!tasks.length) return '<li class="lc-task-empty">还没有安排今日任务 · 点右侧"航线打印器"去添加</li>';
    var sorted = tasks.slice().sort(function(a, b){
      if(a.done !== b.done) return a.done ? 1 : -1;
      var am = typeof a.startMinutes === 'number' ? a.startMinutes : 99999;
      var bm = typeof b.startMinutes === 'number' ? b.startMinutes : 99999;
      if(am !== bm) return am - bm;
      return a.order - b.order;
    });
    var shown = sorted.slice(0, 5);
    var extra = sorted.length - shown.length;
    var html = shown.map(function(t){
      return '<li class="lc-task-row' + (t.done ? ' is-done' : '') + '">' +
        '<span class="lc-task-dot" style="background:' + categoryColor(t.category) + ';" aria-hidden="true"></span>' +
        '<span class="lc-task-name">' + escapeHtml(t.name) + '</span>' +
        '</li>';
    }).join('');
    if(extra > 0) html += '<li class="lc-task-more">还有 ' + extra + ' 项…</li>';
    return html;
  }
  function renderConsoleHero(){
    var hero = document.getElementById('lcHero');
    if(!hero) return;
    var acct = getAcctData();
    var todayK = todayKey();
    var buckets = computeDayTimeline(todayK);
    var d = new Date();

    var dateEl = document.getElementById('lcScreenDate');
    if(dateEl) dateEl.textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + WEEKDAY_NAMES[d.getDay()];
    var coinEl = document.getElementById('lcScreenCoin');
    if(coinEl) coinEl.textContent = acct.coins;

    var hoursLine = document.getElementById('lcHoursLine');
    if(hoursLine){
      if(buckets.hours === undefined){
        hoursLine.innerHTML = DOMPurify.sanitize('<span class="lc-field-label">今日可投入</span><span class="lc-field-value is-unset">未设置</span>');
      } else {
        hoursLine.innerHTML = DOMPurify.sanitize('<span class="lc-field-label">今日可投入</span><span class="lc-field-value">' + buckets.hours + ' 小时 · 已排 ' + fmtDuration(buckets.usedMin) + '</span>');
      }
    }

    var targetLine = document.getElementById('lcTargetLine');
    if(targetLine){
      if(!acct.examDate){
        targetLine.innerHTML = DOMPurify.sanitize('<span class="lc-field-label">目标岸点</span><button type="button" class="lc-field-value is-unset" id="lcSetExamBtn">未设置 · 点此设置</button>');
        var setBtn = document.getElementById('lcSetExamBtn');
        if(setBtn) setBtn.addEventListener('click', openExamDateModal);
      } else {
        var target = parseDateKey(acct.examDate);
        var diffDays = Math.ceil((target - parseDateKey(todayK)) / 86400000);
        var text = diffDays > 0 ? ('距岸 ' + diffDays + ' 天') : (diffDays === 0 ? '今天就是岸' : ('已过岸 ' + Math.abs(diffDays) + ' 天'));
        targetLine.innerHTML = DOMPurify.sanitize('<span class="lc-field-label">目标岸点</span><span class="lc-field-value">' + escapeHtml(text) + '</span>');
      }
    }

    var todayTasks = acct.tasks.filter(function(t){ return t.date === todayK; });
    var taskList = document.getElementById('lcTaskList');
    if(taskList) taskList.innerHTML = DOMPurify.sanitize(lcCoreTasksHtml(todayTasks));

    var voyageBtn = document.getElementById('lcVoyageBtn');
    if(voyageBtn){
      var allDone = todayTasks.length > 0 && todayTasks.every(function(t){ return t.done; });
      voyageBtn.textContent = allDone ? '🎉 今日已靠岸' : '⚓ 开始今日航程';
      voyageBtn.classList.toggle('is-done', allDone);
    }

    var bufferLine = document.getElementById('lcBufferLine');
    if(bufferLine){
      if(buckets.hours === undefined){
        bufferLine.textContent = '';
        bufferLine.className = 'lc-screen-buffer';
      } else {
        var remain = buckets.budgetMin - buckets.usedMin;
        bufferLine.textContent = remain >= 0 ? ('剩余缓冲 ' + fmtDuration(remain)) : ('已超出预算 ' + fmtDuration(-remain));
        bufferLine.className = 'lc-screen-buffer' + (remain < 0 ? ' is-over' : '');
      }
    }

    var gaugeEl = document.getElementById('lcDuckGauge');
    if(gaugeEl){
      var doneToday = todayTasks.filter(function(t){ return t.done; }).length;
      var totalToday = todayTasks.length;
      var pct = totalToday ? Math.round(doneToday / totalToday * 100) : 0;
      var avatarDef = SHOP_AVATARS.filter(function(a){ return a.id === acct.equippedAvatar; })[0] || SHOP_AVATARS[0];
      var captionHtml;
      if(totalToday === 0){
        captionHtml = '<p><b>今天还没有安排任务。</b>去清单里加一项，水位就会开始上涨。</p>';
      } else if(doneToday === totalToday){
        captionHtml = '<p><b>今日已靠岸 🎉</b> 共 ' + totalToday + ' 项任务全部完成，鸭子已经踩到岸边啦。</p>';
      } else {
        captionHtml = '<p><b>已完成 ' + doneToday + ' / ' + totalToday + ' 项。</b>水位涨到 ' + pct + '%，鸭子正往岸边靠近。</p>';
      }
      gaugeEl.innerHTML = DOMPurify.sanitize(buildDuckGaugeHtml({ ambient: false, pct: pct, avatarDef: avatarDef, captionHtml: captionHtml }));
    }
  }
  // 切到"日"tab 并把时间轴滚动进视口——"航线打印器"物件和"开始今日航程"按钮共用这一个动作。
  function lcScrollToItinerary(){
    if(activeDailyTab !== 'day'){
      activeDailyTab = 'day';
      dailyTabBtns.forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-tab') === 'day'); });
      renderDailyTab();
    }
    var target = document.getElementById('dailyTabs');
    if(target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // "镜头推近"转场：从被点击的物件位置弹出一个柔光圆，短暂放大淡出后再真正切换页面——
  // 不依赖真实 3D/WebGL，纯 CSS transform+opacity，尊重 prefers-reduced-motion。
  function lcZoomTransitionTo(originEl, callback){
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduceMotion || !originEl || !originEl.getBoundingClientRect){ callback(); return; }
    var rect = originEl.getBoundingClientRect();
    var burst = document.createElement('div');
    burst.className = 'lc-zoom-burst';
    burst.style.left = (rect.left + rect.width / 2) + 'px';
    burst.style.top = (rect.top + rect.height / 2) + 'px';
    document.body.appendChild(burst);
    requestAnimationFrame(function(){ burst.classList.add('is-active'); });
    var called = false;
    var fire = function(){ if(called) return; called = true; callback(); };
    setTimeout(fire, 260);
    setTimeout(function(){ if(burst.parentNode) burst.parentNode.removeChild(burst); }, 560);
  }
  (function initConsoleHeroObjects(){
    var objBtns = Array.prototype.slice.call(document.querySelectorAll('.lc-object'));
    objBtns.forEach(function(btn){
      btn.addEventListener('click', function(){
        var target = btn.getAttribute('data-lc');
        lcZoomTransitionTo(btn, function(){
          if(target === 'list') lcScrollToItinerary();
          else switchAppView(target);
        });
      });
    });
    var voyageBtn = document.getElementById('lcVoyageBtn');
    if(voyageBtn) voyageBtn.addEventListener('click', function(){
      lcZoomTransitionTo(voyageBtn, function(){ lcScrollToItinerary(); });
    });
    var cabinetItems = Array.prototype.slice.call(document.querySelectorAll('.lc-cabinet-item'));
    cabinetItems.forEach(function(item){
      item.addEventListener('click', function(){
        // 已经真正做出来的两项（金币商城/成就勋章）带 data-cabinet，跟悬浮物件一样"镜头推近"后跳转；
        // 好友PK、排行榜/组队还没做，保留原来的"抖一下"提示，不跳转。
        var target = item.getAttribute('data-cabinet');
        if(target){
          lcZoomTransitionTo(item, function(){ switchAppView(target); });
          return;
        }
        item.classList.remove('is-shake');
        void item.offsetWidth;
        item.classList.add('is-shake');
      });
    });
  })();

  // 导航仪外壳跟随鼠标做轻微 3D 倾斜——只在有精确指针（桌面鼠标）且没有开启"减少动态效果"时生效，
  // 触屏设备本来就没有 hover/mousemove，天然跳过。只改 .lc-console-shell 自己的 transform，
  // 跟 .lc-console 上常驻的漂浮动画（另一个元素）互不影响。
  // 同一帧里顺手把阴影偏移（--lc-shell-shadow-x/y）和屏幕反光位置（--lc-glare-x/y）也带着更新——
  // 阴影跟着倾斜方向挪，反光跟着"光源"扫过屏幕，两个都只是自定义属性/box-shadow，不碰包围盒，
  // 跟点击稳定性无关。这两组自定义属性写在 shell 上，靠 CSS 继承传到 .lc-console-screen::before
  // 这个子元素的伪元素里生效（跟前面 --lc-tilt 传到 .lc-object 的用法是同一套原理）。
  (function initConsoleParallax(){
    var wrap = document.getElementById('lcConsole');
    var shell = wrap ? wrap.querySelector('.lc-console-shell') : null;
    if(!wrap || !shell) return;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var finePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    if(reduceMotion || !finePointer) return;
    var raf = null;
    wrap.addEventListener('mousemove', function(e){
      var rect = wrap.getBoundingClientRect();
      var px = (e.clientX - rect.left) / rect.width;
      var py = (e.clientY - rect.top) / rect.height;
      var rx = (0.5 - py) * 9;
      var ry = (px - 0.5) * 9;
      if(raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function(){
        shell.style.transform = 'rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)';
        shell.style.setProperty('--lc-shell-shadow-x', (ry * 1.6).toFixed(1) + 'px');
        shell.style.setProperty('--lc-shell-shadow-y', (14 - rx * 1.1).toFixed(1) + 'px');
        shell.style.setProperty('--lc-glare-x', (50 + ry * 3.2).toFixed(1) + '%');
        shell.style.setProperty('--lc-glare-y', (18 - rx * 2.6).toFixed(1) + '%');
      });
    });
    wrap.addEventListener('mouseleave', function(){
      if(raf) cancelAnimationFrame(raf);
      shell.style.transform = '';
      shell.style.removeProperty('--lc-shell-shadow-x');
      shell.style.removeProperty('--lc-shell-shadow-y');
      shell.style.removeProperty('--lc-glare-x');
      shell.style.removeProperty('--lc-glare-y');
    });
  })();

  // 光晕/星点背景层（.lc-hero-bg）跟随整个导航台区域（不局限于导航仪本体）的鼠标位置做很小幅度的
  // 反向位移——鼠标往右移，背景往左挪一点，制造"背景更远、跟着摄像机反向漂移"的经典视差错觉。
  // 只碰 pointer-events:none 的纯装饰层，跟任何可点击元素都不共享包围盒，没有稳定性风险。
  // 网关判断（reduceMotion / 精确指针）跟上面的导航仪倾斜保持一致。
  (function initHeroBgParallax(){
    var hero = document.getElementById('lcHero');
    var bg = hero ? hero.querySelector('.lc-hero-bg') : null;
    if(!hero || !bg) return;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var finePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    if(reduceMotion || !finePointer) return;
    var raf = null;
    hero.addEventListener('mousemove', function(e){
      var rect = hero.getBoundingClientRect();
      var px = (e.clientX - rect.left) / rect.width;
      var py = (e.clientY - rect.top) / rect.height;
      var dx = (0.5 - px) * 10;
      var dy = (0.5 - py) * 10;
      if(raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function(){
        bg.style.transform = 'translate(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px)';
      });
    });
    hero.addEventListener('mouseleave', function(){
      if(raf) cancelAnimationFrame(raf);
      bg.style.transform = '';
    });
  })();

  // 任务卡片：参考 tikhub.io 的结构——名称在上／小字信息在下／再下面是一条根据真实时间算出来的动态状态条。
  // ctx.showRank 时左边会带一个"第几重要"的序号输入框（只用在还没排上时间的"待安排"任务上）。
  function taskCardHtml(t, ctx){
    ctx = ctx || {};
    var dateKey = ctx.dateKey || t.date;
    var isToday = dateKey === todayKey();
    var nowMin = minutesSinceMidnight(new Date());
    var status = taskStatusInfo(t, nowMin, isToday);
    var hasTime = typeof t.startMinutes === 'number';
    var timeStr = hasTime ? (fmtClock(t.startMinutes) + '–' + fmtClock(t.startMinutes + t.plannedMinutes) + ' · ') : '';
    var conflictNote = (ctx.conflict && !t.done) ? ' · <span class="app-task-conflict-tag">⚠ 时间冲突，改一下时间</span>' : '';
    var actualNote = (typeof t.actualMinutes === 'number') ? (' · 上次实际' + fmtDuration(t.actualMinutes)) : '';
    // 按类别分组的"列表"视图里，类别已经是分组标题了，行内再重复一遍类别名字没必要（ctx.hideCategory）；
    // 同一个类别盒子里会混着不同日期的任务，所以那边会传 ctx.showDate 换成显示日期而不是类别。
    var catPart = ctx.hideCategory ? '' : (escapeHtml(t.category) + ' · ');
    var datePart = ctx.showDate ? (fmtShortDayLabel(ctx.dateKey || t.date) + ' · ') : '';
    // 降噪：卡片上只留一个时间数字——排程真正用的是含缓冲的 plannedMinutes，就显示它（原始 estMinutes 点开"编辑"还能看到）。
    var meta = datePart + timeStr + catPart + '预计' + fmtDuration(t.plannedMinutes) + '（含缓冲）' + actualNote + conflictNote;
    // "AI计划生成"帮忙排的任务，用一个小标签标出来，跟手动排时间的区分开——对应"按类别分组时
    // AI排的任务放在每个类别盒子最下面"的需求，这个标签是视觉上的呼应。
    var aiTagHtml = (t.aiScheduled && !t.done) ? '<span class="app-task-ai-tag">✨ AI排的</span>' : '';
    var importantTagHtml = (t.important && !t.done) ? '<span class="app-task-imp-tag">⭐ 重要</span>' : '';
    // 分量标签只给"主要"和"次要"挂——"中等"是默认值，每条都印一遍等于没印。
    var wKey = weightOf(t);
    var weightTagHtml = (!t.done && wKey !== 'mid')
      ? ('<span class="app-task-weight-tag w-' + wKey + '" title="任务分量：' + weightLabel(t) + '——排程时决定往哪个精力时段放">' + weightLabel(t) + '</span>')
      : '';
    var urgentTagHtml = (t.urgent && !t.done) ? '<span class="app-task-urg-tag">🔥 紧急</span>' : '';
    var hasNotes = !!(t.noteGain || t.noteKnowledge || t.noteRemark || t.noteFramework);
    var notesTagHtml = hasNotes ? '<span class="app-task-notes-tag">📝 笔记</span>' : '';
    var materialCount = Array.isArray(t.materials) ? t.materials.length : 0;
    var materialsTagHtml = materialCount
      ? '<button class="app-task-materials-tag" type="button" data-materials-id="' + t.id + '" title="打开任务资料">📎 资料 ' + materialCount + '</button>'
      : '';
    // 委托给别人：不重要不紧急的事，可以直接标"已委托"——只是给任务多挂一个可选的 isDelegated
    // 标记，不改任务本身的时间/类别等任何已有字段，清单/时间轴照常显示这条任务。
    var delegatedTagHtml = (t.isDelegated && !t.done) ? '<span class="app-task-delegate-tag">🤝 已委托</span>' : '';
    // 拆过关的任务，卡片上直接显示走到第几关——点一下进关卡地图
    var qSteps = getTaskSteps(t);
    var questBadgeHtml = qSteps.length
      ? ('<button class="task-quest-badge" type="button" data-quest-id="' + t.id + '">🎮 ' +
         qSteps.filter(function(s){ return s.done; }).length + '/' + qSteps.length + '</button>')
      : '';
    // 航线打印器：缓冲倍数印在纸条上——"第一次做"的技术型任务 2× 金属标签、做过的 1.3× 标签，
    // 呼应"AI一键排程"那一步，本来就是 commitTask() 已经存好的 t.multiplier，只是之前没显示出来。
    var multiplierTagHtml = (!t.done && t.multiplier) ? ('<span class="app-task-mult-tag" title="按预计时长的 ' + t.multiplier + ' 倍留了缓冲">' + t.multiplier + '×</span>') : '';
    // Step2 降噪：名字旁的优先级标签只留最要紧的一个——紧急 > 重要 > 分量(主要/次要)；2× 缓冲角标不再印在卡面
    // （缓冲已并进上面那句"（含缓冲）"，具体倍数点"编辑"能看）。📝笔记/✨AI排的/🤝已委托 也不印在卡面了——
    // 笔记/委托在 ⋮ 菜单里有对应项、AI排的在列表"AI 排的"分隔线下已体现；卡面只再留一个可点的 🎮关卡角标。
    var priorityTagHtml = urgentTagHtml || importantTagHtml || weightTagHtml || '';
    var catDotHtml = ctx.showCatDot ? ('<span class="app-task-cat-dot" style="background:' + categoryColor(t.category) + '" aria-hidden="true"></span>') : '';
    // 空进度条降噪：只有真进入某个状态（进行中/已错过/已完成）才画那条进度条；待安排/待开始这种没有真实进度的，
    // 画一条 0% 的线纯属噪音——只保留下面那句状态文字，把线去掉。
    var statusTrackHtml = status.cls
      ? ('<div class="app-task-status-track"><div class="app-task-status-fill ' + status.cls + '" style="width:' + status.pct + '%;"></div></div>')
      : '';
    var showRank = !!ctx.showRank && !t.done && !hasTime;
    var rankHtml = showRank
      ? ('<div class="app-task-rank" title="第几重要——改数字可以插队，其他任务自动顺延">' +
          '<span class="app-task-drag-handle" aria-hidden="true" title="按住拖动换位置">⠿</span>' +
          '<input type="number" class="app-task-rank-input" min="1" max="' + Math.max(1, ctx.rankTotal || 1) + '" value="' + ctx.rankIndex + '" data-id="' + t.id + '">' +
        '</div>')
      : '';
    var activeTimer = ctx.activeTimer || null;
    var isTimerTask = !!(activeTimer && activeTimer.taskId === t.id);
    var timerRunning = isTimerTask && !!activeTimer.runningSince;
    var startBtnHtml = '';
    if(!t.done){
      if(isTimerTask){
        startBtnHtml = '<button class="app-task-start-btn ' + (timerRunning ? 'is-running' : 'is-paused') + '" type="button" data-start-id="' + t.id + '">' +
          (timerRunning ? '⏱ 计时中' : '‖ 已暂停') + '</button>';
      } else {
        startBtnHtml = '<button class="app-task-start-btn" type="button" data-start-id="' + t.id + '">▶ 开始</button>';
      }
    }
    return '' +
      '<li class="app-task" data-done="' + (t.done ? 'true' : 'false') + '" data-id="' + t.id + '"' + (showRank ? ' draggable="true" data-drag="1"' : '') + '>' +
        rankHtml +
        '<button class="app-task-check" type="button" aria-label="标记完成"></button>' +
        '<div class="app-task-body">' +
          '<div class="app-task-head-row">' +
            catDotHtml +
            '<span class="app-task-name">' + escapeHtml(t.name) + '</span>' +
            priorityTagHtml + questBadgeHtml + materialsTagHtml +
          '</div>' +
          '<p class="app-task-meta">' + meta + '</p>' +
          '<div class="app-task-status">' +
            statusTrackHtml +
            '<p class="app-task-status-label ' + status.cls + '">' + status.label + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="app-task-actions">' +
          startBtnHtml +
          '<button class="app-task-menu-btn" type="button" aria-label="更多">⋮</button>' +
          '<div class="app-task-menu" hidden>' +
            '<button type="button" data-act="edit">编辑</button>' +
            '<button type="button" data-act="quest">' + (getTaskSteps(t).length ? '🎮 看关卡' : '🎮 拆成小关') + '</button>' +
            '<button type="button" data-act="help-ai">🤖 遇到困难 · 关联 AI</button><button type="button" data-act="notes">' + (hasNotes ? '📝 编辑笔记' : '📝 写笔记') + '</button>' +
            '<button type="button" data-act="cases">🏢 大厂是怎么干的</button>' +
            '<button type="button" data-act="toggle-important">' + (t.important ? '✓ 重要' : '标记重要') + '</button>' +
            '<button type="button" data-act="toggle-urgent">' + (t.urgent ? '✓ 紧急' : '标记紧急') + '</button>' +
            '<button type="button" data-act="toggle-delegate">' + (t.isDelegated ? '✓ 已委托' : '委托给别人') + '</button>' +
            '<button type="button" class="danger" data-act="delete">删除</button>' +
          '</div>' +
        '</div>' +
      '</li>';
  }

  // 日视图的核心：按小时定位的时间轴。已经排上时间、彼此不冲突的任务在这里显示成一个个色块。
  // waitingCount：待安排里还有几条没上时间轴的任务——时间轴是空的时候，不能让一整块 18 小时的空网格
  // 把它们挡在下面滚不到的地方，所以这种情况改成一张矮的提示卡，"待安排"紧接着就在下面能看见。
  function renderTimelineHtml(tasks, dateKey, isToday, nowMin, waitingCount, activeTimer){
    var timedTasks = tasks.filter(function(t){ return typeof t.startMinutes === 'number'; });
    if(!timedTasks.length){
      var msg = waitingCount > 0
        ? ('这一天还没有任务排上时间轴——' + waitingCount + ' 条在下面"待安排"里等着，选个时间排进去，或者点上面"AI计划生成"，从现在开始自动往后排')
        : '这一天还没有任务，点右上角"添加任务"排一个吧';
      return '<div class="timeline-empty-compact">' +
        '<p class="timeline-empty-compact-text">' + msg + '</p>' +
        '</div>';
    }
    var pxPerMin = TIMELINE_HOUR_PX / 60;
    var hourLabels = '', hourRows = '';
    for(var m = TIMELINE_START_MIN; m < TIMELINE_END_MIN; m += 60){
      hourLabels += '<div class="timeline-hour-label">' + pad2(Math.floor(m / 60)) + ':00</div>';
      hourRows += '<div class="timeline-grid-row"></div>';
    }
    var blocksHtml = timedTasks.map(function(t){
      var start = Math.max(TIMELINE_START_MIN, t.startMinutes);
      var end = Math.min(TIMELINE_END_MIN, t.startMinutes + t.plannedMinutes);
      if(end <= start) return '';
      var top = (start - TIMELINE_START_MIN) * pxPerMin;
      var height = Math.max(20, (end - start) * pxPerMin);
      var live = isToday && !t.done && nowMin >= t.startMinutes && nowMin < (t.startMinutes + t.plannedMinutes);
      var cls = 'timeline-block' + (t.done ? ' is-done' : '') + (live ? ' is-live' : '');
      // 按类别上色（image2 那种彩色课表的意思）——已完成保持灰、进行中保持红，这两种状态本身就是更重要的信号，
      // 不能被类别色盖过去，所以只在"正常未完成、非进行中"的默认状态下才用类别色。
      var catColorStyle = (!t.done && !live) ? ('border-left-color:' + categoryColor(t.category) + ';') : '';
      var isTimerTask = !!(activeTimer && activeTimer.taskId === t.id);
      var timerRunning = isTimerTask && !!activeTimer.runningSince;
      var startIconHtml = t.done ? '' : (
        '<button class="timeline-block-start' + (isTimerTask ? (timerRunning ? ' is-running' : ' is-paused') : '') + '" type="button" data-start-id="' + t.id + '" aria-label="开始计时" title="' + (isTimerTask ? (timerRunning ? '计时中' : '已暂停·点击继续') : '开始计时') + '">' +
          (isTimerTask ? (timerRunning ? '⏱' : '‖') : '▶') +
        '</button>'
      );
      return '<div class="' + cls + '" data-id="' + t.id + '" style="top:' + top + 'px;height:' + height + 'px;' + catColorStyle + '">' +
        '<div class="timeline-block-actions">' + startIconHtml + '<button class="timeline-block-check" type="button" aria-label="标记完成"></button></div>' +
        '<div class="timeline-block-name">' + escapeHtml(t.name) + '</div>' +
        '<div class="timeline-block-time">' + fmtClock(t.startMinutes) + '–' + fmtClock(t.startMinutes + t.plannedMinutes) + '</div>' +
        '</div>';
    }).join('');
    var nowLineHtml = '';
    if(isToday && nowMin >= TIMELINE_START_MIN && nowMin < TIMELINE_END_MIN){
      nowLineHtml = '<div class="timeline-now-line" style="top:' + ((nowMin - TIMELINE_START_MIN) * pxPerMin) + 'px;"></div>';
    }
    return '<div class="timeline-wrap">' +
      '<div class="timeline-scroll" id="timelineScroll">' +
        '<div class="timeline-inner">' +
          '<div class="timeline-hours">' + hourLabels + '</div>' +
          '<div class="timeline-grid">' + hourRows + blocksHtml + nowLineHtml + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function bindTaskListInteractions(root){
    if(!root) return;
    root.querySelectorAll('.app-task-start-btn').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        handleStartClick(btn.getAttribute('data-start-id'));
      });
    });
    root.querySelectorAll('.app-task-check').forEach(function(btn){
      btn.addEventListener('click', function(){
        var li = btn.closest('.app-task');
        if(li && li.getAttribute('data-done') !== 'true') lcStampArrived(li);
        toggleTaskDone(li && li.getAttribute('data-id'));
      });
    });
    root.querySelectorAll('.app-task-menu-btn').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var menu = btn.nextElementSibling;
        var wasHidden = menu.hidden;
        document.querySelectorAll('.app-task-menu').forEach(function(m){ m.hidden = true; });
        menu.hidden = !wasHidden;
      });
    });
    root.querySelectorAll('.app-task-menu button').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var li = btn.closest('.app-task');
        var id = li && li.getAttribute('data-id');
        var act = btn.getAttribute('data-act');
        btn.closest('.app-task-menu').hidden = true;
        if(act === 'edit') openTaskModal(id);
        else if(act === 'delete') deleteTask(id);
        else if(act === 'toggle-important') toggleTaskImportant(id);
        else if(act === 'toggle-urgent') toggleTaskUrgent(id);
        else if(act === 'toggle-delegate') toggleTaskDelegated(id);
        else if(act === 'help-ai') {
          try { sessionStorage.setItem('shanganya_task_ai_pending_v1', String(id || '')); } catch(_e) {}
          var frame = document.getElementById('embeddedP2Frame');
          var aiView = document.getElementById('view-ai-p2');
          if(aiView && frame) {
            document.querySelectorAll('.app-view').forEach(function(view){view.hidden=view!==aiView;});
            aiView.hidden = false;
            frame.src = './ai-p2.html?embedded=1&linkedTaskAi=20261023v16&task=' + encodeURIComponent(id);
            try{frame.scrollIntoView({behavior:'smooth',block:'start'});}catch(_e){}
          } else location.href='./ai-p2.html?task='+encodeURIComponent(id);
        }
        else if(act === 'notes') openTaskNotesModal(id);
        else if(act === 'quest') openQuest(id);
        else if(act === 'cases'){
          // 拿任务名当主题去配案例库；配不上就如实说没有，不硬凑
          var acct0 = getAcctData();
          var tk = (acct0.tasks || []).find(function(x){ return x.id === id; });
          openCaseModal(tk ? tk.name : '');
        }
      });
    });
    // 任务卡片上的闯关进度徽标：点一下直接进关卡地图
    root.querySelectorAll('.task-quest-badge').forEach(function(b){
      b.addEventListener('click', function(e){
        e.stopPropagation();
        openQuest(b.getAttribute('data-quest-id'));
      });
    });
    root.querySelectorAll('.app-task-materials-tag').forEach(function(b){
      b.addEventListener('click', function(e){
        e.stopPropagation();
        openTaskModal(b.getAttribute('data-materials-id'));
        setTimeout(function(){
          var field = document.getElementById('taskMaterialsField');
          if(field) field.scrollIntoView({block:'nearest'});
        }, 0);
      });
    });
    root.querySelectorAll('.app-task-rank-input').forEach(function(inp){
      inp.addEventListener('click', function(e){ e.stopPropagation(); });
      inp.addEventListener('keydown', function(e){
        e.stopPropagation();
        if(e.key === 'Enter') inp.blur();
      });
      inp.addEventListener('change', function(){
        var id = inp.getAttribute('data-id');
        var n = parseInt(inp.value, 10);
        if(id && n >= 1) reorderBufferTask(id, n);
        else refreshCurrentView();
      });
    });
  }
  document.addEventListener('click', function(){
    document.querySelectorAll('.app-task-menu').forEach(function(m){ m.hidden = true; });
  });

  // 打勾完成 / 取消完成。
  // 铁规矩：这里<b>永远不碰</b> date / dueDate / startMinutes / order —— 截止日期、开始时间、
  // 在清单里的位置，打勾取消勾都原样不动（读过代码确认过，本来就没动过，这里也绝不新增）。
  // 点错一把最气人，所以完成时弹一条"点错了？撤销"，6 秒内点一下逐字回到点之前那一瞬。
  var lcLastCompletedSnapshot = null;
  var lcLastCompletedTimer = null;
  function toggleTaskDone(id){
    if(!id) return;
    var acct = getAcctData();
    var t = acct.tasks.find(function(x){ return x.id === id; });
    if(!t) return;
    if(!t.done){
      // ——打勾完成——先把"完成之前"的确切状态拍下来，撤销时逐字恢复
      var snap = {
        id: id,
        coins: acct.coins || 0,
        lifetimeCoins: acct.lifetimeCoins || 0,
        badgeKeys: Object.keys(acct.badgeUnlocks || {}),
        done: t.done, completedAt: t.completedAt || null
      };
      t.done = true;
      t.completedAt = Date.now();
      acct.coins = (acct.coins || 0) + 2;
      acct.lifetimeCoins = (acct.lifetimeCoins || 0) + 2;
      var newlyBadges = checkAndRecordBadgeUnlocks(acct);
      saveAcctData(acct);
      updateCoinDisplay();
      refreshCurrentView();
      toastNewBadges(newlyBadges);
      lcShowCompleteUndoToast(t.name, snap);
    } else {
      // ——直接取消勾（没走撤销条，比如过了一会儿在收集箱里点掉）——
      // 把这次完成挣的 2 枚金币退回去（不到负数）；历史累计金币按"只增不减"的口径不倒扣；
      // 截止日期/开始时间/位置一概不动。
      t.done = false;
      delete t.completedAt;   // 删掉、别留 null，做到跟没完成过的任务一字不差
      acct.coins = Math.max(0, (acct.coins || 0) - 2);
      saveAcctData(acct);
      updateCoinDisplay();
      refreshCurrentView();
    }
  }
  // 完成后的"点错了？撤销"提示条——跟删除那条共用同一套外观和收起逻辑，语言一致。
  function lcShowCompleteUndoToast(name, snap){
    var old = document.getElementById('lcUndoToast');
    if(old && old.parentNode) old.parentNode.removeChild(old);
    if(lcLastCompletedTimer){ clearTimeout(lcLastCompletedTimer); lcLastCompletedTimer = null; }
    lcLastCompletedSnapshot = snap;
    var toast = document.createElement('div');
    toast.id = 'lcUndoToast';
    toast.className = 'lc-undo-toast';
    toast.innerHTML = DOMPurify.sanitize('<span>✅ 完成"' + escapeHtml(name) + '"</span><button type="button" id="lcUndoBtn">点错了？撤销</button>');
    document.body.appendChild(toast);
    requestAnimationFrame(function(){ toast.classList.add('is-in'); });
    var btn = document.getElementById('lcUndoBtn');
    if(btn) btn.addEventListener('click', function(){
      var s = lcLastCompletedSnapshot;
      if(!s) return;
      var a = getAcctData();
      var tk = (a.tasks || []).find(function(x){ return x.id === s.id; });
      if(tk){
        tk.done = s.done;
        // 原来没有 completedAt 这个字段的，就删掉、别留个 null——做到真正"信息和原来一样"
        if(s.completedAt == null) delete tk.completedAt; else tk.completedAt = s.completedAt;
      }
      a.coins = s.coins;                                            // 金币逐字回退
      a.lifetimeCoins = s.lifetimeCoins;                            // 历史金币也回到那一瞬（这次完成当没发生过）
      // 勋章：只回滚"这次完成新解锁的那几个"，之前就解锁的原样保留
      if(a.badgeUnlocks){
        Object.keys(a.badgeUnlocks).forEach(function(k){
          if(s.badgeKeys.indexOf(k) === -1) delete a.badgeUnlocks[k];
        });
      }
      saveAcctData(a);
      lcLastCompletedSnapshot = null;
      if(lcLastCompletedTimer){ clearTimeout(lcLastCompletedTimer); lcLastCompletedTimer = null; }
      lcDismissUndoToast();
      updateCoinDisplay();
      refreshCurrentView();
      lcVoyagePrompt('撤销了——"' + name + '"回到没做的状态，截止日期和位置都没变');
    });
    lcLastCompletedTimer = setTimeout(function(){ lcLastCompletedSnapshot = null; lcDismissUndoToast(); }, 6000);
  }
  // 航线打印器：删除＝纸条送进碎纸口，但一定要留撤销入口——先播放"碎纸"动效，动效结束才真的
  // 从数据里拿掉；同时留一个 6 秒的撤销提示条，点"撤销"能把这条任务原样插回原来的位置。
  // window.confirm 这一步照样保留（不因为加了撤销就撤掉这层保险，双重保险优于替换）。
  var lcLastDeletedSnapshot = null;
  var lcLastDeletedTimer = null;
  function deleteTask(id){
    if(!id) return;
    if(!window.confirm('确定删除这条任务吗？删除后可以在下面的提示条里点"撤销"恢复。')) return;
    var acct = getAcctData();
    var idx = acct.tasks.findIndex(function(x){ return x.id === id; });
    if(idx === -1) return;
    var snapshot = acct.tasks[idx];
    var targets = Array.prototype.slice.call(document.querySelectorAll('[data-id="' + id + '"]'));
    function finishDelete(){
      var a = getAcctData();
      var i = a.tasks.findIndex(function(x){ return x.id === id; });
      if(i === -1) return;
      a.tasks.splice(i, 1);
      saveAcctData(a);
      refreshCurrentView();
      lcShowUndoToast(snapshot, idx);
    }
    if(targets.length){
      targets.forEach(function(el){ el.classList.add('lc-shredding'); });
      setTimeout(finishDelete, 380);
    } else {
      finishDelete();
    }
  }
  function lcShowUndoToast(taskSnapshot, originalIndex){
    var old = document.getElementById('lcUndoToast');
    if(old && old.parentNode) old.parentNode.removeChild(old);
    if(lcLastDeletedTimer){ clearTimeout(lcLastDeletedTimer); lcLastDeletedTimer = null; }
    lcLastDeletedSnapshot = { task: taskSnapshot, index: originalIndex };
    var toast = document.createElement('div');
    toast.id = 'lcUndoToast';
    toast.className = 'lc-undo-toast';
    toast.innerHTML = DOMPurify.sanitize('<span>🗑️ 已删除"' + escapeHtml(taskSnapshot.name) + '"</span><button type="button" id="lcUndoBtn">撤销</button>');
    document.body.appendChild(toast);
    requestAnimationFrame(function(){ toast.classList.add('is-in'); });
    var undoBtn = document.getElementById('lcUndoBtn');
    if(undoBtn) undoBtn.addEventListener('click', function(){
      if(!lcLastDeletedSnapshot) return;
      var a = getAcctData();
      var pos = Math.min(lcLastDeletedSnapshot.index, a.tasks.length);
      a.tasks.splice(pos, 0, lcLastDeletedSnapshot.task);
      saveAcctData(a);
      lcLastDeletedSnapshot = null;
      if(lcLastDeletedTimer){ clearTimeout(lcLastDeletedTimer); lcLastDeletedTimer = null; }
      lcDismissUndoToast();
      refreshCurrentView();
    });
    lcLastDeletedTimer = setTimeout(function(){ lcLastDeletedSnapshot = null; lcDismissUndoToast(); }, 6000);
  }
  function lcDismissUndoToast(){
    var toast = document.getElementById('lcUndoToast');
    if(!toast) return;
    toast.classList.remove('is-in');
    setTimeout(function(){ if(toast.parentNode) toast.parentNode.removeChild(toast); }, 220);
  }
  // 航行模式的轻提示条：短暂出现在顶部，自动消失，不需要用户点掉，不打断计时。
  function lcVoyagePrompt(text){
    var old = document.getElementById('lcVoyagePromptToast');
    if(old && old.parentNode) old.parentNode.removeChild(old);
    var el = document.createElement('div');
    el.id = 'lcVoyagePromptToast';
    el.className = 'lc-voyage-prompt';
    el.textContent = '💬 ' + text;
    document.body.appendChild(el);
    requestAnimationFrame(function(){ el.classList.add('is-in'); });
    setTimeout(function(){
      el.classList.remove('is-in');
      setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 260);
    }, 4200);
  }
  // ---- 摄像头守望：番茄钟计时页可选开启的陪伴小组件 ----
  // 彻底关掉摄像头（停轨道+清计时器+清状态）：手动点关闭、"完成航点"、离开番茄钟页、
  // 没有计时中的任务这几种情况都会调用它——宁可多调用几次保证真的关掉，也不能有任何一条
  // 路径漏掉导致摄像头灯一直亮着。
  // 专注时段统计：不管这次是怎么关掉的（手动关/完成航点/切走页面/计时没了），只要真的攒够了
  // 样本，就在下面清零之前把这次的"专注度"汇总记一条——全新的 acct.focusSessions 字段，
  // 用跟 acct.badgeUnlocks 一样"用到时才初始化"的写法，不碰 getAcctData/saveAcctData 本身；
  // 没开摄像头守望的航段（camWatch.enabled 是 false）完全不受影响，这个字段不会被摸到。
  function stopCamWatch(){
    camSpeakStop(); // 关盯梢的第一件事：先闭嘴，别念完那半句还在喊
    // 先把这次的专注汇总留住：点"完成航点"时这个函数比写用时记录先跑，不在这儿接一下，
    // 下面清零之后 finishTimerSession() 就再也拿不到"真正专注了多久"。
    var judgedMs = camWatch.okMs + camWatch.badMs;
    if(camWatch.enabled && judgedMs >= 30000){ // 校准完之后至少判了30秒才算数
      lastFocusSummary = {
        taskId: camWatch.taskId,
        okMs: camWatch.okMs,
        badMs: camWatch.badMs,
        judgedMs: judgedMs,
        focusRate: Math.round((camWatch.okMs / judgedMs) * 100) / 100,
        caughtCount: camWatch.caughtCount,
        nagCount: camWatch.nagCount,
        at: Date.now()
      };
    }
    if(camWatch.enabled && camWatch.totalSamples >= CAMWATCH_MIN_SAMPLES_TO_RECORD){
      var facct = getAcctData();
      if(!Array.isArray(facct.focusSessions)) facct.focusSessions = [];
      var fnow = new Date();
      var fRec = {
        id: 'fs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        dateKey: todayKey(),
        hour: fnow.getHours(),
        quietRatio: Math.round((camWatch.quietSamples / camWatch.totalSamples) * 100) / 100,
        sampleCount: camWatch.totalSamples,
        ts: Date.now()
      };
      // 盯梢真判出结果的这一段，额外记下真实专注数据。老记录没有这几个字段，读的地方都要兜底。
      if(judgedMs >= 30000){
        fRec.focusRate = Math.round((camWatch.okMs / judgedMs) * 100) / 100;
        fRec.focusedMs = Math.round(camWatch.okMs);
        fRec.distractedMs = Math.round(camWatch.badMs);
        fRec.caughtCount = camWatch.caughtCount;
      }
      facct.focusSessions.push(fRec);
      if(facct.focusSessions.length > 500) facct.focusSessions = facct.focusSessions.slice(-500); // 只留最近500条，别把本地存储撑爆
      saveAcctData(facct);
    }
    if(camWatch.timer){ clearInterval(camWatch.timer); camWatch.timer = null; }
    if(camWatch.stream){
      camWatch.stream.getTracks().forEach(function(tr){ tr.stop(); });
      camWatch.stream = null;
    }
    camWatch.enabled = false;
    camWatch.videoEl = null;
    camWatch.canvasEl = null;
    camWatch.ctx = null;
    camWatch.lastFrame = null;
    camWatch.quietStreakMs = 0;
    camWatch.totalSamples = 0;
    camWatch.quietSamples = 0;
    camWatch.taskId = null;
    camWatch.error = '';
    // 盯梢状态跟着一起收干净——尤其是全屏拦截层，绝不能在摄像头都关了之后还挂在屏幕上
    camFocusBlockOff();
    camWatch.base = null;
    camWatch.calibMs = 0;
    camWatch.state = 'calib';
    camWatch.badStreakMs = 0;
    camWatch.alertLevel = 0;
    camWatch.caughtCount = 0;
    camWatch.nagCount = 0;
    camWatch.okMs = 0;
    camWatch.badMs = 0;
  }
  // ---------- 盯梢模式：判断"人还在不在、有没有低头" ----------
  // 这一层不下载任何模型（下载模型权重的请求在发布出去的页面里会被浏览器拦掉，之前两个实验页
  // 已经验证过了），用的是一个纯像素指标：画面里有多少像素像皮肤、这些像素的重心在哪。
  // 关键在于不跟写死的阈值比，只跟开头十几秒记下来的**你自己的正常坐姿**比——所以肤色深浅、
  // 房间明暗、背景里有没有木头家具，都不用重新调参数。
  // 全程只在这台设备上算，画面不上传、不保存，也不产生任何能还原成人脸的东西。
  function camFocusAnalyze(frame, w, h){
    var count = 0, sx = 0, sy = 0;
    for(var i = 0, px = 0; i < frame.length; i += 4, px++){
      var r = frame[i], g = frame[i + 1], b = frame[i + 2];
      var yy = 0.299 * r + 0.587 * g + 0.114 * b;
      if(yy <= 40) continue; // 太暗的像素不参与，避免夜里一片噪点全被算成肤色
      var cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      var cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      if(cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173){
        count++;
        sx += (px % w);
        sy += Math.floor(px / w);
      }
    }
    if(!count) return { skin: 0, cx: 0.5, cy: 0.5 };
    return { skin: count / (w * h), cx: (sx / count) / w, cy: (sy / count) / h };
  }
  // 跟基准比，判成 ok / away(人不见了) / down(低头) / turn(转头)。
  function camFocusJudge(m){
    var b = camWatch.base;
    if(!b || !b.n) return 'calib';
    // 基准本身就没采到脸（摄像头被挡住、屋里全黑、或者校准那会儿人就不在），这时候硬判会一直
    // 误报，干脆不判，把提醒交还给原来那套"画面有没有动静"的逻辑。
    if(b.skin < 0.015) return 'ok';
    var ratio = m.skin / b.skin;
    if(m.skin < 0.012 || ratio < CAMFOCUS_AWAY_RATIO) return 'away';
    if((m.cy - b.cy) > CAMFOCUS_DOWN_DY && ratio < CAMFOCUS_DOWN_RATIO) return 'down';
    if(Math.abs(m.cx - b.cx) > CAMFOCUS_TURN_DX) return 'turn';
    return 'ok';
  }
  function camFocusThresholds(){
    var k = CAMFOCUS_STRICT_SCALE[camWatch.strict] || 1;
    return { l1: CAMFOCUS_L1_MS * k, l2: CAMFOCUS_L2_MS * k, l3: CAMFOCUS_L3_MS * k };
  }
  // 震动 + 一声短提示音。两个都可能被系统/浏览器拒绝（比如没有震动马达、音频还没解锁），
  // 各自包在 try 里，失败就算了，绝不能因为提示音报错把整个采样循环带崩。
  function camFocusBuzz(pattern){
    try { if(navigator.vibrate) navigator.vibrate(pattern); } catch(e){}
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return;
      var ac = new AC();
      var osc = ac.createOscillator(), gain = ac.createGain();
      osc.type = 'square';
      osc.frequency.value = 880;
      gain.gain.value = 0.05;
      osc.connect(gain); gain.connect(ac.destination);
      osc.start();
      setTimeout(function(){ try { osc.stop(); ac.close(); } catch(e){} }, 200);
    } catch(e){}
  }
  // 话술：短、硬、命令句。只冲着"现在把头抬起来"这件事去，不做人身攻击——骂到自我否定
  // 那一步，人只会更不敢开始，这是这个功能最要避开的坑。
  var CAMFOCUS_LINES = {
    away:   { soft: '人不在座位上了，回来继续？', normal: '人呢？回来坐下。', hard: '座位空了。立刻回来。' },
    down:   { soft: '好像低头了，抬头看一眼屏幕。', normal: '抬头。手机放下。', hard: '又低头。抬起来，就现在。' },
    turn:   { soft: '注意力好像跑了，收回来。', normal: '眼睛转回屏幕。', hard: '回神。别看别处。' }
  };
  // ——语音提醒——
  // 人跑去床上躺着的时候，屏幕上弹什么都没用——他看不见。所以要出声。
  // 用浏览器自带的 speechSynthesis：<b>全在本机合成</b>，不联网、不花额度、不用部署。
  // 三级越喊越急：一级正常说，二级提高音量语速，三级压着嗓子催，而且人不回来就每 20 秒再喊一遍。
  var CAMVOICE_REPEAT_MS = 20000;
  var CAMVOICE_LINES = {
    away: ['人不在工位上，回来坐下。', '你离开座位了，现在回来。', '喂，回工位。计时还在跑，你人不在。'],
    down: ['抬头，手机放下。', '又低头了，把手机放下，抬头。', '手机放下。抬头。就现在。'],
    turn: ['注意力跑了，收回来。', '眼睛转回屏幕。', '回神。看屏幕。']
  };
  var CAMVOICE_ZH = null; // 挑到的中文嗓子，挑不到就用系统默认的
  function pickZhVoice(){
    try {
      var S = window.speechSynthesis;
      if(!S || typeof S.getVoices !== 'function') return null;
      var vs = S.getVoices() || [];
      // getVoices() 在有些浏览器上第一次是空的，等 voiceschanged 之后才有——空就先返回 null，
      // 下次再挑；反正挑不到也能用系统默认嗓子念，不会哑。
      return vs.filter(function(v){ return /^(zh|cmn)/i.test(v.lang || '') || /Chinese|中文|普通话/i.test(v.name || ''); })[0] || null;
    } catch(e){ return null; }
  }
  try {
    if(window.speechSynthesis && 'onvoiceschanged' in window.speechSynthesis){
      window.speechSynthesis.onvoiceschanged = function(){ CAMVOICE_ZH = pickZhVoice(); };
    }
  } catch(e){}
  // level: 1/2/3，越大越急。任何一步出问题都静默放过——提示音报错绝不能把采样循环带崩。
  function camSpeak(kind, level){
    if(!camWatch.voiceOn) return false;
    try {
      var S = window.speechSynthesis;
      if(!S || typeof window.SpeechSynthesisUtterance !== 'function') return false;
      var pack = CAMVOICE_LINES[kind] || CAMVOICE_LINES.turn;
      var lv = Math.max(1, Math.min(3, level || 1));
      var u = new window.SpeechSynthesisUtterance(pack[lv - 1] || pack[0]);
      u.lang = 'zh-CN';
      u.volume = 1;
      u.rate = lv >= 3 ? 1.18 : (lv >= 2 ? 1.06 : 0.98);
      u.pitch = lv >= 3 ? 1.22 : (lv >= 2 ? 1.1 : 1);
      if(!CAMVOICE_ZH) CAMVOICE_ZH = pickZhVoice();
      if(CAMVOICE_ZH) u.voice = CAMVOICE_ZH;
      S.cancel(); // 别让几句叠在一起排队喊
      S.speak(u);
      camWatch.voiceLastAt = Date.now();
      camWatch.voiceCount++;
      return true;
    } catch(e){ return false; }
  }
  function camSpeakStop(){
    try { if(window.speechSynthesis) window.speechSynthesis.cancel(); } catch(e){}
  }
  function camFocusNag(kind){
    var pack = CAMFOCUS_LINES[kind] || CAMFOCUS_LINES.turn;
    var text = pack[camWatch.strict] || pack.normal;
    var old = document.getElementById('camFocusNag');
    if(old && old.parentNode) old.parentNode.removeChild(old);
    var el = document.createElement('div');
    el.id = 'camFocusNag';
    el.className = 'camfocus-nag';
    el.textContent = text;
    document.body.appendChild(el);
    requestAnimationFrame(function(){ el.classList.add('is-in'); });
    setTimeout(function(){
      el.classList.remove('is-in');
      setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 240);
    }, 5000);
    camFocusBuzz([180, 90, 180]);
  }
  // 二级：全屏拦上。挡住整页、只留一个按钮，走神到这一步就别想划过去——把你自己写的那句
  // 军令状原话怼到脸上，比任何现成的狠话都管用。
  function camFocusBlockOn(kind){
    if(document.getElementById('camFocusBlock')) return;
    var acct = getAcctData();
    var at = acct.activeTimer;
    var leftMin = 0;
    if(at && at.targetMinutes){
      leftMin = Math.max(0, Math.round((at.targetMinutes * 60000 - timerElapsedMs(at)) / 60000));
    }
    var task = at ? (acct.tasks || []).filter(function(t){ return t.id === at.taskId; })[0] : null;
    var kickerMap = { away: '你离开了座位', down: '你低头了', turn: '你的注意力跑了' };
    var box = document.createElement('div');
    box.id = 'camFocusBlock';
    box.className = 'camfocus-block';
    var vowHtml = camWatch.vow
      ? '<p class="camfocus-block-vow">“' + escapeHtml(camWatch.vow) + '”<br><span style="font-size:.78rem;opacity:.75;">—— 这是你自己刚才写下的</span></p>'
      : '';
    var metaBits = [];
    if(task) metaBits.push('正在做的是：' + escapeHtml(task.name));
    if(leftMin > 0) metaBits.push('还剩 <b>' + leftMin + '</b> 分钟');
    if(camWatch.caughtCount > 1) metaBits.push('这一段里第 <b>' + camWatch.caughtCount + '</b> 次走神');
    box.innerHTML =
      DOMPurify.sanitize('<p class="camfocus-block-kicker">' + (kickerMap[kind] || '你走神了') + '</p>' +
      '<h2 class="camfocus-block-title">回来。</h2>' +
      vowHtml +
      (metaBits.length ? '<p class="camfocus-block-meta">' + metaBits.join(' · ') + '</p>' : '') +
      '<button class="camfocus-block-btn" type="button" id="camFocusBackBtn">我回来了，继续</button>' +
      '<p class="camfocus-block-sub">这一屏是你自己开的盯梢模式弹出来的。真要停，先点上面这个按钮回去，再正经按暂停——别就这么晾着。</p>');
    document.body.appendChild(box);
    camFocusBuzz([300, 120, 300, 120, 300]);
    var btn = document.getElementById('camFocusBackBtn');
    if(btn) btn.addEventListener('click', function(){
      camFocusBlockOff();
      // 点了"我回来了"就把这一轮的累计清零，重新开始计时，不然人刚回来又立刻被弹一次
      camWatch.badStreakMs = 0;
      camWatch.alertLevel = 0;
    });
  }
  function camFocusBlockOff(){
    var box = document.getElementById('camFocusBlock');
    if(box && box.parentNode) box.parentNode.removeChild(box);
  }
  // 走神状态机：每次采样调一次。ok 就把累计清零、顺便让基准慢慢跟上姿势变化；
  // 不 ok 就累加时长，按门槛逐级加压，每一级只触发一次。
  function camFocusTick(state, m, dt, isRunning){
    if(!isRunning){ // 暂停/结束了不盯，也不要把这段算成走神
      camWatch.badStreakMs = 0;
      camWatch.alertLevel = 0;
      camFocusBlockOff();
      return;
    }
    if(state === 'ok'){
      camWatch.okMs += dt; // 真正"在状态"的时长，按秒累计——这是后面一切统计的原料
      camWatch.badStreakMs = 0;
      camWatch.alertLevel = 0;
      camSpeakStop(); // 人一回来就闭嘴，别再念完那半句
      camFocusBlockOff();
      // 基准慢慢跟着你走：每次只挪一点点，够吸收"换个坐姿、天色暗下来"，又不至于把走神吸收进去
      var b = camWatch.base;
      if(b && b.n){
        b.skin += (m.skin - b.skin) * CAMFOCUS_BASE_ADAPT;
        b.cx += (m.cx - b.cx) * CAMFOCUS_BASE_ADAPT;
        b.cy += (m.cy - b.cy) * CAMFOCUS_BASE_ADAPT;
      }
      return;
    }
    camWatch.badStreakMs += dt;
    camWatch.badMs += dt; // 溜号时长同样累计，跟 okMs 一起构成"这一段到底有多专注"
    var th = camFocusThresholds();
    if(camWatch.alertLevel < 1 && camWatch.badStreakMs >= th.l1){
      camWatch.alertLevel = 1;
      camWatch.nagCount++;
      camFocusNag(state);
      camSpeak(state, 1);
      // 顺手让 Claude 确认一眼"到底在干嘛"。本机那套只看肤色和位置，分不清
      // "低头在看书"和"低头在刷手机"——这一眼就是来分这个的。有预算上限、有间隔。
      camVisionAutoConfirm(state);
    } else if(camWatch.alertLevel < 2 && camWatch.badStreakMs >= th.l2){
      camWatch.alertLevel = 2;
      camWatch.caughtCount++;
      camFocusBlockOn(state);
      camSpeak(state, 2);
    } else if(camWatch.alertLevel < 3 && camWatch.badStreakMs >= th.l3){
      camWatch.alertLevel = 3;
      camFocusBuzz([500, 150, 500]);
      camSpeak(state, 3);
    } else if(camWatch.alertLevel >= 1 && camWatch.voiceOn &&
              (now2() - (camWatch.voiceLastAt || 0)) >= CAMVOICE_REPEAT_MS){
      // 人还没回来：每 20 秒再喊一遍，按当前级别的语气。屏幕上的提示他看不见，
      // 声音是唯一还能追到床上去的东西。
      camSpeak(state, camWatch.alertLevel);
    }
  }
  function now2(){ return Date.now(); }
  // 每隔 CAMWATCH_SAMPLE_MS 取一帧画到很小的离屏 canvas 上，跟上一帧比逐像素亮度差的平均值——
  // 数值很小说明画面基本没变，累计够久（且当前任务确实在计时中，不是暂停/结束状态）就提醒一次，
  // 提醒之间留够冷却时间，不连环打扰。这做不到真的"识别有没有在看手机"，只是最朴素的"有没有动静"。
  function camWatchSample(){
    if(!camWatch.enabled || !camWatch.videoEl || !camWatch.ctx) return;
    if(camWatch.videoEl.readyState < 2) return; // 还没有可读的一帧
    var now = Date.now();
    var dt = camWatch.lastSampleAt ? (now - camWatch.lastSampleAt) : CAMWATCH_SAMPLE_MS;
    camWatch.lastSampleAt = now;
    var w = camWatch.canvasEl.width, h = camWatch.canvasEl.height;
    var frame;
    try {
      camWatch.ctx.drawImage(camWatch.videoEl, 0, 0, w, h);
      frame = camWatch.ctx.getImageData(0, 0, w, h).data;
    } catch(e){ return; }
    var hadPrevFrame = !!camWatch.lastFrame; // 刚开摄像头那一次没有基准帧可比，不该天然算"安静"
    var avgDiff = 0;
    if(camWatch.lastFrame){
      var diffSum = 0, n = 0;
      for(var i = 0; i < frame.length; i += 4){ diffSum += Math.abs(frame[i] - camWatch.lastFrame[i]); n++; }
      avgDiff = n ? (diffSum / n) : 0;
    }
    camWatch.lastFrame = frame;
    var acct = getAcctData();
    var at = acct.activeTimer;
    var isRunning = !!(at && at.taskId === camWatch.taskId && at.runningSince);
    if(!isRunning){ camWatch.quietStreakMs = 0; } // 暂停/结束了不算"太安静"，本来就该没动静
    else if(avgDiff < CAMWATCH_DIFF_THRESHOLD){ camWatch.quietStreakMs += dt; }
    else { camWatch.quietStreakMs = 0; }
    // ---- 盯梢模式 ----
    // 先认识你的正常坐姿（只在真的计时中才校准，人没开始做事的时候采到的不算数），
    // 攒够 CAMFOCUS_CALIB_MS 之后才开始判走神。
    var metrics = camFocusAnalyze(frame, w, h);
    if(isRunning && (!camWatch.base || !camWatch.base.n)){
      camWatch.calibMs += dt;
      var acc = camWatch.base || (camWatch.base = { skin: 0, cx: 0, cy: 0, n: 0, sum: { skin: 0, cx: 0, cy: 0 }, cnt: 0 });
      acc.sum.skin += metrics.skin; acc.sum.cx += metrics.cx; acc.sum.cy += metrics.cy; acc.cnt++;
      if(camWatch.calibMs >= CAMFOCUS_CALIB_MS && acc.cnt > 0){
        acc.skin = acc.sum.skin / acc.cnt;
        acc.cx = acc.sum.cx / acc.cnt;
        acc.cy = acc.sum.cy / acc.cnt;
        acc.n = acc.cnt; // n 一旦不是0，就算校准完成、开始真判
        camWatch.state = 'ok';
      } else {
        camWatch.state = 'calib';
      }
    } else if(camWatch.base && camWatch.base.n){
      var st = camFocusJudge(metrics);
      // AI 刚刚明确判过"在看手机/人不在/趴着"，在它那一票的有效期内以 AI 为准。
      // 这两种恰恰是肤色法最容易漏的：人坐得端端正正，手机在桌沿底下。
      if(camWatch.aiOverrideState && now < (camWatch.aiOverrideUntil || 0)) st = camWatch.aiOverrideState;
      camWatch.state = st;
      camFocusTick(st, metrics, dt, isRunning);
    }
    // AI 看一眼：隔一阵子传一张压缩画面给自己的后端，让视觉模型判一次。
    // 它只做两件事——把判断结果写进状态行，以及在"模型说你在看手机/不在了"的时候把
    // 本机那套判断纠正过来。默认关着；失败了就当没这回事，本机那套照常跑。
    if(isRunning && camWatch.aiOn && backendOn('vision') && !camWatch.aiBusy &&
       (now - (camWatch.aiLastAt || 0)) >= CAMVISION_INTERVAL_MS){
      camWatch.aiLastAt = now;
      camVisionCheck();
    }
    // 专注时段统计的累计样本：只统计"计时中 + 真的有上一帧可比"的样本，判断口径跟上面
    // quietStreakMs 用的 isRunning/avgDiff 完全一致，只是多做个累加，供 stopCamWatch() 收尾时汇总。
    if(isRunning && hadPrevFrame){
      camWatch.totalSamples++;
      if(avgDiff < CAMWATCH_DIFF_THRESHOLD) camWatch.quietSamples++;
    }
    updateCamWatchStatusUI();
    if(isRunning && camWatch.quietStreakMs >= CAMWATCH_QUIET_THRESHOLD_MS && (now - camWatch.lastPromptAt) >= CAMWATCH_PROMPT_COOLDOWN_MS){
      camWatch.lastPromptAt = now;
      lcVoyagePrompt('画面好一会儿没什么动静了，还在吗？');
    }
  }
  // 把当前这一帧压成一张小 JPEG 交给后端的视觉模型。
  // 压到 320px 宽再发：够模型看清人在干嘛，又不至于把流量和函数时限吃光。
  async function camVisionCheck(){
    if(camWatch.aiBusy) return;
    var v = camWatch.videoEl;
    if(!v || !v.videoWidth) return;
    camWatch.aiBusy = true;
    try {
      var cw = 320, ch = Math.max(1, Math.round(cw * (v.videoHeight / v.videoWidth)));
      var c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      c.getContext('2d').drawImage(v, 0, 0, cw, ch);
      // 两条路：有自己的后端就走后端（便宜，可自动轮询）；
      // 没有就把这一帧直接交给 Claude（不用部署，但花你自己的额度，所以只在你点按钮时走）。
      var d = null, err = '';
      if(backendOn('vision')){
        camWatch.aiVia = 'backend';
        var dataUrl = c.toDataURL('image/jpeg', 0.6);
        var r = await backendCall('/api/vision', { image: dataUrl }, 40000);
        if(r.ok) d = r.data || {}; else err = r.error || '';
      } else if(sampleVisionOn()){
        camWatch.aiVia = 'sample';
        var blob = await new Promise(function(res){
          try { c.toBlob(res, 'image/jpeg', 0.6); } catch(e2){ res(null); }
        });
        if(!blob){ err = '这一帧取不出来'; }
        else {
          var s = await getSample();
          try {
            d = await s.json(CAMVISION_PROMPT, { images: blob, modelTier: 'quick', cache: false });
          } catch(e3){ err = sampleErrText(e3); }
        }
      } else {
        err = '现在没有能判断画面的通道';
      }
      if(!camWatch.enabled){ return; } // 这中间人已经把盯梢关了
      if(!d || typeof d !== 'object'){ camWatch.aiNote = 'AI 这次没看成：' + err; updateCamWatchStatusUI(); return; }
      camWatch.aiLast = d.state;
      camWatch.aiNote = CAMVISION_LABEL[d.state] || ('看不准（' + (d.note || '') + '）');
      // 模型明确说"在看手机/不在座位"的时候，直接把本机那套判断纠正过来——
      // 这正是肤色法最容易漏的两种：人坐得端端正正，手机在桌面下面。
      if(d.state === 'phone' || d.state === 'away' || d.state === 'slouch'){
        camWatch.aiOverrideState = (d.state === 'away') ? 'away' : (d.state === 'phone' ? 'turn' : 'down');
        // 这一票只管一阵子，到期自动作废——AI 看的是那一瞬间，不能拿它盖住后面所有帧
        camWatch.aiOverrideUntil = Date.now() + CAMVISION_INTERVAL_MS * 0.6;
      } else if(d.state === 'focused'){
        camWatch.aiOverrideState = ''; camWatch.aiOverrideUntil = 0;
      }
      updateCamWatchStatusUI();
    } catch(e){
      camWatch.aiNote = 'AI 这次没看成：' + String(e && e.message || e);
    } finally {
      camWatch.aiBusy = false;
      // 不管成没成，都要把按钮从"正在看…"放回来
      try { updateCamWatchStatusUI(); } catch(e4){}
    }
  }

  // 走神刚被判出来的那一刻，自动让 Claude 补看一眼，确认到底在干嘛。
  // 为什么要有预算上限：这一眼花的是你自己 Claude 账号的额度。一段盯梢最多 4 次、
  // 每次至少隔 90 秒——够覆盖真正走神的那几回，又不至于一个番茄钟烧掉十几张。
  // 后端在的时候整条路本来就在自动轮询（用你自己的 key，便宜），这里就不插手。
  var CAMVISION_AUTO_BUDGET = 4;
  var CAMVISION_AUTO_GAP_MS = 90000;
  function camVisionAutoConfirm(){
    if(!camWatch.autoAiOn || camWatch.aiBusy) return;
    if(backendOn('vision')) return;      // 后端那条路自己会轮询
    if(!sampleVisionOn()) return;        // 这个环境发不了图，就别费劲
    if(camWatch.autoAiUsed >= CAMVISION_AUTO_BUDGET) return;
    if((Date.now() - (camWatch.aiLastAt || 0)) < CAMVISION_AUTO_GAP_MS) return;
    camWatch.autoAiUsed++;
    camWatch.aiLastAt = Date.now();
    camWatch.aiNote = '让 Claude 确认一眼…（这段还剩 ' + (CAMVISION_AUTO_BUDGET - camWatch.autoAiUsed) + ' 次）';
    updateCamWatchStatusUI();
    camVisionCheck();
  }

  function updateCamWatchStatusUI(){
    var aiEl = document.getElementById('camWatchAiNote');
    if(aiEl) aiEl.textContent = camWatch.aiNote ? ('🤖 ' + camWatch.aiNote) : '';
    // 「看一眼」按钮在看的过程里要灰掉，免得连点几次白花额度
    var onceBtn = document.getElementById('camVisionOnceBtn');
    if(onceBtn){
      onceBtn.disabled = !!camWatch.aiBusy;
      onceBtn.textContent = camWatch.aiBusy ? '正在看…' : '👁 看一眼';
    }
    var el = document.getElementById('camWatchStatus');
    if(!el) return;
    if(camWatch.quietStreakMs >= 20000){
      // fmtDuration() 是按整分钟设计的，不到1分钟会显示成容易看错的"0分钟"——这里安静刚满20秒
      // 就要开始显示了，所以不到1分钟单独按"多少秒"讲，1分钟以上再交给 fmtDuration。
      var quietSec = Math.round(camWatch.quietStreakMs / 1000);
      var quietStr = quietSec < 60 ? (quietSec + '秒') : fmtDuration(Math.round(quietSec / 60));
      el.textContent = '😶 已经 ' + quietStr + ' 没什么动静了';
      el.classList.add('is-quiet');
    } else {
      el.textContent = '👀 画面正常';
      el.classList.remove('is-quiet');
    }
    // 盯梢模式那一行单独显示，跟上面"有没有动静"是两个独立的判断口径
    var se = document.getElementById('camWatchState');
    if(!se) return;
    var txt = '', cls = 'camwatch-state is-ok';
    if(!camWatch.base || !camWatch.base.n){
      txt = '🔍 正在认识你的坐姿…看着屏幕坐好';
      cls = 'camwatch-state is-calib';
    } else if(camWatch.state === 'away'){
      txt = '🚨 画面里找不到人'; cls = 'camwatch-state is-bad';
    } else if(camWatch.state === 'down'){
      txt = '🚨 像是低头了'; cls = 'camwatch-state is-bad';
    } else if(camWatch.state === 'turn'){
      txt = '🚨 头转开了'; cls = 'camwatch-state is-bad';
    } else {
      txt = '✅ 在状态' + (camWatch.caughtCount ? ('（这段被抓到 ' + camWatch.caughtCount + ' 次）') : '');
    }
    if(camWatch.badStreakMs >= 4000 && camWatch.state !== 'ok'){
      txt += ' · ' + Math.round(camWatch.badStreakMs / 1000) + '秒';
    }
    se.textContent = txt;
    se.className = cls;
  }
  // 开启：先申请摄像头权限，成功了才真的建离屏 video/canvas 开始取帧；用户拒绝/没有摄像头/
  // 浏览器不支持这几种情况都友好地留一句错误提示，不会抛出未捕获异常、也不会假装开启成功。
  function startCamWatch(){
    if(camWatch.enabled) return;
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      camWatch.error = '这个浏览器不支持调用摄像头';
      renderPomodoroView();
      return;
    }
    var acct = getAcctData();
    var at = acct.activeTimer;
    camWatch.taskId = at ? at.taskId : null;
    camWatch.error = '';
    var vowEl0 = document.getElementById('camWatchVow'); // 点开启那一刻把军令状原话收下来
    if(vowEl0) camWatch.vow = vowEl0.value.trim();
    navigator.mediaDevices.getUserMedia({ video: { width: 160, height: 120 }, audio: false }).then(function(stream){
      camWatch.stream = stream;
      camWatch.enabled = true;
      camWatch.lastFrame = null;
      camWatch.quietStreakMs = 0;
      camWatch.totalSamples = 0;
      camWatch.quietSamples = 0;
      camWatch.lastPromptAt = 0;
      camWatch.lastSampleAt = 0;
      // AI 那条线也每次重来：开关不记忆——每开一段盯梢，都要你重新点头才会往外发画面
      camWatch.aiOn = false; camWatch.aiBusy = false; camWatch.aiLastAt = 0;
      camWatch.aiLast = ''; camWatch.aiNote = ''; camWatch.aiVia = '';
      camWatch.aiOverrideState = ''; camWatch.aiOverrideUntil = 0;
      // 语音默认开着（你要的就是"人不在就喊我"），但每段重开都把额度用量清零
      camWatch.voiceOn = true; camWatch.voiceLastAt = 0; camWatch.voiceCount = 0;
      camWatch.autoAiOn = true; camWatch.autoAiUsed = 0;
      camSpeakStop();
      // 盯梢状态全部重来：每开一次都重新认识一遍坐姿，不沿用上一段的基准
      camWatch.base = null;
      camWatch.calibMs = 0;
      camWatch.state = 'calib';
      camWatch.badStreakMs = 0;
      camWatch.alertLevel = 0;
      camWatch.caughtCount = 0;
      camWatch.nagCount = 0;
      camWatch.okMs = 0;
      camWatch.badMs = 0;
      camWatch.videoEl = document.createElement('video');
      camWatch.videoEl.muted = true;
      camWatch.videoEl.playsInline = true;
      camWatch.videoEl.srcObject = stream;
      camWatch.videoEl.play().catch(function(){});
      camWatch.canvasEl = document.createElement('canvas');
      camWatch.canvasEl.width = 40;
      camWatch.canvasEl.height = 30;
      camWatch.ctx = camWatch.canvasEl.getContext('2d', { willReadFrequently: true });
      camWatch.timer = setInterval(camWatchSample, CAMWATCH_SAMPLE_MS);
      renderPomodoroView();
    }).catch(function(){
      camWatch.error = '没拿到摄像头权限，这个功能就先不开了';
      renderPomodoroView();
    });
  }
  function toggleCamWatch(){
    if(camWatch.enabled) stopCamWatch(); else startCamWatch();
    renderPomodoroView();
  }
  // 简化版摄像头监督的小组件：明确说清楚"只看画面有没有动静"，不是真的识别在不在看手机——
  // 呼应"发布出去的页面对额外下载的模型文件卡得很死"这个技术限制，这版本干脆不用任何
  // 第三方模型，只用摄像头原始画面本身，保证发布出去一定能跑。
  // ---------- 任务闯关：把"没做过的事"拆成一关一关 ----------
  // 计划里最容易拖的永远是没做过、不知道从哪下手的那种：整件事摆在眼前先把人劝退了，
  // 于是"等会儿再说"，等会儿更没劲。拆成一小步一小步，每次只看当前这一关，就没那么吓人。
  // 步骤从哪来：现在能稳的是"把教程文字贴进来自动拆"——B站简介和章节、小红书正文、
  // 公众号文章都是一行一步的现成结构。给个链接让程序自己去抓，得等有了自己的服务器才行，
  // 而且那几个平台反爬很严，不打包票，所以这一版不假装能做。
  var STEP_TEMPLATES = [
    { key: 'tutorial', name: '跟着教程学一个新东西', steps: [
      '先整段过一遍，只看不动手，心里有个轮廓',
      '把要用到的东西准备好（装软件/开账号/找资料）',
      '跟着做第一个最小的例子，能跑通就行',
      '照着教程做完主要部分',
      '合上教程，自己从头做一遍',
      '记下卡住过的地方和解决办法'
    ]},
    { key: 'problem', name: '做题 / 刷题', steps: [
      '先挑 3 道，别开整本',
      '第一道：自己算，卡住不超过 10 分钟',
      '对答案，把错的原因写一句',
      '第二、三道，同样流程',
      '把错题按"哪一步卡住"归个类'
    ]},
    { key: 'memorize', name: '背书 / 记忆', steps: [
      '先划出今天要背的范围，别贪多',
      '通读一遍，只求看懂不求记住',
      '盖住回忆一遍，想不起来就瞄一眼',
      '再盖住复述，直到能连着说下来',
      '隔一会儿再抽查一次'
    ]},
    { key: 'write', name: '写东西（论文/报告/文案）', steps: [
      '一句话写清楚这篇要说什么',
      '列出 3-5 个小标题当骨架',
      '每个小标题下先塞要点，不求成句',
      '把要点连成初稿，允许写得难看',
      '通读一遍改顺，最后再改错字'
    ]},
    { key: 'explore', name: '从零搞明白一个新概念/新工具', steps: [
      '用自己的话写下"我到底想弄明白什么"',
      '找 1 个讲得最清楚的来源，只看这一个',
      '看完合上，用大白话讲给自己听一遍',
      '找个最小的场景实际用一次',
      '补上第一遍没懂的地方'
    ]}
  ];
  // 行首的各种步骤标记：1. / 1、/（1）/ ① / 第一步 / 步骤2 / Step 3 / 视频时间戳 / 项目符号
  // 数字后面必须跟空白或非数字，避免把"3.5小时"这种也当成步骤号。
  var STEP_MARKER_RE = /^(?:\d{1,2}\s*[.、)）:：](?=\s|\D|$)|[（(]\s*\d{1,2}\s*[)）]|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫]|第[一二三四五六七八九十百\d]+步|步骤\s*\d+|Step\s*\d+|\d{1,2}:\d{2}|[-*•·]\s+)/i;
  function cleanStepText(line){
    return String(line)
      .replace(STEP_MARKER_RE, '')
      .replace(/^\s*[-–—:：、,，.]\s*/, '')
      .trim()
      .slice(0, 120);
  }
  // 把一段教程文字拆成步骤。三种情况：本来就一行一步（最常见）、纯多行、一整段话。
  function splitTutorialText(raw){
    if(!raw) return [];
    var text = String(raw).replace(/\r\n?/g, '\n').trim();
    if(!text) return [];
    var lines = text.split('\n').map(function(l){ return l.trim(); }).filter(Boolean);
    var marked = lines.filter(function(l){ return STEP_MARKER_RE.test(l); });
    var out;
    if(marked.length >= 2){
      // 有明确的步骤标记：没带标记的行是上一步的补充说明，并进去，不单独算一关
      out = [];
      lines.forEach(function(l){
        if(STEP_MARKER_RE.test(l) || !out.length) out.push(l);
        else out[out.length - 1] += ' ' + l;
      });
      var first = 0;
      while(first < out.length && !STEP_MARKER_RE.test(out[first])) first++; // 跳过开头的引子
      out = out.slice(first);
    } else if(lines.length >= 2){
      out = lines;
    } else {
      out = text.split(/[。；;!?！？]+/);
    }
    return out.map(cleanStepText)
              .filter(function(l){ return l.length >= 2; })
              .slice(0, 30); // 超过30关就不是拆解了，是另一份计划
  }
  function getTaskSteps(t){ return (t && Array.isArray(t.steps)) ? t.steps : []; }
  // 当前这一关 = 第一个还没过的；全过完返回 steps.length
  function currentStepIndex(steps){
    for(var i = 0; i < steps.length; i++){ if(!steps[i].done) return i; }
    return steps.length;
  }
  function makeSteps(texts){
    return texts.map(function(txt, i){
      return { id: 'st_' + Date.now().toString(36) + '_' + i + Math.random().toString(36).slice(2, 5), text: txt, done: false };
    });
  }

  // ===== 闯关：认真做就往前走，走神就停，做完点终点证明过关 =====
  // 一关从点【起点】开始、到点【终点】结束。这中间摄像头盯着你（那套是纯本地判断、不花额度、
  // V40/V41 就做好了）：在状态 okMs 往上涨＝往前走；一离座/低头/转头，okMs 立刻停住＝进度停。
  // 终点时看这一关到底专注了多少：
  //   · 摄像头开着 + 真专注够了 → 直接盖"真闯过"金旗，信你；
  //   · 没开摄像头、或过程里老走神 → 不让你光嘴说，要你补一句"做了什么、有什么收获"当证明才给过。
  // 全是运行时状态，不写账号数据；过关＝把这一关 step.done 置真（跟原来一样），外加一个可选的
  // via 标记（focus/report）决定旗子颜色，别的字段一个不碰。
  var pomoLeg = null;              // { taskId, stepIndex, okAtStart, badAtStart, active }
  var pomoLegProofOpen = false;
  var pomoLegProofText = '';
  function pomoLegFocus(){
    if(!pomoLeg || !pomoLeg.active) return { ok:0, bad:0, cam:false };
    return {
      ok: Math.max(0, (camWatch.okMs || 0) - pomoLeg.okAtStart),
      bad: Math.max(0, (camWatch.badMs || 0) - pomoLeg.badAtStart),
      cam: !!camWatch.enabled
    };
  }
  // 真专注够了才直接放行：摄像头开着、至少专注满 1 分钟、走神占比不超过三成
  function pomoLegFocusedEnough(){
    var f = pomoLegFocus();
    return f.cam && f.ok >= 60000 && (f.ok / Math.max(1, f.ok + f.bad)) >= 0.7;
  }
  function pomoQuestFlagRow(steps, curIdx){
    return '<div class="pq-flags">' + steps.map(function(s, i){
      var cls = s.done ? ('is-done' + (s.via === 'report' ? ' is-report' : '')) : (i === curIdx ? 'is-cur' : 'is-todo');
      return '<span class="pq-flag ' + cls + '" title="第' + (i+1) + '关">🚩</span>';
    }).join('') + '</div>';
  }
  function pomoClearLeg(via, report){
    var acct = getAcctData();
    var at = acct.activeTimer;
    if(!at) return;
    var tk = (acct.tasks || []).find(function(x){ return x.id === at.taskId; });
    if(!tk) return;
    var st = getTaskSteps(tk);
    var ci = currentStepIndex(st);
    if(ci >= st.length) return;
    st[ci].done = true;
    st[ci].via = via;                 // 新增可选字段：focus=专注真闯过 / report=补证过；只加不改别的
    saveAcctData(acct);
    if(report && typeof logPomoProgress === 'function') logPomoProgress('第' + (ci+1) + '关 · 补证：' + report);
    var n = ci + 1;
    pomoLeg = null; pomoLegProofOpen = false; pomoLegProofText = '';
    lcVoyagePrompt(via === 'focus'
      ? '🚩 第' + n + '关 · 真闯过！这一关是盯着专注拿下的'
      : '🚩 第' + n + '关 · 补证通过，记下了你说的收获');
    renderPomodoroView();
  }
  // 语音汇报：能用浏览器语音就转文字，用不了就老实让人打字，绝不假装录了
  function pomoStartDictation(btn){
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var box = document.getElementById('pqProofText');
    if(!SR){ alert('这个浏览器不支持语音输入，直接打字吧——一样算数。'); return; }
    try{
      var rec = new SR();
      rec.lang = 'zh-CN'; rec.interimResults = true; rec.continuous = false;
      var base = (box && box.value || '');
      if(btn){ btn.textContent = '🎤 在听…'; btn.classList.add('is-rec'); }
      rec.onresult = function(e){
        var txt = '';
        for(var k=0;k<e.results.length;k++){ txt += e.results[k][0].transcript; }
        if(box){ box.value = (base ? base + ' ' : '') + txt; pomoLegProofText = box.value; }
      };
      function reset(){ if(btn){ btn.textContent = '🎤 说给它听'; btn.classList.remove('is-rec'); } }
      rec.onerror = reset; rec.onend = reset;
      rec.start();
    }catch(e){ alert('语音输入起不来，直接打字吧。'); }
  }
  // 番茄钟计时页上的一条：计时的时候始终看得见当前这关，起点/终点都不用离开这一页
  function pomoQuestStripHtml(t){
    var steps = getTaskSteps(t);
    if(!steps.length) return '';
    var i = currentStepIndex(steps);
    if(i >= steps.length){
      return '<div class="pomo-quest-box">' + pomoQuestFlagRow(steps, i) +
        '<div class="pq-head"><span class="pq-n">🏁 ' + steps.length + ' 关全过了</span>' +
        '<button type="button" class="pq-map" id="pomoQuestOpen">看地图</button></div></div>';
    }
    var legActive = pomoLeg && pomoLeg.taskId === t.id && pomoLeg.active && pomoLeg.stepIndex === i;
    var h = '<div class="pomo-quest-box">' + pomoQuestFlagRow(steps, i) +
      '<div class="pq-head"><span class="pq-n">第 ' + (i+1) + ' / ' + steps.length + ' 关</span>' +
      '<button type="button" class="pq-map" id="pomoQuestOpen">看地图</button></div>' +
      '<p class="pq-name">' + escapeHtml(steps[i].text) + '</p>';
    if(pomoLegProofOpen && legActive){
      var micOn = ('webkitSpeechRecognition' in window) || ('SpeechRecognition' in window);
      h += '<div class="pq-proof">' +
        '<p class="pq-proof-q">这一关' + (pomoLegFocus().cam ? '过程里不太专注' : '没开摄像头盯') +
        '——别光说过了，<b>补一句你做了什么、有什么收获</b>就算过：</p>' +
        '<textarea id="pqProofText" rows="3" placeholder="比如：读完了前两节，搞懂了 XX 是怎么回事，还卡在 YY">' + escapeHtml(pomoLegProofText) + '</textarea>' +
        '<div class="pq-proof-acts">' +
        (micOn ? '<button type="button" class="btn btn-ghost btn-sm" id="pqProofMic">🎤 说给它听</button>' : '') +
        '<button type="button" class="btn btn-ghost btn-sm" id="pqProofCancel">再做会儿</button>' +
        '<button type="button" class="btn btn-primary btn-sm" id="pqProofSubmit">交证明 · 过关</button>' +
        '</div></div>';
    } else if(legActive){
      h += '<p class="pq-live" id="pomoLegLive">▶ 计时中</p>' +
        '<div class="pq-acts">' +
        '<button type="button" class="pq-giveup" id="pqLegGiveup">这关先不算</button>' +
        '<button type="button" class="btn btn-primary btn-sm" id="pqLegEnd">🏁 终点 · 这关过了</button>' +
        '</div>';
    } else {
      h += '<div class="pq-acts">' +
        '<button type="button" class="btn btn-primary btn-sm pq-start" id="pqLegStart">▶ 起点 · 开始这一关</button>' +
        '</div>' +
        '<p class="pq-tip">' + (camWatch.enabled
          ? '点起点，摄像头就盯着你——认真做进度往前走，离座/低头/玩手机就停下催你。'
          : '点起点开始。想让它盯着你认真做，把下面「摄像头盯梢」打开。') + '</p>';
    }
    return h + '</div>';
  }

  // ---- 闯关弹层：同一个壳子两种形态。没拆过 → 怎么拆；拆过了 → 关卡地图 ----
  var questTaskId = null, questSource = 'paste', questDraft = null; // questDraft 不为 null 就是在"拆解/编辑"态
  // 抓链接/AI拆 这条线的中间态。重画整块界面时要把粘贴框里的字留住，所以存在外面。
  var questPasteText = '', questFetchMsg = '';
  var questOverlay = document.getElementById('questOverlay');
  function questTask(){
    if(!questTaskId) return null;
    return (getAcctData().tasks || []).find(function(x){ return x.id === questTaskId; }) || null;
  }
  function openQuest(taskId, forceEdit){
    var acct = getAcctData();
    var t = (acct.tasks || []).find(function(x){ return x.id === taskId; });
    if(!t || !questOverlay) return;
    questTaskId = taskId;
    questSource = 'paste';
    questPasteText = ''; questFetchMsg = ''; // 换一条任务就清空上一条抓来的内容
    var steps = getTaskSteps(t);
    questDraft = (steps.length && !forceEdit) ? null : (forceEdit ? steps.map(function(s){ return s.text; }) : ['']);
    if(questDraft && !questDraft.length) questDraft = [''];
    questOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
    renderQuest();
  }
  function closeQuest(){
    if(questOverlay) questOverlay.hidden = true;
    document.body.style.overflow = '';
    questTaskId = null; questDraft = null;
  }
  function saveQuestSteps(texts){
    var acct = getAcctData();
    var t = (acct.tasks || []).find(function(x){ return x.id === questTaskId; });
    if(!t) return;
    var oldDone = {};
    getTaskSteps(t).forEach(function(s){ oldDone[s.text] = s.done; }); // 重新拆的时候，原文没变的那几关保留通关状态
    t.steps = makeSteps(texts);
    t.steps.forEach(function(s){ if(oldDone[s.text]) s.done = true; });
    saveAcctData(acct);
    questDraft = null;
    renderQuest();
    refreshAfterQuestChange();
  }
  function refreshAfterQuestChange(){
    // 任务卡片上的进度徽标、番茄钟页的当前关条，都要跟着更新——直接复用现成的
    // refreshCurrentView()：它会认出当前停在哪个板块并原地重画，不会跳回顶部。
    if(typeof refreshCurrentView === 'function') refreshCurrentView();
  }
  function questPreviewHtml(){
    var rows = questDraft.map(function(txt, i){
      return '<div class="quest-preview-row">' +
        '<span class="quest-preview-n">' + (i + 1) + '</span>' +
        '<input type="text" data-qi="' + i + '" value="' + escapeHtml(txt) + '" placeholder="这一关要做什么">' +
        '<button class="quest-preview-del" type="button" data-qdel="' + i + '" aria-label="删掉这关">✕</button>' +
      '</div>';
    }).join('');
    return '<div class="quest-preview">' + rows + '</div>' +
      '<div class="quest-foot">' +
        '<button type="button" data-qact="add">+ 再加一关</button>' +
        (getTaskSteps(questTask()).length ? '<button type="button" data-qact="cancel">不改了</button>' : '') +
      '</div>' +
      '<button class="btn btn-primary" type="button" data-qact="save" style="width:100%;margin-top:12px;">' +
        '🎮 开始闯关（' + questDraft.filter(function(x){ return x.trim(); }).length + ' 关）</button>';
  }
  function renderQuest(){
    var body = document.getElementById('questBody');
    var t = questTask();
    if(!body || !t) return;
    var titleEl = document.getElementById('questTitle');
    var subEl = document.getElementById('questSub');
    var steps = getTaskSteps(t);

    // ========== 形态一：拆解/编辑 ==========
    if(questDraft){
      if(titleEl) titleEl.textContent = '拆成小关';
      if(subEl) subEl.textContent = '《' + t.name + '》';
      var tabs = [['paste','📋 粘教程'],['tpl','🧩 用模板'],['manual','✍️ 自己写']];
      var html = '<div class="quest-source-tabs">' + tabs.map(function(x){
        return '<button type="button" data-qsrc="' + x[0] + '" class="' + (questSource === x[0] ? 'is-on' : '') + '">' + x[1] + '</button>';
      }).join('') + '</div>';
      if(questSource === 'paste'){
        // 接上后端之后，这里多一行"贴链接"：服务器去把正文抓回来，再让 AI 拆成一关一关。
        // 没接后端就还是老样子——自己复制粘贴 + 本地规则拆，一样能用。
        var linkRow = '';
        if(backendOn('extract')){
          linkRow = '<div class="quest-link-row">' +
              '<input type="url" id="questUrl" placeholder="粘个链接（B站视频、公众号文章、博客都行）">' +
              '<button class="btn btn-ghost btn-sm" type="button" data-qact="fetch">抓正文</button>' +
            '</div>' +
            '<p class="quest-link-msg" id="questLinkMsg">' + escapeHtml(questFetchMsg || '') + '</p>';
        }
        html += linkRow +
          '<textarea class="quest-paste" id="questPaste" placeholder="把教程的步骤贴进来——B站简介和章节列表、小红书正文、公众号文章都行，一行一步最好。&#10;&#10;例如：&#10;1. 先装依赖&#10;2. 改配置文件&#10;3. 重启服务">' + escapeHtml(questPasteText || '') + '</textarea>' +
          '<div class="quest-split-row">' +
            '<button class="btn btn-ghost btn-sm" type="button" data-qact="split">✂️ 本地拆</button>' +
            ((backendOn('ai') || sampleOn()) ? '<button class="btn btn-primary btn-sm" type="button" data-qact="aisplit">🤖 让 AI 拆</button>' : '') +
          '</div>' +
          '<p class="focus-stats-caveat" style="margin-top:8px;">' +
            (backendOn('extract')
              ? ('已经连上你自己的后端：链接能自己抓了。' + (backendOn('ai') ? 'AI 拆比按行拆聪明——它会把一段连着写的文字也拆成一步一步。' : '') +
                 '小红书、抖音这类站点挡服务器抓取，抓到空壳时会直接告诉你，那种就还是复制正文过来。')
              : '没连后端的时候抓不了链接：发布在 claude.ai 上的页面一律不许发对外请求。复制粘贴，一样快；想让它自己抓，去「我的」页把后端连上。') +
          '</p>';
      } else if(questSource === 'tpl'){
        html += '<div class="quest-tpl-list">' + STEP_TEMPLATES.map(function(tp, i){
          return '<button class="quest-tpl-btn" type="button" data-qtpl="' + i + '">' + escapeHtml(tp.name) +
            '<span>' + tp.steps.length + ' 关 · ' + escapeHtml(tp.steps[0]) + '…</span></button>';
        }).join('') + '</div>';
      }
      if(questSource === 'manual' || questDraft.some(function(x){ return x.trim(); })){
        html += questPreviewHtml();
      }
      body.innerHTML = DOMPurify.sanitize(html);
      var pasteEl = document.getElementById('questPaste');
      if(pasteEl) pasteEl.focus();
      return;
    }

    // ========== 形态二：闯关地图 ==========
    var idx = currentStepIndex(steps);
    var doneN = steps.filter(function(s){ return s.done; }).length;
    if(titleEl) titleEl.textContent = '🎮 ' + t.name;
    if(subEl) subEl.textContent = doneN >= steps.length ? '全部通关' : ('第 ' + (idx + 1) + ' 关 / 共 ' + steps.length + ' 关');

    var mapHtml = '<div class="quest-map">';
    steps.forEach(function(s, i){
      if(i) mapHtml += '<span class="quest-link' + (steps[i-1].done ? ' is-done' : '') + '"></span>';
      var cls = s.done ? 'is-done' : (i === idx ? 'is-now' : '');
      mapHtml += '<span class="quest-node ' + cls + '" title="' + escapeHtml(s.text) + '">' + (s.done ? '✓' : (i + 1)) + '</span>';
    });
    mapHtml += '</div>';

    var mainHtml;
    if(idx >= steps.length){
      mainHtml = '<div class="quest-clear"><h3>🏁 全部通关</h3><p>' + steps.length + ' 关一关没落。这件事你已经做过一遍了，下次就不是"没做过的事"了。</p></div>';
    } else {
      mainHtml = '<div class="quest-now">' +
        '<p class="quest-now-kicker">第 ' + (idx + 1) + ' 关</p>' +
        '<p class="quest-now-text">' + escapeHtml(steps[idx].text) + '</p>' +
        '<div class="quest-now-actions">' +
          '<button class="btn btn-primary btn-sm" type="button" data-qact="pass">✅ 这关过了</button>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-qact="skip">先跳过</button>' +
        '</div></div>';
    }
    body.innerHTML = DOMPurify.sanitize(mapHtml +
      '<p class="quest-progress">已过 <b>' + doneN + '</b> / ' + steps.length + ' 关</p>' +
      mainHtml +
      '<div class="quest-foot">' +
        (doneN > 0 ? '<button type="button" data-qact="back">← 退回上一关</button>' : '') +
        '<button type="button" data-qact="edit">编辑关卡</button>' +
        '<button type="button" data-qact="redo">重新拆</button>' +
      '</div>');
  }
  // 弹层里的交互统一走事件委托：内容每次都是整块重画的，一个个绑会漏
  if(questOverlay){
    questOverlay.addEventListener('click', function(e){
      var el = e.target.closest('[data-qsrc],[data-qtpl],[data-qact],[data-qdel]');
      if(!el){ if(e.target === questOverlay) closeQuest(); return; }
      var acct, t;
      if(el.hasAttribute('data-qsrc')){
        questSource = el.getAttribute('data-qsrc');
        if(questSource === 'manual' && !(questDraft || []).some(function(x){ return x.trim(); })) questDraft = [''];
        renderQuest(); return;
      }
      if(el.hasAttribute('data-qtpl')){
        var tp = STEP_TEMPLATES[parseInt(el.getAttribute('data-qtpl'), 10)];
        if(tp){ questDraft = tp.steps.slice(); renderQuest(); }
        return;
      }
      if(el.hasAttribute('data-qdel')){
        questDraft.splice(parseInt(el.getAttribute('data-qdel'), 10), 1);
        if(!questDraft.length) questDraft = [''];
        renderQuest(); return;
      }
      var act = el.getAttribute('data-qact');
      if(act === 'split'){
        var box = document.getElementById('questPaste');
        questPasteText = box ? box.value : '';
        var got = splitTutorialText(questPasteText);
        if(!got.length){ alert('没从这段文字里认出步骤——试试一行写一步，换"让 AI 拆"，或者换"自己写"手动加。'); return; }
        questDraft = got; renderQuest(); return;
      }
      // 贴链接 → 服务器去抓正文 → 填进粘贴框
      if(act === 'fetch'){
        var urlEl = document.getElementById('questUrl');
        var pBox = document.getElementById('questPaste');
        if(pBox) questPasteText = pBox.value;
        var u = (urlEl ? urlEl.value : '').trim();
        if(!/^https?:\/\//i.test(u)){ questFetchMsg = '⚠ 需要一个 http(s):// 开头的完整链接'; renderQuest(); return; }
        questFetchMsg = '正在抓…';
        renderQuest();
        (async function(){
          var r = await backendCall('/api/extract', { url: u }, 30000);
          if(!r.ok){ questFetchMsg = '✕ 抓失败：' + (r.error || '不知道为什么'); renderQuest(); return; }
          var d = r.data || {};
          if(d.thin || !(d.text || '').trim()){
            questFetchMsg = '✕ ' + (d.note || '这个页面抓不到正文，把内容复制粘贴到下面来');
            renderQuest(); return;
          }
          questPasteText = d.text;
          questFetchMsg = '✓ 抓到了 ' + d.chars + ' 字（' + (d.source || '网页') + '）' +
            (d.title ? ('：' + d.title) : '') + '——底下点"让 AI 拆"或者"本地拆"';
          renderQuest();
        })();
        return;
      }
      // 让真 AI 来拆——比按行拆聪明，能把一段连着写的文字也拆成一步一步
      if(act === 'aisplit'){
        var aBox = document.getElementById('questPaste');
        questPasteText = aBox ? aBox.value : '';
        if(!questPasteText.trim()){ questFetchMsg = '⚠ 先粘点内容进来，或者上面贴个链接抓一下'; renderQuest(); return; }
        var qt = questTask();
        questFetchMsg = '🤖 AI 正在拆…';
        renderQuest();
        (async function(){
          var st = [];
          // 先走自己的后端
          if(backendOn('ai')){
            var r = await backendCall('/api/ask-ai', {
              mode: 'steps',
              question: '任务是《' + (qt ? qt.name : '') + '》，把下面这段教程拆成一关一关，让我能一步步照着做。',
              context: questPasteText
            }, 60000);
            if(r.ok && r.data && (r.data.steps || []).length) st = r.data.steps;
          }
          // 没后端（或后端没成）→ 直接问 Claude。拆关卡不需要上网，这条路效果一样好。
          if(!st.length && sampleOn()){
            var arr = await askClaudeJson(
              '把下面这段教程拆成"一关一关"的小步骤，给一个迟迟不敢开始的人用。规则：' +
              '每关是一个具体动作不是话题；每关一句话 20 字以内；从最容易的开始，第一关必须 5 分钟内能做完；总共 4-10 关。' +
              '只输出一个 JSON 字符串数组，形如 ["第一关的动作","第二关的动作"]，不要输出别的字。\n\n' +
              '任务是《' + (qt ? qt.name : '') + '》。教程内容：\n' + questPasteText.slice(0, 8000)
            );
            if(Array.isArray(arr)){
              st = arr.map(function(x){ return typeof x === 'string' ? x : (x && (x.text || x.title || x.step) || ''); })
                      .map(function(s){ return String(s).trim(); })
                      .filter(Boolean).slice(0, 12);
            }
          }
          if(!st.length){ questFetchMsg = '✕ AI 这次没拆出关卡来，点"本地拆"顶一下'; renderQuest(); return; }
          questFetchMsg = '✓ AI 拆成了 ' + st.length + ' 关，底下能改能删';
          questDraft = st;
          renderQuest();
        })();
        return;
      }
      if(act === 'add'){ questDraft.push(''); renderQuest(); return; }
      if(act === 'cancel'){ questDraft = null; renderQuest(); return; }
      if(act === 'save'){
        var texts = questDraft.map(function(x){ return x.trim(); }).filter(Boolean);
        if(!texts.length){ alert('至少留一关吧。'); return; }
        saveQuestSteps(texts); return;
      }
      if(act === 'edit' || act === 'redo'){
        var cur = getTaskSteps(questTask());
        questDraft = act === 'edit' ? cur.map(function(s){ return s.text; }) : [''];
        questSource = act === 'edit' ? 'manual' : 'paste';
        renderQuest(); return;
      }
      if(act === 'pass' || act === 'skip' || act === 'back'){
        acct = getAcctData();
        t = (acct.tasks || []).find(function(x){ return x.id === questTaskId; });
        if(!t) return;
        var steps = getTaskSteps(t);
        var i = currentStepIndex(steps);
        if(act === 'back'){
          for(var k = steps.length - 1; k >= 0; k--){ if(steps[k].done){ steps[k].done = false; break; } }
        } else if(i < steps.length){
          steps[i].done = true;
          steps[i].skipped = (act === 'skip'); // 跳过的也算过关，但记一笔，免得自己骗自己
        }
        saveAcctData(acct);
        renderQuest();
        refreshAfterQuestChange();
        if(act === 'pass' && currentStepIndex(getTaskSteps(t)) >= steps.length) camFocusBuzz([120, 60, 120]);
      }
    });
    questOverlay.addEventListener('input', function(e){
      if(e.target && e.target.hasAttribute('data-qi') && questDraft){
        questDraft[parseInt(e.target.getAttribute('data-qi'), 10)] = e.target.value;
      }
    });
  }
  var questCloseBtn = document.getElementById('questClose');
  if(questCloseBtn) questCloseBtn.addEventListener('click', closeQuest);
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && questOverlay && !questOverlay.hidden) closeQuest();
  });

  // 结束航点那一屏上的"这次专注成绩"。只有真开了盯梢、且判够时长才出现——
  // 没开摄像头的航段什么都不显示，不硬塞一个空壳进去。
  function focusScoreHtml(taskId){
    var s = lastFocusSummary;
    if(!s || s.taskId !== taskId || (Date.now() - s.at) > 10 * 60000) return '';
    var pct = Math.round(s.focusRate * 100);
    // fmtDuration() 是按整分钟设计的，不到1分钟会显示成容易看错的"0分钟"、四舍五入还会把
    // 4秒和34秒都写成"1分钟"（自相矛盾）。这里跟摄像头状态行同一个办法：不足1分钟按秒讲。
    function span(ms){
      var sec = Math.round(ms / 1000);
      return sec < 60 ? (sec + '秒') : fmtDuration(Math.round(sec / 60));
    }
    var tier = pct >= 85 ? 'is-good' : (pct >= 60 ? 'is-mid' : 'is-low');
    var verdict = pct >= 85 ? '这一段你是真坐住了。'
      : (pct >= 60 ? '中间跑了几趟，整体还算稳。' : '这一段溜号占了不少，下次盯紧点。');
    var bits = ['真正在状态 <b>' + span(s.okMs) + '</b>'];
    if(s.badMs >= 1000) bits.push('溜号 ' + span(s.badMs));
    var times = s.caughtCount + s.nagCount;
    if(times > 0) bits.push('被叫回来 ' + times + ' 次');
    return '<div class="focus-score ' + tier + '">' +
      '<div class="focus-score-pct">' + pct + '%</div>' +
      '<div class="focus-score-body">' +
        '<p class="focus-score-line">' + bits.join(' · ') + '</p>' +
        '<p class="focus-score-verdict">' + verdict + '</p>' +
      '</div>' +
    '</div>';
  }
  function camWatchStrictHtml(){
    var opts = [['soft', '温和'], ['normal', '严格'], ['hard', '军令状']];
    return '<div class="camwatch-strict">' + opts.map(function(o){
      return '<button type="button" data-strict="' + o[0] + '" class="' + (camWatch.strict === o[0] ? 'is-on' : '') + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  // AI 看画面：整套东西里唯一会把画面传出这台设备的功能，所以默认关着，
  // 开关就摆在这儿，旁边一句话说清楚代价，不藏在设置深处。
  // 语音提醒的开关。默认开着——人跑去床上躺着的时候，屏幕上弹什么都没用。
  // 这一项全在本机合成，不联网、不花额度，所以不像"发画面出去"那样需要每段重新点头。
  function camVoiceToggleHtml(){
    var can = false;
    try { can = !!(window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function'); } catch(e){}
    if(!can){
      return '<p class="camwatch-ai-note">🔇 你这个浏览器不支持语音合成，喊不出声——提醒还是会弹在屏幕上。</p>';
    }
    return '<label class="camwatch-ai-row">' +
      '<input type="checkbox" id="camVoiceToggle"' + (camWatch.voiceOn ? ' checked' : '') + '>' +
      '<span><b>🔊 人不在就出声喊我</b>' +
      '<em>判出你离开座位／低头刷手机／趴着发呆，就<u>念出来</u>，而不是只弹个屏幕提示——你跑床上躺着的时候看不见屏幕。' +
      '越久越急：先正常说，再提高语速，最后压着嗓子催，<b>人不回来每 20 秒再喊一遍</b>，一回到画面里立刻闭嘴。' +
      '全在这台设备上合成，不联网、不花额度。<b>戴耳机的话记得音量别静音。</b></em></span></label>' +
      '<button class="btn btn-ghost btn-sm" type="button" id="camVoiceTestBtn">🔊 试一句</button>';
  }
  function camVisionToggleHtml(){
    // 有自己的后端：保持原来的自动模式，勾上就每隔一阵子自己看一次。
    if(backendOn('vision')){
      return '<label class="camwatch-ai-row">' +
        '<input type="checkbox" id="camVisionToggle"' + (camWatch.aiOn ? ' checked' : '') + '>' +
        '<span><b>让 AI 看一眼（更准）</b>' +
        '<em>每 ' + Math.round(CAMVISION_INTERVAL_MS / 1000) + ' 秒把一张压缩过的画面发到<u>你自己那台后端</u>，' +
        '交给视觉模型判断你是在做事还是在看手机。比靠肤色位置猜准得多，代价是画面会离开这台设备——' +
        '不开就完全不发，跟以前一样全在本机算。</em></span></label>' +
        '<p class="camwatch-ai-note" id="camWatchAiNote">' + (camWatch.aiNote ? ('🤖 ' + escapeHtml(camWatch.aiNote)) : '') + '</p>';
    }
    // 没有后端，但这个环境能把图片递给 Claude：做成手动一次一张。
    // 不做自动轮询是故意的——这条路花的是你自己 Claude 账号的额度，定时烧不起。
    if(sampleVisionOn()){
      return '<div class="camwatch-ai-row">' +
        '<span><b>让 Claude 看一眼</b>' +
        '<em>点一下，把<u>当前这一帧</u>压到 320 像素宽交给 Claude，判一次你是在做事还是在看手机。' +
        '不用部署、不用密钥。两个代价说清楚：画面会离开这台设备；每点一次花的是你自己 Claude 账号的额度——' +
        '所以做成手动点，<b>不自动、不定时</b>。不点就一张都不发。</em></span>' +
        '<button class="btn btn-ghost btn-sm" type="button" id="camVisionOnceBtn"' +
        (camWatch.aiBusy ? ' disabled' : '') + '>' + (camWatch.aiBusy ? '正在看…' : '👁 看一眼') + '</button></div>' +
        '<label class="camwatch-ai-row">' +
        '<input type="checkbox" id="camAutoAiToggle"' + (camWatch.autoAiOn ? ' checked' : '') + '>' +
        '<span><b>走神的那一刻自动补看一眼</b>' +
        '<em>本机那套只看肤色和位置，分不清「低头在看书」和「低头在刷手机」。勾上之后，' +
        '每次判出走神的<u>那一刻</u>自动让 Claude 确认一次，判错就不冤枉你。' +
        '<b>一段盯梢最多 ' + CAMVISION_AUTO_BUDGET + ' 次、每次至少隔 ' +
        Math.round(CAMVISION_AUTO_GAP_MS / 1000) + ' 秒</b>——花的是你自己 Claude 的额度，所以给它封了顶。' +
        '这段已用 ' + camWatch.autoAiUsed + '／' + CAMVISION_AUTO_BUDGET + ' 次。</em></span></label>' +
        '<p class="camwatch-ai-note" id="camWatchAiNote">' + (camWatch.aiNote ? ('🤖 ' + escapeHtml(camWatch.aiNote)) : '') + '</p>';
    }
    return '';
  }
  function camWatchWidgetHtml(){
    if(camWatch.enabled){
      return '<div class="camwatch-widget">' +
        '<p class="camwatch-state is-calib" id="camWatchState">🔍 正在认识你的坐姿…看着屏幕坐好</p>' +
        '<p class="camwatch-status" id="camWatchStatus">👀 画面正常</p>' +
        '<video class="camwatch-preview" id="camWatchPreview" autoplay muted playsinline></video>' +
        camVoiceToggleHtml() +
        camVisionToggleHtml() +
        camWatchStrictHtml() +
        '<button class="btn btn-ghost btn-sm" type="button" id="camWatchToggleBtn">🛑 关闭盯梢</button>' +
        '<p class="camwatch-hint">判断只在本机算：先花十几秒记住你正常坐着的样子，之后一旦人不见了、明显低头或者转头，就按上面选的强度催你——温和只提示一次，军令状会全屏拦住你。画面本身不上传、不保存，关掉或离开这页会自动断掉摄像头；结束时只存一个"这段有多专注"的汇总数字，供数据档案看时段规律。</p>' +
      '</div>';
    }
    return '<div class="camwatch-widget">' +
      '<textarea class="camwatch-vow" id="camWatchVow" rows="2" maxlength="60" placeholder="写一句军令状，走神被抓到时会怼到你脸上（选填）">' + escapeHtml(camWatch.vow || '') + '</textarea>' +
      camWatchStrictHtml() +
      '<button class="btn btn-ghost btn-sm" type="button" id="camWatchToggleBtn">📷 开启摄像头盯梢</button>' +
      '<p class="camwatch-hint">开了之后摄像头会盯着你：人离开画面、低头看手机、转头发呆都会被抓到，越拖催得越狠——军令状档会直接全屏把你拦住。需要摄像头权限，画面全程只在这台设备上算，不上传也不保存。</p>' +
      (camWatch.error ? ('<p class="camwatch-error">' + escapeHtml(camWatch.error) + '</p>') : '') +
    '</div>';
  }
  // 点击任务盖"已抵达"章：纯装饰性浮层，不影响 toggleTaskDone 本身的同步执行时序，
  // 只在"变成已完成"这个方向触发（取消勾选不盖章）。
  function lcStampArrived(el){
    if(!el || !el.getBoundingClientRect) return;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduceMotion) return;
    var rect = el.getBoundingClientRect();
    var stamp = document.createElement('div');
    stamp.className = 'lc-stamp';
    stamp.textContent = '已抵达';
    stamp.style.left = (rect.left + rect.width / 2) + 'px';
    stamp.style.top = (rect.top + rect.height / 2) + 'px';
    document.body.appendChild(stamp);
    requestAnimationFrame(function(){ stamp.classList.add('is-stamped'); });
    setTimeout(function(){ stamp.classList.add('is-leaving'); }, 480);
    setTimeout(function(){ if(stamp.parentNode) stamp.parentNode.removeChild(stamp); }, 680);
  }
  // 机动托盘拖动换位置：只对带 data-drag 的条目生效（showRank 的那批——没排时间、按序号排优先级的
  // 待安排任务），落点算法直接复用 reorderBufferTask，不重新发明一套排序逻辑。
  function initBufferDragReorder(root){
    if(!root) return;
    var items = Array.prototype.slice.call(root.querySelectorAll('.app-task-list-buffer > .app-task[data-drag="1"]'));
    if(!items.length) return;
    var draggedId = null;
    function clearDropMarks(){ items.forEach(function(x){ x.classList.remove('is-drop-before', 'is-drop-after'); }); }
    items.forEach(function(li){
      li.addEventListener('dragstart', function(e){
        draggedId = li.getAttribute('data-id');
        li.classList.add('is-dragging');
        if(e.dataTransfer){
          e.dataTransfer.effectAllowed = 'move';
          try{ e.dataTransfer.setData('text/plain', draggedId || ''); }catch(err){}
        }
      });
      li.addEventListener('dragend', function(){
        li.classList.remove('is-dragging');
        clearDropMarks();
        draggedId = null;
      });
      li.addEventListener('dragover', function(e){
        if(!draggedId || draggedId === li.getAttribute('data-id')) return;
        e.preventDefault();
        var rect = li.getBoundingClientRect();
        var before = (e.clientY - rect.top) < rect.height / 2;
        clearDropMarks();
        li.classList.add(before ? 'is-drop-before' : 'is-drop-after');
      });
      li.addEventListener('drop', function(e){
        e.preventDefault();
        var id = draggedId;
        clearDropMarks();
        if(!id || id === li.getAttribute('data-id')) return;
        var rect = li.getBoundingClientRect();
        var before = (e.clientY - rect.top) < rect.height / 2;
        var targetIdx = items.indexOf(li);
        var newRank = before ? (targetIdx + 1) : (targetIdx + 2);
        reorderBufferTask(id, newRank);
      });
    });
  }
  // 四象限用：重要/紧急各自是独立开关，第一次点其中一个的时候把另一个也补成 false，
  // 这样这条任务就从"待分类"里出来、落进四个象限之一，之后随时能再点开关改。
  function toggleTaskImportant(id){
    var acct = getAcctData();
    var t = acct.tasks.find(function(x){ return x.id === id; });
    if(!t) return;
    if(typeof t.urgent !== 'boolean') t.urgent = false;
    t.important = !t.important;
    saveAcctData(acct);
    refreshCurrentView();
  }
  function toggleTaskUrgent(id){
    var acct = getAcctData();
    var t = acct.tasks.find(function(x){ return x.id === id; });
    if(!t) return;
    if(typeof t.important !== 'boolean') t.important = false;
    t.urgent = !t.urgent;
    saveAcctData(acct);
    refreshCurrentView();
  }
  function toggleTaskDelegated(id){
    var acct = getAcctData();
    var t = acct.tasks.find(function(x){ return x.id === id; });
    if(!t) return;
    t.isDelegated = !t.isDelegated;
    saveAcctData(acct);
    refreshCurrentView();
  }

  // 序号输入框：把这条任务插到"待安排"列表里的第 n 位，其他任务自动顺延（插队，不是简单交换）。
  // 这就是"左边可以填序号，排错了、想把第3个改成第2重要"那个需求的落地方式。
  function reorderBufferTask(id, n){
    var acct = getAcctData();
    var t = acct.tasks.find(function(x){ return x.id === id; });
    if(!t) return;
    var siblings = acct.tasks
      .filter(function(x){ return x.date === t.date && !x.done && typeof x.startMinutes !== 'number'; })
      .sort(function(a, b){ return a.order - b.order; });
    var from = siblings.indexOf(t);
    if(from === -1) return;
    siblings.splice(from, 1);
    var to = Math.max(0, Math.min(n - 1, siblings.length));
    siblings.splice(to, 0, t);
    siblings.forEach(function(x, i){ x.order = i + 1; });
    saveAcctData(acct);
    refreshCurrentView();
  }

  // "AI计划生成"：把"待安排"里还没有时间、已经按左侧序号排好优先级的任务，依次塞进这一天时间轴上空着的位置。
  // 已经手动排好时间的任务不会被挪动——这个按钮只负责帮你把"还没想好几点做"的任务安排出具体时间。
  // 今天就从"现在"这一刻往后找空位；排到超过这一天可投入的时长就先停在"待安排"里，不会硬超时硬塞。
  // excludeId 可选——卡壳检查点"先搁置"那条路径专用：刚被搁置的任务这一刻也符合"待安排"条件，
  // 如果不排除它，它大概率会被立刻重新排回今天（尤其它本来就没别的任务跟它抢位置的时候），
  // "先搁置"就变得形同虚设。原来的"AI计划生成"按钮调用不传第二个参数，行为完全不受影响。
  // ===== 自动排程：系统负责排，不是只给建议 =====
  // 你只管说"有什么作业、什么时候交、这活是主要还是杂事"，排在几点由这里决定。
  // 一条任务排在哪，看三件事，按这个先后：
  //   1) 截止时间——越近越先排；已经逾期的排最前
  //   2) 分量——主要的活往你的高精力钟点塞，杂事让开高精力
  //   3) 你自己在"待安排"里写的第几重要——前两项打平时才用它
  // 只动"AI排的"任务；你手动挑过时间的、已经做完的，一概不碰。
  // 今天塞不下的按优先级从低往高挤回"待安排"，并在报告里说清楚挤掉了谁、为什么。
  // 没有分量/截止/精力数据的老账号，这套会自动退化成原来那套"按序号从早往晚顺着排"，行为不变。
  var lastPlanReport = null;

  var PLAN_URGENCY_STEPS = [
    { h: 24,     score: 1000, why: '24小时内就要交' },
    { h: 48,     score: 600,  why: '明天就要交' },
    { h: 24 * 7, score: 300,  why: '一周内到期' }
  ];
  function planUrgency(t){
    var h = dueHoursLeft(t);
    if(h === null) return { score: 0, why: '' };
    if(h < 0) return { score: 1400, why: '已经逾期' };
    for(var i = 0; i < PLAN_URGENCY_STEPS.length; i++){
      if(h <= PLAN_URGENCY_STEPS[i].h) return { score: PLAN_URGENCY_STEPS[i].score, why: PLAN_URGENCY_STEPS[i].why };
    }
    return { score: 120, why: '有截止日期' };
  }
  function planPriority(t){
    // order 只做平手时的微调，最多拉开 90 分，永远压不过"分量"差的 100 分
    return planUrgency(t).score + weightRank(t) * 100 - Math.min(90, Math.max(0, t.order || 0));
  }
  // 分量 × 钟点档位的匹配分：主要的活最想要高精力，杂事最不该占着高精力
  var PLAN_FIT = {
    heavy: { high: 3, mid: 2, low: 0, unknown: 1 },
    mid:   { high: 1, mid: 3, low: 2, unknown: 1 },
    light: { high: 0, mid: 1, low: 3, unknown: 1 }
  };
  function planFitScore(wKey, tiers, start, mins){
    var total = 0, n = 0;
    for(var m = start; m < start + mins; m += 60){
      total += PLAN_FIT[wKey][energyTierOfHour(tiers, Math.floor(m / 60) % 24)];
      n++;
    }
    return n ? (total / n) : 0;
  }
  // 这条任务当天几点之前必须做完——只在"截止日就是这一天"的时候才卡
  function planDueCapMinutes(t, dateKey){
    if(!t.dueDate || t.dueDate !== dateKey) return null;
    var m = (typeof t.dueTime === 'string') ? parseClockToMinutes(t.dueTime) : null;
    return (m === null) ? 1439 : m;
  }

  // ===== 今天塞不下的，往后面几天找位置 =====
  // 原来的行为是：今天排满了 → 挤回"待安排" → 就烂在那儿了。你那条《Agent设计》就是这么过期的。
  // 现在多走一步：挨着往后看几天，哪天放得下就放哪天，并且告诉你落在了哪天。
  // 三条硬规矩，一条都不破：
  //   1) 绝不排到截止日之后——宁可留在"待安排"，也不替你做"反正要晚交"这个决定
  //   2) 只动本来就要被挤掉的那几条；能排进今天的、你手动挑过时间的，一个字段都不碰
  //   3) 只写 date / startMinutes / aiScheduled 三个字段，别的一概不动
  var PLAN_SPILL_DAYS = 6;      // 最多往后看六天，再远就没意义了
  var PLAN_SPILL_DEFAULT_HOURS = 4;
  // 未来那天你还没填"今天能投入几小时"，拿你最近填过的中位数当假设——
  // 这只是排程时的假设，绝不会替你把 dailyHours 写进去（那是你自己该回答的问题）。
  function planFallbackHours(acct){
    var vals = Object.keys(acct.dailyHours || {}).sort().slice(-14)
      .map(function(k){ return Number(acct.dailyHours[k]); })
      .filter(function(n){ return n > 0; });
    if(!vals.length) return PLAN_SPILL_DEFAULT_HOURS;
    vals.sort(function(a, b){ return a - b; });
    return vals[Math.floor(vals.length / 2)];
  }
  function shiftDateKey(key, days){
    var p = String(key).split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // 在某一天的空当里找一段放得下的位置。纯计算，不写任何数据。
  function planFindSlot(mins, wKey, occupied, gapMin, tiers, earliest, cap){
    var best = null;
    for(var s = earliest; s + mins <= TIMELINE_END_MIN; s += 5){
      var clash = null;
      for(var i = 0; i < occupied.length; i++){
        var o = occupied[i];
        if(s < o.end + gapMin && o.start - gapMin < s + mins){ clash = o; break; }
      }
      if(clash){ s = Math.max(s, clash.end + gapMin - 5); continue; }
      if(cap !== null && s + mins > cap) continue; // 未来那天排到截止点之后＝没排，直接不要
      var fit = planFitScore(wKey, tiers, s, mins);
      var sc = fit * 1000 - s;
      if(!best || sc > best.sc) best = { sc: sc, start: s, fit: fit };
    }
    return best;
  }
  function planSpillover(acct, bumped, fromDateKey, tiers, gapMin){
    var spilled = [], stillStuck = [];
    var fallback = planFallbackHours(acct);
    var cache = {}; // dateKey -> { occupied, usedMin, budgetMin, assumed }
    function dayState(k){
      if(cache[k]) return cache[k];
      var hrs = acct.dailyHours[k];
      var assumed = (hrs === undefined);
      var occ = acct.tasks
        .filter(function(t){ return t.date === k && !t.done && typeof t.startMinutes === 'number'; })
        .map(function(t){ return { start: t.startMinutes, end: t.startMinutes + (t.plannedMinutes || t.estMinutes || 30) }; })
        .sort(function(a, b){ return a.start - b.start; });
      cache[k] = {
        occupied: occ,
        usedMin: occ.reduce(function(s, o){ return s + (o.end - o.start); }, 0),
        budgetMin: (assumed ? fallback : Number(hrs)) * 60,
        assumed: assumed
      };
      return cache[k];
    }
    bumped.forEach(function(bp){
      var t = (acct.tasks || []).find(function(x){ return x.id === bp.id; });
      if(!t){ stillStuck.push(bp); return; }
      var mins = t.plannedMinutes || t.estMinutes || 30;
      var wKey = weightOf(t);
      var placedOn = null;
      for(var d = 1; d <= PLAN_SPILL_DAYS; d++){
        var k = shiftDateKey(fromDateKey, d);
        // 铁规矩：绝不排到截止日之后
        if(t.dueDate && k > t.dueDate) break;
        var st = dayState(k);
        if(st.usedMin + mins > st.budgetMin) continue;
        var cap = (t.dueDate === k)
          ? ((typeof t.dueTime === 'string' && parseClockToMinutes(t.dueTime) !== null) ? parseClockToMinutes(t.dueTime) : 1439)
          : null;
        var slot = planFindSlot(mins, wKey, st.occupied, gapMin, tiers, 480, cap);
        if(!slot) continue;
        t.date = k;
        t.startMinutes = slot.start;
        t.aiScheduled = true;
        st.occupied.push({ start: slot.start, end: slot.start + mins });
        st.occupied.sort(function(a, b){ return a.start - b.start; });
        st.usedMin += mins;
        placedOn = { id: t.id, name: t.name, dateKey: k, daysOut: d, start: slot.start, mins: mins,
                     weight: wKey, assumedHours: st.assumed ? (st.budgetMin / 60) : null,
                     dueDate: t.dueDate || '' };
        break;
      }
      if(placedOn) spilled.push(placedOn);
      else {
        // 没往后放成，原因要说准——"截止日卡着"和"后面几天也满了"是两件不同的事
        var why = (t.dueDate && t.dueDate <= fromDateKey)
          ? '往后放就超过截止日了（' + t.dueDate + '），这个我不敢替你决定——要么在警钟里把截止日改一改，要么今天挤掉点别的'
          : bp.reason + '；往后 ' + PLAN_SPILL_DAYS + ' 天也没找着放得下的空当';
        stillStuck.push({ id: bp.id, name: bp.name, weight: bp.weight, hadTime: bp.hadTime, reason: why });
      }
    });
    return { spilled: spilled, stillStuck: stillStuck };
  }

  function planDay(dateKey, opts){
    opts = opts || {};
    var acct = getAcctData();
    var hours = acct.dailyHours[dateKey];
    if(hours === undefined) return null;
    var budgetMin = hours * 60;
    var isToday = dateKey === todayKey();
    var tiers = computeEnergyTiers(acct);
    // 任务间缓冲：账号自己在"我的"页设置的分钟数（默认12）——自动排的任务之间、以及跟已经占用的
    // 时间段之间都留这段间隔；不计入预算 usedMin（usedMin 仍然只是任务本身时长之和）。
    var gapMin = Math.max(0, Number(acct.taskGapMinutes) || 0);
    var earliestStart = isToday ? Math.max(TIMELINE_START_MIN, roundUpMinutes(minutesSinceMidnight(new Date()), 5)) : 480;

    var dayTasks = acct.tasks.filter(function(t){ return t.date === dateKey; });
    // 要排的队列：没做完，并且（还没有时间 或者 这条时间本来就是"AI排的"、允许重排）
    var queue = dayTasks.filter(function(t){
      if(t.done || t.id === opts.excludeId) return false;
      if(typeof t.startMinutes !== 'number') return true;
      return !!(opts.release && t.aiScheduled);
    });
    // 谁本来就排着时间，记在外面的小本子上——绝不往任务对象上挂临时字段，免得哪天被顺手存进去
    var inQueue = {}, hadTimeMap = {};
    queue.forEach(function(t){ inQueue[t.id] = 1; hadTimeMap[t.id] = (typeof t.startMinutes === 'number'); });
    // 钉死不动的：你手动排的时间、以及已完成的任务——已完成的也要算占用，它就明明白白
    // 摆在时间轴那个位置上，新排的不能跟它重叠。
    var occupied = dayTasks
      .filter(function(t){ return typeof t.startMinutes === 'number' && !inQueue[t.id]; })
      .map(function(t){ return { start: t.startMinutes, end: t.startMinutes + t.plannedMinutes }; })
      .sort(function(a, b){ return a.start - b.start; });
    var usedMin = occupied.reduce(function(s, o){ return s + (o.end - o.start); }, 0);

    queue.sort(function(a, b){
      var d = planPriority(b) - planPriority(a);
      if(d) return d;
      return (a.order || 0) - (b.order || 0);
    });

    var placed = [], bumped = [];
    queue.forEach(function(t){
      var mins = t.plannedMinutes || t.estMinutes || 30;
      var hadTime = !!hadTimeMap[t.id];
      function drop(reason){
        // 本来就没排时间的任务，一个字段都不动——它继续安安静静待在"待安排"里，
        // 跟升级之前的行为完全一致（老任务不会因为点了一次排程就凭空长出 startMinutes）
        if(hadTime){ t.startMinutes = null; delete t.aiScheduled; }
        bumped.push({ id: t.id, name: t.name, weight: weightOf(t), hadTime: hadTime, reason: reason });
      }
      if(usedMin + mins > budgetMin){ drop('今天定的 ' + hours + ' 小时已经排满了'); return; }
      var cap = planDueCapMinutes(t, dateKey);
      var wKey = weightOf(t);
      // 精力匹配和"早点开始"这两件事谁更重要，看急不急：
      // 48 小时内要交的，早开始压倒一切，精力匹配只当微调（差一档≈让一小时）；
      // 不急的活反过来，宁可晚点开始，也要放进对的精力时段。
      var fitWeight = (planUrgency(t).score >= 600) ? 60 : 1000;
      var best = null;
      for(var s = earliestStart; s + mins <= TIMELINE_END_MIN; s += 5){
        var clash = null;
        for(var i = 0; i < occupied.length; i++){
          var o = occupied[i];
          if(s < o.end + gapMin && o.start - gapMin < s + mins){ clash = o; break; }
        }
        // 撞上了就直接跳到那段结束之后再试，不用一格一格挪
        if(clash){ s = Math.max(s, clash.end + gapMin - 5); continue; }
        var fit = planFitScore(wKey, tiers, s, mins);
        if(cap !== null && s + mins > cap) fit -= 100; // 排到截止之后等于没排，只当最后的退路
        var sc = fit * fitWeight - s; // 同样合适的位置挑最早的——默认倾向是早点动手
        if(!best || sc > best.sc) best = { sc: sc, start: s, fit: fit };
      }
      if(!best){ drop('今天剩下的时间里找不到一段放得下它的空当'); return; }
      t.startMinutes = best.start;
      t.aiScheduled = true; // 标一下这条时间是自动排的，不是手动挑的
      occupied.push({ start: best.start, end: best.start + mins });
      occupied.sort(function(a, b){ return a.start - b.start; });
      usedMin += mins;
      placed.push({
        id: t.id, name: t.name, start: best.start, mins: mins, weight: wKey,
        tier: energyTierOfHour(tiers, Math.floor(best.start / 60) % 24),
        urgentWhy: planUrgency(t).why,
        lateForDue: (cap !== null && best.start + mins > cap)
      });
    });
    // 今天没塞下的，别就这么扔在"待安排"里烂掉——往后面几天找位置。
    // 只有排"今天"的时候才往后顺；翻看过去某一天时点排程，不该悄悄改未来几天的安排。
    var spilled = [];
    if(isToday && bumped.length){
      var sp = planSpillover(acct, bumped, dateKey, tiers, gapMin);
      spilled = sp.spilled;
      bumped = sp.stillStuck;
    }
    saveAcctData(acct);

    var report = {
      dateKey: dateKey, at: Date.now(),
      placed: placed, bumped: bumped, spilled: spilled,
      hasEnergyData: tiers.hasData,
      highHours: tiers.high.map(function(r){ return r.hour; }),
      dayCount: tiers.dayCount,
      budgetMin: budgetMin, usedMin: usedMin
    };
    if(opts.report) lastPlanReport = report;
    return report;
  }

  // 内部用的"顺一遍"：卡壳先搁置、任务顺延过来之后，把还没排时间的任务往空位里顺一顺。
  // 不释放已经排好的任务、不出报告——这条路径只补空，不重排。
  function repackDay(dateKey, excludeId){
    planDay(dateKey, { excludeId: excludeId });
  }

  // 排完之后给你一张清单：每条排在几点、进的是哪档精力时段、凭什么排这个位置；
  // 被挤回"待安排"的单独列一块，说清楚是为什么挤的。只读 lastPlanReport，不存任何数据。
  var PLAN_TIER_LABEL = { high: '高精力时段', mid: '中精力时段', low: '低精力时段', unknown: '这个钟点还没数据' };
  var PLAN_WEIGHT_LABEL = { heavy: '主要', mid: '中等', light: '次要' };
  function renderPlanReportHtml(){
    var r = lastPlanReport;
    if(!r || r.dateKey !== dayViewDate) return '';
    var rows = r.placed.map(function(p, i){
      var bits = [PLAN_WEIGHT_LABEL[p.weight]];
      // 这个钟点还没攒到数据的，就别在每一行上重复说一遍——上面那句"排程依据"已经交代过了
      if(p.tier !== 'unknown') bits.push(PLAN_TIER_LABEL[p.tier]);
      if(p.urgentWhy) bits.push(p.urgentWhy);
      if(p.lateForDue) bits.push('⚠ 这个位置已经超过截止点了，今天塞不进更早的空当');
      return '<li class="plan-report-row">' +
        '<span class="plan-report-no">' + (i + 1) + '</span>' +
        '<span class="plan-report-time">' + fmtClock(p.start) + '–' + fmtClock(p.start + p.mins) + '</span>' +
        '<span class="plan-report-name">' + escapeHtml(p.name) + '</span>' +
        '<span class="plan-report-why">' + escapeHtml(bits.join(' · ')) + '</span>' +
      '</li>';
    }).join('');
    var bumpedRows = r.bumped.map(function(bp){
      return '<li class="plan-report-bumped-row">' +
        '<span class="plan-report-name">' + escapeHtml(bp.name) + '</span>' +
        '<span class="plan-report-why">' + PLAN_WEIGHT_LABEL[bp.weight] + ' · ' +
          (bp.hadTime ? '被更急的活挤出今天：' : '没排进来：') + escapeHtml(bp.reason) + '</span>' +
      '</li>';
    }).join('');

    var basis;
    if(!r.hasEnergyData){
      basis = '还没攒够精力数据，这次先按"谁更急、谁更重"从早往晚排。等摄像头盯梢和用时记录攒起来，主要的活会自动往你的高精力时段挪。';
    } else if(!r.highHours.length){
      basis = '目前还没有哪个钟点够得上"高精力"，这次按优先级从早往晚排。';
    } else {
      basis = '按你的高精力时段（' + r.highHours.map(function(h){ return h + '点'; }).join('、') + '）排的：主要的活往这几个钟点塞，杂事让开。' +
        (r.dayCount < 7 ? '（才攒了 ' + r.dayCount + ' 天数据，这个排名还会变）' : '');
    }
    // 今天塞不下、被放到后面几天的那几条——必须一条条说清落在哪天，不能偷偷挪走了事
    var spilledRows = (r.spilled || []).map(function(sp){
      var bits = [PLAN_WEIGHT_LABEL[sp.weight]];
      if(sp.dueDate) bits.push('截止 ' + fmtShortDayLabel(sp.dueDate));
      if(sp.assumedHours) bits.push('那天你还没填能投入几小时，按 ' + sp.assumedHours + ' 小时假设的');
      return '<li class="plan-report-spill-row">' +
        '<span class="plan-report-time">' + escapeHtml(fmtShortDayLabel(sp.dateKey)) + ' ' + fmtClock(sp.start) + '</span>' +
        '<span class="plan-report-name">' + escapeHtml(sp.name) + '</span>' +
        '<span class="plan-report-why">' + escapeHtml(bits.join(' · ')) + '</span>' +
      '</li>';
    }).join('');

    var headBits = [];
    if(r.placed.length) headBits.push('今天排好 ' + r.placed.length + ' 件');
    if((r.spilled || []).length) headBits.push('顺到后面几天 ' + r.spilled.length + ' 件');
    if(r.bumped.length) headBits.push(r.bumped.length + ' 件还是没着落');
    var head = headBits.length ? headBits.join('，') : '没有需要排的任务';

    return '<div class="plan-report">' +
      '<div class="plan-report-head">' +
        '<p class="plan-report-title">🗓 ' + head + '</p>' +
        '<button class="plan-report-close" id="planReportClose" type="button" aria-label="收起这张清单">×</button>' +
      '</div>' +
      '<p class="plan-report-basis">' + basis + '</p>' +
      (rows ? '<ol class="plan-report-list">' + rows + '</ol>' : '') +
      (spilledRows ? ('<p class="plan-report-spill-title">今天塞不下，替你放到了后面这几天（<b>都在截止日之前</b>）：</p>' +
        '<ul class="plan-report-spill">' + spilledRows + '</ul>') : '') +
      (bumpedRows ? '<p class="plan-report-bumped-title">还是没着落的：</p><ul class="plan-report-bumped">' + bumpedRows + '</ul>' : '') +
      '<p class="plan-report-foot">你手动挑过时间的任务一条都没动。不满意就自己改时间，改过的以后也不会被自动挪走。' +
      ((r.spilled || []).length ? '往后顺的那几条只改了日期和钟点，别的一个字没动。' : '') + '</p>' +
    '</div>';
  }

  // 日视图顶部的周/月折叠日期条：收起时显示一周（可左右翻周），点击展开显示整月方便跳到任意一天。
  function renderDayStripHtml(){
    var acct = getAcctData();
    function hasTasks(k){
      for(var i = 0; i < acct.tasks.length; i++){ if(acct.tasks[i].date === k) return true; }
      return false;
    }
    if(!dayStripExpanded){
      var anchor = dayStripAnchor || mondayOf(dayViewDate);
      var cells = '';
      for(var i = 0; i < 7; i++){
        var k = addDaysKey(anchor, i);
        var d = parseDateKey(k);
        cells += '<button type="button" class="day-strip-cell' +
          (k === dayViewDate ? ' is-selected' : '') + (k === todayKey() ? ' is-today' : '') + '" data-date="' + k + '">' +
          '<span class="day-strip-dow">' + WEEKDAY_NAMES[d.getDay()].slice(1) + '</span>' +
          '<span class="day-strip-num">' + d.getDate() + '</span>' +
          (hasTasks(k) ? '<span class="day-strip-dot"></span>' : '') +
          '</button>';
      }
      return '<div class="day-strip">' +
        '<button class="day-strip-nav" id="dayStripPrev" type="button" aria-label="上一周">‹</button>' +
        '<div class="day-strip-cells">' + cells + '</div>' +
        '<button class="day-strip-nav" id="dayStripNext" type="button" aria-label="下一周">›</button>' +
        '<button class="day-strip-toggle" id="dayStripToggle" type="button" aria-label="展开月历">▾</button>' +
        '</div>';
    }
    if(!monthAnchor){
      var d0 = parseDateKey(dayViewDate);
      monthAnchor = { year: d0.getFullYear(), month: d0.getMonth() };
    }
    var year = monthAnchor.year, month = monthAnchor.month;
    var first = new Date(year, month, 1);
    var firstOffset = (first.getDay() + 6) % 7;
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var html = '<div class="day-strip day-strip-expanded">' +
      '<button class="day-strip-nav" id="dayStripMonthPrev" type="button" aria-label="上个月">‹</button>' +
      '<span class="day-strip-month-label">' + year + '年' + (month + 1) + '月</span>' +
      '<button class="day-strip-nav" id="dayStripMonthNext" type="button" aria-label="下个月">›</button>' +
      '<button class="day-strip-toggle is-open" id="dayStripToggle" type="button" aria-label="收起月历">▴</button>' +
      '</div>';
    html += '<div class="month-grid month-grid-compact">';
    ['一','二','三','四','五','六','日'].forEach(function(w){ html += '<div class="week-day-head" style="text-align:center;">' + w + '</div>'; });
    for(var e = 0; e < firstOffset; e++) html += '<div class="month-cell is-empty"></div>';
    for(var day = 1; day <= daysInMonth; day++){
      var k2 = year + '-' + pad2(month + 1) + '-' + pad2(day);
      html += '<div class="month-cell month-cell-compact' + (k2 === todayKey() ? ' is-today' : '') + (k2 === dayViewDate ? ' is-selected' : '') + '" data-date="' + k2 + '">' +
        '<div class="month-cell-date">' + day + '</div>' +
        (hasTasks(k2) ? '<span class="day-strip-dot"></span>' : '') +
        '</div>';
    }
    html += '</div>';
    return html;
  }

  // ---- 日视图 ----
  // "可投入几小时"下拉的选项：常见的 0.5~12 小时每半小时一档，如果当前存的值不在这个范围里
  // （比如以前手输过的怪数字），把它也塞进去、选中它，不能让下拉框显示的和实际存的对不上。
  function hoursSelectOptionsHtml(current){
    var opts = [];
    for(var h = 0.5; h <= 12; h += 0.5) opts.push(Math.round(h * 10) / 10);
    if(opts.indexOf(current) === -1) opts.push(current);
    opts.sort(function(a, b){ return a - b; });
    return opts.map(function(h){
      return '<option value="' + h + '"' + (h === current ? ' selected' : '') + '>' + h + ' 小时</option>';
    }).join('');
  }

  function renderDayView(sub){
    var buckets = computeDayTimeline(dayViewDate);
    var acct = getAcctData();
    var isToday = dayViewDate === todayKey();
    var nowMin = minutesSinceMidnight(new Date());

    var html = '<div class="day-head-row">' +
      '<span class="day-nav-date">' + fmtDayLabel(dayViewDate) + '</span>' +
      (!isToday ? '<button class="day-nav-today" id="dayTodayBtn" type="button">回到今天</button>' : '') +
      '</div>';
    html += renderDayStripHtml();

    var dayTasks = acct.tasks.filter(function(t){ return t.date === dayViewDate; });
    var dayDoneCount = dayTasks.filter(function(t){ return t.done; }).length;
    var dayPendingCount = dayTasks.length - dayDoneCount;
    var dayProgressPct = dayTasks.length ? Math.round(dayDoneCount / dayTasks.length * 100) : 0;
    html += '<div class="day-stat-tiles">' +
      '<div class="day-stat-tile is-done"><span class="day-stat-tile-num">' + dayDoneCount + '</span><span class="day-stat-tile-label">已完成</span></div>' +
      '<div class="day-stat-tile is-pending"><span class="day-stat-tile-num">' + dayPendingCount + '</span><span class="day-stat-tile-label">待完成</span></div>' +
      '<div class="day-stat-tile is-progress"><span class="day-stat-tile-num">' + dayProgressPct + '%</span><span class="day-stat-tile-label">完成率</span></div>' +
      '</div>';

    // 航线打印器：今天排的任务全部做完时，在纸条底部盖一个"今日已靠岸"——只在真的有任务、
    // 且一条不落全部完成时出现，不影响还没排任务的空白日期。
    if(isToday && dayTasks.length > 0 && dayPendingCount === 0){
      html += '<div class="lc-all-done-banner">⚓ 今日已靠岸 · ' + dayDoneCount + ' 项任务全部完成</div>';
    }

    // 提前一天的警钟：只在"今天"这一屏顶上响，别的日期不打扰
    if(isToday) html += deadlineAlarmHtml(acct);
    // 刚点过自动排程的话，紧跟着给出这次排程的清单
    html += renderPlanReportHtml();

    var rollover = isToday ? findRolloverCandidates() : [];
    if(rollover.length){
      html += '<div class="rollover-prompt">' +
        '<p class="rollover-title">这些任务之前排不上时间轴、变成了"待安排"——今天还重要吗？勾选的会排到今天最前面</p>' +
        '<ul class="rollover-list">' +
        rollover.map(function(t){
          return '<li class="rollover-item"><label style="display:flex;align-items:center;gap:10px;cursor:pointer;width:100%;">' +
            '<input type="checkbox" checked data-rollover-id="' + t.id + '">' +
            '<span>' + escapeHtml(t.name) + ' · ' + escapeHtml(t.category) + '</span>' +
            '</label></li>';
        }).join('') +
        '</ul>' +
        '<button class="btn btn-primary btn-sm" id="rolloverConfirm" type="button">确认，加入今天</button>' +
        '</div>';
    }

    if(buckets.hours === undefined){
      html += '<div class="hours-gate">' +
        '<p class="hours-gate-q">' + (isToday ? '今天' : fmtDayLabel(dayViewDate).split(' ·')[0]) + '可以投入几个小时？</p>' +
        '<div class="hours-gate-row">' +
          '<input type="number" min="0.5" max="16" step="0.5" placeholder="例如 4" id="hoursGateInput">' +
          '<button class="btn btn-primary" id="hoursGateConfirm" type="button">确定</button>' +
        '</div>' +
        '<p class="code-hint" style="margin-top:10px;">先定投入时长，再加任务——时间轴排不下、或者跟别的任务冲突的会自动变成"待安排"，不硬塞进这一天。</p>' +
        '</div>';
    } else {
      var overBudget = buckets.usedMin > buckets.budgetMin;
      var hoursPct = buckets.budgetMin > 0 ? Math.min(100, Math.round(buckets.usedMin / buckets.budgetMin * 100)) : 0;
      html += '<div class="day-toolbar">' +
        '<div class="day-hours-card' + (overBudget ? ' is-over' : '') + '">' +
          '<div class="day-hours-card-row">可投入' +
            '<select class="day-hours-select" id="hoursSelect">' + hoursSelectOptionsHtml(buckets.hours) + '</select>' +
            '<span class="day-hours-card-used">已排 ' + fmtDuration(buckets.usedMin) + '</span>' +
          '</div>' +
          '<div class="day-hours-track"><div class="day-hours-fill" style="width:' + hoursPct + '%;"></div></div>' +
        '</div>' +
        '<div class="day-toolbar-actions">' +
          '<button class="btn btn-ghost btn-sm" id="posterBtn" type="button">🖼 分享海报</button>' +
          '<button class="btn btn-ghost btn-sm" id="repackBtn" type="button">✨ AI计划生成</button>' +
          '<button class="btn btn-ghost btn-sm" id="flexBlockBtn" type="button">🌿 弹性时间</button>' +
          '<button class="btn btn-primary btn-sm" id="addTaskBtn" type="button">+ 添加任务</button>' +
        '</div>' +
        '</div>';

      var untimedQueue = buckets.bufferTasks.filter(function(t){ return !t.done && typeof t.startMinutes !== 'number'; })
        .sort(function(a, b){ return a.order - b.order; });
      var conflictTasks = buckets.bufferTasks.filter(function(t){ return !t.done && typeof t.startMinutes === 'number'; });
      var doneUnplaced = buckets.bufferTasks.filter(function(t){ return t.done; });

      html += renderTimelineHtml(buckets.mainTasks, dayViewDate, isToday, nowMin, untimedQueue.length + conflictTasks.length, acct.activeTimer);

      if(untimedQueue.length || conflictTasks.length || doneUnplaced.length){
        html += '<div class="buffer-section">' +
          '<p class="buffer-section-title">🗂 机动托盘 · 待安排 · 左边写上第几重要（1 最重要）或者直接拖动排序，排好后点"AI计划生成"自动排时间；时间冲突的需要手动改一下时间</p>' +
          '<ul class="app-task-list app-task-list-buffer">' +
            untimedQueue.map(function(t, i){ return taskCardHtml(t, { dateKey: dayViewDate, showRank: true, rankIndex: i + 1, rankTotal: untimedQueue.length, activeTimer: acct.activeTimer }); }).join('') +
            conflictTasks.map(function(t){ return taskCardHtml(t, { dateKey: dayViewDate, conflict: true, activeTimer: acct.activeTimer }); }).join('') +
            doneUnplaced.map(function(t){ return taskCardHtml(t, { dateKey: dayViewDate, activeTimer: acct.activeTimer }); }).join('') +
          '</ul>' +
          '</div>';
      }
    }

    // 首页底部的"更多功能"入口——tikhub 那种图标+标题+一句话的格子。放在最下面而不是最上面，
    // 是为了不把 buffer-section 往下挤（每日清单的核心是排任务，这个是顺手能看见但不抢地方的补充入口）。
    html += '<div class="home-more-section">' +
      '<p class="home-more-title">更多功能</p>' +
      '<div class="tile-grid">' +
        '<button class="tile-card" type="button" data-nav="pomodoro"><span class="tile-icon" aria-hidden="true">⏱</span><span class="tile-title">番茄钟</span><span class="tile-desc">给任务计时，结束后自动记进数据档案</span></button>' +
        '<button class="tile-card" type="button" data-nav="habits"><span class="tile-icon" aria-hidden="true">🌱</span><span class="tile-title">习惯</span><span class="tile-desc">按分类打卡，连续天数能拿额外金币</span></button>' +
        '<button class="tile-card" type="button" data-nav="stats"><span class="tile-icon" aria-hidden="true">📊</span><span class="tile-title">数据档案</span><span class="tile-desc">看每个类别的真实用时曲线</span></button>' +
        '<button class="tile-card" type="button" data-nav="inbox"><span class="tile-icon" aria-hidden="true">📥</span><span class="tile-title">收集箱</span><span class="tile-desc">打完勾的任务都收纳在这里</span></button>' +
      '</div>' +
    '</div>';

    sub.innerHTML = DOMPurify.sanitize(html);

    sub.querySelectorAll('.home-more-section .tile-card').forEach(function(btn){
      btn.addEventListener('click', function(){ switchAppView(btn.getAttribute('data-nav')); });
    });

    var todayBtn = document.getElementById('dayTodayBtn');
    if(todayBtn) todayBtn.addEventListener('click', function(){
      dayViewDate = todayKey();
      dayStripAnchor = null;
      dayStripExpanded = false;
      renderDayView(sub);
    });

    var stripToggle = document.getElementById('dayStripToggle');
    if(stripToggle) stripToggle.addEventListener('click', function(){
      dayStripExpanded = !dayStripExpanded;
      if(dayStripExpanded) monthAnchor = null;
      renderDayView(sub);
    });
    if(!dayStripExpanded){
      var stripPrev = document.getElementById('dayStripPrev');
      var stripNext = document.getElementById('dayStripNext');
      if(stripPrev) stripPrev.addEventListener('click', function(){ dayViewDate = addDaysKey(dayViewDate, -7); dayStripAnchor = mondayOf(dayViewDate); renderDayView(sub); });
      if(stripNext) stripNext.addEventListener('click', function(){ dayViewDate = addDaysKey(dayViewDate, 7); dayStripAnchor = mondayOf(dayViewDate); renderDayView(sub); });
      sub.querySelectorAll('.day-strip-cell').forEach(function(cell){
        cell.addEventListener('click', function(){ dayViewDate = cell.getAttribute('data-date'); renderDayView(sub); });
      });
    } else {
      var monthPrev = document.getElementById('dayStripMonthPrev');
      var monthNext = document.getElementById('dayStripMonthNext');
      if(monthPrev) monthPrev.addEventListener('click', function(){
        monthAnchor.month -= 1;
        if(monthAnchor.month < 0){ monthAnchor.month = 11; monthAnchor.year -= 1; }
        renderDayView(sub);
      });
      if(monthNext) monthNext.addEventListener('click', function(){
        monthAnchor.month += 1;
        if(monthAnchor.month > 11){ monthAnchor.month = 0; monthAnchor.year += 1; }
        renderDayView(sub);
      });
      sub.querySelectorAll('.month-cell-compact[data-date]').forEach(function(cell){
        cell.addEventListener('click', function(){
          dayViewDate = cell.getAttribute('data-date');
          dayStripExpanded = false;
          dayStripAnchor = mondayOf(dayViewDate);
          renderDayView(sub);
        });
      });
    }

    var rolloverBtn = document.getElementById('rolloverConfirm');
    if(rolloverBtn) rolloverBtn.addEventListener('click', function(){
      var a = getAcctData();
      var checks = sub.querySelectorAll('[data-rollover-id]');
      var maxOrder = 0;
      a.tasks.forEach(function(t){ if(t.date === dayViewDate) maxOrder = Math.max(maxOrder, t.order); });
      var important = [], rest = [];
      checks.forEach(function(chk){
        var id = chk.getAttribute('data-rollover-id');
        var t = a.tasks.find(function(x){ return x.id === id; });
        if(!t) return;
        if(chk.checked) important.push(t); else rest.push(t);
      });
      // 顺延过来的任务不带着原来的时间——今天要不要排、排几点，交给"待安排"里的序号 + AI计划生成，
      // 不会因为顺延就悄悄占用今天某个时间点。
      important.forEach(function(t, i){ t.date = dayViewDate; t.order = -1000 + i; t.startMinutes = null; });
      rest.forEach(function(t, i){ t.date = dayViewDate; t.order = maxOrder + 1 + i; t.startMinutes = null; });
      saveAcctData(a);
      renderDayView(sub);
    });

    var gateInput = document.getElementById('hoursGateInput');
    var gateBtn = document.getElementById('hoursGateConfirm');
    function submitGate(){
      var v = parseFloat(gateInput.value);
      if(!v || v <= 0){ gateInput.focus(); return; }
      var a = getAcctData();
      a.dailyHours[dayViewDate] = v;
      saveAcctData(a);
      renderDayView(sub);
    }
    if(gateBtn) gateBtn.addEventListener('click', submitGate);
    if(gateInput) gateInput.addEventListener('keydown', function(e){ if(e.key === 'Enter') submitGate(); });

    var hoursSelect = document.getElementById('hoursSelect');
    if(hoursSelect) hoursSelect.addEventListener('change', function(){
      var v = parseFloat(hoursSelect.value);
      if(!v || v <= 0) return;
      var a = getAcctData();
      a.dailyHours[dayViewDate] = v;
      saveAcctData(a);
      renderDayView(sub);
    });
    var addBtn = document.getElementById('addTaskBtn');
    if(addBtn) addBtn.addEventListener('click', function(){ openTaskModal(null); });
    var posterBtn = document.getElementById('posterBtn');
    if(posterBtn) posterBtn.addEventListener('click', openPosterModal);
    var repackBtn = document.getElementById('repackBtn');
    // 点这个按钮＝把这一天交给系统重排：释放所有"自动排的"任务重新安排，手动排的一条不碰，
    // 排完出一张清单说明每条为什么排在那儿、谁被挤了出去。
    if(repackBtn) repackBtn.addEventListener('click', function(){
      planDay(dayViewDate, { release: true, report: true });
      renderDayView(sub);
    });
    var planReportClose = document.getElementById('planReportClose');
    if(planReportClose) planReportClose.addEventListener('click', function(){ lastPlanReport = null; renderDayView(sub); });
    var flexBlockBtn = document.getElementById('flexBlockBtn');
    if(flexBlockBtn) flexBlockBtn.addEventListener('click', openFlexBlockModal);

    sub.querySelectorAll('.timeline-block-start').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        handleStartClick(btn.getAttribute('data-start-id'));
      });
    });
    sub.querySelectorAll('.timeline-block-check').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var block = btn.closest('.timeline-block');
        if(block && !block.classList.contains('is-done')) lcStampArrived(block);
        toggleTaskDone(block && block.getAttribute('data-id'));
      });
    });
    sub.querySelectorAll('.timeline-block').forEach(function(el){
      el.addEventListener('click', function(){ openTaskModal(el.getAttribute('data-id')); });
    });

    var scrollEl = document.getElementById('timelineScroll');
    if(scrollEl){
      var firstTimed = buckets.mainTasks.filter(function(t){ return typeof t.startMinutes === 'number'; })[0];
      var scrollTargetMin = isToday ? nowMin : (firstTimed ? firstTimed.startMinutes : (TIMELINE_START_MIN + 120));
      var pxPerMin = TIMELINE_HOUR_PX / 60;
      scrollEl.scrollTop = Math.max(0, (scrollTargetMin - TIMELINE_START_MIN) * pxPerMin - 120);
    }

    bindTaskListInteractions(sub);
    bindDeadlineFix(sub);
    initBufferDragReorder(sub);
    renderConsoleHero();
  }
  // 警钟里那两个改期出口。只动被点的那一条任务的 date / dueDate / startMinutes，
  // 别的任务、别的字段一个都不碰。
  function moveDeadline(taskId, newDateKey, alsoMoveTask){
    var acct = getAcctData();
    var t = (acct.tasks || []).find(function(x){ return x.id === taskId; });
    if(!t) return null;
    var today = todayKey();
    if(newDateKey) t.dueDate = newDateKey;
    if(alsoMoveTask && t.date !== today){
      t.date = today;
      // 原来排的那个钟点是给旧日子的，挪过来就作废，退回"待安排"让排程重新放
      t.startMinutes = null;
      delete t.aiScheduled;
    }
    saveAcctData(acct);
    return t;
  }
  function bindDeadlineFix(root){
    if(!root) return;
    root.querySelectorAll('[data-dlmove]').forEach(function(b){
      b.addEventListener('click', function(){
        var id = b.getAttribute('data-dlmove');
        var acct = getAcctData();
        var t0 = (acct.tasks || []).find(function(x){ return x.id === id; });
        if(!t0) return;
        var today = todayKey();
        // 截止日只在"已经过了"的时候才往后推——没过期的别乱改人家定好的期限
        var newDue = (t0.dueDate && t0.dueDate < today) ? today : t0.dueDate;
        var t = moveDeadline(id, newDue, true);
        if(t){
          lcVoyagePrompt('《' + t.name + '》挪到今天了' +
            (newDue === today ? '，截止也顺延到今天' : '') + '——去清单里给它排个时间');
          refreshCurrentView();
        }
      });
    });
    root.querySelectorAll('[data-dldate]').forEach(function(inp){
      inp.addEventListener('change', function(){
        var id = inp.getAttribute('data-dldate');
        var v = inp.value;
        if(!v) return;
        // 改期的时候顺手把任务也挪到今天——不然它还是躺在旧日子里看不见
        var t = moveDeadline(id, v, true);
        if(t){
          lcVoyagePrompt('《' + t.name + '》截止改成 ' + v + ' 了');
          refreshCurrentView();
        }
      });
    });
  }

  // ---- 3日 / 周视图：横轴时间表（参考图 p1——任务按真实起止时间横跨在时间轴上，不再是"每天
  // 一叠小胶囊"）。跟"日"视图共用同一份 TIMELINE_START_MIN/END_MIN/HOUR_PX 常量和类别配色，
  // 保证"日"和"3日/周"看起来是同一件事在不同缩放下的呈现，不是另起一套视觉语言。
  // 只读现有 tasks 数据画图，不新增任何存储字段。 ----
  function multiDayTimelineHtml(keys){
    var pxPerMin = TIMELINE_HOUR_PX / 60;
    var hourLabels = '', hourRows = '';
    for(var m = TIMELINE_START_MIN; m < TIMELINE_END_MIN; m += 60){
      hourLabels += '<div class="timeline-hour-label">' + pad2(Math.floor(m / 60)) + ':00</div>';
      hourRows += '<div class="timeline-grid-row"></div>';
    }
    var nowMin = minutesSinceMidnight(new Date());
    var todayK = todayKey();
    var colsHtml = keys.map(function(k){
      var buckets = computeDayTimeline(k);
      var allTasks = buckets.mainTasks.concat(buckets.bufferTasks);
      var timed = allTasks.filter(function(t){ return typeof t.startMinutes === 'number'; });
      var untimed = allTasks.filter(function(t){ return typeof t.startMinutes !== 'number'; });
      var isToday = k === todayK;
      var d = parseDateKey(k);
      // 每天头部（星期几日期 + 最多两条待安排缩略胶囊）固定同样高度（见 CSS .mweek-day-head/
      // .mweek-untimed），内容多少不同的天头部也绝不会跑偏，下面的时间轴格子才能跟左边小时
      // 刻度严丝合缝对齐。
      var blocksHtml = timed.map(function(t){
        var start = Math.max(TIMELINE_START_MIN, t.startMinutes);
        var end = Math.min(TIMELINE_END_MIN, t.startMinutes + t.plannedMinutes);
        if(end <= start) return '';
        var top = (start - TIMELINE_START_MIN) * pxPerMin;
        var height = Math.max(18, (end - start) * pxPerMin);
        var live = isToday && !t.done && nowMin >= t.startMinutes && nowMin < (t.startMinutes + t.plannedMinutes);
        var cls = 'mweek-block' + (t.done ? ' is-done' : '') + (live ? ' is-live' : '');
        // 按类别上色：跟"日"视图一样先描边，这里再加一层很淡的同色底色（色块化），
        // 已完成/进行中两种状态色优先级更高，逻辑跟 renderTimelineHtml 完全一致。
        var catColorStyle = (!t.done && !live) ? ('border-left-color:' + categoryColor(t.category) + ';background:' + categoryColor(t.category) + '22;') : '';
        return '<div class="' + cls + '" data-id="' + t.id + '" style="top:' + top + 'px;height:' + height + 'px;' + catColorStyle + '" title="' + escapeHtml(t.name) + '">' +
          '<div class="mweek-block-name">' + escapeHtml(t.name) + '</div>' +
          (height >= 32 ? ('<div class="mweek-block-time">' + fmtClock(t.startMinutes) + '</div>') : '') +
          '</div>';
      }).join('');
      var nowLineHtml = (isToday && nowMin >= TIMELINE_START_MIN && nowMin < TIMELINE_END_MIN)
        ? '<div class="timeline-now-line" style="top:' + ((nowMin - TIMELINE_START_MIN) * pxPerMin) + 'px;"></div>' : '';
      var untimedHtml = '<div class="mweek-untimed">' +
        untimed.slice(0, 2).map(function(t){
          var pillStyle = t.done ? '' : (' style="border-left-color:' + categoryColor(t.category) + ';"');
          return '<div class="mini-task-pill' + (t.done ? ' is-done' : '') + '" data-id="' + t.id + '"' + pillStyle + '>' + escapeHtml(t.name) + '</div>';
        }).join('') +
        (untimed.length > 2 ? ('<div class="mweek-untimed-more">+' + (untimed.length - 2) + ' 待安排</div>') : '') +
        '</div>';
      return '<div class="mweek-day-col' + (isToday ? ' is-today' : '') + '" data-date="' + k + '">' +
        '<div class="mweek-day-head">' + WEEKDAY_NAMES[d.getDay()] + ' <b>' + (d.getMonth() + 1) + '/' + d.getDate() + '</b></div>' +
        untimedHtml +
        '<div class="mweek-day-body">' + hourRows + blocksHtml + nowLineHtml + '</div>' +
        '</div>';
    }).join('');
    return '<div class="mweek-wrap">' +
      '<div class="mweek-scroll">' +
        '<div class="mweek-inner">' +
          '<div class="timeline-hours"><div class="mweek-corner"></div>' + hourLabels + '</div>' +
          '<div class="mweek-days-scroll"><div class="mweek-days">' + colsHtml + '</div></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }
  function renderMultiDayView(sub, span){
    var startKey = dayViewDate;
    if(span === 7){
      var d = parseDateKey(dayViewDate);
      var mondayOffset = (d.getDay() + 6) % 7;
      startKey = addDaysKey(dayViewDate, -mondayOffset);
    }
    var keys = [];
    for(var i = 0; i < span; i++) keys.push(addDaysKey(startKey, i));

    var rangeLabel = fmtDayLabel(keys[0]).split(' ·')[0] + ' – ' + fmtDayLabel(keys[keys.length - 1]).split(' ·')[0];
    var html = '<div class="day-nav">' +
      '<button class="day-nav-btn" id="dayPrevBtn" aria-label="前一段">‹</button>' +
      '<span class="day-nav-date">' + rangeLabel + '</span>' +
      '<button class="day-nav-btn" id="dayNextBtn" aria-label="后一段">›</button>' +
      '<button class="day-nav-today" id="dayTodayBtn" type="button">回到今天</button>' +
      '</div>';

    html += multiDayTimelineHtml(keys);

    sub.innerHTML = DOMPurify.sanitize(html);

    function jumpToDay(dateKey){
      dayViewDate = dateKey;
      activeDailyTab = 'day';
      dailyTabBtns.forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-tab') === 'day'); });
      renderDailyTab();
    }
    sub.querySelectorAll('.mweek-day-head, .mweek-untimed').forEach(function(el){
      el.addEventListener('click', function(){
        var col = el.closest('.mweek-day-col');
        if(col) jumpToDay(col.getAttribute('data-date'));
      });
    });
    sub.querySelectorAll('.mweek-block[data-id], .mweek-untimed .mini-task-pill[data-id]').forEach(function(el){
      el.addEventListener('click', function(e){
        e.stopPropagation();
        openTaskModal(el.getAttribute('data-id'));
      });
    });
    var prev = document.getElementById('dayPrevBtn');
    var next = document.getElementById('dayNextBtn');
    var todayBtn = document.getElementById('dayTodayBtn');
    if(prev) prev.addEventListener('click', function(){ dayViewDate = addDaysKey(dayViewDate, -span); renderMultiDayView(sub, span); });
    if(next) next.addEventListener('click', function(){ dayViewDate = addDaysKey(dayViewDate, span); renderMultiDayView(sub, span); });
    if(todayBtn) todayBtn.addEventListener('click', function(){ dayViewDate = todayKey(); renderMultiDayView(sub, span); });
  }

  // ---- 月视图 ----
  function renderMonthView(sub){
    if(!monthAnchor){
      var d0 = parseDateKey(dayViewDate);
      monthAnchor = { year: d0.getFullYear(), month: d0.getMonth() };
    }
    var year = monthAnchor.year, month = monthAnchor.month;
    var first = new Date(year, month, 1);
    var firstOffset = (first.getDay() + 6) % 7;
    var daysInMonth = new Date(year, month + 1, 0).getDate();

    var html = '<div class="month-nav">' +
      '<button id="monthPrevBtn" type="button" aria-label="上个月">‹</button>' +
      '<span>' + year + '年' + (month + 1) + '月</span>' +
      '<button id="monthNextBtn" type="button" aria-label="下个月">›</button>' +
      '</div>';
    html += '<div class="month-grid">';
    ['一','二','三','四','五','六','日'].forEach(function(w){ html += '<div class="week-day-head" style="text-align:center;">' + w + '</div>'; });
    for(var i = 0; i < firstOffset; i++) html += '<div class="month-cell is-empty"></div>';
    for(var day = 1; day <= daysInMonth; day++){
      var k = year + '-' + pad2(month + 1) + '-' + pad2(day);
      var buckets = computeDayTimeline(k);
      var allTasks = buckets.mainTasks.concat(buckets.bufferTasks);
      html += '<div class="month-cell' + (k === todayKey() ? ' is-today' : '') + '" data-date="' + k + '">' +
        '<div class="month-cell-date">' + day + '</div>' +
        allTasks.slice(0, 2).map(function(t){
          var prefix = typeof t.startMinutes === 'number' ? (fmtClock(t.startMinutes) + ' ') : '';
          var pillStyle = t.done ? '' : (' style="border-left-color:' + categoryColor(t.category) + ';"');
          return '<div class="mini-task-pill' + (t.done ? ' is-done' : '') + '"' + pillStyle + '>' + prefix + escapeHtml(t.name) + '</div>';
        }).join('') +
        (allTasks.length > 2 ? '<div class="month-cell-more">+' + (allTasks.length - 2) + '</div>' : '') +
        '</div>';
    }
    html += '</div>';

    sub.innerHTML = DOMPurify.sanitize(html);
    sub.querySelectorAll('.month-cell[data-date]').forEach(function(cell){
      cell.addEventListener('click', function(){
        dayViewDate = cell.getAttribute('data-date');
        activeDailyTab = 'day';
        dailyTabBtns.forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-tab') === 'day'); });
        renderDailyTab();
      });
    });
    var prevBtn = document.getElementById('monthPrevBtn');
    var nextBtn = document.getElementById('monthNextBtn');
    if(prevBtn) prevBtn.addEventListener('click', function(){
      monthAnchor.month -= 1;
      if(monthAnchor.month < 0){ monthAnchor.month = 11; monthAnchor.year -= 1; }
      renderMonthView(sub);
    });
    if(nextBtn) nextBtn.addEventListener('click', function(){
      monthAnchor.month += 1;
      if(monthAnchor.month > 11){ monthAnchor.month = 0; monthAnchor.year += 1; }
      renderMonthView(sub);
    });
  }

  // ---- 列表视图：所有未完成任务，按日期分组，组内按时间排序 ----
  // "列表"视图：按类别分组显示（每个类别一个卡片盒子），而不是按日期分组——同一类别下
  // 手动排了时间/还没排时间的任务混在一起按时间顺序排，"AI计划生成"帮着排出时间的任务
  // 统一放在这个类别盒子最下面、一条"AI 排的"分隔线之下，跟手动排的分开看。
  function timeSortTasks(list){
    return list.sort(function(a, b){
      if(a.date !== b.date) return a.date < b.date ? -1 : 1;
      var am = typeof a.startMinutes === 'number' ? a.startMinutes : 99999;
      var bm = typeof b.startMinutes === 'number' ? b.startMinutes : 99999;
      if(am !== bm) return am - bm;
      return a.order - b.order;
    });
  }
  // 一个类别盒子"里面"的任务行 HTML（手动排的在上，AI排的在分隔线下面）——"列表"视图的
  // 每个 .cat-box 用它，弹出来的"打印小票"弹层内容也用它，保证两处任务的排布/勾选/开始/
  // 编辑这些交互完全是同一份代码、同一个样子，不会因为多了个入口就长得不一样。
  function categoryTaskRowsHtml(tasks, activeTimer){
    var manual = timeSortTasks(tasks.filter(function(t){ return !t.aiScheduled; }));
    var aiPicked = timeSortTasks(tasks.filter(function(t){ return !!t.aiScheduled; }));
    // 降噪：类别名已经是分组盒子的标题，行内再点一个同色小圆点是重复——去掉（showCatDot:false）。
    var rowCtx = { activeTimer: activeTimer, hideCategory: true, showDate: true, showCatDot: false };
    return '<ul class="app-task-list">' +
        manual.map(function(t){ return taskCardHtml(t, Object.assign({ dateKey: t.date }, rowCtx)); }).join('') +
      '</ul>' +
      (aiPicked.length
        ? ('<div class="cat-box-ai-divider">✨ AI 排的</div>' +
           '<ul class="app-task-list">' + aiPicked.map(function(t){ return taskCardHtml(t, Object.assign({ dateKey: t.date }, rowCtx)); }).join('') + '</ul>')
        : '');
  }
  // 按当前账号的类别顺序(acct.categories)分组未完成任务；任务身上万一存的是已经被改名/删除、
  // 不在当前类别列表里的旧类别名，追加在最后，不会漏任务。列表视图和"打印小票"弹层都用这个分组结果。
  function groupUndoneTasksByCategory(acct){
    var undone = acct.tasks.filter(function(t){ return !t.done; });
    var byCat = {};
    undone.forEach(function(t){ (byCat[t.category] = byCat[t.category] || []).push(t); });
    var catOrder = acct.categories.map(function(c){ return c.name; });
    Object.keys(byCat).forEach(function(c){ if(catOrder.indexOf(c) === -1) catOrder.push(c); });
    return { byCat: byCat, catOrder: catOrder, undone: undone };
  }
  function renderListView(sub){
    var acct = getAcctData();
    var grouped = groupUndoneTasksByCategory(acct);
    var brandHtml = '<div class="list-header-brand">' +
      '<svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><circle cx="13.5" cy="19" r="9"/><circle cx="20" cy="11" r="6.2"/><path d="M25.3 10.3 L29.5 12 L25.3 13.7 Z"/><circle cx="21.6" cy="9.3" r="1.05" fill="var(--surface)"/></svg>' +
      '<span>我的计划 · 按类别分组</span>' +
      '<button class="list-header-kb-link" type="button" id="listToKbBtn">📚 知识库</button>' +
      '</div>';
    if(!grouped.undone.length){
      sub.innerHTML = DOMPurify.sanitize(brandHtml + '<p class="empty-state">没有未完成的任务，去"日"视图加一个吧。</p>');
      var kbBtnEmpty = document.getElementById('listToKbBtn');
      if(kbBtnEmpty) kbBtnEmpty.addEventListener('click', function(){ switchAppView('knowledge'); });
      return;
    }
    var html = brandHtml;
    grouped.catOrder.forEach(function(cat){
      var tasks = grouped.byCat[cat];
      if(!tasks || !tasks.length) return;
      html += '<div class="cat-box">' +
        '<div class="cat-box-head" data-cat="' + escapeHtml(cat) + '" title="点开看这个类别的打印小票">' +
          '<span class="cat-box-dot" style="background:' + categoryColor(cat) + '" aria-hidden="true"></span>' +
          '<span class="cat-box-name">' + escapeHtml(cat) + '</span>' +
          '<span class="cat-box-count">' + tasks.length + ' 条</span>' +
        '</div>' +
        categoryTaskRowsHtml(tasks, acct.activeTimer) +
        '</div>';
    });
    sub.innerHTML = DOMPurify.sanitize(html);
    bindTaskListInteractions(sub);
    sub.querySelectorAll('.cat-box-head').forEach(function(head){
      head.addEventListener('click', function(){ openCategoryReceipt(head.getAttribute('data-cat')); });
    });
    var kbBtn = document.getElementById('listToKbBtn');
    if(kbBtn) kbBtn.addEventListener('click', function(){ switchAppView('knowledge'); });
  }

  // ---- 四象限：重要/紧急靠任务 ⋮ 菜单里手动标记，没标记过的任务先放"待分类"，不替用户瞎猜 ----
  function groupUndoneTasksByQuadrant(acct){
    var undone = acct.tasks.filter(function(t){ return !t.done; });
    var groups = { unclassified: [], ui: [], un: [], nu: [], nn: [] };
    undone.forEach(function(t){
      if(typeof t.important !== 'boolean' && typeof t.urgent !== 'boolean'){ groups.unclassified.push(t); return; }
      var imp = !!t.important, urg = !!t.urgent;
      if(imp && urg) groups.ui.push(t);
      else if(imp && !urg) groups.un.push(t);
      else if(!imp && urg) groups.nu.push(t);
      else groups.nn.push(t);
    });
    return groups;
  }
  function quadrantBoxHtml(cls, badge, title, sub, tasks, activeTimer){
    var themes = {
      'q-ui': { name:'现在出发', sign:'↗', empty:'航道清空了。眼前没有必须立刻处理的事。' },
      'q-un': { name:'为未来留白', sign:'✦', empty:'留一段完整时间，给真正重要的长期计划。' },
      'q-nu': { name:'轻装转交', sign:'⇢', empty:'暂时没有需要快处理、可交给别人协助的事。' },
      'q-nn': { name:'停靠片刻', sign:'⌁', empty:'想做但不着急的事，可以安心停在这里。' }
    };
    var theme = themes[cls];
    var inner = tasks.length ? categoryTaskRowsHtml(tasks, activeTimer) : '<p class="empty-state"><span aria-hidden="true">' + theme.sign + '</span>' + theme.empty + '</p>';
    return '<div class="quadrant-box ' + cls + '">' +
      '<div class="quadrant-box-head">' +
        '<span class="quadrant-badge" aria-hidden="true">' + badge + '</span><span class="quadrant-box-title">' + title + '</span>' +
        '<span class="quadrant-box-count">' + tasks.length + ' 件</span>' +
      '</div>' +
      '<div class="pp-quadrant-label"><h2>' + theme.name + '</h2><span aria-hidden="true">' + theme.sign + '</span></div>' +
      '<p class="quadrant-box-sub">' + sub + '</p>' +
      '<div class="quadrant-box-body">' + inner + '</div>' +
    '</div>';
  }
  function renderQuadrantView(){
    var body = document.getElementById('quadrantBody');
    if(!body) return;
    var acct = getAcctData();
    var g = groupUndoneTasksByQuadrant(acct);
    var mainTask = acct.tasks.filter(function(t){ return !t.done && t.id === acct.priorityFocusTaskId; })[0];
    var suggested = mainTask || g.ui[0] || g.un[0];
    var html = '<div class="pp-page-intro"><div class="pp-intro-copy"><p class="pp-kicker">PRIORITY MAP / 轻重缓急</p>' +
      '<h1>把力气，<br>留给重要的事。</h1><p class="pp-lead">一张航海图，四种去向。<br>先走好眼前这一步，其他的安心停靠。</p>' +
      '<div class="pp-map-legend"><span><i></i>重要 ' + (g.ui.length + g.un.length) + ' 件</span><span>紧急 ' + (g.ui.length + g.nu.length) + ' 件</span></div></div>' +
      '<aside class="pp-focus-ticket"><div class="pp-ticket-top"><span>' + (mainTask ? '已固定的主线' : '下一步建议') + '</span><span aria-hidden="true">✦</span></div>' +
      '<p class="pp-ticket-label">ONE THING AT A TIME</p><h2>' + (suggested ? escapeHtml(suggested.name) : '今天，从一件小事开始') + '</h2>' +
      '<p>' + (suggested ? (mainTask ? '这是你选定的方向，先给它一段专注时间。' : '按你标记的重要程度，建议从这里开始。') : '收集任务后，再标记它是否重要、紧急。') + '</p>' +
      (suggested ? '<button class="app-task-start-btn pp-focus-start" type="button" data-start-id="' + escapeHtml(suggested.id) + '">开始这件事 <span aria-hidden="true">↗</span></button>' : '<button class="pp-focus-start" type="button" data-pp="capture">收集第一件事 <span aria-hidden="true">＋</span></button>') +
      '</aside></div>';
    if(g.unclassified.length){
      html += '<details class="pp-unclassified"><summary><span>待定航向 <b>' + g.unclassified.length + '</b></span><span>展开并标记重要 / 紧急 ↓</span></summary>' +
        '<p class="quadrant-todo-bar">点任务的 ⋮ 菜单，标记后会自动放入对应区域。</p>' + categoryTaskRowsHtml(g.unclassified, acct.activeTimer) + '</details>';
    }
    html += '<div class="pp-section-heading"><h2>你的四条航道</h2><span>按重要与紧急分区 · 随时可调整</span></div>';
    html += '<div class="quadrant-grid">' +
      quadrantBoxHtml('q-ui', '01', '重要 · 紧急', '优先处理，完成一件再开始下一件。', g.ui, acct.activeTimer) +
      quadrantBoxHtml('q-un', '02', '重要 · 不紧急', '主动留出时间，让重要的事慢慢发生。', g.un, acct.activeTimer) +
      quadrantBoxHtml('q-nu', '03', '紧急 · 不重要', '简化步骤，或交给合适的人协助。', g.nu, acct.activeTimer) +
      quadrantBoxHtml('q-nn', '04', '不重要 · 不紧急', '有余力再回来，不必一口气全做完。', g.nn, acct.activeTimer) +
    '</div>';
    body.innerHTML = DOMPurify.sanitize(html);
    bindTaskListInteractions(body);
  }

  // ---- 知识库：写过笔记(收获/知识点/备注/框架，任一项非空即算)的任务按类别汇总——
  // "编辑"按钮直接复用任务笔记那个弹窗，不是另一套录入逻辑，两处数据天然同步 ----
  function knowledgeCardHtml(t){
    var dateLabel = t.date ? fmtShortDayLabel(t.date) : '';
    var frameworkHtml = t.noteFramework ? ('<span class="kb-card-framework">🔧 ' + escapeHtml(t.noteFramework) + '</span>') : '';
    var rows = '';
    if(t.noteGain) rows += '<div class="kb-card-row"><b>收获</b><p>' + escapeHtml(t.noteGain) + '</p></div>';
    if(t.noteKnowledge) rows += '<div class="kb-card-row"><b>考验的知识点</b><p>' + escapeHtml(t.noteKnowledge) + '</p></div>';
    if(t.noteRemark) rows += '<div class="kb-card-row"><b>备注</b><p>' + escapeHtml(t.noteRemark) + '</p></div>';
    return '<div class="kb-card">' +
      '<div class="kb-card-head">' +
        '<span class="kb-card-name">' + escapeHtml(t.name) + '</span>' +
        '<span class="kb-card-date">' + escapeHtml(dateLabel) + '</span>' +
        '<button class="kb-card-edit" type="button" data-kb-edit="' + t.id + '">编辑</button>' +
      '</div>' +
      frameworkHtml +
      rows +
    '</div>';
  }
  // ========== 技能路线：「我想学 ___」→ 出一条分阶段的路线 → 一键变成任务和关卡 ==========
  // 诚实的地方在这儿：这条路上的 Claude <b>上不了网</b>，所以它<b>给不了链接</b>——给了也是编的。
  // 它能给的是：分几个阶段、每个阶段学到什么算过、每天具体做什么，以及<b>该拿什么词去哪儿搜</b>。
  // 真链接要么等你那台后端通了（它能真查），要么你在聊天里让我查，我这边是能上网的。
  var skillPlan = null;      // 出来的路线，纯运行时，不落账号数据
  var skillBusy = false;
  var skillErr = '';
  // 搜索词旁边那一排"直接去搜"的按钮。
  // 这一页自己上不了网，给不了具体链接（给了也是编的）——但<b>你的浏览器能上网</b>。
  // 所以把搜索词拼成各家的搜索结果地址，点一下新标签页直接打开真结果：
  // B站出视频，百度出网页，知乎出长文，菜鸟出语法手册。这是"不联网"能做到的最接近"直接给你结果"的事。
  var SKILL_SEARCH_SITES = [
    { key: 'bili', label: '📺 B站', url: 'https://search.bilibili.com/all?keyword=' },
    { key: 'baidu', label: '🔍 百度', url: 'https://www.baidu.com/s?wd=' },
    { key: 'zhihu', label: '知乎', url: 'https://www.zhihu.com/search?type=content&q=' },
    { key: 'runoob', label: '菜鸟', url: 'https://www.runoob.com/?s=' }
  ];
  // 学习资料入口：保留官方站点跳转，也允许用本机后端做 site: 全网检索。
  // 这里不把站点内容伪装成已经读到；只有用户点「读进学习资料」后才会调用正文接口。
  var SKILL_SOURCE_PRESETS = [
    { key: 'modelscope', label: '魔搭 ModelScope', home: 'https://modelscope.cn', query: 'site:modelscope.cn ' },
    { key: 'datawhale', label: 'Datawhale', home: 'https://www.datawhale.cn', query: 'site:datawhale.cn ' },
    { key: 'woshipm', label: '人人都是产品经理', home: 'https://www.woshipm.com', query: 'site:woshipm.com ' }
  ];
  var skillSearchBusy = false;
  var skillSearchQuery = '';
  var skillSearchResults = [];
  var skillSearchMsg = '';
  var skillSourceLinks = [];
  var wechatReaderBusy = false;
  var wechatReaderMsg = '';
  function materialHostForSkill(url){
    try { return new URL(String(url || '')).hostname; } catch(e) { return ''; }
  }
  function searchRowHtml(q){
    var enc = encodeURIComponent(q);
    return '<span class="skill-search-row">' +
      '<code>' + escapeHtml(q) + '</code>' +
      SKILL_SEARCH_SITES.map(function(s){
        return '<a class="skill-search-go" href="' + s.url + enc + '" target="_blank" rel="noopener noreferrer">' +
          s.label + '</a>';
      }).join('') +
    '</span>';
  }
  var skillFromSource = false; // 这条路线是不是照着你自己粘的资料排的
  var skillLinkIgnored = '';   // 你粘了链接但这一页读不了，被跳过的那条——结果里必须点名，不能装作没这回事
  var skillCut = 0;            // 资料超长被切掉了多少字（切了必须明说）
  var skillShots = [];         // 上传的截图（File 对象，纯运行时，不落任何数据）
  var skillFromShots = false;
  // 这张卡是整片 innerHTML 重刷的，所以每次重画之前得先把人已经填的东西接住，
  // 不然传个截图就把刚粘好的一万字正文冲没了。
  var skillSourceText = '';
  var skillSrcOpen = false;
  var skillNameText = '';
  function skillCaptureInputs(){
    var s = document.getElementById('skillSourceInput');
    if(s) skillSourceText = s.value;
    var n = document.getElementById('skillNameInput');
    if(n) skillNameText = n.value;
    // 每周小时那个数字框只在第 2 步存在——在的时候接住，不在的时候保持原值
    var hr = document.getElementById('skillHoursInput');
    if(hr && hr.value !== '') skillHours = Math.max(1, Math.min(60, Number(hr.value) || 8));
    var d = document.querySelector('.skill-src');
    if(d) skillSrcOpen = !!d.open;
  }
  // 重画 = 先接住已填内容，再刷
  function skillRerender(){ skillCaptureInputs(); renderKnowledgeView(); }
  // 粘进来的东西到底是不是"就一条链接"。是的话必须当场拦住——
  // 这页发不出对外请求，链接它打不开，让它硬排只会排出一个「资料无法访问」的废阶段，
  // 还白花一次额度。拦在发出去之前，把能走的两条路直接摆给人看。
  // ——链接这条路——
  // 只有连上你自己那台后端才可能走通：App 这一页发不出对外请求，是平台的硬限制。
  // 后端在的时候，飞书链接走 /api/feishu（tenant token → wiki 节点转文档 token → 读正文），
  // B站链接走 /api/video（标题/简介/分P/章节点；字幕拿不到，那边会如实说）。
  var skillLinkMsg = '';
  function skillLinkKind(url){
    var s = String(url || '').trim();
    if(!s) return '';
    if(/feishu\.cn|larksuite\.com/i.test(s)) return 'feishu';
    if(/(?:^|\.)(?:bilibili\.com|b23\.tv|youtube\.com|youtu\.be|douyin\.com|vimeo\.com)$/i.test((function(){try{return new URL(s).hostname}catch(_){return ''}})())) return 'video';
    // 剩下的凡是个正经网址，都走通用抓正文（人人都是产品经理、AI星球、知乎、博客……）。
    // 抓不抓得到要看对方站点：服务端渲染的能抓到，靠 JS 才渲染的（小红书/抖音）只会拿到空壳，
    // 那种情况后端会回 thin:true，这边如实转述，不拿空结果假装成功。
    if(/^https?:\/\/[^\s]+\.[^\s]/i.test(s)) return 'web';
    return 'other';
  }
  function skillLinkHtml(){
    var canFeishu = backendOn('feishu'), canVideo = backendOn('video'), canWeb = backendOn('extract');
    if(!canFeishu && !canVideo && !canWeb){
      // 没后端。这里不摆一个点了没反应的输入框——那是最气人的设计。直接说清楚为什么。
      return '<p class="skill-src-note skill-nolink">🔗 <b>直接粘链接（网页 / 飞书文档 / B站视频）这条，现在没有。</b>' +
        '不是没做，是这一页跑在 claude.ai 上、<u>发不出任何对外请求</u>，链接它够不着。' +
        '代码我已经写好了（网页、飞书、B站 三条路由都在部署包里），' +
        '<b>等你那台后端连上，这个框会自己出现。</b>在那之前：复制正文，或者截图。</p>';
    }
    var kinds = [];
    if(canWeb) kinds.push('网页文章');
    if(canFeishu) kinds.push('飞书文档');
    if(canVideo) kinds.push('B站视频');
    return '<div class="skill-link">' +
      '<label class="skill-link-row">🔗 <span>粘一条' + kinds.join(' / ') + '链接，我去读</span>' +
      '<input type="text" id="skillLinkInput" placeholder="' +
        (canWeb ? 'https://www.woshipm.com/… / https://www.aixq.cc/… 或飞书、B站链接' : 'https://xxx.feishu.cn/wiki/… 或 B站视频链接') + '" value="' +
        escapeHtml(skillLinkText) + '">' +
      '<button class="btn btn-ghost btn-sm" type="button" id="skillLinkGoBtn"' + (skillLinkBusy ? ' disabled' : '') + '>' +
        (skillLinkBusy ? '读取中…' : '读进来') + '</button></label>' +
      (skillLinkMsg ? ('<p class="skill-link-msg">' + skillLinkMsg + '</p>') : '') +
      '<p class="skill-src-note">读到的正文会填进上面那个框，你能先看一眼对不对，再点「排一条路线」。' +
      (canWeb ? '网页按服务器抓正文——<b>靠 JS 才渲染的站点（小红书、抖音）只能抓到空壳</b>，遇到了会直接告诉你，不糊弄。' : '') +
      (canVideo ? '视频只拿得到标题/简介/分P/章节——<b>字幕拿不到</b>（B站把字幕关到登录态后面了），所以是按目录拆，不是听懂了每一句。' : '') +
      '</p>' +
      (canWeb ? ('<p class="skill-srcs2"><b>常去的两个：</b>' +
        '<span class="mini-source-text">人人都是产品经理</span>' +
        '<span class="mini-source-text">AI星球</span>' +
        '<span>—— 找到那篇文章，把地址栏里的链接整条粘上来就行。</span></p>') : '') +
      '</div>';
  }
  function skillSourceHubHtml(){
    var canSearch = backendOn('search') || backendOn('searchFallback');
    var query = skillSearchQuery || skillNameText || '';
    var h = '<div class="skill-source-hub">' +
      '<div class="skill-source-hub-head"><b>接入公开学习资料</b><span>魔搭、Datawhale、人人都是产品经理，也可以全网搜</span></div>' +
      '<div class="skill-source-presets">' + SKILL_SOURCE_PRESETS.map(function(s){
        var direct = 'https://www.google.com/search?q=' + encodeURIComponent(s.query + query);
        return '<a class="skill-source-chip" href="' + s.home + '" target="_blank" rel="noopener noreferrer" title="打开' + escapeHtml(s.label) + '">' +
          escapeHtml(s.label) + '</a><a class="skill-source-chip skill-source-chip-search" href="' + direct + '" target="_blank" rel="noopener noreferrer" title="在搜索引擎中搜索' + escapeHtml(s.label) + '">搜此站</a>';
      }).join('') + '</div>' +
      '<div class="skill-web-search-row">' +
        '<input id="skillWebSearchInput" type="search" value="' + escapeHtml(query) + '" placeholder="例如：RAG 入门、Python 数据分析、AI Agent" aria-label="全网搜索技能资料">' +
        '<button class="btn btn-ghost btn-sm" type="button" id="skillWebSearchBtn"' + (!canSearch || skillSearchBusy ? ' disabled' : '') + '>' +
          (skillSearchBusy ? '搜索中…' : '全网搜索') + '</button>' +
      '</div>' +
      '<p class="skill-source-note">全网搜索只返回公开网页。选中结果后点「读进学习资料」，正文会进入路线资料框；原始链接会随后续阶段任务保存。</p>';
    h += '<div class="skill-local-source">' +
      '<div class="skill-local-source-copy"><b>本机微信资料</b><span>连接你电脑上的微信读取器；需要先在读取器里登录电脑版微信并完成初始化。</span></div>' +
      '<div class="skill-local-source-actions">' +
        '<button class="btn btn-ghost btn-sm" type="button" id="skillWechatOpenBtn">打开微信客户端</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" id="skillWechatReaderBtn">打开微信读取器</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" id="skillWechatCheckBtn"' + (wechatReaderBusy ? ' disabled' : '') + '>' + (wechatReaderBusy ? '检查中…' : '检查读取器') + '</button>' +
      '</div>' +
      (wechatReaderMsg ? '<p class="skill-local-source-msg">' + wechatReaderMsg + '</p>' : '') +
      '<p class="skill-source-note">网页不会绕过微信权限直接读取私聊或群聊；读取器响应后，请在它的会话界面选择群聊并生成资料包，再把导出的 Markdown/TXT 拖入本机资料舱。</p>' +
    '</div>';
    if(!canSearch) h += '<p class="skill-source-note skill-source-warn">本机服务未连接，先启动「启动闯关陪跑.cmd」才能把搜索结果读回网页；下面的站点按钮仍可真实打开。</p>';
    if(skillSearchMsg) h += '<p class="skill-link-msg">' + skillSearchMsg + '</p>';
    if(skillSearchResults.length){
      h += '<div class="skill-web-results"><b>搜索结果 · ' + escapeHtml(skillSearchQuery) + '</b>';
      skillSearchResults.forEach(function(row, i){
        var safeUrl = materialHostForSkill(row.url) && /^https?:\/\//i.test(String(row.url || '')) ? String(row.url) : '';
        if(!safeUrl) return;
        h += '<article class="skill-web-result">' +
          '<a class="skill-web-result-title" href="' + escapeHtml(safeUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(row.title || safeUrl) + '</a>' +
          '<span class="skill-web-result-source">' + escapeHtml(row.source || '') + '</span>' +
          (row.snippet ? '<p>' + escapeHtml(row.snippet) + '</p>' : '') +
          '<button class="btn btn-ghost btn-sm" type="button" data-skill-read-result="' + i + '">读进学习资料</button>' +
        '</article>';
      });
      h += '</div>';
    }
    return h + '</div>';
  }
  async function runSkillWebSearch(){
    var input = document.getElementById('skillWebSearchInput');
    var query = String(input && input.value || skillNameText || '').trim();
    if(!query){ skillSearchMsg = '先写一个技能名或搜索词。'; skillRerender(); return; }
    if(!(backendOn('search') || backendOn('searchFallback'))){
      skillSearchMsg = '本机服务未连接；可以先打开上面的站点，或启动本地服务后再全网搜索。';
      skillRerender(); return;
    }
    skillSearchQuery = query.slice(0, 350);
    skillSearchBusy = true; skillSearchMsg = '正在搜索公开网页…'; skillSearchResults = [];
    skillRerender();
    var r = await backendCall('/api/search', { q: skillSearchQuery, n: 8 }, 30000);
    skillSearchBusy = false;
    if(!r.ok){ skillSearchMsg = '搜索失败：' + escapeHtml(String(r.error || '本机服务没有返回结果')); skillRerender(); return; }
    skillSearchResults = (r.data && Array.isArray(r.data.results)) ? r.data.results : [];
    skillSearchMsg = skillSearchResults.length ? ('已找到 ' + skillSearchResults.length + ' 条公开结果（' + escapeHtml(String(r.data.provider || '公开搜索')) + '）。') : '没有找到可用结果。';
    skillRerender();
  }
  async function readSkillSearchResult(index){
    var row = skillSearchResults[index];
    if(!row || !materialHostForSkill(row.url) || !/^https?:\/\//i.test(String(row.url || ''))) return;
    skillSearchBusy = true; skillSearchMsg = '正在读取《' + escapeHtml(String(row.title || row.url)) + '》…';
    skillRerender();
    var r = await backendCall('/api/extract', { url: row.url }, 60000);
    skillSearchBusy = false;
    if(!r.ok){ skillSearchMsg = '这条网页没读成：' + escapeHtml(String(r.error || '正文读取失败')) + '；可以点标题在浏览器打开后复制正文。'; skillRerender(); return; }
    var d = r.data || {};
    var text = String(d.text || '').trim();
    if(!text || d.thin){
      skillSearchMsg = '这个页面正文很少或依赖登录/JavaScript，不能假装已经读全；请打开原文后复制正文。';
      skillRerender(); return;
    }
    skillSourceText = (skillSourceText ? skillSourceText + '\n\n' : '') + '【公开网页：' + String(d.title || row.title || '资料') + '】\n' + text;
    skillSrcMode = 'text';
    skillSourceLinks.push({ id: uid(), url: row.url, title: String(d.title || row.title || row.url).slice(0, 300), description: String(row.snippet || '').slice(0, 600), source: String(row.source || '').slice(0, 180), addedAt: Date.now() });
    skillSearchMsg = '已把《' + escapeHtml(String(d.title || row.title || '这篇资料')) + '》读进资料框。先核对正文，再点「排一条路线」。';
    skillRerender();
  }
  function openWechatClientFromSkill(){
    var link = document.createElement('a');
    link.href = 'weixin://'; link.rel = 'noopener';
    document.body.appendChild(link); link.click(); link.remove();
    wechatReaderMsg = '已尝试唤起微信客户端；这只负责打开客户端，不代表网页已经读取到聊天内容。';
    skillRerender();
  }
  function openWechatReaderFromSkill(){
    var win = window.open('http://127.0.0.1:8787/', '_blank', 'noopener,noreferrer');
    wechatReaderMsg = win ? '已打开本机微信读取器。请在读取器里完成登录、初始化和会话选择。' : '浏览器拦截了新窗口，请允许打开本机读取器。';
    skillRerender();
  }
  async function checkWechatReaderFromSkill(){
    if(wechatReaderBusy) return;
    wechatReaderBusy = true;
    wechatReaderMsg = '正在检查 http://127.0.0.1:8787/ 是否有本机读取器响应…';
    skillRerender();
    try{
      var response = await fetch('http://127.0.0.1:8787/', {method:'GET', mode:'no-cors', cache:'no-store'});
      wechatReaderMsg = response.type === 'opaque'
        ? '本机读取器地址已响应。网页无法读取它的内部会话数据，请在读取器页面里登录并选择需要的群聊。'
        : '本机读取器已响应（HTTP ' + response.status + '）。请在读取器页面里完成登录和会话选择。';
    }catch(e){
      wechatReaderMsg = '未检测到本机微信读取器（127.0.0.1:8787）。请先启动附件中的读取器，再点击检查；网页不会把未启动显示成已连接。';
    }
    wechatReaderBusy = false;
    skillRerender();
  }
  var skillLinkText = '';
  var skillLinkBusy = false;
  // 真去读。读回来的内容填进「资料」框，人能先过一眼再排——不直接替人拍板。
  async function runSkillLink(){
    var el = document.getElementById('skillLinkInput');
    var rawUrl = (el && el.value || '').trim();
    var url = window.SYSourceIO ? (SYSourceIO.normalizeLinks(rawUrl)[0] || '') : rawUrl;
    if(!url){ alert('先粘一条链接。'); return; }
    if(el) el.value = url;
    skillCaptureInputs();
    await backendProbe(true);
    skillLinkText = url;
    var kind = skillLinkKind(url);
    if(kind === 'other'){
      skillLinkMsg = '⚠️ 这个不像一条网址（要以 http:// 或 https:// 开头）。直接复制正文粘进下面的框也一样能排。';
      renderKnowledgeView(); return;
    }
    if(kind === 'feishu' && !backendOn('feishu')){
      skillLinkMsg = '⚠️ 后端还没配飞书的两条环境变量（FEISHU_APP_ID / FEISHU_APP_SECRET）。';
      renderKnowledgeView(); return;
    }
    if(kind === 'video' && !backendOn('video')){
      skillLinkMsg = '⚠️ 这台后端没开视频这条。';
      renderKnowledgeView(); return;
    }
    if(kind === 'web' && !backendOn('extract')){
      skillLinkMsg = '⚠️ 这台后端没开抓网页这条。';
      renderKnowledgeView(); return;
    }
    skillLinkBusy = true; skillLinkMsg = '正在读…';
    renderKnowledgeView();
    var route = kind === 'feishu' ? '/api/feishu' : (kind === 'video' ? '/api/video-extract' : '/api/extract');
    var r = await backendCall(route, { url: url }, 60000);
    skillLinkBusy = false;
    if(!r.ok){
      // 后端的报错里带着「怎么修」，一定要原样透出来——飞书那几个 403 全靠这句话才修得动
      skillLinkMsg = '❌ 没读成：' + escapeHtml(String(r.error || '')) +
        (r.data && r.data.how ? ('<br><b>怎么办：</b>' + escapeHtml(String(r.data.how))) : '');
      renderKnowledgeView(); return;
    }
    var d = r.data || {};
    if(kind === 'feishu'){
      skillSourceText = String(d.content || '');
      if(!skillNameText && d.title) skillNameText = String(d.title);
      skillSourceLinks.push({ id: uid(), url: url, title: String(d.title || '飞书文档').slice(0, 300), description: '通过飞书文档接口读取的正文', source: '飞书', addedAt: Date.now() });
      skillLinkMsg = '✅ 读到了《' + escapeHtml(String(d.title || '这篇文档')) + '》，共 ' + (d.chars || 0) + ' 字。' +
        '已经填到下面的资料框里，你先过一眼，再点「排一条路线」。';
    } else if(kind === 'web'){
      // thin=true 是后端在说"这页靠 JS 渲染，我只抓到个空壳"。这种时候绝不能装作成功，
      // 否则接下来那条路线就是照着一段导航栏文字编出来的。
      if(d.thin){
        skillSourceText = String(d.text || '');
        skillLinkMsg = '⚠️ <b>这个页面没抓到正文。</b>' + escapeHtml(String(d.note || '')) +
          '<br>下面框里现在只有摘要那点字，<b>照这个排出来的路线是不作数的</b>——' +
          '打开那篇文章 Ctrl+A 复制正文粘进来，或者截图上传。';
      } else {
        skillSourceText = String(d.text || '');
        if(!skillNameText && d.title) skillNameText = String(d.title);
        skillSourceLinks.push({ id: uid(), url: url, title: String(d.title || '网页文章').slice(0, 300), description: String(d.note || '').slice(0, 600), source: String(d.source || materialHostForSkill(url)).slice(0, 180), addedAt: Date.now() });
        skillLinkMsg = '✅ 读到了《' + escapeHtml(String(d.title || '这篇文章')) + '》，共 ' + (d.chars || 0) + ' 字' +
          ((d.chars || 0) >= 20000 ? '（到上限了，后面的没读）' : '') + '。' +
          '已经填到下面的资料框里，你先过一眼是不是正文，再点「排一条路线」。';
      }
    } else {
      var info = d.info || {};
      if(!info.title) info.title = d.title;
      var parts = [];
      if(info.title) parts.push('视频标题：' + info.title);
      if(info.owner) parts.push('UP主：' + info.owner);
      if(info.seconds) parts.push('时长：' + Math.round(info.seconds / 60) + ' 分钟');
      if((info.pages || []).length > 1) parts.push('分P：\n' + info.pages.map(function(p){ return p.n + '. ' + p.title; }).join('\n'));
      if((info.chapters || []).length) parts.push('章节点：\n' + info.chapters.map(function(c){ return '- ' + c.title; }).join('\n'));
      if(info.desc) parts.push('简介：\n' + info.desc);
      skillSourceText = String(d.text || d.content || parts.join('\n\n'));
      if(d.thin || !d.transcript) {
        skillLinkMsg = '⚠️ ' + escapeHtml(String(d.note || '仅取得视频简介，未取得字幕。请上传字幕文件后再排路线。'));
        skillSrcOpen = true; renderKnowledgeView(); return;
      }
      skillSourceLinks.push({id:uid(),url:url,title:String(d.title || info.title || '视频资料'),source:'视频字幕',addedAt:Date.now()});
      if(!skillNameText && info.title) skillNameText = String(info.title);
      skillLinkMsg = '✅ 读到了《' + escapeHtml(String(info.title || '这条视频')) + '》。' +
        escapeHtml(String(info.subtitleNote || '')) + ' 内容已填到下面，先过一眼再排。';
    }
    skillSrcOpen = true;
    renderKnowledgeView();
  }
  // 截图这条路能不能走，复用摄像头那边已经探过的 sample 图片能力，不重复探。
  function skillVisionOn(){ return sampleVisionOn(); }
  function skillShotMax(){
    var n = sampleVisionCap && sampleVisionCap.maxCount;
    return Math.max(1, Math.min(8, Number(n) || 4));
  }
  function looksLikeBareLink(s){
    var t = String(s || '').trim();
    if(!t) return false;
    if(t.length > 400) return false;              // 长文里夹着链接，那是正常资料
    var urls = t.match(/https?:\/\/\S+/g) || [];
    if(!urls.length) return false;
    var rest = t.replace(/https?:\/\/\S+/g, '').replace(/[\s，,。.、:：\-—|]/g, '');
    return rest.length < 25;                      // 去掉链接和标点后基本没剩什么 = 就是条链接
  }
  // ===== 「大厂是怎么干的」案例库 =====
  // 这些是真case，每一条的数字都来自一手出处（哈佛商业评论、Airbnb 工程博客、字节数据平台），
  // 不是二手转述、更不是编的。每条都带 src + url，人要能自己回去核。
  // ⚠️ 铁规矩：这个库里只放核实过出处的。核不到出处的宁可不放，也不许凑数。
  var CASE_LIB = [{
    key: 'abtest',
    topic: 'AB 测试 / 在线实验',
    match: /AB\s*测试|A\s*\/\s*B|ab\s*test|在线实验|对照实验|实验设计|显著性|统计基础|假设检验/i,
    cases: [{
      who: 'Bing（微软）',
      head: '一个被压了几个月的小点子，值一年一个亿',
      body: '有个员工提了一处改广告标题显示方式的小改动，被判低优先级，在待办里压了好几个月。终于跑了一次 A/B，结果是 Bing 史上最赚钱的一个点子。',
      num: '收入 +12%　年化 >$1 亿（仅美国）',
      learn: '你觉得「这么小的改动能有多大用」——这个判断本身就很可能是错的。所以才要测，而不是靠拍脑袋排优先级。',
      src: '哈佛商业评论 · The Surprising Power of Online Experiments',
      url: 'https://hbr.org/2017/09/the-surprising-power-of-online-experiments'
    }, {
      who: 'Airbnb',
      head: '交易太少、A/B 跑不动，他们换了一种实验设计',
      body: '搜索排序想测的东西很多，但下单频次低，一个 A/B 要跑很久才够样本。他们改用 interleaving：把两套排序的结果混在一起给同一个用户看，直接比同一个人点了谁。',
      num: '提速 50×　只占 6% 流量　1/3 时长　与 A/B 结论一致率 82%',
      learn: '样本不够别硬等。极端案例里只花了 0.5% 的时长、4% 的流量就得出了同样结论——换设计比加时间管用。',
      src: 'Airbnb 工程博客 · Beyond A/B Test',
      url: 'https://airbnb.tech/data/beyond-a-b-test-speeding-up-airbnb-search-ranking-experimentation-through-interleaving/'
    }, {
      who: '字节跳动',
      head: '一天新增 4000 个实验是什么概念',
      body: '2023 年中，字节的 A/B 平台服务 500 多条业务，累计开过 240 万+ 个实验，每天新增 4000 多个，线上同时在跑的有 5 万多个。',
      num: '累计 240 万+　日新增 4000+　同时在跑 5 万+',
      learn: '两条能直接抄的经验：① 实验周期建议 ≥14 天，覆盖两个完整周，消掉工作日和周末的差异；② <b>指标一开始下跌不要马上停</b>，有些策略短期掉、长期赚，建议再跑一周以上。',
      src: '字节跳动数据平台 · A/B 实验在推荐系统中的应用',
      url: 'https://www.cnblogs.com/bytedata/p/17999746'
    }]
  }];
  function findCases(topic){
    var t = String(topic || '');
    for(var i = 0; i < CASE_LIB.length; i++){ if(CASE_LIB[i].match.test(t)) return CASE_LIB[i]; }
    return null;
  }
  // 「去哪儿学」：先问想怎么学，再给对应的去处。
  // 不再平铺一排按钮——那是堆积，不是设计。挑一种方式，只给这种方式对口的两三个去处。
  var LEARN_WAYS = [
    { key: 'video', icon: '📺', label: '看视频', hint: '有人讲给你听，入门最快',
      sites: [
        { n: 'B站', u: 'https://search.bilibili.com/all?keyword=', tag: '国内' },
        { n: 'YouTube', u: 'https://www.youtube.com/results?search_query=', tag: '外网' }
      ] },
    { key: 'article', icon: '📄', label: '读文章', hint: '别人的踩坑记录最值钱',
      sites: [
        { n: '知乎', u: 'https://www.zhihu.com/search?type=content&q=', tag: '国内' },
        { n: 'CSDN', u: 'https://so.csdn.net/so/search?q=', tag: '国内' },
        { n: '掘金', u: 'https://juejin.cn/search?query=', tag: '国内' },
        { n: 'Medium', u: 'https://medium.com/search?q=', tag: '外网' }
      ] },
    { key: 'blog', icon: '🏢', label: '大厂官方博客', hint: '一手资料，数字可信',
      sites: [
        { n: '搜各家工程博客', u: 'https://www.google.com/search?q=' +
            encodeURIComponent('(site:netflixtechblog.com OR site:airbnb.tech OR site:medium.com/airbnb-engineering OR site:engineering.fb.com OR site:blog.google) ') + '%2B', tag: '外网' },
        { n: '国内大厂技术号', u: 'https://www.google.com/search?q=' +
            encodeURIComponent('(site:tech.meituan.com OR site:cnblogs.com/bytedata OR site:developer.aliyun.com) ') + '%2B', tag: '国内' }
      ] },
    { key: 'paper', icon: '📐', label: '啃原文论文', hint: '最硬，但最准',
      sites: [
        { n: 'arXiv', u: 'https://arxiv.org/abs/?searchtype=all&query=', tag: '外网' },
        { n: 'Google 学术', u: 'https://scholar.google.com/scholar?q=', tag: '外网' }
      ] }
  ];

  var SKILL_LEVELS = [
    ['zero', '完全零基础'],
    ['some', '知道一点，做不出来'],
    ['mid',  '能做简单的，想系统化']
  ];
  // ——分步向导的状态——
  // 原来这张卡一屏塞了六组东西（技能名+水平+小时、资料框、链接框、截图、资料源、一大段警告），
  // 第一眼看过去不知道该先动哪个。改成三步：一屏只问一件事，答完再问下一件。
  // 水平和每周小时以前是直接从 DOM 读的，分步之后那两个控件不在当前屏上，
  // 所以必须存在这两个变量里——不然走到第 3 步一点「排一条路线」就读不到了。
  var skillStep = 1;           // 1=学什么 2=水平和时间 3=有没有资料
  var skillLevel = 'zero';
  var skillHours = 8;
  var skillSrcMode = '';       // ''=还没选 'text'=粘正文 'shot'=传截图 'none'=没有，直接排
  var SKILL_HOUR_PRESETS = [4, 8, 12, 20];
  // 第 1 步：你想学什么
  function skillStep1Html(){
    return '<div class="sw-body">' +
      '<p class="sw-q">你想学什么？</p>' +
      '<input type="text" id="skillNameInput" class="sw-big-input" maxlength="40" autocomplete="off"' +
        ' placeholder="搭建自己的AI分身" value="' + escapeHtml(skillNameText) + '">' +
      '<p class="sw-hint">一句话就行。它会按这个排一条分阶段的路线，每个阶段能<b>一键变成任务和关卡</b>，直接进你的清单。</p>' +
      // 手上已经有教程了的人，本来就不用先想技能名——资料本身就说明了要学什么。
      // 没有这个出口，向导会把这条路堵死（老版本是允许的）。
      '<button type="button" class="sw-skip" id="swSkipToSrc">我已经有现成的教程资料，直接跳到最后一步 →</button>' +
      '<div class="sw-nav"><span></span>' +
        '<button class="btn btn-primary btn-sm" type="button" id="swNext">下一步 →</button></div>' +
    '</div>';
  }
  // 第 2 步：什么水平、每周几小时
  function skillStep2Html(){
    return '<div class="sw-body">' +
      '<p class="sw-q">你现在什么水平？</p>' +
      '<div class="sw-opts">' + SKILL_LEVELS.map(function(l){
        return '<button type="button" class="sw-opt' + (skillLevel === l[0] ? ' is-on' : '') +
          '" data-skilllevel="' + l[0] + '">' + escapeHtml(l[1]) + '</button>';
      }).join('') + '</div>' +
      '<p class="sw-q sw-q2">每周能投入几小时？</p>' +
      '<div class="sw-opts">' + SKILL_HOUR_PRESETS.map(function(n){
        return '<button type="button" class="sw-opt sw-opt-h' + (Number(skillHours) === n ? ' is-on' : '') +
          '" data-skillhours="' + n + '">' + n + ' 小时</button>';
      }).join('') +
        // 光摆一个数字框会被当成第五个档位。写清楚"其他…小时"，它才像个能自己填的地方。
        '<label class="sw-hours-wrap">其他 ' +
          '<input type="number" id="skillHoursInput" class="sw-hours" min="1" max="60" step="1" value="' +
          escapeHtml(String(skillHours)) + '" aria-label="每周能投入几小时"> 小时</label>' +
      '</div>' +
      '<p class="sw-hint">这两个决定它给你排几个阶段、每个阶段多少周。填个大概就行，以后能改。</p>' +
      '<div class="sw-nav">' +
        '<button class="btn btn-ghost btn-sm" type="button" id="swBack">← 上一步</button>' +
        '<button class="btn btn-primary btn-sm" type="button" id="swNext">下一步 →</button></div>' +
    '</div>';
  }
  // 第 3 步：有没有自己的资料
  function skillStep3Html(){
    var h = '<div class="sw-body">' +
      '<p class="sw-q">有自己的教程资料吗？</p>' +
      '<div class="sw-opts sw-opts-mode">' +
        '<button type="button" class="sw-mode' + (skillSrcMode === 'text' ? ' is-on' : '') + '" data-skillsrcmode="text">' +
          '<b>📄 粘正文</b><span>飞书文档、公众号文章、课程大纲</span></button>' +
        (skillVisionOn()
          ? ('<button type="button" class="sw-mode' + (skillSrcMode === 'shot' ? ' is-on' : '') + '" data-skillsrcmode="shot">' +
             '<b>📷 传截图</b><span>懒得复制，直接截图给它看</span></button>')
          : '') +
        '<button type="button" class="sw-mode' + (skillSrcMode === 'none' ? ' is-on' : '') + '" data-skillsrcmode="none">' +
          '<b>🧠 没有</b><span>按它自己的知识排一条</span></button>' +
      '</div>';

    if(skillSrcMode === 'text'){
      h += '<div class="sw-panel">' +
        '<textarea id="skillSourceInput" rows="7" placeholder="打开文档或聊天资料 → Ctrl+A 全选 → 复制 → 粘到这儿。也可以用下面的全网搜索，把公开网页正文读进来。">' +
          escapeHtml(skillSourceText) + '</textarea>' +
        '<p class="sw-hint">粘了资料，第 1 步那个技能名可以不填——资料本身就说明了要学什么。' +
        '最多读 ' + (SKILL_SOURCE_MAX / 10000) + ' 万字，超了会告诉你切掉多少。</p>' +
        skillLinkHtml() +
        skillSourceHubHtml() +
      '</div>';
    } else if(skillSrcMode === 'shot'){
      h += '<div class="sw-panel">' +
        '<label class="skill-shot-btn" for="skillShotInput">📷 选截图（最多 ' + skillShotMax() + ' 张）</label>' +
        '<input type="file" id="skillShotInput" accept="image/png,image/jpeg,image/webp" multiple hidden>' +
        (skillShots.length ? ('<p class="skill-shot-list">已选 <b>' + skillShots.length + '</b> 张：' +
          skillShots.map(function(f){ return escapeHtml(f.name || '截图'); }).join('、') +
          ' <button type="button" class="skill-shot-clear" id="skillShotClear">清空</button></p>') : '') +
        '<p class="sw-hint">文档截图、文章截图、大纲照片都行，它看图里的内容排。' +
        '但<b>字特别多的长截图容易看漏</b>——重要的那几页分开截清楚点。</p>' +
      '</div>';
    } else if(skillSrcMode === 'none'){
      h += '<div class="sw-panel">' +
        '<p class="sw-hint">⚠️ 那它就<b>按自己已有的知识排</b>，不是照着哪一份具体资料。' +
        '<b>它上不了网，所以不给你链接</b>——给了也是编的。它给的是「分几步、每步学到什么算过、该拿什么词去哪儿搜」，' +
        '搜索词旁边会有按钮，点一下直接开搜索结果页。<br>' +
        '想要真能点开的链接和视频：<b>在聊天里跟我说想学什么，我这边能上网，我查完贴给你。</b></p>' +
      '</div>';
    }

    // 没选之前那个按钮是灰的——必须写一句为什么，不然人对着一个点不动的按钮发懵
    if(!skillSrcMode && !skillBusy){
      h += '<p class="sw-hint sw-need">↑ 先挑一条，上面三个随便点一个都行。</p>';
    }
    h += '<div class="sw-nav">' +
      '<button class="btn btn-ghost btn-sm" type="button" id="swBack">← 上一步</button>' +
      '<button class="btn btn-primary btn-sm sw-go" type="button" id="skillGoBtn"' +
        ((skillBusy || !skillSrcMode) ? ' disabled' : '') + '>' +
        (skillBusy ? '正在排…' : '排一条路线') + '</button></div>' +
    '</div>';
    return h;
  }

  // ===== 案例弹窗 =====
  // 两段：上面是核实过的真案例，下面是「想怎么学 → 去哪儿」，由你自己挑。
  // 案例库里没有这个主题时，不硬凑——直接说没有，只给「去哪儿学」那一段。
  var caseTopic = '', caseWay = '', caseAsk = '', caseAskBusy = false;
  function openCaseModal(topic){
    caseTopic = String(topic || '').slice(0, 60);
    caseWay = ''; caseAsk = ''; caseAskBusy = false;
    var ov = document.getElementById('caseOverlay');
    if(!ov) return;
    ov.hidden = false;
    renderCaseModal();
  }
  function closeCaseModal(){
    var ov = document.getElementById('caseOverlay');
    if(ov) ov.hidden = true;
    caseAsk = ''; caseAskBusy = false;
  }
  function renderCaseModal(){
    var sub = document.getElementById('caseSub');
    var body = document.getElementById('caseBody');
    if(!body) return;
    var hit = findCases(caseTopic);
    if(sub) sub.textContent = caseTopic ? ('关于：' + caseTopic) : '';

    var h = '';
    if(hit){
      h += '<p class="case-lead">下面这 ' + hit.cases.length + ' 个都是<b>真事</b>，每个数字都能点进原文核对——' +
        '不是我编的，也不是二手转述。</p>';
      h += '<div class="case-list">' + hit.cases.map(function(c){
        return '<article class="case-item">' +
          '<p class="case-who">' + escapeHtml(c.who) + '</p>' +
          '<p class="case-head">' + escapeHtml(c.head) + '</p>' +
          '<p class="case-num">' + escapeHtml(c.num) + '</p>' +
          '<p class="case-body">' + escapeHtml(c.body) + '</p>' +
          '<p class="case-learn"><b>你能学到的：</b>' + c.learn + '</p>' +
          '<span class="mini-source-text">' +
            '出处：' + escapeHtml(c.src) + ' ↗</span>' +
        '</article>';
      }).join('') + '</div>';
    } else {
      h += '<p class="case-lead case-none">「' + escapeHtml(caseTopic || '这个主题') + '」我这儿<b>还没有核实过出处的大厂案例</b>。' +
        '凑一个给你没意义——编出来的案例比没有还糟。' +
        (sampleOn() ? '要么让 Claude 现场讲几个它知道的（<b>它上不了网，给不了链接，只能靠已有知识</b>），要么直接往下看去哪儿学。' : '往下看去哪儿学。') +
        '</p>';
    }

    // ——现场问 Claude 再要几个——
    if(sampleOn()){
      h += '<div class="case-more">' +
        '<button class="btn btn-ghost btn-sm" type="button" id="caseAskBtn"' + (caseAskBusy ? ' disabled' : '') + '>' +
          (caseAskBusy ? '正在想…' : (hit ? '💭 再要几个（现场问 Claude）' : '💭 让 Claude 讲几个')) + '</button>' +
        '<span class="case-more-note">现场生成，花你自己的 Claude 额度；<b>它上不了网，所以不会给链接</b>——公司名和做法它知道，具体数字请自己核。</span>' +
        (caseAsk ? ('<div class="case-ask">' + caseAsk + '</div>') : '') +
      '</div>';
    }

    // ——去哪儿学：先挑方式，再给去处——
    h += '<div class="case-learnwhere">' +
      '<p class="case-q">想怎么学？</p>' +
      '<div class="case-ways">' + LEARN_WAYS.map(function(w){
        return '<button type="button" class="case-way' + (caseWay === w.key ? ' is-on' : '') + '" data-caseway="' + w.key + '">' +
          '<span class="case-way-ico">' + w.icon + '</span>' +
          '<b>' + w.label + '</b><span>' + w.hint + '</span></button>';
      }).join('') + '</div>';

    var way = LEARN_WAYS.filter(function(w){ return w.key === caseWay; })[0];
    if(way){
      var q = encodeURIComponent(caseTopic || '');
      h += '<p class="case-q case-q2">去这几个地方搜「' + escapeHtml(caseTopic) + '」</p>' +
        '<div class="case-sites">' + way.sites.map(function(s){
          return '<span class="mini-source-text">' +
            '<b>' + escapeHtml(s.n) + '</b><span class="case-site-tag' + (s.tag === '外网' ? ' is-out' : '') + '">' +
            s.tag + '</span></span>';
        }).join('') + '</div>' +
        (way.key === 'blog' ? '<p class="case-tip">大厂官方博客是这几类里<b>数字最可信</b>的——他们写的是自己家的真实数据。上面那三个案例就是这么找到的。</p>' : '') +
        (way.key === 'paper' ? '<p class="case-tip">论文最硬，但别一上来就啃。<b>先看视频建立框架，卡住了再回来读原文</b>，效率高得多。</p>' : '');
    } else {
      h += '<p class="case-tip">↑ 先挑一种，挑完才知道该把你送去哪儿。</p>';
    }
    h += '</div>';
    body.innerHTML = DOMPurify.sanitize(h);
    bindCaseModal(body);
  }
  async function askCaseClaude(){
    var s = await getSample();
    if(!s){ caseAsk = '<p class="case-ask-err">这个环境问不了 Claude。</p>'; renderCaseModal(); return; }
    caseAskBusy = true; renderCaseModal();
    var prompt = '我在学「' + caseTopic + '」。讲 2 个大公司（国内外都行）真实做过的相关案例。\n\n' +
      '每个案例说清四件事：哪家公司、他们当时遇到什么问题、具体怎么做的、结果怎样。\n\n' +
      '硬要求：\n' +
      '1. 只讲你<b>真的知道</b>的案例。不确定的公司名、不确定的数字，宁可不写，也不要编。\n' +
      '2. 记不清具体数字就写「具体数字我记不准，你自己核一下」，不要瞎编一个像模像样的百分比。\n' +
      '3. <b>绝对不要给 URL</b>——你上不了网，编出来的链接都是假的。\n' +
      '4. 每个案例最后一句写「这个案例教你什么」。\n' +
      '5. 全部中文，两个案例总共 400 字以内。';
    try {
      var out = await s(prompt, { modelTier: 'default' });
      var txt = (out && out.text) ? String(out.text) : '';
      caseAsk = txt
        ? ('<p class="case-ask-tag">💭 下面这段是 Claude 现场讲的，<b>没有经过我核实、也没有链接</b>——当线索用，别当事实引用。</p>' +
           '<div class="case-ask-text">' + escapeHtml(txt).replace(/\n/g, '<br>') + '</div>')
        : '<p class="case-ask-err">没拿到内容，再点一次试试。</p>';
    } catch(e){
      caseAsk = '<p class="case-ask-err">没问成：' + escapeHtml(String(e && e.message || e)) + '</p>';
    }
    caseAskBusy = false;
    renderCaseModal();
  }
  function bindCaseModal(root){
    root.querySelectorAll('[data-caseway]').forEach(function(b){
      b.addEventListener('click', function(){
        caseWay = b.getAttribute('data-caseway');
        renderCaseModal();
      });
    });
    var ask = root.querySelector('#caseAskBtn');
    if(ask) ask.addEventListener('click', function(){ askCaseClaude(); });
  }
  // 关闭：点 × 、点遮罩、按 Esc 都行——三条路都留着，别让人被困在弹窗里
  (function(){
    var ov = document.getElementById('caseOverlay');
    if(!ov) return;
    var x = document.getElementById('caseClose');
    if(x) x.addEventListener('click', closeCaseModal);
    ov.addEventListener('click', function(e){ if(e.target === ov) closeCaseModal(); });
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape' && !ov.hidden) closeCaseModal();
    });
  })();

  function skillPanelHtml(){
    // 公开搜索、正文读取和本机微信读取器入口不依赖 AI。AI 未配置时也要
    // 让用户能先把资料搜回来、核对正文、再决定是否连接 AI 排路线。
    if(!sampleOn() && !backendOn('ai') && !backendOn('search') && !backendOn('extract')) return '';
    var hasPlan = !!(skillPlan && Array.isArray(skillPlan.stages) && skillPlan.stages.length);
    var h = '<div class="skill-card">' +
      '<p class="skill-eyebrow">🎯 我想学一个技能</p>';
    if(!sampleOn() && !backendOn('ai')){
      h += '<p class="skill-src-note">公开网页搜索和正文读取已可用；需要 AI 自动整理学习路线时，请在 <a href="./ai-p2.html?openConfig=1">关联任务 AI · 模型与联网搜索设置</a> 中完成配置。</p>';
    }

    if(!hasPlan){
      // 向导：一屏只问一件事。进度条让人知道还剩几步，不至于填到一半不知道要填到什么时候。
      h += '<div class="sw">' +
        '<div class="sw-top"><span class="sw-count mono">第 ' + skillStep + ' 步 / 共 3 步</span>' +
          '<span class="sw-bar"><i style="width:' + Math.round(skillStep / 3 * 100) + '%"></i></span></div>' +
        (skillStep === 1 ? skillStep1Html() : (skillStep === 2 ? skillStep2Html() : skillStep3Html())) +
      '</div>';
    }
    if(skillErr) h += '<p class="skill-err">没排成：' + escapeHtml(skillErr) + '</p>';
    if(skillPlan && Array.isArray(skillPlan.stages) && skillPlan.stages.length){
      h += '<div class="skill-plan">' +
        '<p class="skill-plan-head">' + escapeHtml(skillPlan.skill || '这条路线') + ' · 共 ' + skillPlan.stages.length + ' 个阶段' +
        (skillPlan.totalWeeks ? ('，大约 ' + escapeHtml(String(skillPlan.totalWeeks)) + ' 周') : '') +
        '<button class="btn btn-ghost btn-sm" type="button" id="skillMakeAllBtn">📥 全部建成任务</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" id="skillRestartBtn">↺ 重新排</button></p>' +
        // 这条路线到底是照着谁排的，必须写在最显眼的地方——这两种可信度完全不一样
        '<p class="skill-from">' + (skillFromShots
          ? ('📷 <b>照着你上传的 ' + skillShots.length + ' 张截图排的</b>' + (skillFromSource ? '，外加你粘的正文。' : '。') +
             '截图里字多的话可能看漏——对着原文核一遍再建任务。')
          : (skillFromSource
            ? '📄 <b>照着你粘进来的那份资料排的</b>，没自己往里加东西。'
            : '🧠 <b>按它自己已有的知识排的</b>，不是照着任何一份具体资料。想让它照你的资料排，把正文粘进去或者上传截图，重排一次。')) +
        (skillCut ? ('<br>✂️ 你那份资料太长，<b>后面 ' + skillCut + ' 个字没读进去</b>——分两次粘，或者先删掉用不上的部分。') : '') +
        // 跳过了一条链接就必须在这儿说，否则你会以为这条路线是照着那份文档排的
        (skillLinkIgnored ? ('<br>🔗 <b>你粘的那条链接我没读到</b>（这一页发不出对外请求）——' +
          '上面这条路线是<b>照技能名排的，不是照那份文档</b>。要照文档排：打开它 Ctrl+A 复制正文粘进来，或者截图上传。') : '') +
        '</p>';
      skillPlan.stages.forEach(function(s, i){
        var steps = Array.isArray(s.steps) ? s.steps : [];
        var search = Array.isArray(s.search) ? s.search : [];
        h += '<div class="skill-stage">' +
          '<p class="skill-stage-title"><span class="skill-idx mono">' + (i + 1) + '</span>' + escapeHtml(s.name || ('阶段 ' + (i + 1))) +
          (s.weeks ? ('<span class="skill-weeks mono">' + escapeHtml(String(s.weeks)) + ' 周</span>') : '') + '</p>' +
          (s.goal ? ('<p class="skill-goal"><b>学到这样算过：</b>' + escapeHtml(s.goal) + '</p>') : '') +
          (steps.length ? ('<ol class="skill-steps">' + steps.map(function(x){
            return '<li>' + escapeHtml(String(x)) + '</li>'; }).join('') + '</ol>') : '') +
          (search.length ? ('<div class="skill-search"><b>拿这些词去搜：</b>' +
            search.map(function(q){ return searchRowHtml(String(q)); }).join('') + '</div>') : '') +
          (s.where ? ('<p class="skill-where"><b>它建议去这些地方找：</b>' + escapeHtml(String(s.where)) +
            '（上面每个词旁边的按钮点一下就直接开搜索结果页）</p>') : '') +
          '<div class="skill-stage-acts">' +
            '<button class="btn btn-ghost btn-sm" type="button" data-skillstage="' + i + '">📥 建成任务（带 ' + steps.length + ' 关）</button>' +
            '<button class="btn btn-ghost btn-sm case-btn" type="button" data-caseopen="' +
              escapeHtml(s.name || skillPlan.skill || '') + '">🏢 大厂是怎么干的</button>' +
            '<button class="btn btn-ghost btn-sm" type="button" data-skillguide="' + i + '"' + (s.guideBusy ? ' disabled' : '') + '>🧭 这关太难？AI分身带我过</button>' +
          '</div>' +
          (s.guideBusy ? '<p class="skill-guide-loading">🧭 AI 分身正在把这关拆细…（几秒钟）</p>' : '') +
          (s.guideErr ? ('<p class="skill-err">没拆成：' + escapeHtml(String(s.guideErr)) + '</p>') : '') +
          (Array.isArray(s.guide) && s.guide.length ? skillGuideHtml(s.guide) : '') +
          '</div>';
      });
      h += '</div>';
    }
    return h + '</div>';
  }
  // 「AI 分身带你过关」拆出来的手把手小步，渲染在这一关下面。
  function skillGuideHtml(micro){
    return '<div class="skill-guide">' +
      '<p class="skill-guide-head">🧭 AI 分身带你过这关 · 拆成 ' + micro.length + ' 小步</p>' +
      '<ol class="skill-guide-list">' + micro.map(function(m){
        m = m || {};
        return '<li>' +
          '<p class="sg-do">' + escapeHtml(String(m.do || '')) + '</p>' +
          (m.stuck ? ('<p class="sg-sub"><b>卡住了：</b>' + escapeHtml(String(m.stuck)) + '</p>') : '') +
          (m.done ? ('<p class="sg-sub"><b>算过：</b>' + escapeHtml(String(m.done)) + '</p>') : '') +
        '</li>';
      }).join('') + '</ol>' +
    '</div>';
  }
  // sample 那边一次最多 64KB 文本，路线本身的提示词还要占一截，所以粘进来的资料切到 2 万字。
  // 切了要明说，不能让人以为整篇都读进去了。
  var SKILL_SOURCE_MAX = 20000;
  function skillPrompt(name, level, hours, source, shotCount){
    var lvText = (SKILL_LEVELS.filter(function(l){ return l[0] === level; })[0] || SKILL_LEVELS[0])[1];
    var shotIntro = shotCount
      ? ('我上传了 ' + shotCount + ' 张截图，是我自己那份教程/资料的内容（可能是飞书文档、公众号文章或者课程大纲的截图）。' +
         '按截图上看得到的内容来排。看不清或者被截断的地方，直接说看不清，不要猜。\n\n')
      : '';
    var shape =
      '只回一个 JSON 对象，形如：\n' +
      '{"skill":"技能名","totalWeeks":12,"stages":[{"name":"阶段名","weeks":3,' +
      '"goal":"学到什么程度算这个阶段过了，要能被检验，不要写「熟悉」「了解」这种没法验的词",' +
      '"steps":["具体要做的一件事","再一件"],' +
      '"search":["能直接拿去搜的关键词"],"where":"去哪些网站/平台搜"}]}\n\n';
    var common =
      'steps 每条都是一个具体动作，能在一两次番茄钟里做完，不要写「学习基础知识」这种没法下手的。每阶段 3 到 6 条。\n' +
      '绝对不要编链接、不要编具体视频名、不要编书的 ISBN。你上不了网，编出来的都是假的。\n' +
      '全部用中文。';
    // ——有资料（正文或截图）：这时候它在「解析你的文档」，不是凭自己的知识编——
    if(source || shotCount){
      return shotIntro +
        (source ? ('下面三个横杠之间是我自己的一份教程/资料。\n\n---\n' + source + '\n---\n\n') : '') +
        '把' + (shotCount && !source ? '截图里的内容' : '它') + '整理成一条我能照着做的分阶段学习路线。\n\n' +
        '我现在的水平：' + lvText + '。每周能投入大约 ' + hours + ' 小时。' +
        (name ? ('这份资料讲的是「' + name + '」。\n\n') : '\n\n') +
        shape +
        '硬要求：\n' +
        '1. **只用这份资料里真的有的东西**。资料里没讲的，不要自己补、不要自己加阶段。' +
        '资料明显缺了一块的话，在那个阶段的 goal 末尾写一句「（这段资料里没讲，得自己另找）」，' +
        '不要假装它讲了。\n' +
        '2. 阶段顺序尽量跟着资料本身的结构走（它的章节/标题/编号），别自己重排。\n' +
        '3. 阶段数按资料的实际篇幅定，3 到 8 个，按我每周的时间算 weeks。\n' +
        '4. search 里给的是能拿去搜的关键词，用资料里出现过的术语。\n' +
        '5. ' + common;
    }
    // ——没资料：靠它自己已有的知识排——
    return '我要学「' + name + '」。我现在的水平：' + lvText + '。每周能投入大约 ' + hours + ' 小时。\n\n' +
      '给我一条分阶段的学习路线。' + shape +
      '硬要求：\n' +
      '1. 阶段数 3 到 6 个，按我每周的时间算 weeks，不要排成不可能完成的量。\n' +
      '2. 真的广为人知的经典书名和官方文档名可以写，但不要给 URL。\n' +
      '3. search 里给的是我复制粘贴就能用的搜索词，中文技能给中文词。\n' +
      '4. ' + common;
  }
  async function runSkillPlan(){
    skillCaptureInputs(); // 先接住已填的正文/技能名，后面几次重画才不会把它冲掉
    var srcEl = document.getElementById('skillSourceInput');
    // 分步之后，技能名和正文可能不在当前这一屏上——所以一律读变量，
    // 变量是 skillCaptureInputs 一路接住的。读 DOM 会在第 3 步读到 null。
    var name = String(skillNameText || '').trim();
    var source = String(skillSourceText || '').trim();
    if(srcEl) source = srcEl.value.trim();
    var shots = skillShots.slice(0, skillShotMax());
    // ——粘进来的只是一条链接的情况——
    // 以前这里直接甩一句红字罢工。那是烂设计：你明明填了技能名，它却什么都不给你。
    // 现在改成：链接读不了就<b>照技能名先排一条</b>，并在结果最上面如实说明"这条不是照你那份资料排的"。
    // 只有连技能名都没有、真的一点料都没有时，才停下来问你要。
    skillLinkIgnored = '';
    if(!shots.length && looksLikeBareLink(source) && !backendOn('ai')){
      if(backendOn('feishu') || backendOn('video') || backendOn('extract')){
        // 后端在，那就是粘错框了——这个必须说清楚，不然他白等
        skillErr = '你把链接粘到「资料」框里了——链接要粘到上面那个 🔗 框，点「读进来」才会去读。';
        skillPlan = null; skillBusy = false; skillRerender(); return;
      }
      if(name){
        skillLinkIgnored = source.trim();  // 记下被丢掉的那条，结果里要点名
        source = '';                        // 当没资料处理，走"按技能名排"那条路
      } else {
        skillErr = '光一条链接排不出东西来——这一页发不出对外请求，链接它打不开。' +
          '上面那个框里写一个想学的技能名（比如「如何做出一个 skill」），我就能先给你排一条；' +
          '想照着这份资料排，就把正文全选复制（Ctrl+A）粘进来，或者截图上传。';
        skillPlan = null; skillBusy = false; skillRerender(); return;
      }
    }
    // 粘了资料/传了截图就不强制填技能名——资料本身就说明了要学什么
    if(!name && !source && !shots.length){
      alert('写一个想学的技能名，或者把教程正文粘进来，或者上传截图。'); return;
    }
    skillCut = 0;
    if(source.length > SKILL_SOURCE_MAX){
      skillCut = source.length - SKILL_SOURCE_MAX;
      source = source.slice(0, SKILL_SOURCE_MAX);
    }
    skillFromSource = !!source;
    skillFromShots = !!shots.length;
    var level = skillLevel || 'zero';
    var hours = Math.max(1, Math.min(60, Number(skillHours) || 8));
    skillBusy = true; skillErr = ''; skillPlan = null;
    renderKnowledgeView();
    var prompt = skillPrompt(name, level, hours, source, shots.length);
    var out = null;
    try {
      // 有自己的后端就走后端（它能真查网上的资料），没有就直接问 Claude。
      // 截图只有 sample 那条路能带，所以有截图时不走后端。
      if(backendOn('ai') && !shots.length){
        var r = await backendCall('/api/ask-ai', { prompt: prompt, json: true, search: true }, 90000);
        if(r.ok && r.data) out = r.data.json || r.data;
        else skillErr = r.error || '后端没答上来';
      }
      if(!out && sampleOn()){
        if(shots.length){
          var s = await getSample();
          out = s ? await s.json(prompt, { images: shots, modelTier: 'default', cache: false }) : null;
        } else {
          out = await askClaudeJson(prompt);
        }
        if(!out) skillErr = skillErr || '它这次没给出能用的格式，再点一次试试';
      }
    } catch(e){
      skillErr = (e && e.code) ? sampleErrText(e) : String(e && e.message || e);
    }
    if(out && Array.isArray(out.stages)){ skillPlan = out; if(!skillPlan.skill) skillPlan.skill = name; }
    else if(!skillErr) skillErr = '没拿到路线';
    skillBusy = false;
    renderKnowledgeView();
  }
  // 「AI 分身带你过关」的提示词：把某一关拆成手把手的一小步一小步。
  function skillGuidePrompt(skill, s){
    var steps = (Array.isArray(s.steps) ? s.steps : []).map(String);
    return '我在学「' + (skill || '这门东西') + '」，卡在这一关过不去了。\n' +
      '这一关叫「' + (s.name || '这一关') + '」' + (s.goal ? ('，过关标准是：' + s.goal) : '') + '。\n' +
      (steps.length ? ('原本的步骤是：\n' + steps.map(function(x, i){ return (i + 1) + '. ' + x; }).join('\n') + '\n') : '') +
      '\n你是带我的「AI 分身」，像个耐心的学长。把这一关拆成更细、手把手的一小步一小步，让我照着做就能过去。\n' +
      '每一小步告诉我三件事：do＝这一步具体做什么动作（要能立刻上手，别写「学习基础」这种没法下手的）；' +
      'stuck＝大概率会卡在哪、卡了怎么破；done＝做到什么样算这一步过了。\n' +
      '按顺序来，4 到 7 步，别一下子全塞给我。绝不要编链接、编视频名、编书号——你上不了网，编的都是假的。全部用中文。\n' +
      '只回一个 JSON：{"micro":[{"do":"...","stuck":"...","done":"..."}]}';
  }
  // 点「这关太难？AI分身带我过」跑这个：复用生成路线那套后端/sample 调用，
  // 结果只挂在运行时的 skillPlan 这一关上（skillPlan 本来就不落账号数据），不碰 localStorage。
  async function runStageGuide(i){
    if(!skillPlan || !skillPlan.stages || !skillPlan.stages[i]) return;
    var s = skillPlan.stages[i];
    if(s.guideBusy) return;
    s.guideBusy = true; s.guideErr = ''; s.guide = null;
    renderKnowledgeView();
    var prompt = skillGuidePrompt(skillPlan.skill || '', s);
    var out = null;
    try {
      if(backendOn('ai')){
        var r = await backendCall('/api/ask-ai', { prompt: prompt, json: true, search: false }, 90000);
        if(r.ok && r.data) out = r.data.json || r.data;
        else s.guideErr = r.error || '后端没答上来';
      }
      if(!out && sampleOn()){
        out = await askClaudeJson(prompt);
        if(!out) s.guideErr = s.guideErr || '它这次没给出能用的格式，再点一次试试';
      }
      if(!out && !backendOn('ai') && !sampleOn()){
        s.guideErr = '这功能得连上 AI 才行——去「我的」里连一下你的后端，或者在能用 Claude 的环境里打开。';
      }
    } catch(e){
      s.guideErr = (e && e.code) ? sampleErrText(e) : String(e && e.message || e);
    }
    if(out && Array.isArray(out.micro)) s.guide = out.micro;
    else if(!s.guideErr) s.guideErr = '没拿到拆解，再点一次试试';
    s.guideBusy = false;
    renderKnowledgeView();
  }
  // 把一个阶段建成一条任务。只往 acct.tasks 里 push 新的一条，不动任何已有数据。
  function skillStageToTask(i){
    if(!skillPlan || !skillPlan.stages || !skillPlan.stages[i]) return null;
    var s = skillPlan.stages[i];
    var acct = getAcctData();
    var today = todayKey();
    var maxOrder = (acct.tasks || []).reduce(function(m, t){ return Math.max(m, t.order || 0); }, 0);
    var steps = (Array.isArray(s.steps) ? s.steps : []).map(String);
    var est = Math.max(25, Math.min(120, steps.length * 25));
    var t = {
      id: uid(),
      name: (skillPlan.skill ? (skillPlan.skill + ' · ') : '') + (s.name || ('阶段 ' + (i + 1))),
      category: '其他',
      estMinutes: est, firstTime: false, multiplier: 1, plannedMinutes: est,
      startMinutes: null, date: today, done: false, completedAt: null,
      order: maxOrder + 1, createdAt: Date.now(),
      weight: 'heavy' // 学技能是主要活，默认按主要分量排
    };
    if(steps.length) t.steps = makeSteps(steps);
    if(s.goal) t.noteFramework = '过关标准：' + String(s.goal);
    t.materials = skillSourceLinks.filter(function(m){
      return m && materialHostForSkill(m.url) && /^https?:\/\//i.test(String(m.url || ''));
    }).map(function(m){
      return {
        id: m.id || uid(),
        url: String(m.url),
        title: String(m.title || '').slice(0, 300),
        description: String(m.description || '').slice(0, 600),
        image: String(m.image || '').slice(0, 2048),
        source: String(m.source || materialHostForSkill(m.url)).slice(0, 180),
        addedAt: m.addedAt || Date.now()
      };
    }).slice(0, 6);
    acct.tasks.push(t);
    saveAcctData(acct);
    return t;
  }

  function renderKnowledgeView(){
    var body = document.getElementById('knowledgeBody');
    if(!body) return;
    var acct = getAcctData();
    var noted = acct.tasks.filter(function(t){ return !!(t.noteGain || t.noteKnowledge || t.noteRemark || t.noteFramework); });
    var html = '<div class="app-main-topbar" style="margin-bottom:18px;">' +
        '<div><p class="app-greeting-eyebrow">完成任务时写的笔记，按类别攒成你自己的知识库</p><h1 style="font-size:1.3rem;">📚 知识库 · 共 ' + noted.length + ' 条</h1></div>' +
      '</div>' + skillPanelHtml();
    if(!noted.length){
      // "学习AI产品经理"类别的 GitHub 框架小字段是专门为这个类别做的——只有账号现在真的还有
      // 这个类别时才提它，改名/删掉之后这句提示也跟着消失，不会指着一个已经不存在的类别说话。
      var hasAiPmCat = acct.categories.some(function(c){ return c.name === '学习AI产品经理'; });
      html += '<p class="empty-state">还没有写过笔记的任务——完成任务后，点它 ⋮ 菜单里的"写笔记"，收获/知识点/备注攒起来就是这里的知识库' +
        (hasAiPmCat ? '；"学习AI产品经理"类别的任务还会额外记一笔用的GitHub框架。' : '。') + '</p>';
      body.innerHTML = DOMPurify.sanitize(html);
      bindSkillPanel(body);
      return;
    }
    // 按当前账号的类别顺序分组，任务上存的类别名如果已经不在当前列表里了（改名/删除后的历史
    // 数据），动态追加一个桶，不会丢任务、也不会假设"其他"这个名字的类别一定还存在。
    var byCat = {};
    var catOrder = acct.categories.map(function(c){ return c.name; });
    catOrder.forEach(function(c){ byCat[c] = []; });
    noted.forEach(function(t){
      if(!byCat[t.category]){ byCat[t.category] = []; catOrder.push(t.category); }
      byCat[t.category].push(t);
    });
    catOrder.forEach(function(cat){
      var tasks = byCat[cat];
      if(!tasks || !tasks.length) return;
      tasks.sort(function(a, b){ return (b.completedAt || b.createdAt || 0) - (a.completedAt || a.createdAt || 0); });
      html += '<div class="cat-box">' +
        '<div class="cat-box-head" style="cursor:default;">' +
          '<span class="cat-box-dot" style="background:' + categoryColor(cat) + '" aria-hidden="true"></span>' +
          '<span class="cat-box-name">' + escapeHtml(cat) + '</span>' +
          '<span class="cat-box-count">' + tasks.length + ' 条</span>' +
        '</div>' +
        tasks.map(knowledgeCardHtml).join('') +
      '</div>';
    });
    body.innerHTML = DOMPurify.sanitize(html);
    bindSkillPanel(body);
    body.querySelectorAll('[data-kb-edit]').forEach(function(btn){
      btn.addEventListener('click', function(){ openTaskNotesModal(btn.getAttribute('data-kb-edit')); });
    });
  }
  // 技能路线那张卡上的所有交互。每次重画都重新绑一遍——这一块是整片 innerHTML 重刷的。
  function bindSkillPanel(root){
    var go = root.querySelector('#skillGoBtn');
    if(go) go.addEventListener('click', function(){ runSkillPlan(); });
    // ——向导：下一步 / 上一步——
    // 每一步都先把当前屏填的东西接住（skillCaptureInputs），再换屏，
    // 否则退回上一步会把刚打的字冲掉——那是最气人的 bug。
    var swNext = root.querySelector('#swNext');
    if(swNext) swNext.addEventListener('click', function(){
      skillCaptureInputs();
      if(skillStep === 1 && !String(skillNameText || '').trim()){
        // 不甩红字，就地说一句该填什么，光标放回去
        skillErr = '先说一个想学的技能，一句话就行——比如「搭建自己的AI分身」。';
        skillRerender();
        var n = document.getElementById('skillNameInput'); if(n) n.focus();
        return;
      }
      skillErr = '';
      skillStep = Math.min(3, skillStep + 1);
      skillRerender();
    });
    var swSkip = root.querySelector('#swSkipToSrc');
    if(swSkip) swSkip.addEventListener('click', function(){
      skillCaptureInputs();
      skillErr = ''; skillStep = 3; skillSrcMode = 'text';
      skillRerender();
      var t = document.getElementById('skillSourceInput'); if(t) t.focus();
    });
    var swBack = root.querySelector('#swBack');
    if(swBack) swBack.addEventListener('click', function(){
      skillCaptureInputs();
      skillErr = '';
      skillStep = Math.max(1, skillStep - 1);
      skillRerender();
    });
    root.querySelectorAll('[data-skilllevel]').forEach(function(b){
      b.addEventListener('click', function(){
        skillCaptureInputs(); skillLevel = b.getAttribute('data-skilllevel'); skillRerender();
      });
    });
    root.querySelectorAll('[data-skillhours]').forEach(function(b){
      b.addEventListener('click', function(){
        skillCaptureInputs();
        var n = Number(b.getAttribute('data-skillhours'));
        skillHours = n;
        // 那个数字框跟这排档位是同一个值的两种填法。不把框里的数也改掉，
        // 下一次 skillCaptureInputs 会把框里的旧值读回来，刚点的档位当场被冲掉。
        var hr = document.getElementById('skillHoursInput');
        if(hr) hr.value = String(n);
        skillRerender();
      });
    });
    root.querySelectorAll('[data-skillsrcmode]').forEach(function(b){
      b.addEventListener('click', function(){
        skillCaptureInputs();
        // 三选一就是三选一：点中了就定住，不做"再点一次取消"。
        // 取消之后「排一条路线」会变灰，而人根本不知道是自己刚把选择点没了——那是个坑。
        skillSrcMode = b.getAttribute('data-skillsrcmode');
        skillRerender();
      });
    });
    var restart = root.querySelector('#skillRestartBtn');
    if(restart) restart.addEventListener('click', function(){
      // 只清这张卡自己的状态，不碰任何已存的数据——建成的任务照样留在清单里
      skillPlan = null; skillErr = ''; skillStep = 1; skillSrcMode = '';
      skillFromSource = false; skillFromShots = false; skillLinkIgnored = ''; skillCut = 0;
      skillSearchBusy = false; skillSearchQuery = ''; skillSearchResults = []; skillSearchMsg = ''; skillSourceLinks = [];
      wechatReaderBusy = false; wechatReaderMsg = '';
      skillRerender();
    });
    var nameIn = root.querySelector('#skillNameInput');
    if(nameIn) nameIn.addEventListener('keydown', function(e){
      if(e.key !== 'Enter') return;
      e.preventDefault();
      if(swNext) swNext.click(); else runSkillPlan();
    });
    // 截图：只存在内存里的 File 引用，换一批就整批替换，不落任何数据
    var linkGo = root.querySelector('#skillLinkGoBtn');
    if(linkGo) linkGo.addEventListener('click', function(){ runSkillLink(); });
    var linkIn = root.querySelector('#skillLinkInput');
    if(linkIn){
      linkIn.addEventListener('keydown', function(e){ if(e.key === 'Enter') runSkillLink(); });
      linkIn.addEventListener('input', function(){ skillLinkText = linkIn.value; });
    }
    var webSearch = root.querySelector('#skillWebSearchBtn');
    if(webSearch) webSearch.addEventListener('click', function(){ runSkillWebSearch(); });
    var webSearchInput = root.querySelector('#skillWebSearchInput');
    if(webSearchInput){
      webSearchInput.addEventListener('keydown', function(e){ if(e.key === 'Enter') runSkillWebSearch(); });
      webSearchInput.addEventListener('input', function(){ skillSearchQuery = webSearchInput.value; });
    }
    root.querySelectorAll('[data-skill-read-result]').forEach(function(btn){
      btn.addEventListener('click', function(){ readSkillSearchResult(Number(btn.getAttribute('data-skill-read-result'))); });
    });
    var wechatOpen = root.querySelector('#skillWechatOpenBtn');
    if(wechatOpen) wechatOpen.addEventListener('click', openWechatClientFromSkill);
    var wechatReader = root.querySelector('#skillWechatReaderBtn');
    if(wechatReader) wechatReader.addEventListener('click', openWechatReaderFromSkill);
    var wechatCheck = root.querySelector('#skillWechatCheckBtn');
    if(wechatCheck) wechatCheck.addEventListener('click', checkWechatReaderFromSkill);
    var shotIn = root.querySelector('#skillShotInput');
    if(shotIn) shotIn.addEventListener('change', function(){
      var max = skillShotMax();
      var picked = Array.prototype.slice.call(shotIn.files || []);
      var over = picked.length > max;
      skillShots = picked.slice(0, max);
      skillRerender();
      if(over) alert('一次最多 ' + max + ' 张，只取了前 ' + max + ' 张。剩下的分一次再传。');
    });
    var det = root.querySelector('.skill-src');
    if(det) det.addEventListener('toggle', function(){ skillSrcOpen = !!det.open; });
    var shotClear = root.querySelector('#skillShotClear');
    if(shotClear) shotClear.addEventListener('click', function(){ skillShots = []; skillRerender(); });
    root.querySelectorAll('[data-skillstage]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var t = skillStageToTask(Number(btn.getAttribute('data-skillstage')));
        if(t){
          btn.textContent = '✅ 已建成任务';
          btn.disabled = true;
          lcVoyagePrompt('已加到今天的清单：' + t.name);
        }
      });
    });
    root.querySelectorAll('[data-skillguide]').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(btn.disabled) return;
        runStageGuide(Number(btn.getAttribute('data-skillguide')));
      });
    });
    root.querySelectorAll('[data-caseopen]').forEach(function(b){
      b.addEventListener('click', function(){ openCaseModal(b.getAttribute('data-caseopen')); });
    });
    var all = root.querySelector('#skillMakeAllBtn');
    if(all) all.addEventListener('click', function(){
      if(!skillPlan || !skillPlan.stages) return;
      var n = 0;
      for(var i = 0; i < skillPlan.stages.length; i++){ if(skillStageToTask(i)) n++; }
      lcVoyagePrompt('建好了 ' + n + ' 条任务，都在今天的清单里——自己往后挪日子就行');
      refreshCurrentView();
    });
  }

  // ---- 截止清单：作业/报名这类有硬性截止日期的任务单独列出来，跟"date"(排到哪天做)是两个
  // 概念——一条任务可以只有 dueDate 没有 date（还没安排具体哪天做，但已经知道最后期限）。
  // dueDate 存的是跟 date/dayViewDate 一样的 "YYYY-MM-DD" 格式，所以可以直接复用 parseDateKey/
  // fmtShortDayLabel 这些已有的日期工具函数，不用另写一套。
  function dueDiffDays(dueKey){
    var a = parseDateKey(todayKey());
    var b = parseDateKey(dueKey);
    return Math.round((b - a) / 86400000);
  }
  // 截止时间精确到点。dueDate 还是原来那个 "YYYY-MM-DD"，一个字节没动；"几点"存在新加的
  // dueTime("HH:MM") 里。老任务、以及不想填钟点的任务都没有 dueTime —— 一律按当天 23:59 算，
  // 跟以前"只看哪天"的行为完全一致，不会因为加了这个字段就把老数据判成逾期。
  function dueMomentOf(t){
    if(!t || !t.dueDate) return null;
    var d = parseDateKey(t.dueDate);
    if(!d || isNaN(d.getTime())) return null;
    var mins = (typeof t.dueTime === 'string') ? parseClockToMinutes(t.dueTime) : null;
    if(mins === null) mins = 23 * 60 + 59;
    return new Date(d.getTime() + mins * 60000);
  }
  function dueHoursLeft(t){
    var m = dueMomentOf(t);
    return m ? ((m.getTime() - Date.now()) / 3600000) : null;
  }
  function dueTimeLabel(t){
    return (t && typeof t.dueTime === 'string' && parseClockToMinutes(t.dueTime) !== null) ? (' ' + t.dueTime) : '';
  }
  function deadlineBadgeHtml(dueKey, t){
    var diff = dueDiffDays(dueKey);
    var dateLabel = fmtShortDayLabel(dueKey);
    var clock = dueTimeLabel(t);
    if(diff < 0) return '<span class="deadline-badge is-overdue">已逾期' + Math.abs(diff) + '天</span>';
    if(diff === 0) return '<span class="deadline-badge is-today">今天截止' + escapeHtml(clock) + '</span>';
    if(diff === 1) return '<span class="deadline-badge is-soon">明天' + escapeHtml(clock) + ' 截止</span>';
    if(diff <= 3) return '<span class="deadline-badge is-soon">' + diff + '天后 · ' + escapeHtml(dateLabel) + escapeHtml(clock) + '</span>';
    return '<span class="deadline-badge">' + escapeHtml(dateLabel) + escapeHtml(clock) + ' 截止</span>';
  }

  // ---- 提前一天敲警钟 ----
  // 只读数据、不写任何字段。挑出"今天之内到期"和"明天到期"还没做完的任务，在"今天"视图最上面
  // 立一块红牌：还剩几个钟头、这活预计要占多久、今天还剩多少可用时间够不够。
  var DEADLINE_ALARM_HOURS = 36; // 提前一天多一点开始响，跨过一个晚上也还能看见
  function deadlineAlarmHtml(acct){
    var list = (acct.tasks || []).filter(function(t){
      if(t.done || !t.dueDate) return false;
      var h = dueHoursLeft(t);
      return h !== null && h <= DEADLINE_ALARM_HOURS;
    });
    if(!list.length) return '';
    list.sort(function(a, b){ return (dueHoursLeft(a) || 0) - (dueHoursLeft(b) || 0); });
    var rows = list.map(function(t){
      var h = dueHoursLeft(t);
      var when;
      if(h < 0) when = '已经过期 ' + fmtDuration(Math.round(Math.abs(h) * 60));
      else if(h < 1) when = '只剩 ' + Math.max(1, Math.round(h * 60)) + ' 分钟';
      else when = '还剩 ' + Math.floor(h) + ' 小时';
      var need = t.plannedMinutes ? ('，这活预计要占 ' + fmtDuration(t.plannedMinutes)) : '';
      var scheduled = (t.date === todayKey() && typeof t.startMinutes === 'number')
        ? ('，已经排在今天 ' + fmtClock(t.startMinutes))
        : '，<b>今天还没排时间</b>';
      // 过期的那条不能就这么烂在旧日子里——给它一个当场改期的出口。
      // 「挪到今天」一下做两件事：任务挪到今天的清单、截止日往后推到今天（已经过期才推）。
      // 「改期」是自己挑一天，截止和任务日一起跟过去。
      var fix = '';
      if(h < 0 || t.date !== todayKey()){
        fix = '<span class="deadline-fix">' +
          '<button type="button" class="deadline-fix-btn" data-dlmove="' + t.id + '">📅 挪到今天</button>' +
          '<label class="deadline-fix-date">改到 ' +
            '<input type="date" data-dldate="' + t.id + '" value="' + escapeHtml(t.dueDate || todayKey()) + '"' +
            ' min="' + todayKey() + '"></label>' +
          '</span>';
      }
      return '<li class="deadline-alarm-item">《<b>' + escapeHtml(t.name) + '</b>》' +
        '<span class="deadline-alarm-when">' + when + '</span>' +
        '<span class="deadline-alarm-need">' + need + scheduled + '</span>' + fix + '</li>';
    }).join('');
    var totalNeed = list.reduce(function(s, t){ return s + (t.plannedMinutes || 0); }, 0);
    var minsLeftToday = Math.max(0, TIMELINE_END_MIN - minutesSinceMidnight(new Date()));
    var tight = totalNeed > minsLeftToday
      ? ('今天到 ' + fmtClock(TIMELINE_END_MIN) + ' 只剩 ' + fmtDuration(minsLeftToday) + ' 可用，这些加起来要 ' + fmtDuration(totalNeed) + '——放不下了，先挑最要命的那条动手。')
      : ('这些加起来要 ' + fmtDuration(totalNeed) + '，今天还剩 ' + fmtDuration(minsLeftToday) + ' 可用，来得及，但别拖到晚上。');
    return '<div class="deadline-alarm">' +
      '<p class="deadline-alarm-title">🔔 敲警钟 · ' + list.length + ' 件事快到期了</p>' +
      '<ul class="deadline-alarm-list">' + rows + '</ul>' +
      '<p class="deadline-alarm-tight">' + tight + '</p>' +
    '</div>';
  }
  // 行内 markup 有意跟 taskCardHtml 保持同一套 .app-task/.app-task-check/.app-task-menu 结构——
  // 这样可以直接复用 bindTaskListInteractions 里已经写好的打勾/编辑/删除交互，不用再写一套。
  function deadlineRowHtml(t){
    return '<li class="app-task" data-done="' + (t.done ? 'true' : 'false') + '" data-id="' + t.id + '">' +
        '<button class="app-task-check" type="button" aria-label="标记完成"></button>' +
        '<div class="app-task-body">' +
          '<div class="app-task-head-row">' +
            '<span class="app-task-name">' + escapeHtml(t.name) + '</span>' +
            (t.done ? '' : deadlineBadgeHtml(t.dueDate, t)) +
          '</div>' +
          '<p class="app-task-meta">' + escapeHtml(t.category) + (t.date ? (' · 排在 ' + fmtShortDayLabel(t.date)) : ' · 还没排具体时间') + '</p>' +
        '</div>' +
        '<div class="app-task-actions">' +
          '<button class="app-task-menu-btn" type="button" aria-label="更多">⋮</button>' +
          '<div class="app-task-menu" hidden>' +
            '<button type="button" data-act="edit">编辑</button>' +
            '<button type="button" class="danger" data-act="delete">删除</button>' +
          '</div>' +
        '</div>' +
      '</li>';
  }
  function deadlineGroupHtml(title, cls, tasks){
    if(!tasks.length) return '';
    return '<div class="deadline-group">' +
      '<div class="deadline-group-title ' + cls + '"><span>' + title + '</span><span class="deadline-group-count">' + tasks.length + '</span></div>' +
      '<ul class="app-task-list">' + tasks.map(deadlineRowHtml).join('') + '</ul>' +
    '</div>';
  }
  function renderDeadlinesView(){
    var body = document.getElementById('deadlinesBody');
    if(!body) return;
    var acct = getAcctData();
    var withDue = acct.tasks.filter(function(t){ return !!t.dueDate; });
    var html = '<div class="app-main-topbar" style="margin-bottom:18px;">' +
        '<div><p class="app-greeting-eyebrow">作业、报名这类有硬截止日期的事，单独列出来防止漏掉</p><h1 style="font-size:1.3rem;">⏰ 截止清单</h1></div>' +
      '</div>';
    if(!withDue.length){
      html += '<p class="empty-state">还没有任务设置截止日期——添加或编辑任务时，在"截止时间"里填一个（可以精确到几点），就会出现在这里。</p>';
      body.innerHTML = DOMPurify.sanitize(html);
      return;
    }
    var undone = withDue.filter(function(t){ return !t.done; });
    var done = withDue.filter(function(t){ return t.done; });
    var overdue = undone.filter(function(t){ return dueDiffDays(t.dueDate) < 0; });
    var dueToday = undone.filter(function(t){ return dueDiffDays(t.dueDate) === 0; });
    var upcoming = undone.filter(function(t){ return dueDiffDays(t.dueDate) > 0; });
    overdue.sort(function(a, b){ return a.dueDate < b.dueDate ? -1 : 1; });
    upcoming.sort(function(a, b){ return a.dueDate < b.dueDate ? -1 : 1; });
    done.sort(function(a, b){ return (b.completedAt || 0) - (a.completedAt || 0); });
    if(!overdue.length && !dueToday.length && !upcoming.length && !done.length){
      html += '<p class="empty-state">设置了截止日期的任务都在这里——现在一条都没有。</p>';
    }
    html += deadlineGroupHtml('🔴 已逾期', 'is-overdue', overdue);
    html += deadlineGroupHtml('🟡 今天截止', 'is-today', dueToday);
    html += deadlineGroupHtml('🟢 未来', 'is-upcoming', upcoming);
    if(done.length){
      html += '<div class="deadline-group">' +
        '<button class="deadline-done-toggle" type="button" id="deadlineDoneToggle">✅ 已完成 ' + done.length + ' 条 · 点击展开/收起</button>' +
        '<ul class="app-task-list" id="deadlineDoneList" hidden>' + done.map(deadlineRowHtml).join('') + '</ul>' +
      '</div>';
    }
    body.innerHTML = DOMPurify.sanitize(html);
    bindTaskListInteractions(body);
    var doneToggle = document.getElementById('deadlineDoneToggle');
    if(doneToggle) doneToggle.addEventListener('click', function(){
      var list = document.getElementById('deadlineDoneList');
      if(list) list.hidden = !list.hidden;
    });
  }

  // ===== 金币商城 + 成就勋章：设备柜里之前锁着的四项，先做真正能用的这两项 =====
  // 头像装饰：都是"上岸鸭"本鸭换装，不是外部图库——保证自包含、不依赖任何外部图片，
  // 换肤只影响本机这一个账号看到的头像，纯装饰，不影响任何数据。
  var SHOP_AVATARS = [
    { id:'duck_plain', name:'素色鸭', price:0, hat:'none', tint:'#8B98A0' },
    { id:'duck_sailor', name:'水手鸭', price:30, hat:'sailor', tint:'#4C8DFF' },
    { id:'duck_scholar', name:'学霸鸭', price:30, hat:'scholar', tint:'#8B6FE0' },
    { id:'duck_early', name:'晨型鸭', price:45, hat:'sun', tint:'#E8916A' },
    { id:'duck_night', name:'夜猫子鸭', price:45, hat:'moon', tint:'#5A5FA8' },
    { id:'duck_captain', name:'船长鸭', price:80, hat:'captain', tint:'#DA8F1E' }
  ];
  // 主题色：只换 --link 这一个"强调色"变量（按钮、高亮、链接的颜色），浅色/深色各配一版，
  // 保证不管系统当前是哪种模式，换色之后对比度都还立得住；不改背景/文字色，风险最小。
  var SHOP_ACCENTS = [
    { id:'tide', name:'静潮青', price:0, light:'#256F66', dark:'#5FC2B2' },
    { id:'coral', name:'珊瑚橙', price:20, light:'#C9633F', dark:'#FF9A73' },
    { id:'ocean', name:'深海蓝', price:20, light:'#2A5FA8', dark:'#6FA8E8' },
    { id:'dusk', name:'暮色紫', price:35, light:'#6B4FA0', dark:'#B79CE8' }
  ];
  var FREEZE_PRICE = 15;

  // 一个鸭子头像的 SVG：所有皮肤共用同一只鸭子（品牌统一），只有配饰形状和配色不一样——
  // 比六张互相无关的图更耐看，改一个地方所有皮肤的鸭子本体都会跟着一起微调。
  function duckAvatarSvg(def, size){
    size = size || 56;
    var tint = (def && def.tint) || '#8B98A0';
    var accessory = '';
    switch(def && def.hat){
      case 'sailor':
        accessory = '<path d="M12 22 Q32 8 52 22 L47 28 Q32 19 17 28 Z" fill="#fff" stroke="#D7E2DB" stroke-width="1"/>' +
          '<rect x="27" y="19" width="10" height="4.5" rx="1" fill="' + tint + '"/>';
        break;
      case 'scholar':
        accessory = '<rect x="15" y="15" width="34" height="5" rx="1.5" fill="#2B2B2B"/><rect x="30" y="10" width="4" height="6" fill="#2B2B2B"/>' +
          '<circle cx="21" cy="31" r="6" fill="none" stroke="#2B2B2B" stroke-width="2"/><circle cx="35" cy="31" r="6" fill="none" stroke="#2B2B2B" stroke-width="2"/>' +
          '<line x1="27" y1="31" x2="29" y2="31" stroke="#2B2B2B" stroke-width="2"/>';
        break;
      case 'sun':
        accessory = '<path d="M9 24 Q32 9 55 24 L55 19 Q32 5 9 19 Z" fill="' + tint + '"/><circle cx="47" cy="11" r="5" fill="#FFD873"/>';
        break;
      case 'moon':
        accessory = '<path d="M15 17 Q32 6 49 17" stroke="#3A3A66" stroke-width="6" fill="none" stroke-linecap="round"/>' +
          '<circle cx="45" cy="12" r="2" fill="#fff"/><circle cx="39" cy="8" r="1.3" fill="#fff"/><circle cx="50" cy="18" r="1" fill="#fff"/>';
        break;
      case 'captain':
        accessory = '<path d="M11 23 Q32 6 53 23 L53 28 L11 28 Z" fill="' + tint + '"/><rect x="11" y="27" width="42" height="4" fill="#20180A"/>' +
          '<circle cx="32" cy="18" r="4" fill="#FFD873" stroke="#20180A" stroke-width="1"/>';
        break;
      default:
        accessory = '';
    }
    return '<svg viewBox="0 0 64 64" width="' + size + '" height="' + size + '" aria-hidden="true">' +
      '<circle cx="32" cy="32" r="31" fill="' + tint + '" opacity=".16"/>' +
      '<ellipse cx="32" cy="47" rx="20" ry="13" fill="#F0A93A"/>' +
      '<circle cx="32" cy="29" r="17" fill="#FBC55A"/>' +
      '<circle cx="26" cy="27" r="2.6" fill="#20180A"/><circle cx="38" cy="27" r="2.6" fill="#20180A"/>' +
      '<ellipse cx="32" cy="34" rx="9" ry="5.2" fill="#F0A93A"/>' +
      accessory +
    '</svg>';
  }

  // 鸭子水位仪：营销氛围版和App功能版共用同一份标记，靠 opts 区分——
  // ambient=true 时不用 opts.pct（纯CSS循环动画自己管水位），文案不能带具体数字；
  // ambient=false 时 opts.pct 是"今天完成/共X项"算出来的真实百分比，直接写成内联的水位高度。
  function buildDuckGaugeHtml(opts){
    var pct = Math.max(0, Math.min(100, opts.pct || 0));
    var duckSvg = duckAvatarSvg(opts.avatarDef || SHOP_AVATARS[0], 40);
    var waterStyle = opts.ambient ? '' : ' style="height:' + pct + '%"';
    // 鸭子的 bottom 不能直接写 pct%——那是相对整个 .duck-gauge(含顶部给"岸"字留的净空)算的，
    // 会比水面(相对玻璃管自己算)冒得更高，100%时会怼到"岸"字上。用 calc() 换算成跟水面
    // 同一个基准，鸭子才会真的贴着水面浮，不会自己飘到净空区域把文字挡住。
    var duckStyle = opts.ambient ? '' : ' style="bottom:calc((100% - var(--dg-gap)) * ' + (pct / 100) + ')"';
    return '<div class="duck-gauge-panel' + (opts.ambient ? ' is-ambient' : '') + '">' +
      '<div class="duck-gauge-stage"><div class="duck-gauge">' +
      '<div class="duck-gauge-shore">岸</div>' +
      '<div class="duck-gauge-tube"><div class="duck-gauge-water"' + waterStyle + '></div></div>' +
      '<div class="duck-gauge-duck"' + duckStyle + '>' + duckSvg + '</div>' +
      '</div></div>' +
      '<div class="duck-gauge-caption">' + opts.captionHtml + '</div>' +
      '</div>';
  }
  // 营销页是纯静态展示、没有登录态，用默认素色鸭配合纯循环动画走氛围版——这条 IIFE
  // 特意放在 SHOP_AVATARS/duckAvatarSvg 定义之后（同一个 <script> 里靠源码顺序保证
  // 执行时这两者已经赋值好了），不依赖它在 HTML 里实际出现的位置。
  (function initMktDuckGauge(){
    var slot = document.getElementById('mktDuckGauge');
    if(!slot) return;
    slot.innerHTML = DOMPurify.sanitize(buildDuckGaugeHtml({
      ambient: true,
      avatarDef: SHOP_AVATARS[0],
      captionHtml: '<p><b>水位越高，离岸越近。</b>每完成一项任务，水位就往上涨一点，鸭子跟着水面慢慢靠近岸边——登录之后这里会换成你今天真实的完成进度。</p>'
    }));
  })();

  // 勋章：一个共用的"奖牌"底板（丝带+圆盘），只用 tier 颜色和中心 glyph 区分不同勋章——
  // 视觉上更像一整面真实的勋章墙，而不是几十个互不相干的图标堆在一起。
  var BADGE_TIERS = {
    bronze:{ main:'#B0793D', edge:'#8C5F2E', ribbon:'#7A8CC4' },
    silver:{ main:'#B8C0C6', edge:'#8E969C', ribbon:'#8B98A0' },
    gold:{ main:'#F5B84A', edge:'#DA8F1E', ribbon:'#E0708A' },
    special:{ main:'#5FC2B2', edge:'#256F66', ribbon:'#C9A227' }
  };
  function medalSvg(tierKey, glyph, locked){
    var t = BADGE_TIERS[tierKey] || BADGE_TIERS.bronze;
    var mainFill = locked ? '#C7CDD1' : t.main;
    var edgeFill = locked ? '#9AA2A8' : t.edge;
    var ribbonFill = locked ? '#D3D8DB' : t.ribbon;
    return '<svg viewBox="0 0 64 76" width="52" height="62" aria-hidden="true">' +
      '<path d="M22 4 L32 30 L12 30 Z" fill="' + ribbonFill + '" opacity="' + (locked ? '.5' : '.9') + '"/>' +
      '<path d="M42 4 L52 30 L32 30 Z" fill="' + ribbonFill + '" opacity="' + (locked ? '.4' : '.75') + '"/>' +
      '<circle cx="32" cy="42" r="22" fill="' + edgeFill + '"/>' +
      '<circle cx="32" cy="42" r="18" fill="' + mainFill + '"/>' +
      '<circle cx="32" cy="42" r="18" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2"/>' +
      '<text x="32" y="48" font-size="18" text-anchor="middle">' + (locked ? '🔒' : glyph) + '</text>' +
    '</svg>';
  }

  // ---- 勋章解锁条件：全部来自账号里已经真实记录的数据，没有一条是凭空定义的新计数器 ----
  function totalCompletedTasks(acct){ return (acct.tasks || []).filter(function(t){ return t.done; }).length; }
  function totalFocusMinutes(acct){ return (acct.durationLog || []).reduce(function(sum, r){ return sum + (r.actualMinutes || 0); }, 0); }
  function totalKnowledgeNotes(acct){
    return (acct.tasks || []).filter(function(t){ return !!(t.noteGain || t.noteKnowledge || t.noteRemark || t.noteFramework); }).length;
  }
  // 某个习惯历史上出现过的最长连续天数（不只是"现在"这一段）——跟 habitStreakInfo 不一样，
  // 那个只关心"当前"这一段，这里要把整段历史都扫一遍，哪怕中间断过、后来的更长的一段也要能数到。
  function habitLongestStreakEver(acct, habitId){
    var dates = habitCheckinsFor(acct, habitId).map(function(c){ return c.dateKey; }).sort();
    var longest = 0, cur = 0, prev = null;
    dates.forEach(function(dk){
      if(dk === prev) return;
      cur = (prev && addDaysKey(prev, 1) === dk) ? (cur + 1) : 1;
      if(cur > longest) longest = cur;
      prev = dk;
    });
    return longest;
  }
  function bestHabitStreakEver(acct){
    var best = 0;
    (acct.habits || []).forEach(function(h){ best = Math.max(best, habitLongestStreakEver(acct, h.id)); });
    return best;
  }
  // "回来就好"：判断是不是真的断过至少一天、然后今天又接着打卡了——不是随便一个正在连续的
  // 习惯就算数，得是打卡日期的跨度比打卡次数本身要长（说明中间有缺口），且今天确实打了。
  function hasComebackStory(acct){
    return (acct.habits || []).some(function(h){
      var info = habitStreakInfo(acct, h.id);
      if(!info.checkedInToday || info.total < 4) return false;
      var dates = habitCheckinsFor(acct, h.id).map(function(c){ return c.dateKey; }).sort();
      if(dates.length < 4) return false;
      var span = Math.round((parseDateKey(dates[dates.length - 1]) - parseDateKey(dates[0])) / 86400000) + 1;
      return span > dates.length;
    });
  }
  var BADGE_CATALOG = [
    { id:'first_task', name:'初次靠岸', glyph:'⚓', tier:'bronze', cat:'任务', desc:'完成第一个任务', cond:function(a){ return totalCompletedTasks(a) >= 1; } },
    { id:'tasks_10', name:'小有所成', glyph:'✅', tier:'bronze', cat:'任务', desc:'累计完成 10 个任务', cond:function(a){ return totalCompletedTasks(a) >= 10; } },
    { id:'tasks_50', name:'驾轻就熟', glyph:'✅', tier:'silver', cat:'任务', desc:'累计完成 50 个任务', cond:function(a){ return totalCompletedTasks(a) >= 50; } },
    { id:'tasks_200', name:'任务大师', glyph:'✅', tier:'gold', cat:'任务', desc:'累计完成 200 个任务', cond:function(a){ return totalCompletedTasks(a) >= 200; } },
    { id:'focus_1h', name:'专注新兵', glyph:'⏱', tier:'bronze', cat:'专注', desc:'累计专注 1 小时', cond:function(a){ return totalFocusMinutes(a) >= 60; } },
    { id:'focus_10h', name:'专注老手', glyph:'⏱', tier:'silver', cat:'专注', desc:'累计专注 10 小时', cond:function(a){ return totalFocusMinutes(a) >= 600; } },
    { id:'focus_50h', name:'专注宗师', glyph:'⏱', tier:'gold', cat:'专注', desc:'累计专注 50 小时', cond:function(a){ return totalFocusMinutes(a) >= 3000; } },
    { id:'streak_3', name:'三天不算长', glyph:'🔥', tier:'bronze', cat:'习惯', desc:'单个习惯连续打卡 3 天', cond:function(a){ return bestHabitStreakEver(a) >= 3; } },
    { id:'streak_7', name:'一周养成', glyph:'🔥', tier:'bronze', cat:'习惯', desc:'单个习惯连续打卡 7 天', cond:function(a){ return bestHabitStreakEver(a) >= 7; } },
    { id:'streak_21', name:'三周立习惯', glyph:'🔥', tier:'silver', cat:'习惯', desc:'单个习惯连续打卡 21 天', cond:function(a){ return bestHabitStreakEver(a) >= 21; } },
    { id:'streak_66', name:'六十六天真习惯', glyph:'🔥', tier:'gold', cat:'习惯', desc:'单个习惯连续打卡 66 天（公认的习惯养成周期）', cond:function(a){ return bestHabitStreakEver(a) >= 66; } },
    { id:'comeback', name:'回来就好', glyph:'🌊', tier:'special', cat:'习惯', desc:'断过打卡之后又接着打——断一天，不代表全白干', cond:hasComebackStory },
    { id:'notes_5', name:'笔记新人', glyph:'📚', tier:'bronze', cat:'知识库', desc:'写满 5 条任务笔记', cond:function(a){ return totalKnowledgeNotes(a) >= 5; } },
    { id:'notes_20', name:'知识库常客', glyph:'📚', tier:'silver', cat:'知识库', desc:'写满 20 条任务笔记', cond:function(a){ return totalKnowledgeNotes(a) >= 20; } },
    { id:'goal_set', name:'有了目标', glyph:'🎯', tier:'bronze', cat:'规划', desc:'设置一次考试倒计时日期', cond:function(a){ return !!a.examDate; } },
    { id:'coins_100', name:'小有积蓄', glyph:'🪙', tier:'bronze', cat:'金币', desc:'历史累计获得 100 枚金币', cond:function(a){ return (a.lifetimeCoins || 0) >= 100; } },
    { id:'coins_500', name:'金币大亨', glyph:'🪙', tier:'gold', cat:'金币', desc:'历史累计获得 500 枚金币', cond:function(a){ return (a.lifetimeCoins || 0) >= 500; } }
  ];
  // 检查一遍所有勋章，第一次达标才写进 badgeUnlocks（记下解锁时间），已经解锁过的不会因为
  // 数据后来变化（比如金币被花掉）又被摘掉——勋章跟"曾经达到过"绑定，不跟"现在还是不是"绑定。
  function checkAndRecordBadgeUnlocks(acct){
    if(!acct.badgeUnlocks) acct.badgeUnlocks = {};
    var newly = [];
    BADGE_CATALOG.forEach(function(b){
      if(acct.badgeUnlocks[b.id]) return;
      var ok = false;
      try{ ok = !!b.cond(acct); }catch(e){ ok = false; }
      if(ok){ acct.badgeUnlocks[b.id] = Date.now(); newly.push(b); }
    });
    return newly;
  }
  function toastNewBadges(newlyBadges){
    if(!newlyBadges || !newlyBadges.length) return;
    if(newlyBadges.length === 1) showHabitToast('🎖️ 解锁新勋章·' + newlyBadges[0].name);
    else showHabitToast('🎖️ 一口气解锁了 ' + newlyBadges.length + ' 个新勋章！');
  }

  // ---- 商城交易：买头像/主题色都走"没拥有就先扣币再拥有，拥有了就直接装备"同一条路径 ----
  function buyAvatar(id){
    var acct = getAcctData();
    var def = SHOP_AVATARS.filter(function(a){ return a.id === id; })[0];
    if(!def) return { ok:false };
    if((acct.ownedAvatars || []).indexOf(id) === -1){
      if((acct.coins || 0) < def.price) return { ok:false, reason:'insufficient' };
      acct.coins -= def.price;
      acct.ownedAvatars = (acct.ownedAvatars || []).concat([id]);
    }
    acct.equippedAvatar = id;
    saveAcctData(acct);
    return { ok:true };
  }
  function buyAccent(id){
    var acct = getAcctData();
    var def = SHOP_ACCENTS.filter(function(a){ return a.id === id; })[0];
    if(!def) return { ok:false };
    if((acct.ownedAccents || []).indexOf(id) === -1){
      if((acct.coins || 0) < def.price) return { ok:false, reason:'insufficient' };
      acct.coins -= def.price;
      acct.ownedAccents = (acct.ownedAccents || []).concat([id]);
    }
    acct.equippedAccent = id;
    saveAcctData(acct);
    return { ok:true };
  }
  function buyFreeze(){
    var acct = getAcctData();
    if((acct.coins || 0) < FREEZE_PRICE) return { ok:false, reason:'insufficient' };
    acct.coins -= FREEZE_PRICE;
    acct.freezeCards = (acct.freezeCards || 0) + 1;
    saveAcctData(acct);
    return { ok:true };
  }
  // 免打卡卡真正生效的地方：往 habitCheckins 里补一条"当天"记录（不发金币，因为没有真的做），
  // 复用 habitStreakInfo 现成的"这天是否有打卡"逻辑，连续天数自然就接上了，不用另外维护一套判断。
  function useStreakFreeze(habitId){
    var acct = getAcctData();
    if((acct.freezeCards || 0) <= 0 || !habitId) return null;
    var today = todayKey();
    if(habitCheckedInOn(acct, habitId, today)) return null;
    acct.freezeCards -= 1;
    acct.habitCheckins.push({ id: uid(), habitId: habitId, dateKey: today, points: 0, loggedAt: Date.now(), viaFreeze: true });
    var newlyBadges = checkAndRecordBadgeUnlocks(acct);
    saveAcctData(acct);
    return { newlyBadges: newlyBadges };
  }
  // 强调色只改 --link 这一个变量，写在 :root 上（不是 #appHome），这样弹窗（跟 #appHome 是兄弟节点）
  // 也能用得到；#marketingView 自己单独定义了一份 --link，优先级更高，不会被这里影响到。
  function applyAccentTheme(){
    var acct = getAcctData();
    var def = SHOP_ACCENTS.filter(function(a){ return a.id === acct.equippedAccent; })[0] || SHOP_ACCENTS[0];
    var isDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.style.setProperty('--link', isDark ? def.dark : def.light);
  }
  if(window.matchMedia){
    var accentMq = window.matchMedia('(prefers-color-scheme: dark)');
    var onAccentMqChange = function(){ if(appHome && !appHome.hidden) applyAccentTheme(); };
    if(accentMq.addEventListener) accentMq.addEventListener('change', onAccentMqChange);
    else if(accentMq.addListener) accentMq.addListener(onAccentMqChange);
  }
  function profileAchievementScore(acct){
    var TIER_SCORE = { bronze:1, silver:3, gold:8, special:5 };
    var score = 0;
    BADGE_CATALOG.forEach(function(b){ if(acct.badgeUnlocks[b.id]) score += (TIER_SCORE[b.tier] || 1); });
    return score;
  }

  function renderShopView(){
    var body = document.getElementById('shopBody');
    if(!body) return;
    var acct = getAcctData();
    var html = '<button class="app-back-link" type="button" id="shopBackBtn">← 返回导航台</button>' +
      '<div class="app-main-topbar" style="margin-bottom:14px;">' +
        '<div><p class="app-greeting-eyebrow">金币能买到的都是这个app自己能兑现的东西</p><h1 style="font-size:1.3rem;">🪙 金币商城 · 补给站</h1></div>' +
        '<span class="app-coin" id="shopCoinBadge">🪙 ' + (acct.coins || 0) + '</span>' +
      '</div>';

    html += '<div class="shop-section"><h2 class="shop-section-title">🦆 头像装饰</h2>' +
      '<p class="shop-section-desc">换一只不一样的上岸鸭，只影响你自己看到的头像（在"我的"页面），不影响任何数据。</p>' +
      '<div class="shop-grid">' + SHOP_AVATARS.map(function(a){
        var owned = (acct.ownedAvatars || []).indexOf(a.id) !== -1;
        var equipped = acct.equippedAvatar === a.id;
        return '<div class="shop-item-card' + (equipped ? ' is-equipped' : '') + '">' +
          '<div class="shop-item-avatar">' + duckAvatarSvg(a, 56) + '</div>' +
          '<b class="shop-item-name">' + escapeHtml(a.name) + '</b>' +
          (equipped
            ? '<span class="shop-item-tag is-equipped-tag">使用中</span>'
            : '<button class="btn ' + (owned ? 'btn-ghost' : 'btn-primary') + ' btn-sm" type="button" data-avatar="' + a.id + '">' + (owned ? '装备' : ('🪙' + a.price + ' 购买')) + '</button>') +
        '</div>';
      }).join('') + '</div></div>';

    html += '<div class="shop-section"><h2 class="shop-section-title">🎨 航海主题色</h2>' +
      '<p class="shop-section-desc">换一种强调色，按钮和高亮跟着变，深色模式下也另配了一版颜色。</p>' +
      '<div class="shop-grid">' + SHOP_ACCENTS.map(function(a){
        var owned = (acct.ownedAccents || []).indexOf(a.id) !== -1;
        var equipped = acct.equippedAccent === a.id;
        return '<div class="shop-item-card' + (equipped ? ' is-equipped' : '') + '">' +
          '<div class="shop-item-swatch" style="background:' + a.light + '"></div>' +
          '<b class="shop-item-name">' + escapeHtml(a.name) + '</b>' +
          (equipped
            ? '<span class="shop-item-tag is-equipped-tag">使用中</span>'
            : '<button class="btn ' + (owned ? 'btn-ghost' : 'btn-primary') + ' btn-sm" type="button" data-accent="' + a.id + '">' + (owned ? '装备' : ('🪙' + a.price + ' 购买')) + '</button>') +
        '</div>';
      }).join('') + '</div></div>';

    html += '<div class="shop-section"><h2 class="shop-section-title">🧊 免打卡卡</h2>' +
      '<p class="shop-section-desc">哪天实在抽不出时间也没关系——用一张卡保住连续打卡不清零。当前库存 <b>' + (acct.freezeCards || 0) + '</b> 张，去"习惯"页面里，某个习惯今天还没打卡且连续天数还在时就能用。</p>' +
      '<div class="shop-grid"><div class="shop-item-card">' +
        '<div class="shop-item-avatar shop-item-freeze-icon" aria-hidden="true">🧊</div>' +
        '<b class="shop-item-name">免打卡卡 ×1</b>' +
        '<button class="btn btn-primary btn-sm" type="button" id="buyFreezeBtn">🪙' + FREEZE_PRICE + ' 购买</button>' +
      '</div></div></div>';

    body.innerHTML = DOMPurify.sanitize(html);

    var backBtn = document.getElementById('shopBackBtn');
    if(backBtn) backBtn.addEventListener('click', function(){ switchAppView('daily'); });

    function afterShopAction(result, btn){
      if(result && result.ok === false){
        if(btn){ btn.closest('.shop-item-card').classList.remove('is-shake'); void btn.offsetWidth; btn.closest('.shop-item-card').classList.add('is-shake'); }
        showHabitToast('🪙 金币不够啦');
        return;
      }
      updateCoinDisplay();
      renderShopView();
    }
    body.querySelectorAll('[data-avatar]').forEach(function(btn){
      btn.addEventListener('click', function(){ afterShopAction(buyAvatar(btn.getAttribute('data-avatar')), btn); });
    });
    body.querySelectorAll('[data-accent]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var res = buyAccent(btn.getAttribute('data-accent'));
        if(res && res.ok !== false) applyAccentTheme();
        afterShopAction(res, btn);
      });
    });
    var buyFreezeBtn = document.getElementById('buyFreezeBtn');
    if(buyFreezeBtn) buyFreezeBtn.addEventListener('click', function(){ afterShopAction(buyFreeze(), buyFreezeBtn); });
  }

  // ---- 精力曲线："我的"页里的一条 24 小时色条 + 图例，纯展示 acct.energyPeriods（时间段的增删改
  // 都在"管理时间段"弹窗里做，见下面的 openEnergyManageModal 那一组函数）----
  var ENERGY_COLORS = ['#E8916A', '#4C8DFF', '#8B6FE0', '#4FB286', '#DA8F1E', '#5A5FA8'];
  function energyPeriodColor(idx){ return ENERGY_COLORS[idx % ENERGY_COLORS.length]; }
  function energyStripHtml(periods){
    if(!periods.length) return '';
    var totalMin = 24 * 60;
    var segs = periods.map(function(p, idx){
      var left = Math.max(0, Math.min(100, (p.startMin / totalMin) * 100));
      var width = Math.max(0, Math.min(100 - left, (p.endMin - p.startMin) / totalMin * 100));
      return '<div class="energy-seg" style="left:' + left + '%;width:' + width + '%;background:' + energyPeriodColor(idx) + ';" title="' + escapeHtml(p.name) + ' ' + fmtClock(p.startMin) + '–' + fmtClock(p.endMin) + '">' + escapeHtml(p.emoji || '') + '</div>';
    }).join('');
    var ticks = [0, 6, 12, 18, 24].map(function(h){
      return '<span style="left:' + (h / 24 * 100) + '%;">' + pad2(h) + ':00</span>';
    }).join('');
    return '<div class="energy-strip">' +
      '<div class="energy-strip-track">' + segs + '</div>' +
      '<div class="energy-strip-ticks">' + ticks + '</div>' +
    '</div>';
  }
  function energyLegendHtml(periods){
    if(!periods.length) return '<p class="empty-state">还没有设置精力时间段，点右上角"管理时间段"加一个吧</p>';
    return '<div class="energy-legend">' + periods.map(function(p, idx){
      return '<div class="energy-legend-row">' +
        '<span class="energy-legend-dot" style="background:' + energyPeriodColor(idx) + '" aria-hidden="true"></span>' +
        '<span class="energy-legend-name">' + escapeHtml(p.emoji || '') + ' ' + escapeHtml(p.name) + '</span>' +
        '<span class="energy-legend-time">' + fmtClock(p.startMin) + '–' + fmtClock(p.endMin) + '</span>' +
        (p.suggestion ? ('<span class="energy-legend-suggestion">' + escapeHtml(p.suggestion) + '</span>') : '') +
      '</div>';
    }).join('') + '</div>';
  }
  // ---- 任务间缓冲："我的"页一个下拉，直接改 acct.taskGapMinutes；写法照抄"可投入几小时"
  // 那个 hoursSelect 下拉的模式（同一个 change 事件 -> 存 -> 重渲染）----
  function gapMinutesOptionsHtml(current){
    var opts = [0, 5, 10, 12, 15, 20, 25, 30];
    if(opts.indexOf(current) === -1) opts.push(current);
    opts.sort(function(a, b){ return a - b; });
    return opts.map(function(v){
      return '<option value="' + v + '"' + (v === current ? ' selected' : '') + '>' + (v === 0 ? '不留缓冲' : v + ' 分钟') + '</option>';
    }).join('');
  }
  // ---- 个人时间块画像："我的"页第三张纯展示卡片——不读写任何新的 acct 字段，
  // 全部从 acct.tasks 里"今天"的任务实时算出来：排了具体时间的任务按时长分成
  // 2小时级/1小时级/20分钟级三档画在色条上；重要且紧急、但还没排上具体时间的事
  // 算进"备用时间"（一件都没有时也留一个默认垫底值，不是非要出事才有意义）；
  // 剩下的算"空闲"。纯展示，跟精力曲线一样不影响任何已有数据。----
  var TIMEBLOCK_TIERS = [
    { key: 'big', label: '2小时级', color: '#3E7C6B', min: 90 },
    { key: 'mid', label: '1小时级', color: '#D9A441', min: 35 },
    { key: 'small', label: '20分钟级', color: '#6C8EBF', min: 0 }
  ];
  function timeblockTierOf(mins){
    for(var i = 0; i < TIMEBLOCK_TIERS.length; i++){ if(mins >= TIMEBLOCK_TIERS[i].min) return TIMEBLOCK_TIERS[i]; }
    return TIMEBLOCK_TIERS[TIMEBLOCK_TIERS.length - 1];
  }
  function timeblockPortraitData(acct){
    var todayK = todayKey();
    var todayTasks = acct.tasks.filter(function(t){ return t.date === todayK; });
    var scheduled = todayTasks.filter(function(t){ return typeof t.startMinutes === 'number' && t.plannedMinutes; });
    var segs = scheduled.map(function(t){
      var tier = timeblockTierOf(t.plannedMinutes);
      return { startMin: t.startMinutes, endMin: t.startMinutes + t.plannedMinutes, tier: tier, name: t.name };
    }).sort(function(a, b){ return a.startMin - b.startMin; });
    var tierTotals = {};
    TIMEBLOCK_TIERS.forEach(function(tier){ tierTotals[tier.key] = 0; });
    scheduled.forEach(function(t){ tierTotals[timeblockTierOf(t.plannedMinutes).key] += t.plannedMinutes; });
    var scheduledMin = scheduled.reduce(function(sum, t){ return sum + t.plannedMinutes; }, 0);
    // 重要且紧急、还没排上具体时间的事——随时可能要插进来，用备用时间接住；
    // 一件都没有时也留个默认量（30分钟垫底），不是非要真出突发状况才显示这个概念。
    var urgentImportantUnscheduled = todayTasks.filter(function(t){
      return t.important && t.urgent && !t.done && typeof t.startMinutes !== 'number';
    });
    var urgentImportantMin = urgentImportantUnscheduled.reduce(function(sum, t){ return sum + (t.plannedMinutes || 0); }, 0);
    var reserveMin = Math.max(30, urgentImportantMin);
    var freeMin = Math.max(0, 24 * 60 - scheduledMin - reserveMin);
    return {
      segs: segs, tierTotals: tierTotals, reserveMin: reserveMin, freeMin: freeMin,
      urgentImportantCount: urgentImportantUnscheduled.length, hasAnyTask: todayTasks.length > 0
    };
  }
  function timeblockStripHtml(data){
    var totalMin = 24 * 60;
    var segs = data.segs.map(function(s){
      var left = Math.max(0, Math.min(100, (s.startMin / totalMin) * 100));
      var width = Math.max(0, Math.min(100 - left, (s.endMin - s.startMin) / totalMin * 100));
      return '<div class="energy-seg" style="left:' + left + '%;width:' + width + '%;background:' + s.tier.color + ';" title="' + escapeHtml(s.name || '') + ' · ' + s.tier.label + '"></div>';
    }).join('');
    var ticks = [0, 6, 12, 18, 24].map(function(h){
      return '<span style="left:' + (h / 24 * 100) + '%;">' + pad2(h) + ':00</span>';
    }).join('');
    return '<div class="energy-strip">' +
      '<div class="energy-strip-track">' + segs + '</div>' +
      '<div class="energy-strip-ticks">' + ticks + '</div>' +
    '</div>';
  }
  function timeblockLegendHtml(data){
    if(!data.hasAnyTask){
      return '<p class="empty-state">今天还没排任务，排上之后这里会按时长自动分出大块/中块/碎片时间</p>';
    }
    var rows = TIMEBLOCK_TIERS.map(function(tier){
      return '<div class="energy-legend-row">' +
        '<span class="energy-legend-dot" style="background:' + tier.color + '" aria-hidden="true"></span>' +
        '<span class="energy-legend-name">' + tier.label + '</span>' +
        '<span class="energy-legend-time">' + fmtDuration(data.tierTotals[tier.key]) + '</span>' +
      '</div>';
    }).join('');
    var reserveNote = data.urgentImportantCount > 0
      ? ('今天有 ' + data.urgentImportantCount + ' 件重要且紧急、还没排具体时间的事，先按这个量留出来')
      : '没有紧急插队的事时，默认留这么多垫底，随时接得住突发状况';
    rows += '<div class="energy-legend-row">' +
      '<span class="energy-legend-dot" style="background:var(--urgent)" aria-hidden="true"></span>' +
      '<span class="energy-legend-name">⚡ 备用</span>' +
      '<span class="energy-legend-time">' + fmtDuration(data.reserveMin) + '</span>' +
      '<span class="energy-legend-suggestion">' + reserveNote + '</span>' +
    '</div>';
    rows += '<div class="energy-legend-row">' +
      '<span class="energy-legend-dot" style="background:var(--border)" aria-hidden="true"></span>' +
      '<span class="energy-legend-name">🌤 空闲</span>' +
      '<span class="energy-legend-time">' + fmtDuration(data.freeMin) + '</span>' +
      '<span class="energy-legend-suggestion">这段时间空着，真出岔子了也有地方补，不用慌</span>' +
    '</div>';
    return '<div class="energy-legend">' + rows + '</div>';
  }
  // ---- 导出到手机日历 ----
  // 华为日历（以及苹果日历、Outlook、几乎所有日历 App）都认 .ics 这个标准格式。
  // 关键是每条的 UID 用任务自己的 id 固定死：改完计划再导一次，日历会认出"这是同一件事"
  // 去更新原来那条，而不是又加一条重复的——这就是"同步"要的效果。
  // 全程在你自己的浏览器里生成，一个字节都不经过任何服务器。
  function icsEscape(s){
    return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  function icsStamp(d){
    function p(n){ return (n < 10 ? '0' : '') + n; }
    return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + 'T' +
           p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
  }
  // 折行：ics 规定一行最多 75 字节，超了要在下一行开头加一个空格接着写
  function icsFold(line){
    var out = [], s = line;
    while(s.length > 70){ out.push(s.slice(0, 70)); s = ' ' + s.slice(70); }
    out.push(s);
    return out.join('\r\n');
  }
  function buildTasksIcs(acct){
    var now = new Date();
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//shangan-ya//task calendar//CN',
                 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:上岸鸭 · 我的计划'];
    var n = 0;
    (acct.tasks || []).forEach(function(t){
      if(typeof t.startMinutes !== 'number' || !t.date) return;
      var d0 = parseDateKey(t.date);
      if(!d0 || isNaN(d0.getTime())) return;
      var start = new Date(d0.getTime() + t.startMinutes * 60000);
      var end = new Date(start.getTime() + (t.plannedMinutes || t.estMinutes || 30) * 60000);
      var desc = [];
      desc.push('类别：' + (t.category || ''));
      desc.push('分量：' + weightLabel(t));
      if(t.estMinutes) desc.push('预计 ' + fmtDuration(t.estMinutes) + '，含缓冲 ' + fmtDuration(t.plannedMinutes));
      if(t.dueDate) desc.push('截止：' + t.dueDate + (t.dueTime ? (' ' + t.dueTime) : ''));
      var steps = getTaskSteps(t);
      if(steps.length) desc.push('关卡：' + steps.map(function(s, i){ return (i + 1) + '.' + s.text; }).join(' / '));
      desc.push('来自上岸鸭');
      lines.push('BEGIN:VEVENT');
      lines.push('UID:shanganya-' + t.id + '@shangan-ya');
      // SEQUENCE 每次导出都往上走，日历才肯用新的覆盖旧的那条
      lines.push('SEQUENCE:' + Math.floor(Date.now() / 60000 % 100000));
      lines.push('DTSTAMP:' + icsStamp(now));
      lines.push('DTSTART:' + icsStamp(start));
      lines.push('DTEND:' + icsStamp(end));
      lines.push(icsFold('SUMMARY:' + icsEscape((t.done ? '✓ ' : '') + t.name)));
      lines.push(icsFold('DESCRIPTION:' + icsEscape(desc.join('\n'))));
      lines.push('STATUS:' + (t.done ? 'COMPLETED' : 'CONFIRMED'));
      // 有硬截止的，提前一天响一次——就是"提前一天敲警钟"那条，搬到手机上
      if(t.dueDate && !t.done){
        lines.push('BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY',
                   icsFold('DESCRIPTION:' + icsEscape('明天就到期了：' + t.name)), 'END:VALARM');
      }
      lines.push('END:VEVENT');
      n++;
    });
    lines.push('END:VCALENDAR');
    return { text: lines.join('\r\n'), count: n };
  }
  // 发布在 claude.ai 上的那个版本，浏览器一律不让页面往外存文件——点下载是静悄悄什么都不发生的。
  // 与其让你对着一个没反应的按钮发懵，不如退一步：把内容复制到剪贴板，你自己粘进一个 .ics 文件，
  // 效果完全一样。部署到自己的网址之后就是正常下载，没有这层限制。
  function inArtifactViewer(){ return true; }
  function exportTasksIcs(){ var b=buildTasksIcs(getAcctData()); if(!b.count){alert('先为任务安排具体时间，再查看日历文本。');return;} window.SYMini.text('日历文本 · 手动复制保存',b.text); }
  function exportTasksIcsDownload(){ exportTasksIcs(); }

  // "我的"页里的后端设置卡：连没连上、连上之后哪几项能力活了、口令填哪儿、日历怎么导。
  // 这张卡是整套联网功能唯一的开关和唯一的真相来源——能不能用，这儿写得明明白白，不含糊。
  // ---- 数据搬家 ----
  // 这个 App 的全部数据只存在浏览器本地的一个 key 里，而浏览器的本地存储是<b>认网址</b>的：
  // 换一个网址打开，等于换了一台新机器，原来的任务/金币/知识库一条都不会跟过来。
  // 所以要搬家（比如从 claude.ai 搬到你自己的服务器）必须有这两个出口：把整份数据导出成一段文字，
  // 在新网址那边再粘回去。这里只读 APP_DATA_KEY；导入是<b>唯一</b>会写它的地方，而且：
  //   ① 必须你亲手点、亲手确认；② 写之前先把当前内容原样存到另一个 key 当后悔药；
  //   ③ 先让你看清这份备份里到底有什么，再决定写不写。
  var DATA_BACKUP_KEY = APP_DATA_KEY + '__before_import';
  var importText = '', importPreview = null, importMsg = '';
  // file:// 和 http://127.0.0.1 是不同 origin，旧版数据必须由旧页面主动只读传回。
  var LEGACY_PAGE_URL = 'file:///C:/Users/jiang/Documents/Codex/2026-09-20/zh/shanganya-upgrade/shangan-ya-deploy-v63/index.html';
  var legacyBridgeWindow = null;
  function rawAllDataText(){
    try { return window.localStorage.getItem(APP_DATA_KEY) || '{}'; } catch(e){ return '{}'; }
  }
  // 一份备份里到底装了什么——搬家之前和之后各看一眼，对得上才算搬成了
  function describeBackup(obj){
    var out = [];
    Object.keys(obj || {}).forEach(function(k){
      var a = obj[k] || {};
      out.push({
        acct: k,
        tasks: (a.tasks || []).length,
        coins: typeof a.coins === 'number' ? a.coins : 0,
        notes: (a.tasks || []).filter(function(t){ return t.note || t.noteFramework; }).length,
        habits: (a.habits || []).length,
        checkins: (a.habitCheckins || []).length,
        badges: Object.keys(a.badgeUnlocks || {}).length,
        durations: (a.durationLog || []).length
      });
    });
    return out;
  }
  function backupLineHtml(r){
    return '<li>账号 <b>' + escapeHtml(String(r.acct)) + '</b>：' +
      r.tasks + ' 条任务（' + r.notes + ' 条有笔记）、' + r.coins + ' 金币、' +
      r.habits + ' 个习惯 / ' + r.checkins + ' 次打卡、' +
      r.badges + ' 枚勋章、' + r.durations + ' 条专注记录</li>';
  }
  function previewImportText(text){
    importText = String(text || '').trim();
    if(!importText){ importPreview = null; importMsg = '先把旧版数据读回来，或把导出的备份粘进来。'; return; }
    var obj;
    try { obj = JSON.parse(importText); }
    catch(e){ importPreview = { ok: false }; importMsg = '❌ 旧版传回的数据不是完整 JSON：' + escapeHtml(String(e.message || e)); return; }
    if(!obj || typeof obj !== 'object' || Array.isArray(obj)){
      importPreview = { ok: false }; importMsg = '❌ 数据格式不对：最外层应该是一个账号对象。'; return;
    }
    var rows = describeBackup(obj);
    if(!rows.length){ importPreview = { ok: false }; importMsg = '❌ 旧版页面没有读到账号数据；旧数据没有被覆盖。'; return; }
    importPreview = { ok: true, rows: rows };
    importMsg = '✅ 已从旧版页面读到数据。请核对下面的数量，确认后才会导入。';
  }
  function openLegacyDataBridge(){
    importMsg = '正在打开旧版页面读取本机旧数据……'; renderProfileView();
    var url = LEGACY_PAGE_URL + '?shanganyaBridge=1&ts=' + Date.now();
    try { legacyBridgeWindow = window.open(url, 'shanganya-legacy-data', 'width=1100,height=760,resizable=yes,scrollbars=yes'); }
    catch(e){ legacyBridgeWindow = null; }
    if(!legacyBridgeWindow){
      importMsg = '浏览器阻止了旧版页面窗口。请允许弹窗，或在旧版页面查看备份文本后手动粘贴。'; renderProfileView();
    }
  }
  window.addEventListener('message', function(event){
    var data = event && event.data;
    if(!data || data.source !== 'shanganya-legacy-export-v1') return;
    if(legacyBridgeWindow && event.source && event.source !== legacyBridgeWindow) return;
    previewImportText(data.text);
    if(importPreview && importPreview.ok) importMsg = '✅ 已从旧版页面读到数据。旧版页面仍保持原样，确认导入前不会修改它。';
    renderProfileView();
  });
  function dataMoveCardHtml(){
    var now = describeBackup(JSON.parse(rawAllDataText() || '{}'));
    var bytes = rawAllDataText().length;
    var h = '<div class="datamove-card">' +
      '<div class="energy-card-head"><h2 class="shop-section-title">📦 数据搬家 / 备份</h2></div>' +
      '<p class="energy-card-hint"><b>你的数据只存在这个浏览器里，而且认网址。</b>' +
      '换一个网址打开这个 App（比如搬到你自己的服务器），那边是一台空机器，什么都不会自动跟过去。' +
      '要搬，就在这儿导出一段文字，去新网址那边粘回去。平时也可以拿它当备份——清浏览器数据之前存一份。</p>' +
      '<p class="datamove-now">这台现在装着（' + Math.round(bytes / 1024) + ' KB）：</p>' +
      '<ul class="datamove-list">' + (now.length ? now.map(backupLineHtml).join('') : '<li>还是空的</li>') + '</ul>' +
      '<div class="datamove-btns">' +
        '<button class="btn btn-primary btn-sm" type="button" id="dataLegacyBtn">↔️ 读取旧版数据</button>' +
        '<button class="btn btn-primary btn-sm" type="button" id="dataExportBtn">⬇️ 查看备份文本</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" id="dataImportToggle">⬆️ 我要粘一份备份进来</button>' +
      '</div>' +
      (importMsg ? ('<p class="datamove-msg">' + importMsg + '</p>') : '');
    if(importPreview !== null || importText){
      h += '<div class="datamove-import">' +
        '<textarea id="dataImportInput" rows="5" placeholder="把在旧网址那边导出的那一大段文字，整个粘到这儿。">' + escapeHtml(importText) + '</textarea>' +
        '<div class="datamove-btns">' +
          '<button class="btn btn-ghost btn-sm" type="button" id="dataPreviewBtn">👀 先看看这份里有什么</button>' +
          (importPreview && importPreview.ok
            ? '<button class="btn btn-primary btn-sm" type="button" id="dataDoImportBtn">✅ 确认导入（会覆盖这台现在的数据）</button>'
            : '') +
        '</div>';
      if(importPreview && importPreview.ok){
        h += '<p class="datamove-now">这份备份里装着：</p>' +
          '<ul class="datamove-list">' + importPreview.rows.map(backupLineHtml).join('') + '</ul>' +
          '<p class="datamove-warn">⚠️ 导入会把<b>这台现在的数据整个换成上面这份</b>。' +
          '换之前我会自动把现在这份原样存一个副本（存在同一个浏览器里，键名 <code>' + escapeHtml(DATA_BACKUP_KEY) + '</code>），' +
          '万一粘错了还能找回来。</p>';
      }
      h += '</div>';
    }
    return h + '</div>';
  }
  function exportAllData(){ window.SYMini.text('全部数据 · 手动复制备份',rawAllDataText()); }
  function previewImport(){
    var el = document.getElementById('dataImportInput');
    importText = (el && el.value || '').trim();
    previewImportText(importText);
    renderProfileView();
  }
  function doImportData(){
    if(!importPreview || !importPreview.ok) return;
    var rows = importPreview.rows;
    var sum = rows.reduce(function(s, r){ return s + r.tasks; }, 0);
    if(!window.confirm('确认把这台的数据整个换成这份备份？\n\n' +
        '要写入：' + rows.length + ' 个账号、共 ' + sum + ' 条任务。\n' +
        '这台现在的内容会先原样留一个副本，但页面上看不到了。\n\n' +
        '确定就按「确定」。')) return;
    try {
      var cur = rawAllDataText();
      window.localStorage.setItem(DATA_BACKUP_KEY, cur);       // 后悔药：先存旧的
      window.localStorage.setItem(APP_DATA_KEY, importText);   // 再写新的
    } catch(e){
      importMsg = '❌ 写不进去：' + escapeHtml(String(e.message || e)) +
        '（多半是浏览器本地存储满了）。旧数据没动。';
      renderProfileView(); return;
    }
    importText = ''; importPreview = null;
    importMsg = '✅ 导进来了。下面这一排数字对一下，跟旧网址那边一样就是搬成了。';
    // 重新读一遍并刷新整页，让所有视图都用上新数据
    renderProfileView();
    try { refreshCurrentView(); } catch(e){}
  }
  function backendCardHtml(){
    return '<section class="backend-card"><h2>连接你的知识库</h2><p>选择 Obsidian 文件夹后，可搜索笔记、跳转原文，并预览后保存卡点答案。无需安装插件。</p><button type="button" class="btn btn-primary" data-open-vault>打开本机资料舱</button><hr><button type="button" class="btn btn-ghost" id="icsExportBtn">查看日历文本</button></section>';
  }

  function renderProfileView(){
    var body = document.getElementById('profileBody');
    if(!body) return;
    var acct = getAcctData();
    // 老账号第一次打开这个页面时，历史数据可能早就够格拿好几个勋章了——在这里兜底补发，
    // 不用非得"从今天开始重新做一遍"才能拿到本来就该有的勋章。
    var newly = checkAndRecordBadgeUnlocks(acct);
    if(newly.length) saveAcctData(acct);

    var avatarDef = SHOP_AVATARS.filter(function(a){ return a.id === acct.equippedAvatar; })[0] || SHOP_AVATARS[0];
    var unlockedCount = BADGE_CATALOG.filter(function(b){ return !!acct.badgeUnlocks[b.id]; }).length;
    var score = profileAchievementScore(acct);
    // 个人简介：点头像、或点简介后面那个"写一句/编辑"链接，走的是同一个 openBioModal。
    // 没写过时用提示文案占位，不会误导成"这就是我写的介绍"。
    var bioText = (acct.bio || '').trim();

    var html = '<div class="profile-summary-card">' +
      '<div class="profile-summary-avatar" id="profileAvatarBtn" role="button" tabindex="0" aria-label="编辑个人简介">' + duckAvatarSvg(avatarDef, 72) + '</div>' +
      '<div class="profile-summary-info">' +
        '<h1 class="profile-summary-name">' + escapeHtml(currentDisplayName || '同学') + '</h1>' +
        '<p class="profile-summary-meta">🎖️ 成就值 ' + score + ' · 勋章 ' + unlockedCount + '/' + BADGE_CATALOG.length + ' · 🪙 历史累计 ' + (acct.lifetimeCoins || 0) + ' 枚</p>' +
        '<p class="profile-summary-bio' + (bioText ? '' : ' is-empty') + '">' + (bioText ? escapeHtml(bioText) : '还没写简介') +
          '<button class="profile-bio-edit-btn" type="button" id="profileBioEditBtn">✏️ ' + (bioText ? '编辑' : '写一句') + '</button></p>' +
      '</div>' +
      '<button class="btn btn-ghost btn-sm" type="button" id="profileToShopBtn">🪙 去金币商城</button>' +
    '</div>';

    html += '<div class="energy-card">' +
      '<div class="energy-card-head"><h2 class="shop-section-title">🌅 精力曲线</h2>' +
        '<button class="btn btn-ghost btn-sm" type="button" id="energyManageBtn">⚙️ 管理时间段</button></div>' +
      '<p class="energy-card-hint">按你自己的状态标出一天里的黄金专注期/平缓期/灵感期，安排任务时可以对着挑时间——难啃的任务尽量往状态好的时间段放。</p>' +
      energyStripHtml(acct.energyPeriods) +
      energyLegendHtml(acct.energyPeriods) +
    '</div>';
    html += backendCardHtml();
    html += dataMoveCardHtml();
    html += '<div class="gap-card">' +
      '<div class="day-hours-card-row">⏳ 任务间缓冲' +
        '<select class="day-hours-select" id="taskGapSelect">' + gapMinutesOptionsHtml(acct.taskGapMinutes) + '</select>' +
      '</div>' +
      '<p class="energy-card-hint" style="margin-bottom:0;">点"日"视图里的"AI计划生成"帮你自动排任务时，任务之间会留出这么久的缓冲——喝口水、缓一缓，不会紧接着无缝衔接下一件事（手动拖时间不受这个限制）。</p>' +
    '</div>';

    var tbData = timeblockPortraitData(acct);
    html += '<div class="timeblock-card">' +
      '<div class="energy-card-head"><h2 class="shop-section-title">🧩 个人时间块画像</h2></div>' +
      '<p class="energy-card-hint">今天的任务按时长自动分成大块/中块/碎片时间，重要紧急但还没排上的事先留出备用时间接住，剩下的空闲提醒自己：万一被打乱了，也有地方能补救。</p>' +
      timeblockStripHtml(tbData) +
      timeblockLegendHtml(tbData) +
    '</div>';

    var byCat = {}, catOrder = [];
    BADGE_CATALOG.forEach(function(b){
      if(!byCat[b.cat]){ byCat[b.cat] = []; catOrder.push(b.cat); }
      byCat[b.cat].push(b);
    });
    html += '<div class="badge-wall"><h2 class="shop-section-title">🎖️ 勋章墙</h2>';
    catOrder.forEach(function(cat){
      html += '<p class="badge-wall-cat">' + escapeHtml(cat) + '</p><div class="badge-wall-grid">' +
        byCat[cat].map(function(b){
          var unlockedAt = acct.badgeUnlocks[b.id];
          var isNew = unlockedAt && (Date.now() - unlockedAt) < 3 * 86400000;
          return '<div class="badge-card' + (unlockedAt ? '' : ' is-locked') + '">' +
            (isNew ? '<span class="badge-card-new">NEW</span>' : '') +
            medalSvg(b.tier, b.glyph, !unlockedAt) +
            '<b class="badge-card-name">' + escapeHtml(b.name) + '</b>' +
            '<small class="badge-card-desc">' + escapeHtml(b.desc) + '</small>' +
          '</div>';
        }).join('') +
      '</div>';
    });
    html += '</div>';
    html += '<div class="profile-extra-row"><button class="btn btn-ghost btn-sm" type="button" id="profileManageCatBtn">⚙️ 管理任务类别</button></div>';

    body.innerHTML = DOMPurify.sanitize(html);
    var toShop = document.getElementById('profileToShopBtn');
    if(toShop) toShop.addEventListener('click', function(){ switchAppView('shop'); });
    var mgr = document.getElementById('profileManageCatBtn');
    if(mgr) mgr.addEventListener('click', openCategoryManageModal);
    var avatarBtn = document.getElementById('profileAvatarBtn');
    if(avatarBtn){
      avatarBtn.addEventListener('click', openBioModal);
      avatarBtn.addEventListener('keydown', function(e){
        if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openBioModal(); }
      });
    }
    var bioEditBtn = document.getElementById('profileBioEditBtn');
    if(bioEditBtn) bioEditBtn.addEventListener('click', openBioModal);
    var energyManageBtn = document.getElementById('energyManageBtn');
    if(energyManageBtn) energyManageBtn.addEventListener('click', openEnergyManageModal);
    var backendSaveBtn = document.getElementById('backendSaveBtn');
    if(backendSaveBtn) backendSaveBtn.addEventListener('click', function(){
      var b = document.getElementById('backendBaseInput');
      var t = document.getElementById('backendTokenInput');
      saveBackendCfg(b ? b.value : '', t ? t.value : '');
      backendProbe(true).then(function(){ renderProfileView(); });
      renderProfileView();
    });
    var backendTestBtn = document.getElementById('backendTestBtn');
    if(backendTestBtn) backendTestBtn.addEventListener('click', function(){
      backendState.checked = false;
      renderProfileView();
      backendProbe(true).then(function(){ renderProfileView(); });
    });
    var icsExportBtn = document.getElementById('icsExportBtn');
    if(icsExportBtn) icsExportBtn.addEventListener('click', exportTasksIcs);

    var dataLegacyBtn = document.getElementById('dataLegacyBtn');
    if(dataLegacyBtn) dataLegacyBtn.addEventListener('click', openLegacyDataBridge);
    var dataExportBtn = document.getElementById('dataExportBtn');
    if(dataExportBtn) dataExportBtn.addEventListener('click', exportAllData);
    var dataImportToggle = document.getElementById('dataImportToggle');
    if(dataImportToggle) dataImportToggle.addEventListener('click', function(){
      // 把粘贴框叫出来。importPreview 从 null 变成 false 只是"框已经展开"的意思，
      // 没点「先看看」之前，确认导入那个按钮不会出现——不给误点的机会。
      importPreview = { ok: false }; importMsg = ''; renderProfileView();
      var t = document.getElementById('dataImportInput'); if(t) t.focus();
    });
    var dataPreviewBtn = document.getElementById('dataPreviewBtn');
    if(dataPreviewBtn) dataPreviewBtn.addEventListener('click', previewImport);
    var dataImportInput = document.getElementById('dataImportInput');
    if(dataImportInput) dataImportInput.addEventListener('input', function(){
      // 改了内容就把上一次的预览作废，逼着重新看一眼再导——不让旧预览给新文本背书
      if(importPreview && importPreview.ok){ importPreview = { ok: false }; renderProfileView(); }
    });
    var dataDoImportBtn = document.getElementById('dataDoImportBtn');
    if(dataDoImportBtn) dataDoImportBtn.addEventListener('click', doImportData);

    var taskGapSelect = document.getElementById('taskGapSelect');
    if(taskGapSelect) taskGapSelect.addEventListener('change', function(){
      var v = parseInt(taskGapSelect.value, 10);
      if(isNaN(v) || v < 0) return;
      var a = getAcctData();
      a.taskGapMinutes = v;
      saveAcctData(a);
      renderProfileView();
    });

    toastNewBadges(newly);
  }

  // ---- 侧边栏"我的清单"类别快捷入口 + "打印小票"弹层 ----
  function renderSidebarCategoryList(){
    var box = document.getElementById('sidebarCatLists');
    if(!box) return;
    var acct = getAcctData();
    var html = '<div class="app-sidebar-lists-title">我的清单</div>';
    acct.categories.forEach(function(c){
      html += '<button class="app-sidebar-list-item" type="button" data-cat="' + escapeHtml(c.name) + '">' +
        '<span class="dot" style="background:' + c.color + '" aria-hidden="true"></span>' +
        '<span>' + escapeHtml(c.name) + '</span>' +
      '</button>';
    });
    html += '<button class="app-sidebar-list-item app-sidebar-manage-cat" type="button" id="sidebarManageCatBtn">' +
      '<span class="dot is-manage" aria-hidden="true">⚙</span><span>管理类别</span>' +
    '</button>';
    box.innerHTML = DOMPurify.sanitize(html);
    box.querySelectorAll('.app-sidebar-list-item[data-cat]').forEach(function(btn){
      btn.addEventListener('click', function(){ openCategoryReceipt(btn.getAttribute('data-cat')); });
    });
    var sidebarManageCatBtn = document.getElementById('sidebarManageCatBtn');
    if(sidebarManageCatBtn) sidebarManageCatBtn.addEventListener('click', openCategoryManageModal);
  }
  var receiptOpenCat = null;
  function receiptContentHtml(cat){
    var acct = getAcctData();
    var grouped = groupUndoneTasksByCategory(acct);
    var tasks = grouped.byCat[cat] || [];
    if(!tasks.length){
      return { count: 0, html: '<p class="empty-state">这个类别现在没有未完成的任务。</p>' };
    }
    return { count: tasks.length, html: categoryTaskRowsHtml(tasks, acct.activeTimer) };
  }
  function openCategoryReceipt(cat){
    var overlay = document.getElementById('receiptOverlay');
    if(!overlay || !cat) return;
    receiptOpenCat = cat;
    document.getElementById('receiptHeadDot').style.background = categoryColor(cat);
    document.getElementById('receiptHeadName').textContent = cat;
    var body = document.getElementById('receiptBody');
    var result = receiptContentHtml(cat);
    body.innerHTML = DOMPurify.sanitize(result.count ? result.html : '<div class="receipt-complete"><strong>✓ 这张小票完成了</strong><p>可以收起来，下一张票再出发。</p></div>');
    bindTaskListInteractions(body);
    body.querySelectorAll('.app-task-menu').forEach(function(m){ m.hidden = true; });
    var d = new Date();
    document.getElementById('receiptHeadMeta').textContent = '共 ' + result.count + ' 条 · 打印于 ' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    var paper = document.getElementById('receiptPaper');
    paper.classList.remove('is-closing');
    // 重新触发一次"打印出纸"的动画（哪怕弹层已经开着、只是切换了类别）
    paper.style.animation = 'none';
    void paper.offsetWidth;
    paper.style.animation = '';
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeCategoryReceipt(){
    var overlay = document.getElementById('receiptOverlay');
    var paper = document.getElementById('receiptPaper');
    if(!overlay || overlay.hidden) return;
    receiptOpenCat = null;
    paper.classList.add('is-closing');
    var done = function(){
      overlay.hidden = true;
      paper.classList.remove('is-closing');
      document.body.style.overflow = '';
      paper.removeEventListener('animationend', done);
    };
    paper.addEventListener('animationend', done);
  }
  // 弹层开着的时候，如果任务数据变了（打勾、删除、AI排期……不管是从弹层里操作的，还是
  // 恰好在另一个视图操作的），弹层里显示的内容也要跟着刷新，不然会看到跟实际数据对不上的小票。
  function renderCategoryReceiptIfOpen(){
    var overlay = document.getElementById('receiptOverlay');
    if(!overlay || overlay.hidden || !receiptOpenCat) return;
    var body = document.getElementById('receiptBody');
    var result = receiptContentHtml(receiptOpenCat);
    body.innerHTML = DOMPurify.sanitize(result.count ? result.html : '<div class="receipt-complete"><strong>✓ 这张小票完成了</strong><p>可以收起来，下一张票再出发。</p></div>');
    bindTaskListInteractions(body);
    document.getElementById('receiptHeadMeta').textContent = '共 ' + result.count + ' 条 · 打印于 ' + (function(){ var d = new Date(); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; })();
  }
  (function initReceiptOverlay(){
    var overlay = document.getElementById('receiptOverlay');
    var closeBtn = document.getElementById('receiptCloseBtn');
    if(closeBtn) closeBtn.addEventListener('click', closeCategoryReceipt);
    var okBtn = document.getElementById('receiptOkBtn');
    if(okBtn) okBtn.addEventListener('click', closeCategoryReceipt);
    if(overlay) overlay.addEventListener('click', function(e){ if(e.target === overlay) closeCategoryReceipt(); });
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape') closeCategoryReceipt();
    });
  })();

  // ---- 收集箱：已完成任务归档 ----
  function renderInbox(){
    var body = document.getElementById('inboxBody');
    if(!body) return;
    var acct = getAcctData();
    var done = acct.tasks.filter(function(t){ return t.done; }).sort(function(a, b){ return (b.completedAt || 0) - (a.completedAt || 0); });
    if(!done.length){
      body.innerHTML = DOMPurify.sanitize('<p class="empty-state">还没有已完成的任务——去"每日清单"打对号，完成的任务会自动收进这里。</p>');
      return;
    }
    body.innerHTML = DOMPurify.sanitize('<ul class="inbox-list">' + done.map(function(t){
      var when = t.completedAt ? new Date(t.completedAt) : null;
      var whenStr = when ? (when.getMonth() + 1) + '月' + when.getDate() + '日完成' : '';
      return '<li class="inbox-item" data-id="' + t.id + '">' +
        '<span class="inbox-item-check" aria-hidden="true">✓</span>' +
        '<div class="inbox-item-body">' +
          '<p class="inbox-item-name">' + escapeHtml(t.name) + '</p>' +
          '<p class="inbox-item-meta">' + escapeHtml(t.category) + ' · 预计' + fmtDuration(t.plannedMinutes) + (whenStr ? ' · ' + whenStr : '') + '</p>' +
        '</div>' +
        '<div class="app-task-actions">' +
          '<button class="app-task-menu-btn" type="button" aria-label="更多">⋮</button>' +
          '<div class="app-task-menu" hidden>' +
            '<button type="button" data-act="edit">编辑</button>' +
            '<button type="button" class="danger" data-act="delete">删除</button>' +
          '</div>' +
        '</div>' +
        '</li>';
    }).join('') + '</ul>');

    body.querySelectorAll('.app-task-menu-btn').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var menu = btn.nextElementSibling;
        var wasHidden = menu.hidden;
        document.querySelectorAll('.app-task-menu').forEach(function(m){ m.hidden = true; });
        menu.hidden = !wasHidden;
      });
    });
    body.querySelectorAll('.app-task-menu button').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var li = btn.closest('.inbox-item');
        var id = li && li.getAttribute('data-id');
        var act = btn.getAttribute('data-act');
        btn.closest('.app-task-menu').hidden = true;
        if(act === 'edit') openTaskModal(id);
        else if(act === 'delete') deleteTask(id);
      });
    });
  }

  // ---- 番茄钟：独立全屏计时页 ----
  function stopPomodoroTicker(){
    if(pomodoroTickHandle){ clearInterval(pomodoroTickHandle); pomodoroTickHandle = null; }
  }
  function renderPomodoroView(){
    var body = document.getElementById('pomodoroBody');
    if(!body) return;
    stopPomodoroTicker();
    var acct = getAcctData();
    var at = acct.activeTimer;

    // 没有任务在计时：这个页面本身也是一个入口——挑今天的任务直接开始，不一定非要从清单里点进来。
    if(!at){
      pomodoroConfirmingStop = false;
      pomodoroConfirmingDuration = false;
      pomoCheckin = null;
      pomoLeg = null; pomoLegProofOpen = false; pomoLegProofText = ''; // 计时结束，这一关的运行时状态一并清掉
      stopCamWatch(); // 没有计时中的任务了，摄像头守望也没有意义，一并关掉
      document.body.classList.remove('is-voyage-mode');
      var today = todayKey();
      var candidates = acct.tasks.filter(function(t){ return !t.done && t.date === today; })
        .sort(function(a, b){
          var am = typeof a.startMinutes === 'number' ? a.startMinutes : 99999;
          var bm = typeof b.startMinutes === 'number' ? b.startMinutes : 99999;
          if(am !== bm) return am - bm;
          return a.order - b.order;
        });
      var html = '<div class="pomo-wrap">' +
        '<h1 style="font-size:1.3rem;margin-bottom:6px;">🍅 番茄钟</h1>' +
        '<p class="app-greeting-eyebrow" style="margin-bottom:18px;">挑一个今天的任务开始计时——也可以直接从"每日清单"里任务旁边的"开始"进来</p>';
      if(!candidates.length){
        html += '<p class="stats-empty">今天还没有未完成的任务，去"每日清单"加一个吧。</p>';
      } else {
        html += '<ul class="pomo-picker-list">' + candidates.map(function(t){
          var timeStr = typeof t.startMinutes === 'number' ? (fmtClock(t.startMinutes) + ' · ') : '';
          return '<li class="pomo-picker-item">' +
            '<div><div class="pomo-picker-name">' + escapeHtml(t.name) + '</div>' +
            '<div class="pomo-picker-meta">' + timeStr + escapeHtml(t.category) + ' · 计划' + fmtDuration(t.plannedMinutes) + '</div></div>' +
            '<button class="app-task-start-btn" type="button" data-start-id="' + t.id + '">▶ 开始</button>' +
            '</li>';
        }).join('') + '</ul>';
      }
      html += '</div>';
      body.innerHTML = DOMPurify.sanitize(html);
      body.querySelectorAll('[data-start-id]').forEach(function(btn){
        btn.addEventListener('click', function(){ handleStartClick(btn.getAttribute('data-start-id')); });
      });
      return;
    }

    var t = acct.tasks.find(function(x){ return x.id === at.taskId; });
    if(!t){ acct.activeTimer = null; saveAcctData(acct); renderPomodoroView(); return; }
    var running = !!at.runningSince;

    // 点了"完成航点"：先问一句是否已完成，这时候时间已经定住了，不会边问边继续走。
    if(pomodoroConfirmingStop){
      document.body.classList.remove('is-voyage-mode');
      var mins = Math.max(0, Math.round(timerElapsedMs(at) / 60000));
      body.innerHTML = DOMPurify.sanitize('<div class="pomo-wrap">' +
        '<button class="pomo-back" type="button" id="pomoBackBtn">← 先不结束，回去看看</button>' +
        '<div class="pomo-stage">' +
        '<p class="pomo-confirm-q">⚓ 《' + escapeHtml(t.name) + '》这次航段结束，共 ' + fmtDuration(mins) + '。这次算完成了吗？</p>' +
        focusScoreHtml(at.taskId) +
        '<div class="firsttime-choice">' +
        '<button class="firsttime-btn" type="button" id="pomoConfirmYes"><b>✅ 已抵达航点</b><span>标记完成、发放金币；下一步确认用时后记进数据档案</span></button>' +
        '<button class="firsttime-btn" type="button" id="pomoConfirmNo"><b>⛴ 还在路上</b><span>先不算完成，任务留在未完成里；下一步确认用时后依然会记录</span></button>' +
        '</div></div></div>');
      var backBtn = document.getElementById('pomoBackBtn');
      if(backBtn) backBtn.addEventListener('click', function(){ pomodoroConfirmingStop = false; renderPomodoroView(); });
      var yesBtn = document.getElementById('pomoConfirmYes');
      if(yesBtn) yesBtn.addEventListener('click', function(){
        pomodoroPendingCompleted = true; pomodoroConfirmingStop = false; pomodoroConfirmingDuration = true; renderPomodoroView();
      });
      var noBtn = document.getElementById('pomoConfirmNo');
      if(noBtn) noBtn.addEventListener('click', function(){
        pomodoroPendingCompleted = false; pomodoroConfirmingStop = false; pomodoroConfirmingDuration = true; renderPomodoroView();
      });
      return;
    }

    // 用时确认屏：忘记停计时/中途被打断这类情况，表盘量出来的分钟数会离谱地偏大——不能默认它一定对，
    // 所以"是否完成"选完之后，再让用户看一眼具体数字确认一遍；选"不对，我改一下"才会展开输入框，
    // 正常情况点一下"没问题"就过去了，不增加额外负担。这里改的只是即将写入的这一条新记录的分钟数，
    // 跟"数据档案"里改历史记录（openDurationEditModal）是两处不同入口，但共享同一个 finishTimerSession。
    if(pomodoroConfirmingDuration){
      document.body.classList.remove('is-voyage-mode');
      var mins2 = Math.max(0, Math.round(timerElapsedMs(at) / 60000));
      var statsForCat = categoryDurationStats(acct, t.category);
      body.innerHTML = DOMPurify.sanitize('<div class="pomo-wrap">' +
        '<button class="pomo-back" type="button" id="pomoDurBackBtn">← 返回上一步</button>' +
        '<div class="pomo-stage">' +
        '<p class="pomo-confirm-q">这次表盘量到 <b>' + fmtDuration(mins2) + '</b>，记到数据档案里对吗？</p>' +
        '<div class="firsttime-choice">' +
        '<button class="firsttime-btn" type="button" id="pomoDurYes"><b>✅ 没问题，就这个数</b><span>直接记进数据档案</span></button>' +
        '<button class="firsttime-btn" type="button" id="pomoDurEditToggle"><b>✏️ 不对，我改一下</b><span>比如中途忘了停，实际没这么久</span></button>' +
        '</div>' +
        '<div class="pomo-duration-edit" id="pomoDurEditBox" hidden>' +
        '<label class="field">改成实际用了多少分钟<div class="input-row"><input type="number" min="0" step="1" id="pomoDurInput" value="' + mins2 + '"></div></label>' +
        (statsForCat ? '<button type="button" class="stats-log-edit-btn" id="pomoDurUseAvg">用「' + escapeHtml(t.category) + '」历史平均 · ' + fmtDuration(statsForCat.avgMinutes) + '</button>' : '') +
        '<button class="btn btn-primary submit-btn" type="button" id="pomoDurSave">保存这个用时</button>' +
        '</div></div></div>');
      var durBackBtn = document.getElementById('pomoDurBackBtn');
      if(durBackBtn) durBackBtn.addEventListener('click', function(){ pomodoroConfirmingDuration = false; pomodoroConfirmingStop = true; renderPomodoroView(); });
      var durYesBtn = document.getElementById('pomoDurYes');
      if(durYesBtn) durYesBtn.addEventListener('click', function(){ pomodoroConfirmingDuration = false; finishTimerSession(pomodoroPendingCompleted); });
      var durEditToggle = document.getElementById('pomoDurEditToggle');
      var durEditBox = document.getElementById('pomoDurEditBox');
      var durInput = document.getElementById('pomoDurInput');
      if(durEditToggle) durEditToggle.addEventListener('click', function(){ durEditBox.hidden = false; durEditToggle.closest('.firsttime-choice').hidden = true; durInput.focus(); durInput.select(); });
      var durUseAvgBtn = document.getElementById('pomoDurUseAvg');
      if(durUseAvgBtn) durUseAvgBtn.addEventListener('click', function(){ durInput.value = statsForCat.avgMinutes; });
      var durSaveBtn = document.getElementById('pomoDurSave');
      if(durSaveBtn) durSaveBtn.addEventListener('click', function(){
        var v = parseInt(durInput.value, 10);
        if(isNaN(v) || v < 0){ durInput.focus(); return; }
        pomodoroConfirmingDuration = false;
        finishTimerSession(pomodoroPendingCompleted, v);
      });
      return;
    }

    // 卡壳检查点弹出中：整个替换成检查点的三分支交互，跟上面"完成航点"确认屏是同一种
    // "拿状态位接管 pomo-wrap"的写法，选完分支才会回到下面正常的计时表盘。
    if(pomoCheckin){
      document.body.classList.remove('is-voyage-mode');
      renderPomoCheckinBody(body, t);
      return;
    }

    function renderStage(){
      var freshAt = getAcctData().activeTimer;
      var elapsedMs = timerElapsedMs(freshAt);
      var targetMs = at.targetMinutes * 60000;
      var isSilent = at.mode === 'silent';
      var overtime = at.mode === 'countdown' && elapsedMs >= targetMs;
      var displayMs = at.mode !== 'countdown' ? elapsedMs : (overtime ? (elapsedMs - targetMs) : (targetMs - elapsedMs));
      var pct = isSilent ? 0 : (at.mode === 'countdown' ? Math.min(100, Math.round((elapsedMs / targetMs) * 100)) : (running ? 100 : 0));
      var note = !running ? '已暂停 · 临时靠岸中，回来接着算'
        : (at.mode === 'countdown' ? (overtime ? '已经用完计划时间，继续算作超时' : '倒计时中 · 目标 ' + fmtDuration(at.targetMinutes))
          : isSilent ? '不计时中 · 专心做事，结束的时候才会告诉你用了多久' : '正计时中 · 不设目标');
      var clockEl = document.getElementById('pomoClock');
      var noteEl = document.getElementById('pomoClockNote');
      var fillEl = document.getElementById('pomoRingFill');
      if(clockEl){
        clockEl.className = 'pomo-clock' + (!running ? ' is-paused' : '') + (overtime ? ' is-overtime' : '') + (isSilent ? ' is-silent' : '');
        clockEl.textContent = isSilent ? (running ? '🙈 专注中' : '⏸ 已暂停') : ((overtime ? '+' : '') + fmtStopwatch(displayMs));
      }
      if(noteEl) noteEl.textContent = note;
      if(fillEl){ fillEl.style.width = pct + '%'; fillEl.classList.toggle('is-overtime', overtime); }
      // 当前这一关的实时状态：专注就涨（往前走），走神就停——每帧刷新
      var legEl = document.getElementById('pomoLegLive');
      if(legEl && pomoLeg && pomoLeg.active){
        var lf = pomoLegFocus();
        if(!lf.cam){
          legEl.textContent = '▶ 计时中 · 没开摄像头，做完点终点（会请你补一句证明）';
          legEl.className = 'pq-live';
        } else {
          var oksec = Math.round(lf.ok / 1000);
          var okTxt = oksec < 60 ? (oksec + '秒') : (Math.round(oksec / 60) + '分');
          if(camWatch.state === 'ok' || camWatch.state === 'calib'){
            legEl.textContent = '🟢 在状态 · 这一关已专注 ' + okTxt;
            legEl.className = 'pq-live is-ok';
          } else {
            legEl.textContent = '🔴 走神了（离座/低头/转头）· 进度停在 ' + okTxt + '，回来';
            legEl.className = 'pq-live is-bad';
          }
        }
      }
      document.body.classList.toggle('is-voyage-mode', running);
      // 倒计时过半时轻提示一次，纯粹读已有的 elapsedMs 算。
      if(pomoVoyagePrompts.taskId !== at.taskId){
        pomoVoyagePrompts = { taskId: at.taskId, shownHalf: false, checkinBucket: 0, lastDoneCount: 0 };
        // 换任务时，把"上次检查点时过了几关"对齐到这条任务当前的实际进度，
        // 不然第一次检查点会把之前就做完的关算成"这一段过的"。
        // 注意：这个函数里没有现成的 acct，得自己取——之前直接写 acct 会每帧抛异常，
        // 把整个计时循环打断，检查点就永远弹不出来了。
        var acct0 = getAcctData();
        var t0 = (acct0.tasks || []).find(function(x){ return x.id === at.taskId; });
        pomoVoyagePrompts.lastDoneCount = getTaskSteps(t0).filter(function(s){ return s.done; }).length;
      }
      // 过半：以前只弹一句轻提示，人不看屏幕就等于没提。现在开一次完整检查点——
      // 冻住时钟、报成果、问准不准。倒计时模式才有"过半"这个概念。
      if(running && !pomoVoyagePrompts.shownHalf && at.mode === 'countdown' && elapsedMs >= targetMs / 2){
        pomoVoyagePrompts.shownHalf = true;
        if(!pomoCheckin){
          // 把整 5 分钟那套的格子对齐到此刻，否则过半这次一关掉，
          // 5 分钟那次会立刻再弹一遍——连着两个检查点，烦死人。
          pomoVoyagePrompts.checkinBucket = Math.floor(elapsedMs / (5 * 60000));
          openPomoCheckin('half');
        } else {
          lcVoyagePrompt('过半了，导航仪在这儿陪着你');
        }
      }
      // 卡壳检查点：每5分钟一个整点位（5/10/15…分钟）弹一次交互式检查，问用户当下的真实情况——
      // 跟以前"宁可不提示也不瞎猜"的被动轻提示不同，这次是直接问，不是靠 elapsedMs 猜状态。
      var checkinBucket = Math.floor(elapsedMs / (5 * 60000));
      if(running && !pomoCheckin && checkinBucket > pomoVoyagePrompts.checkinBucket){
        pomoVoyagePrompts.checkinBucket = checkinBucket;
        openPomoCheckin();
      }
      // 30分钟沙漏：跟正式计时是两回事——这里只按墙钟时间走，暂停也照样流（沙漏本来就是给"要不要
      // 做个调整决定"用的视觉提醒，不是用时统计）；换了任务会自动重新满上，见 startTaskTimer。
      if(pomoHourglass.taskId !== at.taskId) pomoHourglass = { taskId: at.taskId, anchor: Date.now() };
      var hgRemain = Math.max(0, HOURGLASS_MS - (Date.now() - pomoHourglass.anchor));
      var hgPctRemain = (hgRemain / HOURGLASS_MS) * 100;
      var hgTopEl = document.getElementById('hourglassSandTop');
      var hgBotEl = document.getElementById('hourglassSandBottom');
      var hgLabelEl = document.getElementById('hourglassLabel');
      var hgWidgetEl = document.getElementById('hourglassWidget');
      if(hgTopEl) hgTopEl.style.height = hgPctRemain + '%';
      if(hgBotEl) hgBotEl.style.height = (100 - hgPctRemain) + '%';
      if(hgLabelEl) hgLabelEl.textContent = (hgRemain <= 0 ? '沙漏已流完 · ' : '还剩 ') + fmtStopwatch(hgRemain);
      if(hgWidgetEl) hgWidgetEl.classList.toggle('is-empty', hgRemain <= 0);
    }

    var html = '<div class="pomo-wrap' + (running ? ' is-voyage' : '') + '">' +
      '<button class="pomo-back" type="button" id="pomoBackBtn">← 返回清单（计时继续）</button>' +
      '<div class="pomo-stage">' +
      '<span class="pomo-stage-cat">' + escapeHtml(t.category) + '</span>' +
      '<div class="pomo-stage-name">' + escapeHtml(t.name) + '</div>' +
      '<p class="pomo-stage-sub">' + (typeof t.startMinutes === 'number' ? ('计划 ' + fmtClock(t.startMinutes) + ' 开始 · ') : '') + '计划用时' + fmtDuration(t.plannedMinutes) + '</p>' +
      '<div class="pomo-voyage-screen">' +
        '<div class="pomo-clock' + (!running ? ' is-paused' : '') + '" id="pomoClock">00:00</div>' +
        '<p class="pomo-clock-note" id="pomoClockNote"></p>' +
        '<div class="pomo-ring-track"><div class="pomo-ring-fill" id="pomoRingFill"></div></div>' +
      '</div>' +
      pomoQuestStripHtml(t) +
      '<div class="pomo-actions">' +
      (running
        ? '<button class="btn btn-ghost" id="pomoPauseBtn" type="button">⚓ 临时靠岸</button>'
        : '<button class="btn btn-primary" id="pomoResumeBtn" type="button">继续</button>') +
      '<button class="btn btn-ghost" id="pomoStopBtn" type="button" style="border-color:var(--urgent);color:var(--urgent);">🏁 完成航点</button>' +
      '</div>' +
      '<div class="hourglass-widget" id="hourglassWidget">' +
        '<div class="hourglass-shape">' +
          '<div class="hourglass-bulb is-top"><div class="hourglass-sand" id="hourglassSandTop"></div></div>' +
          '<div class="hourglass-bulb is-bottom"><div class="hourglass-sand" id="hourglassSandBottom"></div></div>' +
        '</div>' +
        '<p class="hourglass-label" id="hourglassLabel">还剩 30:00</p>' +
        '<button class="btn btn-ghost btn-sm" id="hourglassFlipBtn" type="button">🔄 翻转沙漏 · 突发状况</button>' +
        '<p class="hourglass-hint">30分钟沙漏，陪着计时——真遇到突发状况，翻一下强迫自己在沙子流完前做个决定（继续/搁置/改计划），不影响上面正式的计时和记录</p>' +
      '</div>' +
      camWatchWidgetHtml() +
      '</div></div>';
    body.innerHTML = DOMPurify.sanitize(html);
    renderStage();
    // 摄像头本身（camWatch.stream）是独立于这次渲染的运行时状态，不会因为上面重建了 HTML 就断掉；
    // 只需要把它重新接到这次新画出来的预览 <video> 标签上（哪怕跳去"完成航点"确认屏这种没有这个
    // 组件的画面又切回来，逻辑一样成立——找不到预览标签就什么都不做，摄像头依然在后台正常取帧）。
    if(camWatch.enabled && camWatch.stream){
      var camPreviewEl = document.getElementById('camWatchPreview');
      if(camPreviewEl) camPreviewEl.srcObject = camWatch.stream;
    }
    // 计时页上的当前关：起点 / 终点 / 补证 / 看地图
    var pqStart = document.getElementById('pqLegStart');
    if(pqStart) pqStart.addEventListener('click', function(){
      var stp = getTaskSteps(t); var ci = currentStepIndex(stp);
      // 起点＝拍下此刻的专注计数，之后 okMs 涨多少就是这一关真专注了多少；纯运行时，不存盘
      pomoLeg = { taskId: t.id, stepIndex: ci, okAtStart: camWatch.okMs || 0, badAtStart: camWatch.badMs || 0, active: true };
      pomoLegProofOpen = false; pomoLegProofText = '';
      renderPomodoroView();
      lcVoyagePrompt(camWatch.enabled ? '起点！盯着你了——认真做，进度就往前走' : '起点！开始这一关');
    });
    var pqEnd = document.getElementById('pqLegEnd');
    if(pqEnd) pqEnd.addEventListener('click', function(){
      if(pomoLegFocusedEnough()){ pomoClearLeg('focus'); }
      else { pomoLegProofOpen = true; renderPomodoroView(); }   // 不够专注 → 要补证
    });
    var pqGiveup = document.getElementById('pqLegGiveup');
    if(pqGiveup) pqGiveup.addEventListener('click', function(){ pomoLeg = null; pomoLegProofOpen = false; renderPomodoroView(); });
    var pqProofCancel = document.getElementById('pqProofCancel');
    if(pqProofCancel) pqProofCancel.addEventListener('click', function(){ pomoLegProofOpen = false; renderPomodoroView(); });
    var pqProofTextEl = document.getElementById('pqProofText');
    if(pqProofTextEl) pqProofTextEl.addEventListener('input', function(){ pomoLegProofText = pqProofTextEl.value; });
    var pqProofSubmit = document.getElementById('pqProofSubmit');
    if(pqProofSubmit) pqProofSubmit.addEventListener('click', function(){
      var v = (pqProofTextEl && pqProofTextEl.value || '').trim();
      if(v.length < 6){ if(pqProofTextEl) pqProofTextEl.focus(); lcVoyagePrompt('说具体点——做了什么、有什么收获，至少一句'); return; }
      pomoClearLeg('report', v);
    });
    var pqProofMic = document.getElementById('pqProofMic');
    if(pqProofMic) pqProofMic.addEventListener('click', function(){ pomoStartDictation(pqProofMic); });
    var pqOpen = document.getElementById('pomoQuestOpen');
    if(pqOpen) pqOpen.addEventListener('click', function(){ openQuest(t.id); });

    var camWatchToggleBtn = document.getElementById('camWatchToggleBtn');
    if(camWatchToggleBtn) camWatchToggleBtn.addEventListener('click', toggleCamWatch);
    var camVisionToggle = document.getElementById('camVisionToggle');
    if(camVisionToggle) camVisionToggle.addEventListener('change', function(){
      camWatch.aiOn = !!camVisionToggle.checked;
      camWatch.aiNote = camWatch.aiOn ? '开了——下一次采样就会发一张过去' : '';
      camWatch.aiLastAt = 0; // 打开之后立刻看一次，不用等满一轮
      updateCamWatchStatusUI();
    });
    // 语音提醒开关 + 「试一句」。都只改 camWatch 这个纯运行时对象，不落任何账号数据。
    var camVoiceToggle = document.getElementById('camVoiceToggle');
    if(camVoiceToggle) camVoiceToggle.addEventListener('change', function(){
      camWatch.voiceOn = !!camVoiceToggle.checked;
      if(!camWatch.voiceOn) camSpeakStop();
      else camSpeak('turn', 1); // 打开就先念一句，让你当场知道音量够不够、嗓子对不对
    });
    var camVoiceTestBtn = document.getElementById('camVoiceTestBtn');
    if(camVoiceTestBtn) camVoiceTestBtn.addEventListener('click', function(){
      var was = camWatch.voiceOn;
      camWatch.voiceOn = true;              // 试听不受开关限制，听完再还回去
      var ok = camSpeak('away', 2);
      camWatch.voiceOn = was;
      if(!ok) alert('这个浏览器没让它出声。常见原因：系统静音、或者浏览器把这个页面的声音屏蔽了。');
    });
    // 走神时自动补看一眼的开关
    var camAutoAiToggle = document.getElementById('camAutoAiToggle');
    if(camAutoAiToggle) camAutoAiToggle.addEventListener('change', function(){
      camWatch.autoAiOn = !!camAutoAiToggle.checked;
      camWatch.aiNote = camWatch.autoAiOn
        ? ('开了——下次判出走神就自动确认一次（这段还剩 ' + Math.max(0, CAMVISION_AUTO_BUDGET - camWatch.autoAiUsed) + ' 次）')
        : '关了——只在你点「看一眼」的时候才发画面';
      updateCamWatchStatusUI();
    });
    // 「看一眼」：手动一次一张那条路。点了才发，绝不自动。
    var camVisionOnceBtn = document.getElementById('camVisionOnceBtn');
    if(camVisionOnceBtn) camVisionOnceBtn.addEventListener('click', function(){
      if(camWatch.aiBusy) return;
      if(!camWatch.enabled || !camWatch.videoEl || !camWatch.videoEl.videoWidth){
        camWatch.aiNote = '摄像头还没出画面，等一两秒再点';
        updateCamWatchStatusUI();
        return;
      }
      camWatch.aiNote = '正在让 Claude 看这一帧…';
      camWatch.aiLastAt = Date.now();
      updateCamWatchStatusUI();
      camVisionCheck(); // 里头自己管 aiBusy，失败也只写一行提示，不影响本机那套判断
    });
    // 强度按钮 + 军令状输入框：都只改 camWatch 这个纯运行时对象，不落任何账号数据
    Array.prototype.slice.call(document.querySelectorAll('.camwatch-strict button')).forEach(function(b){
      b.addEventListener('click', function(){
        camWatch.strict = b.getAttribute('data-strict') || 'normal';
        var vowEl = document.getElementById('camWatchVow');
        if(vowEl) camWatch.vow = vowEl.value.trim(); // 重画之前先把已经写了一半的军令状留住
        renderPomodoroView();
      });
    });
    var camVowEl = document.getElementById('camWatchVow');
    if(camVowEl) camVowEl.addEventListener('input', function(){ camWatch.vow = camVowEl.value.trim(); });

    var backBtn2 = document.getElementById('pomoBackBtn');
    if(backBtn2) backBtn2.addEventListener('click', function(){ switchAppView('daily'); });
    var pauseBtn = document.getElementById('pomoPauseBtn');
    if(pauseBtn) pauseBtn.addEventListener('click', pauseTimerSession);
    var resumeBtn = document.getElementById('pomoResumeBtn');
    if(resumeBtn) resumeBtn.addEventListener('click', resumeTimerSession);
    var hourglassFlipBtn = document.getElementById('hourglassFlipBtn');
    if(hourglassFlipBtn) hourglassFlipBtn.addEventListener('click', function(){
      pomoHourglass.anchor = Date.now();
      renderStage();
    });
    var stopBtn = document.getElementById('pomoStopBtn');
    if(stopBtn) stopBtn.addEventListener('click', function(){
      // 点停止先把时间定住（跟临时离开一样的累加方式）——问"是否完成"的时候数字不会还在跳。
      var acct2 = getAcctData();
      var at2 = acct2.activeTimer;
      if(at2 && at2.runningSince){ at2.accumulatedMs += (Date.now() - at2.runningSince); at2.runningSince = null; saveAcctData(acct2); }
      stopCamWatch(); // 这次航段结束了，摄像头守望也跟着关掉，不留到确认屏之后
      pomodoroConfirmingStop = true;
      renderPomodoroView();
    });

    if(running) pomodoroTickHandle = setInterval(renderStage, 1000);
  }

  // ---- 数据档案：航行黑匣子 + 记录打印带 ----
  // ===== 数据档案：曲线图 =====
  // 一次只看一个类别的曲线（用户明确选的形式），x 轴是"该类别内第几次"（seq 在记录写入时就按类别算好了，
  // 见 finishTimerSession），y 轴是这一次实际用了多少分钟。单一系列，配色照 dataviz skill 走"标题已经说明
  // 是哪个类别，不需要图例"，颜色固定用 --viz-series（skill 已验证过色阶/对比度的 aqua），不随类别切换变色——
  // 因为同一时刻只画一条线，不存在"跟别的系列比较"，颜色在这里代表"用时"这件事本身，不是某个类别的身份色。
  var statsSelectedCat = null;
  // 纸带范围：只影响下面曲线能看到几个点（"纸带长度"），不影响回执读数——回执永远说最新一次真实记录。
  var statsSelectedRange = '30d';
  var STATS_RANGES = [ { key:'7d', label:'7天' }, { key:'30d', label:'30天' }, { key:'month', label:'本月' } ];
  function statsRangeStartKey(range){
    var today = todayKey();
    if(range === '7d') return addDaysKey(today, -6);
    if(range === 'month'){ var d = parseDateKey(today); return fmtDateKey(new Date(d.getFullYear(), d.getMonth(), 1)); }
    return addDaysKey(today, -29);
  }

  // 坐标轴刻度圆整到"好看的数"：1/2/5 的数量级阶梯，最少 1 分钟一格（时长不会出现比 1 分钟还细的刻度）。
  function niceAxisStep(range, targetTicks){
    var rough = range / Math.max(1, targetTicks);
    var mag = Math.pow(10, Math.floor(Math.log(rough) / Math.LN10));
    var norm = rough / mag;
    var step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
    return Math.max(1, step * mag);
  }
  function buildYAxis(maxVal){
    var step = niceAxisStep(maxVal, 4);
    var niceMax = Math.max(step, Math.ceil(maxVal / step) * step);
    var ticks = [];
    for(var v = 0; v <= niceMax + 1e-6; v += step) ticks.push(Math.round(v));
    return { niceMax: niceMax, ticks: ticks };
  }

  // records 必须已经按 seq 升序排好。返回图表的 HTML（SVG + 悬浮提示层），并把 hover/键盘焦点的绑定
  // 留给 bindDurationChartInteractions 在插入 DOM 之后再做。
  // 纸带宽度不是固定值——每条记录占一个固定槽位（slotW），记录越多纸带原生越宽；svg 按 1:1 像素渲染
  // （不用 width:100% 拉伸），这样文字/线条粗细不会因为记录少而被拉伸变形。记录少时纸带本身就短，
  // 靠左躺在卡片里，跟"真的只印了这么长一段纸"一样；记录多到原生宽度超过卡片时，外层 svgwrap
  // 横向滚动——这就是"用户切换7日/30日/月视图时，纸带长度随之展开"的实际效果。最少给4格宽度，
  // 避免只有1、2条记录时纸带短得像个邮票。
  function buildDurationChartHtml(records){
    var H = 220, padL = 32, padR = 16, padT = 16, padB = 26;
    var n = records.length;
    var slotW = 56;
    var plotW = slotW * Math.max(4, n - 1);
    var W = padL + padR + plotW;
    var plotH = H - padT - padB;
    var maxVal = Math.max.apply(null, records.map(function(r){ return r.actualMinutes; }));
    var axis = buildYAxis(maxVal);
    function xAt(i){ return n <= 1 ? padL + plotW / 2 : padL + (plotW * i / (n - 1)); }
    function yAt(v){ return padT + plotH - (plotH * Math.min(v, axis.niceMax) / axis.niceMax); }

    var gridHtml = axis.ticks.map(function(v){
      var y = yAt(v);
      return '<line class="viz-gridline" x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '"/>' +
        '<text class="viz-axistext" x="' + (padL - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + v + '</text>';
    }).join('');

    var xEvery = n > 12 ? Math.ceil(n / 10) : 1;
    var xLabelHtml = records.map(function(r, i){
      if(xEvery > 1 && (i % xEvery !== 0) && i !== n - 1) return '';
      return '<text class="viz-axistext" x="' + xAt(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + r.seq + '</text>';
    }).join('');

    var lineAreaHtml = '';
    if(n > 1){
      var linePts = records.map(function(r, i){ return xAt(i) + ',' + yAt(r.actualMinutes); }).join(' ');
      var areaPath = 'M' + xAt(0) + ',' + yAt(0) + ' ' +
        records.map(function(r, i){ return 'L' + xAt(i) + ',' + yAt(r.actualMinutes); }).join(' ') +
        ' L' + xAt(n - 1) + ',' + yAt(0) + ' Z';
      lineAreaHtml = '<path class="viz-area" d="' + areaPath + '"/><polyline class="viz-line" points="' + linePts + '"/>';
    }

    var dotsHtml = records.map(function(r, i){
      var cx = xAt(i), cy = yAt(r.actualMinutes);
      return '<circle class="viz-dot" cx="' + cx + '" cy="' + cy + '" r="4"/>' +
        '<circle class="viz-dot-hit" data-idx="' + i + '" cx="' + cx + '" cy="' + cy + '" r="14" tabindex="0" ' +
          'aria-label="第' + r.seq + '次，' + escapeHtml(r.taskName) + '，实际用时' + fmtDuration(r.actualMinutes) + '"></circle>';
    }).join('');

    var lastIdx = n - 1, last = records[lastIdx];
    var endLabelHtml = '<text class="viz-endlabel" x="' + xAt(lastIdx) + '" y="' + (yAt(last.actualMinutes) - 12) + '" text-anchor="' + (n > 1 ? 'end' : 'middle') + '">' + fmtDuration(last.actualMinutes) + '</text>';

    return '<div class="duration-chart-svgwrap" id="durationChartWrap">' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:' + W + 'px;height:' + H + 'px" role="img" aria-label="' + escapeHtml('用时曲线：第几次到实际用了多少分钟') + '">' +
        gridHtml + xLabelHtml + lineAreaHtml + dotsHtml + endLabelHtml +
        '<line class="viz-crosshair" id="vizCrosshair" x1="0" y1="' + padT + '" x2="0" y2="' + (H - padB) + '"/>' +
      '</svg>' +
      '<div class="viz-tooltip" id="vizTooltip"></div>' +
    '</div>';
  }

  // 折线不是"啪"一下出现在卡片里，而是像纸带被送出来一样一点点画出来：先描边，圆点再跟着描边节奏
  // 依次亮起，最后才出现终点数字。纯 CSS transition 驱动（stroke-dashoffset 描边动画是标准技巧），
  // 每次切换类别/时间范围都会重新触发一遍，因为 DOM 是整块重建的。尊重 prefers-reduced-motion。
  function animateDurationTapeDraw(){
    var wrap = document.getElementById('durationChartWrap');
    if(!wrap) return;
    var svg = wrap.querySelector('svg');
    if(!svg) return;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduceMotion) return;
    var line = svg.querySelector('.viz-line');
    var area = svg.querySelector('.viz-area');
    var dots = Array.prototype.slice.call(svg.querySelectorAll('.viz-dot'));
    var endLabel = svg.querySelector('.viz-endlabel');
    var drawMs = Math.max(500, Math.min(1400, 220 + dots.length * 40));

    if(line && line.getTotalLength){
      var len = line.getTotalLength();
      line.style.strokeDasharray = len;
      line.style.strokeDashoffset = len;
      line.getBoundingClientRect(); // 强制回流，保证下面的 transition 真的从"没画"开始过渡
      line.style.transition = 'stroke-dashoffset ' + drawMs + 'ms ease';
      requestAnimationFrame(function(){ line.style.strokeDashoffset = '0'; });
    }
    if(area){
      area.style.opacity = '0';
      area.style.transition = 'opacity ' + Math.round(drawMs * .6) + 'ms ease ' + Math.round(drawMs * .5) + 'ms';
      requestAnimationFrame(function(){ area.style.opacity = '.1'; });
    }
    dots.forEach(function(dot, i){
      var delay = dots.length > 1 ? Math.round(drawMs * i / (dots.length - 1)) : 0;
      dot.style.opacity = '0';
      dot.style.transform = 'scale(.3)';
      dot.style.transition = 'opacity 220ms ease, transform 220ms ease';
      dot.style.transitionDelay = delay + 'ms';
      requestAnimationFrame(function(){ dot.style.opacity = '1'; dot.style.transform = 'scale(1)'; });
    });
    if(endLabel){
      endLabel.style.opacity = '0';
      endLabel.style.transition = 'opacity 260ms ease';
      endLabel.style.transitionDelay = drawMs + 'ms';
      requestAnimationFrame(function(){ endLabel.style.opacity = '1'; });
    }
  }

  // "记录打印带"回执：前3次基准 / 本次预计 / 本次实际 / 比上次提升多少 / AI下次建议——五行都来自
  // 这个类别的真实历史，一个字都不编。回执只认"最新一条真实记录"，跟纸带当前选的 7天/30天/本月 无关。
  function buildTapeReceiptHtml(allRecords, stats){
    var latest = allRecords[allRecords.length - 1];
    var prev = allRecords.length >= 2 ? allRecords[allRecords.length - 2] : null;
    var first3 = allRecords.slice(0, 3);
    var first3Avg = first3.length === 3 ? Math.round(first3.reduce(function(a, r){ return a + r.actualMinutes; }, 0) / 3) : null;
    var deltaMin = prev ? (latest.actualMinutes - prev.actualMinutes) : null;
    var deltaValHtml = !prev
      ? '<span class="lc-tape-row-val is-muted">还没有上一次可比</span>'
      : deltaMin < 0 ? '<span class="lc-tape-row-val is-better">▼ 快' + fmtDuration(-deltaMin) + '</span>'
      : deltaMin > 0 ? '<span class="lc-tape-row-val is-slower">▲ 多用' + fmtDuration(deltaMin) + '</span>'
      : '<span class="lc-tape-row-val">持平</span>';
    function row(label, valHtml){
      return '<div class="lc-tape-row"><span class="lc-tape-row-label">' + label + '</span>' + valHtml + '</div>';
    }
    return '<div class="lc-tape-receipt">' +
      row('前3次基准', first3Avg !== null ? '<span class="lc-tape-row-val">' + fmtDuration(first3Avg) + '</span>' : '<span class="lc-tape-row-val is-muted">还差' + (3 - first3.length) + '条</span>') +
      row('本次预计', '<span class="lc-tape-row-val">' + fmtDuration(latest.plannedMinutes) + '</span>') +
      row('本次实际', '<span class="lc-tape-row-val is-strong">' + fmtDuration(latest.actualMinutes) + '</span>') +
      row('比上次', deltaValHtml) +
      row('AI下次建议', stats ? '<span class="lc-tape-row-val">' + fmtDuration(stats.avgMinutes) + '</span>' : '<span class="lc-tape-row-val is-muted">还差' + (3 - allRecords.length) + '条</span>') +
    '</div>';
  }

  // 悬浮/键盘聚焦都走同一个 showFor：鼠标在折线上移动时找最近的点，不用非要精准停在圆点上；
  // 触摸/键盘 tab 到某个点时效果一致（interaction.md 里"键盘焦点跟 hover 展示一样的内容"）。
  function bindDurationChartInteractions(records){
    var wrap = document.getElementById('durationChartWrap');
    if(!wrap) return;
    var svg = wrap.querySelector('svg');
    var crosshair = document.getElementById('vizCrosshair');
    var tooltip = document.getElementById('vizTooltip');
    var dots = Array.prototype.slice.call(wrap.querySelectorAll('.viz-dot-hit'));
    if(!dots.length) return;

    function showFor(idx){
      var r = records[idx];
      var dot = dots[idx];
      if(!r || !dot) return;
      var cx = parseFloat(dot.getAttribute('cx'));
      var cy = parseFloat(dot.getAttribute('cy'));
      crosshair.setAttribute('x1', cx);
      crosshair.setAttribute('x2', cx);
      crosshair.style.opacity = '1';
      var d = parseDateKey(r.dateKey);
      tooltip.innerHTML = DOMPurify.sanitize('<div><b>第' + r.seq + '次</b> · ' + (d.getMonth() + 1) + '/' + d.getDate() + '</div>' +
        '<div>' + escapeHtml(r.taskName) + '</div>' +
        '<div>计划 ' + fmtDuration(r.plannedMinutes) + ' · <span class="viz-tooltip-val">实际 ' + fmtDuration(r.actualMinutes) + '</span> · ' + (r.completed ? '✓完成' : '未完成') + '</div>');
      var vb = svg.viewBox.baseVal;
      tooltip.style.left = ((cx / vb.width) * 100) + '%';
      tooltip.style.top = ((cy / vb.height) * 100) + '%';
      tooltip.classList.add('is-visible');
    }
    function hide(){
      crosshair.style.opacity = '0';
      tooltip.classList.remove('is-visible');
    }
    dots.forEach(function(dot, idx){
      dot.addEventListener('pointerenter', function(){ showFor(idx); });
      dot.addEventListener('focus', function(){ showFor(idx); });
      dot.addEventListener('pointerleave', hide);
      dot.addEventListener('blur', hide);
    });
    svg.addEventListener('pointermove', function(e){
      var rect = svg.getBoundingClientRect();
      if(!rect.width) return;
      var vb = svg.viewBox.baseVal;
      var svgX = ((e.clientX - rect.left) / rect.width) * vb.width;
      var nearest = 0, best = Infinity;
      dots.forEach(function(dot, idx){
        var dist = Math.abs(parseFloat(dot.getAttribute('cx')) - svgX);
        if(dist < best){ best = dist; nearest = idx; }
      });
      showFor(nearest);
    });
    svg.addEventListener('pointerleave', hide);
  }

  // ---- 数据档案：专注时段卡片（摄像头守望汇总，见 stopCamWatch）----
  // 只统计真的开过"摄像头守望"的番茄钟航段，按小时分四个时段桶，看哪个时段"专注度"
  // （画面安静的样本占比）平均更高。再强调一遍：这只是画面动静多少的粗糙代理指标，
  // 不是真的识别有没有分心/看手机，卡片文案里必须说清楚，跟摄像头守望小组件本身口径一致。
  // 每条记录优先用盯梢模式算出来的真实专注率；升级之前的老记录只有"画面动静"那个粗糙代理值，
  // 就退回去用它，并在文案里说清楚哪些是真判出来的，不含糊过去。
  function focusRateOf(s){
    return (typeof s.focusRate === 'number') ? s.focusRate : s.quietRatio;
  }
  var FOCUS_MIN_PER_HOUR = 2;  // 同一个钟点至少攒够2段，才敢说这个时段怎么样
  var FOCUS_HIGH_SLOTS = 3;    // 挑出最认真的三个时段
  // 精力好不好是两件事：坐得住（摄像头判的专注度）+ 活真干完了（有没有按时）。
  // 只看前一个会把"老老实实坐了两小时、啥也没干完"也排成高精力，那不叫高精力。
  // 按时的口径拿原始预估比：1.3 倍以内算准时（1.3 正好是应用里默认的缓冲倍数），
  // 1.3~3 倍算拖了，超过 3 倍或者压根没做完算失控。
  var ONTIME_OK = 1.3, ONTIME_LATE = 3;
  // 进高精力/中精力的绝对门槛（两维平均分）。有门槛才不会在数据少的时候把烂钟点捧成"最好的时段"
  var TIER_HIGH_MIN = 0.65, TIER_MID_MIN = 0.4;
  function onTimeScoreOf(r){
    var base = r.estMinutes || r.plannedMinutes; // 老记录没存 estMinutes，退回用 plannedMinutes
    if(!base || typeof r.actualMinutes !== 'number') return null;
    if(!r.completed) return 0; // 没做完就是没做完，花多久都不算准时
    var ratio = r.actualMinutes / base;
    if(ratio <= ONTIME_OK) return 1;
    if(ratio <= ONTIME_LATE) return 0.5;
    return 0;
  }
  // 这段从几点开始：新记录直接存了，老记录用"结束时间 − 实际用时"倒推
  function startHourOf(r){
    if(typeof r.startHour === 'number') return r.startHour;
    if(!r.loggedAt) return null;
    return new Date(r.loggedAt - (r.actualMinutes || 0) * 60000).getHours();
  }
  // 把"哪个钟点是高/中/低精力"单独抽出来——精力时段卡片要用，自动排程也要用，
  // 两边必须是同一套判断，不能一个地方一个算法。纯只读，不写任何数据。
  function computeEnergyTiers(acct){
    var sessions = (Array.isArray(acct.focusSessions) ? acct.focusSessions : [])
      .filter(function(s){ return typeof focusRateOf(s) === 'number'; });
    var logs = (acct.durationLog || []).filter(function(r){ return onTimeScoreOf(r) !== null && startHourOf(r) !== null; });
    if(!sessions.length && !logs.length){
      return { hasData: false, hours: [], ranked: [], thin: [], high: [], mid: [], low: [], dayCount: 0 };
    }
    // 按钟点汇总两个维度。专注度来自摄像头盯梢，按时率来自用时记录，两边都按"开始的钟点"归档。
    var byHour = {};
    function slot(h){ if(!byHour[h]) byHour[h] = { fSum: 0, fN: 0, oSum: 0, oN: 0 }; return byHour[h]; }
    var days = {};
    sessions.forEach(function(s){
      var k = slot(s.hour); k.fSum += focusRateOf(s); k.fN++;
      if(s.dateKey) days[s.dateKey] = 1;
    });
    logs.forEach(function(r){
      var k = slot(startHourOf(r)); k.oSum += onTimeScoreOf(r); k.oN++;
      if(r.dateKey) days[r.dateKey] = 1;
    });
    var hours = Object.keys(byHour).map(function(h){
      var d = byHour[h];
      var f = d.fN ? (d.fSum / d.fN) : null;
      var o = d.oN ? (d.oSum / d.oN) : null;
      var got = [f, o].filter(function(x){ return x !== null; });
      return {
        hour: parseInt(h, 10), focus: f, onTime: o,
        score: got.reduce(function(a, b){ return a + b; }, 0) / got.length,
        n: Math.max(d.fN, d.oN)
      };
    });
    // 只有样本够的钟点才参与排名；样本不够的单独归到"还看不准"
    var ranked = hours.filter(function(r){ return r.n >= FOCUS_MIN_PER_HOUR; })
                      .sort(function(a, b){ return b.score - a.score; });
    var thin = hours.filter(function(r){ return r.n < FOCUS_MIN_PER_HOUR; })
                    .sort(function(a, b){ return a.hour - b.hour; });
    // 分档不能只看排名——只有三个钟点有数据的时候，"前三名"会把按时率0%、活从来没干完的
    // 钟点也捧成高精力，那是误导。所以先过绝对门槛：够不上就算排第一也进不了高精力，
    // 高精力最多三个（这是你要的"一天最认真的三个时段"）。
    var eligible = ranked.filter(function(r){ return r.score >= TIER_HIGH_MIN; });
    var high = eligible.slice(0, FOCUS_HIGH_SLOTS);
    var rest = ranked.filter(function(r){ return high.indexOf(r) < 0; });
    var mid = rest.filter(function(r){ return r.score >= TIER_MID_MIN; });
    var low = rest.filter(function(r){ return r.score < TIER_MID_MIN; });
    return {
      hasData: true, hours: hours, ranked: ranked, thin: thin,
      high: high, mid: mid, low: low, dayCount: Object.keys(days).length
    };
  }
  // 某个钟点属于哪一档。没参与排名/没数据的钟点一律 'unknown'——不瞎猜。
  function energyTierOfHour(tiers, h){
    if(!tiers || !tiers.hasData) return 'unknown';
    function has(list){ for(var i = 0; i < list.length; i++){ if(list[i].hour === h) return true; } return false; }
    if(has(tiers.high)) return 'high';
    if(has(tiers.mid)) return 'mid';
    if(has(tiers.low)) return 'low';
    return 'unknown';
  }

  function buildFocusStatsHtml(acct){
    var tiers = computeEnergyTiers(acct);
    var out = '<div class="focus-stats-card"><h2 class="focus-stats-title">⚡ 精力时段</h2>';
    if(!tiers.hasData){
      return out +
        '<p class="focus-stats-empty">还没有数据。这里看两件事：番茄钟计时时开启摄像头盯梢，看你坐不坐得住；以及每次记用时，看你有没有按时把活干完。两个都好，才算高精力时段。</p>' +
        '<p class="focus-stats-caveat">数据全程只存在你自己浏览器本地。</p></div>';
    }
    var hours = tiers.hours, ranked = tiers.ranked, thin = tiers.thin;
    var high = tiers.high, mid = tiers.mid, low = tiers.low, dayCount = tiers.dayCount;

    function hourLabel(h){ return h + ':00–' + ((h + 1) % 24) + ':00'; }
    function rowsHtml(list){
      return list.map(function(r){
        var pct = Math.round(r.score * 100);
        // 两个维度分开报，不合成一个说不清来源的数——哪一头拖后腿要看得见
        var bits = [];
        if(r.focus !== null) bits.push('专注 ' + Math.round(r.focus * 100) + '%');
        if(r.onTime !== null) bits.push('按时 ' + Math.round(r.onTime * 100) + '%');
        return '<div class="focus-hour-row">' +
          '<span class="focus-hour-label">' + hourLabel(r.hour) + '</span>' +
          '<span class="focus-hour-track"><span class="focus-hour-bar" style="width:' + Math.max(4, pct) + '%"></span></span>' +
          '<span class="focus-hour-pct">' + bits.join(' · ') + '</span>' +
        '</div>';
      }).join('');
    }
    function group(cls, head, list){
      if(!list.length) return '';
      return '<div class="focus-tier-group ' + cls + '"><p class="focus-tier-head">' + head + '</p>' + rowsHtml(list) + '</div>';
    }

    var summary;
    if(high.length >= 1){
      var names = high.map(function(r){ return r.hour + '点'; }).join('、');
      summary = '你状态最好的时段是 <b>' + names + '</b>——难啃的、重要的活尽量排到这里。';
    } else if(ranked.length){
      // 有够样本的钟点，但一个都没过门槛——这种情况要说实话，不能把矮子里的将军包装成高精力
      summary = '目前还没有哪个时段够得上"高精力"：样本够的钟点里分数最高的也只有 ' +
        Math.round(ranked[0].score * 100) + '%。先把专注和按时这两头往上提提。';
    } else {
      summary = '还挑不出高精力时段：同一个钟点至少要攒够 ' + FOCUS_MIN_PER_HOUR + ' 段记录才算数，现在最多的钟点只有 ' +
        Math.max.apply(null, hours.map(function(r){ return r.n; })) + ' 段。';
    }
    // 一周是你定的观察周期——没到之前如实说这个排名还会变，别让人拿着三天的数据当规律用
    var dayNote = dayCount >= 7
      ? ('已经攒了 ' + dayCount + ' 天的数据，够看规律了。')
      : ('才攒了 ' + dayCount + ' 天的数据，离一周还差 ' + (7 - dayCount) + ' 天——现在这个排名随时会变，先别当真。');

    return out +
      '<p class="focus-stats-summary">' + dayNote + summary + '</p>' +
      group('tier-high', '🟢 高精力 · 放主要任务', high) +
      group('tier-mid', '🟡 中精力 · 放中等任务', mid) +
      group('tier-low', '⚪ 低精力 · 放次要任务/杂事', low) +
      (thin.length ? '<p class="focus-stats-caveat">这几个钟点记录还太少、暂时不下结论：' +
        thin.map(function(r){ return r.hour + '点(' + r.n + '段)'; }).join('、') + '</p>' : '') +
      '<p class="focus-stats-caveat">排名看两件事：<b>专注</b>是摄像头判你真正在状态的时间占比（靠画面里你的位置和姿势相对自己基准的变化，不是真人脸识别，会有误差）；<b>按时</b>是实际用时跟预估比——' +
      ONTIME_OK + ' 倍以内算准时，' + ONTIME_OK + '–' + ONTIME_LATE + ' 倍算拖了，超过 ' + ONTIME_LATE + ' 倍或者没做完算失控。数据全程只存在你自己浏览器本地。</p>' +
    '</div>';
  }

  function renderStatsView(){
    var body = document.getElementById('statsBody');
    if(!body) return;
    var acct = getAcctData();
    var log = acct.durationLog || [];
    // 专注时段卡片跟下面的黑匣子记录带是两套独立数据(focusSessions vs durationLog)，
    // 提前算好、两条分支(空/非空)都要用到，保证不管黑匣子那边有没有数据，这张卡片都会显示。
    var focusSectionHtml = buildFocusStatsHtml(acct);
    var html = '<div class="stats-wrap">' +
      '<h1 style="font-size:1.3rem;margin-bottom:6px;">📊 数据档案</h1>' +
      '<p class="stats-intro">番茄钟每次"停止"之后，这次真实用了多久都会记在这里，按类别汇总。同一类别攒够 3 条真实记录后，新建这一类的任务时就会用这些数据给你预估用时——都是你自己计时出来的真实数据，不是编的。</p>';
    if(!log.length){
      html += '<p class="stats-empty">还没有用番茄钟记录过用时——去"每日清单"或"番茄钟"里点一个任务的"开始"，结束后就会有第一条记录。</p>';
      html += focusSectionHtml;
      body.innerHTML = DOMPurify.sanitize(html);
      return;
    }

    var byCat = {};
    log.forEach(function(r){ (byCat[r.category] = byCat[r.category] || []).push(r); });
    var catList = Object.keys(byCat).map(function(cat){
      return { cat: cat, records: byCat[cat].slice().sort(function(a, b){ return a.seq - b.seq; }) };
    }).sort(function(a, b){ return b.records.length - a.records.length; });

    if(!statsSelectedCat || !byCat[statsSelectedCat]) statsSelectedCat = catList[0].cat;
    var active = catList.filter(function(c){ return c.cat === statsSelectedCat; })[0] || catList[0];
    var allRecords = active.records;
    var stats = categoryDurationStats(acct, active.cat);

    var startKey = statsRangeStartKey(statsSelectedRange);
    var rangeRecords = allRecords.filter(function(r){ return r.dateKey >= startKey; });
    var rangeLabel = (STATS_RANGES.filter(function(r){ return r.key === statsSelectedRange; })[0] || STATS_RANGES[1]).label;

    // ---- 黑匣子外壳：机头铭牌 + 类别选择 + 时间范围切换 ----
    var bezelHtml = '<div class="lc-blackbox-bezel">' +
      '<span class="lc-blackbox-label"><span class="lc-blackbox-rec-dot" aria-hidden="true"></span>⬛ <b>航行黑匣子</b> · 记录打印带</span>' +
      '<span class="stats-summary-pill">共 ' + catList.length + ' 个类别 · ' + log.length + ' 条记录</span>' +
    '</div>';
    var selectHtml = '<select class="stats-cat-select" id="statsCatSelect" aria-label="选择要看的类别" style="width:100%;margin-bottom:10px;">' +
      catList.map(function(c){
        return '<option value="' + escapeHtml(c.cat) + '"' + (c.cat === active.cat ? ' selected' : '') + '>' + escapeHtml(c.cat) + '（' + c.records.length + '条）</option>';
      }).join('') +
    '</select>';
    var rangeHtml = '<div class="lc-tape-range" role="tablist" aria-label="切换记录带时间范围">' +
      STATS_RANGES.map(function(r){
        return '<button type="button" class="lc-tape-range-btn' + (r.key === statsSelectedRange ? ' is-active' : '') + '" data-range="' + r.key + '" role="tab" aria-selected="' + (r.key === statsSelectedRange) + '">' + r.label + '</button>';
      }).join('') +
    '</div>';

    // ---- 记录纸：回执（永远看最新一次真实记录）+ 曲线（看当前选的时间范围）+ 折叠的完整记录表 ----
    var chartSectionHtml = rangeRecords.length
      ? ('<p class="duration-chart-note">' + allRecords.length + ' 条历史记录' + (allRecords.length >= 3 ? ' · 已经够 3 条，新建这一类任务时会给预估' : ' · 还差 ' + (3 - allRecords.length) + ' 条才会给预估') + '</p>' +
         buildDurationChartHtml(rangeRecords))
      : ('<p class="duration-chart-empty">过去' + rangeLabel + '「' + escapeHtml(active.cat) + '」还没有新的计时记录，试试切换到别的时间范围。</p>');
    var chartCardHtml = '<div class="duration-chart-card">' +
      '<div class="duration-chart-head"><span class="duration-chart-title">' + escapeHtml(active.cat) + ' · 第几次 → 用时</span>' +
      '<span class="duration-chart-avg">' + rangeLabel + '内 ' + rangeRecords.length + ' 条</span></div>' +
      chartSectionHtml +
    '</div>';
    // 每一行末尾都有个"改"——平时透明看不见，鼠标划过那一行才淡入（见 CSS .stats-log-edit-btn），
    // 触屏设备直接常驻显示。改的入口是 openDurationEditModal，只动这一条的 actualMinutes，
    // 其它字段原样不动；改过的记录会在"实际"这一列多一个 ✎ 小标，如实说明这条数被手动修正过。
    var logDetailsHtml = '<details class="lc-tape-log-details">' +
      '<summary class="lc-tape-log-summary">查看完整记录（' + allRecords.length + ' 条）</summary>' +
      '<table class="stats-log-table"><thead><tr><th>日期</th><th>任务</th><th>第几次</th><th>计划</th><th>实际</th><th>完成</th><th></th></tr></thead><tbody>' +
      allRecords.slice().sort(function(a, b){ return b.seq - a.seq; }).map(function(r){
        var d = parseDateKey(r.dateKey);
        var shortDate = (d.getMonth() + 1) + '/' + d.getDate();
        return '<tr><td>' + shortDate + '</td><td>' + escapeHtml(r.taskName) + '</td><td>第' + r.seq + '次</td>' +
          '<td>' + fmtDuration(r.plannedMinutes) + '</td>' +
          '<td>' + fmtDuration(r.actualMinutes) + (r.edited ? ' <span class="stats-log-edited-tag" title="这条实际用时被手动修正过">✎</span>' : '') + '</td>' +
          '<td>' + (r.completed ? '✓' : '—') + '</td>' +
          '<td><button type="button" class="stats-log-edit-btn" data-edit-record="' + r.id + '">改</button></td></tr>';
      }).join('') + '</tbody></table>' +
    '</details>';
    var sheetHtml = '<div class="lc-tape-sheet lc-tape-feed">' + buildTapeReceiptHtml(allRecords, stats) + chartCardHtml + logDetailsHtml + '</div>';

    html += '<div class="lc-blackbox">' + bezelHtml + selectHtml + rangeHtml + sheetHtml + '</div>';
    html += focusSectionHtml;
    html += '</div>';
    body.innerHTML = DOMPurify.sanitize(html);

    var sel = document.getElementById('statsCatSelect');
    if(sel) sel.addEventListener('change', function(){ statsSelectedCat = sel.value; renderStatsView(); });
    body.querySelectorAll('.lc-tape-range-btn').forEach(function(btn){
      btn.addEventListener('click', function(){ statsSelectedRange = btn.getAttribute('data-range'); renderStatsView(); });
    });
    body.querySelectorAll('[data-edit-record]').forEach(function(btn){
      btn.addEventListener('click', function(){ openDurationEditModal(btn.getAttribute('data-edit-record')); });
    });
    if(rangeRecords.length){
      bindDurationChartInteractions(rangeRecords);
      animateDurationTapeDraw();
      var chartWrap = document.getElementById('durationChartWrap');
      if(chartWrap){
        requestAnimationFrame(function(){
          if(chartWrap.scrollWidth > chartWrap.clientWidth + 4){
            var hint = document.createElement('div');
            hint.className = 'lc-tape-scroll-hint';
            hint.textContent = '← 左右滑动看更多';
            chartWrap.parentNode.appendChild(hint);
          }
        });
      }
    }
  }

  // ---- 数据档案：手动修正某一条记录的实际用时 ----
  // 场景：番茄钟忘了停/中途被打断，导致某一条历史记录的用时明显不对——这次停止计时那一步已经加了
  // "对不对"的确认（见 renderPomodoroView 里 pomodoroConfirmingDuration 那段），但已经记进去的
  // 旧记录还是需要一个事后能改的入口，所以"完整记录"表格每一行都有个"改"。只动这一条的
  // actualMinutes，taskId/category/seq/dateKey 这些原样不动；改过之后打一个 edited 标记（表格里
  // 显示成 ✎），跟全站"不编数据"的态度一致——改的是记录里这一个数，不是假装它从来没错过。
  var durationEditOverlay = document.getElementById('durationEditOverlay');
  var durationEditInput = document.getElementById('durationEditInput');
  var durationEditMeta = document.getElementById('durationEditMeta');
  var durationEditAvgHint = document.getElementById('durationEditAvgHint');
  var durationEditSubmit = document.getElementById('durationEditSubmit');
  var durationEditClose = document.getElementById('durationEditClose');
  var currentDurationEditId = null;
  function openDurationEditModal(recordId){
    if(!durationEditOverlay || !recordId) return;
    var acct = getAcctData();
    var r = (acct.durationLog || []).find(function(x){ return x.id === recordId; });
    if(!r) return;
    currentDurationEditId = recordId;
    var d = parseDateKey(r.dateKey);
    durationEditMeta.textContent = (d.getMonth() + 1) + '/' + d.getDate() + ' · ' + r.taskName + ' · 第' + r.seq + '次' + (r.edited ? '（之前已经手动修正过一次）' : '');
    durationEditInput.value = r.actualMinutes;
    var stats = categoryDurationStats(acct, r.category);
    durationEditAvgHint.textContent = stats ? ('「' + r.category + '」历史平均 ' + fmtDuration(stats.avgMinutes) + '，仅供参考——改成你记得的真实用时就行') : '';
    durationEditOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
    durationEditInput.focus();
    durationEditInput.select();
  }
  function closeDurationEditModal(){
    if(!durationEditOverlay) return;
    durationEditOverlay.hidden = true;
    document.body.style.overflow = '';
    currentDurationEditId = null;
  }
  function submitDurationEdit(){
    if(!currentDurationEditId) return;
    var v = parseInt(durationEditInput.value, 10);
    if(isNaN(v) || v < 0){ durationEditInput.focus(); return; }
    var acct = getAcctData();
    var r = (acct.durationLog || []).find(function(x){ return x.id === currentDurationEditId; });
    if(!r){ closeDurationEditModal(); return; }
    r.actualMinutes = v;
    r.edited = true;
    r.editedAt = Date.now();
    // 对应的任务如果还在（没被删/还查得到），同步一下它自己记的 actualMinutes，两处保持一致；
    // 任务已经不在了（比如很久以前的历史任务）就跳过，不报错、也不影响这条数据档案记录本身。
    var relatedTask = acct.tasks.find(function(x){ return x.id === r.taskId; });
    if(relatedTask) relatedTask.actualMinutes = v;
    saveAcctData(acct);
    closeDurationEditModal();
    renderStatsView();
  }
  if(durationEditClose) durationEditClose.addEventListener('click', closeDurationEditModal);
  if(durationEditOverlay) durationEditOverlay.addEventListener('click', function(e){ if(e.target === durationEditOverlay) closeDurationEditModal(); });
  if(durationEditSubmit) durationEditSubmit.addEventListener('click', submitDurationEdit);
  durationEditInput && durationEditInput.addEventListener('keydown', function(e){ if(e.key === 'Enter') submitDurationEdit(); });
  document.addEventListener('keydown', function(e){
    if(e.key !== 'Escape') return;
    if(durationEditOverlay && !durationEditOverlay.hidden) closeDurationEditModal();
  });

  // ===== 习惯 =====
  // 分类是空框架（预置几个，可以改名/新增/删除），具体习惯内容都是用户自己加的，不预置。
  // 打卡：向右滑动（触摸/鼠标拖拽都走 pointer events）或者点旁边的"✓ 打卡"按钮，两种都行。
  // 积分：每次打卡基础 +1 金币，连续天数达到里程碑（3/7/21天，之后每再满21天）额外加分——
  // 跟番茄钟预估的"3次"门槛用一样的数字体系，图个好记。撤销只能撤"今天"这一条，把当时发的分原样扣回去，
  // 不会出现"删了昨天的记录但金币没退"或者反复点来刷分的问题。
  var habitsActiveCatId = null;
  var editingHabitCatId = null;
  var editingHabitId = null;
  var HABIT_STREAK_MILESTONES = { 3: 3, 7: 5, 21: 10 };

  function habitCategoryEmoji(name){
    var map = { '学习成长':'📚', '健康作息':'💪', '工作效率':'⚡', '生活习惯':'🏠' };
    return map[name] || '✅';
  }
  function habitCheckinsFor(acct, habitId){
    return (acct.habitCheckins || []).filter(function(c){ return c.habitId === habitId; });
  }
  function habitCheckedInOn(acct, habitId, dateKey){
    return habitCheckinsFor(acct, habitId).filter(function(c){ return c.dateKey === dateKey; })[0] || null;
  }
  // 连续天数：如果今天已经打过卡，从今天往前数；还没打，从"昨天"往前数（今天算不算连续，取决于今天打不打）。
  function habitStreakInfo(acct, habitId){
    var checkins = habitCheckinsFor(acct, habitId);
    var byDate = {};
    checkins.forEach(function(c){ byDate[c.dateKey] = true; });
    var today = todayKey();
    var checkedInToday = !!byDate[today];
    var cursor = checkedInToday ? today : addDaysKey(today, -1);
    var streak = 0;
    while(byDate[cursor]){ streak++; cursor = addDaysKey(cursor, -1); }
    return { streak: streak, total: checkins.length, checkedInToday: checkedInToday };
  }
  function habitStreakBonus(streak){
    if(HABIT_STREAK_MILESTONES[streak] !== undefined) return HABIT_STREAK_MILESTONES[streak];
    if(streak > 21 && (streak - 21) % 21 === 0) return 10;
    return 0;
  }
  function showHabitToast(msg){
    var el = document.createElement('div');
    el.className = 'habit-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(function(){ el.classList.add('is-visible'); });
    setTimeout(function(){
      el.classList.remove('is-visible');
      setTimeout(function(){ el.remove(); }, 260);
    }, 1800);
  }
  // 打卡：today 已经打过的话直接不做事（UI 正常情况下会先隐藏掉打卡入口，这里是双保险）。
  function checkInHabit(habitId){
    var acct = getAcctData();
    var today = todayKey();
    if(habitCheckedInOn(acct, habitId, today)) return null;
    var before = habitStreakInfo(acct, habitId);
    var newStreak = before.streak + 1;
    var bonus = habitStreakBonus(newStreak);
    var points = 1 + bonus;
    acct.habitCheckins.push({ id: uid(), habitId: habitId, dateKey: today, points: points, loggedAt: Date.now() });
    acct.coins = (acct.coins || 0) + points;
    acct.lifetimeCoins = (acct.lifetimeCoins || 0) + points;
    var newlyBadges = checkAndRecordBadgeUnlocks(acct);
    saveAcctData(acct);
    return { points: points, bonus: bonus, streak: newStreak, newlyBadges: newlyBadges };
  }
  // 撤销：只能撤"今天"这条——不给昨天及更早的记录留撤销入口，把当时发的分原样扣回去。
  function undoHabitCheckin(habitId){
    var acct = getAcctData();
    var rec = habitCheckedInOn(acct, habitId, todayKey());
    if(!rec) return;
    acct.coins = Math.max(0, (acct.coins || 0) - rec.points);
    acct.habitCheckins = acct.habitCheckins.filter(function(c){ return c.id !== rec.id; });
    saveAcctData(acct);
  }
  function deleteHabit(habitId){
    if(!window.confirm('确定删除这个习惯吗？打卡记录也会一起删除，无法恢复。')) return;
    var acct = getAcctData();
    acct.habits = acct.habits.filter(function(h){ return h.id !== habitId; });
    acct.habitCheckins = acct.habitCheckins.filter(function(c){ return c.habitId !== habitId; });
    saveAcctData(acct);
    renderHabitsView();
  }
  function deleteHabitCategory(catId){
    var acct = getAcctData();
    var cat = acct.habitCategories.filter(function(c){ return c.id === catId; })[0];
    if(!cat) return;
    var habitIds = acct.habits.filter(function(h){ return h.categoryId === catId; }).map(function(h){ return h.id; });
    var msg = habitIds.length
      ? ('删除「' + cat.name + '」分类会连同里面 ' + habitIds.length + ' 个习惯和打卡记录一起删除，确定吗？')
      : ('确定删除「' + cat.name + '」这个分类吗？');
    if(!window.confirm(msg)) return;
    acct.habitCategories = acct.habitCategories.filter(function(c){ return c.id !== catId; });
    acct.habits = acct.habits.filter(function(h){ return h.categoryId !== catId; });
    acct.habitCheckins = acct.habitCheckins.filter(function(c){ return habitIds.indexOf(c.habitId) === -1; });
    saveAcctData(acct);
    habitsActiveCatId = null;
    renderHabitsView();
  }

  function habitCardHtml(acct, h){
    var info = habitStreakInfo(acct, h.id);
    var modeTag = h.mode ? ('<span class="habit-mode-tag">' + escapeHtml(h.mode) + '</span>') : '';
    var streakText = info.streak > 0 ? ('🔥 连续 ' + info.streak + ' 天') : '还没开始连续打卡';
    // 免打卡卡入口：今天还没打卡、但昨天之前连续的天数还在（一旦今天彻底过完就会断），
    // 且账号确实有库存——三个条件都满足才露出来，不是随时都能点。
    var freezeBtn = (!info.checkedInToday && info.streak > 0 && (acct.freezeCards || 0) > 0)
      ? ('<button class="habit-freeze-btn" type="button" data-freeze-id="' + h.id + '" title="用一张免打卡卡保住连续' + info.streak + '天，今天不打卡也不会清零">🧊 用卡保连续</button>')
      : '';
    return '<li class="habit-card' + (info.checkedInToday ? ' is-done' : '') + '" data-habit-id="' + h.id + '">' +
      '<div class="habit-card-swipe-fill" aria-hidden="true">✓ 打卡</div>' +
      '<div class="habit-card-body">' +
        '<div>' +
          '<div class="habit-card-head"><span class="habit-card-name">' + escapeHtml(h.name) + '</span>' + modeTag + '</div>' +
          '<p class="habit-card-meta">' + streakText + ' · 共打卡 ' + info.total + ' 次</p>' +
        '</div>' +
        '<div class="habit-card-actions">' +
          (info.checkedInToday
            ? '<button class="habit-undo-btn" type="button" data-undo-id="' + h.id + '">✓ 今天已打卡·撤销</button>'
            : '<button class="habit-checkin-btn" type="button" data-checkin-id="' + h.id + '">✓ 打卡</button>') +
          freezeBtn +
          '<button class="app-task-menu-btn" type="button" aria-label="更多">⋮</button>' +
          '<div class="app-task-menu" hidden>' +
            '<button type="button" data-act="edit">编辑</button>' +
            '<button type="button" class="danger" data-act="delete">删除</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</li>';
  }

  function afterHabitAction(res){
    updateCoinDisplay();
    renderHabitsView();
    if(res && res.bonus) showHabitToast('🔥 连续 ' + res.streak + ' 天！额外 +' + res.bonus + ' 金币');
    if(res && res.newlyBadges) toastNewBadges(res.newlyBadges);
  }

  function bindHabitCardInteractions(root){
    root.querySelectorAll('.habit-checkin-btn').forEach(function(btn){
      btn.addEventListener('click', function(){ afterHabitAction(checkInHabit(btn.getAttribute('data-checkin-id'))); });
    });
    root.querySelectorAll('.habit-undo-btn').forEach(function(btn){
      btn.addEventListener('click', function(){ undoHabitCheckin(btn.getAttribute('data-undo-id')); afterHabitAction(null); });
    });
    root.querySelectorAll('.habit-freeze-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var res = useStreakFreeze(btn.getAttribute('data-freeze-id'));
        afterHabitAction(res);
      });
    });
    root.querySelectorAll('.habit-card .app-task-menu-btn').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var menu = btn.nextElementSibling;
        document.querySelectorAll('.app-task-menu').forEach(function(m){ if(m !== menu) m.hidden = true; });
        menu.hidden = !menu.hidden;
      });
    });
    root.querySelectorAll('.habit-card .app-task-menu button').forEach(function(btn){
      btn.addEventListener('click', function(){
        var card = btn.closest('.habit-card');
        var habitId = card.getAttribute('data-habit-id');
        btn.closest('.app-task-menu').hidden = true;
        var act = btn.getAttribute('data-act');
        if(act === 'edit') openHabitModal(habitId);
        else if(act === 'delete') deleteHabit(habitId);
      });
    });

    // 向右滑动打卡：pointer events 同时兼容触摸拖动和鼠标拖动；已经打过卡的今天不用再滑，撤销走按钮。
    root.querySelectorAll('.habit-card:not(.is-done)').forEach(function(card){
      var habitId = card.getAttribute('data-habit-id');
      var body = card.querySelector('.habit-card-body');
      var startX = null, startY = null, dragging = false, axis = null;
      card.addEventListener('pointerdown', function(e){
        if(e.target.closest('button')) return;
        startX = e.clientX; startY = e.clientY; dragging = true; axis = null;
        if(card.setPointerCapture){ try{ card.setPointerCapture(e.pointerId); }catch(err){} }
      });
      card.addEventListener('pointermove', function(e){
        if(!dragging || startX === null) return;
        var dx = e.clientX - startX, dy = e.clientY - startY;
        if(!axis){
          if(Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
          axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        }
        if(axis !== 'x') return;
        var clamped = Math.max(0, Math.min(dx, 110));
        body.style.transform = 'translateX(' + clamped + 'px)';
        card.classList.toggle('is-swiping', clamped > 12);
      });
      function endDrag(e){
        if(!dragging) return;
        dragging = false;
        var dx = (axis === 'x' && typeof e.clientX === 'number') ? Math.max(0, Math.min(e.clientX - startX, 110)) : 0;
        body.style.transform = '';
        card.classList.remove('is-swiping');
        startX = null; startY = null;
        var wasX = axis === 'x'; axis = null;
        if(wasX && dx > 70) afterHabitAction(checkInHabit(habitId));
      }
      card.addEventListener('pointerup', endDrag);
      card.addEventListener('pointercancel', endDrag);
    });
  }

  function habitWeekHtml(acct, habits){
    var ids = habits.map(function(h){ return h.id; });
    var days = [];
    for(var i = 6; i >= 0; i--){
      var day = new Date();
      day.setDate(day.getDate() - i);
      var key = day.getFullYear() + '-' + String(day.getMonth()+1).padStart(2,'0') + '-' + String(day.getDate()).padStart(2,'0');
      var count = (acct.habitCheckins || []).filter(function(c){ return c.dateKey === key && ids.indexOf(c.habitId) !== -1; }).length;
      days.push('<div class="pp-week-day' + (count ? ' is-grown' : '') + (i === 0 ? ' is-today' : '') + '"><span>' + (i === 0 ? '今天' : ['日','一','二','三','四','五','六'][day.getDay()]) + '</span><b>' + (count || '·') + '</b><small>' + (day.getMonth()+1) + '/' + day.getDate() + '</small></div>');
    }
    return '<div class="pp-week-strip" aria-label="最近七天打卡次数">' + days.join('') + '</div>';
  }
  function renderHabitsLanding(body, acct){
    var allHabits = acct.habits || [];
    var totalDone = allHabits.filter(function(h){ return habitStreakInfo(acct, h.id).checkedInToday; }).length;
    var html = '<div class="habits-wrap">' +
      '<div class="pp-page-intro pp-habits-intro"><div class="pp-intro-copy"><p class="pp-kicker">THE LITTLE GARDEN / 习惯养成</p><h1>让好习惯，<br>慢慢长出来。</h1><p class="pp-lead">不用一下子成为更好的人。<br>今天，先照顾好一件小事。</p></div>' +
      '<aside class="pp-garden-panel"><div class="pp-garden-scene" aria-hidden="true"><span class="pp-garden-sun"></span><span class="pp-plant pp-plant-one"><i></i><i></i><i></i><i></i></span><span class="pp-plant pp-plant-two"><i></i><i></i><i></i><i></i></span><span class="pp-plant pp-plant-three"><i></i><i></i><i></i><i></i></span><span class="pp-garden-soil"></span></div>' +
      '<div class="pp-garden-progress"><span>今天的生长</span><strong>' + totalDone + '<small> / ' + allHabits.length + '</small></strong><p>' + (allHabits.length ? (totalDone === allHabits.length ? '今天的小花园，已照顾好。' : '每次打卡，都是一点点积累。') : '种下第一个习惯，就从今天开始。') + '</p></div></aside></div>' +
      '<section class="pp-week-card"><div><p class="pp-kicker">EVERY LITTLE STEP</p><h2>过去七天，你来过的痕迹</h2><p>每个数字，是那天真实留下的打卡。</p></div>' + habitWeekHtml(acct, allHabits) + '</section>' +
      '<div class="pp-section-heading"><h2>选一块喜欢的小花园</h2><span>进入分类，添加或完成一个习惯</span></div>' +
      '<div class="tile-grid pp-habit-grid">' +
      acct.habitCategories.map(function(cat, index){
        var habits = acct.habits.filter(function(h){ return h.categoryId === cat.id; });
        var todayDone = habits.filter(function(h){ return habitStreakInfo(acct, h.id).checkedInToday; }).length;
        var subtitles = ['每天多懂一点，世界就开阔一点。','给身体和心情，留一点照顾。','小步向前，也是一种进步。','把日子，过成自己喜欢的样子。'];
        var desc = habits.length ? ('今天已完成 ' + todayDone + ' / ' + habits.length) : '从一个小习惯开始';
        return '<button class="tile-card pp-habit-category" type="button" data-cat-id="' + cat.id + '">' +
          '<span class="pp-habit-card-top"><span>GARDEN ' + String(index+1).padStart(2,'0') + '</span><span class="pp-category-arrow" aria-hidden="true">↗</span></span>' +
          '<span class="tile-icon" aria-hidden="true">' + habitCategoryEmoji(cat.name) + '</span>' +
          '<span class="tile-title">' + escapeHtml(cat.name) + '</span>' +
          '<span class="pp-category-description">' + (index < 4 ? subtitles[index] : '你定义的方向，值得慢慢坚持。') + '</span>' +
          '<span class="pp-category-progress"><span class="tile-desc">' + escapeHtml(desc) + '</span><span class="pp-category-track"><i style="width:' + (habits.length ? Math.round(todayDone / habits.length * 100) : 0) + '%"></i></span></span>' +
          '</button>';
      }).join('') +
      '</div>' +
      '<button class="pp-add-garden" type="button" id="habitAddCatBtn"><span aria-hidden="true">＋</span><span>开辟一块新花园<small>添加你自己的习惯分类</small></span><span aria-hidden="true">↗</span></button>' +
    '</div>';
    body.innerHTML = DOMPurify.sanitize(html);
    body.querySelectorAll('.tile-card[data-cat-id]').forEach(function(btn){
      btn.addEventListener('click', function(){ habitsActiveCatId = btn.getAttribute('data-cat-id'); renderHabitsView(); });
    });
    var addCatBtn = document.getElementById('habitAddCatBtn');
    if(addCatBtn) addCatBtn.addEventListener('click', function(){ openHabitCategoryModal(null); });
  }

  function renderHabitsCategoryDetail(body, acct, catId){
    var cat = acct.habitCategories.filter(function(c){ return c.id === catId; })[0];
    var habits = acct.habits.filter(function(h){ return h.categoryId === catId; });
    var html = '<div class="habits-wrap">' +
      '<div class="habits-detail-head">' +
        '<button class="habits-back-btn" type="button" id="habitsBackBtn">‹ 全部类别</button>' +
        '<button class="app-task-menu-btn" type="button" id="habitCatMenuBtn" aria-label="类别设置">⋮</button>' +
        '<div class="app-task-menu" id="habitCatMenu" hidden style="top:30px;">' +
          '<button type="button" data-act="rename-cat">重命名</button>' +
          '<button type="button" class="danger" data-act="delete-cat">删除分类</button>' +
        '</div>' +
      '</div>' +
      '<div class="pp-habit-detail-title"><p class="pp-kicker">MY LITTLE GARDEN / 我的习惯</p><h1>' + habitCategoryEmoji(cat.name) + ' ' + escapeHtml(cat.name) + '</h1><p>完成一点，积累一点。按自己的节奏来。</p></div>' + habitWeekHtml(acct, habits);
    if(!habits.length){
      html += '<p class="stats-empty">这个类别还没有习惯——点下面"添加习惯"加一个吧</p>';
    } else {
      html += '<ul class="habit-list">' + habits.map(function(h){ return habitCardHtml(acct, h); }).join('') + '</ul>';
    }
    html += '<button class="btn btn-ghost" id="habitAddBtn" type="button" style="width:100%;margin-top:14px;">+ 添加习惯</button>';
    html += '</div>';
    body.innerHTML = DOMPurify.sanitize(html);

    var backBtn = document.getElementById('habitsBackBtn');
    if(backBtn) backBtn.addEventListener('click', function(){ habitsActiveCatId = null; renderHabitsView(); });
    var menuBtn = document.getElementById('habitCatMenuBtn');
    var menu = document.getElementById('habitCatMenu');
    if(menuBtn) menuBtn.addEventListener('click', function(e){
      e.stopPropagation();
      document.querySelectorAll('.app-task-menu').forEach(function(m){ if(m !== menu) m.hidden = true; });
      menu.hidden = !menu.hidden;
    });
    if(menu) menu.querySelectorAll('button').forEach(function(btn){
      btn.addEventListener('click', function(){
        menu.hidden = true;
        var act = btn.getAttribute('data-act');
        if(act === 'rename-cat') openHabitCategoryModal(cat.id);
        else if(act === 'delete-cat') deleteHabitCategory(cat.id);
      });
    });
    var addBtn = document.getElementById('habitAddBtn');
    if(addBtn) addBtn.addEventListener('click', function(){ openHabitModal(null, cat.id); });
    bindHabitCardInteractions(body);
  }

  function renderHabitsView(){
    var body = document.getElementById('habitsBody');
    if(!body) return;
    var acct = getAcctData();
    if(habitsActiveCatId && acct.habitCategories.some(function(c){ return c.id === habitsActiveCatId; })){
      renderHabitsCategoryDetail(body, acct, habitsActiveCatId);
    } else {
      habitsActiveCatId = null;
      renderHabitsLanding(body, acct);
    }
  }

  // ---- 添加/重命名分类 弹窗 ----
  var habitCatModalOverlay = document.getElementById('habitCatModalOverlay');
  var habitCatNameInput = document.getElementById('habitCatNameInput');
  var habitCatFormHint = document.getElementById('habitCatFormHint');
  function openHabitCategoryModal(editId){
    editingHabitCatId = editId || null;
    var acct = getAcctData();
    var editing = editId ? acct.habitCategories.filter(function(c){ return c.id === editId; })[0] : null;
    document.getElementById('habitCatModalTitle').textContent = editing ? '重命名分类' : '添加分类';
    habitCatNameInput.value = editing ? editing.name : '';
    habitCatFormHint.textContent = '';
    habitCatModalOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
    habitCatNameInput.focus();
  }
  function closeHabitCategoryModal(){
    habitCatModalOverlay.hidden = true;
    document.body.style.overflow = '';
    editingHabitCatId = null;
  }
  var habitCatModalClose = document.getElementById('habitCatModalClose');
  if(habitCatModalClose) habitCatModalClose.addEventListener('click', closeHabitCategoryModal);
  if(habitCatModalOverlay) habitCatModalOverlay.addEventListener('click', function(e){ if(e.target === habitCatModalOverlay) closeHabitCategoryModal(); });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && habitCatModalOverlay && !habitCatModalOverlay.hidden) closeHabitCategoryModal();
  });
  var habitCatSaveBtn = document.getElementById('habitCatSaveBtn');
  function saveHabitCategory(){
    var name = habitCatNameInput.value.trim();
    if(!name){ habitCatFormHint.textContent = '请填写分类名称'; habitCatNameInput.focus(); return; }
    var acct = getAcctData();
    if(editingHabitCatId){
      var cat = acct.habitCategories.filter(function(c){ return c.id === editingHabitCatId; })[0];
      if(cat) cat.name = name;
    } else {
      acct.habitCategories.push({ id: uid(), name: name });
    }
    saveAcctData(acct);
    closeHabitCategoryModal();
    renderHabitsView();
  }
  if(habitCatSaveBtn) habitCatSaveBtn.addEventListener('click', saveHabitCategory);
  if(habitCatNameInput) habitCatNameInput.addEventListener('keydown', function(e){ if(e.key === 'Enter') saveHabitCategory(); });

  // ---- 管理类别 弹窗：加/改名/删除当前账号的任务类别（跟上面"添加/重命名分类"是习惯模块自己
  // 的类别，两套类别体系互相独立，互不影响）。类别在数据里就是普通的名字字符串，不是单独的
  // id，所以改名需要联动把这个类别下所有任务、数据档案记录里存的名字也一起换掉，不然历史数据
  // 会跟"新类别"对不上号、变成孤儿；删除则刻意不联动——只从"以后能选"的列表里拿掉，已经产生
  // 的任务和数据档案记录原样保留，不会因为整理一下类别就把攒了很久的真实数据搭进去。 ----
  var catMgrOverlay = document.getElementById('catMgrOverlay');
  var catMgrList = document.getElementById('catMgrList');
  var catMgrNewInput = document.getElementById('catMgrNewInput');
  var catMgrHint = document.getElementById('catMgrHint');
  function openCategoryManageModal(){
    if(!catMgrOverlay) return;
    if(catMgrHint) catMgrHint.textContent = '';
    if(catMgrNewInput) catMgrNewInput.value = '';
    renderCategoryManageList();
    catMgrOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeCategoryManageModal(){
    if(!catMgrOverlay) return;
    catMgrOverlay.hidden = true;
    document.body.style.overflow = '';
  }
  function normalizeCatName(raw){ return (raw || '').trim().slice(0, 10); }
  function categoryNameTaken(acct, name, exceptName){
    return acct.categories.some(function(c){ return c.name === name && c.name !== exceptName; });
  }
  function renderCategoryManageList(){
    if(!catMgrList) return;
    var acct = getAcctData();
    catMgrList.innerHTML = DOMPurify.sanitize(acct.categories.map(function(c){
      var count = acct.tasks.filter(function(t){ return t.category === c.name; }).length;
      return '<li class="catmgr-row" data-cat="' + escapeHtml(c.name) + '">' +
        '<span class="catmgr-dot" style="background:' + c.color + '" aria-hidden="true"></span>' +
        '<span class="catmgr-name">' + escapeHtml(c.name) + '</span>' +
        '<span class="catmgr-count">' + count + '个任务</span>' +
        '<button class="catmgr-icon-btn" type="button" data-act="rename" aria-label="重命名' + escapeHtml(c.name) + '">✎</button>' +
        '<button class="catmgr-icon-btn" type="button" data-act="delete" aria-label="删除' + escapeHtml(c.name) + '">🗑</button>' +
      '</li>';
    }).join(''));
    catMgrList.querySelectorAll('.catmgr-row').forEach(function(row){
      var name = row.getAttribute('data-cat');
      row.querySelectorAll('.catmgr-icon-btn').forEach(function(btn){
        btn.addEventListener('click', function(){
          var act = btn.getAttribute('data-act');
          if(act === 'rename') renameCategoryFlow(name);
          else if(act === 'delete') deleteCategoryFlow(name);
        });
      });
    });
  }
  function addCategoryFromInput(){
    if(!catMgrNewInput) return;
    var name = normalizeCatName(catMgrNewInput.value);
    if(catMgrHint) catMgrHint.textContent = '';
    if(!name){ if(catMgrHint) catMgrHint.textContent = '请填写类别名称'; return; }
    var acct = getAcctData();
    if(categoryNameTaken(acct, name, null)){ if(catMgrHint) catMgrHint.textContent = '已经有一个同名类别了'; return; }
    acct.categories.push({ name: name, color: pickNextCategoryColor(acct.categories) });
    saveAcctData(acct);
    refreshCategoriesCache(acct.categories);
    catMgrNewInput.value = '';
    renderCategoryManageList();
    renderSidebarCategoryList();
  }
  function renameCategoryFlow(oldName){
    if(catMgrHint) catMgrHint.textContent = '';
    window.SYMini.input('重命名类别', oldName, function(next){
    if(next === null) return; // 用户点了取消
    var name = normalizeCatName(next);
    if(!name || name === oldName) return;
    var acct = getAcctData();
    if(categoryNameTaken(acct, name, oldName)){
      if(catMgrHint) catMgrHint.textContent = '已经有一个同名类别了';
      renderCategoryManageList();
      return;
    }
    var cat = acct.categories.find(function(c){ return c.name === oldName; });
    if(!cat) return;
    cat.name = name;
    // 类别没有单独的 id，靠名字联动——这个类别下所有任务、数据档案记录里存的名字都要跟着换，
    // 不然它们会变成孤儿，既不算旧类别、也不算新类别。
    acct.tasks.forEach(function(t){ if(t.category === oldName) t.category = name; });
    acct.durationLog.forEach(function(r){ if(r.category === oldName) r.category = name; });
    saveAcctData(acct);
    refreshCategoriesCache(acct.categories);
    renderCategoryManageList();
    renderSidebarCategoryList();
    refreshCurrentView();
    });
  }
  function deleteCategoryFlow(name){
    if(catMgrHint) catMgrHint.textContent = '';
    var acct = getAcctData();
    if(acct.categories.length <= 1){ if(catMgrHint) catMgrHint.textContent = '至少要留一个类别'; return; }
    if(!window.confirm('确定删除「' + name + '」这个类别吗？删除后新建任务不会再看到它，但已有的相关任务和数据档案记录会保留，不会被删除。')) return;
    acct.categories = acct.categories.filter(function(c){ return c.name !== name; });
    saveAcctData(acct);
    refreshCategoriesCache(acct.categories);
    renderCategoryManageList();
    renderSidebarCategoryList();
    refreshCurrentView();
  }
  var catMgrClose = document.getElementById('catMgrClose');
  if(catMgrClose) catMgrClose.addEventListener('click', closeCategoryManageModal);
  if(catMgrOverlay) catMgrOverlay.addEventListener('click', function(e){ if(e.target === catMgrOverlay) closeCategoryManageModal(); });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && catMgrOverlay && !catMgrOverlay.hidden) closeCategoryManageModal();
  });
  var catMgrAddBtn = document.getElementById('catMgrAddBtn');
  if(catMgrAddBtn) catMgrAddBtn.addEventListener('click', addCategoryFromInput);
  if(catMgrNewInput) catMgrNewInput.addEventListener('keydown', function(e){ if(e.key === 'Enter') addCategoryFromInput(); });
  var profileManageCatBtn = document.getElementById('profileManageCatBtn');
  if(profileManageCatBtn) profileManageCatBtn.addEventListener('click', openCategoryManageModal);

  // ---- 管理精力时间段 弹窗：跟"管理类别"是同一套开关/渲染模式，只是每行要编辑的字段更多
  // （图标/名字/开始-结束时间/建议做什么），所以每行直接放输入框，change 时就地保存，
  // 使用页内编辑表单。----
  var energyModalOverlay = document.getElementById('energyModalOverlay');
  var energyMgrList = document.getElementById('energyMgrList');
  var energyMgrHint = document.getElementById('energyMgrHint');
  function openEnergyManageModal(){
    if(!energyModalOverlay) return;
    if(energyMgrHint) energyMgrHint.textContent = '';
    renderEnergyManageList();
    energyModalOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeEnergyManageModal(){
    if(!energyModalOverlay) return;
    energyModalOverlay.hidden = true;
    document.body.style.overflow = '';
    renderProfileView(); // 关掉弹层时刷新"我的"页，让精力曲线卡片跟着最新设置一起更新
  }
  function renderEnergyManageList(){
    if(!energyMgrList) return;
    var acct = getAcctData();
    if(!acct.energyPeriods.length){
      energyMgrList.innerHTML = DOMPurify.sanitize('<p class="empty-state">还没有时间段，点下面"添加时间段"加一个吧</p>');
      return;
    }
    energyMgrList.innerHTML = DOMPurify.sanitize(acct.energyPeriods.map(function(p){
      return '<li class="energy-mgr-row" data-id="' + p.id + '">' +
        '<input type="text" class="energy-mgr-emoji" maxlength="2" value="' + escapeHtml(p.emoji || '⏱') + '" data-field="emoji" aria-label="图标">' +
        '<input type="text" class="energy-mgr-name" maxlength="10" value="' + escapeHtml(p.name) + '" data-field="name" aria-label="名称">' +
        '<div class="energy-mgr-time">' +
          '<input type="time" class="energy-mgr-time-input" value="' + fmtClock(p.startMin) + '" data-field="start" aria-label="开始时间">' +
          '<span>–</span>' +
          '<input type="time" class="energy-mgr-time-input" value="' + fmtClock(p.endMin) + '" data-field="end" aria-label="结束时间">' +
        '</div>' +
        '<input type="text" class="energy-mgr-suggestion" maxlength="40" placeholder="适合做什么（选填）" value="' + escapeHtml(p.suggestion || '') + '" data-field="suggestion" aria-label="建议">' +
        '<button class="catmgr-icon-btn" type="button" data-act="delete" aria-label="删除' + escapeHtml(p.name) + '">🗑</button>' +
      '</li>';
    }).join(''));
    energyMgrList.querySelectorAll('.energy-mgr-row').forEach(function(row){
      var id = row.getAttribute('data-id');
      row.querySelectorAll('[data-field]').forEach(function(inp){
        inp.addEventListener('change', function(){ updateEnergyPeriodField(id, inp.getAttribute('data-field'), inp.value); });
      });
      var delBtn = row.querySelector('[data-act="delete"]');
      if(delBtn) delBtn.addEventListener('click', function(){ deleteEnergyPeriod(id); });
    });
  }
  function updateEnergyPeriodField(id, field, value){
    var acct = getAcctData();
    var p = acct.energyPeriods.find(function(x){ return x.id === id; });
    if(!p) return;
    if(energyMgrHint) energyMgrHint.textContent = '';
    if(field === 'emoji') p.emoji = (value || '⏱').trim().slice(0, 2) || '⏱';
    else if(field === 'name') p.name = normalizeCatName(value) || p.name;
    else if(field === 'suggestion') p.suggestion = (value || '').trim().slice(0, 40);
    else if(field === 'start'){ var sm = parseClockToMinutes(value); if(sm !== null) p.startMin = sm; }
    else if(field === 'end'){ var em = parseClockToMinutes(value); if(em !== null) p.endMin = em; }
    if(p.endMin <= p.startMin){
      if(energyMgrHint) energyMgrHint.textContent = '结束时间要晚于开始时间，这一次改动没有保存';
      renderEnergyManageList(); // 不落盘，重新按上一次保存过的样子渲染
      return;
    }
    saveAcctData(acct);
    renderEnergyManageList();
  }
  function deleteEnergyPeriod(id){
    if(!window.confirm('确定删除这个时间段吗？')) return;
    var acct = getAcctData();
    acct.energyPeriods = acct.energyPeriods.filter(function(p){ return p.id !== id; });
    saveAcctData(acct);
    renderEnergyManageList();
  }
  function addEnergyPeriod(){
    var acct = getAcctData();
    acct.energyPeriods.push({ id: 'ep_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), emoji: '⏱', name: '新时间段', startMin: 12 * 60, endMin: 13 * 60, suggestion: '' });
    saveAcctData(acct);
    renderEnergyManageList();
  }
  var energyModalClose = document.getElementById('energyModalClose');
  if(energyModalClose) energyModalClose.addEventListener('click', closeEnergyManageModal);
  if(energyModalOverlay) energyModalOverlay.addEventListener('click', function(e){ if(e.target === energyModalOverlay) closeEnergyManageModal(); });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && energyModalOverlay && !energyModalOverlay.hidden) closeEnergyManageModal();
  });
  var energyMgrAddBtn = document.getElementById('energyMgrAddBtn');
  if(energyMgrAddBtn) energyMgrAddBtn.addEventListener('click', addEnergyPeriod);

  // ---- 添加/编辑习惯 弹窗 ----
  var habitModalOverlay = document.getElementById('habitModalOverlay');
  var habitNameInput = document.getElementById('habitNameInput');
  var habitCatSelectInput = document.getElementById('habitCatSelectInput');
  var habitModeInput = document.getElementById('habitModeInput');
  var habitFormHint = document.getElementById('habitFormHint');
  function openHabitModal(habitId, presetCatId){
    editingHabitId = habitId || null;
    var acct = getAcctData();
    var editing = habitId ? acct.habits.filter(function(h){ return h.id === habitId; })[0] : null;
    document.getElementById('habitModalTitle').textContent = editing ? '编辑习惯' : '添加习惯';
    habitCatSelectInput.innerHTML = DOMPurify.sanitize(acct.habitCategories.map(function(c){ return '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>'; }).join(''));
    habitNameInput.value = editing ? editing.name : '';
    habitCatSelectInput.value = editing ? editing.categoryId : (presetCatId || (acct.habitCategories[0] && acct.habitCategories[0].id) || '');
    habitModeInput.value = editing ? (editing.mode || '') : '';
    habitFormHint.textContent = '';
    habitModalOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
    habitNameInput.focus();
  }
  function closeHabitModal(){
    habitModalOverlay.hidden = true;
    document.body.style.overflow = '';
    editingHabitId = null;
  }
  var habitModalClose = document.getElementById('habitModalClose');
  if(habitModalClose) habitModalClose.addEventListener('click', closeHabitModal);
  if(habitModalOverlay) habitModalOverlay.addEventListener('click', function(e){ if(e.target === habitModalOverlay) closeHabitModal(); });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && habitModalOverlay && !habitModalOverlay.hidden) closeHabitModal();
  });
  var habitSaveBtn = document.getElementById('habitSaveBtn');
  function saveHabitForm(){
    var name = habitNameInput.value.trim();
    if(!name){ habitFormHint.textContent = '请填写习惯名称'; habitNameInput.focus(); return; }
    var catId = habitCatSelectInput.value;
    if(!catId){ habitFormHint.textContent = '请先添加一个分类'; return; }
    var mode = habitModeInput.value.trim();
    var acct = getAcctData();
    if(editingHabitId){
      var h = acct.habits.filter(function(x){ return x.id === editingHabitId; })[0];
      if(h){ h.name = name; h.categoryId = catId; h.mode = mode; }
    } else {
      acct.habits.push({ id: uid(), name: name, categoryId: catId, mode: mode, createdAt: Date.now() });
    }
    saveAcctData(acct);
    habitsActiveCatId = catId;
    closeHabitModal();
    renderHabitsView();
  }
  if(habitSaveBtn) habitSaveBtn.addEventListener('click', saveHabitForm);
  [habitNameInput, habitModeInput].forEach(function(inp){
    if(inp) inp.addEventListener('keydown', function(e){ if(e.key === 'Enter') saveHabitForm(); });
  });

  // ===== 添加/编辑任务 弹窗 =====
  var taskModalOverlay = document.getElementById('taskModalOverlay');
  var taskStep1 = document.getElementById('taskStep1');
  var taskStep2 = document.getElementById('taskStep2');
  var taskNameInput = document.getElementById('taskNameInput');
  var taskCatSelect = document.getElementById('taskCatSelect');
  var taskMinInput = document.getElementById('taskMinInput');
  var taskTimeInput = document.getElementById('taskTimeInput');
  var taskTimeHint = document.getElementById('taskTimeHint');
  var taskDueInput = document.getElementById('taskDueInput');
  var taskDueTimeInput = document.getElementById('taskDueTimeInput');
  var taskFormHint = document.getElementById('taskFormHint');
  var taskModalTitle = document.getElementById('taskModalTitle');
  var taskStep1Sub = document.getElementById('taskStep1Sub');
  var taskEstBanner = document.getElementById('taskEstBanner');
  var taskWeightChoice = document.getElementById('taskWeightChoice');
  var taskMaterialUrlInput = document.getElementById('taskMaterialUrlInput');
  var taskMaterialParseBtn = document.getElementById('taskMaterialParseBtn');
  var taskMaterialHint = document.getElementById('taskMaterialHint');
  var taskMaterialList = document.getElementById('taskMaterialList');
  var taskMaterialsCount = document.getElementById('taskMaterialsCount');
  var editingTaskId = null;
  var pendingWeight = 'mid';
  var taskMaterialsDraft = [];

  function normalizeMaterialUrl(value){
    try{
      var candidate = window.SYSourceIO ? (SYSourceIO.normalizeLinks(value)[0] || '') : String(value || '').trim();
      var u = new URL(candidate);
      if(!/^https?:$/.test(u.protocol) || u.username || u.password) return '';
      return u.href.slice(0, 2048);
    }catch(e){ return ''; }
  }
  function materialHost(url){
    try { return new URL(url).hostname; } catch(e) { return ''; }
  }
  function renderTaskMaterials(){
    if(!taskMaterialList) return;
    var count = taskMaterialsDraft.length;
    taskMaterialList.hidden = !count;
    if(taskMaterialsCount){ taskMaterialsCount.hidden = !count; taskMaterialsCount.textContent = count + ' / 6'; }
    taskMaterialList.innerHTML = DOMPurify.sanitize(taskMaterialsDraft.map(function(m, i){
      var title = m.title || materialHost(m.url) || '网页资料';
      var image = normalizeMaterialUrl(m.image || '');
      return '<article class="task-material-preview" data-material-index="' + i + '">' +
        '<a class="task-material-card-link" href="' + escapeHtml(m.url) + '" target="_blank" rel="noopener noreferrer" aria-label="打开 ' + escapeHtml(title) + '">' +
        (image ? '<img class="task-material-thumb" src="' + escapeHtml(image) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<span class="task-material-thumb" aria-hidden="true">↗</span>') +
        '<span class="task-material-copy"><span class="task-material-title">' + escapeHtml(title) + '</span>' +
        '<span class="task-material-source">' + escapeHtml(m.source || materialHost(m.url)) + '</span>' +
        (m.description ? '<span class="task-material-description">' + escapeHtml(m.description) + '</span>' : '') + '</span></a>' +
        '<div class="task-material-actions"><a class="task-material-open" href="' + escapeHtml(m.url) + '" target="_blank" rel="noopener noreferrer" aria-label="打开来源" title="在浏览器打开来源">↗</a>' +
        '<button class="task-material-remove" type="button" data-material-remove="' + i + '" aria-label="移除资料" title="移除资料">×</button></div></article>';
    }).join(''));
    taskMaterialList.querySelectorAll('[data-material-remove]').forEach(function(btn){
      btn.addEventListener('click', function(){
        taskMaterialsDraft.splice(Number(btn.getAttribute('data-material-remove')), 1);
        renderTaskMaterials();
      });
    });
  }
  async function parseTaskMaterial(){
    if(!taskMaterialUrlInput || !taskMaterialParseBtn) return;
    var url = normalizeMaterialUrl(taskMaterialUrlInput.value);
    if(!url){ taskMaterialHint.textContent = '请输入完整的 http(s) 公开链接'; return; }
    if(taskMaterialsDraft.some(function(m){ return m.url === url; })){ taskMaterialHint.textContent = '这条资料已经添加过了'; return; }
    if(taskMaterialsDraft.length >= 6){ taskMaterialHint.textContent = '一条任务最多添加 6 份资料'; return; }
    taskMaterialParseBtn.disabled = true;
    taskMaterialParseBtn.textContent = '解析中…';
    taskMaterialHint.textContent = '正在读取公开网页的分享信息…';
    var result = await backendCall('/api/url-preview', {url:url}, 30000);
    taskMaterialParseBtn.disabled = false;
    taskMaterialParseBtn.textContent = '解析网址';
    if(!result.ok){
      taskMaterialsDraft.push({id:uid(),url:url,title:materialHost(url),description:'原链接已保存；预览暂未读取。',source:materialHost(url),addedAt:Date.now()});
      taskMaterialUrlInput.value = ''; renderTaskMaterials();
      taskMaterialHint.textContent = '已保存可点击的原链接；预览未读取：' + (result.error || '原站暂时没有响应'); return;
    }
    var data = result.data || {};
    taskMaterialsDraft.push({id:uid(), url:url, title:String(data.title || materialHost(url)).slice(0,300), description:String(data.description || '').slice(0,600), image:normalizeMaterialUrl(data.image || ''), source:String(data.source || materialHost(url)).slice(0,180), addedAt:Date.now()});
    taskMaterialUrlInput.value = '';
    taskMaterialHint.textContent = '已添加。点击 ↗ 会在浏览器打开原始网页。';
    renderTaskMaterials();
  }

  // 任务分量。老任务（以及"快速收集"、AI 自动建的任务）本来就没有 weight 这个字段，
  // 一律在读取时当"中等"处理——不写回、不迁移、不碰任何已经存好的数据。
  function weightMeta(w){
    if(w === 'heavy') return { key:'heavy', label:'主要', rank:3 };
    if(w === 'light') return { key:'light', label:'次要', rank:1 };
    return { key:'mid', label:'中等', rank:2 };
  }
  function weightOf(t){ return weightMeta(t && t.weight).key; }
  function weightRank(t){ return weightMeta(t && t.weight).rank; }
  function weightLabel(t){ return weightMeta(t && t.weight).label; }
  function setPendingWeight(w){
    pendingWeight = weightMeta(w).key;
    if(!taskWeightChoice) return;
    Array.prototype.forEach.call(taskWeightChoice.querySelectorAll('.weight-btn'), function(btn){
      var on = btn.getAttribute('data-weight') === pendingWeight;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
  if(taskWeightChoice) taskWeightChoice.addEventListener('click', function(e){
    var btn = e.target.closest ? e.target.closest('.weight-btn') : null;
    if(btn) setPendingWeight(btn.getAttribute('data-weight'));
  });

  // 新建任务时，选的类别如果已经攒够 3 条真实用时记录，提示要不要直接用历史平均值当预计用时——
  // 只在"新建"时提示，编辑已有任务不动它；用户点"否"就自己填，不会替用户做决定。
  function updateEstimateBanner(){
    if(!taskEstBanner) return;
    taskEstBanner.replaceChildren();
    taskEstBanner.hidden = true;
    if(editingTaskId) return;
    var acct = getAcctData();
    var cat = taskCatSelect.value;
    var stats = categoryDurationStats(acct, cat);
    if(!stats) return;
    var count = Number(stats.count);
    var avgMinutes = Number(stats.avgMinutes);
    if(!Number.isSafeInteger(count) || count < 3 || !Number.isFinite(avgMinutes) || avgMinutes <= 0 || avgMinutes > Number.MAX_SAFE_INTEGER) return;
    avgMinutes = Math.max(1, Math.round(avgMinutes));
    var message = document.createElement('span');
    message.textContent = '「' + cat + '」类任务过去' + count + '次平均约' + avgMinutes + '分钟，用这个当预计用时？';
    var actions = document.createElement('span');
    actions.className = 'task-est-banner-actions';
    var yesBtn = document.createElement('button');
    yesBtn.type = 'button';
    yesBtn.className = 'btn btn-ghost btn-sm';
    yesBtn.id = 'taskEstYes';
    yesBtn.textContent = '是，用这个';
    yesBtn.addEventListener('click', function(){ taskMinInput.value = avgMinutes; taskEstBanner.hidden = true; });
    var noBtn = document.createElement('button');
    noBtn.type = 'button';
    noBtn.className = 'btn btn-ghost btn-sm';
    noBtn.id = 'taskEstNo';
    noBtn.textContent = '否，我自己填';
    noBtn.addEventListener('click', function(){ taskEstBanner.hidden = true; });
    actions.append(yesBtn, noBtn);
    taskEstBanner.append(message, actions);
    taskEstBanner.hidden = false;
  }
  if(taskCatSelect) taskCatSelect.addEventListener('change', updateEstimateBanner);

  function openTaskModal(taskId){
    editingTaskId = taskId || null;
    var acct = getAcctData();
    var editing = taskId ? acct.tasks.find(function(x){ return x.id === taskId; }) : null;
    var targetDate = editing ? editing.date : dayViewDate;
    taskModalTitle.textContent = editing ? '编辑任务' : '添加任务';
    taskStep1Sub.textContent = (editing ? '所属日期：' : '加进：') + fmtDayLabel(targetDate);
    taskNameInput.value = editing ? editing.name : '';
    // 类别下拉框每次打开都重新生成——用当前账号自己的类别列表，不再是写死的全局选项。编辑一条
    // 类别已经被改名/删除的历史任务时，把它当时那个类别名临时插回选项里，不然下拉框里选不中
    // 自己当前的值，保存时会被悄悄改成别的类别。
    var catOptionNames = acct.categories.map(function(c){ return c.name; });
    if(editing && catOptionNames.indexOf(editing.category) === -1) catOptionNames.push(editing.category);
    taskCatSelect.innerHTML = DOMPurify.sanitize(catOptionNames.map(function(name){ return '<option>' + escapeHtml(name) + '</option>'; }).join(''));
    taskCatSelect.value = editing ? editing.category : acct.categories[0].name;
    taskMinInput.value = editing ? editing.estMinutes : '';
    setPendingWeight(editing ? weightOf(editing) : 'mid');
    if(taskDueInput) taskDueInput.value = (editing && editing.dueDate) ? editing.dueDate : '';
    if(taskDueTimeInput) taskDueTimeInput.value = (editing && typeof editing.dueTime === 'string') ? editing.dueTime : '';
    taskMaterialsDraft = editing && Array.isArray(editing.materials) ? editing.materials.map(function(m){ return {
      id: m.id || uid(), url: normalizeMaterialUrl(m.url), title: String(m.title || '').slice(0,300), description: String(m.description || '').slice(0,600), image: normalizeMaterialUrl(m.image || ''), source: String(m.source || '').slice(0,180), addedAt: m.addedAt || Date.now()
    }; }).filter(function(m){ return !!m.url; }).slice(0,6) : [];
    if(taskMaterialUrlInput) taskMaterialUrlInput.value = '';
    if(taskMaterialHint) taskMaterialHint.textContent = '公开链接会保留原始地址；点击资料卡可在浏览器打开对应平台。';
    renderTaskMaterials();

    // 时间：新增任务默认接在这一天最后一件事后面，方便连续快速添加；
    // 编辑一条本来就没有时间的"待安排"任务时，不主动帮它安排时间，留空让用户自己决定。
    var prefillMin = editing
      ? (typeof editing.startMinutes === 'number' ? editing.startMinutes : null)
      : computeNextFreeSlot(targetDate);
    if(taskTimeInput) taskTimeInput.value = (prefillMin === null) ? '' : fmtClock(prefillMin);
    if(taskTimeHint) taskTimeHint.textContent = editing
      ? (prefillMin === null ? '还没有排时间——留在"待安排"里，或者选一个时间排进时间轴' : '改一下时间，或者清空变回"待安排"，回头用"AI计划生成"再排')
      : ('已自动接在最后一件事后面（' + fmtClock(prefillMin) + '），不想用可以清空（先放进"待安排"）或者改成别的时间');

    taskFormHint.textContent = '';
    taskStep1.hidden = false;
    taskStep2.hidden = true;
    taskModalOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
    taskNameInput.focus();
    updateEstimateBanner();
  }
  function closeTaskModal(){
    taskModalOverlay.hidden = true;
    document.body.style.overflow = '';
    editingTaskId = null;
  }

  // ---- 侧边栏"快速收集"：只填一个名字就能加进今天，类别/时长先给合理默认值，回头在任务的 ⋮ 编辑里补全 ----
  var quickCaptureBtn = document.getElementById('quickCaptureBtn');
  var quickCaptureOverlay = document.getElementById('quickCaptureOverlay');
  var quickCaptureInput = document.getElementById('quickCaptureInput');
  var quickCaptureSubmit = document.getElementById('quickCaptureSubmit');
  var quickCaptureClose = document.getElementById('quickCaptureClose');
  function openQuickCapture(){
    if(!quickCaptureOverlay) return;
    quickCaptureInput.value = '';
    quickCaptureOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
    quickCaptureInput.focus();
  }
  function closeQuickCapture(){
    if(!quickCaptureOverlay) return;
    quickCaptureOverlay.hidden = true;
    document.body.style.overflow = '';
  }
  function submitQuickCapture(){
    var name = quickCaptureInput.value.trim();
    if(!name){ quickCaptureInput.focus(); return; }
    var acct = getAcctData();
    var today = todayKey();
    var maxOrder = 0;
    acct.tasks.forEach(function(x){ if(x.date === today) maxOrder = Math.max(maxOrder, x.order); });
    var estMinutes = 15, multiplier = 1.3;
    acct.tasks.push({
      id: uid(), name: name, category: '其他',
      estMinutes: estMinutes, firstTime: false, multiplier: multiplier, plannedMinutes: estMinutes * multiplier,
      startMinutes: null, date: today, done: false, completedAt: null, order: maxOrder + 1, createdAt: Date.now()
    });
    saveAcctData(acct);
    closeQuickCapture();
    refreshCurrentView();
  }
  if(quickCaptureBtn) quickCaptureBtn.addEventListener('click', openQuickCapture);
  if(quickCaptureClose) quickCaptureClose.addEventListener('click', closeQuickCapture);
  if(quickCaptureOverlay) quickCaptureOverlay.addEventListener('click', function(e){ if(e.target === quickCaptureOverlay) closeQuickCapture(); });
  if(quickCaptureSubmit) quickCaptureSubmit.addEventListener('click', submitQuickCapture);
  if(quickCaptureInput) quickCaptureInput.addEventListener('keydown', function(e){ if(e.key === 'Enter') submitQuickCapture(); });

  // ---- 弹性时间块弹窗：跟"快速收集"同一类"侧边小弹窗"写法——开的时候回填默认值/自动估一个
  // 时间，提交就往当前 dayViewDate 那天的 acct.tasks 里塞一条普通任务（多两个新的可选字段）。----
  var flexBlockOverlay = document.getElementById('flexBlockOverlay');
  var flexPurposeRow = document.getElementById('flexPurposeRow');
  var flexTimeInput = document.getElementById('flexTimeInput');
  var flexDurationSelect = document.getElementById('flexDurationSelect');
  var flexSuggestBtn = document.getElementById('flexSuggestBtn');
  var flexBlockHint = document.getElementById('flexBlockHint');
  var flexBlockSub = document.getElementById('flexBlockSub');
  var flexBlockSubmit = document.getElementById('flexBlockSubmit');
  var flexBlockClose = document.getElementById('flexBlockClose');
  var flexBlockPurpose = FLEX_PURPOSES[0].key;
  function renderFlexPurposeRow(){
    if(!flexPurposeRow) return;
    flexPurposeRow.innerHTML = DOMPurify.sanitize(FLEX_PURPOSES.map(function(p){
      return '<button type="button" class="flex-purpose-btn' + (p.key === flexBlockPurpose ? ' is-active' : '') + '" data-key="' + p.key + '">' + p.emoji + ' ' + p.label + '</button>';
    }).join(''));
    flexPurposeRow.querySelectorAll('.flex-purpose-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        flexBlockPurpose = btn.getAttribute('data-key');
        renderFlexPurposeRow();
      });
    });
  }
  function fillFlexSuggestion(){
    if(!flexDurationSelect || !flexTimeInput) return;
    var duration = parseInt(flexDurationSelect.value, 10) || 15;
    var suggestion = suggestFlexSlot(dayViewDate, duration);
    if(suggestion){
      flexTimeInput.value = fmtClock(suggestion.startMinutes);
      if(flexBlockHint) flexBlockHint.textContent = '';
    } else if(flexBlockHint){
      flexBlockHint.textContent = '这一天排得比较满，没找到够长的空档——手动填一个时间也可以';
    }
  }
  function openFlexBlockModal(){
    if(!flexBlockOverlay) return;
    flexBlockPurpose = FLEX_PURPOSES[0].key;
    renderFlexPurposeRow();
    if(flexDurationSelect) flexDurationSelect.innerHTML = DOMPurify.sanitize(flexDurationOptionsHtml(15));
    if(flexBlockSub) flexBlockSub.textContent = '加进：' + fmtDayLabel(dayViewDate) + ' · 用来缓冲、复盘资料、追消息或处理临时事务，不用提前想好具体做什么';
    if(flexBlockHint) flexBlockHint.textContent = '';
    fillFlexSuggestion();
    flexBlockOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeFlexBlockModal(){
    if(!flexBlockOverlay) return;
    flexBlockOverlay.hidden = true;
    document.body.style.overflow = '';
  }
  function commitFlexBlock(){
    if(!flexTimeInput) return;
    var startMinutes = parseClockToMinutes(flexTimeInput.value);
    if(startMinutes === null){ if(flexBlockHint) flexBlockHint.textContent = '请填一个时间，格式如 15:30'; flexTimeInput.focus(); return; }
    var duration = parseInt(flexDurationSelect.value, 10) || 15;
    var purpose = FLEX_PURPOSES.filter(function(p){ return p.key === flexBlockPurpose; })[0] || FLEX_PURPOSES[0];
    var acct = getAcctData();
    var maxOrder = 0;
    acct.tasks.forEach(function(x){ if(x.date === dayViewDate) maxOrder = Math.max(maxOrder, x.order); });
    acct.tasks.push({
      // 不写 multiplier/firstTime——这两个字段只有"任务卡片要不要显示 N× 缓冲角标"这一处用途
      // (见 multiplierTagHtml)，留空就是没有角标，弹性时间本来也不需要这个"是不是第一次做"的角标。
      id: uid(), name: purpose.emoji + ' 弹性时间 · ' + purpose.label, category: acct.categories[0].name,
      estMinutes: duration, plannedMinutes: duration,
      startMinutes: startMinutes, dueDate: null, date: dayViewDate, done: false, completedAt: null,
      order: maxOrder + 1, createdAt: Date.now(), isFlexBlock: true, flexPurpose: purpose.key
    });
    saveAcctData(acct);
    closeFlexBlockModal();
    refreshCurrentView();
  }
  if(flexBlockClose) flexBlockClose.addEventListener('click', closeFlexBlockModal);
  if(flexBlockOverlay) flexBlockOverlay.addEventListener('click', function(e){ if(e.target === flexBlockOverlay) closeFlexBlockModal(); });
  if(flexSuggestBtn) flexSuggestBtn.addEventListener('click', fillFlexSuggestion);
  if(flexBlockSubmit) flexBlockSubmit.addEventListener('click', commitFlexBlock);

  // ---- 顶部"距考试 N 天"倒计时：设置一次，之后随时点"改"重新设置；没设置就如实显示"还没设置"，不瞎编天数 ----
  var examCountdownBadge = document.getElementById('examCountdownBadge');
  var examDateOverlay = document.getElementById('examDateOverlay');
  var examDateInput = document.getElementById('examDateInput');
  var examDateSubmit = document.getElementById('examDateSubmit');
  var examDateClose = document.getElementById('examDateClose');
  var examDateHint = document.getElementById('examDateHint');
  function renderExamCountdown(){
    if(!examCountdownBadge) return;
    var acct = getAcctData();
    if(!acct.examDate){
      examCountdownBadge.className = 'app-exam-countdown is-unset';
      examCountdownBadge.innerHTML = DOMPurify.sanitize('🎯 还没设置考试日期<button type="button" id="examDateSetBtn">设置</button>');
      var setBtn = document.getElementById('examDateSetBtn');
      if(setBtn) setBtn.addEventListener('click', openExamDateModal);
      return;
    }
    var target = parseDateKey(acct.examDate);
    var diffDays = Math.ceil((target - parseDateKey(todayKey())) / 86400000);
    var text = diffDays > 0 ? ('🎯 距考试 ' + diffDays + ' 天') : (diffDays === 0 ? '🎯 就是今天' : ('🎯 考试已过 ' + Math.abs(diffDays) + ' 天'));
    examCountdownBadge.className = 'app-exam-countdown';
    examCountdownBadge.innerHTML = DOMPurify.sanitize(escapeHtml(text) + '<button type="button" id="examDateEditBtn">改</button>');
    var editBtn = document.getElementById('examDateEditBtn');
    if(editBtn) editBtn.addEventListener('click', openExamDateModal);
  }
  function openExamDateModal(){
    if(!examDateOverlay) return;
    var acct = getAcctData();
    examDateInput.value = acct.examDate || '';
    examDateHint.textContent = '';
    examDateOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeExamDateModal(){
    if(!examDateOverlay) return;
    examDateOverlay.hidden = true;
    document.body.style.overflow = '';
  }
  function submitExamDate(){
    if(!examDateInput.value){ examDateHint.textContent = '请选一个日期'; return; }
    var acct = getAcctData();
    acct.examDate = examDateInput.value;
    var newlyBadges = checkAndRecordBadgeUnlocks(acct);
    saveAcctData(acct);
    closeExamDateModal();
    renderExamCountdown();
    renderConsoleHero();
    toastNewBadges(newlyBadges);
  }
  if(examDateClose) examDateClose.addEventListener('click', closeExamDateModal);
  if(examDateOverlay) examDateOverlay.addEventListener('click', function(e){ if(e.target === examDateOverlay) closeExamDateModal(); });
  if(examDateSubmit) examDateSubmit.addEventListener('click', submitExamDate);
  document.addEventListener('keydown', function(e){
    if(e.key !== 'Escape') return;
    if(quickCaptureOverlay && !quickCaptureOverlay.hidden) closeQuickCapture();
    if(flexBlockOverlay && !flexBlockOverlay.hidden) closeFlexBlockModal();
    if(examDateOverlay && !examDateOverlay.hidden) closeExamDateModal();
  });

  // ---- 个人简介弹层：点头像或"写一句/编辑"链接打开，纯本地字段，跟考试日期是同一套
  // 弹层写法（打开时回填当前值、点保存写回account、关闭恢复滚动）。----
  var bioModalOverlay = document.getElementById('bioModalOverlay');
  var bioInput = document.getElementById('bioInput');
  var bioModalSubmit = document.getElementById('bioModalSubmit');
  var bioModalClose = document.getElementById('bioModalClose');
  function openBioModal(){
    if(!bioModalOverlay) return;
    var acct = getAcctData();
    bioInput.value = acct.bio || '';
    bioModalOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
    bioInput.focus();
  }
  function closeBioModal(){
    if(!bioModalOverlay) return;
    bioModalOverlay.hidden = true;
    document.body.style.overflow = '';
  }
  function submitBio(){
    var acct = getAcctData();
    acct.bio = (bioInput.value || '').trim();
    saveAcctData(acct);
    closeBioModal();
    renderProfileView();
  }
  if(bioModalClose) bioModalClose.addEventListener('click', closeBioModal);
  if(bioModalOverlay) bioModalOverlay.addEventListener('click', function(e){ if(e.target === bioModalOverlay) closeBioModal(); });
  if(bioModalSubmit) bioModalSubmit.addEventListener('click', submitBio);
  document.addEventListener('keydown', function(e){
    if(e.key !== 'Escape') return;
    if(bioModalOverlay && !bioModalOverlay.hidden) closeBioModal();
  });

  // ---- 任务笔记：收获/知识点/备注三块通用，"学习AI产品经理"类别的任务多一个"用的GitHub框架"——
  // 不在勾完就强制弹窗（怕打断连续勾一堆任务的手感），而是常驻在每条任务的 ⋮ 菜单里，写没写过用小标签"📝 笔记"标出来 ----
  var taskNotesOverlay = document.getElementById('taskNotesOverlay');
  var taskNotesTaskName = document.getElementById('taskNotesTaskName');
  var notesGainInput = document.getElementById('notesGainInput');
  var notesKnowledgeInput = document.getElementById('notesKnowledgeInput');
  var notesRemarkInput = document.getElementById('notesRemarkInput');
  var notesFrameworkField = document.getElementById('notesFrameworkField');
  var notesFrameworkInput = document.getElementById('notesFrameworkInput');
  var notesSubmitBtn = document.getElementById('notesSubmit');
  var notesCloseBtn = document.getElementById('taskNotesClose');
  var currentNotesTaskId = null;
  function openTaskNotesModal(id){
    if(!taskNotesOverlay || !id) return;
    var acct = getAcctData();
    var t = acct.tasks.find(function(x){ return x.id === id; });
    if(!t) return;
    currentNotesTaskId = id;
    taskNotesTaskName.textContent = t.name + ' · ' + t.category;
    notesGainInput.value = t.noteGain || '';
    notesKnowledgeInput.value = t.noteKnowledge || '';
    notesRemarkInput.value = t.noteRemark || '';
    notesFrameworkInput.value = t.noteFramework || '';
    notesFrameworkField.hidden = t.category !== '学习AI产品经理';
    taskNotesOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
    notesGainInput.focus();
  }
  function closeTaskNotesModal(){
    if(!taskNotesOverlay) return;
    taskNotesOverlay.hidden = true;
    document.body.style.overflow = '';
    currentNotesTaskId = null;
  }
  function submitTaskNotes(){
    if(!currentNotesTaskId) return;
    var acct = getAcctData();
    var t = acct.tasks.find(function(x){ return x.id === currentNotesTaskId; });
    if(!t){ closeTaskNotesModal(); return; }
    t.noteGain = notesGainInput.value.trim();
    t.noteKnowledge = notesKnowledgeInput.value.trim();
    t.noteRemark = notesRemarkInput.value.trim();
    if(t.category === '学习AI产品经理') t.noteFramework = notesFrameworkInput.value.trim();
    saveAcctData(acct);
    closeTaskNotesModal();
    refreshCurrentView();
  }
  if(notesCloseBtn) notesCloseBtn.addEventListener('click', closeTaskNotesModal);
  if(taskNotesOverlay) taskNotesOverlay.addEventListener('click', function(e){ if(e.target === taskNotesOverlay) closeTaskNotesModal(); });
  if(notesSubmitBtn) notesSubmitBtn.addEventListener('click', submitTaskNotes);
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && taskNotesOverlay && !taskNotesOverlay.hidden) closeTaskNotesModal();
  });

  // ---- 分享海报：把当天的计划渲染成一张卡片给用户截图——Artifact 预览环境里脚本触发的下载是失效的，
  // 所以不做"下载图片"按钮（点了也保存不下来），老老实实做成截图用的展示卡 ----
  var posterOverlay = document.getElementById('posterOverlay');
  var posterClose = document.getElementById('posterClose');
  function renderPosterCard(){
    var box = document.getElementById('posterCardBody');
    if(!box) return;
    var acct = getAcctData();
    var dateKey = dayViewDate || todayKey();
    var dayTasks = acct.tasks.filter(function(t){ return t.date === dateKey; }).sort(function(a, b){
      var am = typeof a.startMinutes === 'number' ? a.startMinutes : 9999;
      var bm = typeof b.startMinutes === 'number' ? b.startMinutes : 9999;
      return am - bm;
    });
    var doneCount = dayTasks.filter(function(t){ return t.done; }).length;
    var pendingCount = dayTasks.length - doneCount;
    var pct = dayTasks.length ? Math.round(doneCount / dayTasks.length * 100) : 0;
    var examLineHtml = '';
    if(acct.examDate){
      var target = parseDateKey(acct.examDate);
      var diffDays = Math.ceil((target - parseDateKey(todayKey())) / 86400000);
      if(diffDays > 0) examLineHtml = '<p class="poster-exam-line">🎯 距考研还有 ' + diffDays + ' 天</p>';
    }
    var tasksHtml = dayTasks.length
      ? dayTasks.map(function(t){
          var timeStr = typeof t.startMinutes === 'number' ? (fmtClock(t.startMinutes) + ' ') : '';
          return '<li class="poster-task' + (t.done ? ' is-done' : '') + '">' +
            '<span class="poster-task-dot" style="background:' + categoryColor(t.category) + '" aria-hidden="true"></span>' +
            '<span class="poster-task-name">' + timeStr + escapeHtml(t.name) + '</span>' +
            '<span class="poster-task-check">' + (t.done ? '✓' : '') + '</span>' +
            '</li>';
        }).join('')
      : '<li class="poster-task">今天还没排任务</li>';
    box.innerHTML =
      DOMPurify.sanitize('<div class="poster-head"><span class="poster-logo">🦆 上岸鸭</span><span class="poster-date">' + escapeHtml(fmtDayLabel(dateKey)) + '</span></div>' +
      '<div class="poster-stats">' +
        '<div class="poster-stat"><b>' + doneCount + '</b><span>已完成</span></div>' +
        '<div class="poster-stat"><b>' + pendingCount + '</b><span>待完成</span></div>' +
        '<div class="poster-stat"><b>' + pct + '%</b><span>完成率</span></div>' +
      '</div>' +
      examLineHtml +
      '<ul class="poster-tasklist">' + tasksHtml + '</ul>' +
      '<p class="poster-footer">先做 5 分钟，大部分任务开始后都比想象中容易 · 上岸鸭</p>');
  }
  function openPosterModal(){
    if(!posterOverlay) return;
    renderPosterCard();
    posterOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closePosterModal(){
    if(!posterOverlay) return;
    posterOverlay.hidden = true;
    document.body.style.overflow = '';
  }
  if(posterClose) posterClose.addEventListener('click', closePosterModal);
  if(posterOverlay) posterOverlay.addEventListener('click', function(e){ if(e.target === posterOverlay) closePosterModal(); });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && posterOverlay && !posterOverlay.hidden) closePosterModal();
  });

  // ---- 首页小贴士：如实反映现有排期逻辑的几条说明，按日期轮换，不是瞎编的鸡汤 ----
  var HOME_TIPS = [
    '技术类任务容易低估，系统会自动按 <b>2.0倍</b> 留缓冲；不是第一次做的按 <b>1.3倍</b>，不用自己心算。',
    '同一类别攒够 <b>3条</b> 真实用时记录后，新建任务会用这些数据帮你估时，不用瞎猜。',
    '一天排不下的任务会自动放进"待安排"，不会为了凑满一天硬塞时间冲突的任务。',
    '先做 5 分钟——大部分任务真正开始后，都比想象中容易。',
    '点某个类别标题，会像小票一样"打印"出这个类别当前所有没做完的任务。',
    '完成的任务会自动收进"收集箱"，想回顾做过什么的时候去那翻一翻。'
  ];
  function renderTipCard(){
    var box = document.getElementById('homeTipCard');
    if(!box) return;
    var idx = new Date().getDate() % HOME_TIPS.length;
    box.innerHTML = DOMPurify.sanitize('<span class="home-tip-card-icon" aria-hidden="true">💡</span>' +
      '<span class="home-tip-card-text">' + HOME_TIPS[idx] + '</span>');
  }
  var taskModalClose = document.getElementById('taskModalClose');
  if(taskModalClose) taskModalClose.addEventListener('click', closeTaskModal);
  if(taskModalOverlay) taskModalOverlay.addEventListener('click', function(e){ if(e.target === taskModalOverlay) closeTaskModal(); });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && taskModalOverlay && !taskModalOverlay.hidden) closeTaskModal();
  });

  var taskFormNext = document.getElementById('taskFormNext');
  function goToFirstTimeStep(){
    var name = taskNameInput.value.trim();
    var mins = parseFloat(taskMinInput.value);
    if(!name){ taskFormHint.textContent = '请填写任务名称'; taskNameInput.focus(); return; }
    if(!mins || mins <= 0){ taskFormHint.textContent = '请填写预计用时（分钟）'; taskMinInput.focus(); return; }
    taskFormHint.textContent = '';
    taskStep1.hidden = true;
    taskStep2.hidden = false;
  }
  if(taskFormNext) taskFormNext.addEventListener('click', goToFirstTimeStep);
  if(taskMaterialParseBtn) taskMaterialParseBtn.addEventListener('click', parseTaskMaterial);
  if(taskMaterialUrlInput) taskMaterialUrlInput.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); parseTaskMaterial(); } });
  [taskNameInput, taskMinInput].forEach(function(inp){
    if(inp) inp.addEventListener('keydown', function(e){ if(e.key === 'Enter') goToFirstTimeStep(); });
  });
  var taskStepBack = document.getElementById('taskStepBack');
  if(taskStepBack) taskStepBack.addEventListener('click', function(){
    taskStep2.hidden = true;
    taskStep1.hidden = false;
  });

  function commitTask(multiplier, firstTime){
    var acct = getAcctData();
    var name = taskNameInput.value.trim();
    var category = taskCatSelect.value;
    var estMinutes = parseFloat(taskMinInput.value);
    var plannedMinutes = estMinutes * multiplier;
    var startMinutes = taskTimeInput ? parseClockToMinutes(taskTimeInput.value) : null;
    var dueDate = (taskDueInput && taskDueInput.value) ? taskDueInput.value : null; // 截止日期：选填，跟"date"(排到哪天做)是两个概念
    // 截止"几点"：只在填了截止日期时才有意义，光有钟点没有日期存了也没用
    var dueTime = (dueDate && taskDueTimeInput && parseClockToMinutes(taskDueTimeInput.value) !== null) ? taskDueTimeInput.value : null;

    if(editingTaskId){
      var t = acct.tasks.find(function(x){ return x.id === editingTaskId; });
      if(t){
        t.name = name; t.category = category; t.estMinutes = estMinutes;
        t.firstTime = firstTime; t.multiplier = multiplier; t.plannedMinutes = plannedMinutes;
        t.weight = pendingWeight;
        t.startMinutes = startMinutes;
        t.dueDate = dueDate;
        t.dueTime = dueTime;
        t.materials = taskMaterialsDraft.slice(0, 6);
        t.aiScheduled = false; // 这条时间是刚才在表单里手动填/改的，不再算"AI排的"了
      }
    } else {
      var maxOrder = 0;
      acct.tasks.forEach(function(x){ if(x.date === dayViewDate) maxOrder = Math.max(maxOrder, x.order); });
      acct.tasks.push({
        id: uid(), name: name, category: category,
        estMinutes: estMinutes, firstTime: firstTime, multiplier: multiplier, plannedMinutes: plannedMinutes,
        weight: pendingWeight,
        startMinutes: startMinutes, dueDate: dueDate, dueTime: dueTime, materials: taskMaterialsDraft.slice(0, 6), date: dayViewDate, done: false, completedAt: null, order: maxOrder + 1, createdAt: Date.now()
      });
    }
    saveAcctData(acct);
    closeTaskModal();
    refreshCurrentView();
  }
  var firstTimeYes = document.getElementById('firstTimeYes');
  var firstTimeNo = document.getElementById('firstTimeNo');
  if(firstTimeYes) firstTimeYes.addEventListener('click', function(){ commitTask(2.0, true); });
  if(firstTimeNo) firstTimeNo.addEventListener('click', function(){ commitTask(1.3, false); });

  // ===== 番茄钟：开始前选"倒计时"还是"正计时" =====
  var timerModeOverlay = document.getElementById('timerModeOverlay');
  function openTimerModeChoice(taskId){
    var acct = getAcctData();
    var t = acct.tasks.find(function(x){ return x.id === taskId; });
    if(!t || !timerModeOverlay) return;
    timerModePendingTaskId = taskId;
    var sub = document.getElementById('timerModeSub');
    if(sub) sub.textContent = '《' + t.name + '》· 计划' + fmtDuration(t.plannedMinutes) + '，选一种计时方式';
    timerModeOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeTimerModeChoice(){
    if(timerModeOverlay) timerModeOverlay.hidden = true;
    document.body.style.overflow = '';
    timerModePendingTaskId = null;
  }
  var timerModeClose = document.getElementById('timerModeClose');
  if(timerModeClose) timerModeClose.addEventListener('click', closeTimerModeChoice);
  if(timerModeOverlay) timerModeOverlay.addEventListener('click', function(e){ if(e.target === timerModeOverlay) closeTimerModeChoice(); });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && timerModeOverlay && !timerModeOverlay.hidden) closeTimerModeChoice();
  });
  var timerModeCountdownBtn = document.getElementById('timerModeCountdown');
  if(timerModeCountdownBtn) timerModeCountdownBtn.addEventListener('click', function(){
    var id = timerModePendingTaskId; closeTimerModeChoice(); if(id) startTaskTimer(id, 'countdown');
  });
  var timerModeStopwatchBtn = document.getElementById('timerModeStopwatch');
  if(timerModeStopwatchBtn) timerModeStopwatchBtn.addEventListener('click', function(){
    var id = timerModePendingTaskId; closeTimerModeChoice(); if(id) startTaskTimer(id, 'stopwatch');
  });
  var timerModeSilentBtn = document.getElementById('timerModeSilent');
  if(timerModeSilentBtn) timerModeSilentBtn.addEventListener('click', function(){
    var id = timerModePendingTaskId; closeTimerModeChoice(); if(id) startTaskTimer(id, 'silent');
  });

  // ---- modal ----
  var overlay = document.getElementById('loginOverlay');
  var openTriggers = document.querySelectorAll('[data-open-login]');
  var closeBtn = document.getElementById('loginClose');
  var lastFocused = null;
  var countdownTimer = null;

  // ---- tabs ----
  var tabBtns = overlay ? Array.prototype.slice.call(overlay.querySelectorAll('.tab-btn')) : [];
  var panels = overlay ? Array.prototype.slice.call(overlay.querySelectorAll('.tab-panel')) : [];
  // 记录每个 tab-panel 最初的 markup，这样弹窗每次关闭都能把"登录成功"之类的临时界面还原回表单，
  // 而不会让下次打开永远停在上一次的结果页上。
  var panelDefaults = {};
  panels.forEach(function(p){ panelDefaults[p.id] = p.innerHTML; });

  function resetAuthUI(){
    panels.forEach(function(p){
      if(panelDefaults[p.id] !== undefined) p.innerHTML = DOMPurify.sanitize(panelDefaults[p.id]);
    });
    tabBtns.forEach(function(b, i){
      b.classList.toggle('active', i === 0);
      b.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
    });
    panels.forEach(function(p, i){ p.hidden = (i !== 0); });
    if(countdownTimer){ clearInterval(countdownTimer); countdownTimer = null; }
    bindAuthFormHandlers();
  }

  function openModal(){
    lastFocused = document.activeElement;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    var firstTab = overlay.querySelector('.tab-btn');
    if(firstTab) firstTab.focus();
  }
  function closeModal(){
    overlay.hidden = true;
    document.body.style.overflow = '';
    if(lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    resetAuthUI();
  }
  openTriggers.forEach(function(btn){ btn.addEventListener('click', openModal); });
  if(closeBtn) closeBtn.addEventListener('click', closeModal);
  if(overlay){
    overlay.addEventListener('click', function(e){ if(e.target === overlay) closeModal(); });
  }
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && overlay && !overlay.hidden) closeModal();
  });

  tabBtns.forEach(function(btn){
    btn.addEventListener('click', function(){
      tabBtns.forEach(function(b){ b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
      panels.forEach(function(p){ p.hidden = true; });
      btn.classList.add('active');
      btn.setAttribute('aria-selected','true');
      var target = overlay.querySelector('.tab-panel[data-panel="' + btn.getAttribute('data-tab') + '"]');
      if(target) target.hidden = false;
    });
  });

  // ---- demo success states (放在最前面，方便下面各处调用；不依赖具体 DOM 节点，无需重新绑定) ----
  // 点击"进入上岸鸭"之后不再只是关掉弹窗回到营销页，而是真的带你进入首页（见上面的 enterApp）。
  function showDemoSuccess(panelSelector, message, displayName, acctKey){
    var panel = overlay.querySelector(panelSelector);
    if(!panel) return;
    var msg = message || '登录成功，马上带你进入上岸鸭首页。';
    panel.innerHTML = DOMPurify.sanitize('<div class="success-state"><p class="success-emoji" aria-hidden="true">🦆</p><h3>欢迎上岸！</h3><p>' + msg + '</p><button class="btn btn-primary submit-btn" id="successClose" type="button">进入上岸鸭 →</button></div>');
    var successClose = document.getElementById('successClose');
    if(successClose) successClose.addEventListener('click', function(){
      closeModal();
      enterApp(displayName, acctKey);
    });
  }

  // ---- 账号/密码 demo：仅保存在当前浏览器 localStorage，用于演示"账号+密码"校验的交互效果 ----
  // 注意：这不是真实后端鉴权。localStorage 内容任何人打开开发者工具都能看到，
  // 也不会跨设备同步——真实产品必须把密码校验放在服务端（对应 PRD 第十一节的技术边界）。
  var ACCOUNTS_KEY = 'shangan_ya_demo_accounts_v1';

  function loadAccounts(){
    try{ return JSON.parse(window.localStorage.getItem(ACCOUNTS_KEY) || '{}'); }
    catch(e){ return {}; }
  }
  function saveAccounts(obj){
    try{ window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(obj)); }
    catch(e){ /* 本地存储不可用时，静默降级——不影响演示的其余部分 */ }
  }
  function randomSalt(){
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  function bufferToHex(buf){
    return Array.prototype.map.call(new Uint8Array(buf), function(b){ return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function hashPassword(salt, pwd){
    if(window.crypto && window.crypto.subtle && window.isSecureContext){
      return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pwd)).then(bufferToHex);
    }
    // 极简退化方案，仅在 SubtleCrypto 不可用时使用，同样只是演示用途
    var text = salt + ':' + pwd, h = 0;
    for(var i = 0; i < text.length; i++){ h = ((h << 5) - h + text.charCodeAt(i)) | 0; }
    return Promise.resolve('fallback_' + h);
  }

  // ---- 以下这些控件都活在 tab-panel 的 innerHTML 里，每次 resetAuthUI() 替换内容后
  // 对应的 DOM 节点都是全新的，必须重新绑定一遍事件，所以统一收进这个函数，
  // 页面加载时调用一次，之后每次关闭弹窗、还原表单时再调用一次。
  function bindAuthFormHandlers(){
    // ---- sms demo countdown ----
    var sendBtn = document.getElementById('sendCodeBtn');
    var codeHint = document.getElementById('codeHint');
    if(sendBtn){
    sendBtn.addEventListener('click', function(){
      var phone = document.getElementById('phoneInput').value.trim();
      if(!/^1\d{10}$/.test(phone)){
        codeHint.textContent = '请输入正确的11位手机号';
        codeHint.classList.add('hint-warn');
        return;
      }
      codeHint.classList.remove('hint-warn');
      codeHint.textContent = '演示验证码：123456（原型演示，暂未接入真实短信通道）';
      var seconds = 60;
      sendBtn.disabled = true;
      sendBtn.textContent = seconds + 's后重新获取';
      clearInterval(countdownTimer);
      countdownTimer = setInterval(function(){
        seconds -= 1;
        if(seconds <= 0){
          clearInterval(countdownTimer);
          sendBtn.disabled = false;
          sendBtn.textContent = '获取验证码';
        } else {
          sendBtn.textContent = seconds + 's后重新获取';
        }
      }, 1000);
    });
  }

  // ---- 验证码登录 / 密码登录 切换 ----
  var authModeLabel = document.getElementById('authModeLabel');
  var modeSwitchBtn = document.getElementById('modeSwitchBtn');
  var codeModePanel = document.getElementById('codeModePanel');
  var pwdModePanel = document.getElementById('pwdModePanel');
  var isCodeMode = true;
  if(modeSwitchBtn){
    modeSwitchBtn.addEventListener('click', function(){
      isCodeMode = !isCodeMode;
      codeModePanel.hidden = !isCodeMode;
      pwdModePanel.hidden = isCodeMode;
      authModeLabel.textContent = isCodeMode ? '验证码登录' : '密码登录';
      modeSwitchBtn.textContent = isCodeMode ? '改用密码登录' : '改用验证码登录';
      (isCodeMode ? document.getElementById('codeInput') : document.getElementById('pwdInput')).focus();
    });
  }

  // ---- 密码显示/隐藏 ----
  var pwdInput = document.getElementById('pwdInput');
  var togglePwdBtn = document.getElementById('togglePwdVisible');
  if(togglePwdBtn && pwdInput){
    togglePwdBtn.addEventListener('click', function(){
      var showing = pwdInput.type === 'text';
      pwdInput.type = showing ? 'password' : 'text';
      togglePwdBtn.textContent = showing ? '显示' : '隐藏';
    });
  }

  // ---- 密码登录/注册：本机首次输入即创建账号，此后密码错误一律拒绝 ----
  var pwdHint = document.getElementById('pwdHint');
  var pwdSubmitBtn = document.getElementById('pwdSubmit');
  if(pwdSubmitBtn){
    pwdSubmitBtn.addEventListener('click', function(){
      var phone = document.getElementById('phoneInput').value.trim();
      var pwd = pwdInput.value;

      pwdHint.classList.remove('hint-warn');

      if(!/^1\d{10}$/.test(phone)){
        pwdHint.textContent = '请输入正确的11位手机号';
        pwdHint.classList.add('hint-warn');
        document.getElementById('phoneInput').focus();
        return;
      }
      if(pwd.length < 6){
        pwdHint.textContent = '密码至少6位';
        pwdHint.classList.add('hint-warn');
        pwdInput.focus();
        return;
      }

      pwdSubmitBtn.disabled = true;
      pwdHint.textContent = '正在校验…';

      var accounts = loadAccounts();
      var record = accounts[phone];

      if(!record){
        var salt = randomSalt();
        hashPassword(salt, pwd).then(function(hash){
          accounts[phone] = { salt: salt, hash: hash, createdAt: Date.now() };
          saveAccounts(accounts);
          pwdSubmitBtn.disabled = false;
          pwdHint.textContent = '';
          showDemoSuccess('.tab-panel[data-panel="sms"]', '已用这个手机号创建演示账号——下次用同一个密码登录，输错会被拒绝。', maskPhone(phone), phone);
        });
      } else {
        hashPassword(record.salt, pwd).then(function(hash){
          pwdSubmitBtn.disabled = false;
          if(hash === record.hash){
            pwdHint.textContent = '';
            showDemoSuccess('.tab-panel[data-panel="sms"]', '欢迎回来！密码校验通过。', maskPhone(phone), phone);
          } else {
            pwdHint.textContent = '密码错误，请重新输入';
            pwdHint.classList.add('hint-warn');
            pwdInput.value = '';
            pwdInput.focus();
          }
        });
      }
    });
    pwdInput.addEventListener('keydown', function(e){
      if(e.key === 'Enter') pwdSubmitBtn.click();
    });
  }

  var resetDemoAccountBtn = document.getElementById('resetDemoAccount');
  if(resetDemoAccountBtn){
    resetDemoAccountBtn.addEventListener('click', function(){
      var phone = document.getElementById('phoneInput').value.trim();
      var accounts = loadAccounts();
      if(phone && accounts[phone]){
        delete accounts[phone];
        saveAccounts(accounts);
        pwdHint.classList.remove('hint-warn');
        pwdHint.textContent = '已清除这个手机号的演示账号，可以重新设置密码了';
      } else {
        pwdHint.classList.remove('hint-warn');
        pwdHint.textContent = '这个手机号目前没有本机演示账号';
      }
    });
  }

  var smsSubmitBtn = document.getElementById('smsSubmit');
  if(smsSubmitBtn){
    smsSubmitBtn.addEventListener('click', function(){
      var phone = document.getElementById('phoneInput').value.trim();
      var code = document.getElementById('codeInput').value.trim();
      if(!/^1\d{10}$/.test(phone)){
        codeHint.textContent = '请输入正确的11位手机号';
        codeHint.classList.add('hint-warn');
        document.getElementById('phoneInput').focus();
        return;
      }
      if(!code){
        codeHint.textContent = '请输入验证码（演示验证码：123456）';
        codeHint.classList.add('hint-warn');
        document.getElementById('codeInput').focus();
        return;
      }
      showDemoSuccess('.tab-panel[data-panel="sms"]', null, maskPhone(phone), phone);
    });
  }
  var douyinBtn = document.getElementById('douyinBtn');
  if(douyinBtn){
    douyinBtn.addEventListener('click', function(){ showDemoSuccess('.tab-panel[data-panel="douyin"]', null, '抖音用户', 'douyin_guest'); });
  }
  } // end bindAuthFormHandlers

  bindAuthFormHandlers(); // 页面加载时先绑定一次

  // v64 extensions share the existing account store; setters keep original call sites wired.
  window.SY = {};
  Object.defineProperty(window.SY, 'getAcctData', { get: function(){ return getAcctData; }, set: function(v){ getAcctData = v; } });
  Object.defineProperty(window.SY, 'saveAcctData', { get: function(){ return saveAcctData; }, set: function(v){ saveAcctData = v; } });
  Object.defineProperty(window.SY, 'renderListView', { get: function(){ return renderListView; }, set: function(v){ renderListView = v; } });
  Object.defineProperty(window.SY, 'renderDayView', { get: function(){ return renderDayView; }, set: function(v){ renderDayView = v; } });
  Object.defineProperty(window.SY, 'renderMultiDayView', { get: function(){ return renderMultiDayView; }, set: function(v){ renderMultiDayView = v; } });
  Object.defineProperty(window.SY, 'renderMonthView', { get: function(){ return renderMonthView; }, set: function(v){ renderMonthView = v; } });
  Object.defineProperty(window.SY, 'renderInbox', { get: function(){ return renderInbox; }, set: function(v){ renderInbox = v; } });
  Object.defineProperty(window.SY, 'renderDailyTab', { get: function(){ return renderDailyTab; }, set: function(v){ renderDailyTab = v; } });
  Object.defineProperty(window.SY, 'refreshCurrentView', { get: function(){ return refreshCurrentView; }, set: function(v){ refreshCurrentView = v; } });
  Object.defineProperty(window.SY, 'renderSidebarCategoryList', { get: function(){ return renderSidebarCategoryList; }, set: function(v){ renderSidebarCategoryList = v; } });
  Object.defineProperty(window.SY, 'openTaskModal', { get: function(){ return openTaskModal; }, set: function(v){ openTaskModal = v; } });
  Object.defineProperty(window.SY, 'openCategoryManageModal', { get: function(){ return openCategoryManageModal; }, set: function(v){ openCategoryManageModal = v; } });
  Object.defineProperty(window.SY, 'openQuickCapture', { get: function(){ return openQuickCapture; }, set: function(v){ openQuickCapture = v; } });
  Object.defineProperty(window.SY, 'closeQuickCapture', { get: function(){ return closeQuickCapture; }, set: function(v){ closeQuickCapture = v; } });
  Object.defineProperty(window.SY, 'submitQuickCapture', { get: function(){ return submitQuickCapture; }, set: function(v){ submitQuickCapture = v; } });
  Object.defineProperty(window.SY, 'toggleTaskDone', { get: function(){ return toggleTaskDone; }, set: function(v){ toggleTaskDone = v; } });
  Object.defineProperty(window.SY, 'deleteTask', { get: function(){ return deleteTask; }, set: function(v){ deleteTask = v; } });
  Object.defineProperty(window.SY, 'openTaskNotesModal', { get: function(){ return openTaskNotesModal; }, set: function(v){ openTaskNotesModal = v; } });
  Object.defineProperty(window.SY, 'handleStartClick', { get: function(){ return handleStartClick; }, set: function(v){ handleStartClick = v; } });
  Object.defineProperty(window.SY, 'categoryColor', { get: function(){ return categoryColor; }, set: function(v){ categoryColor = v; } });
  Object.defineProperty(window.SY, 'todayKey', { get: function(){ return todayKey; }, set: function(v){ todayKey = v; } });
  Object.defineProperty(window.SY, 'addDaysKey', { get: function(){ return addDaysKey; }, set: function(v){ addDaysKey = v; } });
  Object.defineProperty(window.SY, 'fmtDateKey', { get: function(){ return fmtDateKey; }, set: function(v){ fmtDateKey = v; } });
  Object.defineProperty(window.SY, 'fmtClock', { get: function(){ return fmtClock; }, set: function(v){ fmtClock = v; } });
  Object.defineProperty(window.SY, 'escapeHtml', { get: function(){ return escapeHtml; }, set: function(v){ escapeHtml = v; } });
  Object.defineProperty(window.SY, 'uid', { get: function(){ return uid; }, set: function(v){ uid = v; } });
  Object.defineProperty(window.SY, 'backendCall', { get: function(){ return backendCall; }, set: function(v){ backendCall = v; } });
  Object.defineProperty(window.SY, 'backendProbe', { get: function(){ return backendProbe; }, set: function(v){ backendProbe = v; } });
  Object.defineProperty(window.SY, 'backendOn', { get: function(){ return backendOn; }, set: function(v){ backendOn = v; } });
  Object.defineProperty(window.SY, 'activeDailyTab', { get: function(){ return activeDailyTab; }, set: function(v){ activeDailyTab = v; } });
  Object.defineProperty(window.SY, 'dayViewDate', { get: function(){ return dayViewDate; }, set: function(v){ dayViewDate = v; } });
  Object.defineProperty(window.SY, 'computeDayTimeline', { get: function(){ return computeDayTimeline; }, set: function(v){ computeDayTimeline = v; } });
  Object.defineProperty(window.SY, 'openCategoryReceipt', { get: function(){ return openCategoryReceipt; }, set: function(v){ openCategoryReceipt = v; } });
  Object.defineProperty(window.SY, 'bindTaskListInteractions', { get: function(){ return bindTaskListInteractions; }, set: function(v){ bindTaskListInteractions = v; } });
  Object.defineProperty(window.SY, 'taskCardHtml', { get: function(){ return taskCardHtml; }, set: function(v){ taskCardHtml = v; } });
  Object.defineProperty(window.SY, 'enterApp', { get: function(){ return enterApp; }, set: function(v){ enterApp = v; } });
  Object.defineProperty(window.SY, 'exitApp', { get: function(){ return exitApp; }, set: function(v){ exitApp = v; } });
  Object.defineProperty(window.SY, 'renderKnowledgeView', { get: function(){ return renderKnowledgeView; }, set: function(v){ renderKnowledgeView = v; } });
  Object.defineProperty(window.SY, 'renderQuest', { get: function(){ return renderQuest; }, set: function(v){ renderQuest = v; } });
  Object.defineProperty(window.SY, 'openQuest', { get: function(){ return openQuest; }, set: function(v){ openQuest = v; } });
  Object.defineProperty(window.SY, 'renderConsoleHero', { get: function(){ return renderConsoleHero; }, set: function(v){ renderConsoleHero = v; } });
  Object.defineProperty(window.SY, 'renderProfileView', { get: function(){ return renderProfileView; }, set: function(v){ renderProfileView = v; } });
  Object.defineProperty(window.SY, 'switchAppView', { get: function(){ return switchAppView; }, set: function(v){ switchAppView = v; } });
  Object.defineProperty(window.SY, 'renderCategoryReceiptIfOpen', { get: function(){ return renderCategoryReceiptIfOpen; }, set: function(v){ renderCategoryReceiptIfOpen = v; } });
  Object.defineProperty(window.SY, 'updateCoinDisplay', { get: function(){ return updateCoinDisplay; }, set: function(v){ updateCoinDisplay = v; } });
  Object.defineProperty(window.SY, 'currentDisplayName', { get: function(){ return currentDisplayName; }, set: function(v){ currentDisplayName = v; } });
  Object.defineProperty(window.SY, 'currentAccountKey', { get: function(){ return currentAccountKey; }, set: function(v){ currentAccountKey = v; } });
  Object.defineProperty(window.SY, 'skillPanelHtml', { get: function(){ return skillPanelHtml; }, set: function(v){ skillPanelHtml = v; } });
  Object.defineProperty(window.SY, 'bindSkillPanel', { get: function(){ return bindSkillPanel; }, set: function(v){ bindSkillPanel = v; } });
  Object.defineProperty(window.SY, 'startTaskTimer', { get: function(){ return startTaskTimer; }, set: function(v){ startTaskTimer = v; } });
  Object.defineProperty(window.SY, 'stopCamWatch', { get: function(){ return stopCamWatch; }, set: function(v){ stopCamWatch = v; } });
  Object.defineProperty(window.SY, 'startCamWatch', { get: function(){ return startCamWatch; }, set: function(v){ startCamWatch = v; } });
  Object.defineProperty(window.SY, 'toggleCamWatch', { get: function(){ return toggleCamWatch; }, set: function(v){ toggleCamWatch = v; } });
  Object.defineProperty(window.SY, 'openPomoCheckin', { get: function(){ return openPomoCheckin; }, set: function(v){ openPomoCheckin = v; } });
  Object.defineProperty(window.SY, 'renderPomodoroView', { get: function(){ return renderPomodoroView; }, set: function(v){ renderPomodoroView = v; } });
  Object.defineProperty(window.SY, 'setCurrentStep', { get: function(){ return setCurrentStep; }, set: function(v){ setCurrentStep = v; } });
  Object.defineProperty(window.SY, 'logPomoProgress', { get: function(){ return logPomoProgress; }, set: function(v){ logPomoProgress = v; } });
  Object.defineProperty(window.SY, 'askStuckAI', { get: function(){ return askStuckAI; }, set: function(v){ askStuckAI = v; } });
  Object.defineProperty(window.SY, 'pauseTimerSession', { get: function(){ return pauseTimerSession; }, set: function(v){ pauseTimerSession = v; } });
  Object.defineProperty(window.SY, 'resumeTimerSession', { get: function(){ return resumeTimerSession; }, set: function(v){ resumeTimerSession = v; } });
  Object.defineProperty(window.SY, 'finishTimerSession', { get: function(){ return finishTimerSession; }, set: function(v){ finishTimerSession = v; } });
  Object.defineProperty(window.SY, 'closeQuest', { get: function(){ return closeQuest; }, set: function(v){ closeQuest = v; } });
  Object.defineProperty(window.SY, 'stopPomodoroTicker', { get: function(){ return stopPomodoroTicker; }, set: function(v){ stopPomodoroTicker = v; } });
  Object.defineProperty(window.SY, 'questTask', { get: function(){ return questTask; }, set: function(v){ questTask = v; } });
  Object.defineProperty(window.SY, 'getTaskSteps', { get: function(){ return getTaskSteps; }, set: function(v){ getTaskSteps = v; } });
  Object.defineProperty(window.SY, 'questDraft', { get: function(){ return questDraft; }, set: function(v){ questDraft = v; } });
  Object.defineProperty(window.SY, 'currentStepIndex', { get: function(){ return currentStepIndex; }, set: function(v){ currentStepIndex = v; } });
  Object.defineProperty(window.SY, 'loadAllAppData', { get: function(){ return loadAllAppData; }, set: function(v){ loadAllAppData = v; } });
  Object.defineProperty(window.SY, 'closeCategoryReceipt', { get: function(){ return closeCategoryReceipt; }, set: function(v){ closeCategoryReceipt = v; } });
  Object.defineProperty(window.SY, 'camWatchWidgetHtml', { get: function(){ return camWatchWidgetHtml; }, set: function(v){ camWatchWidgetHtml = v; } });
  Object.defineProperty(window.SY, 'camWatchSample', { get: function(){ return camWatchSample; }, set: function(v){ camWatchSample = v; } });
  Object.defineProperty(window.SY, 'skillStageToTask', { get: function(){ return skillStageToTask; }, set: function(v){ skillStageToTask = v; } });
  Object.defineProperty(window.SY, 'makeSteps', { get: function(){ return makeSteps; }, set: function(v){ makeSteps = v; } });
  Object.defineProperty(window.SY, 'sampleOn', { get: function(){ return sampleOn; }, set: function(v){ sampleOn = v; } });
  Object.defineProperty(window.SY, 'askClaudeJson', { get: function(){ return askClaudeJson; }, set: function(v){ askClaudeJson = v; } });
  Object.defineProperty(window.SY, 'pomoClearLeg', { get: function(){ return pomoClearLeg; }, set: function(v){ pomoClearLeg = v; } });
  Object.defineProperty(window.SY, 'pomoQuestStripHtml', { get: function(){ return pomoQuestStripHtml; }, set: function(v){ pomoQuestStripHtml = v; } });
  var coreSaveAcctData = saveAcctData;
  saveAcctData = function(data){ coreSaveAcctData(data); document.dispatchEvent(new CustomEvent('sy:data')); };

})();
