/* 上岸鸭：任务舱、真实 AI 排程、连续日历。旧账号字段原样保留。 */
(function (root) {
  'use strict';
  const DAY = 86400000;
  const miniValueOr = (value, fallback) => value == null ? fallback : value;
  const miniGet = (value, key) => value == null ? undefined : value[key];
  function miniRemove(node) { if (node) node.remove(); }
  const clone = value => JSON.parse(JSON.stringify(value));
  const dateNumber = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? Date.parse(value + 'T00:00:00Z') / DAY : NaN;
  const duration = task => Math.max(1, Math.ceil(Number(task.plannedMinutes || task.estMinutes) || 15));
  const clock = value => String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(Math.floor(value % 60)).padStart(2, '0');
  const minute = value => /^\d\d:\d\d$/.test(value || '') ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
  function dueNumber(task) {
    const d = dateNumber(task.dueDate);
    return Number.isFinite(d) ? d * 1440 + (miniValueOr(minute(task.dueTime), 1439)) : Infinity;
  }
  function priority(task, date, nowMinutes) {
    const now = dateNumber(date) * 1440 + (nowMinutes || 0);
    const urgent = !!task.urgent || dueNumber(task) <= now + 1440;
    return urgent ? (task.important ? 0 : 1) : (task.important ? 2 : 3);
  }
  function compareTasks(a, b, date, nowMinutes, aiOrder) {
    const tier = priority(a, date, nowMinutes) - priority(b, date, nowMinutes);
    if (tier) return tier;
    if (aiOrder) {
      const ai = aiOrder.indexOf(a.id), bi = aiOrder.indexOf(b.id);
      if (ai >= 0 && bi >= 0 && ai !== bi) return ai - bi;
    }
    return dueNumber(a) - dueNumber(b) || Number(!!b.important) - Number(!!a.important) ||
      Number(a.order || 0) - Number(b.order || 0) || String(a.id).localeCompare(String(b.id));
  }
  function taskSegment(task, date) {
    if (typeof task.startMinutes !== 'number' || !Number.isFinite(task.startMinutes)) return null;
    const base = dateNumber(task.date), target = dateNumber(date);
    if (!Number.isFinite(base) || !Number.isFinite(target)) return null;
    const start = base * 1440 + task.startMinutes;
    let end = start + duration(task);
    if (Number.isFinite(dateNumber(task.endDate)) && typeof task.endMinutes === 'number') {
      const explicit = dateNumber(task.endDate) * 1440 + task.endMinutes;
      if (explicit > start) end = explicit;
    }
    const dayStart = target * 1440;
    if (end <= dayStart || start >= dayStart + 1440) return null;
    return { id: task.id, task, start: Math.max(0, start - dayStart), end: Math.min(1440, end - dayStart), continuesBefore: start < dayStart, continuesAfter: end > dayStart + 1440 };
  }
  function lanesForDay(tasks, date) {
    const segments = tasks.map(t => taskSegment(t, date)).filter(Boolean).sort((a, b) => a.start - b.start || b.end - a.end);
    let group = [], groupEnd = -1;
    function assign() {
      const lanes = [];
      group.forEach(segment => {
        let lane = lanes.findIndex(end => end <= segment.start);
        if (lane < 0) lane = lanes.length;
        lanes[lane] = segment.end;
        segment.lane = lane;
      });
      group.forEach(segment => { segment.laneCount = lanes.length; });
    }
    segments.forEach(segment => {
      if (segment.start >= groupEnd && group.length) { assign(); group = []; groupEnd = -1; }
      group.push(segment); groupEnd = Math.max(groupEnd, segment.end);
    });
    assign();
    return segments;
  }
  // Pure scheduling: only selected movable tasks are returned; fixed appointments remain obstacles.
  function placeTasks(options) {
    const date = options.date;
    if (!Number.isFinite(dateNumber(date))) throw new Error('请选择有效的安排日期');
    const tasks = options.tasks || [], selected = new Set(options.selectedIds || tasks.map(t => t.id));
    const gap = Math.max(0, Math.min(120, Number(options.gapMinutes) || 0));
    const startOfDay = Math.max(0, Math.min(1440, Number(miniValueOr(options.startMinute, 360))));
    const fixed = tasks.filter(t => !selected.has(t.id) || t.done || (typeof t.startMinutes === 'number' && !t.aiScheduled));
    const occupied = fixed.map(t => taskSegment(t, date)).filter(Boolean).map(s => ({ start: s.start, end: s.end }));
    (options.occupied || []).forEach(s => {
      if (Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start) occupied.push({ start: Math.max(0, s.start), end: Math.min(1440, s.end) });
    });
    occupied.sort((a, b) => a.start - b.start);
    const merged = [];
    occupied.forEach(s => { const last = merged[merged.length - 1]; if (last && s.start <= last.end) last.end = Math.max(last.end, s.end); else merged.push(Object.assign({}, s)); });
    const budget = Math.max(0, Number(options.dailyHours) || 0) * 60;
    let used = merged.reduce((sum, s) => sum + s.end - s.start, 0);
    const movable = tasks.filter(t => selected.has(t.id) && !t.done && !(typeof t.startMinutes === 'number' && !t.aiScheduled))
      .sort((a, b) => compareTasks(a, b, date, startOfDay, options.order));
    const placements = [], waiting = [];
    movable.forEach(task => {
      const minutes = duration(task);
      if (used + minutes > budget + 0.01) { waiting.push({ id: task.id, reason: '超过当天可投入时长' }); return; }
      let cursor = startOfDay;
      occupied.sort((a, b) => a.start - b.start);
      for (const block of occupied) {
        if (block.end + gap <= cursor) continue;
        if (cursor + minutes + gap <= block.start) break;
        cursor = Math.max(cursor, block.end + gap);
      }
      if (cursor + minutes > 1440) { waiting.push({ id: task.id, reason: '当天没有足够的连续空档' }); return; }
      const late = dateNumber(date) * 1440 + cursor + minutes > dueNumber(task);
      placements.push({ id: task.id, date, startMinutes: cursor, plannedMinutes: minutes, late });
      occupied.push({ start: cursor, end: cursor + minutes });
      used += minutes;
    });
    return { placements, waiting, fixedIds: fixed.filter(t => selected.has(t.id)).map(t => t.id), usedMinutes: used };
  }
  const pure = { placeTasks, priority, compareTasks, taskSegment, lanesForDay, dueNumber };
  if (typeof module !== 'undefined' && module.exports) module.exports = pure;
  if (!root || !root.document) return;
  root.SYPlanning = pure;
  const S = root.SY;
  if (!S) return;
  const doc = root.document, esc = text => S.escapeHtml(String(miniValueOr(text, '')));
  const selected = new Set(), history = [];
  let listPageSize=40, inboxPageSize=40;
  let planning = false, report = null, modal = null, monthKey = null;
  let selectionOwner = S.currentAccountKey;
  function today() { return S.todayKey(); }
  function syncOwner() { if (selectionOwner !== S.currentAccountKey) { selected.clear(); history.length = 0; report = null; selectionOwner = S.currentAccountKey; } }
  function tell(text, canUndo) {
    let node = doc.getElementById('syToast');
    if (!node) { node = doc.createElement('div'); node.id = 'syToast'; node.className = 'sy-toast'; node.setAttribute('role', 'status'); doc.body.appendChild(node); }
    node.innerHTML = DOMPurify.sanitize('<span>' + esc(text) + '</span>' + (canUndo ? '<button type="button" data-sy-undo>撤销</button>' : ''));
    node.hidden = false;
    clearTimeout(node._timer); node._timer = setTimeout(() => { node.hidden = true; }, canUndo ? 15000 : 7000);
  }
  function record(label, before, after, ids) {
    history.push({ label, owner: S.currentAccountKey, ids, before: clone(before), after: clone(after) });
    if (history.length > 30) history.shift();
  }
  function saveChange(label, mutate) {
    syncOwner();
    const before = S.getAcctData(), after = clone(before);
    mutate(after);
    const ids = [...new Set([...before.tasks.map(t => t.id), ...after.tasks.map(t => t.id)])].filter(id => JSON.stringify(before.tasks.find(t => t.id === id)) !== JSON.stringify(after.tasks.find(t => t.id === id)));
    record(label, before, after, ids);
    S.saveAcctData(after);
    S.renderSidebarCategoryList();
    S.refreshCurrentView();
    tell(label, true);
  }
  function undo() {
    syncOwner();
    const item = history.pop();
    if (!item) { tell('暂无可撤销的操作'); return; }
    const acct = S.getAcctData();
    if (item.owner !== S.currentAccountKey) return;
    item.ids.forEach(id => {
      const before = item.before.tasks.find(t => t.id === id), after = item.after.tasks.find(t => t.id === id);
      const idx = acct.tasks.findIndex(t => t.id === id), current = acct.tasks[idx];
      if (!before && after && current) { if (JSON.stringify(current) === JSON.stringify(after)) acct.tasks.splice(idx, 1); return; }
      if (before && !after && !current) { acct.tasks.splice(Math.min(item.before.tasks.findIndex(t => t.id === id), acct.tasks.length), 0, clone(before)); return; }
      if (!before || !after || !current) return;
      [...new Set([...Object.keys(before), ...Object.keys(after)])].forEach(key => {
        if (JSON.stringify(before[key]) !== JSON.stringify(after[key]) && JSON.stringify(current[key]) === JSON.stringify(after[key])) {
          if (Object.prototype.hasOwnProperty.call(before, key)) current[key] = clone(before[key]); else delete current[key];
        }
      });
    });
    ['coins', 'lifetimeCoins'].forEach(key => {
      const delta = Number(item.after[key] || 0) - Number(item.before[key] || 0);
      if (delta) acct[key] = Math.max(0, Number(acct[key] || 0) - delta);
    });
    if (JSON.stringify(acct.categories) === JSON.stringify(item.after.categories)) acct.categories = clone(item.before.categories);
    [...new Set([...Object.keys(item.before.dailyHours || {}), ...Object.keys(item.after.dailyHours || {})])].forEach(date => {
      if (miniGet(item.before.dailyHours, date) !== miniGet(item.after.dailyHours, date) && acct.dailyHours[date] === miniGet(item.after.dailyHours, date)) {
        if (Object.prototype.hasOwnProperty.call(item.before.dailyHours || {}, date)) acct.dailyHours[date] = item.before.dailyHours[date]; else delete acct.dailyHours[date];
      }
    });
    S.saveAcctData(acct); S.renderSidebarCategoryList(); S.refreshCurrentView();
    if (typeof S.updateCoinDisplay === 'function') S.updateCoinDisplay();
    miniRemove(doc.getElementById('lcUndoToast'));
    tell('已撤销：' + item.label);
  }
  const originalDone = S.toggleTaskDone;
  S.toggleTaskDone = function (id) {
    syncOwner(); const before = S.getAcctData();
    originalDone(id);
    const after = S.getAcctData();
    if (JSON.stringify(before.tasks.find(t => t.id === id)) !== JSON.stringify(after.tasks.find(t => t.id === id))) {
      record('完成状态', before, after, [id]);
      miniRemove(doc.getElementById('lcUndoToast'));
      tell(miniGet(after.tasks.find(t => t.id === id), 'done') ? '已抵达。点错可撤销，原日期和位置保留。' : '已返回原计划，日期和位置未变。', true);
    }
  };
  S.deleteTask = function (id) {
    const task = S.getAcctData().tasks.find(t => t.id === id);
    if (!task) return;
    if (miniGet(S.getAcctData().activeTimer, 'taskId') === id) { tell('这项任务正在计时，请先结束计时后再移除。'); return; }
    saveChange('移除「' + task.name + '」', acct => { acct.tasks = acct.tasks.filter(t => t.id !== id); });
    selected.delete(id);
  };
  function icon(type) {
    const paths = { assignment: '<path d="M7 3h10v3H7zM6 5H4v16h16V5h-2M8 11h8M8 15h6"/>', work: '<path d="M3 6h18v14H3zM8 6V3h8v3M3 11h18M10 10v3h4v-3"/>', learning: '<path d="m2 8 10-5 10 5-10 5zM6 10v7c4 3 8 3 12 0v-7M22 8v9"/>', life: '<path d="m3 11 9-8 9 8M5 9v12h14V9M9 21v-8h6v8"/>' };
    return '<svg class="sy-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[type] || paths.learning) + '</svg>';
  }
  function inferredType(task) { return task.taskType || (/作业|考试|课程/.test(task.category + task.name) ? 'assignment' : /作品|项目|工作|运营/.test(task.category + task.name) ? 'work' : /生活|健康/.test(task.category) ? 'life' : 'learning'); }
  function categoryOptions(acct, value, placeholder) {
    return (placeholder ? '<option value="">' + esc(placeholder) + '</option>' : '') + acct.categories.map(c => '<option value="' + esc(c.name) + '"' + (c.name === value ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
  }
  function rowHtml(task, selectMode) {
    const due = task.dueDate ? '<span class="sy-deadline' + (dueNumber(task) < dateNumber(today()) * 1440 && !task.done ? ' sy-overdue' : '') + '">截止 ' + esc(task.dueDate) + (task.dueTime ? ' ' + esc(task.dueTime) : '') + '</span>' : '';
    const fixed = typeof task.startMinutes === 'number' && !task.aiScheduled;
    return '<article class="sy-task-row' + (task.done ? ' sy-task-done' : '') + '" data-task-id="' + esc(task.id) + '" style="--sy-task-color:' + esc(S.categoryColor(task.category)) + '">' +
      '<button type="button" class="sy-done" data-sy-done="' + esc(task.id) + '" aria-label="' + (task.done ? '取消完成并返回原位置' : '标记完成') + '" aria-pressed="' + !!task.done + '">' + (task.done ? '✓' : '') + '</button>' +
      '<div class="sy-task-info"><button type="button" class="sy-task-title" data-sy-edit="' + esc(task.id) + '">' + icon(inferredType(task)) + esc(task.name) + '</button><div class="sy-task-meta"><span>' + esc(task.date) + (typeof task.startMinutes === 'number' ? ' ' + clock(task.startMinutes) + (fixed ? ' · 固定时间' : ' · 已排程') : ' · 待安排') + '</span><span>' + duration(task) + ' 分钟</span>' + due + '</div>' +
      '<div class="sy-task-flags">' + (task.urgent ? '<span>紧急</span>' : '') + (task.important ? '<span>重要</span>' : '') + (task.endDate && task.endDate !== task.date ? '<span>持续至 ' + esc(task.endDate) + '</span>' : '') + '</div></div>' +
      '<div class="sy-row-actions">' + (!task.done ? '<button type="button" class="sy-start" data-sy-start="' + esc(task.id) + '" title="开始这项任务">▶<span>开始</span></button>' : '') + '<button type="button" class="sy-action-trigger" data-sy-action="' + esc(task.id) + '" aria-label="打开任务工具舱">⌘<span>工具舱</span></button></div>' +
      (selectMode ? '<label class="sy-select-task"><input type="checkbox" data-sy-select="' + esc(task.id) + '"' + (selected.has(task.id) ? ' checked' : '') + '><span>选择</span></label>' : '') + '</article>';
  }
  function renderReport() {
    if (!report) return '';
    return '<section class="sy-plan-report" role="status"><b>' + esc(report.title) + '</b><p>' + esc(report.text) + '</p>' + (miniGet(report.lines, 'length') ? '<ul>' + report.lines.map(line => '<li>' + esc(line) + '</li>').join('') + '</ul>' : '') + '</section>';
  }
  function selectedTasks() { return S.getAcctData().tasks.filter(t => !t.done && selected.has(t.id)); }
  S.renderListView = function (sub) {
    syncOwner();
    const acct = S.getAcctData(), tasks = acct.tasks.filter(t => !t.done), liveIds = new Set(tasks.map(t => t.id));
    selected.forEach(id => { if (!liveIds.has(id)) selected.delete(id); });
    const cats = [...new Set([...acct.categories.map(c => c.name), ...tasks.map(t => t.category)])];
    const target = S.dayViewDate || today();
    sub.innerHTML = DOMPurify.sanitize('<section class="sy-list-shell"><header class="sy-section-heading"><div><small>MISSION MANIFEST</small><h2>航线清单</h2><p>先勾选右侧任务，再选择类别与安排日期。</p></div><button type="button" class="sy-primary" data-sy-capture>＋ 快速收集</button></header>' +
      '<div class="sy-plan-toolbar"><label class="sy-select-all"><input type="checkbox" id="sySelectAll"' + (tasks.length && tasks.every(t => selected.has(t.id)) ? ' checked' : '') + '>全选</label><span id="sySelectedCount">已选 ' + selected.size + ' 项</span>' +
      '<label>类别<select id="syBatchCategory">' + categoryOptions(acct, '', '保留各自类别') + '</select></label><button type="button" id="syApplyCategory">应用类别</button><button type="button" data-sy-new-category>＋ 类别</button>' +
      '<label>安排日期<input type="date" id="syPlanDate" value="' + esc(target) + '"></label><label>可投入<input type="number" id="syPlanHours" min="0.25" max="24" step="0.25" value="' + esc(miniValueOr(acct.dailyHours[target], 4)) + '">小时</label>' +
      '<button type="button" class="sy-primary" id="syGeneratePlan"' + (planning ? ' disabled' : '') + '>' + (planning ? '正在安排…' : 'AI · 网页版') + '</button><button type="button" id="syLocalPlan"' + (planning ? ' disabled' : '') + '>按紧急程度排程</button></div>' +
      '<p class="sy-helper">列表按紧急程度、重要性与截止时间排序。固定时间的任务保留原位；其他未选任务不会移动。</p>' + renderReport() + cats.map(cat => {
        const group = tasks.filter(t => t.category === cat).sort((a, b) => compareTasks(a, b, today(), new Date().getHours() * 60 + new Date().getMinutes()));
        return '<section class="sy-category" style="--sy-category-color:' + esc(S.categoryColor(cat)) + '"><header><button type="button" data-sy-receipt="' + esc(cat) + '">' + icon(inferredType({ category: cat, name: '' })) + '<b>' + esc(cat) + '</b><span>' + group.length + '</span></button><button type="button" data-sy-capture-cat="' + esc(cat) + '">＋ 加一项</button></header>' + (group.length ? group.slice(0,listPageSize).map(t => rowHtml(t, true)).join('') : '<p class="sy-empty">清单已就位，收集第一项任务。</p>') + '</section>';
      }).join('') + '</section>');
    if(tasks.length>listPageSize){const more=doc.createElement('button');more.type='button';more.className='mini-library-more';more.textContent='再显示 40 项任务';more.addEventListener('click',()=>{listPageSize+=40;S.renderListView(sub);});sub.appendChild(more);}
    sub.querySelector('#sySelectAll').onchange = e => { tasks.forEach(t => e.target.checked ? selected.add(t.id) : selected.delete(t.id)); S.renderListView(sub); };
    sub.querySelectorAll('[data-sy-select]').forEach(input => { input.onchange = () => { input.checked ? selected.add(input.dataset.sySelect) : selected.delete(input.dataset.sySelect); sub.querySelector('#sySelectedCount').textContent = '已选 ' + selected.size + ' 项'; sub.querySelector('#sySelectAll').checked = !!tasks.length && tasks.every(t => selected.has(t.id)); }; });
    sub.querySelector('#syApplyCategory').onclick = () => {
      const cat = sub.querySelector('#syBatchCategory').value;
      if (!selected.size || !cat) { tell('先选择任务和目标类别'); return; }
      saveChange('已更新所选任务类别', a => a.tasks.forEach(t => { if (selected.has(t.id) && !t.done) t.category = cat; }));
    };
    sub.querySelector('#syPlanDate').onchange = e => { const d = e.target.value; sub.querySelector('#syPlanHours').value = miniValueOr(acct.dailyHours[d], 4); };
    sub.querySelector('#syGeneratePlan').onclick = () => window.SYMini.notice('AI 计划在完整网页版中使用；小工具可用旁边的紧急程度排程。');
    sub.querySelector('#syLocalPlan').onclick = () => generatePlan(false, sub);
  };
  async function generatePlan(withAI, sub) {
    if (planning) return;
    const picked = selectedTasks(), date = sub.querySelector('#syPlanDate').value, hours = Number(sub.querySelector('#syPlanHours').value), cat = sub.querySelector('#syBatchCategory').value;
    if (!picked.length) { tell('先在任务右侧勾选要安排的项目'); return; }
    if (!Number.isFinite(dateNumber(date)) || !(hours > 0 && hours <= 24)) { tell('请选择有效日期，并填写 0.25～24 小时'); return; }
    const acct = S.getAcctData(), owner = S.currentAccountKey, pickedIds = picked.map(t => t.id), fingerprint = JSON.stringify(acct.tasks);
    const now = new Date(), startMinute = date === today() ? Math.max(360, now.getHours() * 60 + now.getMinutes() + 1) : 360;
    let ai = null;
    planning = true;
    const btn = sub.querySelector(withAI ? '#syGeneratePlan' : '#syLocalPlan'); btn.disabled = true; btn.textContent = withAI ? 'AI 正在分析…' : '正在安排…';
    try {
      if (withAI) {
        const occupied = acct.tasks.filter(t => !pickedIds.includes(t.id) || t.done || (typeof t.startMinutes === 'number' && !t.aiScheduled)).map(t => taskSegment(t, date)).filter(Boolean).map(s => ({ id: s.id, start: s.start, end: s.end }));
        const result = await S.backendCall('/api/plan', { tasks: picked.map(t => ({ id: t.id, name: t.name, category: cat || t.category, plannedMinutes: duration(t), important: !!t.important, urgent: !!t.urgent, dueDate: t.dueDate || null, dueTime: t.dueTime || null, fixed: typeof t.startMinutes === 'number' && !t.aiScheduled })), date, dailyHours: hours, gapMinutes: acct.taskGapMinutes, occupied }, 60000);
        if (!result.ok) throw new Error(result.error || 'AI 服务暂时不可用');
        ai = result.data;
        if (!ai || !Array.isArray(ai.order) || ai.order.length !== pickedIds.length || new Set(ai.order).size !== pickedIds.length || ai.order.some(id => !pickedIds.includes(id))) throw new Error('AI 返回的任务顺序不完整，本次没有修改任务');
      }
      if (owner !== S.currentAccountKey || JSON.stringify(S.getAcctData().tasks) !== fingerprint) throw new Error('任务在生成期间发生了变化，请重新勾选后生成');
      const result = placeTasks({ tasks: acct.tasks, selectedIds: pickedIds, date, dailyHours: hours, gapMinutes: acct.taskGapMinutes, startMinute, order: miniGet(ai, 'order') });
      const lines = [];
      result.placements.forEach(p => { const task = picked.find(t => t.id === p.id); lines.push(clock(p.startMinutes) + ' ' + task.name + (p.late ? ' · 注意：预计晚于截止时间' : '') + (miniGet(miniGet(ai, 'reasons'), p.id) ? ' — ' + String(ai.reasons[p.id]).slice(0, 220) : '')); });
      result.waiting.forEach(p => lines.push(picked.find(t => t.id === p.id).name + '：' + p.reason + '，保留在待安排')); 
      report = { title: withAI ? 'AI 已生成计划 · ' + (ai.model || '已连接模型') : '按紧急程度完成本地排程', text: '已安排 ' + result.placements.length + ' 项，待安排 ' + result.waiting.length + ' 项，固定时间保留 ' + result.fixedIds.length + ' 项。', lines };
      saveChange(withAI ? '已应用 AI 计划' : '已应用紧急程度排程', a => {
        a.dailyHours[date] = hours;
        if (cat) a.tasks.forEach(t => { if (pickedIds.includes(t.id)) t.category = cat; });
        result.placements.forEach(p => {
          const task = a.tasks.find(t => t.id === p.id);
          Object.assign(task, { date, startMinutes: p.startMinutes, plannedMinutes: p.plannedMinutes, aiScheduled: true, scheduleSource: withAI ? 'ai' : 'local', order: result.placements.indexOf(p) + 1 });
          delete task.endDate; delete task.endMinutes;
        });
        result.waiting.forEach(p => { const task = a.tasks.find(t => t.id === p.id); task.date = date; task.startMinutes = null; delete task.endDate; delete task.endMinutes; });
      });
    } catch (error) {
      report = { title: withAI ? 'AI 计划尚未生成' : '尚未完成排程', text: String(error.message || error) + '。可使用旁边的“按紧急程度排程”，按固定规则在本机完成安排。', lines: [] };
      tell(report.title + '：' + error.message);
    } finally {
      planning = false;
      if (S.activeDailyTab === 'list' && doc.getElementById('dailySub')) S.renderListView(doc.getElementById('dailySub'));
    }
  }
  function modalShell(title, body, wide) {
    closeModal();
    modal = doc.createElement('div'); modal.className = 'sy-modal-overlay';
    modal.innerHTML = DOMPurify.sanitize('<section class="sy-modal' + (wide ? ' sy-modal-wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="syModalTitle"><header><div><small>上岸鸭 · 任务舱</small><h2 id="syModalTitle">' + esc(title) + '</h2></div><button type="button" data-sy-close aria-label="关闭">×</button></header>' + body + '</section>');
    doc.body.appendChild(modal); modal._returnFocus = doc.activeElement;
    modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-sy-close]')) closeModal(); });
    modal.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
      if (e.key !== 'Tab') return;
      const nodes = [...modal.querySelectorAll('button,input,select,textarea,a[href]')].filter(n => !n.disabled && n.offsetParent !== null);
      if (!nodes.length) return;
      if (e.shiftKey && doc.activeElement === nodes[0]) { e.preventDefault(); nodes[nodes.length - 1].focus(); }
      else if (!e.shiftKey && doc.activeElement === nodes[nodes.length - 1]) { e.preventDefault(); nodes[0].focus(); }
    });
    requestAnimationFrame(() => { const first = modal && modal.querySelector('input,button,select'); if (first) first.focus(); });
    return modal;
  }
  function closeModal() { if (modal) { const focus = modal._returnFocus; modal.remove(); modal = null; if (miniGet(focus, 'isConnected')) focus.focus(); } }
  function typeOptions(value) { return [['learning', '学习'], ['assignment', '作业'], ['work', '作品 / 工作'], ['life', '生活']].map(([key, text]) => '<option value="' + key + '"' + (key === value ? ' selected' : '') + '>' + text + '</option>').join(''); }
  function openEditor(id, category, quick) {
    const acct = S.getAcctData(), task = acct.tasks.find(t => t.id === id), date = miniGet(task, 'date') || S.dayViewDate || today();
    const categories = clone(acct.categories);
    if (miniGet(task, 'category') && !categories.some(c => c.name === task.category)) categories.push({ name: task.category });
    const title = task ? '编辑航点' : quick ? '念头靠岸，马上收好' : '新增航点';
    const box = modalShell(title, '<form id="syTaskForm"><label class="sy-field">任务名称<input name="syTaskLabel" maxlength="200" required placeholder="把脑海里的一件事写下来" value="' + esc(miniGet(task, 'name') || '') + '"></label>' +
      '<div class="sy-form-grid"><label class="sy-field">所属类别<select name="category">' + categoryOptions({ categories }, miniGet(task, 'category') || category || miniGet(categories[0], 'name')) + '</select></label><label class="sy-field">任务类型<select name="type">' + typeOptions(task ? inferredType(task) : 'learning') + '</select></label>' +
      '<label class="sy-field">安排日期<input type="date" name="date" required value="' + esc(date) + '"></label><label class="sy-field">预计用时 / 分钟<input type="number" name="minutes" min="1" max="1440" required value="' + esc(miniGet(task, 'estMinutes') || 25) + '"></label>' +
      '<label class="sy-field">截止日期<input type="date" name="dueDate" value="' + esc(miniGet(task, 'dueDate') || '') + '"></label><label class="sy-field">截止时间<input type="time" name="dueTime" value="' + esc(miniGet(task, 'dueTime') || '') + '"></label></div>' +
      '<details' + (!quick ? ' open' : '') + '><summary>时间与优先级</summary><div class="sy-form-grid"><label class="sy-field">固定开始时间<input type="time" name="start" value="' + (typeof miniGet(task, 'startMinutes') === 'number' ? clock(task.startMinutes) : '') + '"></label><label class="sy-field">结束日期（跨天事件）<input type="date" name="endDate" value="' + esc(miniGet(task, 'endDate') || '') + '"></label><label class="sy-field">结束时间<input type="time" name="end" value="' + (typeof miniGet(task, 'endMinutes') === 'number' ? clock(task.endMinutes) : '') + '"></label></div><div class="sy-check-row"><label><input type="checkbox" name="important"' + (miniGet(task, 'important') ? ' checked' : '') + '>重要</label><label><input type="checkbox" name="urgent"' + (miniGet(task, 'urgent') ? ' checked' : '') + '>紧急</label><label><input type="checkbox" name="firstTime"' + (miniGet(task, 'firstTime') ? ' checked' : '') + '>第一次做，预留双倍缓冲</label></div><p class="sy-helper">开始时间留空即可参与排程；设置后按固定约定保留。跨天事件请同时填写开始、结束日期和时间。</p></details>' +
      '<p class="sy-form-error" id="syTaskError" role="alert"></p><footer><button type="button" data-sy-close>取消</button><button type="submit" class="sy-primary">' + (task ? '保存航点' : '收进清单') + '</button></footer></form>');
    box.querySelector('input[name="syTaskLabel"]').focus();
    box.querySelector('form').onsubmit = e => {
      e.preventDefault(); const data = new FormData(e.target), name = String(data.get('syTaskLabel')).trim(), start = minute(data.get('start'));
      const endDate = String(data.get('endDate')), end = minute(data.get('end')), date = String(data.get('date')), dueDate = String(data.get('dueDate')), dueTime = String(data.get('dueTime'));
      const error = box.querySelector('#syTaskError');
      if (!name) { error.textContent = '请填写任务名称'; return; }
      if ((endDate || end !== null) && (start === null || !endDate || end === null || dateNumber(endDate) * 1440 + end <= dateNumber(date) * 1440 + start)) { error.textContent = '跨天事件需要完整的开始与结束时间，结束必须晚于开始。'; return; }
      if (dueTime && !dueDate) { error.textContent = '填写截止时间时也请选择截止日期。'; return; }
      const idToSave = miniGet(task, 'id') || S.uid();
      const firstTime = data.get('firstTime') === 'on', minutes = Number(data.get('minutes')), multiplier = firstTime ? 2 : 1.3;
      saveChange(task ? '已保存任务修改' : '已收进「' + String(data.get('category')) + '」', a => {
        let t = a.tasks.find(t => t.id === idToSave);
        if (!t) { t = { id: idToSave, createdAt: Date.now(), done: false, completedAt: null, order: Math.max(0, ...a.tasks.map(x => Number(x.order) || 0)) + 1 }; a.tasks.push(t); }
        Object.assign(t, { name, category: String(data.get('category')), taskType: String(data.get('type')), date, estMinutes: minutes, firstTime, multiplier, plannedMinutes: Math.ceil(minutes * multiplier), startMinutes: start, important: data.get('important') === 'on', urgent: data.get('urgent') === 'on', dueDate: dueDate || null, dueTime: dueTime || null });
        if (task && task.estMinutes === minutes && !!task.firstTime === firstTime) t.plannedMinutes = task.plannedMinutes;
        if (endDate && end !== null) { t.endDate = endDate; t.endMinutes = end; t.plannedMinutes = (dateNumber(endDate) - dateNumber(date)) * 1440 + end - start; }
        else { delete t.endDate; delete t.endMinutes; }
        if (!task || start !== task.startMinutes || date !== task.date) { t.aiScheduled = false; delete t.scheduleSource; }
      });
      closeModal();
    };
  }
  S.openTaskModal = id => openEditor(id, null, false);
  S.openQuickCapture = () => openEditor(null, null, true);
  function openCategory() {
    const box = modalShell('给清单开一个新舱位', '<form id="syCategoryForm"><label class="sy-field">类别名称<input name="syTaskLabel" required maxlength="30" placeholder="例如：毕业作品"></label><label class="sy-field">类别颜色<input type="color" name="color" value="#67d4bd"></label><p class="sy-form-error" role="alert"></p><footer><button type="button" data-sy-close>取消</button><button class="sy-primary" type="submit">创建并加入清单</button></footer></form>');
    box.querySelector('form').onsubmit = e => {
      e.preventDefault(); const data = new FormData(e.target), name = String(data.get('syTaskLabel')).trim();
      if (!name || S.getAcctData().categories.some(c => c.name === name)) { box.querySelector('.sy-form-error').textContent = '请输入不重复的类别名称'; return; }
      saveChange('已创建类别「' + name + '」', a => a.categories.push({ name, color: String(data.get('color')) })); closeModal();
    };
  }
  function openAction(id) {
    const task = S.getAcctData().tasks.find(t => t.id === id); if (!task) return;
    const box = modalShell(task.name, '<p class="sy-helper">下一步想怎么推进这个航点？</p><div class="sy-action-grid"><button data-tool="sourcequest">⌕<b>AI 资料闯关</b><span>上传文档、粘贴链接、全网检索</span></button><button data-tool="edit">✎<b>调整航点</b><span>时间、截止日期、类别</span></button><button data-tool="quest">◈<b>打开关卡地图</b><span>拆成小步，逐关推进</span></button><button data-tool="notes">▤<b>收进知识舱</b><span>笔记、收获与复盘</span></button><button data-tool="important">☆<b>' + (task.important ? '取消重要' : '标记重要') + '</b><span>决定任务优先级</span></button><button data-tool="urgent">◷<b>' + (task.urgent ? '取消紧急' : '标记紧急') + '</b><span>优先安排时间敏感的事</span></button><button data-tool="complete">✓<b>' + (task.done ? '返回航线' : '已抵达') + '</b><span>' + (task.done ? '恢复原日期与位置' : '完成后可随时撤销') + '</span></button><button data-tool="delete" class="sy-danger">⌫<b>移出清单</b><span>可用 Ctrl / ⌘ Z 撤销</span></button></div>');
    box.querySelectorAll('[data-tool]').forEach(btn => { btn.onclick = () => { const tool = btn.dataset.tool; closeModal(); if (tool === 'sourcequest' && window.FocusQuest) window.FocusQuest.openForTask(task); else if (tool === 'edit') S.openTaskModal(id); else if (tool === 'quest') S.openQuest(id); else if (tool === 'notes') S.openTaskNotesModal(id); else if (tool === 'complete') S.toggleTaskDone(id); else if (tool === 'delete') S.deleteTask(id); else saveChange('已更新任务优先级', a => { const t = a.tasks.find(x => x.id === id); t[tool] = !t[tool]; }); }; });
  }
  function dayNav(date, span) {
    return '<div class="sy-calendar-nav"><button type="button" data-sy-jump="' + (-span) + '" aria-label="上一段日期">‹</button><input type="date" id="syCalendarDate" value="' + esc(date) + '"><button type="button" data-sy-jump="' + span + '" aria-label="下一段日期">›</button><button type="button" data-sy-today>今天</button><button type="button" data-sy-capture class="sy-primary">＋ 收集任务</button><button type="button" data-sy-list>去列表排程</button></div>';
  }
  function timelineHTML(keys) {
    const acct = S.getAcctData();
    const hours = Array.from({ length: 24 }, (_, i) => '<span style="top:' + (i * 72) + 'px">' + clock(i * 60) + '</span>').join('');
    return '<div class="sy-calendar-scroll"><div class="sy-calendar-grid" style="--sy-days:' + keys.length + '"><div class="sy-time-labels"><div class="sy-day-header"></div><div class="sy-time-axis">' + hours + '</div></div>' + keys.map(date => {
      const segments = lanesForDay(acct.tasks, date), weekday = ['日','一','二','三','四','五','六'][new Date(date + 'T12:00:00').getDay()];
      const blocks = segments.map(s => {
        const t = s.task, label = (s.continuesBefore ? '← ' : '') + clock(s.start) + '–' + clock(s.end) + (s.continuesAfter ? ' →' : '');
        return '<button type="button" class="sy-calendar-block' + (t.done ? ' sy-calendar-done' : '') + '" data-sy-action="' + esc(t.id) + '" title="' + esc(t.name + ' · ' + label + ' · ' + t.category) + '" style="--sy-task-color:' + esc(S.categoryColor(t.category)) + ';top:' + (s.start * 1.2) + 'px;height:' + Math.max(34,((s.end - s.start) * 1.2)) + 'px;left:calc(' + (s.lane / s.laneCount * 100) + '% + 24px);width:calc(' + (100 / s.laneCount) + '% - 34px)"><b>' + esc(t.name) + '</b><span>' + esc(label) + '</span></button>';
      }).join('');
      const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
      return '<div class="sy-day-column"><button type="button" class="sy-day-header' + (date === today() ? ' sy-is-today' : '') + '" data-sy-day="' + esc(date) + '"><span>周' + weekday + '</span><b>' + esc(date.slice(5)) + '</b></button><div class="sy-day-track">' + blocks + (date === today() ? '<div class="sy-now-line" style="top:' + (nowMin * .8) + 'px"></div>' : '') + '</div></div>';
    }).join('') + '</div></div>';
  }
  function bindCalendar(sub, span) {
    sub.querySelectorAll('[data-sy-jump]').forEach(btn => btn.onclick = () => { S.dayViewDate = S.addDaysKey(S.dayViewDate, Number(btn.dataset.syJump)); S.renderDailyTab(); });
    sub.querySelector('[data-sy-today]').onclick = () => { S.dayViewDate = today(); S.renderDailyTab(); };
    sub.querySelector('#syCalendarDate').onchange = e => { if (e.target.value) { S.dayViewDate = e.target.value; S.renderDailyTab(); } };
    const scroll = sub.querySelector('.sy-calendar-scroll');
    if (scroll) requestAnimationFrame(() => { scroll.scrollTop = 72 * 7; });
  }
  S.renderDayView = function (sub) {
    const date = S.dayViewDate, acct = S.getAcctData(), tasks = acct.tasks.filter(t => t.date === date), waiting = tasks.filter(t => typeof t.startMinutes !== 'number');
    const done = tasks.filter(t => t.done).length;
    sub.innerHTML = DOMPurify.sanitize('<section class="sy-calendar-shell">' + dayNav(date, 1) + '<div class="sy-day-summary"><div><small>今日航程</small><b>' + done + ' / ' + tasks.length + '<span> 项已完成</span></b></div><label>可投入 <input type="number" id="syDayHours" min="0.25" max="24" step="0.25" value="' + esc(miniValueOr(acct.dailyHours[date], 4)) + '"> 小时</label><span>重叠事件并排呈现，跨天任务连续显示。</span></div>' + timelineHTML([date]) + (waiting.length ? '<section class="sy-waiting"><h3>登船托盘 · 待安排 ' + waiting.length + ' 项</h3>' + waiting.sort((a,b) => compareTasks(a,b,date,0)).map(t => rowHtml(t, false)).join('') + '</section>' : '') + '</section>');
    bindCalendar(sub, 1);
    sub.querySelector('#syDayHours').onchange = e => { const hours = Number(e.target.value); if (hours > 0 && hours <= 24) { const a = S.getAcctData(); a.dailyHours[date] = hours; S.saveAcctData(a); } };
  };
  S.renderMultiDayView = function (sub, span) {
    let start = S.dayViewDate;
    if (span === 7) start = S.addDaysKey(start, -((new Date(start + 'T12:00:00').getDay() + 6) % 7));
    const keys = Array.from({ length: span }, (_, i) => S.addDaysKey(start, i)), acct = S.getAcctData();
    const waiting = acct.tasks.filter(t => keys.includes(t.date) && typeof t.startMinutes !== 'number');
    sub.innerHTML = DOMPurify.sanitize('<section class="sy-calendar-shell">' + dayNav(S.dayViewDate, span) + '<p class="sy-helper">' + esc(keys[0] + ' 至 ' + keys[keys.length - 1]) + ' · 每个色块对应实际起止时间，跨天事件逐日延续。</p>' + timelineHTML(keys) + (waiting.length ? '<section class="sy-waiting"><h3>本段待安排 · ' + waiting.length + ' 项</h3>' + waiting.map(t => rowHtml(t, false)).join('') + '</section>' : '') + '</section>');
    bindCalendar(sub, span);
  };
  S.renderMonthView = function (sub) {
    const anchor = monthKey || S.dayViewDate.slice(0, 7), first = anchor + '-01', offset = (new Date(first + 'T12:00:00').getDay() + 6) % 7;
    const start = S.addDaysKey(first, -offset), acct = S.getAcctData();
    let content = '<div class="sy-month-nav"><button type="button" data-sy-month="-1" aria-label="上个月">‹</button><h2>' + esc(anchor) + '</h2><button type="button" data-sy-month="1" aria-label="下个月">›</button><button type="button" data-sy-month="0">本月</button></div><div class="sy-month-weekdays">' + ['一','二','三','四','五','六','日'].map(w => '<span>周' + w + '</span>').join('') + '</div>';
    for (let w = 0; w < 6; w++) {
      const keys = Array.from({ length: 7 }, (_, i) => S.addDaysKey(start, w * 7 + i));
      const items = acct.tasks.map(t => {
        const visible = keys.map((date, index) => (taskSegment(t, date) || (t.date === date && typeof t.startMinutes !== 'number')) ? index : -1).filter(index => index >= 0);
        return visible.length ? { task: t, first: visible[0], last: visible[visible.length - 1] } : null;
      }).filter(Boolean).sort((a, b) => a.first - b.first || b.last - a.last);
      const lanes = [];
      items.forEach(item => { let lane = lanes.findIndex(end => end < item.first); if (lane < 0) lane = lanes.length; lanes[lane] = item.last; item.lane = lane; });
      content += '<section class="sy-month-week"><div class="sy-month-dates">' + keys.map(k => '<button type="button" data-sy-day="' + k + '" class="' + (k.slice(0,7) !== anchor ? 'sy-other-month ' : '') + (k === today() ? 'sy-is-today' : '') + '">' + Number(k.slice(8)) + '</button>').join('') + '</div><div class="sy-month-events" style="grid-template-rows:repeat(' + Math.max(1, lanes.length) + ',28px)">' + items.map(item => '<button type="button" class="sy-month-event' + (item.task.done ? ' sy-calendar-done' : '') + '" data-sy-action="' + esc(item.task.id) + '" title="' + esc(item.task.name) + '" style="--sy-task-color:' + esc(S.categoryColor(item.task.category)) + ';grid-column:' + (item.first + 1) + '/' + (item.last + 2) + ';grid-row:' + (item.lane + 1) + '">' + esc(item.task.name) + '</button>').join('') + '</div></section>';
    }
    sub.innerHTML = DOMPurify.sanitize('<section class="sy-calendar-shell sy-month-shell">' + content + '</section>');
    sub.querySelectorAll('[data-sy-month]').forEach(btn => btn.onclick = () => { const delta = Number(btn.dataset.syMonth); if (!delta) monthKey = today().slice(0,7); else { const date = new Date(anchor + '-01T12:00:00'); date.setMonth(date.getMonth() + delta); monthKey = S.fmtDateKey(date).slice(0,7); } S.renderMonthView(sub); });
  };
  S.renderInbox = function () {
    const body = doc.getElementById('inboxBody'); if (!body) return;
    const done = S.getAcctData().tasks.filter(t => t.done).sort((a,b) => (b.completedAt || 0) - (a.completedAt || 0));
    body.innerHTML = DOMPurify.sanitize('<header class="sy-section-heading"><div><small>ARRIVAL ARCHIVE</small><h2>抵达收集箱</h2><p>取消左侧对勾，任务会回到原来的日期、类别和位置。快捷键 Ctrl / ⌘ Z 可撤销最近操作。</p></div></header>' + (done.length ? done.slice(0,inboxPageSize).map(t => rowHtml(t, false)).join('') : '<p class="sy-empty">还没有已抵达的航点。</p>'));
  };
  const renderPagedInbox=S.renderInbox;S.renderInbox=function(){renderPagedInbox();const count=S.getAcctData().tasks.filter(t=>t.done).length;if(count>inboxPageSize){const b=doc.createElement('button');b.type='button';b.className='mini-library-more';b.textContent='再显示 40 项完成记录';b.addEventListener('click',()=>{inboxPageSize+=40;S.renderInbox();});doc.getElementById('inboxBody').appendChild(b);}};
  function goList() {
    S.switchAppView('daily'); S.activeDailyTab = 'list';
    doc.querySelectorAll('[data-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === 'list'));
    S.renderDailyTab(); const tabs = doc.getElementById('dailyTabs'); if (tabs) tabs.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  doc.addEventListener('click', e => {
    const target = e.target.closest('button,[data-sy-undo]'); if (!target) return;
    if (target.id === 'quickCaptureBtn') { e.preventDefault(); e.stopImmediatePropagation(); S.openQuickCapture(); return; }
    if (target.classList.contains('app-task-menu-btn')) {
      const id = miniGet(target.closest('[data-id]'), 'dataset') && target.closest('[data-id]').getAttribute('data-id');
      if (id) { e.preventDefault(); e.stopImmediatePropagation(); openAction(id); return; }
    }
    const d = target.dataset;
    if ('syUndo' in d) { undo(); return; }
    if ('syCapture' in d) S.openQuickCapture();
    else if ('syCaptureCat' in d) openEditor(null, d.syCaptureCat, true);
    else if ('syDone' in d) S.toggleTaskDone(d.syDone);
    else if ('syEdit' in d) S.openTaskModal(d.syEdit);
    else if ('syStart' in d) S.handleStartClick(d.syStart);
    else if ('syAction' in d) openAction(d.syAction);
    else if ('syNewCategory' in d) openCategory();
    else if ('syReceipt' in d) S.openCategoryReceipt(d.syReceipt);
    else if ('syList' in d) goList();
    else if ('syDay' in d) { S.dayViewDate = d.syDay; S.activeDailyTab = 'day'; doc.querySelectorAll('[data-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === 'day')); S.renderDailyTab(); }
  }, true);
  doc.addEventListener('keydown', e => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); S.openQuickCapture(); }
    else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(); }
    else if (!typing && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'n' && !modal) { e.preventDefault(); S.openQuickCapture(); }
  });
  // Keep sidebar edits, category creation and account imports reflected in visible category groups.
  let categorySignature = '';
  const originalSidebar = S.renderSidebarCategoryList;
  S.renderSidebarCategoryList = function () {
    originalSidebar();
    const signature = JSON.stringify(S.getAcctData().categories);
    if (categorySignature && signature !== categorySignature && S.activeDailyTab === 'list') {
      const sub = doc.getElementById('dailySub'); if (sub) S.renderListView(sub);
    }
    categorySignature = signature;
  };
  root.SYPlanning.undo = undo;
  root.SYPlanning.rowHtml = rowHtml;
  root.SYPlanning.openAction = openAction;
  const originalTaskCard = S.taskCardHtml;
  S.taskCardHtml = function (task, context) {
    return originalTaskCard(task, context).replace('aria-label="更多">⋮</button>', 'aria-label="打开任务工具舱" title="任务工具舱">⌘</button>');
  };
})(typeof window !== 'undefined' ? window : null);
