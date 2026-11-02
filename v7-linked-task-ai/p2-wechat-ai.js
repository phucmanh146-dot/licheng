(function () {
'use strict';
if (window.P2WechatAI) return;
const byId = id => document.getElementById(id);
const DEFAULT_PROMPT = '请依据真实原文完成：1.重要摘要；2.按学习资料、经验方法、通知要求、问题求助、任务分类；3.生成可执行任务，写清行动、验收标准、来源；4.只提取明确截止日期，没有就写待确认；5.逐条说明链接读取状态；6.与当前上岸鸭任务对照，提示重复和冲突但不自动改任务；7.给出下一步。区分事实、推断和建议，不得编造。';
let messages = [], candidates = [], currentGroup = '', pending = null, lastLocalAnswer = '', lastLinkResults = [], bridgeHealth = null;
function status(text, bad) {
  const el = byId('p2-wechat-status');
  if (el) { el.textContent = text || ''; el.style.color = bad ? '#b42318' : '#276749'; }
}
function bridgeState(text, bad) {
  const el = byId('p2-wechat-bridge-state');
  if (el) { el.textContent = text || ''; el.style.color = bad ? '#b42318' : '#527260'; }
}
function modelState(text, bad) {
  const el = byId('p2-wechat-model-state');
  if (el) { el.textContent = text || ''; el.style.color = bad ? '#b42318' : '#527260'; }
}
function bridgeBase() {
  const raw = (byId('p2-wechat-bridge-url').value || 'http://127.0.0.1:8898').trim().replace(/\/+$/, '');
  const u = new URL(raw);
  if (!['http:', 'https:'].includes(u.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) {
    throw new Error('为保护本机令牌，桥接地址只允许 localhost / 127.0.0.1。');
  }
  return u.origin;
}
function token() {
  return (byId('p2-wechat-bridge-token').value || sessionStorage.getItem('sy_wechat_bridge_token_v1') || '').trim();
}
async function bridgeApi(path, data, timeout) {
  const base = bridgeBase();
  const t = token();
  const headers = {};
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  if (t && path !== '/api/health' && path !== '/api/providers') headers['X-Bridge-Token'] = t;
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeout || 60000);
  try {
    const r = await fetch(base + path, { method: data === undefined ? 'GET' : 'POST', headers,
      body: data === undefined ? undefined : JSON.stringify(data), signal: ctrl.signal, cache: 'no-store', mode: 'cors' });
    const d = await r.json().catch(() => ({ error: '本机桥接没有返回有效 JSON' }));
    if (!r.ok || d.error || d.ok === false) throw new Error(d.error || ('HTTP ' + r.status));
    return d;
  } finally { clearTimeout(timer); }
}
function urlsFrom(text) {
  const found = String(text || '').match(/https?:\/\/[^\s<>"'，。；;）)\]】]+/g) || [];
  const seen = new Set(), out = [];
  found.forEach(function (raw) {
    const value = raw.replace(/[).,!?，。；;）)\]】]+$/g, '');
    try {
      const u = new URL(value);
      if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return;
      if (!seen.has(u.href)) { seen.add(u.href); out.push(u.href); }
    } catch (_) {}
  });
  return out;
}
function normalizeMessage(m, group) {
  const text = String(m.text || m.content || m.body || m.message || '').trim();
  return { group: String(m.group || group || ''), time: String(m.time || m.date || ''),
    sender: String(m.sender || m.from || ''), text };
}
function renderMessages() {
  const host = byId('p2-wechat-messages');
  host.replaceChildren();
  if (!messages.length) { host.textContent = '尚未读取或导入消息。'; return; }
  const intro = document.createElement('div');
  intro.className = 'p2-small';
  intro.textContent = '当前批次 ' + messages.length + ' 条。勾选的原文才会发送给 AI；屏幕 OCR 可能识别错误，请先核对。';
  host.appendChild(intro);
  messages.forEach(function (m, i) {
    const row = document.createElement('label'); row.className = 'p2-wechat-message';
    const check = document.createElement('input'); check.type = 'checkbox'; check.checked = true; check.dataset.index = String(i);
    const body = document.createElement('div');
    const meta = document.createElement('strong');
    meta.textContent = [m.group, m.time, m.sender].filter(Boolean).join(' · ') || ('消息 ' + (i + 1));
    const text = document.createElement('div'); text.className = 'p2-wechat-text'; text.textContent = m.text.slice(0, 2400);
    body.append(meta, text); row.append(check, body); host.appendChild(row);
  });
  byId('p2-wechat-select-all').checked = true;
}
function selectedMessages() {
  const checks = Array.from(byId('p2-wechat-messages').querySelectorAll('input[type=checkbox][data-index]'));
  return checks.length ? checks.filter(x => x.checked).map(x => messages[Number(x.dataset.index)]).filter(Boolean) : messages.slice();
}
function renderPreview(data) {
  const host = byId('p2-wechat-preview');
  host.replaceChildren();
  if (data && data.preview && String(data.preview).startsWith('data:image/')) {
    const img = document.createElement('img'); img.src = data.preview; img.alt = '微信真实搜索或当前窗口截图，用于核对目标会话';
    img.style.cssText = 'max-width:100%;max-height:320px;object-fit:contain;border-radius:8px';
    host.appendChild(img);
  } else host.textContent = (data && data.note) || '未返回截图预览。';
  if (data && data.note) {
    const p = document.createElement('p'); p.className = 'p2-small'; p.textContent = data.note; host.appendChild(p);
  }
}
async function loadProviders() {
  try {
    const d = await bridgeApi('/api/providers');
    const sel = byId('p2-wechat-provider'), prev = sel.value;
    sel.replaceChildren();
    (d.providers || []).forEach(p => sel.appendChild(new Option(p.name, p.name)));
    if (token()) {
      try {
        const cfg = await bridgeApi('/api/config');
        const preferred = cfg.last_service || prev;
        if (preferred && [...sel.options].some(o => o.value === preferred)) sel.value = preferred;
        else if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
        else if ([...sel.options].some(o => o.value === 'Custom')) sel.value = 'Custom';
        await loadModelConfig();
      } catch (e) {
        if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
        else if ([...sel.options].some(o => o.value === 'DeepSeek')) sel.value = 'DeepSeek';
        modelState('服务商已读取，但配置状态检查失败：' + e.message, true);
      }
    } else if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
    else if ([...sel.options].some(o => o.value === 'DeepSeek')) sel.value = 'DeepSeek';
  } catch (e) { modelState('读取本机服务商列表失败：' + e.message, true); }
}
async function checkBridge() {
  bridgeState('正在检查本机桥接…');
  try {
    const base = bridgeBase();
    const h = await bridgeApi('/api/health');
    bridgeHealth = h;
    let line = '桥接服务在线：' + (h.name || h.tool || '微信原始数据工具') + '。';
    line += h.wxautoInstalled ? ' wxauto 已安装；读取范围仍以实际接口返回为准。' : ' wxauto 未安装；将尝试上岸鸭原微信窗口 OCR（只读当前可见画面），不冒充完整历史。';
    if (!token()) {
      bridgeState(line + ' 尚未填写配对令牌；请复制 config/web_bridge_token.txt 的内容。', false);
      status('本机工具在线，但尚未验证令牌。导入文件仍可使用；实时读取需要配对。', true);
      return false;
    }
    await bridgeApi('/api/config');
    bridgeState(line + ' 配对令牌验证成功。', false);
    status('本机微信原始数据工具已通过健康检查与令牌验证。请搜索群名并核对结果后读取。', false);
    await loadProviders();
    return true;
  } catch (e) {
    bridgeState('连接失败：' + e.message, true);
    status('本机桥接尚未通过真实验证；没有读取微信消息。若浏览器拦截本地网络，请允许该站点访问本机服务。', true);
    return false;
  }
}
function saveBridge() {
  try {
    const base = bridgeBase(), t = byId('p2-wechat-bridge-token').value.trim();
    localStorage.setItem('sy_wechat_bridge_url_v1', base);
    if (t) { sessionStorage.setItem('sy_wechat_bridge_token_v1', t); byId('p2-wechat-bridge-token').value = ''; }
    byId('p2-wechat-bridge-url').value = base;
    bridgeState('桥接地址已保存；令牌仅保存在当前浏览器标签页会话。正在重新验证…');
    checkBridge();
  } catch (e) { bridgeState(e.message, true); }
}
function clearBridge() {
  sessionStorage.removeItem('sy_wechat_bridge_token_v1');
  byId('p2-wechat-bridge-token').value = '';
  bridgeState('已清除当前标签页的配对令牌。', false);
  status('已断开网页与本机微信原始数据工具的配对。', false);
}
async function loadModelConfig() {
  try {
    const d = await bridgeApi('/api/config'), sel = byId('p2-wechat-provider');
    const name = sel.value || d.last_service || 'DeepSeek';
    const c = (d.services || {})[name] || {};
    if (c.base_url !== undefined) byId('p2-wechat-api-base').value = c.base_url;
    if (c.model !== undefined) byId('p2-wechat-api-model').value = c.model;
    byId('p2-wechat-api-protocol').value = c.protocol || 'chat';
    byId('p2-wechat-api-key').value = '';
    const localNoKey = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::|\/)/i.test(String(c.base_url || ''));
    modelState('已读取服务商配置。' + (c.hasKey ? 'API Key 已保存（不回显）。' : (localNoKey && c.model ? '本机模型地址可免 API Key。' : '尚未配置 API Key。')), false);
  } catch (e) { modelState('读取配置失败：' + e.message, true); }
}
async function saveModelConfig() {
  try {
    const service_name = byId('p2-wechat-provider').value;
    if (!service_name) throw new Error('请先读取并选择服务商。');
    const d = await bridgeApi('/api/config', { service_name,
      base_url: byId('p2-wechat-api-base').value.trim(),
      model: byId('p2-wechat-api-model').value.trim(),
      api_key: byId('p2-wechat-api-key').value.trim(),
      protocol: byId('p2-wechat-api-protocol').value,
      prompt: byId('p2-wechat-prompt').value.trim() || DEFAULT_PROMPT
    });
    byId('p2-wechat-api-key').value = '';
    modelState('本机模型配置已保存。密钥不会回显；接下来请点击“真实测试 API”。', false);
    await loadModelConfig();
  } catch (e) { modelState('保存模型配置失败：' + e.message, true); }
}
async function testModel() {
  try {
    const d = await bridgeApi('/api/test', { service_name: byId('p2-wechat-provider').value }, 35000);
    modelState('真实 API 测试成功：' + d.provider + ' / ' + d.model + '。返回：' + String(d.reply || '').slice(0, 100), false);
  } catch (e) { modelState('真实 API 测试失败：' + e.message, true); }
}
async function searchGroups() {
  const query = byId('p2-wechat-group-query').value.trim();
  if (!query) { status('请输入要在微信界面搜索的群名关键词。', true); return; }
  status('正在通过本机微信窗口搜索并识别真实候选…');
  try {
    const d = await bridgeApi('/api/wechat/search', { query }, 90000);
    candidates = Array.isArray(d.candidates) ? d.candidates : [];
    const sel = byId('p2-wechat-groups'); sel.replaceChildren(new Option('选择要核对的真实候选', ''));
    candidates.forEach(c => sel.appendChild(new Option(String(c.label || c.id), String(c.id || ''))));
    byId('p2-wechat-open-group').disabled = !candidates.length;
    renderPreview(d);
    status('微信真实搜索返回 ' + candidates.length + ' 个 OCR 候选。请核对截图和群名；候选可能包含联系人或消息，不要仅凭相似名称点击。', false);
  } catch (e) { status('微信搜索失败：' + e.message + '。没有生成模拟群名。', true); }
}
async function openCandidate() {
  const id = byId('p2-wechat-groups').value;
  if (!id) { status('请先选择一个真实搜索候选。', true); return; }
  try {
    const d = await bridgeApi('/api/wechat/open', { id }, 90000);
    currentGroup = String(d.label || (candidates.find(x => String(x.id) === id) || {}).label || byId('p2-wechat-group-query').value || '微信当前会话');
    status('已点击候选“' + currentGroup + '”。请核对微信当前窗口后，再点击“读取当前可见画面”。', false);
    renderPreview(d);
  } catch (e) { status('打开候选失败：' + e.message + '。没有读取或分析消息。', true); }
}
async function readVisible() {
  try {
    if (!token()) throw new Error('请先填写并验证本机桥接令牌。');
    status('正在读取当前微信窗口的可见画面并执行 OCR…');
    const d = await bridgeApi('/api/wechat/preview', {}, 90000);
    const rows = Array.isArray(d.rows) ? d.rows : [];
    const group = currentGroup || byId('p2-wechat-group-query').value.trim() || '微信当前可见画面';
    messages = rows.filter(r => String(r.text || '').trim()).map((r, i) => ({
      group, time: '屏幕位置 y=' + (r.y === undefined ? '?' : r.y),
      sender: 'OCR ' + (r.confidence === undefined ? '' : Math.round(Number(r.confidence) * 100) + '%'),
      text: String(r.text || '').trim()
    }));
    byId('p2-wechat-more').disabled = true;
    renderMessages(); renderPreview(d);
    if (!messages.length) throw new Error('OCR 没有识别到可用文字；请把微信目标群打开并显示消息后重试。');
    status('已取得当前画面 OCR 共 ' + messages.length + ' 条文字片段。注意：这是可见画面，不代表完整群历史；请在下方核对后再交给 AI。' + (d.note ? '\n' + d.note : ''), false);
  } catch (e) { status('读取当前画面失败：' + e.message, true); }
}
async function readHistory() {
  if (bridgeHealth && bridgeHealth.wxautoInstalled) {
    const group = currentGroup || byId('p2-wechat-group-query').value.trim();
    if (!group) { status('请填写明确的群名。', true); return; }
    try {
      const d = await bridgeApi('/api/wechat/read', { group, limit: 250 }, 90000);
      messages = (d.messages || []).map(m => normalizeMessage(m, group)).filter(m => m.text);
      renderMessages();
      status('读取器返回 ' + messages.length + ' 条消息。请核对返回范围；不能据此认定已读取全部历史。', false);
      return;
    } catch (e) { status('读取器历史读取失败：' + e.message, true); return; }
  }
  await readVisible();
}
async function importFile() {
  const file = byId('p2-wechat-file').files && byId('p2-wechat-file').files[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) { status('原始数据文件超过 8 MB，请拆分后再导入。', true); return; }
  try {
    const raw = await file.text();
    if (file.name.toLowerCase().endsWith('.json')) {
      const parsed = JSON.parse(raw);
      const rows = Array.isArray(parsed) ? parsed : (parsed.messages || parsed.items || parsed.records || []);
      messages = Array.isArray(rows) && rows.length ? rows.slice(0, 120).map(m => normalizeMessage(m, file.name)) :
        [{ group: file.name, time: '', sender: '本地文件', text: JSON.stringify(parsed, null, 2).slice(0, 120000) }];
    } else if (/\.(csv|html?|xml|md|txt|log)$/i.test(file.name)) {
      messages = [{ group: file.name, time: '', sender: '本地文件', text: raw.slice(0, 120000) }];
    } else {
      messages = [{ group: file.name, time: '', sender: '本地文件', text: raw.slice(0, 120000) }];
    }
    currentGroup = file.name;
    byId('p2-wechat-more').disabled = true;
    renderMessages();
    status('已导入本地原始数据文件“' + file.name + '”，当前批次 ' + messages.length + ' 条。尚未发送给任何 AI。', false);
  } catch (e) { status('文件导入失败：' + e.message, true); }
}
function clearBatch() {
  messages = []; candidates = []; currentGroup = ''; pending = null; lastLocalAnswer = ''; lastLinkResults = [];
  byId('p2-wechat-file').value = ''; byId('p2-wechat-more').disabled = true;
  byId('p2-wechat-open-group').disabled = true;
  byId('p2-wechat-local-answer').textContent = '本机 AI 结果将在这里显示。';
  byId('p2-wechat-link-status').textContent = '本批链接状态尚未检查。';
  byId('p2-wechat-save-local').disabled = true;
  renderMessages(); status('已清除当前批次资料；连接配置与原有任务不受影响。', false);
}
async function readLinks(urls) {
  if (!urls.length) { lastLinkResults = []; byId('p2-wechat-link-status').textContent = '本批没有检测到链接。'; return []; }
  if (urls.length > 20) throw new Error('本轮发现超过20个链接，请按群名或关键词分批处理，不会静默跳过。');
  try {
    const d = await bridgeApi('/api/read-links', { urls }, 150000);
    lastLinkResults = d.links || [];
    byId('p2-wechat-link-status').textContent = '链接逐条读取：成功 ' + (d.readCount || 0) + '，部分读取 ' + (d.partialCount || 0) + '，失败/无正文 ' + (d.failedCount || 0) + '。';
  } catch (e) {
    lastLinkResults = urls.map(url => ({ url, title: url, text: '', status: 'unavailable', note: '读取器接口失败：' + e.message }));
    byId('p2-wechat-link-status').textContent = '链接读取接口不可用：' + e.message + '。原文仍会交给 AI 分析，但不会把这些链接说成已读取。';
  }
  return lastLinkResults;
}
async function analyzeLocal() {
  const chosen = selectedMessages().filter(m => m && m.text);
  if (!chosen.length) { status('请先读取或导入原始数据，并至少勾选一条。', true); return; }
  if (!token()) { status('请先配对本机工具，并在“模型 API”里配置本机 AI。', true); return; }
  const service = byId('p2-wechat-provider').value;
  if (!service) { status('请先选择本机 AI 服务商。', true); return; }
  const urls = urlsFrom(chosen.map(m => m.text).join('\n'));
  const raw = chosen.map(m => '[' + [m.time, m.group, m.sender].filter(Boolean).join(' | ') + ']\n' + m.text).join('\n\n').slice(0, 160000);
  try {
    status('正在逐条读取消息中的链接，再交给本机 AI 分析…');
    const links = await readLinks(urls);
    const d = await bridgeApi('/api/analyze', {
      service_name: service, messages: raw,
      current_task: (byId('p2-task-context') && byId('p2-task-context').value || '').trim().slice(0, 5000),
      prompt: byId('p2-wechat-prompt').value.trim() || DEFAULT_PROMPT,
      links
    }, 150000);
    lastLocalAnswer = String(d.answer || '');
    const host = byId('p2-wechat-local-answer'); host.textContent = '';
    const pre = document.createElement('div'); pre.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7;padding:12px;background:#fff;border:1px solid #dce8e0;border-radius:9px;color:#18342b';
    pre.textContent = lastLocalAnswer || '本机 AI 未返回回答。'; host.appendChild(pre);
    byId('p2-wechat-save-local').disabled = !lastLocalAnswer;
    status('本机 AI 已实际返回回答：' + d.provider + ' / ' + d.model + '。本轮原文 ' + (d.rawChars || raw.length) + ' 字；链接已逐条检查。', false);
  } catch (e) { status('本机 AI 分析失败：' + e.message + '。原始消息仍保留，可检查 API 配置后重试。', true); }
}
async function saveLocalAnswer() {
  if (!lastLocalAnswer) return;
  try {
    const d = await bridgeApi('/api/save', { group: currentGroup || 'wechat-raw-data-ai',
      content: lastLocalAnswer + '\n\n## 本轮链接读取状态\n' + lastLinkResults.map(x => '- ' + x.status + ' · ' + x.url + (x.note ? ' · ' + x.note : '')).join('\n') });
    status('已保存到本机 summary 文件夹：' + d.filename, false);
  } catch (e) { status('保存失败：' + e.message, true); }
}
function sendToMainAI() {
  const chosen = selectedMessages().filter(m => m && m.text);
  if (!chosen.length) { status('请先读取或导入原始数据，并至少勾选一条。', true); return; }
  const urls = urlsFrom(chosen.map(m => m.text).join('\n'));
  if (urls.length > 20) { status('本轮有 ' + urls.length + ' 个链接，超过20条上限；请分批，不会静默跳过。', true); return; }
  pending = { group: currentGroup || chosen[0].group || '微信原始数据', messages: chosen, urls, prompt: byId('p2-wechat-prompt').value.trim() || DEFAULT_PROMPT };
  const input = byId('p2-text');
  input.value = '请启动“微信原始数据 AI”分析模式，分析我主动选择的“' + pending.group + '”资料（' + chosen.length + ' 条）。' +
    '\n\n要求：' + pending.prompt + '\n\n请逐条核对消息中的链接读取状态，引用真实正文和原始消息，不要编造。';
  byId('p2-wechat-dialog').close();
  const form = byId('p2-form');
  if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
  else if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}
