(function () {
  'use strict';
  if (window.SYKnowledge) return;
  var LIMIT = 500, MAX_BYTES = 5 * 1024 * 1024, IMAGE_MAX_BYTES = 5 * 1024 * 1024;
  var state = { handle: null, name: '', mode: 'none', docs: [], busy: false, dialog: null, lastFocus: null, summary: '', searchId: 0 };
  var stopwords = new Set(['这个', '那个', '什么', '怎么', '如何', '为什么', '一个', '我们', '我的', '可以', '已经', '问题', '帮我', '一下', '没有', '不能', '还是', 'the', 'and', 'for', 'with', 'this', 'that', 'what', 'how']);

  function el(tag, cls, text) { var node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node; }
  function button(text, action, primary) { var node = el('button', primary ? 'sykv-primary' : '', text); node.type = 'button'; node.addEventListener('click', action); return node; }
  function status() { return { connected: state.mode !== 'none', writable: !!state.handle, vaultName: state.name, mode: state.mode, count: state.docs.length, busy: state.busy }; }
  function statusText() {
    if (state.busy) return '正在本机读取资料，请稍等…';
    if (state.mode === 'local') return '已直连本机库「' + state.name + '」· ' + state.docs.length + ' 篇笔记 · 可通过本机服务存回 FocusQuest';
    if (state.mode === 'directory') return '已连接「' + state.name + '」· ' + state.docs.length + ' 篇资料 · 保存时会再次请求写入权限';
    if (state.mode === 'import') return '已导入「' + state.name + '」· ' + state.docs.length + ' 篇资料 · 当前目录为只读';
    return state.docs.length ? '已导入 ' + state.docs.length + ' 篇本机文档 · 尚未连接 Obsidian 目录' : '尚未连接 · 选择你的 Obsidian 库文件夹，或先上传文本文档';
  }
  function announce() {
    document.querySelectorAll('[data-sykv-status]').forEach(function (node) { node.textContent = statusText(); });
    renderMedia();
    window.dispatchEvent(new CustomEvent('sy:knowledge-change', { detail: status() }));
  }
  function message(text, error) {
    var target = state.dialog && state.dialog.querySelector('[data-sykv-message]');
    if (target) { target.textContent = text; target.classList.toggle('sykv-error', !!error); }
  }
  function obsidianUrl(path) { return state.name ? 'obsidian://open?vault=' + encodeURIComponent(state.name) + '&file=' + encodeURIComponent(path) : ''; }
  function jumpToObsidian(path, title) {
    var url = obsidianUrl(path), body = dialog('跳转到 Obsidian');
    body.append(el('p', 'sykv-intro', '这一步会打开你电脑上的 Obsidian。当前笔记：' + (title || path)));
    body.append(el('p', 'sykv-overview', state.name ? '已连接知识库「' + state.name + '」。点击按钮后，若系统询问是否打开 Obsidian，请选择允许。' : '还没有连接 Obsidian 文件夹；先连接后即可跳转。'));
    var actions = el('div', 'sykv-actions');
    if (url) {
      var link = el('a', 'sykv-note-link', '打开 Obsidian 这篇笔记'); link.href = url; link.addEventListener('click', function () { setTimeout(close, 300); }); actions.append(link);
    }
    actions.append(button('复制 Obsidian 链接', function () { if (navigator.clipboard) navigator.clipboard.writeText(url).then(function(){message('链接已复制，可粘贴到地址栏或 Obsidian。');}); else message(url); }), button('返回资料舱', close));
    body.append(actions);
  }
  function hiddenPath(path) { return path.split('/').some(function (part) { return part.charAt(0) === '.'; }); }
  function titleOf(text, path) { var heading = String(text || '').match(/^#\s+(.+)$/m); return (heading ? heading[1] : path.split('/').pop().replace(/\.(md|txt|srt|vtt|pdf|docx?|png|jpe?g|webp|gif|bmp)$/i, '')).slice(0, 180); }
  function imagePath(path) { return /\.(png|jpe?g|webp|gif)$/i.test(String(path || '')); }
  function makeDoc(file, path, text, inVault, extra) { extra = extra || {}; return { title: titleOf(text, path), path: path, text: text || '', inVault: inVault, modified: file.lastModified || 0, kind: extra.kind || 'text', mime: extra.mime || file.type || '', previewUrl: extra.previewUrl || '' }; }

  async function scanDirectory(handle) {
    var docs = [], examined = 0, visited = 0, skipped = 0, truncated = false;
    async function walk(dir, prefix, depth) {
      if (depth > 16) { truncated = true; return; }
      for await (var entry of dir.values()) {
        if (++visited > 10000 || examined >= LIMIT) { truncated = true; return; }
        if (entry.name.charAt(0) === '.') continue;
        var path = prefix + entry.name;
        if (entry.kind === 'directory') { await walk(entry, path + '/', depth + 1); continue; }
        if (!/\.(md|png|jpe?g|webp|gif)$/i.test(entry.name)) continue;
        examined++;
        try {
          var file = await entry.getFile(), isImage = imagePath(path);
          if (file.size > (isImage ? IMAGE_MAX_BYTES : MAX_BYTES)) { skipped++; continue; }
          if (isImage) docs.push(makeDoc(file, path, '', true, { kind: 'image', mime: file.type, previewUrl: URL.createObjectURL(file) }));
          else docs.push(makeDoc(file, path, await file.text(), true));
        } catch (_) { skipped++; }
      }
    }
    await walk(handle, '', 0);
    return { docs: docs, skipped: skipped, truncated: truncated };
  }

  async function connect() {
    if (state.busy) return;
    if (typeof window.showDirectoryPicker !== 'function') {
      var fallback = state.dialog && state.dialog.querySelector('[data-sykv-folder]');
      if (fallback) fallback.click();
      return;
    }
    var handle;
    try { handle = await window.showDirectoryPicker({ id: 'focusquest-obsidian', mode: 'read' }); }
    catch (error) {
      if (error.name !== 'AbortError') message('浏览器没有开放目录选择，请使用「只读导入文件夹」。', true);
      return;
    }
    state.busy = true; announce(); message('正在读取 Markdown 笔记和常见图片，内容保留在当前页面内存中。');
    try {
      var result = await scanDirectory(handle);
      state.handle = handle; state.name = handle.name; state.mode = 'directory'; state.docs = result.docs;
      state.summary = '已读取 ' + result.docs.length + ' 份资料。' + (result.skipped ? '跳过 ' + result.skipped + ' 篇超限或不可读文件。' : '') + (result.truncated ? '已达到扫描上限；未扫描的资料不会出现在搜索结果中。' : '');
      message(state.summary); clearResults();
    } catch (_) { message('没有读到这个目录，请检查目录权限后重新选择。', true); }
    finally { state.busy = false; announce(); }
  }

  async function connectLocalVault() {
    if (state.busy) return;
    // A hosted webpage cannot scan 127.0.0.1 unless a local bridge is actually running.
    // If no bridge is present, open the browser's explicit read-only folder picker instead.
    if (!window.SY || typeof SY.backendCall !== 'function') {
      message('没有检测到可用的本机桥接服务。改用系统目录选择窗口，授权读取你的 Obsidian Vault。');
      return connect();
    }
    state.busy = true; announce(); message('正在通过已连接的本机服务读取知识库…');
    try {
      var r = await SY.backendCall('/api/vault-list', { limit: 500, with_text: true }, 120000);
      if (!r || !r.ok) throw new Error((r && r.error) || '本机服务没有返回知识库。');
      var data = r.data || {};
      if (!data.connected || !Array.isArray(data.files)) throw new Error(data.note || '没有找到可读取的本机知识库目录。');
      state.handle = null; state.name = data.name; state.mode = 'local';
      state.docs = data.files.map(function (row) {
        return makeDoc({ lastModified: 0, type: '' }, row.path, row.text || '', true);
      });
      state.summary = '已直连本机库「' + data.name + '」· ' + state.docs.length + ' 篇笔记。' + (data.truncated ? '已达上限，未全部载入。' : '');
      message(state.summary); clearResults();
    } catch (error) {
      message('本机直连失败：' + (error.message || '没有读到本机知识库。') + '。请点击「连接 Obsidian 文件夹」授权只读访问；不会假装已连接。', true);
    } finally { state.busy = false; announce(); }
  }
  window.SYConnectLocalVault = connectLocalVault;

  async function readUploaded(file) {
    if (window.SYSourceIO) return (await SYSourceIO.readFile(file)).text || '';
    return await file.text();
  }
  async function importFiles(files, folder) {
    if (state.busy || !files.length) return;
    state.busy = true; announce();
    var docs = folder ? [] : state.docs.slice(), skipped = 0, accepted = 0, examined = 0, warnings = [];
    var root = folder && files[0].webkitRelativePath ? files[0].webkitRelativePath.split('/')[0] : '';
    for (var file of files) {
      var relative = folder ? (file.webkitRelativePath || file.name).split('/').slice(1).join('/') : file.name;
      if (!relative || hiddenPath(relative) || !(folder ? /\.(md|png|jpe?g|webp|gif)$/i : /\.(md|txt|srt|vtt|pdf|docx?|png|jpe?g|webp|gif|bmp)$/i).test(relative)) continue;
      if (docs.length >= LIMIT || examined >= LIMIT) { skipped++; continue; }
      examined++;
      var isImage = imagePath(relative);
      if (file.size > (isImage ? IMAGE_MAX_BYTES : MAX_BYTES)) { skipped++; continue; }
      try {
        var path = folder ? relative : '导入文档/' + file.name;
        var text = ''; try { text = folder && !isImage ? await file.text() : isImage && folder ? '' : await readUploaded(file); } catch (error) { if (!isImage) throw error; warnings.push(file.name + '：可预览，文字未识别（' + error.message + '）'); }
        var item = makeDoc(file, path, text, !!folder, isImage ? { kind: 'image', mime: file.type, previewUrl: URL.createObjectURL(file) } : null);
        var existing = docs.findIndex(function (doc) { return doc.path === path && doc.inVault === item.inVault; });
        if (existing >= 0) docs[existing] = item; else docs.push(item);
        accepted++;
      } catch (error) { skipped++; warnings.push(file.name + '：' + error.message); }
    }
    if (folder) { state.handle = null; state.name = root || '导入的知识库'; state.mode = 'import'; }
    state.docs = docs; state.busy = false;
    message('已在本机导入 ' + accepted + ' 篇。' + (skipped ? '跳过 ' + skipped + ' 篇超限或不可读文件。' : '') + (folder ? '目录导入是只读的，保存结果可下载 Markdown。' : '') + (warnings.length ? '\n' + warnings.join('；') : ''));
    clearResults(); announce();
  }

  function tokens(question) {
    var text = String(question || '').toLowerCase().slice(0, 2000), words = [];
    if (typeof Intl.Segmenter === 'function') {
      var segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
      for (var part of segmenter.segment(text)) if (part.isWordLike && part.segment.length > 1) words.push(part.segment);
    } else {
      words = text.match(/[a-z0-9_+.-]{2,}/g) || [];
      (text.match(/[\u3400-\u9fff]{2,}/g) || []).forEach(function (part) {
        for (var i = 0; i < part.length - 1; i++) words.push(part.slice(i, i + 2));
      });
    }
    return Array.from(new Set(words.filter(function (word) { return !stopwords.has(word); }))).slice(0, 24);
  }
  async function search(question) {
    var words = tokens(question);
    if (!words.length || state.busy) return [];
    return state.docs.map(function (doc) {
      var body = doc.text.toLowerCase(), title = doc.title.toLowerCase(), path = doc.path.toLowerCase();
      var score = 0, first = -1, matches = 0;
      words.forEach(function (word) {
        var index = body.indexOf(word);
        if (title.includes(word)) score += 10;
        if (path.includes(word)) score += 4;
        if (index >= 0) { score += 2; matches++; if (first < 0 || index < first) first = index; }
      });
      score += matches * matches;
      var start = Math.max(0, first - 180), end = Math.min(doc.text.length, start + 1100);
      return { title: doc.title, path: doc.path, text: (start ? '…' : '') + doc.text.slice(start, end) + (end < doc.text.length ? '…' : ''), url: doc.inVault ? obsidianUrl(doc.path) : '', score: score };
    }).filter(function (doc) { return doc.score > 0; }).sort(function (a, b) { return b.score - a.score || a.path.localeCompare(b.path); }).slice(0, 5).map(function (doc) {
      return { title: doc.title, path: doc.path, text: doc.text, url: doc.url };
    });
  }

  function renderMedia() {
    var host = state.dialog && state.dialog.querySelector('[data-sykv-media]');
    if (!host) return;
    var media = state.docs.filter(function (doc) { return doc.kind === 'image' && doc.previewUrl; });
    host.replaceChildren();
    host.hidden = !media.length;
    if (!media.length) return;
    host.append(el('h3', 'sykv-media-title', '已导入图片'));
    var grid = el('div', 'sykv-media-grid');
    media.slice(0, 24).forEach(function (doc) {
      var card = el('article', 'sykv-media-card');
      var link = el('a', 'sykv-media-link', '');
      link.href = doc.inVault ? obsidianUrl(doc.path) : doc.previewUrl;
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      var image = el('img', 'sykv-media-image'); image.src = doc.previewUrl; image.alt = doc.title; image.loading = 'lazy';
      link.append(image); card.append(link);
      var caption = el('div', 'sykv-media-caption'); caption.append(el('b', '', doc.title));
      caption.append(el('span', '', doc.inVault ? '在 Obsidian 打开' : '打开本机预览'));
      card.append(caption); grid.append(card);
    });
    host.append(grid);
  }
  function close() {
    if (!state.dialog) return;
    var dialog = state.dialog; state.dialog = null; state.searchId++;
    if (dialog.open) dialog.close(); dialog.remove();
    if (state.lastFocus && state.lastFocus.isConnected) state.lastFocus.focus();
  }
  function dialog(title) {
    close(); state.lastFocus = document.activeElement;
    var node = el('dialog', 'sykv-dialog'); node.setAttribute('aria-labelledby', 'sykv-title');
    var header = el('header'), heading = el('div');
    heading.append(el('span', 'sykv-eyebrow', '上岸鸭 · 本机资料舱'));
    var h2 = el('h2', '', title); h2.id = 'sykv-title'; heading.append(h2); header.append(heading);
    var dismiss = button('×', close); dismiss.className = 'sykv-close'; dismiss.setAttribute('aria-label', '关闭资料舱'); header.append(dismiss);
    var body = el('div', 'sykv-body'); node.append(header, body); document.body.append(node); state.dialog = node;
    node.addEventListener('cancel', function (event) { event.preventDefault(); close(); });
    if (typeof node.showModal === 'function') node.showModal(); else node.setAttribute('open', '');
    return body;
  }
  function clearResults() {
    state.searchId++;
    var results = state.dialog && state.dialog.querySelector('[data-sykv-results]');
    if (results) { results.replaceChildren(); results.append(el('p', 'sykv-note', '输入卡点或关键词，只显示相关资料，最多 5 篇。')); }
  }
  async function runSearch(input) {
    var requestId = ++state.searchId, question = input.value.trim();
    if (!question) { message('先输入你卡住的问题或关键词。'); input.focus(); return; }
    if (state.busy) { message('资料还在读取，请稍等。'); return; }
    var rows = await search(question);
    if (requestId !== state.searchId || !state.dialog) return;
    var results = state.dialog.querySelector('[data-sykv-results]'); if (!results) return;
    results.replaceChildren();
    message(rows.length ? '找到 ' + rows.length + ' 篇相关资料，以下为原文片段。' : '没有找到匹配资料。试试具体概念、报错关键词，或先导入相关文档。');
    rows.forEach(function (row) {
      var card = el('article', 'sykv-result'); card.append(el('h3', '', row.title), el('p', 'sykv-path', row.path), el('pre', 'sykv-snippet', row.text));
      if (row.url) { var link = el('a', 'sykv-note-link', '打开原文'); link.href = row.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.title = '使用 Obsidian 打开这篇笔记'; card.append(link); }
      results.append(card);
    });
  }
  function open(options) {
    var body = dialog('把自己的笔记带进这一关');
    var share=document.createElement('section');share.className='sykv-share';
    var shareTitle=el('h3','','打开分享的 Obsidian 笔记');var uri=el('input');uri.type='text';uri.placeholder='粘贴 obsidian://open?vault=…&file=…';uri.setAttribute('aria-label','Obsidian 分享链接');
    try{uri.value=localStorage.getItem('sy_obsidian_share_link_v1')||'';}catch(_){}
    var direct=el('a','sykv-note-link','打开 Obsidian ↗');var remembered=SYSourceIO.normalizeLinks(uri.value)[0]||'';direct.href=/^obsidian:\/\/open\?/.test(remembered)?remembered:state.name?'obsidian://open?vault='+encodeURIComponent(state.name):'obsidian://choose-vault';
    uri.addEventListener('input',function(){var url=SYSourceIO.normalizeLinks(uri.value)[0]||'';if(/^obsidian:\/\/open\?/.test(url)){direct.href=url;try{localStorage.setItem('sy_obsidian_share_link_v1',url);}catch(_){}}else direct.href='obsidian://choose-vault';});
    share.append(shareTitle,uri,direct);body.append(share);

    var overview = el('p', 'sykv-overview', statusText()); overview.setAttribute('data-sykv-status', '');
    body.append(overview, el('p', 'sykv-intro', '选择 Obsidian 库所在文件夹，搜索已有笔记；卡点答案可以预览后存回。拖入 Markdown、TXT、字幕、PDF 或 Word 也可以直接带进这一关。'));
    var folder = el('input'); folder.type = 'file'; folder.multiple = true; folder.setAttribute('webkitdirectory', ''); folder.setAttribute('data-sykv-folder', ''); folder.hidden = true;
    folder.addEventListener('change', function () { var files = Array.from(folder.files || []); folder.value = ''; importFiles(files, true); });
    var upload = el('input'); upload.type = 'file'; upload.multiple = true; upload.accept = '.md,.txt,.srt,.vtt,.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.gif,.bmp'; upload.hidden = true;
    upload.addEventListener('change', function () { var files = Array.from(upload.files || []); upload.value = ''; importFiles(files, false); });
    var actions = el('div', 'sykv-actions');
    actions.append(button('⚡ 尝试本机直连 / 自动回退', function () { connectLocalVault(); }, state.mode !== 'local'), button(state.handle ? '重新选择 / 刷新知识库' : '连接 Obsidian 文件夹', connect), button('选择文档 / 图片 / PDF / Word', function () { if (!state.busy) upload.click(); }), button('只读导入文件夹', function () { if (!state.busy) folder.click(); }));
    var drop = el('div', 'sykv-dropzone', '把文档拖到这里，或点击上面的选择按钮'); drop.setAttribute('tabindex', '0');
    ['dragenter','dragover'].forEach(function (type) { drop.addEventListener(type, function (event) { event.preventDefault(); drop.classList.add('is-over'); }); });
    ['dragleave','drop'].forEach(function (type) { drop.addEventListener(type, function (event) { event.preventDefault(); drop.classList.remove('is-over'); }); });
    drop.addEventListener('drop', function (event) {
      var files = Array.from(event.dataTransfer.files || []);
      if (files.length) importFiles(files, false);
      else if (window.SYHub) { var value = event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain'); close(); SYHub.open(value); }
    });
    drop.addEventListener('keydown',function(event){ if(event.key==='Enter'||event.key===' '){event.preventDefault();upload.click();} });
    drop.addEventListener('click',function(){upload.click();});
    body.append(actions, drop, folder, upload);
    var media = el('section', 'sykv-media'); media.setAttribute('data-sykv-media', ''); body.append(media); renderMedia();
    var form = el('form', 'sykv-search'); var label = el('label', '', '搜索我的资料'); label.htmlFor = 'sykv-query';
    var input = el('input'); input.id = 'sykv-query'; input.type = 'search'; input.maxLength = 2000; input.placeholder = '例如：React 状态更新、写作提纲、视频剪辑报错'; input.value = options && options.query || '';
    var submit = el('button', 'sykv-primary', '搜索笔记'); submit.type = 'submit';
    form.append(label, input, submit); form.addEventListener('submit', function (event) { event.preventDefault(); runSearch(input); }); body.append(form);
    var msg = el('p', 'sykv-message', state.summary); msg.setAttribute('role', 'status'); msg.setAttribute('data-sykv-message', ''); body.append(msg);
    var results = el('div', 'sykv-results'); results.setAttribute('data-sykv-results', ''); body.append(results); clearResults();
    body.append(el('p', 'sykv-note', '最多扫描 500 份资料；每份文件不超过 5 MB。连接目录会读取 Markdown 和常见图片；拖拽上传支持 .md / .txt / .srt / .pdf / .docx / .png / .jpg / .webp / .gif。上传图片会尝试本机文字识别，失败时保留预览并显示原因；目录内图片仅预览。Markdown 笔记可用真实 Obsidian 链接打开。资料只留在当前页面内存，刷新后需重新连接。'));
    if (input.value) runSearch(input);
    if (options && options.action === 'upload') upload.click();
    input.focus();
  }

  function safeHttp(url) { try { var parsed = new URL(String(url || '')); return /^https?:$/.test(parsed.protocol) ? parsed.href : ''; } catch (_) { return ''; } }
  function markdown(payload) {
    var task = typeof payload.task === 'object' ? (payload.task.name || payload.task.title || '') : (payload.task || '');
    var lines = ['# ' + String(payload.title || '卡点救援记录').replace(/[\r\n]/g, ' ').slice(0, 160), '', '记录时间：' + new Date().toLocaleString('zh-CN'), ''];
    if (task) lines.push('当前任务：' + String(task).slice(0, 1000), '');
    lines.push('## 我遇到的问题', '', String(payload.question || '').slice(0, 12000), '', '## 这次的解法', '', String(payload.reply || payload.answer || '').slice(0, 40000), '');
    var sources = Array.isArray(payload.sources) ? payload.sources : [];
    if (sources.length) { lines.push('## 参考来源', ''); sources.slice(0, 20).forEach(function (source) {
      var url = safeHttp(source.url); if (url) lines.push('- ' + String(source.title || '网页资料').replace(/[\r\n]/g, ' ').slice(0, 200) + '：<' + url.replace(/>/g, '%3E') + '>');
    }); }
    lines.push('', '## 我的验证结果', '', '- [ ] 已按步骤尝试', '- [ ] 已确认解决', '');
    return lines.join('\n');
  }
  function fileName(payload) {
    var day = new Date(), stamp = day.getFullYear() + String(day.getMonth() + 1).padStart(2, '0') + String(day.getDate()).padStart(2, '0');
    var label = String(payload.question || payload.title || '卡点记录').replace(/[<>:"/\\|?*\u0000-\u001f\s]+/g, '-').replace(/[. -]+$/g, '').slice(0, 36) || '卡点记录';
    var id = window.crypto && typeof window.crypto.randomUUID === 'function' ? window.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    return stamp + '-' + label + '-' + id + '.md';
  }
  function download(text, name) {
    var url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    var link = el('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }
  function saveRescue(payload) {
    payload = payload || {};
    var text = payload.routeText || markdown(payload), name = fileName(payload), handle = state.handle, vaultName = state.name;
    var category=String(payload.folder||'').replace(/[<>:"/\\|?*\u0000-\u001f]+/g,'-').replace(/[. ]+$/g,'').slice(0,50),folderPath='FocusQuest'+(category?'/'+category:'');
    var body = dialog('先看一眼，再存进知识库');
    body.append(el('p', 'sykv-intro', handle ? '确认后将在「' + vaultName + '」的新建 FocusQuest 文件夹中写入一篇新笔记。已有笔记不会覆盖。' : '当前没有可写入的知识库目录。可以先下载 Markdown，或连接目录后重新打开保存。'));
    body.append(el('p', 'sykv-path', '新文件：'+folderPath+'/' + name));
    var preview = el('pre', 'sykv-preview', text); preview.tabIndex = 0; preview.setAttribute('aria-label', '即将保存的 Markdown 完整内容'); body.append(preview);
    var msg = el('p', 'sykv-message'); msg.setAttribute('data-sykv-message', ''); msg.setAttribute('role', 'status'); body.append(msg);
    var actions = el('div', 'sykv-actions'), saving = false;
    if (handle) {
      var confirm = button('确认新建到 Obsidian', async function () {
        if (saving) return; saving = true; confirm.disabled = true;
        var writable = null;
        try {
          if (!handle.requestPermission || await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('没有获得写入权限。可以下载 Markdown，手动放进知识库。');
          var dir = await handle.getDirectoryHandle('FocusQuest', { create: true });
          if(category)dir=await dir.getDirectoryHandle(category,{create:true});
          try { await dir.getFileHandle(name); throw new Error('这个文件名已经存在，本次没有覆盖。请关闭后重新打开保存。'); }
          catch (error) { if (error.name !== 'NotFoundError') throw error; }
          var target = await dir.getFileHandle(name, { create: true });
          writable = await target.createWritable(); await writable.write(text); await writable.close(); writable = null;
          if (state.handle === handle && state.docs.length < LIMIT) state.docs.push(makeDoc({ lastModified: Date.now() }, folderPath+'/' + name, text, true));
          message('已新建到「' + vaultName + '」/ FocusQuest。保存成功，可以去 Obsidian 查看。');
          confirm.textContent = '已保存';
          var link = el('a', 'sykv-note-link', '在 Obsidian 打开新笔记'); link.href = 'obsidian://open?vault=' + encodeURIComponent(vaultName) + '&file=' + encodeURIComponent(folderPath+'/' + name); actions.append(link); announce();
        } catch (error) {
          if (writable) { try { await writable.abort(); } catch (_) {} }
          message(error.message || '写入没有完成。请检查目录权限，或下载 Markdown。', true);
          confirm.disabled = false; saving = false;
        }
      }, true); actions.append(confirm);
    } else if (state.mode === 'local') actions.append(button('确认新建到本机库 / FocusQuest', async function () {
      if (saving) return; saving = true;
      var btn = this; btn.disabled = true;
      try {
        var r2 = await SY.backendCall('/api/vault-save', { title: name.replace(/\.md$/i, ''), text: text }, 60000);
        if (!r2.ok) throw new Error(r2.error || '本机服务没有写入成功。');
        state.docs.push(makeDoc({ lastModified: Date.now(), type: '' }, r2.data.path, text, true));
        message('已新建到「' + vaultName + '/' + r2.data.path + '」。已有笔记没有被覆盖。');
        announce();
      } catch (error) { message(error.message || '写入没有完成，可以改为下载 Markdown。', true); btn.disabled = false; saving = false; }
    }, true));
    else actions.append(button('先连接知识库', function () { open(); }, true));
    actions.append(button('下载 Markdown', function () { download(text, name); message('已请求浏览器下载 Markdown；这不代表已写入 Obsidian。'); }), button('取消', close));
    body.append(actions);
  }

  function saveRoute(payload){
    var lines=['# '+String(payload.title||'学习路线'),'','分类：'+String(payload.title||'学习路线'),''];
    function walk(nodes,depth){(nodes||[]).forEach(function(n){lines.push('#'.repeat(Math.min(6,depth))+' '+n.title,'', '- ['+(n.done?'x':' ')+'] '+(n.proof||'完成本节内容'),'');if(n.material)lines.push(n.material,'');var source=n.originUrl||n.sourceUrl;if(source)lines.push('原文：'+source,'');walk(n.children,depth+1);});}
    walk(payload.levels,2);if((payload.links||[]).length)lines.push('## 全部来源','',payload.links.join('\n'));
    saveRescue({title:payload.title,folder:payload.title,routeText:lines.join('\n')});
  }
  function toolbar() {
    var host = document.getElementById('knowledgeBody'); if (!host || host.querySelector('[data-sykv-toolbar]')) return;
    var bar = el('section', 'sykv-toolbar'); bar.setAttribute('data-sykv-toolbar', '');
    var intro = el('div'); intro.append(el('h3', '', '自己的知识，随时来救场'));
    var info = el('p', '', statusText()); info.setAttribute('data-sykv-status', ''); intro.append(info);
    var actions = el('div', 'sykv-actions'); actions.append(button('连接 Obsidian', function () { open(); }, true), button('连接 AI 并使用资料', function () { if (window.SYRescue) SYRescue.open({ taskName: '知识库资料整理', useNotes: true }); else open(); }), button('上传文档', function () { open({ action: 'upload' }); }), button('搜索我的资料', function () { open(); }));
    bar.append(intro, actions); host.prepend(bar);
  }
  function install() {
    if (!window.SY || typeof window.SY.renderKnowledgeView !== 'function') return false;
    var previous = window.SY.renderKnowledgeView;
    if (!previous.syKnowledgeWrapped) {
      var wrapped = function () { var result = previous.apply(this, arguments); toolbar(); return result; };
      wrapped.syKnowledgeWrapped = true; window.SY.renderKnowledgeView = wrapped;
    }
    toolbar(); return true;
  }
  window.SYKnowledge = { open: open, close: close, search: search, saveRescue: saveRescue, saveRoute: saveRoute, getStatus: status };
  document.addEventListener('click', function (e) { if (e.target.closest('[data-open-vault]')) open(); });
  Object.defineProperties(window.SYKnowledge, { connected: { get: function () { return status().connected; } }, vaultName: { get: function () { return state.name; } } });
  if (!install()) { document.addEventListener('sy:ready', install); var attempts = 0, timer = setInterval(function () { if (install() || ++attempts >= 100) clearInterval(timer); }, 100); }
})();
