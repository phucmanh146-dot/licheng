'use strict';
(() => {
  const box = document.createElement('section');
  box.className = 'card';
  box.id = 'research-companion';
  box.innerHTML = `<h2>今天先迈出哪一步？</h2>
    <p>不替你写论文。先把需求说清，只安排今天能检查的小产物。</p>
    <form id="rc-form"><label>① 最近要交什么？想达到什么？<textarea name="outcome" required maxlength="2400" placeholder="例如：想把湘秀未来的访谈和产品方案对应起来，但还不知道怎么做"></textarea></label>
    <label>② 现在手里有什么？<textarea name="materials" required maxlength="2400" placeholder="文件、页码、附件；没有也可以明确写没有"></textarea></label>
    <label>③ 最卡在哪里？<select name="blocker"><option>不知道从哪开始</option><option>术语或方法看不懂</option><option>缺资料或附件</option><option>报错或环境不通</option><option>疲惫，任务太大</option></select></label>
    <label>今天实际可用几分钟？<input name="available_minutes" type="number" min="1" max="720" value="20" required></label>
    <p id="rc-coach">把“想成为高手”缩成今天能交的一行、一张卡或一处修改。</p>
    <label>今天最小要交的东西<input name="today_output" required maxlength="2400" placeholder="一行：访谈原话—需求—对应产品—来源"></label>
    <label>第一步具体做什么？<input name="first_action" required maxlength="2400" placeholder="打开现有访谈附件，复制一条含用途或预算的原话，并记原文位置"></label>
    <label>今天这件事的截止时间<input name="deadline" type="datetime-local" required></label>
    <button>确认今日任务</button></form>
    <div id="rc-today" aria-live="polite"></div><button type="button" id="rc-check-now">报告进度 / 我卡住了</button>
    <p><small>截止前10分钟询问一次；本demo只在页面打开并联网时检查，关页后不保证提醒。不会替你改截止日期或把“做了”标为“合格”。</small></p>
    <p id="rc-status" role="status"></p>`;
  const container = document.querySelector('#project');
  if (!container) return;
  container.prepend(box);
  const form = box.querySelector('form');
  const status = box.querySelector('#rc-status');
  const panel = box.querySelector('#rc-today');
  const dialog = document.createElement('dialog');
  dialog.innerHTML = `<h2>先问一下你的进度</h2><p id="rc-prompt"></p><p id="rc-help"></p>
    <form id="rc-response"><label>现在做到哪、试过什么？<textarea name="note" required maxlength="2400"></textarea></label>
    <label>接下来希望怎样？<select name="choice"><option value="progress">继续当前一步</option><option value="need_help">需要解释或求助，不死磕</option><option value="shrink">先把目标拆小，再重新确认</option><option value="pause">保存现场，稍后继续</option><option value="submitted">已有小产物，提交待复核</option></select></label>
    <label>真实产物位置（提交时必填）<input name="artifact_ref" maxlength="2400"></label><p id="rc-error" role="alert"></p>
    <button>保存进度</button><button type="button" id="rc-close">暂不回答</button></form>`;
  document.body.append(dialog);
  let currentId = null, snapshot = null, shown = null, requestSerial = 0;
  const field = name => form.elements.namedItem(name);
  const localDate = value => {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
  };
  const api = async (path, data) => {
    const r = await fetch('/api/agent/team/' + path, data ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)} : {});
    const value = await r.json();
    if (!r.ok) throw new Error(value.error || '没有保存成功，请保留现场再试');
    return value;
  };
  function ask() {
    if (!snapshot?.card || dialog.open) return;
    dialog.dataset.projectId = currentId;
    dialog.dataset.revision = snapshot.card.revision;
    dialog.querySelector('#rc-prompt').textContent = snapshot.message;
    dialog.querySelector('#rc-help').textContent = snapshot.help;
    dialog.querySelector('#rc-error').textContent = '';
    dialog.showModal();
  }
  async function refresh(fill = false) {
    if (!currentId) return;
    const id = currentId, serial = ++requestSerial;
    const value = await api('research-today?id=' + encodeURIComponent(id));
    if (id !== currentId || serial !== requestSerial) return;
    snapshot = value;
    panel.replaceChildren();
    if (value.card) {
      const p = document.createElement('p');
      p.textContent = `今天交：${value.card.today_output}；先做：${value.card.first_action}；截止：${new Date(value.card.deadline).toLocaleString()}；状态：${value.deadline_state}`;
      panel.append(p);
      if (fill) {
        for (const key of ['outcome','materials','blocker','available_minutes','today_output','first_action']) field(key).value = value.card[key];
        field('deadline').value = localDate(value.card.deadline);
      }
      const key = `${id}:${value.card.revision}:${value.deadline_state}`;
      if (value.show_checkin && shown !== key && document.visibilityState === 'visible') { shown = key; ask(); }
    } else {
      panel.textContent = value.message;
    }
  }
  form.addEventListener('input', () => {
    const outcome = field('outcome').value.trim();
    box.querySelector('#rc-coach').textContent = /高手|优秀|发论文|做好|提升能力/.test(outcome)
      ? '这个愿望可以保留。今天先明确：哪份材料、哪一处、能交什么？不要求一口气成为高手。'
      : '先确认你想交的最小产物；不懂就告诉我卡在哪，不必先把需求说得很专业。';
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!currentId) return;
    const id = currentId;
    try {
      const p = await fetch('/api/agent/team?id=' + encodeURIComponent(id)).then(r => r.json());
      const data = Object.fromEntries(new FormData(form));
      data.available_minutes = Number(data.available_minutes);
      data.deadline = new Date(data.deadline).toISOString();
      await api('research-save', {...data,project_id:id,expected_version:p.version});
      if (id !== currentId) return;
      shown = null; status.textContent = '已保存本人确认的今日任务。需要调整范围时重新确认，不悄悄延长截止。';
      if (typeof load === 'function') await load(id);
      await refresh(true);
    } catch(e) { status.textContent = e.message; }
  });
  dialog.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const id = dialog.dataset.projectId;
    try {
      if (id !== currentId) throw new Error('项目已切换，请回当前项目重新确认');
      const p = await fetch('/api/agent/team?id=' + encodeURIComponent(id)).then(r => r.json());
      const data = Object.fromEntries(new FormData(event.target));
      await api('research-checkin',{...data,project_id:id,expected_version:p.version,card_revision:Number(dialog.dataset.revision)});
      dialog.close(); status.textContent = '进度已保存；遇到困难先求助或拆小。正式成果仍需按原标准复核。';
      if (typeof load === 'function') await load(id);
      await refresh();
    } catch(e) { dialog.querySelector('#rc-error').textContent = e.message; }
  });
  dialog.querySelector('#rc-close').onclick = () => dialog.close();
  box.querySelector('#rc-check-now').onclick = () => { if (snapshot?.card) ask(); else status.textContent='先确认今天的小产物和截止时间。'; };
  window.addEventListener('research-project-changed', e => {
    const changed = currentId !== e.detail.id;
    if (changed) { currentId = e.detail.id; snapshot = null; shown = null; form.reset(); if(dialog.open) dialog.close(); }
    refresh(changed).catch(e => {status.textContent=e.message;});
  });
  document.addEventListener('visibilitychange', () => {if(document.visibilityState==='visible')refresh().catch(e=>{status.textContent=e.message;});});
  setInterval(() => {if(document.visibilityState==='visible')refresh().catch(e=>{status.textContent=e.message;});},15000);
  if (typeof project !== 'undefined' && project) {currentId=project.project_id;refresh(true).catch(e=>{status.textContent=e.message;});}
})();
