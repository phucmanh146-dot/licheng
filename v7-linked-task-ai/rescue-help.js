(function () {
  'use strict';
  var dialog = null, controller = null, recognition = null, previousFocus = null;
  var drafts = new Map(), current = null, config = {}, onResume = null, configBusy = false;
  var providers = [], liveModels = [], modelBase = '';
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function field(name) { return dialog && dialog.querySelector('[data-rescue-' + name + ']'); }
  function say(text, error) { var el = field('status'); if (el) { el.textContent = text; el.classList.toggle('sy-rescue-error', !!error); } }
  function endpoint() {
    var cfg = {}; try { cfg = JSON.parse(localStorage.getItem('shangan_ya_backend_v1') || '{}'); } catch (_) {}
    var localPage=/^https?:$/.test(location.protocol)&&/^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
    return { base: (localPage?location.origin:(cfg.base || (/^https?:$/.test(location.protocol) ? location.origin : 'http://127.0.0.1:8877'))).replace(/\/$/, ''), token: localPage?'':(cfg.token || '') };
  }
  async function request(path, data, signal, timeout) {
    var cfg = endpoint(), own = new AbortController(), timedOut = false;
    var cancel = function () { own.abort(); };
    if (signal) { if (signal.aborted) own.abort(); else signal.addEventListener('abort', cancel, { once: true }); }
    var timer = setTimeout(function () { timedOut = true; own.abort(); }, timeout || 110000);
    try {
      var headers = { 'Content-Type': 'application/json' };
      if (cfg.token) headers.Authorization = 'Bearer ' + cfg.token;
      var res = await fetch(cfg.base + path, { method: data == null ? 'GET' : 'POST', headers: headers,
        body: data == null ? undefined : JSON.stringify(data), signal: own.signal });
      var body = await res.json();
      if (!res.ok) { var problem = new Error(body.error || '服务暂时没有返回结果'); problem.data = body; throw problem; }
      return body;
    } catch (err) {
      if (err.name === 'AbortError') {
        if (timedOut) throw new Error('这次请求超时了，问题已保留，可以重试。');
        throw err;
      }
      if (err instanceof TypeError) throw new Error('联网服务未连接。请先双击文件夹里的“启动闯关陪跑.cmd”，再回到这里重试；不需要迁移你的任务。');
      throw err;
    } finally {
      clearTimeout(timer); if (signal) signal.removeEventListener('abort', cancel);
    }
  }
  function stopVoice() { if (recognition) { var r = recognition; recognition = null; r.abort(); } }
  function remember() { if (current && field('question')) current.question = field('question').value; }
  function cancelRequest() { if (controller) { controller.abort(); controller = null; } }
  function close() {
    remember(); cancelRequest(); stopVoice();
    if (dialog) { var d = dialog; dialog = null; d.close(); d.remove(); }
    if (previousFocus && previousFocus.isConnected) previousFocus.focus();
  }
  function renderSources(sources) {
    var container = field('sources'); if (!container) return;
    container.replaceChildren();
    (sources || []).forEach(function (s, i) {
      var url; try { url = new URL(s.url); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return; } catch (_) { return; }
      var card = document.createElement('article'); card.className = 'sy-rescue-source';
      var title = document.createElement('strong'); title.textContent = '[' + (i + 1) + '] ' + (s.title || url.hostname);
      var note = document.createElement('p'); note.textContent = s.readStatus === 'fulltext' ? '已读取网页正文片段' : '仅获取搜索摘要 · 正文未能读取';
      var snippet = document.createElement('p'); snippet.textContent = s.snippet || '';
      var link = document.createElement('a'); link.textContent = '查看原文 ↗'; link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
      card.append(title, note, snippet, link); container.appendChild(card);
    });
    field('source-title').hidden = !container.children.length;
  }
  function resultView() {
    if (!dialog || !current) return;
    var result = current.result;
    field('answer').textContent = result ? result.reply : '';
    renderSources(result && result.sources || []);
    renderLocal(result && result.localSources || []);
    var videoActions = field('video-actions');
    if (videoActions) {
      videoActions.replaceChildren();
      if (result && result.reply) {
        if (window.P2MindMap) videoActions.append(window.P2MindMap.createButton(result.reply));
        if (window.P2VideoPresenter) videoActions.append(window.P2VideoPresenter.createButton(result.reply));
        if (window.P2HeyGenVideo) videoActions.append(window.P2HeyGenVideo.createButton(result.reply));
      }
      videoActions.hidden = !videoActions.childNodes.length;
    }
    field('result-actions').hidden = !result;
    field('save').textContent = current.savedReply === (result && result.reply) ? '已存入任务笔记' : '保存答案与来源';
    field('save').disabled = !current.taskId || current.savedReply === (result && result.reply);
    field('resolved').disabled = !current.taskId;
  }
  function renderLocal(notes) {
    var host = field('local-sources'); if (!host) return; host.replaceChildren();
    (notes || []).forEach(function (note, i) {
      var card = document.createElement('article'); card.className = 'sy-rescue-source';
      var name = document.createElement('strong'); name.textContent = '[笔记' + (i + 1) + '] ' + note.title;
      var text = document.createElement('p'); text.textContent = '已参考你选择的本机笔记片段 · ' + note.path;
      card.append(name, text);
      if (note.url && note.url.startsWith('obsidian://open?')) {
        var link = document.createElement('a'); link.href = note.url; link.textContent = '在 Obsidian 打开'; card.appendChild(link);
      }
      host.appendChild(card);
    });
  }
  function busy(value) {
    ['ask', 'voice', 'save', 'resolved', 'retry'].forEach(function (n) { var el = field(n); if (el) el.disabled = value; });
    if (field('cancel')) field('cancel').hidden = !value;
    if (field('ask')) field('ask').textContent = value ? '正在联网查找并分析…' : '帮我查资料，给出下一步';
    if (!value && current && current.result) resultView();
  }
  function configMessage(text, error) {
    var el = field('config-status');
    if (el) { el.textContent = text; el.classList.toggle('is-error', !!error); }
  }
  function configuration() {
    var base = field('base').value.trim().replace(/\/$/, ''), protocol = field('protocol').value;
    return { base: base, model: field('model').value.trim(), key: field('key').value.trim(), protocol: protocol,
      keepKey: !field('key').value.trim() && !!config.hasKey && base === config.base && protocol === (config.protocol || 'chat') };
  }
  function setupBusy(value) {
    configBusy = value;
    ['provider', 'base', 'protocol', 'model', 'model-list', 'key', 'models', 'connect'].forEach(function (name) {
      var el = field(name); if (el) el.disabled = value;
    });
  }
  function renderModels(filter) {
    var select = field('model-list'); if (!select) return;
    select.replaceChildren();
    var hint = document.createElement('option'); hint.value = ''; hint.textContent = liveModels.length ? '选择本次获取的模型…' : '先点击“获取模型列表”'; select.appendChild(hint);
    liveModels.filter(function (m) { return (m.name + ' ' + m.id).toLowerCase().includes((filter || '').toLowerCase()); }).forEach(function (m) {
      var option = document.createElement('option'); option.value = m.id; option.textContent = m.name === m.id ? m.id : m.name + ' · ' + m.id; select.appendChild(option);
    });
    select.value = field('model').value;
    if (!select.value) select.value = '';
  }
  function updateProviderInfo() {
    var p = providers.find(function (item) { return item.id === field('provider').value; });
    var link = field('provider-docs'); link.hidden = !p || !p.docs;
    if (p && p.docs) link.href = p.docs;
    var reusable = configuration().keepKey;
    field('key').placeholder = reusable ? '本次服务已保存；留空保留' : /^http:\/\/(127\.0\.0\.1|localhost)/.test(field('base').value) ? '本机模型通常不需要密钥' : '粘贴这个服务商的 API Key';
    field('step-provider').classList.toggle('is-done', !!field('base').value);
    field('step-model').classList.toggle('is-done', !!field('model').value);
  }
  function pickProvider(id, preserve) {
    var p = providers.find(function (item) { return item.id === id; }); if (!p) return;
    field('provider').value = p.id;
    if (!preserve) {
      field('base').value = p.base; field('protocol').value = p.protocol || 'chat';
      field('model').value = ''; field('key').value = ''; liveModels = []; modelBase = '';
      field('model-filter').value = ''; renderModels();
      field('connection').textContent = '正在设置 · 尚未测试'; field('step-test').classList.remove('is-done');
      configMessage(p.id === 'custom' ? '填写你的服务商地址，然后获取模型列表。也可以手动填模型 ID。' : p.id === 'ollama' || p.id === 'lmstudio' ? '先启动本机模型服务，再点击“获取模型列表”。' : '地址已填好。粘贴该服务商的 API Key，再获取它当前提供的模型。');
    }
    updateProviderInfo();
  }
  async function loadConfig() {
    var d = dialog;
    try {
      var loaded = await Promise.all([request('/api/ai-config', null, null, 6000), request('/api/ai-providers', null, null, 6000)]);
      if (dialog !== d) return;
      config = loaded[0]; providers = loaded[1].providers || [];
      if(field('current-model'))field('current-model').textContent=config.model||'尚未配置模型';
      field('provider').replaceChildren();
      providers.forEach(function (p) { var option = document.createElement('option'); option.value = p.id; option.textContent = p.name; field('provider').appendChild(option); });
      if (!field('base').value) field('base').value = config.base || '';
      if (!field('model').value) field('model').value = config.model || '';
      field('protocol').value = config.protocol || 'chat';
      var active = providers.find(function (p) { return p.base && p.base === config.base; });
      if (config.base) pickProvider(active ? active.id : 'custom', true);
      else if (providers.length) pickProvider(providers[0].id, false);
      field('connection').textContent = config.lastError ? '对话暂不可用' + (config.lastHttpStatus ? ' · ' + config.lastHttpStatus : '') : config.verified ? 'AI 连接测试已通过' : config.configured ? 'AI 已配置 · 等待对话测试' : 'AI 尚未连接 · 在下方设置一次';
      field('config').open = !config.configured || !!config.lastError;
      field('step-test').classList.toggle('is-done', !!config.verified);
      if (config.configured) configMessage(config.verified ? '连接正常。当前模型：' + config.model : '已保留当前服务地址和模型，点击测试即可确认连接。');
      if (config.lastError) configMessage(config.lastError, true);
      if (d.dataset.setup === 'true') { field('config').open = true; field('config').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    } catch (err) {
      if (dialog === d) {
        field('connection').textContent = '先启动本机服务'; field('config').open = true;
        configMessage(err.data && !err.data.code ? '本机服务版本较旧。请关闭旧服务，再双击“启动闯关陪跑.cmd”重新打开。' : err.message, true);
      }
    }
  }
  async function loadCCSwitch(){
    var d=dialog;try{var r=await request('/api/cc-switch',null,null,6000);if(dialog!==d)return;var select=field('cc-provider');select.replaceChildren();
      (r.providers||[]).forEach(function(p){var o=document.createElement('option');o.value=p.id;o.textContent=p.name+' · '+(p.model||'未设置模型')+(p.current?' · 当前使用':'')+(!p.available?' · 缺少 API 配置':'');o.disabled=!p.available;select.append(o);});
      var first=(r.providers||[]).find(function(p){return p.current&&p.available;})||(r.providers||[]).find(function(p){return p.available;});if(first)select.value=first.id;else{var o=document.createElement('option');o.textContent='没有可用的 CC Switch API 配置';o.value='';select.append(o);select.value='';}
    }catch(err){if(dialog===d)field('network-status').textContent=err.message;}
  }
  async function connectCCSwitch(){
    if(configBusy)return;var d=dialog,id=field('cc-provider').value;if(!id){configMessage('请先在 CC Switch 中配置服务地址、API Key 和模型。',true);return;}
    configBusy=true;field('cc-connect').disabled=true;configMessage('正在读取已有配置并实际发送一次测试请求…');
    try{var r=await request('/api/cc-switch/connect',{id:id},null,80000);if(dialog!==d)return;config=r;field('base').value=r.base;field('model').value=r.model;field('protocol').value=r.protocol;field('key').value='';await loadConfig();configMessage('已连接 '+r.provider+' · '+r.model+'，对话测试通过。');}
    catch(err){if(dialog===d){if(err.data&&err.data.config){config=err.data.config;field('base').value=config.base;field('model').value=config.model;field('protocol').value=config.protocol;field('key').value='';field('connection').textContent=err.data.unchanged?'候选连接未通过 · 已保留原配置':'配置已读取 · 对话测试未通过';}configMessage(err.message+(err.data&&err.data.unchanged?' 原有连接未被替换。':''),true);}}
    finally{configBusy=false;if(dialog===d)field('cc-connect').disabled=false;}
  }
  async function testNetwork(){
    var d=dialog;field('network-test').disabled=true;field('network-status').textContent='正在实际检索公开网页…';
    try{var r=await request('/api/search',{q:'飞书 开放平台 文档 API',n:3},null,35000);if(dialog!==d)return;field('network-status').textContent='联网检索已返回 '+r.results.length+' 条来源（'+r.provider+'）。这项测试与模型对话额度无关。';renderSources(r.results);}
    catch(err){if(dialog===d)field('network-status').textContent=err.message;}
    finally{if(dialog===d)field('network-test').disabled=false;}
  }
  async function fetchModels() {
    if (configBusy || controller) return;
    var d = dialog, candidate = configuration();
    setupBusy(true); configMessage('正在向所选服务商获取当前模型列表…');
    try {
      var result = await request('/api/ai-models', candidate, null, 40000);
      if (dialog !== d) return;
      liveModels = result.models || []; modelBase = candidate.base; field('base').value = result.base || candidate.base;
      field('model-filter').value = ''; renderModels();
      configMessage(liveModels.length ? '已从该服务商获取 ' + liveModels.length + ' 个模型。选择支持对话的模型，再测试连接。' : '该服务商没有返回模型。请检查账号，或手动填写它提供的模型 ID。', !liveModels.length);
    } catch (err) { if (dialog === d) configMessage(err.message + ' 你也可以手动填模型 ID 后直接测试。', true); }
    finally { setupBusy(false); }
  }
  async function saveConfig() {
    if (configBusy || controller) return;
    var d = dialog;
    var candidate = configuration();
    if (!candidate.model) { configMessage('先从下拉列表选择模型，或在“模型 ID”填写服务商提供的名字。', true); field('model').focus(); return; }
    if (!candidate.key && !candidate.keepKey && !/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::|\/)/.test(candidate.base)) { configMessage('还缺少当前服务商的 API Key。请粘贴后再测试。', true); field('key').focus(); return; }
    setupBusy(true); field('connection').textContent = '正在测试…';
    configMessage('正在发送简短测试请求；通过后才替换当前连接…');
    try {
      var health = await request('/api/health', null, null, 6000);
      if (!health.ok) throw new Error('本机资料服务未就绪，请重新连接后测试。');
      candidate.verify = true;
      config = await request('/api/ai-config', candidate);
      if (dialog !== d) return;
      field('key').value = ''; field('base').value = config.base; updateProviderInfo();
      field('connection').textContent = '已连接 · ' + config.model; if(field('current-model'))field('current-model').textContent=config.model; field('step-test').classList.add('is-done');
      configMessage('✓ ' + config.model + ' 已实际回复测试消息。现在可以使用联网问答和资料路线。');
      say('连接成功。现在直接提问，会自动搜索公开网页并生成下一步。');
      if (window.SY && SY.backendProbe) SY.backendProbe(true);
    } catch (err) { if (dialog === d) { field('connection').textContent = '连接测试未通过'; field('step-test').classList.remove('is-done'); configMessage(err.message, true); } }
    finally { setupBusy(false); }
  }
  async function ask() {
    if (controller) return;
    remember(); stopVoice();
    if (!current.question.trim()) { say('说出或写下一个具体问题。'); field('question').focus(); return; }
    var d = dialog, entry = current, job = new AbortController(); controller = job;
    var previous = entry.result ? '上一次问题：' + entry.answeredQuestion + '\n上一次建议：' + entry.result.reply : '';
    busy(true); say('正在结合当前任务、资料与公开网页搜索…');
    var notes = [], context = '', taskSources = [];
    try {
      var task = entry.task || {};
      var taskSteps = Array.isArray(task.steps) ? task.steps.map(function (x) {
        return typeof x === 'string' ? x : (x && (x.text || x.title || x.name || x.label) || '');
      }).filter(Boolean) : [];
      var rawLinks = (Array.isArray(task.materials) ? task.materials : []).map(function (x) {
        return typeof x === 'string' ? x : (x && (x.url || x.href || x.link) || '');
      }).concat([task.sourceUrl, task.url, task.feishuUrl, task.obsidianUrl]).filter(Boolean);
      var taskUrls = [];
      rawLinks.forEach(function (raw) {
        try { var u = new URL(String(raw)); if (['http:', 'https:'].includes(u.protocol) && !u.username && !u.password && taskUrls.indexOf(u.href) < 0) taskUrls.push(u.href); } catch (_) {}
      });
      taskUrls = taskUrls.slice(0, 6);
      context = [
        '【关联任务，只读上下文】',
        '任务 ID：' + String(task.id || '未关联'),
        '任务名称：' + String(task.name || entry.taskName || '自由提问'),
        '分类：' + String(task.category || '未分类'),
        '状态：' + (task.done ? '已完成' : '进行中/未完成'),
        '截止日期：' + String(task.dueDate || '原任务未设置'),
        '截止时间：' + String(task.dueTime || '未设置'),
        '任务步骤：' + (taskSteps.length ? taskSteps.join('；') : '未提供'),
        '任务备注：' + String(task.noteFramework || task.noteRemark || '').slice(0, 2500),
        '关联资料链接：' + (taskUrls.length ? taskUrls.join('\n') : '没有可直接读取的公开链接'),
        '要求：用通俗易懂的中文解释，先说清问题原因，再给一条现在能做的操作、交付物和验收方法；不要修改原任务。'
      ].join('\n');
      if (field('use-notes').checked) {
        if (window.SYKnowledge && !SYKnowledge.getStatus().count && window.SYConnectLocalVault) await SYConnectLocalVault();
        if (!window.SYKnowledge || !SYKnowledge.getStatus().count) throw new Error('先连接 Obsidian 或导入文档，再勾选参考笔记。');
        notes = await SYKnowledge.search(entry.question);
        context += '\n\n' + notes.map(function (note, i) { return '[笔记' + (i + 1) + '] ' + note.title + '\n' + note.text; }).join('\n\n');
      }
      for (var i = 0; i < taskUrls.length; i++) {
        try {
          var doc = await request('/api/extract', { url: taskUrls[i] }, job.signal);
          var body = String(doc.text || '').trim();
          var read = !!body && (doc.readStatus === 'fulltext' || doc.readStatus === 'snapshot' || doc.readStatus === 'visible-copy' || doc.status === 'read');
          taskSources.push({ title: String(doc.title || taskUrls[i]), url: taskUrls[i], snippet: body.slice(0, 1800) || String(doc.note || '未返回正文'), readStatus: read ? 'fulltext' : 'snippet' });
          if (read) context += '\n\n[任务关联资料：' + String(doc.title || taskUrls[i]) + ']\n' + body.slice(0, 5000);
        } catch (sourceError) {
          taskSources.push({ title: taskUrls[i], url: taskUrls[i], snippet: '本次未读取到正文：' + String(sourceError.message || sourceError).slice(0, 180), readStatus: 'failed' });
        }
      }
      var previous = entry.history.slice(-6).map(function (x) { return x.role + ': ' + x.content; }).join('\n\n');
      var result = await request('/api/ask-ai', { mode: 'stuck', search: true, question: entry.question, task: entry.taskName, previous: previous, context: context }, job.signal);
      if (dialog !== d || job.signal.aborted) return;
      if (!result.reply || !Array.isArray(result.sources) || !result.searched) throw new Error('服务没有返回完整的联网回答，请检查 AI 连接。');
      result.sources = taskSources.concat(result.sources || []);
      result.localSources = notes.map(function (n) { return { title: n.title, path: n.path, url: n.url }; });
      entry.result = result; entry.answeredQuestion = entry.question; entry.savedReply = null;
      say('已找到 ' + result.sources.length + ' 条来源，其中 ' + result.sources.filter(function (s) { return s.readStatus === 'fulltext'; }).length + ' 条读取到正文。先试下面这一步，再告诉我是否解决。');
      resultView(); field('answer').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (err) {
      if (dialog !== d) return;
      if (err.name === 'AbortError') say('已停止等待，问题保留；可以修改后重试。');
      else {
        say(err.message + (entry.result ? ' 下方保留的是上一次回答。' : ''), true);
        if (err.data && (err.data.code === 'CONFIG_REQUIRED' || /^MODEL_/.test(err.data.code || ''))) { field('config').open = true; field('connection').textContent = '对话暂不可用'; configMessage(err.message, true); }
        if (err.data && err.data.sources && !entry.result) renderSources(err.data.sources);
      }
    } finally {
      if (controller === job) controller = null;
      if (dialog === d && !controller) { busy(false); if (!entry.result && field('sources').children.length) field('source-title').hidden = false; }
    }
  }
  function voice() {
    if (recognition) { stopVoice(); return; }
    var Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) { say('当前浏览器没有语音识别，可以使用系统语音输入或直接打字。'); return; }
    var d = dialog, base = field('question').value, r = new Speech(); recognition = r;
    r.lang = 'zh-CN'; r.continuous = false; r.interimResults = true;
    r.onresult = function (event) {
      if (dialog !== d) return;
      var text = Array.from(event.results).map(function (x) { return x[0].transcript; }).join('');
      field('question').value = (base ? base + '\n' : '') + text; remember();
    };
    r.onerror = function (event) { if (dialog === d) say(event.error === 'not-allowed' ? '麦克风未获允许；可在浏览器设置中开启，或直接打字。' : '语音没有识别成功，文字仍保留，可以重试或打字。', true); };
    r.onend = function () { if (recognition === r) recognition = null; if (dialog === d) field('voice').textContent = '🎙 说出我的问题'; };
    try { r.start(); field('voice').textContent = '停止录音'; say('正在听。识别后先检查文字，再点击提问。'); }
    catch (_) { recognition = null; say('麦克风暂时不可用，请使用文字输入。', true); }
  }
  function saveAnswer(resolved) {
    if (!current || !current.result || !window.SY) return false;
    if (String(SY.currentAccountKey) !== current.account) { say('账号已切换，不能把答案保存到另一个账号。', true); return false; }
    var a = SY.getAcctData(), task = (a.tasks || []).find(function (t) { return t.id === current.taskId; });
    if (!task) { say('原任务不存在；答案仍在这里，可以复制保留。', true); return false; }
    var alreadySaved = current.savedReply === current.result.reply;
    if (!alreadySaved) {
      var note = '\n\n卡点：' + current.answeredQuestion + '\nAI 建议（待验证）：\n' + current.result.reply + '\n来源：\n' +
        current.result.sources.map(function (s, i) { return '[' + (i + 1) + '] ' + s.title + '\n' + s.url; }).join('\n');
      if (current.result.localSources && current.result.localSources.length) note += '\n本机笔记：\n' + current.result.localSources.map(function (n) { return n.title + ' · ' + n.path; }).join('\n');
      task.noteRemark = (task.noteRemark || '') + note;
    }
    if (resolved) task.noteRemark += '\n用户确认：这一卡点已解决。';
    SY.saveAcctData(a); current.savedReply = current.result.reply; resultView(); say(resolved ? '已记录解决结果，回到当前任务。' : '答案与原文链接已保存到这项任务的笔记。'); return true;
  }
  function open(options) {
    options = options || {}; close(); previousFocus = document.activeElement;
    var task = options.task || {}, account = window.SY ? String(SY.currentAccountKey) : 'guest';
    var id = account + ':' + (task.id || task.name || 'free');
    if (!drafts.has(id)) drafts.set(id, { question: options.question || '', result: null });
    current = drafts.get(id); current.taskId = task.id; current.taskName = task.name || options.taskName || ''; current.task = task; current.account = account;
    onResume = options.onResume || null;
    var d = document.createElement('dialog'); d.className = 'sy-support-dialog sy-rescue-dialog'; d.setAttribute('aria-labelledby', 'rescueTitle');
    d.innerHTML = DOMPurify.sanitize('<header><div><span class="sy-eyebrow">上岸鸭 · 卡点救援站</span><h2 id="rescueTitle">卡住了，我们查清楚再出发</h2></div><button data-rescue-close aria-label="关闭">×</button></header><div class="sy-dialog-body">' +
      '<p class="sy-rescue-intro">写明目标、目前进度和卡点；AI 会结合你选择的资料给出下一步、交付物和验收方法。</p><p>当前模型：<strong data-rescue-current-model>正在核对真实配置…</strong></p><p class="sy-rescue-task">当前任务：' + esc(current.taskName || '自由提问') + '</p>' +
      '<label class="sy-field">具体卡在哪里？<textarea data-rescue-question rows="4" maxlength="3000" placeholder="例如：我要写一篇图文攻略，资料已导入，但不知道怎样安排结构。请先给我第一步、交付物和验收方法。">' + esc(current.question) + '</textarea></label>' +
      '<div class="sy-rescue-toolbar"><label class="sy-check"><input type="checkbox" data-rescue-use-notes' + (options.useNotes ? ' checked' : '') + '>同时参考已连接的笔记（仅发送匹配片段给 AI）</label><button data-rescue-knowledge>连接 Obsidian / 导入文档</button></div>' +
      '<div class="sy-rescue-toolbar"><button data-rescue-voice>🎙 说出我的问题</button><button class="sy-primary" data-rescue-ask>帮我查资料，给出下一步</button><button data-rescue-cancel hidden>停止等待</button></div>' +
      '<p class="sy-rescue-footnote">语音由浏览器识别，可能需要联网。问题、当前任务名和检索到的资料会交给你配置的 AI 分析。</p>' +
      '<p class="sy-rescue-status" role="status" aria-live="polite" data-rescue-status></p><div class="sy-rescue-answer" data-rescue-answer></div><div class="sy-rescue-video-actions" data-rescue-video-actions hidden></div>' +
      '<h3 data-rescue-source-title hidden>本次参考来源</h3><div class="sy-rescue-sources" data-rescue-sources></div><div class="sy-rescue-sources" data-rescue-local-sources></div>' +
      '<div data-rescue-result-actions hidden><div class="sy-rescue-actions"><button data-rescue-save>保存答案与来源</button><button data-rescue-to-vault>存入 Obsidian</button><button class="sy-primary" data-rescue-resolved>这一步解决了 · 继续任务</button><button data-rescue-retry>还没解决 · 补充情况</button></div></div>' +
      '<div class="sy-rescue-config-shortcut"><p>统一从完整 AI 工作区配置模型/API；也可直接进入多模态对话，上传图片、文档、网页链接或视频。视频解析、思维导图和讲解视频都在同一工作区使用。</p><div class="sy-rescue-ai-entry-actions"><button type="button" data-rescue-open-ai>进入完整 AI 工作区 ↗</button><button type="button" data-rescue-open-ai-config>配置模型 / API ↗</button></div></div>' +
      '<details class="sy-rescue-config" data-rescue-config><summary>AI 连接 · <span data-rescue-connection>检查连接中…</span></summary>' +
      '<div class="sy-ai-heading"><div><span class="sy-ai-kicker">CONNECTION STUDIO</span><h3>给陪跑员，接上一个大脑。</h3><p>选服务商 → 获取真实模型 → 测试连接</p></div><span class="sy-ai-orbit" aria-hidden="true">✳</span></div>' +
      '<section class="sy-cc-connect"><label>使用电脑中已有的 CC Switch 配置<select data-rescue-cc-provider><option value="">正在检查…</option></select></label><button type="button" data-rescue-cc-connect>读取配置并测试</button><button type="button" data-rescue-network-test>测试联网检索</button><p data-rescue-network-status role="status"></p></section>' +
      '<ol class="sy-ai-steps"><li data-rescue-step-provider><span>01</span>选择服务商</li><li data-rescue-step-model><span>02</span>选择模型</li><li data-rescue-step-test><span>03</span>连接成功</li></ol>' +
      '<div class="sy-ai-columns"><section class="sy-ai-card"><h4><span>01</span>从哪里接入</h4>' +
      '<label class="sy-field">服务商<select data-rescue-provider aria-label="选择 AI 服务商"><option value="">正在加载服务商…</option></select></label>' +
      '<label class="sy-field">API 密钥<input data-rescue-key type="password" autocomplete="off" placeholder="粘贴所选服务商的 API Key"></label>' +
      '<a data-rescue-provider-docs target="_blank" rel="noopener noreferrer" hidden>查看服务商官方接入说明 ↗</a>' +
      '<details class="sy-ai-advanced"><summary>服务地址与接口类型</summary><label class="sy-field">服务基础地址<input data-rescue-base type="url" autocomplete="off" placeholder="https://…/v1"></label>' +
      '<label class="sy-field">接口类型<select data-rescue-protocol><option value="chat">Chat Completions · 通用兼容接口</option><option value="responses">Responses · OpenAI 等</option><option value="anthropic">Messages · Anthropic Claude</option></select></label></details></section>' +
      '<section class="sy-ai-card"><h4><span>02</span>让模型自己报到</h4><button class="sy-ai-fetch" data-rescue-models>↻ 获取模型列表</button>' +
      '<label class="sy-field">查找模型<input data-rescue-model-filter type="search" placeholder="按名称筛选，例如 DeepSeek、Qwen"></label>' +
      '<label class="sy-field">服务商当前返回的模型<select data-rescue-model-list aria-label="选择 AI 模型"><option value="">先点击“获取模型列表”</option></select></label>' +
      '<label class="sy-field">模型 ID · 也可以手动填写<input data-rescue-model autocomplete="off" placeholder="选择后自动填入"></label></section></div>' +
      '<div class="sy-ai-launch"><p role="status" aria-live="polite" data-rescue-config-status>正在检查本机服务…</p><button class="sy-primary" data-rescue-connect>测试连接并启用 →</button></div>' +
      '<p class="sy-rescue-footnote">模型列表来自你选择的服务商；不同账号可用范围不同。密钥只保留在本次本机服务内存中，关闭服务后需重新填写。</p></details></div>');
    d.dataset.setup = options.setup ? 'true' : 'false'; liveModels = []; modelBase = '';
    document.body.appendChild(d); dialog = d; d.showModal(); resultView(); loadConfig(); loadCCSwitch(); field('question').focus();
    d.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
    d.addEventListener('input', function (e) {
      remember();
      if (e.target.matches('[data-rescue-model-filter]')) renderModels(e.target.value);
      if (e.target.matches('[data-rescue-base], [data-rescue-model], [data-rescue-key]')) {
        if (e.target.matches('[data-rescue-base]') && modelBase !== e.target.value.trim()) { liveModels = []; renderModels(); }
        field('connection').textContent = '设置已修改 · 需要重新测试'; field('step-test').classList.remove('is-done'); updateProviderInfo();
      }
    });
    d.addEventListener('change', function (e) {
      if (e.target.matches('[data-rescue-provider]')) pickProvider(e.target.value, false);
      if (e.target.matches('[data-rescue-model-list]') && e.target.value) { field('model').value = e.target.value; updateProviderInfo(); field('step-test').classList.remove('is-done'); field('connection').textContent = '已选择模型 · 等待测试'; }
      if (e.target.matches('[data-rescue-protocol]')) { liveModels = []; renderModels(); updateProviderInfo(); field('step-test').classList.remove('is-done'); }
    });
    d.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.hasAttribute('data-rescue-close')) close();
      else if (b.hasAttribute('data-rescue-open-ai') || b.hasAttribute('data-rescue-open-ai-config')) {
        var openConfig = b.hasAttribute('data-rescue-open-ai-config');
        var frame = document.getElementById('embeddedP2Frame');
        var nav = document.getElementById('aiP2Nav');
        if (!frame || !nav) { say('没有找到工作台内置 AI 区域，请刷新工作台后重试。', true); return; }
        // Hand off the exact rescue question and current task to the embedded AI workspace.
        // sessionStorage is same-origin and one-shot; do not put private task text in the URL.
        try {
          var task = current && current.task || {};
          var taskContext = [
            current && current.taskName ? '当前任务：' + current.taskName : '',
            task.goal || task.description || task.requirement ? '目标/要求：' + (task.goal || task.description || task.requirement) : '',
            task.deadline || task.dueDate || task.endDate ? '截止日期：' + (task.deadline || task.dueDate || task.endDate) : '',
            task.acceptance || task.acceptanceCriteria ? '验收标准：' + (task.acceptance || task.acceptanceCriteria) : ''
          ].filter(Boolean).join('\n');
          sessionStorage.setItem('shanganya_p2_rescue_handoff_v1', JSON.stringify({
            question: (field('question') && field('question').value || '').trim(),
            taskName: current && current.taskName || '',
            taskContext: taskContext,
            openConfig: openConfig,
            createdAt: Date.now()
          }));
        } catch (_) {}
        close();
        frame.src = './ai-p2.html?embedded=1&linkedTaskAi=20261023v9&handoff=1' + (openConfig ? '&openConfig=1' : '');
        nav.click();
      }
      else if (b.hasAttribute('data-rescue-ask')) ask();
      else if (b.hasAttribute('data-rescue-voice')) voice();
      else if (b.hasAttribute('data-rescue-cancel')) cancelRequest();
      else if (b.hasAttribute('data-rescue-connect')) saveConfig();
      else if (b.hasAttribute('data-rescue-cc-connect')) connectCCSwitch();
      else if (b.hasAttribute('data-rescue-network-test')) testNetwork();
      else if (b.hasAttribute('data-rescue-models')) fetchModels();
      else if (b.hasAttribute('data-rescue-save')) saveAnswer(false);
      else if (b.hasAttribute('data-rescue-knowledge') && window.SYKnowledge) SYKnowledge.open();
      else if (b.hasAttribute('data-rescue-to-vault') && window.SYKnowledge && current.result) SYKnowledge.saveRescue({ question: current.answeredQuestion, reply: current.result.reply, sources: current.result.sources, task: current.taskName });
      else if (b.hasAttribute('data-rescue-resolved')) { if (saveAnswer(true)) { var done = onResume; close(); if (done) done(); } }
      else if (b.hasAttribute('data-rescue-retry')) { field('question').value = ''; remember(); field('question').focus(); say('补充你试过后出现的现象或报错。下次提问会带上上一轮建议。'); }
    });
  }
  window.SYRescue = { open: open, close: close, configure: function () { open({ setup: true }); } };
  window.addEventListener('pagehide', close);
})();
