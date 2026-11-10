/* 将原型交互接到本地工程 API；无后端打开时仍保留原型降级路径。 */
(function integrateBackend() {
  const api = (path, options = {}) =>
    fetch(`/api${path}`, {
      credentials: 'same-origin',
      headers: {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers || {}),
      },
      ...options,
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `请求失败（${response.status}）`);
      }
      return data;
    });

  const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const messageMarkup = (item, attachmentName = '') => {
    const isUser = item.role === 'user';
    const avatar = isUser
      ? '<span class="chat-avatar user-avatar" aria-hidden="true">我</span>'
      : '<span class="chat-avatar agent-avatar" aria-hidden="true"><img src="assets/licheng-mark.svg" alt="" /></span>';
    const attachment = attachmentName
      ? `<span class="message-attachment">📎 ${escapeHtml(attachmentName)}</span>`
      : '';
    return `<div class="chat-message ${isUser ? 'from-user' : 'from-agent'}"><div class="chat-message-author">${avatar}<span>${isUser ? '你' : '砺程教练'}</span></div><p>${escapeHtml(item.content).replace(/\n/g, '<br>')}</p>${attachment}</div>`;
  };

  const renderChatMessages = (messages) => {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    container.innerHTML = messages.length
      ? messages.map((item) => messageMarkup(item)).join('')
      : '<div class="chat-empty">还没有对话。告诉我你现在卡在哪里，我会结合当前项目回答。</div>';
    container.scrollTop = container.scrollHeight;
  };

  const loadChatHistory = () => {
    const project = state.projects[state.activeProjectId];
    if (!project) return;
    api(`/projects/${project.id}/agent/chat`)
      .then((data) => renderChatMessages(data.messages || []))
      .catch(() => renderChatMessages([]));
  };

  const syncComposerContext = () => {
    const project = state.projects[state.activeProjectId];
    const target = document.getElementById('composerContextText');
    if (!target || !project) return;
    target.textContent = `${project.name || '当前项目'} · ${project.loopLabel || '当前质量循环'} · ${project.gap || '当前缺口待诊断'}`;
  };

  const appendChatMessage = (role, content, streaming = false, attachmentName = '') => {
    const container = document.getElementById('chatMessages');
    if (!container) return null;
    const empty = container.querySelector('.chat-empty');
    if (empty) empty.remove();
    const message = document.createElement('div');
    message.className = `chat-message ${role === 'user' ? 'from-user' : 'from-agent'}`;
    message.innerHTML = messageMarkup({ role, content: '' }, attachmentName).replace('<p></p>', '<p></p>');
    if (streaming) message.dataset.streaming = 'true';
    message.querySelector('p').textContent = content || '';
    container.appendChild(message);
    container.scrollTop = container.scrollHeight;
    return message;
  };

  const parseSseLine = (line) => {
    if (!line.startsWith('data:')) return null;
    try { return JSON.parse(line.slice(5).trim()); } catch (_) { return null; }
  };

  let pendingChatFile = null;
  const chatFileInput = document.getElementById('chatAttachmentInput');
  const chatAttachments = document.getElementById('chatAttachments');
  const renderPendingAttachment = () => {
    if (!chatAttachments) return;
    if (!pendingChatFile) {
      chatAttachments.hidden = true;
      chatAttachments.innerHTML = '';
      return;
    }
    chatAttachments.hidden = false;
    chatAttachments.innerHTML = `<span class="pending-file"><span class="pending-file-icon">${pendingChatFile.type.startsWith('image/') ? '▧' : '▤'}</span><span><strong>${escapeHtml(pendingChatFile.name)}</strong><small>${Math.ceil(pendingChatFile.size / 1024)} KB · 已准备发送</small></span><button type="button" id="removeChatAttachment" aria-label="移除附件">×</button></span>`;
    document.getElementById('removeChatAttachment')?.addEventListener('click', () => {
      pendingChatFile = null;
      if (chatFileInput) chatFileInput.value = '';
      renderPendingAttachment();
    });
  };
  document.getElementById('chatAttachButton')?.addEventListener('click', () => chatFileInput?.click());
  chatFileInput?.addEventListener('change', () => {
    const file = chatFileInput.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      showToast('单个附件不能超过 50MB。');
      chatFileInput.value = '';
      return;
    }
    pendingChatFile = file;
    renderPendingAttachment();
  });

  const sendChatMessage = (prefilledMessage = '') => {
    const project = state.projects[state.activeProjectId];
    const input = document.getElementById('stuckInput');
    const button = document.getElementById('sendComposer');
    if (prefilledMessage) input.value = prefilledMessage;
    const message = input?.value.trim() || (pendingChatFile ? '请分析我附加的材料，并结合当前项目告诉我下一步。' : '');
    if (!project || !message) {
      showToast('先写下问题，或添加一份图片 / 文件。');
      return;
    }
    button.disabled = true;
    button.textContent = '砺程教练正在回答…';
    const attachedName = pendingChatFile?.name || '';
    appendChatMessage('user', message, false, attachedName);
    const agentMessage = appendChatMessage('assistant', '正在思考…', true);
    agentMessage?.setAttribute('data-status', 'thinking');
    input.value = '';
    const formData = new FormData();
    formData.append('projectId', project.id);
    formData.append('message', message);
    if (pendingChatFile) formData.append('file', pendingChatFile, pendingChatFile.name);
    pendingChatFile = null;
    if (chatFileInput) chatFileInput.value = '';
    renderPendingAttachment();
    fetch(`/api/projects/${project.id}/agent/chat/stream`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'text/event-stream' },
      body: formData,
    })
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `请求失败（${response.status}）`);
        }
        if (!response.body) throw new Error('当前浏览器不支持流式回答');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let provider = 'local-rules-fallback';
        let upstreamError = '';
        let receivedToken = false;
        const update = (event) => {
          if (!event) return;
          if (event.type === 'status') {
            const paragraph = agentMessage?.querySelector('p');
            if (!receivedToken && paragraph) paragraph.textContent = event.message || '正在思考…';
            agentMessage?.setAttribute('data-status', event.status || 'thinking');
            button.textContent = event.status === 'writing' ? '正在组织回答…' : event.message || '思考中…';
          } else if (event.type === 'token') {
            const paragraph = agentMessage?.querySelector('p');
            if (paragraph) {
              if (!receivedToken) paragraph.textContent = '';
              paragraph.textContent += event.text || '';
            }
            receivedToken = true;
            agentMessage?.setAttribute('data-status', 'writing');
            button.textContent = '正在组织回答…';
            const container = document.getElementById('chatMessages');
            if (container) container.scrollTop = container.scrollHeight;
          } else if (event.type === 'done') {
            provider = event.provider || provider;
          } else if (event.type === 'error') {
            upstreamError = event.message || '回答连接中断';
          }
        };
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';
          lines.forEach((line) => update(parseSseLine(line)));
          if (done) break;
        }
        if (buffer.trim()) update(parseSseLine(buffer));
        agentMessage?.removeAttribute('data-streaming');
        if (provider === 'deepseek') {
          showToast('已收到 DeepSeek 的项目化回答。');
        } else if (upstreamError) {
          showToast(`DeepSeek 暂不可用，已切换本地安全回答：${upstreamError}`);
        } else {
          showToast('已使用本地安全回答。配置可用的 DeepSeek API Key 后会自动切换。');
        }
      })
      .catch((error) => {
        if (agentMessage?.querySelector('p')?.textContent) {
          showToast('回答连接中断，已保留已收到的内容。');
        } else {
          agentMessage?.remove();
          showToast(error.message);
        }
      })
      .finally(() => {
        button.disabled = false;
        button.textContent = '发送给砺程教练';
      });
  };

  const composerInput = document.getElementById('stuckInput');
  composerInput?.addEventListener('input', () => {
    const counter = document.getElementById('composerCharCount');
    if (counter) counter.textContent = `${composerInput.value.length} / 4000`;
  });
  document.querySelectorAll('[data-coach-prompt]').forEach((button) => {
    button.addEventListener('click', () => {
      syncComposerContext();
      sendChatMessage(button.dataset.coachPrompt || '');
    });
  });

  document.getElementById('stuckInput')?.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      sendChatMessage();
    }
  });

  const toMaterialTuple = (material) => [
    material.originalName,
    `${material.mimeType} · ${material.status}`,
    material.status,
    material.status === '已读取' || material.status === '已定位' ? 'verified' : 'pending',
    material.error || `${material.sourceType} · ${material.size} bytes`,
    material.id,
  ];

  const applyRubric = (project) => {
    const rubric = project.rubric;
    if (!rubric || !document.getElementById('rubricCard')) {
      return;
    }
    const introTitle = document.querySelector('#rubricCard .rubric-intro h3');
    const introScope = document.querySelector('#rubricCard .rubric-intro p');
    const list = document.querySelector('#rubricCard .rubric-list');
    const chip = document.querySelector('.version-chip');
    if (introTitle) introTitle.textContent = rubric.title;
    if (introScope) introScope.textContent = rubric.scope;
    if (chip) chip.textContent = rubric.status === 'confirmed' ? '本轮标准 · 已确认' : '本轮标准 · 草案';
    const confirmed = rubric.status === 'confirmed' || project.rubricConfirmed;
    const confirmButton = document.getElementById('confirmRubric');
    if (confirmButton) {
      confirmButton.disabled = confirmed;
      confirmButton.textContent = confirmed ? '本轮标准已确认' : '确认本轮标准';
      confirmButton.style.opacity = confirmed ? '.65' : '1';
    }
    const footer = document.querySelector('#rubricCard .rubric-footer > span');
    if (footer) {
      const selectedCount = (project.rubricSelectedItems || (rubric.items || []).slice(0, 2).map((item) => item.id)).length;
      footer.innerHTML = confirmed
        ? `✓ 本轮标准已确认，后续复核会使用这 ${selectedCount} 项`
        : `<span class="tiny-avatar">李</span>已选择 ${selectedCount} 项，确认后本轮标准才会冻结`;
    }
    if (list) {
      const selected = project.rubricSelectedItems || rubric.items.slice(0, 2).map((item) => item.id);
      list.innerHTML = rubric.items.map((item, index) => {
        const isSelected = selected.includes(item.id);
        return `
        <button class="rubric-row" type="button" aria-pressed="${isSelected}" data-rubric-item="${item.id}">
          <span class="rubric-check ${isSelected ? 'checked' : 'empty'}">${isSelected ? '✓' : ''}</span>
          <span class="rubric-row-copy"><strong>${item.label}</strong><small>${item.requirement || '等待补充检查说明'}</small></span>
          <span class="rubric-state ${isSelected ? 'ready' : index === 2 ? 'focus' : 'unknown'}">${isSelected ? '已选中' : '点击选择'}</span>
        </button>`;
      }).join('');
    }
  };

  const hydrateProject = (project) => Promise.all([
    api(`/projects/${project.id}/materials`).then((data) => {
      project.materials = data.materials.map(toMaterialTuple);
      project.evidence = data.evidence;
      project.materialRecords = data.materials;
    }),
    api(`/projects/${project.id}/rubric`).then((data) => {
      project.rubric = data.rubric;
    }),
    api(`/projects/${project.id}/members`).then((data) => {
      const member = data.members.find((item) => item.user_id === state.user?.id);
      project.currentRole = member?.role || 'owner';
      project.members = data.members;
    }),
  ]).then(() => project);

  const replaceProjects = (projects) => {
    const nextProjects = {};
    projects.forEach((project) => {
      nextProjects[project.id] = project;
    });
    if (projects.length) {
      state.projects = nextProjects;
      if (!state.projects[state.activeProjectId]) {
        state.activeProjectId = projects[0].id;
      }
    }
    const menu = document.getElementById('projectMenu');
    if (menu) {
      const createButton = '<button type="button" data-action="create-project">＋ 新建一个项目</button>';
      menu.innerHTML = projects.map((project) =>
        `<button type="button" data-project="${project.id}" data-kind="${project.kind || ''}">${project.name}<small>${project.kind || '项目'}</small></button>`,
      ).join('') + createButton;
    }
  };

  const refresh = (preferredProjectId) =>
    api('/session')
      .then((data) => {
        if (!data.authenticated) {
          showAuth('login');
          return data;
        }
        state.user = data.user;
        const profileName = document.querySelector('.profile-button strong');
        const profileEmail = document.querySelector('.profile-button small');
        const profileInitial = document.querySelector('.profile-button .profile-avatar');
        const accountName = document.querySelector('.account-popover-head strong');
        const accountEmail = document.querySelector('.account-popover-head small');
        if (profileName) profileName.textContent = data.user.name;
        if (profileEmail) profileEmail.textContent = data.user.email;
        if (profileInitial) profileInitial.textContent = data.user.name.slice(0, 1);
        if (accountName) accountName.textContent = data.user.name;
        if (accountEmail) accountEmail.textContent = data.user.email;
        replaceProjects(data.projects);
        if (preferredProjectId && state.projects[preferredProjectId]) {
          state.activeProjectId = preferredProjectId;
        }
        return Promise.all(Object.values(state.projects).map(hydrateProject)).then(() => {
          updateReviewModeUI();
          const currentRole = state.projects[state.activeProjectId]?.currentRole;
          state.reviewMode = currentRole === 'reviewer' ? 'reviewer' : 'owner';
          updateReviewModeUI();
          const roleLabel = document.querySelector('.profile-button small');
          if (roleLabel) {
            roleLabel.textContent = currentRole === 'reviewer' ? '独立复核者' : currentRole === 'observer' ? '导师/观察者' : currentRole === 'member' ? '项目成员' : '项目负责人';
          }
          renderWorkspace(state.activeWorkspace || 'loop');
          applyRubric(state.projects[state.activeProjectId]);
          closeAuth();
          return data;
        });
      })
      .catch((error) => {
        showToast(error.message);
        throw error;
      });

  // 页面打开时恢复服务端状态；未登录时保持登录页作为默认入口。
  refresh().catch(() => {});

  const materialModal = document.getElementById('materialModal');
  const rubricModal = document.getElementById('rubricModal');
  const memberModal = document.getElementById('memberModal');
  const auditModal = document.getElementById('auditModal');
  const materialDetailModal = document.getElementById('materialDetailModal');
  const actionAssignModal = document.getElementById('actionAssignModal');
  const openMaterialModal = () => {
    materialModal.hidden = false;
    document.getElementById('materialName').focus();
  };
  const closeMaterialModal = () => {
    materialModal.hidden = true;
    document.getElementById('materialForm').reset();
  };
  const openRubricModal = () => {
    const project = state.projects[state.activeProjectId];
    const rubric = project.rubric;
    document.getElementById('rubricTitle').value = rubric?.title || '';
    document.getElementById('rubricScope').value = rubric?.scope || '';
    document.getElementById('rubricItems').value = (rubric?.items || []).map((item) => item.label).join('\n');
    rubricModal.hidden = false;
    document.getElementById('rubricTitle').focus();
  };
  const closeRubricModal = () => {
    rubricModal.hidden = true;
  };
  const openMemberModal = () => {
    memberModal.hidden = false;
    const project = state.projects[state.activeProjectId];
    api(`/projects/${project.id}/members`)
      .then((data) => {
        document.getElementById('memberList').innerHTML = data.members.map((member) =>
          `<div class="member-list-row"><strong>${member.name}</strong><span>${member.email}</span><em>${member.role}</em></div>`,
        ).join('');
      })
      .catch((error) => showToast(error.message));
    document.getElementById('memberEmail').focus();
  };
  const closeMemberModal = () => {
    memberModal.hidden = true;
    document.getElementById('memberForm').reset();
    document.getElementById('invitationResult').hidden = true;
  };
  const closeAuditModal = () => {
    auditModal.hidden = true;
  };
  const closeMaterialDetail = () => {
    materialDetailModal.hidden = true;
    document.getElementById('evidenceForm').reset();
  };
  const closeActionAssign = () => {
    actionAssignModal.hidden = true;
    document.getElementById('actionAssignForm').reset();
  };
  const openActionAssign = (index) => {
    const project = state.projects[state.activeProjectId];
    document.getElementById('assignActionIndex').value = index;
    api(`/projects/${project.id}/members`)
      .then((data) => {
        const options = data.members.filter((member) => ['owner', 'member'].includes(member.role));
        document.getElementById('assignMember').innerHTML = options.map((member) =>
          `<option value="${member.user_id}">${member.name} · ${member.role === 'owner' ? '负责人' : '成员'}</option>`,
        ).join('');
        actionAssignModal.hidden = false;
      })
      .catch((error) => showToast(error.message));
  };
  const openMaterialDetail = (name) => {
    const project = state.projects[state.activeProjectId];
    const material = (project.materialRecords || []).find((item) => item.originalName === name);
    if (!material) {
      showToast('这份材料还没有从服务端加载完成。');
      return;
    }
    document.getElementById('materialDetailTitle').textContent = material.originalName;
    document.getElementById('evidenceMaterialId').value = material.id;
    const citations = material.citations || [];
    document.getElementById('materialDetailBody').innerHTML = `
      <p class="material-detail-meta">${material.mimeType} · ${material.status}${material.error ? ` · ${material.error}` : ''}</p>
      <div class="material-detail-preview">${material.contentPreview || '暂无可预览文本。图片和未解析文件请按页码、段落或截图位置人工标注。'}</div>
      <h3>已记录的证据位置</h3>
      <div class="evidence-list">${citations.length ? citations.map((item) => `<div class="evidence-row"><strong>${item.location}</strong><p>${item.excerpt}</p><small>${item.note || '已确认'}</small></div>`).join('') : '<p>还没有证据定位。</p>'}</div>
      ${material.hasFile ? `<a class="link-button" href="/api/materials/${material.id}/download" target="_blank" rel="noreferrer">打开原文</a>` : ''}`;
    materialDetailModal.hidden = false;
  };

  document.getElementById('closeMaterialModal').addEventListener('click', closeMaterialModal);
  document.getElementById('cancelMaterial').addEventListener('click', closeMaterialModal);
  document.getElementById('closeRubricModal').addEventListener('click', closeRubricModal);
  document.getElementById('cancelRubric').addEventListener('click', closeRubricModal);
  document.getElementById('closeMemberModal').addEventListener('click', closeMemberModal);
  document.getElementById('cancelMember').addEventListener('click', closeMemberModal);
  document.getElementById('closeAuditModal').addEventListener('click', closeAuditModal);
  document.getElementById('closeMaterialDetail').addEventListener('click', closeMaterialDetail);
  document.getElementById('closeMaterialDetailButton').addEventListener('click', closeMaterialDetail);
  document.getElementById('closeActionAssign').addEventListener('click', closeActionAssign);
  document.getElementById('cancelActionAssign').addEventListener('click', closeActionAssign);
  document.getElementById('materialSourceType').addEventListener('change', (event) => {
    const mode = event.target.value;
    document.getElementById('materialFileField').hidden = mode !== 'file';
    document.getElementById('materialTextField').hidden = mode !== 'text';
    document.getElementById('materialLinkField').hidden = mode !== 'link';
  });

  document.getElementById('materialForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const project = state.projects[state.activeProjectId];
    const sourceType = document.getElementById('materialSourceType').value;
    const formData = new FormData();
    formData.append('sourceType', sourceType);
    formData.append('name', document.getElementById('materialName').value.trim());
    if (sourceType === 'file') {
      const file = document.getElementById('materialFile').files[0];
      if (!file) {
        showToast('请选择一个 PDF、Word、图片或文本文件。');
        return;
      }
      formData.append('file', file);
    } else if (sourceType === 'text') {
      formData.append('text', document.getElementById('materialText').value);
    } else {
      formData.append('url', document.getElementById('materialUrl').value.trim());
    }
    api(`/projects/${project.id}/materials`, { method: 'POST', body: formData })
      .then(() => closeMaterialModal())
      .then(() => refresh(project.id))
      .then(() => showToast('材料已保存，读取状态和证据位置可以继续补充。'))
      .catch((error) => showToast(error.message));
  });

  document.getElementById('rubricForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const project = state.projects[state.activeProjectId];
    const labels = document.getElementById('rubricItems').value.split('\n').map((item) => item.trim()).filter(Boolean);
    const items = labels.map((label, index) => ({ id: `item-${index + 1}`, label, requirement: '由负责人补充证据和通过说明' }));
    api(`/projects/${project.id}/rubric`, {
      method: 'POST',
      body: JSON.stringify({
        title: document.getElementById('rubricTitle').value.trim(),
        scope: document.getElementById('rubricScope').value.trim(),
        items,
      }),
    })
      .then(() => closeRubricModal())
      .then(() => refresh(project.id))
      .then(() => showToast('判断标准已保存为新版本，请确认后再冻结。'))
      .catch((error) => showToast(error.message));
  });

  document.getElementById('memberForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const project = state.projects[state.activeProjectId];
    api(`/projects/${project.id}/members/invitations`, {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('memberEmail').value.trim(),
        role: document.getElementById('memberRole').value,
      }),
    })
      .then((data) => {
        const result = document.getElementById('invitationResult');
        result.hidden = false;
        result.innerHTML = `<strong>邀请已生成</strong><p>请把这个邀请码发给对方：<code>${data.token}</code></p><small>对方登录指定邮箱后调用“接受邀请”即可加入。</small>`;
      })
      .catch((error) => showToast(error.message));
  });

  document.getElementById('evidenceForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const materialId = document.getElementById('evidenceMaterialId').value;
    api(`/materials/${materialId}/evidence`, {
      method: 'POST',
      body: JSON.stringify({
        excerpt: document.getElementById('evidenceExcerpt').value.trim(),
        location: document.getElementById('evidenceLocation').value.trim(),
        note: document.getElementById('evidenceNote').value.trim(),
      }),
    })
      .then(() => refresh(state.activeProjectId))
      .then(() => {
        closeMaterialDetail();
        showToast('证据定位已保存，复核者可以按这个位置回查。');
      })
      .catch((error) => showToast(error.message));
  });
  document.getElementById('actionAssignForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const project = state.projects[state.activeProjectId];
    api(`/projects/${project.id}/actions`, {
      method: 'POST',
      body: JSON.stringify({
        index: Number(document.getElementById('assignActionIndex').value),
        memberId: document.getElementById('assignMember').value,
      }),
    })
      .then(() => refresh(project.id))
      .then(() => {
        closeActionAssign();
        showToast('动作卡分工已保存。');
      })
      .catch((error) => showToast(error.message));
  });

  // 认证表单由服务端校验，避免原型默认“直接放行”。
  document.addEventListener(
    'submit',
    (event) => {
      if (event.target.id === 'loginForm') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        api('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        })
          .then(() => refresh())
          .then(() => showToast('登录成功，已恢复你的项目上下文。'))
          .catch((error) => showToast(error.message));
      } else if (event.target.id === 'registerForm') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const name = document.getElementById('registerName').value.trim();
        const email = document.getElementById('registerEmail').value.trim();
        const password = document.getElementById('registerPassword').value;
        api('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ name, email, password }),
        })
          .then(() => refresh())
          .then(() => showToast(`欢迎加入砺程，${name}。你的私有工作台已创建。`))
          .catch((error) => showToast(error.message));
      } else if (event.target.id === 'projectForm') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const name = document.getElementById('newProjectName').value.trim();
        const kind = document.getElementById('newProjectKind').value;
        const goal = document.getElementById('newProjectGoal').value.trim();
        api('/projects', {
          method: 'POST',
          body: JSON.stringify({ name, kind, goal }),
        })
          .then((data) => {
            closeProjectModal();
            return refresh(data.project.id);
          })
          .then(() => showToast(`项目「${name}」已创建，开始目标澄清。`))
          .catch((error) => showToast(error.message));
      }
    },
    true,
  );

  // 关键状态迁移在服务端落库，前端原型处理负责即时反馈。
  document.addEventListener(
    'click',
    (event) => {
      const projectButtonTarget = event.target.closest('[data-project]');
      if (projectButtonTarget) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const projectId = projectButtonTarget.dataset.project;
        if (state.projects[projectId]) {
          state.activeProjectId = projectId;
          setProjectMenu(false);
          refresh(projectId).then(() => showToast(`已切换到「${state.projects[projectId].name}」项目。`));
        }
        return;
      }
      if (event.target.closest('[data-action="create-project"]')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openProjectModal();
        return;
      }
      const getProject = () => state.projects[state.activeProjectId];
      let endpoint = null;
      let body = {};

      if (event.target.closest('#materialsManage') || event.target.closest('#addMaterialButton') || event.target.closest('[data-action="add-material"]')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openMaterialModal();
        return;
      }
      if (event.target.closest('#editRubric')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openRubricModal();
        return;
      }
      if (event.target.closest('#inviteButton') || event.target.closest('.member-add')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openMemberModal();
        return;
      }
      if (event.target.closest('#auditButton')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const project = getProject();
        api(`/projects/${project.id}/audit`)
          .then((data) => {
            document.getElementById('auditList').innerHTML = data.events.length
              ? data.events.map((item) => `<div class="audit-row"><strong>${item.event_type}</strong><span>${new Date(item.created_at).toLocaleString()}</span><small>${JSON.stringify(item.payload)}</small></div>`).join('')
              : '<p>还没有变更记录。</p>';
            auditModal.hidden = false;
          })
          .catch((error) => showToast(error.message));
        return;
      }
      if (event.target.closest('#helpCardButton')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const message = window.prompt('请描述你卡住的地方，教练和团队会据此继续处理：', '我还无法确认机构是否允许共享历史订单。');
        if (!message || !message.trim()) return;
        const project = getProject();
        api(`/projects/${project.id}/help`, {
          method: 'POST',
          body: JSON.stringify({ message: message.trim(), category: '环境' }),
        })
          .then(() => showToast('求助卡已记录，未知项会保留在项目记录里。'))
          .catch((error) => showToast(error.message));
        return;
      }
      if (event.target.closest('#viewAllGaps')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        renderWorkspace('actions');
        showToast('已打开当前项目的行动卡列表。');
        return;
      }
      const openMaterialButton = event.target.closest('[data-action="open-material"]');
      if (openMaterialButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openMaterialDetail(openMaterialButton.dataset.name);
        return;
      }
      const assignActionButton = event.target.closest('[data-action="assign-action"]');
      if (assignActionButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openActionAssign(assignActionButton.dataset.index);
        return;
      }
      if (event.target.closest('[data-account="logout"]')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        api('/auth/logout', { method: 'POST', body: JSON.stringify({}) })
          .then(() => showAuth('login'))
          .then(() => showToast('已退出当前账号。'))
          .catch((error) => showToast(error.message));
        return;
      }

      if (event.target.closest('#askAgent')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const modal = document.getElementById('composerModal');
        const input = document.getElementById('stuckInput');
        if (modal) modal.hidden = false;
        syncComposerContext();
        const project = getProject();
        const question = `请结合项目“${project?.name || ''}”当前已确认的判断标准、材料证据和这张行动卡，告诉我这一步应该怎么做。只给执行步骤、检查要点和交付物，不要替我写可提交内容。`;
        sendChatMessage(question);
        input?.focus();
        return;
      }

      if (event.target.closest('#composerTrigger')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        document.getElementById('composerModal').hidden = false;
        syncComposerContext();
        document.getElementById('stuckInput').focus();
        loadChatHistory();
        return;
      }

      if (event.target.closest('#sendComposer')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        sendChatMessage();
        return;
      }

      const rubricItem = event.target.closest('[data-rubric-item]');
      if (rubricItem) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const project = getProject();
        const rubric = project.rubric;
        const current = new Set(
          project.rubricSelectedItems || (rubric?.items || []).slice(0, 2).map((item) => item.id),
        );
        const itemId = rubricItem.dataset.rubricItem;
        if (current.has(itemId)) current.delete(itemId);
        else current.add(itemId);
        if (!current.size) {
          showToast('至少保留一条本轮判断标准。');
          return;
        }
        project.rubricSelectedItems = [...current];
        applyRubric(project);
        showToast('已更新本轮检查项选择。确认后会按这些条目复核。');
        return;
      }

      const project = getProject();
      if (event.target.closest('#confirmRubric')) {
        endpoint = `/projects/${project.id}/rubric/confirm`;
      } else if (event.target.closest('#confirmGap')) {
        endpoint = `/projects/${project.id}/gap/confirm`;
      } else if (event.target.closest('#startAction')) {
        endpoint = `/projects/${project.id}/actions/start`;
      } else if (event.target.closest('[data-action="review-start"]')) {
        endpoint = `/projects/${project.id}/reviews/start`;
      } else if (event.target.closest('[data-criterion]')) {
        const button = event.target.closest('[data-criterion]');
        endpoint = `/projects/${project.id}/reviews/criteria`;
        body = {
          index: Number(button.dataset.criterion),
          value: button.dataset.reviewValue,
        };
      } else if (event.target.closest('[data-action="review-finish"]')) {
        endpoint = `/projects/${project.id}/reviews/finish`;
      } else if (event.target.closest('[data-action="transfer-start"]')) {
        endpoint = `/projects/${project.id}/transfer/advance`;
      }

      if (!endpoint) {
        if (event.target.closest('[data-project]')) {
          setTimeout(() => applyRubric(state.projects[state.activeProjectId]), 0);
        }
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      const actionButton = event.target.closest('#confirmRubric');
      if (actionButton) {
        actionButton.disabled = true;
        actionButton.textContent = '正在保存…';
      }

      api(endpoint, {
        method: 'POST',
        body: JSON.stringify(
          endpoint.endsWith('/rubric/confirm')
            ? { selectedItemIds: getProject().rubricSelectedItems || [] }
            : body,
        ),
      })
        .then((data) => {
          state.projects[project.id] = { ...state.projects[project.id], ...data.project };
          if (endpoint.endsWith('/rubric/confirm')) {
            state.projects[project.id].rubricConfirmed = true;
            applyRubric(state.projects[project.id]);
            updateProjectShell();
            showToast('本轮判断标准已确认，下一步请找出最需要补上的地方。');
          }
          if (endpoint.endsWith('/actions/start') && data.project.actionStarted) {
            document.getElementById('v2Modal').hidden = false;
            document.getElementById('v2Content').focus();
          }
          return refresh(project.id).catch((error) => {
            if (endpoint.endsWith('/rubric/confirm')) {
              showToast('本轮判断标准已保存，页面其余数据将在下次打开时同步。');
              return data;
            }
            throw error;
          });
        })
        .catch((error) => {
          if (actionButton) {
            actionButton.disabled = false;
            actionButton.textContent = '确认本轮标准';
          }
          showToast(error.message);
        });
    },
    true,
  );

  document.addEventListener(
    'submit',
    (event) => {
      if (event.target.id !== 'v2Form') {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      const project = state.projects[state.activeProjectId];
      const content = document.getElementById('v2Content').value.trim();
      api(`/projects/${project.id}/versions`, {
        method: 'POST',
        body: JSON.stringify({
          content,
          reason: document.getElementById('v2Reason').value.trim(),
        }),
      })
        .then(() => {
          document.getElementById('v2Modal').hidden = true;
          return refresh(project.id);
        })
        .then(() => showToast('改进版本已保存，已交给独立复核者。'))
        .catch((error) => showToast(error.message));
    },
    true,
  );
})();

