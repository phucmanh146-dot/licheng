(function () {
  'use strict';
  let dialog, owner, token, project, selectedRun, poll, lastFocus;
  let materials = [], frames = [], mediaKind = '', working = false, generation = 0;
  let originalBody = '', analysisView = false, filledRun = '', autoFillRun = '', sourceSignature = '';
  const ocrSources = new WeakMap();
  const draftsByOwner = new Map(), wxChosen = new Map();
  let pool = [], vaults = [], activeVault = '', stagedBody = '';
  const sourceName = source => ({obsidian:'Obsidian',wechat:'微信',web:'网页',manual:'手动 / 文件'}[source] || '资料');
  const $ = q => dialog && dialog.querySelector(q);
  const n = (tag, value, cls) => { const e = document.createElement(tag); if (value != null) e.textContent = value; if (cls) e.className = cls; return e; };
  const button = (label, fn, cls) => { const b = n('button', label, cls); b.type = 'button'; b.onclick = fn; return b; };
  const option = (label, value) => { const e = n('option', label); e.value = value; return e; };
  const acct = () => String(window.SY && SY.currentAccountKey || '');
  function notify(message, error) { const el = $('[data-status]'); if (el) { el.textContent = message; el.classList.toggle('is-error', !!error); } }
  function field(label, type, name, placeholder) { const l = n('label', label); const e = n(type === 'textarea' ? 'textarea' : 'input'); if (type !== 'textarea') e.type = type; e.name = name; e.placeholder = placeholder || ''; l.append(e); return l; }
  function value(name) { return $('[name="' + name + '"]').value.trim(); }
  function link(label, value) { try { const u = new URL(value); if (!/^https?:$/.test(u.protocol)) throw 0; const a = n('a', label); a.href = u.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; } catch (_) { return n('span', label); } }
  async function api(path, body) {
    const capturedOwner = owner, capturedGeneration = generation, controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    let response;
    try { response = await fetch(path, { signal: controller.signal, method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json', 'X-Growth-Token': token } : {}, body: body ? JSON.stringify(body) : undefined }); }
    catch (e) { throw new Error(e.name === 'AbortError' ? '本次请求超时。已保存的处理记录可稍后继续。' : '本机资料服务未连接，请使用“启动资料行动”入口打开原工作台。'); }
    finally { clearTimeout(timeout); }
    if (capturedGeneration !== generation) throw new Error('窗口已切换。');
    let data; try { data = await response.json(); } catch (_) { throw new Error('资料服务未响应，请使用电脑上的“上岸鸭资料行动”启动入口。'); }
    if (!response.ok) throw new Error((data.code ? '[' + data.code + '] ' : '') + (data.error || '这一步未完成。'));
    if (capturedOwner !== acct()) throw new Error('资料空间已切换，请重新打开窗口。');
    return data;
  }
  async function guarded(fn) { if (working) return; working = true; const current = generation, buttons = dialog ? [...dialog.querySelectorAll('[data-run],[data-collect],[data-analyze],[data-wechat-search],[data-ocr]')] : []; buttons.forEach(b => b.disabled = true); try { await fn(); } catch (e) { if (current === generation) notify(e.message, true); } finally { if (current === generation) working = false; buttons.filter(b => b.isConnected).forEach(b => b.disabled = false); } }
  function close() {
    if (dialog && owner) {
      const draft = {project, stagedBody};
      for (const k of ['title','outcome','links','text','question','deadline','dailyMinutes']) draft[k] = k === 'text' && analysisView ? originalBody : value(k);
      draftsByOwner.set(owner, draft);
    }
    generation++; clearTimeout(poll); if (dialog) { dialog.close(); dialog.remove(); dialog = null; } if (lastFocus && lastFocus.isConnected) lastFocus.focus();
  }
  function open(prefill) {
    if (!window.SY || !acct()) return;
    close(); owner = acct(); token = ''; project = null; selectedRun = null; materials = []; frames = []; mediaKind = ''; working = false;
    pool = []; vaults = []; activeVault = ''; wxChosen.clear();
    const draft = (!prefill || prefill.wechatCapture || prefill.focusObsidian) ? draftsByOwner.get(owner) : null;
    if (draft) project = draft.project;
    stagedBody = draft?.stagedBody || '';
    originalBody = ''; analysisView = false; filledRun = ''; autoFillRun = ''; sourceSignature = '';
    lastFocus = document.activeElement;
    dialog = n('dialog', null, 'growth-dialog'); dialog.setAttribute('aria-labelledby', 'growth-title');
    const header = n('header', null, 'growth-head'), titles = n('div'); titles.append(n('p', '把资料变成下一步', 'growth-eyebrow'), n('h2', '资料 → 行动'));
    titles.querySelector('h2').id = 'growth-title'; header.append(titles, button('关闭', close)); dialog.append(header);
    const status = n('p', '正在连接本机资料服务…', 'growth-status'); status.dataset.status = ''; status.setAttribute('role', 'status'); dialog.append(status);
    const body = n('div', null, 'growth-layout'), left = n('section', null, 'growth-compose'), right = n('section', null, 'growth-output');
    const select = n('select'); select.dataset.projects = ''; select.setAttribute('aria-label', '选择学习或竞赛目标'); select.append(option('新建目标', ''));
    select.onchange = () => { project = (select._projects || []).find(p => p.id === select.value) || null; fillProject(); };
    left.append(n('h3', '01 / 这次要完成什么'), select, field('目标名称', 'text', 'title', '例如：完成竞赛方案、学会一个新技能'), field('交付要求 / 当前基础', 'textarea', 'outcome', '要交什么？已有进展？还缺什么？'));
    const presets = n('div', null, 'growth-presets');
    for (const label of ['挑战杯项目', '互联网+项目', '学习成长']) presets.append(button(label, () => { if (!value('title')) $('[name=title]').value = label; $('[name=outcome]').focus(); }));
    left.append(presets);
    const row = n('div', null, 'growth-row'); row.append(field('截止日期', 'date', 'deadline'), field('每天可投入（分钟）', 'number', 'dailyMinutes')); left.append(row);
    left.append(button('保存目标', () => guarded(async () => { await saveProject(); notify('目标已保存，资料和后续任务会关联到这里。'); })));
    left.append(n('h3', '02 / 带入资料与卡点'), field('你要解决的问题', 'textarea', 'question', '例如：这些资料中，哪种方法最适合我？具体应该怎么做？'), field('链接 / 分享文字', 'textarea', 'links', '百度、微信公众号、抖音、哔哩哔哩、飞书或其他网页；直接粘贴复制的整段分享文字'), field('正文 / 笔记 / 字幕', 'textarea', 'text', '可粘贴原始资料；针对问题的解析完成后会写到这里'));
    const sources = n('div', null, 'growth-source-actions');
    sources.append(button('打开我的 Obsidian', () => guarded(connectObsidian)), button('微信搜索 / 窗口跟随', () => {
      const panel = $('[data-wechat-panel]'); panel.open = true; panel.scrollIntoView({block:'nearest'});
    }), button('把当前正文加入资料池', () => guarded(async () => {
      const content = analysisView ? originalBody : value('text');
      await addPool([{source:'manual',title:value('title') || '手动正文',content}]);
      $('[name=text]').value = ''; originalBody = ''; analysisView = false; $('[data-body-info]').replaceChildren();
    })));
    const obsidian = n('div'); obsidian.dataset.obsidian = '';
    const poolHost = n('section', null, 'growth-pool'); poolHost.dataset.pool = ''; poolHost.setAttribute('aria-label','蓝色资料池');
    left.append(sources, obsidian, poolHost);
    const bodyInfo = n('div', null, 'growth-hint'); bodyInfo.dataset.bodyInfo = ''; left.append(bodyInfo);
    const upload = n('input'); upload.type = 'file'; upload.multiple = true; upload.accept = '.pdf,.doc,.docx,.txt,.md,.srt,.vtt,image/*,video/mp4,video/webm,video/quicktime'; upload.hidden = true;
    upload.onchange = () => { const files = Array.from(upload.files); upload.value = ''; guarded(() => importFiles(files)); };
    const drop = button('＋ 拖入文档、图片或视频，也可点击选择', () => upload.click(), 'growth-drop');
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('is-over'); }; drop.ondragleave = () => drop.classList.remove('is-over'); drop.ondrop = e => { e.preventDefault(); drop.classList.remove('is-over'); guarded(() => importFiles(Array.from(e.dataTransfer.files))); };
    const fileList = n('div', null, 'growth-materials'); fileList.dataset.materials = '';
    left.append(upload, drop, n('p', '文档每份 ≤5 MB。视频提取最多6张带时间点的画面；声音内容请同时提供字幕。', 'growth-hint'), fileList);
    const search = n('label', null, 'growth-check'); const check = n('input'); check.type = 'checkbox'; check.name = 'search'; search.append(check, document.createTextNode('结合当前目标联网搜索，保留来源链接')); left.append(search);
    const collect = button('读取并保存全部链接', () => guarded(() => begin(true)), 'growth-primary'); collect.dataset.collect = ''; left.append(collect);
    left.append(n('p', '最多100条链接，自动去重、逐条保存。某条失败不影响其他链接；只读取资料不需要连接AI。', 'growth-hint'));
    const analyze = button('按问题解析并写入正文', () => guarded(() => begin(false, true)), 'growth-primary'); analyze.dataset.analyze = ''; left.append(analyze);
    const start = button('解析资料，生成行动草稿 →', () => guarded(() => begin(false)), 'growth-primary'); start.dataset.run = ''; left.append(start);
    const wx = n('details'); wx.dataset.wechatPanel = ''; wx.append(n('summary', '微信资料助手 · 搜索、跟随与框选')); const wxBody = n('div', null, 'growth-wechat');
    wxBody.append(field('微信搜索关键词', 'text', 'wxDirectKeyword', '直接搜索，例如：Agent 比赛 / 资料 / RAG'));
    const wxDirect = button('打开微信并读取关键词', () => guarded(async () => {
      const keyword = value('wxDirectKeyword'); if (!keyword) throw new Error('先输入要在微信中查找的关键词。');
      notify('正在打开电脑上的微信并搜索“' + keyword + '”…');
      const result = await api('/api/growth/wechat-search', { keyword });
      renderWechat(result);
      notify(result.empty ? '微信返回无匹配结果。' : '结果已列出，请勾选需要的消息，再加入资料池。');
    })); wxDirect.dataset.wechatSearch = ''; wxBody.append(wxDirect, n('p', '使用这台电脑已登录的微信。搜索结果先列出，由你勾选；不会发送消息。', 'growth-hint'));
    const wxResults = n('div'); wxResults.dataset.wechatResults = ''; wxBody.append(wxResults);
    wxBody.append(button('跟随微信窗口 / 像截图一样框选', () => {
      const entry = document.getElementById('syRemoteEntry');
      if (!entry) return notify('微信跟随面板尚未安装，请更新原工作台的资料行动扩展。', true);
      window.SYRemoteRequest = { keyword: value('wxDirectKeyword') }; close(); entry.click();
    }));
    const groupDetails = n('details'); groupDetails.append(n('summary', '只查某个群（选填）')); const groupBody = n('div'); groupDetails.append(groupBody);
    groupBody.append(field('群聊名', 'text', 'wxQuery', '输入要查找的群名'), button('查找群聊', () => guarded(async () => { const result = await api('/api/growth/wechat-group-list', { query: value('wxQuery') }); const select = $('[data-groups]'); select.replaceChildren(option('选择实际查到的群聊', '')); result.groups.forEach(g => select.append(option(g.name, g.id))); notify('找到 ' + result.groups.length + ' 个群聊。'); })));
    const groups = n('select'); groups.dataset.groups = ''; groups.setAttribute('aria-label', '选择微信群聊'); groups.append(option('先查找群聊', '')); groupBody.append(groups, field('消息关键词', 'text', 'wxKeyword', '分享 / feishu / 爬楼'));
    groupBody.append(button('读取匹配消息', () => guarded(async () => { if (!groups.value) throw new Error('先选择查到的群聊。'); const result = await api('/api/growth/wechat-group-messages', { id: groups.value, keyword: value('wxKeyword') }); renderWechat(result); notify('消息已列出，请勾选后加入资料池。'); }))); wxBody.append(groupDetails); wx.append(wxBody); left.append(wx);
    right.append(n('h3', '03 / 核对来源与行动')); const out = n('div'); out.dataset.result = ''; out.append(n('div', '先带入一份资料。处理完成后，在这里核对核心内容、差距和任务草稿。', 'growth-empty')); right.append(out);
    const history = n('details'); history.open = true; history.append(n('summary', '处理记录 · 中断后继续')); const historyList = n('div'); historyList.dataset.history = ''; history.append(historyList); right.append(history);
    const memos = n('details'); memos.append(n('summary', '已保存备忘')); const memoList = n('div'); memoList.dataset.memos = ''; memos.append(memoList); right.append(memos);
    const connection = n('details'); connection.append(n('summary', '模型与联网连接')); const connections = n('div'); connections.dataset.connections = ''; connection.append(connections); right.append(connection);
    body.append(left, right); dialog.append(body); dialog.addEventListener('cancel', e => { e.preventDefault(); close(); }); document.body.append(dialog); dialog.showModal();
    $('[name=dailyMinutes]').value = '60'; $('[name=dailyMinutes]').min = '5'; $('[name=dailyMinutes]').max = '720';
    for (const key of ['title', 'outcome', 'links', 'text', 'question','deadline','dailyMinutes']) {
      const initial = prefill && typeof prefill[key] === 'string' ? prefill[key] : draft && draft[key];
      if (initial != null) $('[name="' + key + '"]').value = initial;
    }
    drawMemos();
    drawPool();
    guarded(async () => {
      token = (await api('/api/growth/session')).token;
      pool = (await api('/api/growth/materials?account=' + encodeURIComponent(owner))).materials; drawPool();
      await refresh(); await renderConnections(); await refreshObsidian();
      if (prefill?.wechatCapture) await importWechatCapture(prefill.wechatCapture);
      else if (prefill?.focusObsidian) await connectObsidian();
      else notify('已连接。勾选资料后提问，资料池和处理记录会持续保存在这台电脑。');
    });
  }
  function fillProject() { for (const k of ['title', 'outcome', 'deadline', 'dailyMinutes']) $('[name="' + k + '"]').value = project ? project[k] : k === 'dailyMinutes' ? 60 : ''; }
  async function saveProject() { project = await api('/api/growth/project', { account: owner, id: project && project.id, version: project && project.version, title: value('title'), outcome: value('outcome'), deadline: value('deadline'), dailyMinutes: Number(value('dailyMinutes')) }); await refresh(false); return project; }
  async function refresh(selectLatest = true) {
    const state = await api('/api/growth/state?account=' + encodeURIComponent(owner)); if (!dialog) return;
    const select = $('[data-projects]'); select._projects = state.projects; select.replaceChildren(option('新建目标', '')); state.projects.forEach(p => select.append(option(p.title, p.id))); if (project) select.value = project.id;
    const host = $('[data-history]'); host.replaceChildren();
    state.runs.forEach(run => { const b = button(historyLabel(run), () => loadRun(run.id).catch(e => notify(e.message, true))); b.dataset.historyRun = run.id; host.append(b); });
    if (selectLatest && state.runs.length) showRun(state.runs[0]);
  }
  async function addPool(items) {
    const result = await api('/api/growth/materials-add', {account:owner, materials:items});
    pool = result.materials; drawPool();
    notify('已加入资料池：' + result.addedIds.length + ' 份；重复资料 ' + result.existingIds.length + ' 份已选中。');
    return result;
  }
  function drawPool() {
    const host = $('[data-pool]'); if (!host) return; host.replaceChildren();
    const chosen = pool.filter(m => m.selected);
    host.append(n('h3', '资料池 · 已选 ' + chosen.length + ' / ' + pool.length), n('p', '按问题解析使用勾选的正文与本次上传的画面。每次最多12份正文、合计60000字。', 'growth-hint'));
    if (!pool.length) host.append(n('p', '双击 Obsidian 笔记、勾选微信消息，或导入网页正文。', 'growth-hint'));
    pool.forEach(m => {
      const card = n('article', null, 'growth-pool-item'); card.dataset.materialId = m.id;
      const label = n('label', null, 'growth-check'), check = n('input'); check.type = 'checkbox'; check.checked = m.selected;
      check.onchange = () => { if (working) {check.checked = m.selected; return;} guarded(async () => {
        try {pool = (await api('/api/growth/materials-change', {account:owner,id:m.id,action:'select',selected:check.checked})).materials; drawPool();}
        catch (e) {check.checked = m.selected; throw e;}
      }); };
      label.append(check, n('strong', m.title)); card.append(label, n('small', sourceName(m.source) + ' · ' + m.content.length + '字'));
      const detail = n('details'); detail.append(n('summary', '查看正文与来源'), n('pre', m.content));
      if (m.sourceRef) detail.append(n('p', m.sourceRef, 'growth-hint'));
      card.append(detail, button('移除', () => guarded(async () => {pool = (await api('/api/growth/materials-change',{account:owner,id:m.id,action:'remove'})).materials; drawPool();})));
      host.append(card);
    });
    const chips = n('div', null, 'growth-context'); chips.setAttribute('aria-label','当前使用资料');
    chosen.forEach(m => chips.append(n('span', sourceName(m.source) + ' · ' + m.title)));
    host.append(chips);
  }
  async function refreshObsidian() {
    const state = await api('/api/growth/obsidian-status');
    vaults = state.vaults || []; activeVault = vaults.some(v => v.vaultId === activeVault) ? activeVault : state.activeVaultId || '';
    const host = $('[data-obsidian]'); if (!host) return; host.replaceChildren();
    host.append(n('p', state.connected ? 'Obsidian 已连接 · 下面是实际打开过的笔记' : 'Obsidian 未连接。首次使用需在当前知识库启用“上岸鸭 Bridge”。', 'growth-hint'), button('刷新最近笔记', () => guarded(refreshObsidian)));
    if (!state.connected) return;
    if (vaults.length > 1) {
      const select = n('select'); select.setAttribute('aria-label','选择已连接知识库');
      vaults.forEach(v => select.append(option(v.name,v.vaultId))); select.value = activeVault;
      select.onchange = () => {activeVault = select.value; drawNotes();}; host.append(select);
    }
    const notes = n('div'); host.append(notes);
    function drawNotes() {
      const vault = vaults.find(v => v.vaultId === activeVault); notes.replaceChildren(); if (!vault) return;
      notes.append(n('h4', vault.name), n('p', '双击笔记直接加入资料池，也可以点击“导入”。', 'growth-hint'));
      if (!vault.recent.length) notes.append(n('p','请先在 Obsidian 打开一篇笔记，然后刷新。'));
      vault.recent.forEach(note => {
        const use = () => guarded(async () => {
          notify('正在读取笔记正文…');
          const result = await api('/api/growth/obsidian-import',{account:owner,vaultId:vault.vaultId,path:note.path});
          pool = result.materials; drawPool(); notify('已加入并选中：' + note.title);
        });
        const row = n('div', null, 'growth-note-row'), name = button(note.title, () => {});
        name.title = note.path; name.ondblclick = use; name.onkeydown = e => {if(e.key === 'Enter'){e.preventDefault();use();}};
        row.append(name,button('导入',use)); notes.append(row);
      });
    }
    drawNotes();
  }
  async function connectObsidian() {
    await refreshObsidian();
    const vault = vaults.find(v => v.vaultId === activeVault), a = n('a');
    a.href = vault ? 'obsidian://open?vault=' + encodeURIComponent(vault.name) : (await api('/api/growth/obsidian-connect',{})).url;
    if (!a.href.startsWith('obsidian://')) throw Error('Obsidian 打开地址无效。');
    document.body.append(a); a.click(); a.remove();
    notify(vault ? '已请求打开知识库，可双击最近笔记导入。' : '已请求打开 Obsidian。启用 Bridge 后点“刷新最近笔记”；配对链接60秒内有效。');
    const current = generation;
    setTimeout(() => {if (dialog && current === generation) refreshObsidian().catch(e => notify(e.message,true));}, 2500);
  }
  async function importWechatCapture(data) {
    if (typeof data.text !== 'string' || !data.text.trim()) throw Error('所选微信内容没有可用正文。');
    const messages = Array.isArray(data.messages) ? data.messages : [];
    await addPool([{source:'wechat',title:'微信 · ' + (data.keyword || '所选内容'),content:data.text,
      sourceRef:'微信所选消息 / 框选区域',metadata:{groupName:[...new Set(messages.map(m => m.group).filter(Boolean))].join('、')}}]);
    offerIntent();
  }
  function offerIntent() {
    const host = $('[data-wechat-results]'); if (!host) return;
    const actions = n('div',null,'growth-intents'); actions.append(n('h4','你想用这些资料做什么？'));
    for (const [label,question] of [['总结重点','总结所选资料的重点，并标明来源。'],['提取老师建议','提取资料中的老师建议，区分原话和推断。'],['生成任务','根据所选资料生成有优先级、交付物和验收条件的任务。'],['竞赛策略','基于所选资料分析竞赛策略，列出证据和待核实事项。']]) {
      actions.append(button(label,()=>{$('[name=question]').value=question;$('[name=question]').focus();}));
    }
    host.append(actions); $('[data-wechat-panel]').open = true;
  }
  function drawMaterials() {
    const host = $('[data-materials]'); if (!host) return; host.replaceChildren();
    materials.forEach((m, i) => {
      const row = n('div', null, 'growth-material'); row.append(n('span', m.title + ' · ' + m.text.length + '字'), button('移除', () => { if (!working) { materials.splice(i, 1); drawMaterials(); } }));
      if (m.kind === 'frame-text') {
        const detail = n('details'); detail.append(n('summary', '核对画面文字'), n('pre', m.text)); row.append(detail);
        row.append(button('追加到正文', () => {
          if (working) return;
          const raw = analysisView ? originalBody : value('text');
          $('[name=text]').value = [raw, m.text].filter(Boolean).join('\n\n');
          originalBody = ''; analysisView = false; filledRun = ''; $('[data-body-info]').replaceChildren();
          materials.splice(materials.indexOf(m), 1); drawMaterials(); notify('画面文字已追加到正文，请核对识别结果。');
        }));
      }
      host.append(row);
    });
    if (frames.length) {
      const previews = n('details'); previews.append(n('summary', '查看 ' + frames.length + ' 张采样画面'));
      frames.forEach(f => { const img = n('img'); img.src = f.image; img.alt = (f.sourceName || '上传画面') + ' · ' + f.timestamp + ' 秒'; img.style.cssText = 'max-width:100%;max-height:240px'; previews.append(n('p', img.alt), img); });
      const read = button('识别画面文字 / 屏幕字幕', () => guarded(readFrameText)); read.dataset.ocr = '';
      host.append(previews, read, n('p', '本机识别采样画面中的可见文字，不需要 AI 密钥；不包含声音或完整视频字幕。', 'growth-hint'), button('移除画面', () => { if (!working) { frames = []; drawMaterials(); } }));
    }
  }
  async function readFrameText() {
    const current = generation, selected = frames.slice(); let added = 0;
    for (const [i, frame] of selected.entries()) {
      if (ocrSources.has(frame)) continue;
      if (materials.length >= 12) throw new Error('本次最多12份正文资料；已识别的部分保留，请先移除不需要的资料。');
      notify('正在本机识别画面 ' + (i + 1) + ' / ' + selected.length + '…');
      const doc = await api('/api/growth/ocr-frame', { image: frame.image }); if (current !== generation) return;
      const text = (doc.lines || []).map(line => line.text).filter(Boolean).join('\n').trim();
      if (!text) continue;
      if (text.length > 29000) throw new Error('这张画面文字过多，请分区域导入；前面已识别的部分保留。');
      const title = (frame.sourceName || '上传画面') + ' · ' + frame.timestamp + '秒';
      const material = { title: '画面文字 · ' + title, kind: 'frame-text', text: '来源：' + title + '\n仅采样画面的可见文字，可能有识别错误；不含音轨。\n\n' + text };
      await addPool([{source:'manual',title:material.title,content:material.text,sourceRef:title}]); ocrSources.set(frame, material); added++; drawMaterials();
    }
    notify(added ? '已带入 ' + added + ' 份画面文字。可展开核对、追加到正文；按问题分析仍需有效模型连接。' : '没有新增文字。画面可能没有清晰文字，或这些画面已经识别。');
  }
  function renderWechat(result) {
    const host = $('[data-wechat-results]'); host.replaceChildren();
    if (result.groups && result.groups.length) { host.append(n('h4', '匹配群聊')); result.groups.forEach(g => {
      const row = n('div'); row.append(n('strong',g.name));
      if (g.id) row.append(button('选择此群查消息',()=>guarded(async()=>{
        const keyword=value('wxDirectKeyword') || value('wxKeyword');
        if(!keyword)throw Error('先填写消息关键词。');
        renderWechat(await api('/api/growth/wechat-group-messages',{id:g.id,keyword}));
      })));
      host.append(row);
    }); }
    if (result.conversations && result.conversations.length) { const box = n('details'); box.append(n('summary', '匹配会话（尚未展开消息）')); result.conversations.forEach(t => box.append(n('p', t))); host.append(box); }
    const summary = n('p'), chosenList = n('div');
    const update = () => {summary.textContent = '已勾选 ' + wxChosen.size + ' 条（切换搜索后保留）'; chosenList.replaceChildren(); wxChosen.forEach((m,key)=>chosenList.append(button('移除所选：' + m.text.slice(0,40),()=>{wxChosen.delete(key);renderWechat(result);})));};
    if (result.messages && result.messages.length) {
      host.append(n('h4','可读取消息 · ' + result.messages.length));
      result.messages.forEach(m => {
        if(typeof m.text !== 'string' || !m.text.trim())return;
        const key=JSON.stringify([m.group||'',m.sender||'',m.time||'',m.text]), row=n('label',null,'growth-wx-choice'),check=n('input');
        check.type='checkbox';check.checked=wxChosen.has(key);
        check.onchange=()=>{if(check.checked && wxChosen.size>=100){check.checked=false;return notify('最多选择100条消息。',true);} if(check.checked)wxChosen.set(key,m);else wxChosen.delete(key);update();};
        row.append(check,n('pre',(m.group?'群聊：'+m.group+'\n':'')+m.text));host.append(row);
      });
    }
    host.append(summary,chosenList,button('将所选消息加入资料池',()=>guarded(async()=>{
      const messages=[...wxChosen.values()];if(!messages.length)throw Error('先勾选需要的消息。');
      const text=messages.map(m=>(m.group?'群聊：'+m.group+'\n':'')+(m.time?'时间：'+m.time+'\n':'')+m.text).join('\n\n');
      await importWechatCapture({text,keyword:result.keyword||value('wxDirectKeyword'),messages});wxChosen.clear();update();
    }),'growth-primary'));update();
  }
  function once(el, event) { return new Promise((resolve, reject) => { const timer = setTimeout(() => done(new Error('媒体读取超时，请换一个文件重试。')), 20000); function done(err) { clearTimeout(timer); el.removeEventListener(event, ok); el.removeEventListener('error', fail); err ? reject(err) : resolve(); } const ok = () => done(), fail = () => done(new Error('浏览器无法解码此媒体，请换为 JPG、MP4 或 WebM。')); el.addEventListener(event, ok, { once: true }); el.addEventListener('error', fail, { once: true }); }); }
  function jpeg(el) { const w = el.videoWidth || el.naturalWidth, h = el.videoHeight || el.naturalHeight; if (!w || !h) throw new Error('无法读取画面尺寸。'); const canvas = document.createElement('canvas'); for (const max of [1700, 1000]) { const scale = Math.min(1, max / w, max * .9 / h); canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale); canvas.getContext('2d').drawImage(el, 0, 0, canvas.width, canvas.height); const image = canvas.toDataURL('image/jpeg', .8); if (image.length <= 1000000) return image; } throw new Error('采样画面过大，请裁剪后重试。'); }
  async function mediaFrames(file) {
    const url = URL.createObjectURL(file), isVideo = file.type.startsWith('video/'), element = document.createElement(isVideo ? 'video' : 'img');
    try { if (isVideo) { element.muted = true; element.preload = 'auto'; } const ready = once(element, isVideo ? 'loadeddata' : 'load'); element.src = url; await ready;
      if (!isVideo) return [{ timestamp: 0, image: jpeg(element) }];
      if (!Number.isFinite(element.duration) || element.duration <= 0) throw new Error('视频时长无效。');
      const result = [], end = Math.max(0, element.duration - .02);
      for (const time of [...new Set(Array.from({ length: 6 }, (_, i) => Math.min(end, element.duration * i / 5)))]) { if (Math.abs(element.currentTime - time) > .001) { const seeked = once(element, 'seeked'); element.currentTime = time; await seeked; } result.push({ timestamp: Math.round(time * 1000) / 1000, image: jpeg(element) }); } return result;
    } finally { element.removeAttribute('src'); if (isVideo) element.load(); URL.revokeObjectURL(url); }
  }
  async function importFiles(files) {
    const current = generation;
    for (const file of files.slice(0, 12)) {
      if (materials.length >= 12) throw new Error('本次最多导入12份资料，请分批处理。');
      notify('正在读取 ' + file.name + '…');
      if (file.type.startsWith('image/') || file.type.startsWith('video/')) { if (file.size > 100 * 1024 * 1024) throw new Error('媒体超过100 MB，请先截取需要解析的片段。'); const next = await mediaFrames(file); if (current !== generation) return; if (frames.length + next.length > 6) throw new Error('本次最多6张画面，请先移除已选画面。'); frames.push(...next.map(frame => ({ ...frame, sourceName: file.name }))); mediaKind = file.type.startsWith('video/') || mediaKind === 'video' ? 'video' : 'image'; }
      else { if (file.size > 5 * 1024 * 1024) throw new Error('文档每份最多5 MB，请按章节拆分。'); let doc;
        if (/\.(txt|md|srt|vtt)$/i.test(file.name)) doc = { text: await file.text() };
        else { const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ''; for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768)); doc = await api('/api/extract-file', { name: file.name, content: btoa(binary) }); }
        if (current !== generation) return;
        if (!doc.text || doc.thin) throw new Error(file.name + ' 没有可读取文字。');
        if (doc.text.length > 30000) throw new Error(file.name + ' 超过30000字，请按章节拆分后导入，避免漏掉后半部分。');
        await addPool([{source:'manual',title:file.name,content:doc.text,sourceRef:file.name}]); }
      drawMaterials();
    } notify('资料已带入，点击“生成行动草稿”继续。');
  }
  async function begin(readOnly = false, analysisOnly = false) {
    await saveProject(); const inputs = materials.slice(), rawBody = analysisView ? originalBody : value('text');
    if (!readOnly && rawBody && rawBody !== stagedBody) {
      await addPool([{source:'manual',title:'手动正文 / 笔记',content:rawBody,sourceRef:'工作台正文'}]);
      stagedBody = rawBody;
    }
    const materialIds = readOnly ? [] : pool.filter(m => m.selected).map(m => m.id);
    const selectedLinks = readOnly ? value('links') : '';
    const signature = JSON.stringify({ project: project.id, title: value('title'), outcome: value('outcome'), materialIds, inputs, links: selectedLinks, question: value('question'), search: $('[name=search]').checked, frames });
    if (!readOnly && selectedRun && !['queued', 'running'].includes(selectedRun.status) && signature === sourceSignature) {
      autoFillRun = selectedRun.id; filledRun = '';
      await retryRun(selectedRun, { readOnly: false, analysisOnly, retrySources: false, question: value('question') }); return;
    }
    const current = SY.getAcctData();
    const run = await api('/api/growth/run', { account: owner, projectId: project.id, materialIds, materials: inputs, links: selectedLinks, readOnly, analysisOnly, frames, mediaKind, question: value('question'), search: $('[name=search]').checked, categories: (current.categories || []).map(c => typeof c === 'string' ? c : c.name).filter(Boolean) });
    sourceSignature = signature; autoFillRun = run.id; filledRun = '';
    notify('已开始处理。可以关闭窗口，稍后从处理记录继续。'); await loadRun(run.id);
  }
  const importedRuns = new Set();
  async function loadRun(id) {
    const run = await api('/api/growth/run?account=' + encodeURIComponent(owner) + '&id=' + encodeURIComponent(id));
    if (dialog) showRun(run);
    const key = owner + ':' + run.id;
    if (run.readOnly && run.id === autoFillRun && !['queued','running'].includes(run.status) && !importedRuns.has(key)) {
      const items = (run.sources || []).filter(s => s.url && s.kind !== 'search-snippet').map(s => ({source:'web',title:s.title,content:s.text,sourceRef:s.url,metadata:{url:s.url,readStatus:s.note || '已提取正文'}}));
      if (items.length) await addPool(items);
      importedRuns.add(key);
    }
  }
  function historyLabel(run) { return (run.project && run.project.title || '资料处理') + ' · ' + ({ succeeded: '待核对', answered: '问题已解析', failed: '未完成', interrupted: '已中断', running: '处理中', queued: '等待中', collected: '资料已读取', partial: '已保存 · 有待补充链接', blocked: '等待补充' }[run.status] || run.status); }
  async function retryRun(run, options) { await api('/api/growth/retry', { account: owner, id: run.id, ...options }); await loadRun(run.id); }
  function writeAnswer(run) {
    const d = run.diagnosis; if (!d || !d.answer) return;
    if (!analysisView) originalBody = value('text');
    const lines = ['针对问题：' + (run.question || run.project.outcome || run.project.title), '', d.answer];
    if (d.steps && d.steps.length) lines.push('', '可以这样做：', ...d.steps.map((s, i) => (i + 1) + '. ' + s));
    const refs = (d.relevantSources || []).map(r => ({ ...r, source: (run.sources || []).find(s => s.id === r.id) })).filter(r => r.source);
    if (refs.length) lines.push('', '相关来源（按关联程度排序）：', ...refs.map((r, i) => (i + 1) + '. ' + r.source.title + '：' + r.why + (r.source.url ? '\n' + r.source.url : '')));
    if (d.unknowns && d.unknowns.length) lines.push('', '还需核实：', ...d.unknowns.map(t => '• ' + t));
    $('[name=text]').value = lines.join('\n'); $('[name=text]').rows = 14; analysisView = true; filledRun = run.id;
    const info = $('[data-body-info]'); info.replaceChildren(n('p', '正文当前显示针对问题的解析。原始正文和已读取来源仍保留。'), button('返回原始正文', () => { $('[name=text]').value = originalBody; $('[name=text]').rows = 4; analysisView = false; info.replaceChildren(); }));
    notify('针对问题的解析已写入正文，附有相关来源。');
  }
  function showRun(run) {
    clearTimeout(poll); selectedRun = run; const host = $('[data-result]'); if (!host) return; host.replaceChildren();
    let history = [...dialog.querySelectorAll('[data-history-run]')].find(b => b.dataset.historyRun === run.id);
    if (!history) { history = button('', () => loadRun(run.id).catch(e => notify(e.message, true))); history.dataset.historyRun = run.id; $('[data-history]').prepend(history); }
    history.textContent = historyLabel(run);
    const active = ['queued', 'running'].includes(run.status);
    const flow = n('div', null, 'growth-flow'); ['读取资料', '识别画面', '提炼内容', '生成行动', '核对采用'].forEach((t, i) => { const stage = ['collect', 'vision', 'diagnose', 'plan', 'review'].indexOf(run.stage); flow.append(n('span', t, i === stage ? 'active' : '')); }); host.append(flow);
    const events = n('div', null, 'growth-events'); (run.events || []).slice(-4).forEach(e => events.append(n('p', e.message))); host.append(events);
    if (run.sourceResults && run.sourceResults.length) {
      const list = n('details', null, 'growth-link-results'); list.open = true;
      const count = run.sourceResults.filter(s => s.status === 'read').length;
      list.append(n('summary', '全部资料 · ' + count + '/' + run.sourceResults.length + ' 已读取'));
      run.sourceResults.forEach(s => {
        const item = n('article', null, 'growth-source'); item.dataset.sourceStatus = s.status;
        const label = { read: '已读取', partial: '仅有简介', failed: '待补充', pending: '等待读取' }[s.status] || s.status;
        item.append(n('strong', label + (s.chars ? ' · ' + s.chars + '字' : '')), s.url ? link(s.title + ' ↗', s.url) : n('p', s.title));
        if (s.error) item.append(n('p', s.error, 'growth-hint'));
        if (s.previewText) { const preview = n('details'); preview.append(n('summary', '标题/简介预览 · 尚未读到完整内容'), n('pre', s.previewText)); item.append(preview); }
        if (s.status !== 'read' && !active) item.append(button('重试此链接', () => guarded(() => retryRun(run, { readOnly: true, sourceId: s.id }))));
        list.append(item);
      }); host.append(list);
      if (count < run.sourceResults.length && !active) host.append(n('p', '待补充的链接已保留。生成行动只依据已读取的资料，不会把未读取的视频当作已理解。', 'growth-hint'), button('重试全部未读链接', () => guarded(() => retryRun(run, { readOnly: true }))));
    }
    if (!active && run.sources && run.sources.length && ['collected', 'partial', 'blocked', 'answered', 'succeeded', 'failed'].includes(run.status)) {
      const continueWith = analysisOnly => guarded(async () => { autoFillRun = run.id; filledRun = ''; await retryRun(run, { readOnly: false, analysisOnly, retrySources: false, question: value('question') || run.question }); });
      host.append(button('用已读取资料回答问题', () => continueWith(true)), button('用已读取资料生成行动', () => continueWith(false), 'growth-primary'));
      const readable = run.sources.filter(s => s.url && s.kind !== 'search-snippet');
      if (readable.length) host.append(button('将已读取网页正文加入资料池',()=>guarded(()=>addPool(readable.map(s=>({source:'web',title:s.title,content:s.text,sourceRef:s.url,metadata:{url:s.url,readStatus:s.note || '已提取正文'}}))))));
    }
    if (run.error) { host.append(n('p', run.error, 'growth-error')); if (['failed', 'interrupted'].includes(run.status)) host.append(button('从中断处继续', () => guarded(async () => { await api('/api/growth/retry', { account: owner, id: run.id }); await loadRun(run.id); }))); }
    (run.warnings || []).forEach(t => host.append(n('p', t, 'growth-error')));
    if (run.sources && run.sources.length) { const details = n('details'); details.append(n('summary', '已保存的来源 · ' + run.sources.length)); run.sources.forEach(s => { const item = n('article', null, 'growth-source'); item.append(s.url ? link(s.title + ' ↗', s.url) : n('strong', s.title)); if (s.note) item.append(n('p', s.note, 'growth-hint')); item.append(n('pre', s.text)); details.append(item); }); host.append(details); }
    if (run.diagnosis) { const d = run.diagnosis; host.append(n('h4', '针对问题的解析'), n('p', d.answer || d.summary, 'growth-summary')); for (const [key, label] of [['steps', '具体步骤'], ['keyPoints', '关键点'], ['gaps', '还需补齐'], ['unknowns', '待核实']]) if (d[key] && d[key].length) { host.append(n('h4', label)); const list = n('ul'); d[key].forEach(t => list.append(n('li', t))); host.append(list); } if (d.answer) { host.append(button('将解析放入正文', () => writeAnswer(run))); if (autoFillRun === run.id && filledRun !== run.id && (!value('question') || value('question') === run.question)) writeAnswer(run); } host.append(button('将核心内容存入备忘', () => saveMemo(run))); }
    if (run.status === 'succeeded') {
      const estimates = n('p', '建议行动共 ' + run.totalMinutes + ' 分钟；每天可投入 ' + run.project.dailyMinutes + ' 分钟。加入清单后仍可调整时间。', 'growth-hint'); host.append(estimates);
      (run.drafts || []).forEach(draft => { const card = n('article', null, 'growth-draft'); card.dataset.draft = draft.id; const select = n('label', null, 'growth-check'); const check = n('input'); check.type = 'checkbox'; check.checked = !(SY.getAcctData().tasks || []).some(t => t.growthSourceKey === draft.id); check.dataset.selectDraft = ''; select.append(check, document.createTextNode('加入我的清单')); card.append(select);
        for (const [label, type, key] of [['任务名称', 'text', 'name'], ['负责人', 'text', 'owner'], ['预计分钟', 'number', 'minutes'], ['截止日期', 'date', 'dueDate']]) { const f = field(label, type, key); f.querySelector('input').value = draft[key] || ''; card.append(f); }
        const planned = field('计划哪天做', 'date', 'date'); planned.querySelector('input').value = SY.todayKey(); card.append(planned);
        const categoryLabel = n('label', '类别'), category = n('select'); category.name = 'category';
        const categories = (SY.getAcctData().categories || []).map(c => typeof c === 'string' ? c : c.name).filter(Boolean);
        (categories.length ? categories : ['学习']).forEach(c => category.append(option(c, c))); categoryLabel.append(category); card.append(categoryLabel);
        card.append(n('p', '优先级：' + (draft.priority || 'P1')), n('p', '先做：' + draft.firstStep), n('p', '交付：' + draft.deliverable), n('p', '完成标准：' + draft.check));
        for (const [key, label] of [['important', '重要'], ['urgent', '紧急']]) { const l = n('label', null, 'growth-check'); const c = n('input'); c.type = 'checkbox'; c.name = key; l.append(c, document.createTextNode(label)); card.append(l); } host.append(card);
      });
      if (run.drafts.length) host.append(button('保存所选任务，同时存入备忘', () => applyDrafts(run), 'growth-primary')); else host.append(n('p', '本份资料没有生成行动建议，可保存核心内容。'));
    }
    if (run.diagnosis) renderProductAnalysis(host,run);
    if (['queued', 'running'].includes(run.status)) poll = setTimeout(() => loadRun(run.id).catch(e => notify(e.message, true)), 1600);
  }
  function renderProductAnalysis(host,run) {
    const d = run.diagnosis, box = n('section',null,'growth-product-analysis');
    box.append(n('h3','AI 产品经理'),n('h4','当前问题'),n('p',run.question || run.project.outcome || run.project.title));
    for(const [key,label] of [['productOptimization','产品优化'],['technicalPlan','技术方案']]) {
      box.append(n('h4',label)); const rows=d[key] || [];
      if(!rows.length)box.append(n('p','本次记录尚无这一部分；可用已读取资料重新生成。','growth-hint'));
      rows.forEach(row=>{
        const card=n('div');card.append(n('p',row.text));
        row.sourceIds.forEach(id=>{
          const source=(run.sources||[]).find(s=>s.id===id);if(!source)return;
          card.append(button('查看依据：'+source.title,()=>{
            const saved=pool.find(m=>m.id===source.materialId);
            const details=n('details');details.open=true;details.append(n('summary',saved?.title || source.title),n('pre',saved?.content || source.text));card.append(details);
          }));
        });box.append(card);
      });
    }
    box.append(n('h4','下一步任务'));
    if(run.drafts?.length)run.drafts.forEach(t=>box.append(n('p',(t.priority||'P1')+' · '+t.name+'；验收：'+t.check)));
    else box.append(n('p','点击“用已读取资料生成行动”，生成可核对的任务。','growth-hint'));
    box.append(button('生成 PRD 草稿',()=>{
      const details=n('details');details.open=true;details.append(n('summary','PRD 草稿 · 请核对后采用'),n('pre',prd(run)));box.append(details);
    }),button('保存到 Obsidian',()=>guarded(async()=>{
      await refreshObsidian(); if(!activeVault)throw Error('Obsidian 未连接，请先打开当前知识库。');
      const result=await api('/api/growth/obsidian-save',{vaultId:activeVault,title:run.project.title,content:prd(run)});
      if(!result.saved)throw Error('Obsidian 未确认保存。');notify('已写入并打开：'+result.path);
    })));
    host.append(box);
  }
  function prd(run) {
    const d=run.diagnosis;
    return ['# '+run.project.title+' · PRD 草稿','', '## 当前问题',run.question||run.project.outcome||run.project.title,'',d.answer||d.summary,'',
      '## 产品优化',...(d.productOptimization||[]).map(r=>'- '+r.text+' '+r.sourceIds.map(id=>'['+id+']').join(' ')), '',
      '## 技术方案',...(d.technicalPlan||[]).map(r=>'- '+r.text+' '+r.sourceIds.map(id=>'['+id+']').join(' ')), '',
      '## 下一步任务',...(run.drafts||[]).map(t=>'- [ ] '+(t.priority||'P1')+' '+t.name+'\n  验收：'+t.check+'\n  依据：'+t.sourceIds.join('、')), '',
      '## 待核实',...(d.unknowns||[]).map(t=>'- '+t),'','## 资料来源',...(run.sources||[]).map(s=>'- ['+s.id+'] '+s.title+' '+(s.url||s.sourceRef||''))].join('\n');
  }
  function memoFor(run) { return { id: run.id, title: run.project.title, summary: run.diagnosis.answer || run.diagnosis.summary, keyPoints: run.diagnosis.keyPoints, question: run.question, sources: run.sources.map(s => ({ title: s.title, url: s.url })), savedAt: new Date().toISOString() }; }
  function saveMemo(run) { if (owner !== acct()) return; const data = SY.getAcctData(); data.growthMemos = data.growthMemos || []; if (!data.growthMemos.some(m => m.id === run.id)) data.growthMemos.push(memoFor(run)); SY.saveAcctData(data); drawMemos(); notify('核心内容已保存到备忘。'); }
  function drawMemos() { const host = $('[data-memos]'); if (!host || !window.SY) return; host.replaceChildren(); const memos = SY.getAcctData().growthMemos || []; if (!memos.length) host.append(n('p', '还没有保存备忘。', 'growth-hint')); memos.slice().reverse().forEach(m => { const a = n('article', null, 'growth-memo'); a.append(n('h4', m.title), n('p', m.summary)); (m.sources || []).filter(s => s.url).forEach(s => a.append(link(s.title + ' ↗', s.url))); host.append(a); }); }
  function applyDrafts(run) {
    try { if (owner !== acct()) throw new Error('资料空间已切换，请重新打开。'); const data = SY.getAcctData(), pending = []; data.tasks = data.tasks || [];
      for (const card of dialog.querySelectorAll('[data-draft]')) { if (!card.querySelector('[data-select-draft]').checked || data.tasks.some(t => t.growthSourceKey === card.dataset.draft)) continue;
        const source = run.drafts.find(d => d.id === card.dataset.draft), val = key => card.querySelector('[name="' + key + '"]').value.trim(); const minutes = Number(val('minutes')), name = val('name');
        if (!name || !Number.isFinite(minutes) || minutes < 5 || minutes > 720) throw new Error('请核对任务名称和预计分钟数。');
        if (!val('date') || (val('dueDate') && val('date') > val('dueDate'))) throw new Error('计划日期不能空着，也不能晚于截止日期。');
        const links = run.sources.filter(s => source.sourceIds.includes(s.id) && s.url).map(s => s.url).join('\n');
        pending.push({ id: SY.uid(), growthSourceKey: source.id, growthProjectId: run.projectId, name, owner: val('owner'), category: val('category'), date: val('date'), dueDate: val('dueDate'), dueTime: '', estMinutes: minutes, plannedMinutes: minutes, multiplier: 1, firstTime: false, startMinutes: null, weight: 'medium', done: false, createdAt: Date.now(), important: card.querySelector('[name=important]').checked, urgent: card.querySelector('[name=urgent]').checked, order: Math.max(0, ...data.tasks.map(t => Number(t.order) || 0)) + pending.length + 1, noteGain: run.diagnosis.summary, noteKnowledge: run.diagnosis.keyPoints.join('\n'), noteRemark: '第一步：' + source.firstStep + '\n交付物：' + source.deliverable + '\n验收：' + source.check + '\n来源：\n' + links });
      }
      data.tasks.push(...pending); data.growthMemos = data.growthMemos || []; if (!data.growthMemos.some(m => m.id === run.id)) data.growthMemos.push(memoFor(run)); SY.saveAcctData(data); SY.refreshCurrentView(); drawMemos(); notify('已保存 ' + pending.length + ' 个新任务和核心备忘；重复任务已跳过。'); showRun(run);
    } catch (e) { notify(e.message, true); }
  }
  async function renderConnections() {
    const h = await api('/api/growth/health'); const host = $('[data-connections]'); if (!host) return; host.replaceChildren();
    host.append(n('p', h.ai.verified ? '模型最近一次连接测试通过：' + h.ai.model : '模型尚未通过当前连接测试。', 'growth-hint'));
    host.append(button('真实测试当前模型',()=>guarded(async()=>{
      notify('正在由本机服务向模型发出实际推理请求…');
      const result=await api('/api/growth/model-test',{});
      await renderConnections();notify('实际推理请求通过：'+result.model+' · '+result.latencyMs+'ms');
    })));
    const providers = n('select'); providers.setAttribute('aria-label', '选择电脑上已配置的模型'); providers.append(option('选择已有的模型服务', '')); (h.providers || []).filter(p => p.available).forEach(p => providers.append(option(p.name + ' · ' + p.model, p.id))); host.append(providers);
    if (window.SYRescue && typeof SYRescue.configure === 'function') host.append(button('打开原模型设置', () => { close(); SYRescue.configure(); }));
    host.append(button('验证并使用此模型', () => guarded(async () => { if (!providers.value) throw new Error('先选择一个已有模型。'); notify('正在实际请求所选模型…'); const v = await api('/api/growth/model', { id: providers.value }); notify('模型连接通过：' + v.model); await renderConnections(); })), button('测试联网搜索', () => guarded(async () => { notify('正在联网搜索…'); const v = await api('/api/growth/search-test', {}); notify('联网成功：' + v.provider + ' 返回 ' + v.results.length + ' 条来源。'); const results = n('div'); v.results.forEach(s => results.append(link(s.title + ' ↗', s.url))); host.append(results); })), n('p', '模型凭证沿用这台电脑已有配置，不发送到 GitHub。验证失败时保留原连接。', 'growth-hint'));
  }
  function mount() {
    if (!window.SY) return;
    document.querySelectorAll('.sykv-toolbar .sykv-actions button').forEach(b => {
      if (b.textContent.trim() === '连接 Obsidian') {
        b.dataset.growthObsidian = ''; b.textContent = '打开我的 Obsidian';
      }
    });
    const bar = document.querySelector('.app-topbar-right');
    if (bar && !bar.querySelector('[data-growth-open]')) { const b = button('资料 → 行动', () => open(), 'btn btn-primary btn-sm'); b.dataset.growthOpen = ''; bar.prepend(b); }
    const form = document.querySelector('#syRouteForm');
    if (form && !form.querySelector('[data-growth-route]')) {
      const section = n('div', null, 'growth-route-entry'); section.dataset.growthRoute = '';
      const prefill = () => { const read = key => form.querySelector('[data-route-field="' + key + '"]')?.value || ''; open({ title: read('name'), links: read('urls'), text: read('sourceText') }); };
      section.append(n('strong', '把资料继续变成行动'), n('p', '带入图片、视频、文档或微信资料，结合目标检索，核对任务后加入清单；核心内容同步保存备忘。'), button('＋ 导入图片 / 视频 / 文档', prefill, 'btn btn-primary'));
      form.append(section);
    }
  }
  window.SYGrowth = { open, close };
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-growth-obsidian],[data-open-vault]')) return;
    e.preventDefault(); e.stopImmediatePropagation(); open({focusObsidian:true});
  }, true);
  document.addEventListener('sy:data', mount); document.addEventListener('DOMContentLoaded', mount); mount();
  new MutationObserver(mount).observe(document.body, { childList: true, subtree: true });
})();
