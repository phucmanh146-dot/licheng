(function (root) {
  'use strict';
  // Keep the author's outline order. Body paragraphs belong to a heading,
  // not to an invented extra level in the learning route.
  function clean(s) { return String(s || '').replace(/<[^>]*>/g, '').trim(); }
  function entry(raw, index) {
    var line = String(raw).replace(/\t/g, '  '), indent = (line.match(/^ */) || [''])[0].length;
    var value = line.trim(), level = null, match;
    if (!value || /^https?:\/\/\S+$/i.test(value) || /^(来源|搜索摘要)[:：]/.test(value)) return null;
    if ((match = value.match(/^(#{1,6})\s+(.+)$/))) { level = match[1].length; value = match[2]; }
    else if ((match = value.match(/^(\d+(?:\.\d+)+)[.、)）]?\s+(.+)$/))) { level = match[1].split('.').length + 1; value = match[1] + ' ' + match[2]; }
    else if (/^第[一二三四五六七八九十百零\d]+(?:步|节课|节|课|章|讲|单元)[：:\s、.]/.test(value)) level = 2;
    else if (/^(?:第[一二三四五六七八九十\d]+期|[一二三四五六七八九十]+[、．.])/.test(value)) level = 1;
    else if ((match = value.match(/^(?:[-*+•]|\d+[.、)）])\s*(.+)$/))) { level = indent ? 2 + Math.floor(indent / 2) : 2; value = match[1]; }
    var link = value.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
    var sourceUrl = link ? link[2] : '';
    if (link) value = link[1];
    value = clean(value.replace(/\*\*/g, ''));
    if (!value || /^https?:\/\//i.test(value)) return null;
    return {title: value, level: level, sourceUrl: sourceUrl, children: [], material: '', index: index};
  }
  function parse(text, structured) {
    var rows = [], raw = String(text || '').split(/\r?\n/);
    if (Array.isArray(structured) && structured.length) {
      structured.forEach(function (item, index) {
        var title = clean(item.title);
        if (!title || /^https?:\/\//i.test(title)) return;
        rows.push({title: title, level: Math.max(1, Math.min(12, Number(item.level) || 1)), sourceUrl: /^https?:\/\//i.test(item.url || '') ? item.url : '', material: String(item.text || ''), originUrl: String(item.originUrl || ''), blockId: String(item.blockId || ''), kind:item.kind||'heading', startTime:item.startTime, children: [], index: index});
      });
    } else {
      var parsed = raw.map(entry), headings = parsed.filter(function (x) { return x && x.level !== null; });
      if (headings.length) {
        var active = null, origin = '';
        parsed.forEach(function (node, i) {
          var marker = raw[i].trim().match(/^来源[:：]\s*(https?:\/\/\S+)$/);
          if (marker) { origin = marker[1]; return; }
          if (node && node.level !== null) { node.originUrl = origin; rows.push(node); active = node; }
          else if (active && raw[i].trim()) {
            if (/^https?:\/\/\S+$/i.test(raw[i].trim()) && !active.sourceUrl) active.sourceUrl = raw[i].trim();
            else active.material += (active.material ? '\n' : '') + raw[i].trim();
          }
        });
      } else {
        rows = parsed.filter(Boolean).map(function (x) { x.level = 1; return x; });
      }
    }
    var roots = [], stack = [], count = 0;
    rows.forEach(function (node) {
      if (++count > 5000) throw new Error('目录超过5000个节点，请分章导入；本次没有静默截取目录。');
      while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
      if (stack.length) stack[stack.length - 1].children.push(node); else roots.push(node);
      stack.push(node);
    });
    // A single document title is a cover, not a lesson. Multiple collections
    // remain visible so the user can navigate one collection at a time.
    if (roots.length === 1 && roots[0].children.length && roots[0].level === 1) roots = roots[0].children;
    return roots;
  }
  function count(nodes) { return (nodes || []).reduce(function (n, x) { return n + 1 + count(x.children); }, 0); }
  root.SYRouteOutline = {parse: parse, count: count};
})(typeof window !== 'undefined' ? window : globalThis);
