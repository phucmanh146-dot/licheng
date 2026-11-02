/* Coastal workspace: additive account fields; no third-party authentication. */
(function () {
  'use strict';
  var S = window.SY;
  if (!S) return;
  var E = function (v) { return S.escapeHtml(String(v == null ? '' : v)); };
  var el = function (id) { return document.getElementById(id); };
  var LOCAL_KEY = 'shangan_ya_local_workspace_v2';
  var kbQuery = '', kbCategory = '';
  var returnFocus = null, rewardTimer = null;
  var tagChoices = ['AI产品经理', 'Agent开发', '爆款文案', '自媒体·知识科普', '自媒体·校园生活', '自媒体·科技数码', '电影', '护肤', '国漫'];
  var iconPaths = {
    inbox: '<path d="M4 9 7 4h10l3 5v11H4Z"/><path d="M4 10h5l1 3h4l1-3h5"/>',
    list: '<path d="M7 8V3h10v5M7 17v4h10v-4M6 16H3V9h18v7h-3"/><path d="M7 14h10v7H7Z"/>',
    pomodoro: '<circle cx="12" cy="13" r="8"/><path d="M12 5V2m-3 0h6m-3 7v5l3 2"/>',
    stats: '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 16v-4m4 4V8m4 8v-6"/>',
    habits: '<path d="M5 3h13v18H5Z"/><circle cx="12" cy="10" r="3"/><path d="m9 16 2 2 4-4"/>',
    profile: '<rect x="3" y="5" width="18" height="15" rx="3"/><circle cx="9" cy="11" r="2"/><path d="M6 17c0-4 6-4 6 0m3-7h3m-3 4h3"/>',
    knowledge: '<path d="M4 4h7v17H4Zm9 0h7v17h-7M7 8h1m8 0h1M7 16h1m8 0h1"/>',
    peers: '<circle cx="8" cy="8" r="3"/><circle cx="18" cy="9" r="2"/><path d="M2 20v-3c0-6 12-6 12 0v3m2-6c4-1 6 2 6 5"/>',
    trophy: '<path d="M8 3h8v7a4 4 0 0 1-8 0Zm0 2H4v3c0 3 3 4 5 4m7-7h4v3c0 3-3 4-5 4m-3 2v6m-4 1h8"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6Z"/>',
    spark: '<path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8Z"/>'
  };
  function icon(name, cls) { return '<svg class="sy-icon ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (iconPaths[name] || iconPaths.compass) + '</svg>'; }
  function cat() { return '<svg class="sy-receipt-cat" viewBox="0 0 120 74" fill="none" aria-hidden="true"><path d="M32 28 29 5 48 19Q60 14 73 19L91 5 89 32Q101 44 90 59Q78 71 60 68Q38 71 28 56Q19 43 32 28Z" fill="currentColor"/><path d="m40 24-4-10 10 8m31 0 8-8-1 12" stroke="#eff1d7" stroke-width="2"/><path d="M41 41v6m36-6v6m-23 5 6 4 6-4m-6 4v5m-35-10-15-4m16 10-14 2m83-8 15-4m-16 10 14 2" stroke="#eff1d7" stroke-width="3" stroke-linecap="round"/></svg>'; }
  function person() {
    var a = S.getAcctData();
    return Object.assign({ nickname: S.currentDisplayName || '同学', status: '认真靠岸中', tags: [], bio: a.bio || '', avatar: '', receiptStyle: '温柔行动派' }, a.profile || {});
  }
  function avatarHtml(p) { return p.avatar && /^data:image\/(png|jpeg|webp);base64,/.test(p.avatar) ? '<img src="' + E(p.avatar) + '" alt="我的头像">' : '<span aria-hidden="true">' + E((p.nickname || '我').slice(0, 1)) + '</span>'; }
  function notify(message) {
    var n = el('syNotice');
    if (!n) { n = document.createElement('div'); n.id = 'syNotice'; n.className = 'sy-notice'; n.setAttribute('role', 'status'); document.body.appendChild(n); }
    n.textContent = message; n.hidden = false;
    clearTimeout(n._timer); n._timer = setTimeout(function () { n.hidden = true; }, 4200);
  }
  function wrap(name, after) {
    var old = S[name];
    if (typeof old !== 'function') return;
    S[name] = function () { var r = old.apply(this, arguments); after.apply(this, arguments); return r; };
  }
  function rememberWorkspace() {
    var p = person();
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ key: S.currentAccountKey, name: p.nickname })); } catch (_) { notify('浏览器存储已满，建议先到设置导出备份。'); }
  }
  function updateProfileChrome() {
    var p = person();
    var right = document.querySelector('#appHome .app-topbar-right');
    if (!right) return;
    var trigger = el('syProfileTrigger');
    if (!trigger) {
      trigger = document.createElement('button'); trigger.id = 'syProfileTrigger'; trigger.type = 'button'; trigger.className = 'sy-profile-trigger';
      trigger.setAttribute('aria-label', '打开个人资料与设置'); trigger.setAttribute('aria-haspopup', 'dialog'); right.appendChild(trigger);
      trigger.addEventListener('click', openProfile);
    }
    trigger.innerHTML = DOMPurify.sanitize('<span class="sy-avatar">' + avatarHtml(p) + '</span><span class="sy-profile-trigger-copy"><b>' + E(p.nickname) + '</b><small>' + E(p.status) + '</small></span>');
    if (el('appGreetingName')) el('appGreetingName').textContent = 'Hi，' + p.nickname;
    if (el('appGreetingTagline')) el('appGreetingTagline').textContent = '把很远的目标，过成今天的一小步。';
  }
  function openProfile() {
    returnFocus = document.activeElement;
    var p = person();
    var old = el('syProfileOverlay'); if (old) old.remove();
    var overlay = document.createElement('div'); overlay.id = 'syProfileOverlay'; overlay.className = 'sy-overlay';
    overlay.innerHTML = DOMPurify.sanitize('<section class="sy-profile-drawer" role="dialog" aria-modal="true" aria-labelledby="syProfileTitle"><header><div><p class="sy-kicker">SAILOR PASSPORT / 航行身份卡</p><h2 id="syProfileTitle">这就是现在的我</h2></div><button type="button" class="sy-close" data-sy-close aria-label="关闭个人资料">×</button></header>' +
      '<form id="syProfileForm"><label class="sy-avatar-edit"><span class="sy-avatar sy-avatar-large" id="syAvatarPreview">' + avatarHtml(p) + '</span><span>更换头像<small>选择设备照片 · JPG / PNG / WebP，2 MB 内</small></span><input id="syAvatarInput" type="file" accept="image/png,image/jpeg,image/webp"></label><p id="syAvatarError" class="sy-form-error" role="status"></p>' +
      '<label class="sy-field">我的昵称<input name="nickname" maxlength="30" required value="' + E(p.nickname) + '"></label>' +
      '<label class="sy-field">最近状态<input name="status" maxlength="50" placeholder="例如：今天专注打磨作品" value="' + E(p.status) + '"></label>' +
      '<div class="sy-status-presets">' + ['认真靠岸中', '先做五分钟', '补充能量中', '灵感营业中'].map(function (x) { return '<button type="button" data-sy-status="' + E(x) + '">' + E(x) + '</button>'; }).join('') + '</div>' +
      '<fieldset class="sy-tag-field"><legend>正在钻研 / 喜欢的事情</legend><div class="sy-tag-options">' + tagChoices.map(function (t) { return '<label><input type="checkbox" name="tag" value="' + E(t) + '"' + (p.tags.indexOf(t) >= 0 ? ' checked' : '') + '><span>' + icon(t.indexOf('AI') >= 0 || t.indexOf('Agent') >= 0 ? 'spark' : 'compass') + E(t) + '</span></label>'; }).join('') + '</div></fieldset>' +
      '<label class="sy-field">自定义方向（用逗号分隔）<input name="customTags" maxlength="140" placeholder="例如：自媒体·考研经验，智能体工作流" value="' + E(p.tags.filter(function (t) { return tagChoices.indexOf(t) < 0; }).join('，')) + '"></label>' +
      '<label class="sy-field">个人简介<textarea name="bio" maxlength="500" rows="3" placeholder="我在学习什么，希望遇见怎样的同行者…">' + E(p.bio) + '</textarea></label>' +
      '<label class="sy-field">我的小票宣言<select name="receiptStyle">' + ['温柔行动派', '好奇探索派', '稳稳推进派', '创意实验派'].map(function (s) { return '<option' + (p.receiptStyle === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select><small>由你自己选择，每天都可以改变。</small></label>' +
      '<footer><button type="button" class="btn btn-ghost" id="syOpenSettings">设置与数据备份</button><button type="submit" class="btn btn-primary">保存我的资料</button></footer></form></section>');
    document.body.appendChild(overlay);
    var avatar = p.avatar;
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.closest('[data-sy-close]')) closeProfile();
      var status = e.target.closest('[data-sy-status]'); if (status) overlay.querySelector('[name=status]').value = status.dataset.syStatus;
    });
    el('syAvatarInput').addEventListener('change', function (e) {
      var file = e.target.files[0]; if (!file) return;
      var error = el('syAvatarError');
      if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 2 * 1024 * 1024) { error.textContent = '请选择 2 MB 内的 JPG、PNG 或 WebP 图片。'; return; }
      var reader = new FileReader();
      reader.onload = function () { avatar = String(reader.result); el('syAvatarPreview').innerHTML = DOMPurify.sanitize(avatarHtml({ avatar: avatar })); error.textContent = ''; };
      reader.onerror = function () { error.textContent = '照片读取失败，请重新选择。'; };
      reader.readAsDataURL(file);
    });
    el('syOpenSettings').addEventListener('click', function () { closeProfile(); S.switchAppView('profile'); var settings = el('backendBaseInput'); if (settings) settings.scrollIntoView({ block: 'center' }); });
    el('syProfileForm').addEventListener('submit', function (e) {
      e.preventDefault(); var f = e.target, nickname = f.elements.nickname.value.trim(); if (!nickname) { f.elements.nickname.focus(); return; }
      var tags = Array.from(f.querySelectorAll('[name=tag]:checked')).map(function (i) { return i.value; }).concat(f.elements.customTags.value.split(/[,，]/).map(function (v) { return v.trim(); }).filter(Boolean));
      var a = S.getAcctData(); a.profile = { nickname: nickname, status: f.elements.status.value.trim() || '认真靠岸中', tags: Array.from(new Set(tags)).slice(0, 16), bio: f.elements.bio.value.trim(), avatar: avatar, receiptStyle: f.elements.receiptStyle.value };
      a.bio = a.profile.bio; S.saveAcctData(a); S.currentDisplayName = nickname; rememberWorkspace(); closeProfile(); S.refreshCurrentView(); updateProfileChrome(); notify('航行身份卡已保存。');
    });
    overlay.querySelector('[name=nickname]').focus();
  }
  function closeProfile() { var o = el('syProfileOverlay'); if (o) o.remove(); if (returnFocus && returnFocus.isConnected) returnFocus.focus(); }
  function decorateProfile() {
    var p = person(), box = document.querySelector('#profileBody .profile-summary-card');
    if (box) {
      box.classList.add('sy-passport');
      box.innerHTML = DOMPurify.sanitize('<button type="button" class="sy-avatar sy-avatar-large" id="syProfileEditAvatar" aria-label="编辑头像和个人资料">' + avatarHtml(p) + '</button><div class="profile-summary-info"><p class="sy-kicker">SAILOR PASSPORT</p><h1>' + E(p.nickname) + '</h1><p class="sy-passport-status">' + E(p.status) + '</p><p>' + E(p.bio || '写下你正在钻研的方向，留下自己的航行坐标。') + '</p><div class="sy-profile-tags">' + p.tags.map(function (t) { return '<span>' + E(t) + '</span>'; }).join('') + '</div></div><button type="button" class="btn btn-primary" id="syEditProfile">编辑资料</button>');
      el('syEditProfile').addEventListener('click', openProfile); el('syProfileEditAvatar').addEventListener('click', openProfile);
    }
    var body = el('profileBody');
    if (body) {
      var wall = document.createElement('section'); wall.className = 'sy-trophy-wall'; wall.innerHTML = DOMPurify.sanitize(rewardsHtml()); body.insertBefore(wall, box ? box.nextSibling : body.firstChild);
      body.querySelectorAll('.energy-card-hint').forEach(function (p) { if (p.textContent.indexOf('点"日"视图里的') >= 0) p.textContent = '在列表中选中任务并生成 AI 计划时，会自动预留任务间缓冲；手动调整时间依然由你决定。'; });
    }
    updateProfileChrome();
  }
  function renderDailyReceipt() {
    var host = el('dailySub'); if (!host) return;
    var old = el('syDailyReceipt'); if (old) old.remove();
    var a = S.getAcctData(), p = person(), day = S.dayViewDate || S.todayKey();
    var tasks = (a.tasks || []).filter(function (t) { return t.date === day; });
    var done = tasks.filter(function (t) { return t.done; }).length;
    var planned = tasks.reduce(function (sum, t) { return sum + (Number(t.plannedMinutes) || 0); }, 0);
    var card = document.createElement('section'); card.id = 'syDailyReceipt'; card.className = 'sy-daily-receipt';
    card.innerHTML = DOMPurify.sanitize('<div class="sy-receipt-banner"><span class="sy-kicker">DAILY SELF-RECEIPT</span>' + cat() + '<span class="sy-receipt-stamp">' + E(p.receiptStyle) + '</span></div><div class="sy-receipt-story"><p class="sy-kicker">' + E(day) + ' / ' + E(p.nickname) + '</p><h2>今天，也在一点点靠岸。</h2><p>' + E(p.status) + '</p><div class="sy-receipt-metrics"><span>航程 <b>' + tasks.length + '</b> 项</span><span>已抵达 <b>' + done + '</b></span><span>计划 <b>' + planned + '</b> 分钟</span></div><p class="sy-receipt-motto">不必一下子做完。先把下一步，认真过好。</p></div><div class="sy-receipt-mini"><b>今日通行凭证</b><span>' + E(p.receiptStyle) + '</span><div class="sy-barcode" aria-hidden="true"></div><button type="button" data-sy-edit-profile>换一句我的宣言 ↗</button></div>');
    host.parentNode.insertBefore(card, el('dailyTabs') || host);
    card.querySelector('[data-sy-edit-profile]').addEventListener('click', openProfile);
  }
  function decorateCategoryReceipt() {
    var paper = el('receiptPaper'); if (!paper) return;
    paper.classList.add('sy-category-receipt');
    var head = paper.querySelector('.receipt-head');
    if (head && !paper.querySelector('.sy-receipt-heading')) { var top = document.createElement('div'); top.className = 'sy-receipt-heading'; top.innerHTML = DOMPurify.sanitize('<p class="sy-kicker">MY LITTLE PROGRESS / PERSONAL RECEIPT</p>' + cat() + '<strong>把念头，兑成行动</strong>'); paper.insertBefore(top, head); }
  }
  function renderKnowledge() {
    var body = el('knowledgeBody'); if (!body) return;
    var a = S.getAcctData(), notes = (a.tasks || []).filter(function (t) { return !!(t.noteGain || t.noteKnowledge || t.noteRemark || t.noteFramework); }).concat(a.knowledgeSpecimens || []);
    body.innerHTML = DOMPurify.sanitize('<section class="sy-library-head"><div><p class="sy-kicker">TIDAL ARCHIVE / 潮汐标本馆</p><h1>把经过的浪，<br>留下自己的纹理。</h1><p>每一次做过、卡住、想通，都能收成一张可复用的知识小票。</p></div><div class="sy-library-object" aria-hidden="true"><i></i><i></i><i></i><span>' + icon('knowledge') + '</span></div></section>' +
      '<section class="sy-library-tools"><label class="sy-kb-search">' + icon('compass') + '<input id="syKnowledgeSearch" type="search" placeholder="找一个知识点、方法或关键词" value="' + E(kbQuery) + '"></label><select id="syKnowledgeCategory" aria-label="筛选知识类别"><option value="">全部标本 · ' + notes.length + '</option>' + Array.from(new Set(notes.map(function (t) { return t.category || '其他'; }))).map(function (c) { return '<option value="' + E(c) + '"' + (c === kbCategory ? ' selected' : '') + '>' + E(c) + '</option>'; }).join('') + '</select><button type="button" class="btn btn-primary" id="syNewSpecimen">收一张知识小票</button></section><div id="sySpecimenGrid" class="sy-specimen-grid"></div>' +
      '<section class="sy-route-workshop"><div class="sy-section-heading"><p class="sy-kicker">ROUTE WORKSHOP / 航线工坊</p><h2>让收藏，接着往前走</h2></div>' + (typeof S.skillPanelHtml === 'function' ? S.skillPanelHtml() : '') + '</section>');
    var visibleNotes=24,searchTimer=null;
    function paint() {
      var q = kbQuery.trim().toLowerCase();
      var shown = notes.filter(function (t) { return (!kbCategory || (t.category || '其他') === kbCategory) && (!q || [t.name, t.noteGain, t.noteKnowledge, t.noteRemark, t.noteFramework].join(' ').toLowerCase().indexOf(q) >= 0); });
      el('sySpecimenGrid').innerHTML = DOMPurify.sanitize(shown.length ? shown.slice(0,visibleNotes).map(function (t, i) {
        return '<article class="sy-specimen"><div class="sy-specimen-top"><span>SPECIMEN ' + String(i + 1).padStart(3, '0') + '</span><span>' + E(t.category || '其他') + '</span></div><h2>' + E(t.name) + '</h2>' +
          [['带走的收获', t.noteGain], ['能复用的知识', t.noteKnowledge], ['行动框架', t.noteFramework], ['留给下次的备注', t.noteRemark]].filter(function (row) { return !!row[1]; }).map(function (row) { return '<div class="sy-specimen-note"><b>' + row[0] + '</b><p>' + E(row[1]) + '</p></div>'; }).join('') +
          '<footer><button type="button" data-sy-note-edit="' + E(t.id) + '">编辑小票</button><button type="button" data-sy-note-copy="' + E(t.id) + '">查看 / 复制方法</button><button type="button" data-sy-note-revisit="' + E(t.id) + '">加入复习航程 ↗</button></footer></article>';
      }).join('') : '<div class="sy-archive-empty">' + cat() + '<h2>' + (q || kbCategory ? '这片海里还没找到它' : '第一张小票，留给今天的发现') + '</h2><p>' + (q || kbCategory ? '换一个关键词或类别再找找。' : '写下一条知识、一个方法，或这次踩过的坑。以后再遇见，就有自己的答案。') + '</p></div>');
      if(more)more.hidden=shown.length<=visibleNotes;
    }
    var more=document.createElement('button');more.type='button';more.className='mini-library-more';more.textContent='再看 24 张';el('sySpecimenGrid').parentNode.insertBefore(more,el('sySpecimenGrid').nextSibling);more.addEventListener('click',function(){visibleNotes+=24;paint();});
    paint();
    el('syKnowledgeSearch').addEventListener('input', function (e) { kbQuery = e.target.value; visibleNotes=24;clearTimeout(searchTimer);searchTimer=setTimeout(paint,160); });
    el('syKnowledgeCategory').addEventListener('change', function (e) { kbCategory = e.target.value; paint(); });
    el('syNewSpecimen').addEventListener('click', newSpecimen);
    body.addEventListener('click', knowledgeAction);
    if (typeof S.bindSkillPanel === 'function') S.bindSkillPanel(body);
  }
  async function knowledgeAction(e) {
    var b = e.target.closest('[data-sy-note-edit],[data-sy-note-copy],[data-sy-note-revisit]'); if (!b) return;
    var id = b.dataset.syNoteEdit || b.dataset.syNoteCopy || b.dataset.syNoteRevisit, a = S.getAcctData();
    var t = a.tasks.concat(a.knowledgeSpecimens || []).find(function (x) { return x.id === id; }); if (!t) return;
    if (b.dataset.syNoteEdit) { if (t.knowledgeOnly) newSpecimen(t); else S.openTaskNotesModal(id); return; }
    if (b.dataset.syNoteCopy) {
      var text = [t.name, t.noteGain, t.noteKnowledge, t.noteFramework, t.noteRemark].filter(Boolean).join('\n\n');
      window.SYMini.text('知识小票 · 手动复制',text); return;
    }
    var prior = a.tasks.find(function (x) { return x.reviewOf === id && x.date === S.todayKey() && !x.done; });
    if (prior) { notify('今天已经有这条复习任务了。'); return; }
    a.tasks.push({ id: S.uid(), name: '复习 · ' + t.name, category: t.category, date: S.todayKey(), estMinutes: 15, plannedMinutes: 15, multiplier: 1, firstTime: false, startMinutes: null, weight: 'light', done: false, createdAt: Date.now(), order: Math.max(0, ...a.tasks.map(function (x) { return Number(x.order) || 0; })) + 1, noteKnowledge: t.noteKnowledge || t.noteGain || t.noteRemark, noteFramework: t.noteFramework || '', reviewOf: id });
    S.saveAcctData(a); S.renderSidebarCategoryList(); notify('已加入今天的清单，留 15 分钟把它真正用一次。');
  }
  function newSpecimen(existing) {
    if (existing && !existing.knowledgeOnly) existing = null;
    var a = S.getAcctData();
    var overlay = document.createElement('div'); overlay.className = 'sy-overlay'; overlay.id = 'sySpecimenOverlay';
    overlay.innerHTML = DOMPurify.sanitize('<section class="sy-small-dialog" role="dialog" aria-modal="true" aria-labelledby="syNewSpecimenTitle"><button type="button" class="sy-close" data-sy-cancel aria-label="关闭">×</button><p class="sy-kicker">A LITTLE THING LEARNED</p><h2 id="syNewSpecimenTitle">' + (existing ? '再打磨这张知识小票' : '收一张知识小票') + '</h2><form><label class="sy-field">这次记住了什么<input name="syNoteTitle" maxlength="120" required placeholder="给这个发现取个名字" value="' + E(existing && existing.name || '') + '"></label><label class="sy-field">装进哪个抽屉<select name="category">' + a.categories.map(function (c) { return '<option' + (existing && existing.category === c.name ? ' selected' : '') + '>' + E(c.name) + '</option>'; }).join('') + '</select></label><label class="sy-field">知识 / 方法<textarea name="note" rows="6" required maxlength="16000" placeholder="解释清楚它，写下一次能用上的场景。">' + E(existing && existing.noteKnowledge || '') + '</textarea></label><button class="btn btn-primary" type="submit">存入标本馆</button></form></section>');
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay || e.target.closest('[data-sy-cancel]')) overlay.remove(); });
    overlay.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault(); var f = e.target; if (!f.elements.syNoteTitle.value.trim() || !f.elements.note.value.trim()) return;
      var acct = S.getAcctData(); if (!acct.knowledgeSpecimens) acct.knowledgeSpecimens = [];
      var record = { id: existing ? existing.id : S.uid(), name: f.elements.syNoteTitle.value.trim(), category: f.elements.category.value, date: S.todayKey(), createdAt: existing ? existing.createdAt : Date.now(), updatedAt: Date.now(), noteKnowledge: f.elements.note.value.trim(), knowledgeOnly: true };
      var found = acct.knowledgeSpecimens.findIndex(function (x) { return x.id === record.id; });
      if (found >= 0) acct.knowledgeSpecimens[found] = record; else acct.knowledgeSpecimens.push(record);
      S.saveAcctData(acct); overlay.remove(); renderKnowledge(); notify('知识小票已入馆。');
    });
    overlay.querySelector('[name=syNoteTitle]').focus();
  }
  function rewardKey(task, step, index) { return task.id + ':' + (step ? 'step:' + (step.id || index + ':' + step.text) : 'task'); }
  function grantReward(task, step, index, popup) {
    if (!task || task.knowledgeOnly) return;
    var a = S.getAcctData(); if (!a.virtualRewards) a.virtualRewards = {};
    var key = rewardKey(task, step, index); if (a.virtualRewards[key]) return;
    var heavy = task.weight === 'heavy' || Number(task.plannedMinutes) >= 90;
    a.virtualRewards[key] = { taskId: task.id, stepId: step ? (step.id || null) : null, stepIndex: step ? index : null, kind: step ? 'pearl' : heavy ? 'lighthouse' : 'island', title: step ? '又亮起一颗航标' : heavy ? '攻克难关 · 灯塔' : '抵达一座小岛', taskName: task.name, at: Date.now() };
    S.saveAcctData(a);
    if (popup) showReward(a.virtualRewards[key]);
  }
  function rewardActive(r, a) {
    var t = a.tasks.find(function (x) { return x.id === r.taskId; }); if (!t) return false;
    if (r.stepIndex == null) return !!t.done;
    var steps = typeof S.getTaskSteps === 'function' ? S.getTaskSteps(t) : t.steps || [];
    var step = r.stepId ? steps.find(function (x) { return x.id === r.stepId; }) : steps[r.stepIndex]; return !!(step && step.done && !step.skipped);
  }
  function trophy(kind) { return '<span class="sy-trophy-object sy-trophy-' + kind + '" aria-hidden="true"><i></i><b></b><em></em><span></span></span>'; }
  function rewardsHtml() {
    var a = S.getAcctData(), rewards = Object.values(a.virtualRewards || {}).filter(function (r) { return rewardActive(r, a); }).sort(function (x, y) { return y.at - x.at; });
    return '<div class="sy-section-heading"><p class="sy-kicker">LITTLE VICTORIES / 岸边收藏柜</p><h2>每一小关，都值得被看见</h2><p>完成的小关留下珍珠，完成航程留下小岛，攻克重任务点亮灯塔。</p></div><div class="sy-trophy-grid">' + (rewards.length ? rewards.slice(0, 12).map(function (r) { return '<article>' + trophy(r.kind) + '<b>' + E(r.title) + '</b><small>' + E(r.taskName) + '</small></article>'; }).join('') : '<div class="sy-trophy-empty">' + trophy('lighthouse') + '<p>下一件做完的事，就是第一件藏品。</p></div>') + '</div>';
  }
  function showReward(r) {
    var old = el('syRewardToast'); if (old) old.remove();
    var box = document.createElement('aside'); box.id = 'syRewardToast'; box.className = 'sy-reward-toast'; box.setAttribute('role', 'status');
    box.innerHTML = DOMPurify.sanitize(trophy(r.kind) + '<div><p class="sy-kicker">靠岸奖励 · 已收入收藏柜</p><h3>' + E(r.title) + '</h3><p>' + (r.kind === 'lighthouse' ? '难的事情，你已经真的往前推了一大步。' : '这一步是你做出来的，先为自己停留一秒。') + '</p></div><button type="button" class="sy-close" aria-label="收起奖励">×</button>');
    box.querySelector('button').addEventListener('click', function () { box.remove(); }); document.body.appendChild(box);
    clearTimeout(rewardTimer); rewardTimer = setTimeout(function () { box.remove(); }, 6500);
  }
  function decorateQuest() {
    var body = el('questBody'), task = typeof S.questTask === 'function' ? S.questTask() : null;
    if (!body || !task || S.questDraft) return;
    var steps = typeof S.getTaskSteps === 'function' ? S.getTaskSteps(task) : task.steps || [];
    var map = body.querySelector('.quest-map'); if (!map || !steps.length) return;
    var idx = steps.findIndex(function (s) { return !s.done; });
    map.className = 'sy-voyage-scene';
    map.innerHTML = DOMPurify.sanitize('<div class="sy-voyage-sky" aria-hidden="true"><i></i><b></b><span></span></div><p class="sy-kicker">ISLAND BY ISLAND / 一关，一座岛</p><ol class="sy-island-route">' + steps.map(function (s, i) {
      return '<li class="sy-island-stop ' + (s.done ? s.skipped ? 'is-skipped' : 'is-done' : i === idx ? 'is-current' : '') + '"><span class="sy-island-platform" aria-hidden="true"><i></i><b>' + (s.done && !s.skipped ? '✓' : i + 1) + '</b></span><span class="sy-island-label"><strong>' + (s.done ? s.skipped ? '留待回访' : '已点亮' : i === idx ? '现在，走这一小步' : '前方岛屿') + '</strong><small>' + E(s.text) + '</small></span></li>';
    }).join('') + '</ol><div class="sy-route-horizon" aria-hidden="true"></div>');
    var next = body.querySelector('.quest-now'); if (next) next.insertAdjacentHTML('beforeend', DOMPurify.sanitize('<p class="sy-route-encouragement">遇到困难可以先求助。完成这一小关，再决定下一步。</p>'));
    var title = el('questTitle'); if (title) title.textContent = task.name + ' · 靠岸航线';
  }
  function decorateConsole() {
    var hero = el('lcHero'); if (!hero) return;
    hero.classList.add('sy-coastal-console');
    if (!hero.querySelector('.sy-console-heading')) { var h = document.createElement('header'); h.className = 'sy-console-heading'; h.innerHTML = DOMPurify.sanitize('<div><p class="sy-kicker">A SMALL HARBOR FOR YOUR BIG PLANS</p><h2>上岸导航台<span>让目标有地方停靠。</span></h2></div><span class="sy-weather-pill"><i></i>今天，适合启程</span>'); hero.insertBefore(h, hero.firstChild); }
    hero.querySelectorAll('[data-lc]').forEach(function (b) { var img = b.querySelector('.lc-object-icon'); if (img) img.innerHTML = DOMPurify.sanitize(icon(b.dataset.lc)); });
    hero.querySelectorAll('.lc-orbit-token').forEach(function (token, i) { token.innerHTML = DOMPurify.sanitize(icon(['inbox', 'list', 'pomodoro', 'stats', 'habits', 'profile'][i])); });
    var cabinet = hero.querySelector('.lc-cabinet-grid');
    if (cabinet && !cabinet.dataset.syReady) {
      cabinet.dataset.syReady = 'true';
      cabinet.innerHTML = DOMPurify.sanitize('<button class="lc-cabinet-item is-unlocked" type="button" data-sy-view="shop"><span class="lc-cabinet-icon">' + icon('inbox') + '</span><b>岸边补给站</b><small>用努力换一份小礼物</small><em>金币商城 ↗</em></button><button class="lc-cabinet-item is-unlocked" type="button" data-action="sy-peers"><span class="lc-cabinet-icon">' + icon('peers') + '</span><b>同行者港口</b><small>找到同频的学习伙伴</small><em>附近 / 组队 ↗</em></button><button class="lc-cabinet-item is-unlocked" type="button" data-sy-view="knowledge"><span class="lc-cabinet-icon">' + icon('knowledge') + '</span><b>潮汐标本馆</b><small>收藏每次想通的瞬间</small><em>知识 / 航线 ↗</em></button><button class="lc-cabinet-item is-unlocked" type="button" data-sy-view="profile"><span class="lc-cabinet-icon">' + icon('trophy') + '</span><b>岸边收藏柜</b><small>那些真的做到了的事</small><em>成就 / 资料 ↗</em></button>');
      cabinet.addEventListener('click', function (e) { var v = e.target.closest('[data-sy-view]'); if (v) S.switchAppView(v.dataset.syView); var peers = e.target.closest('[data-action=sy-peers]'); if (peers) document.dispatchEvent(new CustomEvent('sy:peers')); });
      var title = hero.querySelector('.lc-cabinet-title'); if (title) title.innerHTML = DOMPurify.sanitize('我的港口 <span>从一件小事，到一个更大的世界</span>');
    }
    renderDailyReceipt(); updateProfileChrome();
  }
  function setupLocalEntry() {
    var overlay = el('loginOverlay'); if (!overlay) return;
    function open() {
      var all = typeof S.loadAllAppData === 'function' ? S.loadAllAppData() : (function () { try { return JSON.parse(localStorage.getItem('shangan_ya_app_data_v1') || '{}'); } catch (_) { return {}; } })();
      var keys = Object.keys(all); if (!keys.length) keys.push('guest');
      overlay.innerHTML = DOMPurify.sanitize('<section class="modal-card sy-local-entry" role="dialog" aria-modal="true" aria-labelledby="syLocalTitle"><button type="button" class="sy-close" id="syCloseLocal" aria-label="关闭">×</button><p class="sy-kicker">YOUR OWN LITTLE HARBOR</p>' + cat() + '<h2 id="syLocalTitle">回到自己的航行空间</h2><p>从这里接着走，计划和收藏保存在当前浏览器。</p><form id="syLocalEntryForm"><label class="sy-field">本机已有空间<select name="workspace">' + keys.map(function (key, i) { var p = all[key] && all[key].profile; return '<option value="' + E(key) + '">' + E(p && p.nickname || (key === 'guest' ? '我的本机空间' : '已有空间 ' + (i + 1) + (/^1\d{10}$/.test(key) ? ' · 尾号 ' + key.slice(-4) : ''))) + ' · ' + ((all[key] && all[key].tasks || []).length) + ' 条记录</option>'; }).join('') + '</select></label><label class="sy-field">怎么称呼你<input name="nickname" maxlength="30" placeholder="我的昵称"></label><button type="submit" class="btn btn-primary">进入我的空间 →</button><small>不需要手机号、验证码或第三方登录。可在设置中导入旧数据、导出备份。</small></form></section>');
      overlay.hidden = false;
      el('syCloseLocal').addEventListener('click', function () { overlay.hidden = true; });
      el('syLocalEntryForm').addEventListener('submit', function (e) { e.preventDefault(); var f = e.target, key = f.elements.workspace.value; var prior = all[key] && all[key].profile; var name = f.elements.nickname.value.trim() || prior && prior.nickname || '同学'; overlay.hidden = true; S.enterApp(name, key); var a = S.getAcctData(); if (!a.profile) a.profile = {}; a.profile.nickname = name; S.saveAcctData(a); rememberWorkspace(); S.refreshCurrentView(); updateProfileChrome(); });
      overlay.querySelector('input').focus();
    }
    overlay.innerHTML = DOMPurify.sanitize(''); overlay.hidden = true;
    document.addEventListener('click', function (e) { var t = e.target.closest('[data-open-login]'); if (t) { e.preventDefault(); e.stopImmediatePropagation(); open(); } }, true);
    document.querySelectorAll('[data-open-login]').forEach(function (b) { b.textContent = '进入我的空间'; });
    var exit = el('exitAppBtn'); if (exit) { exit.textContent = '离开本机空间'; exit.addEventListener('click', function () { try { localStorage.removeItem(LOCAL_KEY); } catch (_) {} }); }
    document.addEventListener('keydown', function (e) {
      var profile = el('syProfileOverlay'), specimen = el('sySpecimenOverlay');
      if (e.key === 'Escape' && (profile || specimen || !overlay.hidden)) { e.stopImmediatePropagation(); if (profile) closeProfile(); else if (specimen) specimen.remove(); else overlay.hidden = true; }
      var activeDialog = profile || specimen;
      if (e.key === 'Tab' && activeDialog) { var focus = Array.from(activeDialog.querySelectorAll('button,input,textarea,select,[tabindex="0"]')).filter(function (x) { return !x.disabled; }); if (!focus.length) return; var first = focus[0], last = focus[focus.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
    }, true);
    try { var saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); if (saved && saved.key) S.enterApp(saved.name || '同学', saved.key); } catch (_) {}
  }
  S.renderKnowledgeView = renderKnowledge;
  wrap('renderConsoleHero', decorateConsole);
  wrap('renderProfileView', decorateProfile);
  wrap('renderQuest', decorateQuest);
  wrap('openCategoryReceipt', decorateCategoryReceipt);
  wrap('renderCategoryReceiptIfOpen', decorateCategoryReceipt);
  var oldToggle = S.toggleTaskDone;
  S.toggleTaskDone = function (id) {
    var before = S.getAcctData().tasks.find(function (t) { return t.id === id; }), wasDone = before && before.done;
    var result = oldToggle.apply(this, arguments);
    var after = S.getAcctData().tasks.find(function (t) { return t.id === id; });
    if (after && !wasDone && after.done) grantReward(after, null, null, true);
    return result;
  };
  document.addEventListener('click', function (e) {
    var pass = e.target.closest('[data-qact="pass"]');
    if (pass && typeof S.questTask === 'function') {
      var before = S.questTask(); if (!before) return;
      var beforeDone = S.getTaskSteps(before).map(function (step) { return !!step.done; });
      queueMicrotask(function () {
        var task = S.questTask(); if (!task || task.id !== before.id) return;
        S.getTaskSteps(task).forEach(function (step, i) { if (!beforeDone[i] && step.done && !step.skipped) grantReward(task, step, i, true); });
      });
    }
  }, true);
  document.body.classList.add('sy-experience');
  document.querySelectorAll('.app-nav-item').forEach(function (b) { var copy = b.querySelector('span:last-child'); var aliases = { knowledge: '潮汐标本馆', pomodoro: '专注驾驶舱', habits: '上岸护照', stats: '航行黑匣子', profile: '航行身份卡', inbox: '抵达收集箱', deadlines: '截止雷达' }; if (copy && aliases[b.dataset.view]) copy.textContent = aliases[b.dataset.view]; });
  if (el('quickCaptureBtn')) el('quickCaptureBtn').innerHTML = DOMPurify.sanitize(icon('inbox') + '<span>随手投递</span><kbd>Alt + N</kbd>');
  setupLocalEntry();
  window.SYExperience = { openProfile: openProfile, notify: notify, grantReward: grantReward, renderKnowledge: renderKnowledge, decorateConsole: decorateConsole };
})();
