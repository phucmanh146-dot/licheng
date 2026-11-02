(function () {
  'use strict';
  var active = null, returnFocus = null;
  function close() {
    if (active) { active.remove(); active = null; }
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
  }
  function modal(title) {
    close(); returnFocus = document.activeElement;
    var overlay = document.createElement('div'); overlay.className = 'mini-overlay';
    var box = document.createElement('section'); box.className = 'mini-dialog';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', title);
    var heading = document.createElement('h2'); heading.textContent = title; box.appendChild(heading);
    overlay.appendChild(box); document.body.appendChild(overlay); active = overlay;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    return box;
  }
  function button(box, label, handler) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    b.addEventListener('click', handler); box.appendChild(b); return b;
  }
  function text(title, value) {
    var box = modal(title), hint = document.createElement('p');
    hint.textContent = '在文本框内选中文字，使用设备提供的复制操作保存。'; box.appendChild(hint);
    var field = document.createElement('textarea'); field.value = String(value || ''); field.rows = 9; field.readOnly = true;
    box.appendChild(field); button(box, '选中全部文字', function () { field.focus(); field.select(); }); button(box, '关闭', close);
    field.focus();
  }
  function input(title, initial, onSave) {
    var box = modal(title), form = document.createElement('form'), label = document.createElement('label'), field = document.createElement('input');
    label.textContent = '新名称'; field.value = initial || ''; field.maxLength = 30; field.required = true; label.appendChild(field); form.appendChild(label);
    var submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = '保存名称'; form.appendChild(submit);
    form.addEventListener('submit', function (e) { e.preventDefault(); var v = field.value.trim(); if (!v) return; close(); onSave(v); });
    box.appendChild(form); button(box, '取消', close); field.focus(); field.select();
  }
  function notice(message) { var box = modal('小工具离线版'); var p = document.createElement('p'); p.textContent = message; box.appendChild(p); button(box, '知道了', close).focus(); }
  document.addEventListener('keydown', function (e) {
    if (!active) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') {
      var nodes = active.querySelectorAll('button,input,textarea'), first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  // This is the desktop web edition. Keep ordinary links and explicit app
  // deep-links native; the old mini-tool handler swallowed every navigation.
  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href]');
    if (!link) return;
    var href = link.getAttribute('href') || '';
    if (/^#/.test(href)) return;
    try {
      var url = new URL(href, location.href);
      if (/^https?:$/.test(url.protocol) && !url.username && !url.password) {
        link.target = '_blank'; link.rel = 'noopener noreferrer'; return;
      }
      if (url.protocol === 'blob:' && link.hasAttribute('download')) return;
      if (/^obsidian:\/\/(?:open\?|choose-vault(?:\?|$))/.test(href)) return;
      if (/^weixin:\/\/?$/.test(href)) return;
    } catch (_) {}
    e.preventDefault();
    // The capture bookmark is handled by its own click help, never executed here.
    if (/^javascript:/i.test(href)) return;
    text('暂不能打开的地址', href);
  }, true);
  window.SYMini = { text: text, input: input, notice: notice, close: close };
})();
