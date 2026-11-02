'use strict';
(() => {
  const panel = document.getElementById('rag-panel');
  if (!panel) return;
  panel.hidden = !project;
  const status = document.getElementById('rag-status');
  const results = document.getElementById('rag-results');
  const query = document.getElementById('rag-query');
  const limit = document.getElementById('rag-limit');

  function message(text, error = false) {
    status.textContent = text;
    status.className = error ? 'error' : 'hint';
  }
  function section(title, value) {
    const box = document.createElement('section');
    box.append(el('h3', title), el('p', String(value ?? '未提供')));
    return box;
  }
  function showRetrieval(value) {
    results.replaceChildren();
    results.append(
      section('检索方式', value.method),
      section('召回通道', JSON.stringify(value.channels || {})),
      section('语义向量状态', value.dense_status + ' · ' + (value.dense_trace?.model || '')),
      section('二阶段重排', value.reranker + ' · ' + (value.reranker_trace?.status || ''))
    );
    results.append(el('p', '覆盖范围：' + value.coverage + '；扫描 ' + value.scanned_units +
      ' 个原文单元，命中 ' + value.matched_units + ' 个，返回 ' + value.hits.length +
      ' 个，省略 ' + value.omitted_matches + ' 个。'));
    for (const hit of value.hits || []) {
      const card = document.createElement('article');
      card.className = 'gap-card';
      card.append(
        el('h4', hit.artifact_id + ' · v' + hit.artifact_version + ' · ' + hit.locator),
        el('p', '召回通道：' + (hit.recall_channels || []).join(' / ') + ' · 排序分：' + hit.score),
        el('pre', hit.text)
      );
      results.append(card);
    }
    for (const note of value.limitations || []) results.append(el('p', '边界：' + note));
  }
  function showDiagnosis(value) {
    showRetrieval(value.retrieval);
    results.append(el('h3', '局部诊断预览（尚未写入项目）'));
    const diagnosis = value.diagnosis || {};
    for (const gap of diagnosis.gaps || []) {
      const card = document.createElement('article');
      card.className = 'gap-card';
      card.append(el('h4', gap.gap_id + ' · ' + gap.target_result));
      card.append(el('p', '现状：' + (gap.current_evidence || '待确认')));
      card.append(el('p', '差距：' + (gap.reason || '待确认')));
      card.append(el('p', '原文位置：' + (gap.current_locator || '待确认')));
      results.append(card);
    }
    for (const unknown of diagnosis.unknowns || []) {
      results.append(el('p', '待补证据：' + (typeof unknown === 'string' ? unknown : JSON.stringify(unknown))));
    }
    results.append(el('p', '本次仅生成候选预览。需核对原文和诊断质量，再由用户决定是否进入正式流程。'));
  }
  function input() {
    if (!project) throw new Error('请先创建或选择一个项目');
    const text = query.value.trim();
    if (text.length < 2) throw new Error('请至少输入两个字的检索问题');
    return {...context(), query: text, limit: Number(limit.value)};
  }

  document.getElementById('rag-form').addEventListener('submit', event => {
    event.preventDefault();
    safe(async () => {
      const data = input();
      message('正在执行项目内混合检索……');
      const value = await request('/artifact-retrieve', data);
      showRetrieval(value);
      message('检索完成。请检查每条原文、版本和召回通道；无命中不代表材料不存在相关事实。');
    });
  });
  document.getElementById('rag-preview').addEventListener('click', () => safe(async () => {
    const data = input();
    message('正在检索材料并请求真实模型生成局部诊断预览……');
    const value = await request('/rag-diagnosis-preview', data);
    showDiagnosis(value);
    message('预览已返回，但尚未保存诊断、采用计划或标记任务完成。');
  }));
  window.addEventListener('research-project-changed', event => {
    panel.hidden = false;
    message('当前项目：' + event.detail.id + '。检索只访问该项目已登记的材料版本。');
    results.replaceChildren();
  });
})();
