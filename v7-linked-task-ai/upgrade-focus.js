(function () {
  'use strict';
  var SY, installed = false, original = {}, mediaEpoch = 0;
  var state = { camera: null, screen: null, screenVideo: null, cameraPending: false, screenPending: false, screenBusy: false, taskId: null, voice: false, reminders: false, timer: null, note: '', dialog: null, lastFocus: null, location: null, intervalMinutes: 5, nextCheckAt: 0, visualWatch: false, nextWatchAt: 0, observing: false, firm: false, entered: false };
  var esc = function (value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (x) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]; }); };
  function acct() { return SY.getAcctData(); }
  function activeTask() { var a = acct(); return (a.tasks || []).find(function (t) { return a.activeTimer && t.id === a.activeTimer.taskId; }); }
  function status(value) {
    var a = acct(), t = activeTask();
    a.focusSupport = { taskId: t ? t.id : state.taskId, status: value, updatedAt: Date.now(), source: 'self-report' };
    SY.saveAcctData(a);
    document.dispatchEvent(new CustomEvent('sy:focus-state', { detail: a.focusSupport }));
  }
  function isBlocked(taskId) { var f = acct().focusSupport; return !!(f && f.taskId === taskId && ['away', 'break', 'awaiting', 'stuck'].includes(f.status)); }
  function speak(message){
    state.note=message;
    if (state.voice && window.speechSynthesis && window.SpeechSynthesisUtterance) {
      speechSynthesis.cancel(); var speech = new SpeechSynthesisUtterance(message);
      speech.lang = 'zh-CN'; speech.rate = 1.04; speech.volume = 1; speechSynthesis.speak(speech);
    }
  }
  function release(stream) { if (stream) stream.getTracks().forEach(function (track) { track.stop(); }); }
  function stop() {
    mediaEpoch++; release(state.camera); release(state.screen);
    state.camera = null; state.screen = null; state.screenVideo = null;
    clearInterval(state.timer); state.timer = null;
    if (window.speechSynthesis) speechSynthesis.cancel();
    renderPanel();
  }
  function closeDialog() {
    var dialog = state.dialog; state.dialog = null;
    if (dialog) { if(typeof dialog.close==='function')dialog.close();dialog.remove(); }
    if (state.lastFocus && state.lastFocus.isConnected) state.lastFocus.focus();
  }
  function modal(title, body) {
    closeDialog(); state.lastFocus = document.activeElement;
    var d = document.createElement('dialog'); d.className = 'sy-support-dialog';
    d.innerHTML = DOMPurify.sanitize('<header><div><span class="sy-eyebrow">上岸补给站</span><h2>' + esc(title) + '</h2></div><button type="button" data-support="close" aria-label="关闭">×</button></header><div class="sy-dialog-body">' + body + '</div>');
    document.body.appendChild(d); state.dialog = d;
    d.addEventListener('cancel', function () { setTimeout(function () { if (!d.open) { d.remove(); if (state.dialog === d) state.dialog = null; } }, 0); });
    d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');if(typeof d.showModal==='function')d.showModal();else{d.setAttribute('open','');d.classList.add('mini-fallback-dialog');}return d;
  }
  function feedback(message) {
    state.note = message; renderPanel();
    document.querySelectorAll('[data-support-message]').forEach(function (node) { node.textContent = message; });
  }
  function pauseHere() {
    var a = acct(), at = a.activeTimer;
    if (at && at.runningSince) { at.accumulatedMs = (at.accumulatedMs || 0) + Date.now() - at.runningSince; at.runningSince = null; SY.saveAcctData(a); }
  }
  function resume() {
    status('ready'); closeDialog(); state.nextCheckAt = Date.now() + state.intervalMinutes * 60000; original.resumeTimerSession(); armReminder(); renderPanel();
  }
  async function cameraOn() {
    if (state.camera || state.cameraPending) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { feedback('当前环境无法使用摄像头。请在 HTTPS 或本机地址中打开，也可以继续使用手动签到。'); return; }
    var epoch = mediaEpoch; state.cameraPending = true;
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 480 }, height: { ideal: 360 } }, audio: false });
      if (epoch !== mediaEpoch) { release(stream); return; }
      state.camera = stream; state.note = '摄像头已开启。默认只在本机显示；只有勾选 AI 画面检查，才会定时发送单帧。';
      stream.getTracks().forEach(function (track) { track.addEventListener('ended', function () { if (state.camera === stream) { state.camera = null; renderPanel(); } }); });
      renderPanel();
    } catch (error) { feedback(error.name === 'NotAllowedError' ? '摄像头权限未开启。可在浏览器地址栏修改权限后重试，或直接用手动签到。' : '摄像头未能连接，请检查是否被其他应用占用后重试。'); }
    finally { state.cameraPending = false; }
  }
  function screenOn(){ feedback('小工具不支持屏幕共享。可以在卡点中写下问题，回到完整版再查资料。'); }
  function sendScreen(){ screenOn(); }
  function panelHtml() {
    var t = activeTask(), blocked = t && isBlocked(t.id);
    return '<section class="sy-focus-card" data-sy-focus><div class="sy-focus-heading"><span class="sy-orbit-icon">◎</span><div><h3>专注陪伴</h3><p>' + (blocked ? '已暂停 · 准备好后由你继续' : '按你的状态调整提醒和帮助') + '</p></div></div>' +
      (state.camera ? '<video data-sy-camera autoplay muted playsinline aria-label="仅本机摄像头预览"></video>' : '') +
      '<p class="sy-focus-note sy-focus-lead">你说明状态，我调整陪跑。表情和拿手机都不等于不认真。</p><div class="sy-support-actions">' +
      '<button type="button" class="sy-primary" data-support="stuck">卡住了 · 问 AI</button><button type="button" data-support="checkin">状态签到</button><button type="button" data-support="camera">' + (state.camera ? '关闭摄像头' : '开启本机自览') + '</button>' +
      (state.screen ? '<button type="button" data-support="frame">发送这一帧求助</button>' : '') + '</div>' +
      '<div class="sy-switch-list">' +
      '<label class="sy-check"><input type="checkbox" data-support-reminders' + (state.reminders ? ' checked' : '') + '><span>状态提醒 · 当前每 ' + state.intervalMinutes + ' 分钟</span></label>' +
      '<label class="sy-check"><input type="checkbox" data-support-voice' + (state.voice ? ' checked' : '') + '><span>语音提醒</span><button type="button" data-support="voice-test">试听</button></label>' +
      '<label class="sy-check"><input type="checkbox" data-support-firm'+(state.firm?' checked':'')+'><span>进入状态后，走神时用简短明确的提醒</span></label>' +
      '<div class="sy-check-group"><label class="sy-check"><input type="checkbox" data-support-observe' + (state.visualWatch ? ' checked' : '') + '><span>AI 画面检查 · 每 5 分钟发送一帧</span></label>' +
      '<p class="sy-focus-note">需支持看图的已配置 AI。只询问“是否有人 / 是否有手机”，由你确认用途；不判断情绪或态度。</p></div>' +
      '</div>' +
      (blocked ? '<button type="button" class="sy-primary" data-support="resume">我准备好了，继续</button>' : '') +
      '<p role="status" data-support-message>' + esc(state.note) + '</p></section>';
  }
  function renderPanel() {
    var old = document.querySelector('[data-sy-focus]');
    if (!old) return;
    old.outerHTML = DOMPurify.sanitize(panelHtml());
    var video = document.querySelector('[data-sy-camera]');
    if (video && state.camera) { video.srcObject = state.camera; video.play().catch(function () {}); }
  }
  function refreshLegCopy() {
    var tip = document.querySelector('.pq-tip'); if (tip) tip.textContent = '按自己的节奏开始。做完后记一句收获，由你确认完成这一关。';
    var proof = document.querySelector('.pq-proof-q'); if (proof) proof.textContent = '记录这一关做了什么、有哪些收获，方便回来时接着做。';
    var submit = document.getElementById('pqProofSubmit'); if (submit) submit.textContent = '记录收获 · 完成这一关';
    var live = document.getElementById('pomoLegLive'); if (live) live.textContent = isBlocked((activeTask() || {}).id) ? '已暂停 · 关卡成果保留' : '正在推进 · 完成后由你确认，不依据摄像头判定';
  }
  function armReminder() {
    clearInterval(state.timer); state.timer = null;
    if (!state.reminders && !state.visualWatch) return;
    if (!state.nextCheckAt) state.nextCheckAt = Date.now() + state.intervalMinutes * 60000;
    state.timer = setInterval(function () {
      var at = acct().activeTimer;
      if (!at || !at.runningSince || document.hidden || document.querySelector('dialog[open]')) return;
      if (state.visualWatch && state.camera && Date.now() >= state.nextWatchAt) observeFrame();
      else if (state.reminders && Date.now() >= state.nextCheckAt) openCheckin('timer');
    }, 10000);
  }
  async function observeFrame() {
    if (!state.camera || state.observing) return;
    var video = document.querySelector('[data-sy-camera]'); if (!video || !video.videoWidth) return;
    var canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = Math.round(480 * video.videoHeight / video.videoWidth);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    state.observing = true; state.nextWatchAt = Date.now() + 300000;
    var epoch = mediaEpoch, task = activeTask();
    try {
      var r = await SY.backendCall('/api/focus-observe', { image: canvas.toDataURL('image/jpeg', 0.65) }, 70000);
      if (epoch !== mediaEpoch || !state.visualWatch || !state.camera || !task || !activeTask() || activeTask().id !== task.id) return;
      if (!r.ok) { state.visualWatch = false; feedback((r.error || 'AI 画面检查未连接') + '。定时签到仍可使用。'); return; }
      if (r.data && !r.data.uncertain && (r.data.phoneVisible || r.data.personPresent === false) && !document.querySelector('dialog[open]')) openCheckin('camera');
      else if (state.reminders && Date.now() >= state.nextCheckAt && !document.querySelector('dialog[open]')) openCheckin('timer');
    } finally { state.observing = false; }
  }
  function openStart(taskId, mode) {
    var t = (acct().tasks || []).find(function (task) { return task.id === taskId; }); if (!t || t.done) return;
    var d = modal('出发前，现在是什么状态？', '<p class="sy-dialog-lead">' + esc(t.name) + '</p><label class="sy-field">按你现在的感觉选<select name="mood"><option value="ready">准备好了 · 从 5 分钟开始</option><option value="focus">已经进入状态 · 30 分钟后再问</option><option value="stuck">卡住了 · 先帮我解决问题</option><option value="tired">有些疲惫 · 只做一个小步骤</option></select></label><label class="sy-check"><input type="checkbox" name="camera">摄像头自览，默认只在本机显示</label><label class="sy-check"><input type="checkbox" name="voice">开启语音提醒</label><label class="sy-check"><input type="checkbox" name="reminders" checked>根据我确认的状态调整提醒</label><div class="sy-support-actions"><button type="button" class="sy-primary" data-begin>开始这一关</button><button type="button" data-support="close">先等等</button></div>');
    d.querySelector('[data-begin]').addEventListener('click', function () {
      var camera = d.querySelector('[name="camera"]').checked, voice = d.querySelector('[name="voice"]').checked, reminders = d.querySelector('[name="reminders"]').checked, mood = d.querySelector('[name="mood"]').value;
      stop(); state.taskId = taskId; state.entered=mood==='focus'; state.voice = voice; state.reminders = reminders; state.note = ''; state.intervalMinutes = mood === 'focus' ? 30 : 5; state.nextCheckAt = Date.now() + state.intervalMinutes * 60000; state.nextWatchAt = Date.now() + 300000;
      closeDialog(); original.startTaskTimer(taskId, mode); status('ready'); armReminder(); if (camera) cameraOn(); renderPanel();
      if (mood === 'stuck') showHelp();
    });
  }
  function completedToday() {
    var a = acct(), ids = new Set();
    (a.durationLog || []).forEach(function (r) { if (r.completed && r.loggedAt && new Date(r.loggedAt).toDateString() === new Date().toDateString()) ids.add(r.taskId); });
    (a.tasks || []).forEach(function (t) { if (t.done && t.completedAt && new Date(t.completedAt).toDateString() === new Date().toDateString()) ids.add(t.id); });
    return ids.size;
  }
  function openCheckin(reason) {
    var t = activeTask(); if (!t) { feedback('开始一项任务后，就能在这里签到和求助。'); return; }
    pauseHere(); status('awaiting');
    var d = modal(reason === 'camera' ? '确认一下，你现在在做什么？' : '这一步进展怎么样？', '<p class="sy-dialog-lead">当前主线：' + esc(t.name) + '</p><p>先暂停一下计时。你点的状态决定接下来怎么陪你。</p><div class="sy-checkin-grid"><button data-support="research">🔎 查资料</button><button data-support="study">📖 正在学习</button><button data-support="wandering">🌫 有点走神</button><button data-support="distracted">📱 看娱乐 · 带我回来</button><button data-support="false-positive">✓ 检测有误</button><button data-support="stuck">🛟 卡住了 · 问 AI</button><button data-support="tired">☕ 需要休息</button></div><p class="sy-focus-note">误报不扣分。查资料、学习或误报后，普通提醒延长到 30 分钟。</p>');
    d.classList.add('sy-captain-check'); state.nextCheckAt = Date.now() + state.intervalMinutes * 60000;
    speak('这一步做到哪里了？你在学习、查资料，还是需要帮忙？'); renderPanel();
  }
  function fatigue() {
    var done = completedToday(); status('break');
    modal('先休息一下', '<p>' + (done > 2 ? '今天已经完成 ' + done + ' 项任务，给自己两分钟恢复一下。' : '先把整件事放小一点。准备好后只做 5 分钟；需要休息也可以先休息。') + '</p><div class="sy-movement"><strong>两分钟轻活动</strong><p>按自己的舒适程度站起来慢走、放松肩膀、望向远处；不舒服就停止。</p><p>这不是医疗建议，不做强度训练，也不强迫完成。</p></div><div class="sy-support-actions"><button data-support="resume">准备好了 · 先做 5 分钟</button><button data-support="break">继续休息</button></div><div data-support-results role="status"></div>');
    speak(done > 2 ? '你已经做了不少，起来活动两分钟，回来接着走。' : '不用一口气全做完。准备好后只开始五分钟，先迈出这一小步。');
  }
  function showHelp(){
    pauseHere(); status('stuck'); closeDialog(); renderPanel();
    if (window.SYRescue) window.SYRescue.open({ task: activeTask(), onResume: resume });
    else feedback('求助组件没有加载，请刷新页面后重试。');
  }
  function safeUrl(url) { try { var u = new URL(url); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch (_) { return ''; } }
  function sourcesHtml(){return ''; }
  function help(){ showHelp(); }
  function movementSearch(){feedback('可以按自己的舒适程度休息，准备好再继续。离线版不提供在线运动指导。'); }
  function profile() {
    var a = acct(), p = a.profile || a.userProfile || {};
    return { nickname: p.nickname || a.nickname || '同学', bio: p.bio || '', skills: p.skills || p.tags || [], status: p.status || '一起学习' };
  }
  function presenceKey() { return 'shanganya:presence:' + String(SY.currentAccountKey || 'guest'); }
  function readPresence() { try { return JSON.parse(localStorage.getItem(presenceKey()) || 'null'); } catch (_) { return null; } }
  function savePresence(value) { if (value) localStorage.setItem(presenceKey(), JSON.stringify(value)); else localStorage.removeItem(presenceKey()); }
  function openPeers(){var p=profile();modal('同航邀请卡','<p>离线版可以写好邀请文字，由你手动复制给熟悉的人；GPS 和附近同学在完整网页版中使用。</p><label class="sy-field">昵称<input data-peer-nickname maxlength="30" value="'+esc(p.nickname)+'"></label><label class="sy-field">技能 / 方向<input data-peer-skills maxlength="300" value="'+esc((Array.isArray(p.skills)?p.skills:[]).join('，'))+'"></label><label class="sy-field">个人简介<textarea data-peer-bio maxlength="240">'+esc(p.bio)+'</textarea></label><button class="sy-primary" data-support="invite">生成邀请文字</button>'); }
  function peerFields() { return { nickname: document.querySelector('[data-peer-nickname]').value.trim(), bio: document.querySelector('[data-peer-bio]').value.trim(), skills: document.querySelector('[data-peer-skills]').value.split(/[,，、]/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 12) }; }
  function locate(){feedback('GPS 与附近同学在完整网页版中提供。'); }
  function peers(){openPeers(); }
  function invite() {
    var p = peerFields(), a = acct(), plan = (a.tasks || []).filter(function (t) { return !t.done; })[0];
    var message = '上岸鸭 · 同航邀请\n' + p.nickname + ' 想和你一起专注。\n方向：' + (p.skills.join('、') || '一起学习') + '\n这次目标：' + (plan ? plan.name : '各自完成一件小事') + '\n先约一个彼此方便的时间，做完一起核对成果。';
    modal('熟人邀请卡', '<p>发给你认识的人，自行约定时间。这张邀请卡不会自动发送，也没有伪造在线队友。</p><textarea readonly data-invite-text rows="7">' + esc(message) + '</textarea><button class="sy-primary" data-support="copy-invite">选中邀请文案</button><p role="status" data-support-message></p>');
  }
  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-support]'); if (!button || !SY) return;
    var action = button.dataset.support;
    if (action === 'close') closeDialog();
    else if (action === 'checkin') openCheckin();
    else if (action === 'camera') { if (state.camera) { release(state.camera); state.camera = null; renderPanel(); } else cameraOn(); }
    else if (action === 'screen') { if (state.screen) { release(state.screen); state.screen = null; state.screenVideo = null; feedback('屏幕共享已停止。'); } else screenOn(); }
    else if (action === 'frame') sendScreen();
    else if (action === 'research' || action === 'study' || action === 'false-positive') {
      state.intervalMinutes=30;state.entered=true;
      SY.logPomoProgress(action==='false-positive'?'用户纠正：此次提醒是误报':action==='study'?'状态自述：正在学习':'状态自述：正在查找与任务有关的资料');
      speak(action==='research'?'收到，你正在查资料。需要帮助时，我可以联网找来源。':action==='study'?'你已经进入状态，继续按现在的节奏，三十分钟后再问。':'收到，是我提醒得不合适。继续你的任务，三十分钟后再问。');
      resume();
      if(action==='research'&&window.SYRescue)SYRescue.open({task:activeTask(),useNotes:!!(window.SYKnowledge&&SYKnowledge.getStatus().count)});
    }
    else if (action === 'voice-test') { state.voice = true; speak(state.entered&&state.firm?'回到当前任务。关掉娱乐页面，现在完成眼前这一小步。':'先不用逼自己做完。我们只开始五分钟，卡住就一起找办法。'); renderPanel(); }
    else if (action === 'stuck') showHelp();
    else if (action === 'tired') fatigue();
    else if (action === 'wandering') { state.intervalMinutes=5;status('awaiting');speak('刚刚走神了也没关系，找到停下的那一行，先往下做两分钟。');modal('从刚才停下的地方继续','<p>不用重排整个计划。回到刚才那一页，做完眼前的小动作。</p><div class="sy-support-actions"><button class="sy-primary" data-support="resume">继续五分钟</button><button data-support="stuck">其实是卡住了</button></div>'); }
    else if (action === 'distracted') { state.intervalMinutes = 5; status('awaiting'); speak(state.entered&&state.firm?'停止刷娱乐内容，回到当前任务。现在只完成眼前这一步。':'注意力被带走了，先把娱乐页面放一边。我们只做两分钟，找到一个能继续的动作。'); modal('只做眼前的五分钟', '<p>把无关页面放一边，打开这项任务需要的第一份资料。先做一小步，五分钟后再决定。</p><div class="sy-support-actions"><button class="sy-primary" data-support="resume">开始五分钟</button><button data-support="break">先休息一下</button></div>'); }
    else if (action === 'away' || action === 'break') { pauseHere(); status(action === 'away' ? 'away' : 'break'); stop(); closeDialog(); original.renderPomodoroView(); feedback('已暂停，关卡和成果保留。回来后点“我准备好了”。'); }
    else if (action === 'resume') { resume(); armReminder(); }
    else if (action === 'ask') help();
    else if (action === 'movement-search') movementSearch();
    else if (action === 'locate') locate();
    else if (action === 'peers-list') peers('list');
    else if (action === 'peers-publish') peers('publish');
    else if (action === 'peers-remove') peers('remove');
    else if (action === 'invite') invite();
    else if(action==='copy-invite'){var field=document.querySelector('[data-invite-text]');field.focus();field.select();feedback('文案已选中，请使用设备的复制操作。');}
  });
  document.addEventListener('click', function (event) {
    if (!SY) return;
    var control = event.target.closest('#pqLegEnd,#pqProofSubmit,#pqLegStart,[data-qact="pass"],[data-qact="skip"]');
    var f = acct().focusSupport;
    if (control && f && isBlocked(f.taskId)) { event.preventDefault(); event.stopImmediatePropagation(); openCheckin(); }
  }, true);
  document.addEventListener('change', function (event) {
    if (event.target.matches('[data-support-firm]')) state.firm=event.target.checked;
    if (event.target.matches('[data-support-voice]')) { state.voice = event.target.checked; if(!state.voice && window.speechSynthesis)speechSynthesis.cancel(); }
    if (event.target.matches('[data-support-reminders]')) { state.reminders = event.target.checked; armReminder(); }
    if (event.target.matches('[data-support-observe]')) { state.visualWatch = event.target.checked; state.nextWatchAt = Date.now() + 300000; armReminder(); feedback(state.visualWatch ? '已开启：任务进行时，每 5 分钟发送一帧给已配置的 AI，发现手机或无人时先请你确认。需要先开启摄像头。' : 'AI 画面检查已关闭。'); }
  });
  function install() {
    if (installed || !window.SY) return false;
    installed = true; SY = window.SY;
    ['startTaskTimer', 'stopCamWatch', 'startCamWatch', 'toggleCamWatch', 'renderPomodoroView', 'switchAppView', 'resumeTimerSession', 'finishTimerSession', 'setCurrentStep'].forEach(function (name) { original[name] = SY[name]; });
    original.stopCamWatch();
    SY.camWatchSample = function () {};
    SY.stopCamWatch = stop;
    SY.startCamWatch = cameraOn;
    SY.toggleCamWatch = function () { if (state.camera) { release(state.camera); state.camera = null; renderPanel(); } else cameraOn(); };
    SY.camWatchWidgetHtml = panelHtml;
    SY.startTaskTimer = openStart;
    SY.openPomoCheckin = function (kind) { if (state.reminders && !document.querySelector('dialog[open]') && (kind === 'half' || Date.now() >= state.nextCheckAt)) openCheckin(kind); };
    SY.renderPomodoroView = function () { var result = original.renderPomodoroView.apply(this, arguments); renderPanel(); refreshLegCopy(); return result; };
    SY.switchAppView = function (view) { if (view !== 'pomodoro') { stop(); closeDialog(); if(window.SYRescue)window.SYRescue.close(); } return original.switchAppView.apply(this, arguments); };
    SY.resumeTimerSession = function () { var t = activeTask(); if (t && isBlocked(t.id)) { openCheckin(); return; } return original.resumeTimerSession.apply(this, arguments); };
    SY.finishTimerSession = function (completed) { var t = activeTask(); if (completed && t && isBlocked(t.id)) { openCheckin(); return; } stop(); return original.finishTimerSession.apply(this, arguments); };
    SY.setCurrentStep = function () { var t = activeTask(); if (t && isBlocked(t.id)) { openCheckin(); return; } return original.setCurrentStep.apply(this, arguments); };
    if (typeof SY.pomoClearLeg === 'function') { var clearLeg = SY.pomoClearLeg; SY.pomoClearLeg = function () { var t = activeTask(); if (t && isBlocked(t.id)) { openCheckin(); return; } return clearLeg.apply(this, arguments); }; }
    if (typeof SY.pomoQuestStripHtml === 'function') { var strip = SY.pomoQuestStripHtml; SY.pomoQuestStripHtml = function () { return strip.apply(this, arguments).replace(/想让它盯着你认真做，把下面「摄像头盯梢」打开。/g, '可选择开启下面的本机自览或定时签到。').replace(/没开摄像头盯/g, '由你确认成果').replace(/别光说过了，/g, '').replace(/补一句你做了什么、有什么收获/g, '记一句你做了什么、有什么收获').replace(/交证明 · 过关/g, '记录收获 · 过关'); }; }
    document.addEventListener('sy:peers', openPeers);
    document.addEventListener('sy:focus-help', showHelp);
    window.SYFocus = { openCheckin: openCheckin, isBlocked: isBlocked, stop: stop, renderPanel: renderPanel, openPeers: openPeers, feedback: feedback };
    window.addEventListener('pagehide', stop);document.addEventListener('visibilitychange',function(){if(document.hidden){release(state.camera);state.camera=null;state.visualWatch=false;renderPanel();}else armReminder();});
    return true;
  }
  if (!install()) { document.addEventListener('sy:ready', install); var tries = 0, timer = setInterval(function () { if (install() || ++tries > 100) clearInterval(timer); }, 100); }
})();
