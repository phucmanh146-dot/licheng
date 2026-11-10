const toast = document.getElementById('toast');
const projectButton = document.getElementById('projectButton');
const projectMenu = document.getElementById('projectMenu');
const progressCaption = document.getElementById('progressCaption');
const state = {
  activeProjectId: 'xiang', activeWorkspace: 'loop', reviewMode: 'owner', user: {
    name: '李同学', email: 'li.student@example.com'
  }, projects: {
    xiang: {
      name: '湘秀未来', kind: '科研创新 · 进行中', avatar: '湘', score: 62, title: '让访谈证据真正支撑一项产品决策', note: '这一轮只解决一个问题：需求卡能否从原话走到具体样品，而不是堆一页漂亮总结。', loopLabel: '访谈证据 → 产品决策', reviewer: '陈老师', executor: '林同学', quote: '“如果能提前知道每次活动需要准备多少物料，就不用临时再跑一趟。”', quoteMeta: '第 14 页 · B-07', unknown: '机构是否允许共享历史订单，尚未有可引用的确认。', gap: '需求和产品决策之间少了一句理由', gapNote: '你已经有原话，也指向了“活动准备模块”。现在还缺：为什么这条原话足以支持这个模块，而不是另一个功能。', action: '补上一句理由', actionNote: '在已有需求卡下补齐“因为访谈中的 ___，所以样品中的 ___ 需要 ___”。', materials: [['访谈记录·03', 'PDF · 18 页 · 已读取', '已定位', 'verified', 'P14 · 访谈对象 B 的原话已定位。'], ['产品样品草图（现在的版本）', 'PNG · 1 张 · 已读取', '待绑定', 'pending', 'P03 · 当前样品结构，尚未绑定需求证据。'], ['机构沟通备忘', '链接 · 1 条 · 待读取', '受阻', 'blocked', '来源链接尚未完成权限确认。']], actions: [ {
        title: '补上一句理由', owner: '林同学', status: '待开始', tone: 'warm', due: '今天 · 15 分钟'
      }, {
        title: '向机构确认历史订单授权', owner: '周同学', status: '等待外部协助', tone: 'red', due: '明天 · 20 分钟'
      }], rubricConfirmed: false, gapConfirmed: false, review: {
        status: '待提交 V2', completed: 3, total: 4, criteria: ['pass', 'pass', 'pending', 'pass'], v2Submitted: false
      }, transfer: {
        status: '尚未开始', progress: 0
      }
    }, lowcarbon: {
      name: '校园低碳地图', kind: '竞赛项目 · 进行中', avatar: '碳', score: 78, title: '把调研结果变成可验证的校园路线', note: '当前循环聚焦“用户场景是否真的影响路线设计”，先补一条可复核的场景证据。', loopLabel: '用户场景 → 路线样机', reviewer: '周老师', executor: '赵同学', quote: '“我不是不想骑车，是不知道哪段路晚上还有灯。”', quoteMeta: '访谈记录·07 · P09', unknown: '夜间照明数据还没有获得校方确认。', gap: '场景证据还没有落到路线节点', gapNote: '你已经标出夜间骑行的痛点，还需要说明它具体改变了哪一个路线节点。', action: '标出一条夜间路线', actionNote: '在现在的地图版本上标注起点、照明缺口和改动后的路线节点。', materials: [['夜间骑行访谈·07', 'PDF · 12 页 · 已读取', '已定位', 'verified', 'P09 · 用户原话已定位。'], ['校园地图（现在的版本）', 'SVG · 1 张 · 已读取', '待绑定', 'pending', '路线节点尚未绑定场景。'], ['照明数据申请', '文档 · 2 页 · 已读取', '待确认', 'blocked', '校方授权仍在等待。']], actions: [ {
        title: '标出一条夜间路线', owner: '赵同学', status: '进行中', tone: 'teal', due: '今天 · 25 分钟'
      }, {
        title: '补齐照明数据来源', owner: '周同学', status: '待确认', tone: 'red', due: '周五 · 30 分钟'
      }], rubricConfirmed: false, gapConfirmed: false, review: {
        status: 'V1 已诊断', completed: 1, total: 4, criteria: ['pass', 'pending', 'pending', 'unknown'], v2Submitted: false
      }, transfer: {
        status: '可开始', progress: 15
      }
    }, blank: {
      name: '未命名项目', kind: '草稿 · 待开始', avatar: '新', score: 0, title: '先把你想做的事说清楚', note: '还没有一轮改进。砺程教练会从目标、已有材料和限制开始陪你澄清。', loopLabel: '目标澄清', reviewer: '尚未邀请', executor: '李同学', quote: '还没有可引用的材料。', quoteMeta: '等待上传', unknown: '目标、材料和复核者都还没有确认。', gap: '还没有诊断差距', gapNote: '先添加一份材料，或者用自己的话描述你想完成的成果。', action: '创建第一张目标卡', actionNote: '写下你想交付的成果，以及你现在手里已有的材料。', materials: [['还没有材料', '先上传文档、PDF、图片或链接', '待添加', 'pending', '添加材料后教练才能给出有依据的缺口。']], actions: [ {
        title: '创建第一张目标卡', owner: '李同学', status: '待开始', tone: 'warm', due: '预计 10 分钟'
      }], rubricConfirmed: false, gapConfirmed: false, review: {
        status: '尚未邀请复核者', completed: 0, total: 0, criteria: [], v2Submitted: false
      }, transfer: {
        status: '尚未开始', progress: 0
      }
    }
  }
};
const workspaceNames = {
  loop: '一轮改进', materials: '材料证据', actions: '下一步行动', review: '请别人检查', transfer: '换材料再试'
};
const reviewStatusLabels = {
  '待提交 V2': '等待改进版本', '待复核': '等待别人检查', '复核进行中': '正在检查', '需要返工': '需要返工后再检查', '全部 PASS · 可进入迁移': '全部达标 · 可以继续', '成果复核 PASS': '这次改进已达标', 'V1 已诊断': '已找到需要改进的地方', '尚未邀请复核者': '还没有邀请检查者'
};
const transferStatusLabels = {
  '尚未开始': '还没开始', '可开始': '可以开始', '迁移试做进行中': '正在换材料试做', '待迁移复核': '等待别人检查这次试做', '方法已验证': '已经学会，可以迁移'
};
function reviewStatusLabel(status) {
  return reviewStatusLabels[status] || status;
}
function transferStatusLabel(status) {
  return transferStatusLabels[status] || status;
}
function activeProject() {
  return state.projects[state.activeProjectId];
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 3000);
}
function setProjectMenu(open) {
  projectMenu.hidden = !open;
  projectButton.setAttribute('aria-expanded', String(open));
}
function updateReviewModeUI() {
  const reviewer = state.reviewMode === 'reviewer';
  document.body.classList.toggle('reviewer-mode', reviewer);
  const label = document.getElementById('reviewModeLabel');
  const button = document.getElementById('reviewModeButton');
  const banner = document.getElementById('viewModeBanner');
  label.textContent = reviewer ? '复核者视图' : '负责人视图';
  button.setAttribute('aria-pressed', String(reviewer));
  banner.hidden = !reviewer;
  banner.innerHTML = reviewer ? '<strong>复核者视图</strong>　只读查看材料、这轮判断标准和两个版本；你可以逐条记录“达标 / 需要返工 / 证据不足”，但不能确认标准、分派行动或提交自己的改进版本。' : '';
}
function materialIcon(name) {
  if (name.includes('地图') || name.includes('样品') || name.includes('路线')) return ['图', 'file-img'];
  if (name.includes('链接') || name.includes('申请') || name.includes('备忘')) return ['链', 'file-link'];
  return ['文', 'file-doc'];
}
function bindMaterialItems() {
  document.querySelectorAll('.material-item').forEach((item) => item.addEventListener('click', () => {
    document.querySelectorAll('.material-item').forEach((node) => node.classList.remove('selected')); item.classList.add('selected'); document.querySelector('#evidenceCard blockquote').textContent = item.dataset.detail; document.querySelector('#evidenceCard .quote-meta span:first-child').textContent = item.dataset.material; showToast(`已打开「${item.dataset.material}」的证据状态`);
  }));
}
function renderMaterials(project) {
  document.querySelector('.material-list').innerHTML = project.materials.map((m, i) => {
    const [icon, iconClass] = materialIcon(m[0]); return `<button class="material-item${i === 0 ? ' selected' : ''}" type="button" data-material="${m[0]}" data-detail="${m[4]}"><span class="file-icon ${iconClass}">${icon}</span><span class="material-copy"><strong>${m[0]}</strong><small>${m[1]}</small></span><span class="material-state ${m[3]}">${m[2]}</span></button>`;
  }).join('');
  bindMaterialItems();
}
function syncProgressSteps(project) {
  const steps = [...document.querySelectorAll('.progress-step')];
  const connectors = [...document.querySelectorAll('.progress-connector')];
  const stage = project.transfer.progress >= 100 ? 7 : project.review.status === '成果复核 PASS' ? 6 : project.review.v2Submitted ? 5 : project.actionStarted ? 4 : project.gapConfirmed ? 3 : project.rubricConfirmed ? 2 : 1;
  steps.forEach((step, index) => {
    const marker = step.querySelector('.step-number, .step-mark'); if (index < stage) {
      step.classList.add('done'); step.classList.remove('active'); marker.className = 'step-mark'; marker.textContent = '✓';
    }
    else {
      step.classList.remove('done'); step.classList.toggle('active', index === stage); marker.className = 'step-number'; marker.textContent = String(index + 1);
    }
  });
  connectors.forEach((connector, index) => connector.classList.toggle('done', index < stage));
  const captions = ['这轮改进和方法都已验证', '正在确认这轮判断标准', '正在找出还缺什么', '已找到优先缺口，准备开始这一步', '正在完成这一步', '改进版本已提交，等待别人检查', '这次改进已通过，准备换材料再试'];
  progressCaption.innerHTML = `<span class="pulse-dot"></span>${project.name === '未命名项目' && stage === 1 ? '等待创建第一张目标卡' : captions[Math.min(stage, captions.length - 1)]}`;
}
function updateProjectShell() {
  const project = activeProject();
  document.getElementById('projectAvatar').textContent = project.avatar;
  document.getElementById('projectName').textContent = project.name;
  document.getElementById('projectKind').textContent = project.kind;
  document.getElementById('breadcrumbProject').textContent = project.name;
  document.getElementById('breadcrumbWorkspace').textContent = workspaceNames[state.activeWorkspace];
  document.getElementById('breadcrumbTitle').textContent = project.loopLabel;
  document.querySelector('.workspace-heading h1').textContent = project.title;
  document.querySelector('.heading-note').textContent = project.note;
  const meta = document.querySelectorAll('.heading-meta .meta-person strong');
  if (meta[0]) meta[0].textContent = project.executor;
  if (meta[1]) meta[1].textContent = project.reviewer;
  document.querySelector('.evidence-score strong').textContent = `${project.score}%`;
  document.querySelector('.score-track span').style.width = `${project.score}%`;
  renderMaterials(project);
  document.querySelector('.action-card h2').textContent = project.action;
  document.querySelector('.action-brief p').textContent = project.actionNote;
  document.querySelector('.action-assignee strong').textContent = project.executor;
  const actionButton = document.getElementById('startAction');
  const actionStatus = document.querySelector('.action-status');
  if (project.review?.v2Submitted) {
    actionButton.textContent = '改进版本已提交';
    actionButton.disabled = true;
    actionButton.style.opacity = '.65';
    actionStatus.textContent = '等待别人检查';
  }
  else if (project.actionStarted) {
    actionButton.textContent = '提交这次改进';
    actionButton.disabled = false;
    actionButton.style.opacity = '1';
    actionStatus.textContent = '进行中';
  }
  else if (!project.gapConfirmed) {
    actionButton.textContent = '先确认优先缺口';
    actionButton.disabled = true;
    actionButton.style.opacity = '.55';
    actionStatus.textContent = '等待选定缺口';
  }
  else {
    actionButton.textContent = '开始这一步';
    actionButton.disabled = false;
    actionButton.style.opacity = '1';
    actionStatus.textContent = '待开始';
  }
  const gapButton = document.getElementById('confirmGap');
  if (gapButton) {
    gapButton.disabled = !project.rubricConfirmed || Boolean(project.gapConfirmed);
    gapButton.textContent = project.gapConfirmed ? '已选好这次要改的地方' : project.rubricConfirmed ? '选它作为这次要改的地方' : '先确认这轮判断标准';
    gapButton.style.opacity = gapButton.disabled ? '.65' : '1';
  }
  document.querySelector('.active-gap .gap-title strong').textContent = project.gap;
  document.querySelector('.active-gap .gap-content p').textContent = project.gapNote;
  document.querySelector('#evidenceCard blockquote').textContent = project.quote;
  document.querySelector('#evidenceCard .quote-meta span:first-child').textContent = project.materials[0]?.[0] || '暂无材料';
  document.querySelector('#evidenceCard .quote-meta span:nth-child(2)').textContent = project.quoteMeta;
  document.querySelector('.unknown-note p').textContent = project.unknown;
  document.querySelector('.coach-context span:last-child').textContent = `只看：${project.name} / 这轮判断标准 / 当前缺口 A`;
  syncProgressSteps(project);
}
function renderWorkspace(workspace) {
  if (!workspaceNames[workspace]) workspace = 'loop';
  state.activeWorkspace = workspace;
  updateProjectShell();
  document.querySelector('.main-content').dataset.workspace = workspace;
  document.title = `${workspaceNames[workspace]} · ${activeProject().name} · 砺程`;
  if (window.location.hash !== `#${workspace}`) window.history.replaceState( {
  }, '', `#${workspace}`);
  document.querySelectorAll('.nav-item[data-workspace]').forEach((item) => item.classList.toggle('active', item.dataset.workspace === workspace));
  document.getElementById('breadcrumbWorkspace').textContent = workspaceNames[workspace];
  const loopView = document.getElementById('qualityLoopView');
  const alternate = document.getElementById('workspaceAlternate');
  const heading = document.querySelector('.workspace-heading');
  const progress = document.querySelector('.progress-strip');
  const setVisible = (element, visible) => {
    element.hidden = !visible;
    element.style.display = visible ? '' : 'none';
  };
  if (workspace === 'loop') {
    setVisible(loopView, true);
    setVisible(alternate, false);
    setVisible(heading, true);
    setVisible(progress, true);
    document.getElementById('breadcrumbTitle').textContent = activeProject().loopLabel;
    updateProjectShell();
    return;
  }
  setVisible(loopView, false);
  setVisible(alternate, true);
  setVisible(heading, false);
  setVisible(progress, false);
  alternate.innerHTML = alternateTemplate(workspace, activeProject());
  document.getElementById('breadcrumbTitle').textContent = `${activeProject().name} · ${workspaceNames[workspace]}`;
  bindAlternateActions(workspace);
}
function alternateTemplate(workspace, project) {
  const heading = {
    materials: ['材料证据', '看看哪些材料支持了你的判断，哪里还缺依据。'], actions: ['下一步行动', '每一步只解决一个还缺的地方，并写清楚要交什么。'], review: ['请别人帮我检查', '把现在的版本和改进后的版本放在一起，请另一位成员按同一套标准检查。'], transfer: ['换一个材料再试', '把刚刚学会的做法用到另一份真实材料上，看看能不能少依赖提示。']
  }
  [workspace];
  if (workspace === 'materials') return `<div class="workspace-page-head"><div><span class="section-kicker">MATERIALS · ${project.materials.length} 项</span><h1>${heading[0]}</h1><p>${heading[1]}</p></div><button class="primary-button" data-action="add-material">＋ 添加材料</button></div><div class="data-toolbar"><div class="toolbar-search">⌕ <input placeholder="搜索材料、来源或位置" /></div><span class="toolbar-filter">全部状态⌄</span><span class="toolbar-count">项目私有 · ${project.materials.length} 项</span></div><div class="material-board">${project.materials.map((m, i) => `<article class="material-board-card"><div class="board-card-top"><span class="file-icon ${materialIcon(m[0])[1]}">${
    materialIcon(m[0])[0]
  }
  </span><span class="material-state ${m[3]}">${
    m[2]
  }
  </span></div><h3>${
    m[0]
  }
  </h3><p>${
    m[1]
  }
  </p><div class="board-card-source">⌖ ${
    m[4]
  }
  </div><div class="board-card-footer"><span>这是第 ${
    i + 1
  }
  个版本</span><button class="link-button" data-action="open-material" data-name="${m[0]}">查看依据</button></div></article>`).join('')}</div><div class="empty-guidance"><span>?</span><div><strong>材料不是越多越好</strong><p>先打开与当前还缺的地方最相关的一份，教练会解释它支持了什么、还缺什么。</p></div></div>`;
  if (workspace === 'actions') return `<div class="workspace-page-head"><div><span class="section-kicker">ACTIONS · ${project.actions.length} 张</span><h1>${heading[0]}</h1><p>${heading[1]}</p></div><button class="primary-button" data-action="new-action">＋ 添加下一步</button></div><div class="action-summary"><div><span>还没开始</span><strong>${project.actions.filter((a) => a.status === '待开始').length}</strong></div><div><span>正在做</span><strong>${project.actions.filter((a) => a.status === '进行中').length}</strong></div><div><span>等别人帮忙</span><strong>${project.actions.filter((a) => a.status.includes('等待') || a.status.includes('确认')).length}</strong></div><div class="action-summary-note">必须交出真实改进内容，不能只勾选“完成”。</div></div><div class="action-board">${project.actions.map((a, i) => `<article class="action-board-card"><div class="action-board-index">${
    String(i + 1).padStart(2, '0')
  }
  </div><div class="action-board-main"><div class="action-board-title"><h3>${
    a.title
  }
  </h3><span class="action-pill ${a.tone}">${
    a.status
  }
  </span></div><p>${
    i === 0 ? project.actionNote : '等外部确认后再继续，不把未知写成已确定。'
  }
  </p><div class="action-board-meta"><span>由谁完成 · ${
    a.owner
  }
  </span><span>${
    a.due
  }
  </span><button class="link-button" data-action="open-action" data-name="${a.title}">查看这一步</button><button class="link-button" data-action="assign-action" data-index="${i}">分派</button></div></div></article>`).join('')}</div>`;
  if (workspace === 'review') {
    const criteria = (project.rubric?.items || []).map((item) => item.label);
    const fallbackCriteria = ['能回查原文位置', '与具体决策对应', '解释为什么更合适', '未知项如实保留'];
    const reviewCriteria = criteria.length ? criteria : fallbackCriteria;
    const criteriaHtml = reviewCriteria.map((label, index) => {
      const status = project.review.criteria?.[index] || 'pending'; const statusText = status === 'pass' ? '达标 · PASS' : status === 'fail' ? '需要返工 · FAIL' : status === 'unknown' ? '证据不足 · UNKNOWN' : '待检查'; const icon = status === 'pass' ? '✓' : status === 'fail' ? '×' : status === 'unknown' ? '?' : '○'; return `<div class="criterion-row"><span class="criterion-status ${status === 'pass' ? 'ready' : status === 'unknown' ? 'unknown' : 'wait'}">${icon}</span><span>${label}</span><strong>${statusText}</strong><div class="criterion-actions"><button type="button" data-criterion="${index}" data-review-value="pass" title="PASS：证据足够并达到标准">达标</button><button type="button" data-criterion="${index}" data-review-value="fail" title="FAIL：需要返工后再检查">需要返工</button><button type="button" data-criterion="${index}" data-review-value="unknown" title="UNKNOWN：证据不足，先补依据">证据不足</button></div></div>`;
    }).join('');
    const reviewButton = project.review.v2Submitted ? '开始检查这次改进' : '等待改进版本提交';
    const v2Text = project.review.v2Content || '负责人还没有提交改进版本，提交后会在这里对照。';
    return `<div class="workspace-page-head"><div><span class="section-kicker">REVIEW · 这轮判断标准</span><h1>${heading[0]}</h1><p>${heading[1]}</p></div><button class="primary-button" data-action="review-start" ${project.review.v2Submitted ? '' : 'disabled'}>${reviewButton}</button></div><div class="review-hero"><div class="reviewer-block"><span class="member-avatar member-red">${project.reviewer === '尚未邀请' ? '？' : project.reviewer.slice(0, 1)}</span><div><small>本轮检查者</small><strong>${project.reviewer}</strong></div></div><div class="review-progress"><span>检查进度</span><strong>${project.review.completed}/${project.review.total || reviewCriteria.length}</strong><div class="score-track"><span style="width:${project.review.total ? (project.review.completed / project.review.total) * 100 : 0}%"></span></div></div><div class="review-status">${reviewStatusLabel(project.review.status)}</div></div><div class="review-grid"><div class="review-compare"><div class="compare-head"><span>现在的版本 · V1</span><span>改进后的版本 · V2</span></div><div class="compare-body"><div><strong>${project.materials[0]?.[0] || '暂无材料'}</strong><p>${project.quote}</p><small>保留原始位置与版本</small></div><div><strong>${project.action}</strong><p>${v2Text}</p><small>${project.review.v2Submitted ? '已保存 · 等待逐条检查' : '等待真实改进内容'}</small></div></div></div><div class="criteria-list"><h3>这轮判断标准的检查项</h3>${criteriaHtml}${project.review.v2Submitted ? '<button class="primary-button review-finish" data-action="review-finish">完成这次检查</button>' : ''}</div></div><div class="review-footnote">只有 ${project.reviewer} 完成逐条检查后，这次改进才能通过；砺程教练只整理依据，不替任何人盖章。</div>`;
  }
  return `<div class="workspace-page-head"><div><span class="section-kicker">TRANSFER · 换材料再试</span><h1>${heading[0]}</h1><p>${heading[1]}</p></div><button class="primary-button" data-action="transfer-start">开始换材料试做</button></div><div class="transfer-layout"><div class="transfer-steps"><div class="transfer-step complete"><span>✓</span><div><strong>说清楚这次改了什么</strong><small>已完成 · 讲清你的判断过程</small></div></div><div class="transfer-step active"><span>2</span><div><strong>换一份相近材料再试</strong><small>教练只给最少提示</small></div></div><div class="transfer-step"><span>3</span><div><strong>请别人检查这次试做</strong><small>单独记录是否真的学会</small></div></div></div><div class="transfer-card"><div class="transfer-orbit"><span>${project.transfer.progress}%</span></div><div><span class="section-kicker">现在到哪一步</span><h3>${transferStatusLabel(project.transfer.status)}</h3><p>不是再写一份报告，而是在另一份真实材料上少依赖一次提示。</p><button class="secondary-button" data-action="transfer-help">给我一个小提示</button></div></div></div><div class="transfer-warning"><span>!</span><div><strong>这次做对 ≠ 已经学会</strong><p>只有这次试做也经过别人检查，才能记录为“已经学会”。</p></div></div>`;
}
function bindAlternateActions() {
  document.querySelectorAll('[data-action="open-material"],[data-action="open-action"]').forEach((button) => button.addEventListener('click', () => showToast(`已打开「${button.dataset.name}」的详细记录`)));
  document.querySelectorAll('[data-action="add-material"]').forEach((button) => button.addEventListener('click', () => showToast('添加材料：支持文档、PDF、图片、文本和链接。')));
  document.querySelectorAll('[data-action="new-action"]').forEach((button) => button.addEventListener('click', () => showToast('下一步会绑定到当前还缺的地方，不会另起一套任务。')));
  document.querySelectorAll('[data-action="review-start"]').forEach((button) => button.addEventListener('click', () => {
    activeProject().review.status = '复核进行中'; renderWorkspace('review'); showToast('已进入检查：请逐条选择“达标”“需要返工”或“证据不足”。');
  }));
  document.querySelectorAll('[data-criterion]').forEach((button) => button.addEventListener('click', () => {
    const project = activeProject(); project.review.criteria[Number(button.dataset.criterion)] = button.dataset.reviewValue; project.review.completed = project.review.criteria.filter((value) => value === 'pass').length; project.review.status = project.review.completed === project.review.total ? '全部 PASS · 可进入迁移' : '复核进行中'; renderWorkspace('review'); const labels = {
      pass: '达标', fail: '需要返工', unknown: '证据不足'
    }; showToast(`第 ${Number(button.dataset.criterion) + 1} 项已记录为“${labels[button.dataset.reviewValue]}”。`);
  }));
  document.querySelectorAll('[data-action="review-finish"]').forEach((button) => button.addEventListener('click', () => {
    const project = activeProject(); if (project.review.criteria.every((value) => value === 'pass')) {
      project.review.status = '成果复核 PASS'; renderWorkspace('transfer'); showToast('这次改进已通过检查，下一步换一份材料再试。');
    }
    else showToast('还有未通过或证据不足的项目，暂时不能结束检查。');
  }));
  document.querySelectorAll('[data-action="transfer-start"]').forEach((button) => button.addEventListener('click', () => {
    const project = activeProject(); if (project.transfer.progress < 40) {
      project.transfer.status = '迁移试做进行中'; project.transfer.progress = 40; showToast('已开始换材料试做，教练会逐步减少提示。');
    }
    else if (project.transfer.progress < 80) {
      project.transfer.status = '待迁移复核'; project.transfer.progress = 80; showToast('这次试做已提交，等待别人检查。');
    }
    else {
      project.transfer.status = '方法已验证'; project.transfer.progress = 100; showToast('换材料试做通过：这套做法已经验证。');
    }
    renderWorkspace('transfer');
  }));
  document.querySelectorAll('[data-action="transfer-help"]').forEach((button) => button.addEventListener('click', () => showToast('提示：先找出另一份材料里“原话 → 判断 → 决策”的对应关系。')));
}
function updateProjectFromMenu(item) {
  if (item.dataset.action === 'create-project') {
    openProjectModal();
    return;
  }
  const projectId = Object.keys(state.projects).find((id) => state.projects[id].name === item.dataset.project);
  if (!projectId) return;
  state.activeProjectId = projectId;
  setProjectMenu(false);
  renderWorkspace(state.activeWorkspace);
  showToast(`已切换到「${activeProject().name}」项目 · ${workspaceNames[state.activeWorkspace]}`);
}
projectButton.addEventListener('click', () => setProjectMenu(projectMenu.hidden));
document.addEventListener('click', (event) => {
  if (!projectMenu.hidden && !event.target.closest('.project-switcher')) setProjectMenu(false);
});
document.querySelectorAll('[data-project],[data-action="create-project"]').forEach((item) => item.addEventListener('click', () => updateProjectFromMenu(item)));
document.querySelectorAll('.nav-item[data-workspace]').forEach((item) => item.addEventListener('click', () => {
  renderWorkspace(item.dataset.workspace); showToast(`已打开「${workspaceNames[item.dataset.workspace]}」`);
}));
document.querySelectorAll('.progress-step[data-progress-target]').forEach((step) =>
  step.addEventListener('click', () => {
    const target = step.dataset.progressTarget;
    const targetMap = {
      goal: ['loop', '.workspace-heading'],
      rubric: ['loop', '#rubricCard'],
      gap: ['loop', '.gap-heading'],
      action: ['loop', '.action-card'],
      version: ['loop', '.action-card'],
      review: ['review', null],
      transfer: ['transfer', null],
    };
    const [workspace, selector] = targetMap[target] || ['loop', null];
    renderWorkspace(workspace);
    document.querySelectorAll('.progress-step[data-progress-target]').forEach((item) => {
      item.classList.toggle('target-focus', item === step);
      item.removeAttribute('aria-current');
    });
    step.setAttribute('aria-current', 'step');
    if (selector) {
      document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    showToast(`已定位到「${step.dataset.stepLabel || step.textContent.trim()}」`);
  }),
);
document.getElementById('confirmRubric').addEventListener('click', () => {
  const project = activeProject(); project.rubricConfirmed = true; const chip = document.querySelector('.version-chip'); chip.textContent = '这轮标准 · 已确认'; chip.style.color = 'var(--teal)'; chip.style.borderColor = '#97bcb5'; document.getElementById('progressRubric').classList.remove('active'); document.getElementById('progressRubric').classList.add('done'); document.getElementById('progressRubric').querySelector('.step-number').textContent = '✓'; document.getElementById('progressRubric').querySelector('.step-number').className = 'step-mark'; document.getElementById('confirmRubric').textContent = '标准已冻结'; document.getElementById('confirmRubric').disabled = true; updateProjectShell(); showToast('这轮判断标准已确认。下一步请找出最需要补上的地方。');
});
document.getElementById('confirmGap').addEventListener('click', () => {
  const project = activeProject(); if (!project.rubricConfirmed) {
    showToast('请先确认这轮的判断标准，再选择要补的地方。'); return;
  }
  project.gapConfirmed = true; updateProjectShell(); document.querySelector('.action-card').scrollIntoView( {
    behavior: 'smooth', block: 'center'
  }); document.querySelector('.action-card').classList.add('attention'); showToast('已选好这次要改的地方。下一步点击“开始这一步”。');
});
document.getElementById('startAction').addEventListener('click', () => {
  const project = activeProject(); if (project.review?.v2Submitted) return; if (!project.gapConfirmed) {
    showToast('请先在“找到还缺什么”中选好这次要改的地方。'); return;
  }
  if (project.actionStarted) {
    document.getElementById('v2Modal').hidden = false; document.getElementById('v2Content').focus(); return;
  }
  project.actionStarted = true; updateProjectShell(); progressCaption.innerHTML = '<span class="pulse-dot"></span>正在完成这一步'; showToast('已开始记录这次改进，完成后提交给检查者。');
});
document.getElementById('askAgent').addEventListener('click', () => {
  document.querySelector('[data-tab="chat"]').click(); showToast('砺程教练已准备好回答这一步，不会替你写结论。');
});
document.getElementById('gapEvidence').addEventListener('click', () => {
  document.querySelector('.evidence-column').scrollIntoView( {
    behavior: 'smooth', block: 'center'
  }); showToast('已定位到当前项目的依据。');
});
const nextPanel = '<div class="coach-message"><div class="message-label">我读到的情况</div><p>你的原话和产品位置已经对上了。现在只缺一段可核对的理由，所以我没有让你重做访谈，也没有把当前决策直接判成正确。</p></div><div class="coach-highlight"><span class="highlight-mark">!</span><div><strong>这一步会改变什么</strong><p>补上“为什么”，检查者才能判断这不是凭感觉选的功能。</p></div></div><div class="coach-next"><div class="next-label">你现在可以</div><div class="next-action"><span>1</span><div><strong>打开原文定位</strong><small>找到支持当前判断的那一句</small></div></div><div class="next-action"><span>2</span><div><strong>写一行理由</strong><small>只写原话、判断和样品位置的关系</small></div></div><div class="next-action"><span>3</span><div><strong>交给检查者</strong><small>按这轮判断标准逐项检查</small></div></div></div><div class="coach-proof"><span class="proof-icon">⌖</span><div><strong>我为什么这样建议</strong><p>依据：当前项目已确认的材料<br>这轮要补：原话和产品决定之间的理由</p></div><button type="button" class="chevron-button">›</button></div>';
const whyPanel = '<div class="coach-message"><div class="message-label">为什么不是重做整页材料</div><p>已有材料说明你会找到证据。现在的缺口是“证据如何支撑决策”，重复整理材料不会改变当前判断。</p></div><div class="coach-highlight"><span class="highlight-mark">⌖</span><div><strong>我只引用已经确认的内容</strong><p>缺材料、权限失败和证据不足都会如实保留。</p></div></div><div class="coach-proof"><span class="proof-icon">✓</span><div><strong>这条建议怎么检查</strong><p>提交一行理由后，请检查者按这轮判断标准检查。</p></div></div>';
const chatPanel = '<div class="coach-message"><div class="message-label">当前对话</div><p>你可以问我：当前材料和决策之间，少了哪一步解释？</p></div><div class="coach-highlight"><span class="highlight-mark">?</span><div><strong>我会先判断你卡在哪里</strong><p>理解、方法、材料、环境或方向，然后只补当前这一点。</p></div></div><div class="coach-proof"><span class="proof-icon">⌕</span><div><strong>准备好继续</strong><p>在下方输入卡点，项目材料不会被带到其他项目。</p></div></div>';
document.querySelectorAll('.coach-tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.coach-tab').forEach((node) => node.classList.remove('active')); tab.classList.add('active'); document.getElementById('coachPanel').innerHTML = tab.dataset.tab === 'why' ? whyPanel : tab.dataset.tab === 'chat' ? chatPanel : nextPanel;
}));
const composerModal = document.getElementById('composerModal');
const openComposer = () => {
  composerModal.hidden = false;
  document.getElementById('stuckInput').focus();
};
const closeComposer = () => {
  composerModal.hidden = true;
};
document.getElementById('composerTrigger').addEventListener('click', openComposer);
document.getElementById('closeComposer').addEventListener('click', closeComposer);
document.getElementById('cancelComposer').addEventListener('click', closeComposer);
document.getElementById('sendComposer').addEventListener('click', () => {
  const text = document.getElementById('stuckInput').value.trim(); closeComposer(); showToast(text ? '已记录卡点，砺程教练会先定位问题类型。' : '可以稍后再说，当前这一步不会丢失。');
});
composerModal.addEventListener('click', (event) => {
  if (event.target === composerModal) closeComposer();
});
const v2Modal = document.getElementById('v2Modal');
const closeV2 = () => {
  v2Modal.hidden = true;
};
document.getElementById('closeV2Modal').addEventListener('click', closeV2);
document.getElementById('cancelV2').addEventListener('click', closeV2);
document.getElementById('v2Form').addEventListener('submit', (event) => {
  event.preventDefault(); const project = activeProject(); project.review.v2Submitted = true; project.review.status = '待复核'; project.actionStarted = true; closeV2(); updateProjectShell(); progressCaption.innerHTML = '<span class="pulse-dot"></span>改进版本已提交，等待别人检查'; showToast('改进版本已保存，下一步是请别人检查。');
});
v2Modal.addEventListener('click', (event) => {
  if (event.target === v2Modal) closeV2();
});
const authScreen = document.getElementById('authScreen');
function showAuth(mode = 'login') {
  authScreen.hidden = false;
  document.body.classList.add('auth-open');
  setAuthMode(mode);
}
function closeAuth() {
  authScreen.hidden = true;
  document.body.classList.remove('auth-open');
}
function setAuthMode(mode) {
  document.querySelectorAll('.auth-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.authTab === mode));
  document.getElementById('loginForm').hidden = mode !== 'login';
  document.getElementById('registerForm').hidden = mode !== 'register';
  document.getElementById('authTitle').textContent = mode === 'login' ? '欢迎回来' : '创建你的工作台';
  document.getElementById('authLede').textContent = mode === 'login' ? '登录后继续你的一轮改进。' : '先留下名字，砺程教练才能记住你的进展。';
}
document.querySelectorAll('.auth-tab').forEach((tab) => tab.addEventListener('click', () => setAuthMode(tab.dataset.authTab)));
document.getElementById('authClose').addEventListener('click', closeAuth);
document.getElementById('loginForm').addEventListener('submit', (event) => {
  event.preventDefault(); state.user.email = document.getElementById('loginEmail').value; closeAuth(); showToast(`欢迎回来，${state.user.name}。已恢复你的项目上下文。`);
});
document.getElementById('registerForm').addEventListener('submit', (event) => {
  event.preventDefault(); state.user.name = document.getElementById('registerName').value; state.user.email = document.getElementById('registerEmail').value; closeAuth(); showToast(`欢迎加入砺程，${state.user.name}。你的私有工作台已创建。`);
});
const accountPopover = document.getElementById('accountPopover');
document.getElementById('profileButton').addEventListener('click', () => {
  accountPopover.hidden = !accountPopover.hidden;
});
document.querySelectorAll('[data-account]').forEach((button) => button.addEventListener('click', () => {
  accountPopover.hidden = true; if (button.dataset.account === 'logout' || button.dataset.account === 'switch') showAuth('login'); else showToast('账户设置原型：隐私、通知和成员邀请将在这里管理。');
}));
const projectModal = document.getElementById('projectModal');
function openProjectModal() {
  setProjectMenu(false);
  projectModal.hidden = false;
  document.getElementById('newProjectName').focus();
}
function closeProjectModal() {
  projectModal.hidden = true;
}
document.getElementById('closeProjectModal').addEventListener('click', closeProjectModal);
document.getElementById('cancelProject').addEventListener('click', closeProjectModal);
document.getElementById('projectForm').addEventListener('submit', (event) => {
  event.preventDefault(); const id = `project-${Date.now()}`; const name = document.getElementById('newProjectName').value.trim(); const kind = document.getElementById('newProjectKind').value; const goal = document.getElementById('newProjectGoal').value.trim(); state.projects[id] = {
    ...state.projects.blank, name, kind: `${kind} · 草稿`, avatar: name.slice(0, 1), title: goal || '先把你想做的事说清楚', note: '这是刚创建的项目。砺程教练会从目标、材料和限制开始陪你澄清。'
  }; const button = document.createElement('button'); button.type = 'button'; button.dataset.project = name; button.dataset.kind = `${kind} · 草稿`; button.innerHTML = `${name} <small>刚刚创建</small>`; button.addEventListener('click', () => updateProjectFromMenu(button)); projectMenu.insertBefore(button, projectMenu.querySelector('[data-action="create-project"]')); state.activeProjectId = id; closeProjectModal(); renderWorkspace('loop'); showToast(`项目「${name}」已创建，开始目标澄清。`);
});
document.getElementById('reviewModeButton').addEventListener('click', () => {
  state.reviewMode = state.reviewMode === 'owner' ? 'reviewer' : 'owner'; updateReviewModeUI(); const nextWorkspace = state.reviewMode === 'reviewer' ? 'review' : state.activeWorkspace; renderWorkspace(nextWorkspace); showToast(state.reviewMode === 'owner' ? '已切换到负责人视图：可以推进判断标准、缺口和下一步行动。' : '已切换到复核者视图：当前进入请别人检查，只保留依据核对和检查记录。');
});
document.getElementById('inviteButton').addEventListener('click', () => showToast('邀请入口：可邀请成员、复核者或导师。'));
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault(); openComposer();
  }
  if (event.key === 'Escape') {
    closeComposer(); closeProjectModal(); closeAuth(); accountPopover.hidden = true;
  }
});
updateReviewModeUI();
updateProjectShell();
const hashWorkspace = window.location.hash.slice(1);
renderWorkspace(workspaceNames[hashWorkspace] ? hashWorkspace : 'loop');
showAuth('login');


