/* Visible results and the user's saved selection are separate collections. */
(() => {
  'use strict';
  const store = window.SYWechatStore();
  let selectedGroup = null;
  const btn = (text, action, className = '') => { const b = el('button', text); b.type = 'button'; b.onclick = action; b.className = className; return b; };
  function updateSelection() {
    const chosen = store.chosen(), host = $('chosenResults'); host.replaceChildren();
    $('selectedCount').textContent = chosen.length;
    $('selectionSummary').textContent = '已选内容 · ' + chosen.length + ' 条';
    $('importChosen').disabled = !chosen.length;
    $('importChosen').textContent = chosen.length ? '将所选 ' + chosen.length + ' 条带入正文 →' : '勾选内容后带入正文';
    if (!chosen.length) host.append(el('p', '刷新结果、切换聊天时，已勾选的内容会保留在这里。'));
    chosen.forEach(message => {
      const row = el('div'); row.className = 'saved-row';
      row.append(el('span', (message.group ? message.group + ' · ' : '') + message.text.slice(0, 120)), btn('移除', () => {store.select(message, false); draw();}, 'text-button'));
      host.append(row);
    });
  }
  function draw() {
    const current = store.view(), host = $('results'); host.replaceChildren();
    $('resultCount').textContent = current.groups.length + current.contacts.length + current.messages.length;
    $('resultQuery').textContent = current.keyword ? '微信搜索：' + current.keyword : '等待微信搜索结果';
    if (current.note) { const message = el('p', current.note); message.className = 'result-note'; host.append(message); }
    for (const [key, heading, kind] of [['contacts','联系人','contact'],['groups','群聊','group']]) {
      if (!current[key].length) continue;
      const section = el('section'); section.className = 'result-section'; section.append(el('h3', heading + ' · ' + current[key].length));
      current[key].forEach(item => {
        const row = el('div'); row.className = 'person-row';
        const avatar = el('span', item.name.slice(0,1)); avatar.className = 'person-avatar ' + kind;
        const label = el('div'); label.className = 'person-label'; label.append(el('strong', item.name), el('small', kind === 'group' ? '打开群聊，继续查找消息' : '在微信中打开聊天'));
        row.append(avatar, label, btn(kind === 'group' ? '选择此群' : '打开聊天', () => kind === 'group' ? chooseGroup(item) : openContact(item), 'result-open'));
        section.append(row);
      }); host.append(section);
    }
    if (current.conversations.length) {
      const box = el('details'); box.append(el('summary', '尚未展开的聊天记录 · ' + current.conversations.length));
      current.conversations.forEach(text => box.append(el('p', text))); host.append(box);
    }
    if (current.messages.length) {
      const box = el('section'); box.className = 'result-section';
      const toolbar = el('div'); toolbar.className = 'section-title';
      toolbar.append(el('h3', '消息与框选内容 · ' + current.messages.length), btn('全选当前结果', () => {
        try { current.messages.forEach(m => store.select(m, true)); } catch (e) { note(e.message); } draw();
      }, 'text-button')); box.append(toolbar);
      current.messages.forEach((m, i) => {
        const row = el('label'); row.className = 'message-choice';
        const check = el('input'); check.type = 'checkbox'; check.checked = store.has(m); check.dataset.messageIndex = i;
        check.onchange = () => {try {store.select(m, check.checked);} catch(e) {check.checked = false; note(e.message);} updateSelection();};
        const content = el('div'); if (m.group) content.append(el('strong', m.group));
        content.append(el('pre', m.text));
        if (m.image) { const img = el('img'); img.src = m.image; img.alt = '本次框选的区域'; content.append(img); }
        row.append(check, content); box.append(row);
      }); host.append(box);
    }
    if (!current.groups.length && !current.contacts.length && !current.messages.length && !current.conversations.length) {
      const empty = el('div'); empty.className = 'results-empty';
      empty.append(el('span', '↗'), el('h3', '去微信找一找'), el('p', '搜索联系人、群聊或关键词，可确认的结果会出现在这里。')); host.append(empty);
    }
    updateSelection();
  }
  function render(result, append = false, quiet = false) {
    store.set(result, append); draw();
    if (!quiet) note('列表已更新。点击联系人或群聊可继续打开，勾选消息后带入正文。');
  }
  async function openItem(item, kind) {
    if (window.SYSharedWechat?.connected()) return window.SYSharedWechat.openTarget({name:item.name, kind, keyword:store.view().keyword || ''});
    if (item.openId) return api('/wechat-open-choice', {id:item.openId});
    throw Error('请先连接微信窗口，再打开当前画面中的这条结果。');
  }
  async function openContact(item) {
    if (searching || window.SYSharedWechatBusy?.()) return;
    await runSearch(async () => {await openItem(item, 'contact'); note('已在微信打开“' + item.name + '”。你可以继续操作，画面保持跟随。');});
  }
  async function chooseGroup(group) {
    if (searching || window.SYSharedWechatBusy?.()) return;
    selectedGroup = group; $('groupQuery').value = group.name; $('selectedGroup').textContent = '已选查找范围：' + group.name;
    const keyword = $('keyword').value.trim();
    await runSearch(async () => {
      if (group.id && keyword) return api('/wechat-group-messages', {id:group.id, keyword});
      await openItem(group, 'group');
      note(keyword ? '已打开“' + group.name + '”。请在群内搜索“' + keyword + '”，再读取当前画面或框选需要的消息。' : '已打开“' + group.name + '”。可填写消息关键词继续查找，也可以直接框选。');
    });
  }
  async function runSearch(action) {
    searching = true; const ticket = ++searchSequence; window.SYSharedWechat?.invalidate(); searchButtons();
    try { const result = await action(); if (ticket === searchSequence && result) render(result); }
    catch (e) { if (ticket === searchSequence) note(e.message); }
    finally { if (ticket === searchSequence) { searching = false; searchButtons(); } }
  }
  async function search() {
    if (searching || window.SYSharedWechatBusy?.()) return;
    const group = $('groupQuery').value.trim(), keyword = $('keyword').value.trim();
    if (!group && !keyword) return note('填写联系人、群聊名称或消息关键词。');
    if (selectedGroup?.name !== group) selectedGroup = null;
    if (selectedGroup && keyword) return chooseGroup(selectedGroup);
    if (window.SYSharedWechat?.connected()) return window.SYSharedWechat.search();
    note('正在微信中搜索，结果会出现在右侧…');
    await runSearch(() => group ? api('/wechat-group-list', {query:group}) : api('/wechat-search', {keyword}));
  }
  $('groupQuery').addEventListener('input', () => {selectedGroup = null; $('selectedGroup').textContent = '';});
  $('clearChosen').onclick = () => {store.clear(); draw();};
  $('importChosen').onclick = () => {
    const messages = store.chosen(); if (!messages.length) return;
    const text = '来源：微信中由我勾选的内容；仅所选消息 / 框选区域。\n\n' + messages.map(m => (m.group ? '群聊：' + m.group + '\n' : '') + m.text).join('\n\n');
    if (text.length > 30000) return note('所选内容超过30000字，请分批带入。');
    bringBack({text, kind:'wechat', keyword:$('keyword').value.trim(), messages:messages.map(m=>({text:m.text,group:m.group||'',time:m.time||'',sender:m.sender||''}))});
  };
  window.SYWechatLists = {render, search, group:() => selectedGroup?.name || '',
    follow(result) {if (!result.idle) {selectedGroup = null; $('selectedGroup').textContent = '';} render(result, false, true);},
    addCrop:(text, image) => render({messages:[{text:'微信框选文字（请核对识别结果）：\n'+text, image, crop:true}]}, true)};
  draw();
})();
