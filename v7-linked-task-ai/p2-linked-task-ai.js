(function () {
'use strict';

const APP_DATA_KEY = 'shangan_ya_app_data_v1';
const CHAT_KEY = 'shanganya_p2_chat_history_v1';
let taskRecords = [];
let accountSnapshot = null;
let linkedTask = null;
let todoDialog = null;
let todoRows = [];

const $ = (selector, root) => (root || document).querySelector(selector);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
function setStatus(message, bad) {
  const node = $('#p2-status');
  if (node) {
    node.textContent = message || '';
    node.classList.toggle('error', !!bad);
  }
}
function parentApp() {
  try { if (window.parent && window.parent !== window && window.parent.SY) return window.parent.SY; } catch (_) {}
  try { if (window.SY) return window.SY; } catch (_) {}
  return null;
}
function readAccount() {
  let key = 'guest';
  const app = parentApp();
  try { if (app && app.currentAccountKey) key = String(app.currentAccountKey); } catch (_) {}
  let all = {};
  try { all = JSON.parse(localStorage.getItem(APP_DATA_KEY) || '{}') || {}; } catch (_) {}
  const account = all && all[key] && typeof all[key] === 'object' ? all[key] : null;
  return { key, all, account, app };
}
function dueLabel(task) {
  const date = String(task.dueDate || '').trim();
  const time = String(task.dueTime || '').trim();
  return date ? '截止 ' + date + (time ? ' ' + time : '') : '';
}
function taskLabel(task) {
  return (task.done ? '✓ ' : '○ ') + String(task.name || '未命名任务') +
    (task.category ? ' · ' + task.category : '') +
    (dueLabel(task) ? ' · ' + dueLabel(task) : '');
}
function safeUrl(value) {
  const text = String(value || '').trim();
  try {
    const u = new URL(text);
    if (['http:', 'https:'].includes(u.protocol) && !u.username && !u.password) return u.href;
    if (u.protocol === 'obsidian:') return u.href;
  } catch (_) {}
  return '';
}
function sourceLines(task) {
  const items = Array.isArray(task.materials) ? task.materials : [];
  const links = [];
  items.forEach(function (item) {
    if (typeof item === 'string') {
      const url = safeUrl(item);
      if (url) links.push({ title: url, url });
    } else if (item && typeof item === 'object') {
      const url = safeUrl(item.url || item.href || item.link);
      if (url) links.push({ title: String(item.title || item.name || url), url });
    }
  });
  ['sourceUrl', 'url', 'feishuUrl', 'obsidianUrl'].forEach(function (key) {
    const url = safeUrl(task[key]);
    if (url) links.push({ title: key + ': ' + url, url });
  });
  const seen = new Set();
  return links.filter(function (item) {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  }).slice(0, 20);
}
function taskContext(task, accountKey) {
  const lines = [
    '【关联现有任务：只读上下文；不得自动覆盖原任务】',
    '账户键：' + accountKey,
    '原任务 ID：' + String(task.id || ''),
    '任务名称：' + String(task.name || ''),
    '分类：' + String(task.category || '未分类'),
    '状态：' + (task.done ? '已完成' : '进行中/未完成'),
    '截止日期：' + (task.dueDate || '原任务未设置明确截止日期'),
    '截止时间：' + (task.dueTime || '未设置'),
    '计划日期：' + (task.date || '未设置'),
    '验收/框架备注：' + String(task.noteFramework || ''),
    '已有记录：' + [task.noteGain, task.noteKnowledge, task.noteRemark].filter(Boolean).join('；')
  ];
  const steps = Array.isArray(task.steps) ? task.steps.map(function (step) {
    if (typeof step === 'string') return step;
    return step && (step.name || step.title || step.text || step.label) || '';
  }).filter(Boolean) : [];
  if (steps.length) lines.push('任务步骤：\n- ' + steps.join('\n- '));
  const materials = sourceLines(task);
  if (materials.length) lines.push('关联资料（请逐条尝试读取并如实报告成功/失败）：\n' + materials.map(function (item) {
    return '- ' + item.title + '\n  ' + item.url;
  }).join('\n'));
  lines.push('处理规则：遇到中途卡点，结合本轮问题、视频/附件和以上资料给出可执行排查步骤；保留原任务与原截止日期；不要重复询问上下文里已有的信息；新待办必须由用户确认后才写入。');
  return lines.join('\n');
}
function renderTaskPicker() {
  const contextBox = $('.p2-task-context-box');
  if (!contextBox || $('#p2-linked-task-panel')) return;
  const panel = el('section', 'p2-linked-task-panel');
  panel.id = 'p2-linked-task-panel';
  const top = el('div', 'p2-linked-task-top');
  const heading = el('div', 'p2-linked-task-heading');
  heading.append(el('strong', '', '关联原有任务'));
  heading.append(el('span', '', '同一个任务继续处理，不重复新建'));
  top.append(heading);
  const refresh = el('button', 'p2-linked-task-refresh', '刷新任务');
  refresh.type = 'button';
  top.append(refresh);
  const controls = el('div', 'p2-linked-task-controls');
  const select = el('select');
  select.id = 'p2-linked-task-select';
  select.setAttribute('aria-label', '选择要关联的原有任务');
  const attach = el('button', 'p2-linked-task-attach', '关联到本轮 AI');
  attach.type = 'button';
  controls.append(select, attach);
  const note = el('p', 'p2-linked-task-note', '关联后，AI 会收到任务名称、状态、原截止日期、步骤和已有资料链接。视频/附件/链接问题可直接在同一对话中继续排查。');
  note.id = 'p2-linked-task-note';
  panel.append(top, controls, note);
  contextBox.parentNode.insertBefore(panel, contextBox);
  refresh.addEventListener('click', refreshTasks);
  attach.addEventListener('click', attachSelectedTask);
  select.addEventListener('change', updateTaskPreview);
}
function refreshTasks() {
  const result = readAccount();
  accountSnapshot = result;
  taskRecords = result.account && Array.isArray(result.account.tasks) ? result.account.tasks.slice() : [];
  const select = $('#p2-linked-task-select');
  const note = $('#p2-linked-task-note');
  if (!select) return;
  select.replaceChildren();
  if (!result.account) {
    select.append(new Option('未读取到当前账号任务', ''));
    if (note) note.textContent = '当前没有读取到原工作台的任务数据。请从原工作台打开此 AI 页面，并确认已登录；不会猜测或读取其他账号的数据。';
    return;
  }
  const sorted = taskRecords.slice().sort(function (a, b) {
    if (!!a.done !== !!b.done) return a.done ? 1 : -1;
    return Number(b.createdAt || 0) - Number(a.createdAt || 0);
  }).slice(0, 250);
  if (!sorted.length) select.append(new Option('当前账号暂无任务', ''));
  sorted.forEach(function (task) {
    const option = new Option(taskLabel(task), String(task.id || ''));
    select.append(option);
  });
  const previous = linkedTask && String(linkedTask.id || '');
  if (previous && Array.from(select.options).some(option => option.value === previous)) select.value = previous;
  if (note) note.textContent = '已读取当前账号 ' + taskRecords.length + ' 条原任务。只会读取任务上下文；不会自动修改原任务或截止日期。';
  updateTaskPreview();
}
function selectedTask() {
  const select = $('#p2-linked-task-select');
  const id = select && select.value;
  return taskRecords.find(task => String(task.id || '') === String(id || '')) || null;
}
function updateTaskPreview() {
  const task = selectedTask();
  const note = $('#p2-linked-task-note');
  if (!note) return;
  if (!task) {
    note.textContent = '先选择一条原有任务，再点“关联到本轮 AI”。';
    return;
  }
  const sources = sourceLines(task);
  note.textContent = taskLabel(task) + '。将携带 ' + sources.length + ' 条资料链接；确认关联后，AI 会结合当前问题继续处理。';
}
async function readLocalObsidianForTask(task) {
  const localHosts = ['localhost', '127.0.0.1', '::1'];
  if (!localHosts.includes(location.hostname)) {
    return { texts: [], note: '当前打开的是公网工作台，浏览器无法直接读取你电脑上的 Obsidian 知识库；相关链接已保留在上下文中，但本轮没有声称已读取本机笔记。' };
  }
  async function api(path, body) {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, 12000);
    try {
      const response = await fetch(path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        signal: controller.signal
      });
      const data = await response.json().catch(function () { return { error: '本机知识库接口未返回有效 JSON' }; });
      if (!response.ok || data.error || data.connected === false) throw new Error(data.error || data.note || ('HTTP ' + response.status));
      return data;
    } finally { clearTimeout(timer); }
  }
  try {
    const info = await api('/api/vault');
    if (!info.connected) return { texts: [], note: info.note || '本机 Obsidian 尚未连接。' };
    const materials = sourceLines(task);
    const paths = [];
    materials.forEach(function (item) {
      if (!/^obsidian:/i.test(item.url)) return;
      try {
        const url = new URL(item.url);
        const path = url.searchParams.get('file') || url.searchParams.get('path') || '';
        if (path) paths.push(path.replace(/^\/+/, ''));
      } catch (_) {}
    });
    let candidates = paths.map(path => ({ path }));
    if (!candidates.length) {
      const found = await api('/api/vault-search', { q: String(task.name || '').trim(), limit: 4 });
      candidates = (found.results || []).map(item => ({ path: item.path, title: item.title }));
    }
    const seen = new Set();
    const texts = [];
    for (const item of candidates) {
      if (!item.path || seen.has(item.path) || texts.length >= 2) continue;
      seen.add(item.path);
      try {
        const note = await api('/api/vault-read', { path: item.path, limit: 1800 });
        if (note.text) texts.push({ title: note.title || item.title || item.path, path: note.path || item.path, text: String(note.text).slice(0, 1800) });
      } catch (_) {}
    }
    if (!texts.length) return { texts: [], note: '本机 Obsidian 服务已响应，但没有找到与当前任务匹配的笔记正文；没有把搜索片段冒充成全文。' };
    return { texts, note: '已从本机 Obsidian 实际读取 ' + texts.length + ' 篇笔记正文（每篇最多 1800 字）。' };
  } catch (error) {
    return { texts: [], note: '本机 Obsidian 读取失败：' + error.message + '。本轮不会假装已读取。' };
  }
}
async function attachSelectedTask() {
  const task = selectedTask();
  if (!task) {
    setStatus('请先选择一条原有任务；没有可选任务时，请从原工作台刷新后重试。', true);
    return;
  }
  const textarea = $('#p2-task-context');
  if (!textarea) return;
  const button = $('.p2-linked-task-attach');
  if (button) { button.disabled = true; button.textContent = '正在关联…'; }
  setStatus('正在关联原任务，并检查本机 Obsidian 是否可读取…');
  try {
    const previousGenerated = textarea.dataset.syGeneratedContext || '';
    let manual = textarea.value.trim();
    if (previousGenerated && manual.startsWith(previousGenerated)) manual = manual.slice(previousGenerated.length).trim();
    const generated = taskContext(task, accountSnapshot ? accountSnapshot.key : 'guest');
    const vault = await readLocalObsidianForTask(task);
    let context = generated;
    if (vault.texts.length) {
      context += '\n\n【已从本机 Obsidian 读取的原文】\n' + vault.texts.map(function (note) {
        return '笔记：' + note.title + '\n路径：' + note.path + '\n' + note.text;
      }).join('\n\n');
    }
    context += '\n\n【Obsidian 读取状态】' + vault.note;
    textarea.value = context + (manual ? '\n\n【手动补充背景】\n' + manual : '');
    textarea.dataset.syGeneratedContext = textarea.value;
    textarea.dataset.linkedTaskId = String(task.id || '');
    linkedTask = task;
    const details = $('.p2-task-context-box');
    if (details) details.open = true;
    setStatus('已关联原任务“' + String(task.name || '未命名任务') + '”。' + vault.note + ' 原任务未被修改；飞书网页链接会随本轮一起尝试读取。');
  } finally {
    if (button) { button.disabled = false; button.textContent = '关联到本轮 AI'; }
  }
}function latestAssistantAnswer() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(CHAT_KEY) || '{}') || {}; } catch (_) {}
  const threads = Array.isArray(saved.threads) ? saved.threads : [];
  const thread = threads.find(item => item && item.id === saved.activeId) || threads[0];
  if (!thread || !Array.isArray(thread.messages)) return '';
  for (let i = thread.messages.length - 1; i >= 0; i--) {
    if (thread.messages[i] && thread.messages[i].role === 'assistant' && String(thread.messages[i].content || '').trim()) {
      return String(thread.messages[i].content);
    }
  }
  return '';
}
function explicitDate(text) {
  const raw = String(text || '');
  let match = raw.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (match) return match[1] + '-' + String(match[2]).padStart(2, '0') + '-' + String(match[3]).padStart(2, '0');
  match = raw.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日?/);
  if (match) return match[1] + '-' + String(match[2]).padStart(2, '0') + '-' + String(match[3]).padStart(2, '0');
  return '';
}
function explicitTime(text) {
  const match = String(text || '').match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return match ? String(match[1]).padStart(2, '0') + ':' + match[2] : '';
}
function extractCandidates(answer) {
  const seen = new Set();
  const candidates = [];
  String(answer || '').split(/\r?\n/).forEach(function (raw) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (!/^(?:[-*•]\s+|\d{1,2}[.)、]\s+|>\s+)/.test(trimmed)) return;
    let title = trimmed.replace(/^(?:[-*•]\s+|\d{1,2}[.)、]\s+|>\s+)/, '');
    title = title.replace(/^#{1,6}\s*/, '').replace(/^\*\*(.*?)\*\*$/, '$1').replace(/^\[(?:待办|任务)\]\s*/, '').trim();
    title = title.replace(/\s{2,}/g, ' ').slice(0, 160);
    if (title.length < 4 || /^(摘要|结论|背景|风险|说明|建议如下|以上|下一步如下)[:：。]?$/.test(title)) return;
    if (!/(需要|请|建议|下一步|完成|检查|确认|读取|修复|配置|测试|处理|关联|上传|提交|生成|保存|验证|部署|联系|补充|跟进|整理|创建|写入|优化|实现|排查|核对|分析|记录|导入|检查|保留|修改|添加|安装|运行|打开|导出|更新|复现|准备|学习|复盘|尝试|明确|收集|建立|修正|完成|执行|评估|对照|对接|排除|定位|解决|发布|交付|review|test|fix|check|read|build|run|verify|create|update|deploy|analy[sz]e)/i.test(title)) return;
    const key = title.toLocaleLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ title, dueDate: explicitDate(title), dueTime: explicitTime(title) });
  });
  return candidates.slice(0, 20);
}
function ensureTodoDialog() {
  if (todoDialog) return todoDialog;
  todoDialog = el('dialog', 'p2-linked-todo-dialog');
  todoDialog.id = 'p2-linked-todo-dialog';
  const form = el('form', 'p2-linked-todo-form');
  form.method = 'dialog';
  const header = el('div', 'p2-linked-todo-header');
  header.append(el('h2', '', '从 AI 回答提取待办'));
  const close = el('button', 'p2-linked-task-refresh', '关闭');
  close.type = 'button';
  close.addEventListener('click', () => todoDialog.close());
  header.append(close);
  const help = el('p', 'p2-linked-todo-help', '只提取回答中明确的编号/项目符号行动项。先检查、修改和勾选，再确认写入原任务清单；原任务和原截止日期不会被覆盖。');
  const rows = el('div', 'p2-linked-todo-rows');
  rows.id = 'p2-linked-todo-rows';
  const actions = el('div', 'p2-linked-todo-actions');
  const cancel = el('button', 'p2-linked-task-refresh', '取消');
  cancel.type = 'button';
  cancel.addEventListener('click', () => todoDialog.close());
  const save = el('button', 'p2-linked-task-attach', '确认加入所选任务');
  save.type = 'button';
  save.addEventListener('click', saveSelectedTodos);
  actions.append(cancel, save);
  form.append(header, help, rows, actions);
  todoDialog.append(form);
  document.body.append(todoDialog);
  return todoDialog;
}
function buildTodoRows(candidates, result) {
  const host = $('#p2-linked-todo-rows');
  host.replaceChildren();
  todoRows = [];
  const categories = result.account && Array.isArray(result.account.categories) ? result.account.categories.map(c => typeof c === 'string' ? c : c && c.name).filter(Boolean) : [];
  const defaultCategory = linkedTask && linkedTask.category && categories.includes(linkedTask.category) ? linkedTask.category : (categories[0] || '其他');
  const existing = new Set((result.account && Array.isArray(result.account.tasks) ? result.account.tasks : []).map(t => String(t.name || '').trim().toLocaleLowerCase()));
  candidates.forEach(function (candidate, index) {
    const row = el('div', 'p2-linked-todo-row');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = !existing.has(candidate.title.toLocaleLowerCase());
    check.setAttribute('aria-label', '加入任务 ' + candidate.title);
    const name = document.createElement('input');
    name.type = 'text';
    name.value = candidate.title;
    name.maxLength = 160;
    name.setAttribute('aria-label', '任务名称');
    const category = document.createElement('select');
    (categories.length ? categories : ['其他']).forEach(c => category.append(new Option(c, c)));
    if (Array.from(category.options).some(o => o.value === defaultCategory)) category.value = defaultCategory;
    const due = document.createElement('input');
    due.type = 'date';
    due.value = candidate.dueDate || '';
    due.setAttribute('aria-label', '明确截止日期（可留空）');
    const time = document.createElement('input');
    time.type = 'time';
    time.value = candidate.dueTime || '';
    time.setAttribute('aria-label', '明确截止时间（可留空）');
    const fields = el('div', 'p2-linked-todo-fields');
    fields.append(name, category, due, time);
    const duplicate = existing.has(candidate.title.toLocaleLowerCase());
    row.append(check, fields);
    if (duplicate) row.append(el('small', 'p2-linked-todo-duplicate', '与现有任务同名，默认不加入；如确实需要，请修改名称。'));
    host.append(row);
    todoRows.push({ check, name, category, due, time, index });
    name.addEventListener('input', function () {
      const duplicateNow = existing.has(name.value.trim().toLocaleLowerCase());
      check.checked = !duplicateNow;
      const note = row.querySelector('.p2-linked-todo-duplicate');
      if (duplicateNow && !note) row.append(el('small', 'p2-linked-todo-duplicate', '与现有任务同名，默认不加入；如确实需要，请修改名称。'));
      else if (!duplicateNow && note) note.remove();
    });
  });
}
function openTodoDialog() {
  const answer = latestAssistantAnswer();
  if (!answer) return setStatus('当前对话没有可提取的 AI 回答。', true);
  const candidates = extractCandidates(answer);
  if (!candidates.length) return setStatus('没有识别到明确的编号/项目符号行动项。请让 AI 先输出清晰的待办清单，再提取。', true);
  const result = readAccount();
  if (!result.account) return setStatus('未读取到当前账号任务数据。请从原工作台打开 AI，并确认已登录；没有写入任何任务。', true);
  accountSnapshot = result;
  buildTodoRows(candidates, result);
  ensureTodoDialog().showModal();
}
function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function saveSelectedTodos() {
  const result = readAccount();
  if (!result.account || !Array.isArray(result.account.tasks)) {
    setStatus('保存失败：没有读取到当前账号任务数据。', true);
    todoDialog.close();
    return;
  }
  const acct = result.account;
  const tasks = acct.tasks;
  const existing = new Set(tasks.map(task => String(task.name || '').trim().toLocaleLowerCase()));
  const selected = todoRows.filter(row => row.check.checked);
  if (!selected.length) return setStatus('请至少勾选一条要加入的待办。', true);
  const now = Date.now();
  let order = tasks.reduce((max, task) => Math.max(max, Number(task.order || 0)), 0);
  const added = [];
  const skipped = [];
  selected.forEach(function (row) {
    const name = row.name.value.trim().slice(0, 160);
    if (!name) return;
    const key = name.toLocaleLowerCase();
    if (existing.has(key)) { skipped.push(name); return; }
    order += 1;
    const task = {
      id: 'task-ai-' + now.toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      name,
      category: row.category.value || '其他',
      estMinutes: 25,
      firstTime: false,
      multiplier: 1,
      plannedMinutes: 25,
      startMinutes: null,
      date: todayKey(),
      dueDate: row.due.value || '',
      dueTime: row.time.value || '',
      done: false,
      completedAt: null,
      order,
      createdAt: Date.now(),
      weight: 'heavy',
      linkedFromTaskId: linkedTask && linkedTask.id ? linkedTask.id : (String($('#p2-task-context')?.dataset.linkedTaskId || '') || null),
      noteRemark: '来源：关联任务 AI 的回答；加入前已由用户确认。原关联任务未被覆盖。',
      materials: linkedTask && Array.isArray(linkedTask.materials) ? linkedTask.materials.slice(0, 6).map(function (item) {
        return typeof item === 'object' && item ? Object.assign({}, item) : { url: String(item || ''), title: String(item || '') };
      }) : []
    };
    tasks.push(task);
    existing.add(key);
    added.push(name);
  });
  if (!added.length) {
    todoDialog.close();
    return setStatus('没有新增任务：所选项可能与现有任务重复或名称为空。原任务未改变。', true);
  }
  result.all[result.key] = acct;
  try {
    localStorage.setItem(APP_DATA_KEY, JSON.stringify(result.all));
  } catch (error) {
    todoDialog.close();
    return setStatus('写入原任务清单失败：浏览器本地存储不可用。未能确认保存，请检查磁盘空间后重试。', true);
  }
  try {
    if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'SY_TASKS_UPDATED', accountKey: result.key, added: added.length }, location.origin);
  } catch (_) {}
  todoDialog.close();
  refreshTasks();
  setStatus('已把 ' + added.length + ' 条待办写入原任务清单：' + added.join('；') +
    (skipped.length ? '。同名重复项已跳过：' + skipped.join('；') : '') +
    '。原任务及原截止日期未被覆盖；返回工作台如未即时刷新，请刷新任务列表。');
}
function addTodoAction() {
  const composer = $('.p2-composer-wrap');
  if (!composer || $('#p2-extract-todos')) return;
  const button = el('button', 'p2-linked-extract-button', '从最新 AI 回答提取待办');
  button.id = 'p2-extract-todos';
  button.type = 'button';
  button.addEventListener('click', openTodoDialog);
  const hint = el('span', 'p2-linked-extract-hint', '检查重复与截止日期后，确认才写回原清单');
  const row = el('div', 'p2-linked-extract-row');
  row.append(button, hint);
  const form = $('#p2-form', composer);
  if (form) form.insertAdjacentElement('afterend', row);
}
function init() {
  renderTaskPicker();
  refreshTasks();
  addTodoAction();
  try {
    const pending=new URLSearchParams(location.search).get('task') || sessionStorage.getItem('shanganya_task_ai_pending_v1');
    if(pending){
      const select=$('#p2-linked-task-select');
      if(select && Array.from(select.options).some(option=>option.value===pending)){
        select.value=pending;
        updateTaskPreview();
        attachSelectedTask();
        sessionStorage.removeItem('shanganya_task_ai_pending_v1');
      }
    }
  }catch(error){console.warn('任务关联启动失败',error);}
  window.addEventListener('storage', function (event) {
    if (event.key === APP_DATA_KEY) refreshTasks();
  });
  window.addEventListener('focus', refreshTasks);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refreshTasks();
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();