function latestAssistantText() {
  if (lastLocalAnswer) return lastLocalAnswer;
  try {
    const data = JSON.parse(localStorage.getItem('shanganya_p2_chat_history_v1') || '{}');
    const thread = (data.threads || []).find(t => t.id === data.activeId) || (data.threads || [])[0];
    const msgs = thread && Array.isArray(thread.messages) ? thread.messages : [];
    for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'assistant' && msgs[i].content) return String(msgs[i].content);
  } catch (_) {}
  return '';
}
function mindmap() {
  const text = latestAssistantText();
  if (!text) { status('当前还没有 AI 回答，请先完成一次分析。', true); return; }
  const lines = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const sections = []; let cur = { title: '核心结论', items: [] };
  lines.forEach(function (line) {
    const m = line.match(/^(?:#{1,4}\s+|[一二三四五六七八九十\d]+[、.)．]\s*)(.{2,70})$/);
    if (m) { if (cur.items.length) sections.push(cur); cur = { title: m[1].replace(/[*#]/g, ''), items: [] }; }
    else cur.items.push(line.replace(/^[-*•]\s+/, ''));
  });
  if (cur.items.length) sections.push(cur);
  const esc = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let y = 32, body = '';
  sections.slice(0, 12).forEach(function (s) {
    body += '<rect x="250" y="' + y + '" width="260" height="31" rx="8" fill="#dff1e5" stroke="#b8d9c4"/><text x="260" y="' + (y + 20) + '" font-size="14" font-weight="700" fill="#176b4d">' + esc(s.title.slice(0, 35)) + '</text>';
    s.items.slice(0, 5).forEach(function (item, i) {
      const yy = y + 38 + i * 30;
      body += '<path d="M510 ' + (y + 15) + ' H530 V' + (yy + 12) + ' H545" stroke="#9bc9ad" fill="none"/><rect x="545" y="' + yy + '" width="540" height="24" rx="6" fill="#fff" stroke="#dce8e0"/><text x="555" y="' + (yy + 16) + '" font-size="12" fill="#18342b">' + esc(item.slice(0, 72)) + '</text>';
    });
    y += 48 + Math.min(s.items.length, 5) * 30;
  });
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="' + Math.max(220, y) + '"><rect width="100%" height="100%" fill="#f6faf7"/><rect x="20" y="20" width="200" height="42" rx="10" fill="#176b4d"/><text x="120" y="46" text-anchor="middle" font-size="15" fill="#fff">微信原始数据 AI</text>' + body + '</svg>';
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = '上岸鸭-微信原始数据AI思维导图.svg'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  status('已生成并下载最近 AI 回答的 SVG 思维导图。', false);
}
function mount() {
  byId('p2-wechat-bridge-url').value = localStorage.getItem('sy_wechat_bridge_url_v1') || 'http://127.0.0.1:8898';
  byId('p2-wechat-bridge-token').value = sessionStorage.getItem('sy_wechat_bridge_token_v1') || '';
  byId('p2-wechat-open').addEventListener('click', function () { byId('p2-wechat-dialog').showModal(); checkBridge(); loadProviders(); });
  byId('p2-wechat-check').addEventListener('click', checkBridge);
  byId('p2-wechat-save-bridge').addEventListener('click', saveBridge);
  byId('p2-wechat-clear-bridge').addEventListener('click', clearBridge);
  byId('p2-wechat-provider').addEventListener('change', loadModelConfig);
  byId('p2-wechat-load-model-config').addEventListener('click', loadModelConfig);
  byId('p2-wechat-save-model-config').addEventListener('click', saveModelConfig);
  byId('p2-wechat-test-model').addEventListener('click', testModel);
  byId('p2-wechat-search-groups').addEventListener('click', searchGroups);
  byId('p2-wechat-open-group').addEventListener('click', openCandidate);
  byId('p2-wechat-read-history').addEventListener('click', readHistory);
  byId('p2-wechat-more').disabled = true;
  byId('p2-wechat-file').addEventListener('change', importFile);
  byId('p2-wechat-analyze').addEventListener('click', sendToMainAI);
  byId('p2-wechat-analyze-local').addEventListener('click', analyzeLocal);
  byId('p2-wechat-save-local').addEventListener('click', saveLocalAnswer);
  byId('p2-wechat-map').addEventListener('click', mindmap);
  byId('p2-wechat-clear').addEventListener('click', clearBatch);
  byId('p2-wechat-select-all').addEventListener('change', function () {
    byId('p2-wechat-messages').querySelectorAll('input[type=checkbox][data-index]').forEach(x => { x.checked = this.checked; });
  });
  byId('p2-wechat-open-config').addEventListener('click', function () { byId('p2-wechat-dialog').close(); byId('p2-config-dialog').showModal(); });
  byId('p2-wechat-feishu-config').addEventListener('click', function () {
    byId('p2-wechat-dialog').close(); byId('p2-config-dialog').showModal();
    const details = byId('p2-feishu-settings'); if (details) { details.open = true; details.scrollIntoView({ block: 'nearest' }); }
  });
  if (location.hash === '#wechat-ai') { byId('p2-wechat-dialog').showModal(); checkBridge(); loadProviders(); }
  else loadProviders();
}
window.P2WechatAI = {
  getPendingContext: function () { return pending ? JSON.parse(JSON.stringify(pending)) : null; },
  clearPendingContext: function () { pending = null; }
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
