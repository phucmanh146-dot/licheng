(function (root) {
  'use strict';
  function normalizeLinks(value) {
    value = String(value || '').replace(/\\_/g, '_');
    value = value.replace(/((?:https?:\/\/)?[\w.-]+\.(?:feishu\.cn|larksuite\.com)\/(?:wiki|docx)\/)([A-Za-z0-9\s]+)(?=[?#\]）)]|$)/g, function (_, prefix, token) { return prefix + token.replace(/\s/g, ''); });
    value = value.replace(/\[{1,2}(https?:\/\/[\w.-]+\.(?:feishu\.cn|larksuite\.com)\/(?:wiki|docx)\/[A-Za-z0-9]+)\]\(\1\)[ \t]+([A-Za-z0-9]+)(?=\?)/g, function(_, url, tail) { return url + tail; });
    var matches = value.match(/(?:https?:\/\/|obsidian:\/\/)[^\s<>\]）"'\x60，。；！？]+|(?:[\w-]+\.)+[a-zA-Z]{2,}(?::[0-9]+)?(?:[/?#][^\s<>\]）"'\x60，。；！？]*)?/g) || [];
    return Array.from(new Set(matches.map(function (url) {
      url = url.replace(/[).,，。；;]+$/, '');
      if (!/^[a-z][\w+.-]*:\/\//i.test(url)) url = 'https://' + url;
      try { var u = new URL(url); return /^(https?:|obsidian:)$/.test(u.protocol) && !u.username && !u.password ? u.href : ''; } catch (_) { return ''; }
    }).filter(Boolean)));
  }
  async function originalPrepare(data) {
    var r=await root.SY.backendCall('/api/source/prepare',data,120000);
    if(!r.ok||!r.data||r.data.error) throw new Error(r.error||r.data?.error||'正文整理未完成');
    return r.data;
  }
  async function readLink(value) {
    var url=normalizeLinks(value)[0];
    if(!url)throw new Error('请粘贴完整链接或分享文字。');
    if(url.startsWith('obsidian://'))return originalPrepare({url:url});
    if(!root.SYMultiSources)throw new Error('正文读取组件尚未加载，请刷新页面后重试。');
    var doc=await root.SYMultiSources.api('/api/sources/read',{url:url});
    if(doc.readStatus!=='fulltext'||!String(doc.text||'').trim())throw new Error('尚未取得正文，不能生成路线。');
    return doc;
  }
  async function prepareLink(value) {
    var doc=await readLink(value);
    if(doc.sections)return doc;
    var prepared=await originalPrepare({document:doc});
    prepared.url=doc.url;prepared.partial=!!(prepared.partial||doc.partial);
    prepared.retrievedChars=doc.chars;
    return prepared;
  }
  async function readFile(file) {
    if (file.size > 5 * 1024 * 1024) throw new Error('每个文件最多 5 MB，请按章节拆分。');
    if (!/\.(txt|md|csv|json|srt|vtt|html?|pdf|docx?|png|jpe?g|webp|gif|bmp)$/i.test(file.name)) throw new Error('请选择 Word、PDF、图片、文本或字幕文件。');
    if (/\.(txt|md|csv|json|srt|vtt)$/i.test(file.name)) {
      var text = await file.text();
      if (!text.trim()) throw new Error('文件中没有文字。');
      return {title:file.name.replace(/\.[^.]+$/, ''),text:text.slice(0,80000),chars:text.length,outline:[],uploaded:true,thin:false,truncated:text.length>80000,note:'已在当前浏览器读取文本。'};
    }
    var bytes = new Uint8Array(await file.arrayBuffer()), binary = '';
    for (var i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    var result = await root.SY.backendCall('/api/extract-file', {name: file.name, content: btoa(binary)}, 120000);
    if (!result.ok || !result.data || result.data.thin) throw new Error(result.error || result.data && result.data.note || '没有提取到可用文字。');
    return result.data;
  }
  function toMarkdown(doc) {
    var source = normalizeLinks(doc.url || '')[0], prefix = source ? '来源：' + source + '\n\n' : '';
    if (!Array.isArray(doc.outline) || !doc.outline.length) return prefix + (doc.text || doc.content || '');
    return prefix + doc.outline.map(function (item) {
      var link = normalizeLinks(item.url || '')[0];
      return '#'.repeat(Math.max(1, Math.min(6, item.level || 1))) + ' ' + (link ? '[' + item.title + '](' + link + ')' : item.title) + (item.text ? '\n\n' + item.text : '');
    }).join('\n\n');
  }
  function showLinks(host, value) {
    host.replaceChildren();
    normalizeLinks(value).forEach(function (url) {
      var a = document.createElement('a'); a.href = url; a.className = 'sy-source-link';
      a.textContent = (url.startsWith('obsidian://') ? '在 Obsidian 打开笔记' : '打开原文 · ' + new URL(url).hostname) + ' ↗';
      if (!url.startsWith('obsidian://')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      host.append(a);
    });
  }
  function bookmarklet() {
    // The user invokes this on the article they have opened. No server/cookies involved.
    var code = function () {
      var selection = window.getSelection(), root = document.querySelector('#js_content') || document.querySelector('article,main') || document.body;
      if (selection && selection.rangeCount && selection.toString().trim()) { var box = document.createElement('div'); box.append(selection.getRangeAt(0).cloneContents()); root = box; }
      var lines = ['# ' + document.title, '', '来源：' + location.href, ''];
      var nodes = root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,pre');
      nodes.forEach(function (n) {
        if (n.closest('nav,footer,script,style')) return;
        if (n.tagName === 'P' && n.closest('li')) return;
        var text = n.innerText || n.textContent || ''; text = text.trim(); if (!text) return;
        var prefix = /^H[1-6]$/.test(n.tagName) ? '#'.repeat(Number(n.tagName[1])) + ' ' : n.tagName === 'LI' ? '- ' : '';
        lines.push(prefix + text, '');
      });
      if (lines.length < 5) lines.push(root.innerText || root.textContent || '');
      var blob = new Blob([lines.join('\n')], {type: 'text/markdown;charset=utf-8'}), url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = (document.title || '文章').replace(/[\\/:*?"<>|]/g, '-') + '.md'; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    };
    return 'javascript:(' + code.toString() + ')()';
  }
  function manualCapture() {
    if(window.SYSourceWorkflow){SYSourceWorkflow.manual();return;}
    if (window.SYPMWeChatV4) {
      var nav=document.querySelector('button.app-nav-item[data-view="knowledge"]');
      if(nav)nav.click();
      var mini=document.querySelector('#pmaw-mini');
      if(mini){mini.scrollIntoView({behavior:'smooth',block:'start'});var i=mini.querySelector('#pmaw-group-query');if(i)i.focus({preventScroll:true});return}
    }
    var d = document.createElement('dialog'); d.className = 'sy-import-help';
    var h = document.createElement('h2'); h.textContent = '手动摘取微信、飞书或网页正文'; d.append(h);
    var p = document.createElement('p'); p.textContent = '把下方按钮拖到浏览器书签栏。打开你能阅读的文章，点击这个书签，保存 Markdown 后拖回上岸鸭。也可以先选中所需正文再摘取。'; d.append(p);
    var a = document.createElement('a'); a.textContent = '摘取当前文章'; a.href = bookmarklet(); a.draggable = true; a.className = 'sy-source-link';
    a.onclick = function (e) { e.preventDefault(); p.textContent = '请先把“摘取当前文章”拖到书签栏，再在目标文章页面点击书签。'; }; d.append(a);
    var note = document.createElement('p'); note.textContent = '公众号文章可直接尝试联网读取。私聊、群聊请主动复制文字，或从微信将文档保存到磁盘后拖入。网页无法直接读取微信聊天数据库。'; d.append(note);
    var b = document.createElement('button'); b.textContent = '知道了'; b.onclick = function () { d.close(); d.remove(); }; d.append(b);
    d.addEventListener('cancel', function () { d.remove(); }); document.body.append(d); d.showModal();
  }
  root.SYSourceIO = {normalizeLinks: normalizeLinks, readLink: readLink, prepareLink: prepareLink, readFile: readFile, toMarkdown: toMarkdown, showLinks: showLinks, manualCapture: manualCapture};
})(typeof window === 'undefined' ? globalThis : window);
